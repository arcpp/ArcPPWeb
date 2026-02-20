const router = require('express').Router();
const Dataset = require('../model/datasets');
const { fetchSummariesBatched } = require('../utils/datasetCache');

function normalizeDatasetIds(rawValues) {
  const isValidDatasetId = (id) => /^(?:PXD|RPXD|PRXD)\d{6}$/i.test(id);
  const ids = [];
  for (const raw of rawValues || []) {
    const text = String(raw || '').trim().toUpperCase();
    if (!text) continue;

    // Handle records that may contain multiple IDs in one field.
    const pxdMatches = text.match(/\b(?:PXD|RPXD|PRXD)\d{6}\b/g);
    if (pxdMatches && pxdMatches.length) {
      ids.push(...pxdMatches);
      continue;
    }

    // Fallback: split on common delimiters and keep only valid accession tokens.
    const tokens = text
      .split(/[,\s;|/]+/)
      .map((t) => t.trim())
      .filter((t) => Boolean(t) && isValidDatasetId(t));
    ids.push(...tokens);
  }
  return Array.from(new Set(ids)).sort();
}

router.get('/datasets/ids', async (_req, res) => {
  try {
    const ids = await Dataset.distinct('name');
    const unique = normalizeDatasetIds(ids);
    res.json(unique);
  } catch (e) {
    console.error('datasets/ids error', e);
    res.status(500).json({ error: 'Failed to fetch dataset IDs' });
  }
});

router.get('/datasets/summaries', async (_req, res) => {
  try {
    const ids = await Dataset.distinct('name');
    const uniqueIds = normalizeDatasetIds(ids);
    if (!uniqueIds.length) return res.json([]);
    const summaries = await fetchSummariesBatched(uniqueIds, 4);
    res.json(summaries);
  } catch (e) {
    console.error('datasets/summaries error', e);
    res.status(500).json({ error: 'Failed to build dataset summaries' });
  }
});

module.exports = router;
