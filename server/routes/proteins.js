const router = require('express').Router();
const Protein = require('../model/proteins');
const Peptide = require('../model/peptides');
const { resolveProteinId } = require('../services/proteinIdResolver');
const { getPsmsByDataset, getProteinPage } = require('../services/psmRedisService');
const { getProteinCoverage } = require('../coverage');
const { getPlotDataForProtein } = require('../plotGenerator');
const { MOD_COLORS, HVO_RE, UNIPROT_RE } = require('../utils/constants');

const canonicalModType = (rawType) => {
  const normalized = String(rawType || '').trim().toLowerCase();
  const match = Object.keys(MOD_COLORS).find((k) => k.toLowerCase() === normalized);
  return match || null;
};

// Resolve a display ID (hvo_id or protein_id) to a protein document
async function findProteinByDisplayId(displayId, projection = {}) {
  let doc = await Protein.findOne({ hvo_id: displayId }, projection).lean();
  if (!doc) doc = await Protein.findOne({ protein_id: displayId }, projection).lean();
  return doc;
}

// All HVO gene IDs
router.get('/hvo-ids', async (req, res) => {
  try {
    const ids = await Protein.distinct('hvo_id', { hvo_id: { $exists: true, $ne: null, $ne: '' } });
    res.json(ids.filter(Boolean).sort());
  } catch (e) {
    console.error('hvo-ids error', e);
    res.status(500).json({ error: 'Failed to fetch HVO IDs' });
  }
});

// All display IDs grouped by type (for autocomplete)
router.get('/proteins/ids', async (_req, res) => {
  try {
    const hvoRaw = await Protein.distinct('hvo_id');
    const hvo = hvoRaw.filter(Boolean).map(s => String(s).trim()).filter(s => HVO_RE.test(s));
    hvo.sort();

    // Non-HVO species protein_ids (UniProt accessions)
    const nonHvoRaw = await Protein.distinct('protein_id', { hvo_id: { $exists: false } });
    const uniprot = nonHvoRaw
      .filter(Boolean)
      .map(s => String(s).toUpperCase().trim())
      .filter(s => UNIPROT_RE.test(s));
    uniprot.sort();

    res.json({ hvo: Array.from(new Set(hvo)), uniprot: Array.from(new Set(uniprot)) });
  } catch (e) {
    console.error('proteins/ids error', e);
    res.status(500).json({ error: 'Failed to fetch protein IDs' });
  }
});

// Typeahead search across hvo_id and protein_id (UniProt accession)
router.get('/proteins/search', async (req, res) => {
  try {
    const raw = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    if (!raw) return res.json({ results: [] });

    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRe = new RegExp(`^${escaped}`, 'i');

    const docs = await Protein.find(
      { $or: [{ hvo_id: prefixRe }, { protein_id: prefixRe }] },
      { _id: 0, hvo_id: 1, protein_id: 1 },
    )
      .limit(limit * 2)
      .lean();

    const seen = new Set();
    const results = [];
    for (const d of docs) {
      const displayId = d.hvo_id || d.protein_id;
      if (!displayId || seen.has(displayId)) continue;
      seen.add(displayId);
      results.push({ label: displayId, value: displayId });
      if (results.length >= limit) break;
    }

    res.json({ results });
  } catch (e) {
    console.error('proteins/search error', e);
    res.status(500).json({ error: 'Failed to search proteins' });
  }
});

