// ============================================================================
// Rebuilds the Redis protein caches directly from MongoDB — no JSON seed files.
//
// Writes two key families the app reads:
//   protein:summary:<slug>:<displayId>   (homepage species tables)
//   protein:page:<displayId>             (plot-page bundle)
//
// Two-phase build (priority cache warming): ALL lightweight summary keys are
// built first (Phase 1) so the landing page goes live in a few seconds, then the
// heavy per-protein page bundles are built in the background (Phase 2). Protein
// pages fall back to direct Mongo queries until their species' pages land, so
// nothing breaks while Phase 2 runs. Called async from index.js after the server
// is listening; the persistent (no-TTL) keys keep serving until the refresh lands.
// ============================================================================

const mongoose = require('mongoose');
const Protein = require('../model/proteins');
const Peptide = require('../model/peptides');
const { redisClient } = require('./psmRedisService');
const { speciesSlug } = require('./proteinSummaryCache');
const { MOD_COLORS, Q_VALUE_THRESHOLD, canonicalModType } = require('../utils/constants');
const { computeProteinStats, buildSummaryRow } = require('./proteinStats');
const { displayId } = require('../utils/displayId');

async function waitFor(label, predicate, { tries = 60, intervalMs = 1000 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`cacheRefresh: timed out waiting for ${label}`);
}

