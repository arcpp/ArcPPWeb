const router = require('express').Router();
const Protein = require('../model/proteins');
const Peptide = require('../model/peptides');
const { searchProteins, getAllProteinSummaries, getProteinSummary } = require('../services/proteinSummaryCache');
const { computeProteinStats, buildSummaryRow } = require('../services/proteinStats');
const { speciesToProteinIdFilter } = require('../utils/speciesFilter');
const { displayId } = require('../utils/displayId');

router.get('/species/:speciesId/proteins-summary', async (req, res) => {
  const startTime = Date.now();

  try {
    const { speciesId } = req.params;
    const limitN = Math.max(1, Math.min(200, parseInt(req.query.limit || '25', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const searchQuery = req.query.search || '';

    console.log(`\n📊 Protein summary request: species=${speciesId}, search="${searchQuery}", limit=${limitN}, offset=${offset}`);

    const selectedDatasets = req.query.datasets ? JSON.parse(req.query.datasets) : [];
    const selectedOverlaps = req.query.overlaps ? JSON.parse(req.query.overlaps) : [];

    // TRY REDIS FIRST (only if no dataset/overlap filters)
    if (selectedDatasets.length === 0 && selectedOverlaps.length === 0) {
      try {
        if (searchQuery.trim()) {
          const matchingIds = await searchProteins(searchQuery, speciesId);
          if (matchingIds.length > 0) {
            console.log(`   ✅ Redis search found ${matchingIds.length} matches`);
            const allRows = [];
            for (const id of matchingIds) {
              const summary = await getProteinSummary(id, speciesId);
              if (summary) allRows.push(summary);
            }
            allRows.sort((a, b) => a.hvoId.localeCompare(b.hvoId, undefined, { numeric: true }));
            const total = allRows.length;
            const rows = allRows.slice(offset, offset + limitN);
            console.log(`   ⚡ Redis response in ${Date.now() - startTime}ms\n`);
            return res.json({ speciesId, total, offset, limit: limitN, rows, source: 'redis' });
          }
        } else {
          const result = await getAllProteinSummaries(speciesId, offset, limitN);
          if (result.total > 0) {
            console.log(`   ✅ Redis cache hit: ${result.total} proteins`);
            console.log(`   ⚡ Redis response in ${Date.now() - startTime}ms\n`);
            return res.json({ speciesId, total: result.total, offset, limit: limitN, rows: result.rows, source: 'redis' });
          }
        }
        console.log('   ⚠️  Redis cache miss, falling back to MongoDB...');
      } catch (redisErr) {
        console.error('   Redis error:', redisErr.message);
      }
    } else {
      console.log('   ℹ️  Filters applied, using MongoDB');
    }

    let filter = speciesToProteinIdFilter(speciesId);

    if (selectedDatasets.length > 0) {
      filter.dataset_ids = { $in: selectedDatasets };
    }

    let matchingProteinIds = null;

    if (selectedOverlaps.length > 0) {
      const proteinsWithOverlap = await Protein.find(filter, { protein_id: 1, dataset_ids: 1 }).lean();
      matchingProteinIds = proteinsWithOverlap
        .filter(p => {
          const count = Array.isArray(p.dataset_ids) ? p.dataset_ids.length : 0;
          return selectedOverlaps.includes(count);
        })
        .map(p => displayId(p));

      if (matchingProteinIds.length === 0) {
        return res.json({ speciesId, total: 0, offset, limit: limitN, rows: [] });
      }
      filter = { ...speciesToProteinIdFilter(speciesId), protein_id: { $in: matchingProteinIds } };
    }

    if (selectedDatasets.length > 0 && selectedOverlaps.length > 0) {
      const proteinsInDatasets = await Protein.find(
        { ...speciesToProteinIdFilter(speciesId), dataset_ids: { $in: selectedDatasets } },
        { protein_id: 1, dataset_ids: 1 }
      ).lean();
      matchingProteinIds = proteinsInDatasets
        .filter(p => {
          const count = Array.isArray(p.dataset_ids) ? p.dataset_ids.length : 0;
          return selectedOverlaps.includes(count);
        })
        .map(p => displayId(p));

      if (matchingProteinIds.length === 0) {
        return res.json({ speciesId, total: 0, offset, limit: limitN, rows: [] });
      }
      filter = {
        ...speciesToProteinIdFilter(speciesId),
        protein_id: { $in: matchingProteinIds },
      };
    }

    if (searchQuery.trim()) {
      const speciesProteinDocs = await Protein.find(speciesToProteinIdFilter(speciesId), { _id: 1, protein_id: 1 }).lean();
      const speciesObjectIds = speciesProteinDocs.map(p => p._id);
      const objIdToDisplay = {};
      for (const p of speciesProteinDocs) {
        objIdToDisplay[p._id.toString()] = displayId(p);
      }

      const peptidesWithMod = await Peptide.find(
        { protein_id: { $in: speciesObjectIds }, modifications: { $regex: searchQuery.trim(), $options: 'i' } },
        { protein_id: 1, _id: 0 }
      ).lean();
      const idsFromMod = [...new Set(peptidesWithMod.map(p => objIdToDisplay[p.protein_id.toString()]).filter(Boolean))];

      const searchRegex = { $regex: searchQuery.trim(), $options: 'i' };
      const orClauses = [
        { protein_id: searchRegex },
        { uniprot_id: searchRegex },
        { description: searchRegex },
        { dataset_ids: searchRegex },
      ];
      if (idsFromMod.length > 0) {
        orClauses.push({ protein_id: { $in: idsFromMod } });
      }
      filter.$or = orClauses;
    }

    // Order to match the Redis path exactly (by display id, numeric-aware): pull
    // just the ids first (light), sort, then page. Then two batched queries fetch
    // the page's full docs + all their peptides — no per-row N+1.
    const idDocs = await Protein.find(filter, { _id: 1, protein_id: 1 }).lean().exec();
    idDocs.sort((a, b) => displayId(a).localeCompare(displayId(b), undefined, { numeric: true }));

    const total = idDocs.length;
    const pageIdDocs = idDocs.slice(offset, offset + limitN);
    const pageObjIds = pageIdDocs.map(d => d._id);

    const fullDocs = await Protein.find(
      { _id: { $in: pageObjIds } },
      { _id: 1, protein_id: 1, uniprot_id: 1, description: 1, dataset_ids: 1, species_id: 1, sequence_length: 1 },
    ).lean();
    const docById = new Map(fullDocs.map(d => [d._id.toString(), d]));

    const pagePeptides = await Peptide.find(
      { protein_id: { $in: pageObjIds } },
      { protein_id: 1, sequence: 1, start_index: 1, end_index: 1, modifications: 1, q_value: 1, _id: 0 },
    ).lean();
    const pepsByProtein = new Map();
    for (const p of pagePeptides) {
      const key = p.protein_id.toString();
      if (!pepsByProtein.has(key)) pepsByProtein.set(key, []);
      pepsByProtein.get(key).push(p);
    }

    // Build each row with the same helper the Redis cache uses, in the sorted
    // page order — so this fallback and the cached path return identical rows.
    const rows = pageIdDocs.map((idDoc) => {
      const doc = docById.get(idDoc._id.toString());
      const stats = computeProteinStats(doc, pepsByProtein.get(idDoc._id.toString()) || []);
      return buildSummaryRow(doc, stats);
    });

    res.json({ speciesId, total, offset, limit: limitN, rows, source: 'mongo' });
  } catch (e) {
    console.error('species proteins-summary error', e);
    res.status(500).json({ error: 'Failed to build species protein summary' });
  }
});

module.exports = router;