// Case-insensitive resolve (hvo_id or protein_id)
router.get('/proteins/resolve', async (req, res) => {
  try {
    const raw = (req.query.q || '').trim();
    if (!raw) return res.status(400).json({ error: 'Missing q' });

    // Try hvo_id
    if (HVO_RE.test(raw)) {
      const byHvo = await Protein.findOne(
        { hvo_id: { $regex: `^${raw}$`, $options: 'i' } },
        { _id: 0, protein_id: 1, hvo_id: 1, uniProtein_id: 1, description: 1 }
      ).lean();
      if (byHvo) {
        return res.json({
          matchType: 'hvo_id',
          protein_id: byHvo.hvo_id,
          uniProtId: byHvo.protein_id,
          description: byHvo.description || null,
        });
      }
    }

    // Try protein_id (UniProt)
    if (UNIPROT_RE.test(raw)) {
      const byUni = await Protein.findOne(
        { protein_id: { $regex: `^${raw}$`, $options: 'i' } },
        { _id: 0, protein_id: 1, hvo_id: 1, description: 1 }
      ).lean();
      if (byUni) {
        return res.json({
          matchType: 'protein_id',
          protein_id: byUni.hvo_id || byUni.protein_id,
          uniProtId: byUni.protein_id,
          description: byUni.description || null,
        });
      }
    }

    return res.status(404).json({ error: 'Protein not found' });
  } catch (e) {
    console.error('resolve error', e);
    res.status(500).json({ error: 'Failed to resolve protein' });
  }
});

// Protein sequence with modifications
router.get('/proteins/:protein_id/sequence', async (req, res) => {
  try {
    const displayId = req.params.protein_id;
    const proteinDoc = await findProteinByDisplayId(displayId, { _id: 1, sequence: 1, protein_id: 1 });
    if (!proteinDoc || !proteinDoc.sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }
    const sequence = proteinDoc.sequence;

    const peptideDocs = await Peptide.find(
      { protein_id: proteinDoc._id, qValue: { $lte: 0.005 } },
      { sequence: 1, startIndex: 1, endIndex: 1, modification: 1, _id: 0 }
    ).lean();
    const rows = peptideDocs.map(p => ({
      seq: p.sequence, start: p.startIndex, stop: p.endIndex, mods: p.modification
    }));

    const modifications = [];
    const seenMods = new Set();
    const re = /(.+):(\d+)$/;

    for (const r of rows) {
      let hasColoredMod = false;

      if (r.mods) {
        for (const part of String(r.mods).split(';')) {
          const m = re.exec(part.trim());
          if (!m) continue;
          const type = canonicalModType(m[1]);
          if (!type) continue;
          const rel = parseInt(m[2], 10);
          const abs = r.start + rel - 1;
          if (abs < 1 || abs > sequence.length) continue;

          const modKey = `${abs}|${type}`;
          if (seenMods.has(modKey)) continue;
          seenMods.add(modKey);
          modifications.push({
            position: abs,
            type,
            relativePosition: rel,
            peptideStart: r.start,
            peptideEnd: r.stop,
            peptideSequence: r.seq,
            color: MOD_COLORS[type]
          });
          hasColoredMod = true;
        }
      }

      if (!hasColoredMod) {
        modifications.push({
          position: null,
          type: 'Covered',
          relativePosition: null,
          peptideStart: r.start,
          peptideEnd: r.stop,
          peptideSequence: r.seq,
          color: null
        });
      }
    }

    res.json({ protein_id: displayId, sequence, length: sequence.length, modifications });
  } catch (err) {
    console.error('Sequence endpoint error for', req.params.protein_id, ':', err.message);
    res.status(500).json({ error: 'Failed to fetch sequence data' });
  }
});