function buildModifications(peptides, seqLen) {
  const modifications = [];
  const seen = new Set();
  const re = /(.+):(\d+)$/;

  for (const p of peptides) {
    const start = p.start_index;
    const stop = p.end_index;
    if (typeof start !== 'number' || typeof stop !== 'number') continue;
    if (p.q_value != null && p.q_value > Q_VALUE_THRESHOLD) continue;

    let hasColoredMod = false;
    if (p.modifications) {
      for (const part of String(p.modifications).split(';')) {
        const m = re.exec(part.trim());
        if (!m) continue;
        const type = canonicalModType(m[1]);
        if (!type) continue;
        const rel = parseInt(m[2], 10);
        const abs = start + rel - 1;
        if (abs < 1 || abs > seqLen) continue;

        const key = `${abs}|${type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        modifications.push({
          position: abs,
          type,
          relativePosition: rel,
          peptideStart: start,
          peptideEnd: stop,
          peptideSequence: p.sequence,
          color: MOD_COLORS[type],
        });
        hasColoredMod = true;
      }
    }

    if (!hasColoredMod) {
      modifications.push({
        position: null,
        type: 'Covered',
        relativePosition: null,
        peptideStart: start,
        peptideEnd: stop,
        peptideSequence: p.sequence,
        color: null,
      });
    }
  }
  return modifications;
}

// Group a species' peptides by protein _id (as a string key).
function groupByProtein(peptides) {
  const byProtein = new Map();
  for (const p of peptides) {
    const key = p.protein_id.toString();
    if (!byProtein.has(key)) byProtein.set(key, []);
    byProtein.get(key).push(p);
  }
  return byProtein;
}

// ---- Phase 1: summary keys (the landing-page tables) ----------------------
// Lightweight on purpose: the sequence length is computed server-side with
// $strLenCP so full protein sequences never cross the wire, and peptides are
// fetched without their `sequence` field (summaries don't need it).
async function buildSpeciesSummaries(speciesId) {
  const slug = speciesSlug(speciesId);
  const t0 = Date.now();

  const proteins = await Protein.aggregate([
    { $match: { species_id: speciesId } },
    {
      $project: {
        protein_id: 1, uniprot_id: 1, description: 1, dataset_ids: 1, species_id: 1,
        sequence_length: { $strLenCP: { $ifNull: ['$sequence', ''] } },
      },
    },
  ]);
  if (proteins.length === 0) return { count: 0, coverage: null };

  const peptides = await Peptide.find(
    { species_id: speciesId },
    { protein_id: 1, start_index: 1, end_index: 1, modifications: 1, q_value: 1, _id: 0 },
  ).lean();
  const byProtein = groupByProtein(peptides);

  // Accumulate species-level coverage while we're already iterating every
  // protein + its peptides, so the /species/coverage-stats endpoint can serve a
  // precomputed value instead of re-scanning all peptides on the first request.
  let totalProteins = 0, observedProteins = 0, totalLength = 0, speciesCovered = 0;

  const pipeline = redisClient.multi();
  for (const doc of proteins) {
    const pid = displayId(doc);
    const peps = byProtein.get(doc._id.toString()) || [];
    const stats = computeProteinStats(doc, peps);
    pipeline.set(`protein:summary:${slug}:${pid}`, JSON.stringify(buildSummaryRow(doc, stats)));

    if (stats.seqLen > 0) {
      totalProteins += 1;
      totalLength += stats.seqLen;
      speciesCovered += stats.coveredLength;
    }
    // observed = has >=1 identified peptide (q <= threshold), independent of
    // seqLen or coordinates — matches the /coverage-stats definition, where a
    // protein is counted as observed as soon as any passing peptide maps to it.
    if (stats.psm_count > 0) observedProteins += 1;
  }
  await pipeline.exec();

  const coverage = {
    species: speciesId,
    coveragePercent: totalLength > 0 ? parseFloat((speciesCovered * 100 / totalLength).toFixed(2)) : 0,
    totalProteins,
    observedProteins,
    totalLength,
    coveredLength: speciesCovered,
  };

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[cache] summaries ${speciesId}: ${proteins.length} proteins in ${elapsed}s`);
  return { count: proteins.length, coverage };
}

// ---- Phase 2: page bundles (per-protein plot data) ------------------------
// The heavy pass: needs full protein + peptide sequences to build the
// per-position modification tracks. Runs in the background after Phase 1.
async function buildSpeciesPages(speciesId) {
  const t0 = Date.now();

  const proteins = await Protein.find(
    { species_id: speciesId },
    {
      _id: 1, protein_id: 1, description: 1, dataset_ids: 1,
      sequence: 1, q_value: 1, uniprot_id: 1, hydrophobicity: 1, pI: 1,
      molecular_weight: 1, species_id: 1,
    },
  ).lean();
  if (proteins.length === 0) return 0;

  const peptides = await Peptide.find(
    { species_id: speciesId },
    { protein_id: 1, sequence: 1, start_index: 1, end_index: 1, modifications: 1, q_value: 1, _id: 0 },
  ).lean();
  const byProtein = groupByProtein(peptides);

  const pipeline = redisClient.multi();
  for (const doc of proteins) {
    const pid = displayId(doc);
    const seq = doc.sequence || '';
    const peps = byProtein.get(doc._id.toString()) || [];

    const stats = computeProteinStats(doc, peps);
    const { seqLen, coveredLength, coveragePercent, psm_count } = stats;

    const page = {
      coverage: {
        protein_id: pid,
        total_length: seqLen,
        covered_length: coveredLength,
        coverage_percent: coveragePercent,
      },
      details: {
        protein_id: doc.protein_id || null,
        description: doc.description || null,
        q_value: doc.q_value ?? null,
        uniprot_id: doc.uniprot_id || doc.protein_id || null,
        hydrophobicity: doc.hydrophobicity ?? null,
        pI: doc.pI ?? null,
        molecular_weight: doc.molecular_weight ?? null,
        species_id: doc.species_id || null,
      },
      psm_count,
      sequence: {
        protein_id: pid,
        sequence: seq,
        length: seqLen,
        modifications: seqLen > 0 ? buildModifications(peps, seqLen) : [],
      },
    };

    pipeline.set(`protein:page:${pid}`, JSON.stringify(page));
  }
  await pipeline.exec();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[cache] pages ${speciesId}: ${proteins.length} proteins in ${elapsed}s`);
  return proteins.length;
}

// Sentinel key set only after a full, successful build. Its presence means the
// (persistent, AOF-backed) cache is already warm, so a boot doesn't need to
// re-scan MongoDB — the data only changes on a re-ingest, after which the
// refresh is triggered explicitly (POST /api/admin/refresh-cache).
const WARMED_KEY = 'cache:warmed';

let running = false;

// `force` rebuilds even when the cache is already warm (use after an ingest).
// Without it, a boot with an already-warm cache skips the expensive rebuild.
async function refreshProteinCache(force = false) {
  if (running) {
    console.log('[cache] refresh already in progress — skipping');
    return;
  }
  running = true;
  try {
    await waitFor('mongo', () => mongoose.connection.readyState === 1);
    await waitFor('redis', () => redisClient.isOpen);

    if (!force) {
      const warmed = await redisClient.get(WARMED_KEY);
      if (warmed) {
        console.log(`[cache] already warm (built ${new Date(Number(warmed)).toISOString()}) — skipping rebuild`);
        return;
      }
    }

    const t0 = Date.now();
    const speciesList = await Protein.distinct('species_id', {
      species_id: { $exists: true, $ne: null, $ne: '' },
    });
    console.log(`[cache] refreshing ${speciesList.length} species: ${speciesList.join(', ')}`);

    // Phase 1 — summaries first so the landing page goes live quickly. Species
    // are independent, so build them in parallel: the long pole is the single
    // largest species (~seconds) rather than the sum across all species.
    const summaryResults = await Promise.all(
      speciesList.map((speciesId) => buildSpeciesSummaries(speciesId)),
    );

    // Persist the precomputed coverage stats (homepage widget) so the
    // /species/coverage-stats endpoint is an instant Redis read instead of a
    // multi-species all-peptides scan on first request. Persistent (no TTL),
    // like the other caches — survives restarts until the next refresh.
    const coverageStats = summaryResults
      .map((r) => r.coverage)
      .filter(Boolean)
      .sort((a, b) => b.totalProteins - a.totalProteins);
    await redisClient.set('coverage:stats', JSON.stringify(coverageStats));

    const phase1 = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[cache] Phase 1 done — landing page + coverage stats ready in ${phase1}s`);

    // Phase 2 — heavy per-protein page bundles, in the background.
    const t1 = Date.now();
    let total = 0;
    for (const speciesId of speciesList) {
      total += await buildSpeciesPages(speciesId);
    }
    const phase2 = ((Date.now() - t1) / 1000).toFixed(1);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[cache] Phase 2 done — ${total} page bundles in ${phase2}s (total ${elapsed}s)`);

    // Mark the cache warm only after a fully successful build, so an interrupted
    // build (sentinel absent) is rebuilt on the next boot.
    await redisClient.set(WARMED_KEY, String(Date.now()));
  } catch (err) {
    console.error('[cache] refresh failed:', err.message);
  } finally {
    running = false;
  }
}

module.exports = { refreshProteinCache };
