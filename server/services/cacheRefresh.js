// ============================================================================
// Rebuilds the Redis protein caches directly from MongoDB — no JSON seed files.
//
// Writes two key families the app reads:
//   protein:summary:<slug>:<displayId>   (homepage species tables)
//   protein:page:<displayId>             (plot-page bundle)
//
// One Mongo pass per species computes BOTH bundles. Called async from index.js
// after the server is listening, so a boot never blocks on it and the
// (persistent, no-TTL) keys keep serving until the refresh lands.
// ============================================================================

const mongoose = require('mongoose');
const Protein = require('../model/proteins');
const Peptide = require('../model/peptides');
const { redisClient } = require('./psmRedisService');
const { speciesSlug } = require('./proteinSummaryCache');
const { MOD_COLORS, Q_VALUE_THRESHOLD } = require('../utils/constants');
const { computeProteinStats, buildSummaryRow } = require('./proteinStats');

const MOD_LOOKUP = Object.keys(MOD_COLORS).reduce((acc, k) => {
  acc[k.toLowerCase()] = k;
  return acc;
}, {});

function canonicalModType(raw) {
  return MOD_LOOKUP[String(raw || '').trim().toLowerCase()] || null;
}

function displayId(doc) {
  return doc.hvo_id || doc.protein_id;
}

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
    if (p.modification) {
      for (const part of String(p.modification).split(';')) {
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

async function refreshSpecies(speciesId) {
  const slug = speciesSlug(speciesId);
  const t0 = Date.now();

  const proteins = await Protein.find(
    { species_id: speciesId },
    {
      _id: 1, protein_id: 1, hvo_id: 1, description: 1, dataset_ids: 1,
      sequence: 1, q_value: 1, uniprot_id: 1, hydrophobicity: 1, pI: 1,
      molecular_weight: 1, species_id: 1,
    },
  ).lean();
  if (proteins.length === 0) return 0;

  // Fetch all of the species' peptides in one indexed query (species_id is
  // denormalized + indexed on Peptides), then group them by protein.
  const peptides = await Peptide.find(
    { species_id: speciesId },
    { protein_id: 1, sequence: 1, start_index: 1, end_index: 1, modification: 1, q_value: 1, _id: 0 },
  ).lean();

  const byProtein = new Map();
  for (const p of peptides) {
    const key = p.protein_id.toString();
    if (!byProtein.has(key)) byProtein.set(key, []);
    byProtein.get(key).push(p);
  }

  const pipeline = redisClient.multi();
  for (const doc of proteins) {
    const pid = displayId(doc);
    const seq = doc.sequence || '';
    const peps = byProtein.get(doc._id.toString()) || [];

    // Shared with the proteinsSummary Mongo fallback so the two paths can't drift.
    const stats = computeProteinStats(doc, peps);
    const { seqLen, coveredLength, coveragePercent, psm_count } = stats;
    const summary = buildSummaryRow(doc, stats);

    const page = {
      coverage: {
        protein_id: pid,
        total_length: seqLen,
        covered_length: coveredLength,
        coverage_percent: coveragePercent,
      },
      details: {
        protein_id: doc.protein_id || null,
        hvo_id: doc.hvo_id || null,
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

    pipeline.set(`protein:summary:${slug}:${pid}`, JSON.stringify(summary));
    pipeline.set(`protein:page:${pid}`, JSON.stringify(page));
  }
  await pipeline.exec();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[cache] ${speciesId}: ${proteins.length} proteins refreshed in ${elapsed}s`);
  return proteins.length;
}

let running = false;

async function refreshProteinCache() {
  if (running) {
    console.log('[cache] refresh already in progress — skipping');
    return;
  }
  running = true;
  try {
    await waitFor('mongo', () => mongoose.connection.readyState === 1);
    await waitFor('redis', () => redisClient.isOpen);

    const t0 = Date.now();
    const speciesList = await Protein.distinct('species_id', {
      species_id: { $exists: true, $ne: null, $ne: '' },
    });
    console.log(`[cache] refreshing ${speciesList.length} species: ${speciesList.join(', ')}`);

    let total = 0;
    for (const speciesId of speciesList) {
      total += await refreshSpecies(speciesId);
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[cache] done — ${total} proteins across ${speciesList.length} species in ${elapsed}s`);
  } catch (err) {
    console.error('[cache] refresh failed:', err.message);
  } finally {
    running = false;
  }
}

module.exports = { refreshProteinCache };