// Legacy plot-friendly protein data
router.get('/protein-data/:hvoId', async (req, res) => {
  try {
    const plotData = await getPlotDataForProtein(req.params.hvoId);
    res.json(plotData);
  } catch (error) {
    console.error('Error generating plot data:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Coverage numbers
router.get('/coverage/:protein_id', async (req, res) => {
  try {
    const coverage = await getProteinCoverage(req.params.protein_id);
    res.json(coverage);
  } catch (err) {
    console.error('Coverage error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Protein details
router.get('/proteins/:protein_id/details', async (req, res) => {
  const displayId = req.params.protein_id;
  try {
    const doc = await findProteinByDisplayId(displayId, {
      _id: 0, protein_id: 1, hvo_id: 1, description: 1, qValue: 1,
      uniProtein_id: 1, hydrophobicity: 1, pI: 1, molecularWeight: 1, species_id: 1
    });

    if (!doc) return res.status(404).json({ error: 'Protein not found' });

    res.json({
      ...doc,
      // protein_id is always the UniProt accession in the new schema
      uniProtein_id: doc.uniProtein_id || doc.protein_id || null,
      molecular_weight: doc.molecularWeight,
      molecularWeight: undefined,
    });
  } catch (err) {
    console.error('Protein details error:', err);
    res.status(500).json({ error: 'Failed to fetch protein details' });
  }
});

// Unique peptide-sequence count
router.get('/proteins/:protein_id/psm-count', async (req, res) => {
  const displayId = req.params.protein_id;
  try {
    const objectId = await resolveProteinId(displayId);
    if (!objectId) return res.status(404).json({ error: `Protein ${displayId} not found` });

    const result = await Peptide.aggregate([
      { $match: { protein_id: objectId } },
      { $group: { _id: '$sequence' } },
      { $count: 'unique_sequences' },
    ]).exec();
    const count = result?.[0]?.unique_sequences ?? 0;
    res.json({ protein_id: displayId, psmCount: count });
  } catch (err) {
    console.error('PSM count error:', err);
    res.status(500).json({ error: 'Failed to compute PSM count' });
  }
});

// Bundled plot-page data (Redis-first, falls back to 404 so the client can use individual endpoints)
router.get('/proteins/:protein_id/page', async (req, res) => {
  const displayId = req.params.protein_id;
  try {
    let page = await getProteinPage(displayId);

    if (!page) {
      // Try the canonical (non-HVO) id too
      const doc = await findProteinByDisplayId(displayId, { hvo_id: 1, protein_id: 1 });
      if (doc) {
        const alt = doc.hvo_id || doc.protein_id;
        if (alt && alt !== displayId) page = await getProteinPage(alt);
      }
    }

    if (!page) return res.status(404).json({ error: 'Page cache miss' });

    let psmsByDataset = [];
    try {
      psmsByDataset = (await getPsmsByDataset(displayId)) || [];
    } catch { /* non-fatal */ }

    res.json({
      source: 'redis',
      coverage: page.coverage,
      details: page.details,
      psmCount: page.psmCount,
      sequence: page.sequence,
      psmsByDataset,
    });
  } catch (err) {
    console.error('proteins/page error', err);
    res.status(500).json({ error: 'Failed to fetch protein page' });
  }
});

// PSM by Dataset (Redis only)
router.get('/proteins/:proteinId/psms-by-dataset', async (req, res) => {
  try {
    const { proteinId } = req.params;
    const startTime = Date.now();
    let data = [];

    try {
      data = await getPsmsByDataset(proteinId);
    } catch (redisErr) {
      console.log('Redis PSM lookup failed:', redisErr.message);
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No PSM data found for protein ${proteinId}`,
        proteinId,
        data: []
      });
    }

    res.json({
      success: true,
      proteinId,
      data,
      source: 'redis',
      responseTimeMs: Date.now() - startTime
    });
  } catch (error) {
    console.error('PSM DATA ERROR:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Example aggregate (HVO_2072)
router.get('/peptides/selected-fields', async (req, res) => {
  try {
    const objectId = await resolveProteinId('HVO_2072');
    if (!objectId) return res.status(404).json({ error: 'Protein HVO_2072 not found' });

    const results = await Peptide.aggregate([
      { $match: { protein_id: objectId } },
      { $project: { _id: 0, protein_id: 1, modification: 1, sequence: 1, startIndex: 1, endIndex: 1 } },
    ]);
    res.json(results);
  } catch (err) {
    console.error('Aggregation error:', err);
    res.status(500).json({ error: 'Failed to fetch peptides' });
  }
});

module.exports = router;
