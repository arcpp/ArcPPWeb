#!/usr/bin/env node
/**
 * Generate redis-seed-pages.json for all species.
 * Bundles coverage + details + psm-count + sequence+modifications into one
 * `protein:page:<displayId>` entry per protein so the plot page loads from
 * a single Redis GET instead of five Mongo round-trips.
 *
 * Output: server/data/redis-seed-pages.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Protein = require('../model/proteins');
const Peptide = require('../model/peptides');
const { mergeIntervals } = require('../utils/mergeIntervals');
const { MOD_COLORS } = require('../utils/constants');

const MOD_KEYS = Object.keys(MOD_COLORS);
const MOD_LOOKUP = MOD_KEYS.reduce((acc, k) => {
  acc[k.toLowerCase()] = k;
  return acc;
}, {});

function canonicalModType(raw) {
  return MOD_LOOKUP[String(raw || '').trim().toLowerCase()] || null;
}

async function connect() {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('MONGO_URI not set'); process.exit(1); }
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');
}

function displayId(doc) {
  return doc.hvo_id || doc.protein_id;
}

function buildModifications(peptides, seqLen) {
  const modifications = [];
  const seen = new Set();
  const re = /(.+):(\d+)$/;

  for (const p of peptides) {
    const start = p.startIndex;
    const stop = p.endIndex;
    if (typeof start !== 'number' || typeof stop !== 'number') continue;
    if (p.qValue != null && p.qValue > 0.005) continue;

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

async function processSpecies(speciesId) {
  console.log(`\nProcessing ${speciesId}`);
  const t0 = Date.now();

  const proteins = await Protein.find(
    { species_id: speciesId },
    {
      _id: 1, protein_id: 1, hvo_id: 1, description: 1, qValue: 1,
      uniProtein_id: 1, hydrophobicity: 1, pI: 1, molecularWeight: 1,
      species_id: 1, sequence: 1,
    },
  ).lean();
  console.log(`  ${proteins.length} proteins`);
  if (proteins.length === 0) return {};

  const objIdToDoc = new Map();
  const proteinObjIds = [];
  for (const doc of proteins) {
    objIdToDoc.set(doc._id.toString(), doc);
    proteinObjIds.push(doc._id);
  }

  console.log('  Fetching peptides…');
  const peptides = await Peptide.find(
    { protein_id: { $in: proteinObjIds } },
    { protein_id: 1, sequence: 1, startIndex: 1, endIndex: 1, modification: 1, qValue: 1, _id: 0 },
  ).lean();
  console.log(`  ${peptides.length} peptides`);

  const byProtein = new Map();
  for (const p of peptides) {
    const key = p.protein_id.toString();
    if (!byProtein.has(key)) byProtein.set(key, []);
    byProtein.get(key).push(p);
  }

  const output = {};
  for (const doc of proteins) {
    const pid = displayId(doc);
    const seq = doc.sequence || '';
    const seqLen = seq.length;
    const peps = byProtein.get(doc._id.toString()) || [];

    const uniqueSeqs = new Set();
    const intervals = [];
    for (const p of peps) {
      if (p.sequence) uniqueSeqs.add(p.sequence);
      if (p.qValue != null && p.qValue <= 0.005
          && typeof p.startIndex === 'number' && typeof p.endIndex === 'number') {
        intervals.push([p.startIndex, p.endIndex]);
      }
    }

    let coveredLength = 0;
    if (seqLen > 0 && intervals.length) {
      coveredLength = Math.min(mergeIntervals(intervals.map((i) => i.slice())), seqLen);
    }
    const coveragePercent = seqLen > 0 ? (coveredLength / seqLen) * 100 : 0;

    const modifications = seqLen > 0 ? buildModifications(peps, seqLen) : [];

    output[pid] = {
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
        qValue: doc.qValue ?? null,
        uniProtein_id: doc.uniProtein_id || doc.protein_id || null,
        hydrophobicity: doc.hydrophobicity ?? null,
        pI: doc.pI ?? null,
        molecular_weight: doc.molecularWeight ?? null,
        species_id: doc.species_id || null,
      },
      psmCount: uniqueSeqs.size,
      sequence: {
        protein_id: pid,
        sequence: seq,
        length: seqLen,
        modifications,
      },
    };
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  Done: ${Object.keys(output).length} entries in ${elapsed}s`);
  return output;
}

async function main() {
  await connect();
  const overall = {};

  const speciesList = await Protein.distinct('species_id', {
    species_id: { $exists: true, $ne: null, $ne: '' },
  });
  console.log(`Species: ${speciesList.join(', ')}`);

  for (const speciesId of speciesList) {
    const entries = await processSpecies(speciesId);
    Object.assign(overall, entries);
  }

  const outFile = path.join(__dirname, '..', 'data', 'redis-seed-pages.json');
  fs.writeFileSync(outFile, JSON.stringify(overall));
  const bytes = fs.statSync(outFile).size;
  console.log(`\nWrote ${Object.keys(overall).length} entries (${(bytes / 1024 / 1024).toFixed(2)} MB) to ${outFile}`);

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
