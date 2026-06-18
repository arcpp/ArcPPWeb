const router = require('express').Router();
const Protein = require('../model/proteins');
const Peptide = require('../model/peptides');
const { speciesToProteinIdFilter } = require('../utils/speciesFilter');
const { mergeIntervals } = require('../utils/mergeIntervals');
const { MOD_COLORS, Q_VALUE_THRESHOLD } = require('../utils/constants');

// In-memory coverage-stats cache (5 min)
let coverageCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000;
const ESCAPE_REGEX = (v) => String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function buildSpeciesConfigs() {
  const fromSpeciesId = await Protein.aggregate([
    {
      $match: {
        species_id: { $exists: true, $ne: null, $ne: '' },
      },
    },
    {
      $group: {
        _id: '$species_id',
        proteins: { $sum: 1 },
      },
    },
    { $sort: { proteins: -1 } },
  ]).exec();

  if (fromSpeciesId.length > 0) {
    return fromSpeciesId.map((row) => ({
      name: String(row._id).trim(),
      filter: { species_id: { $regex: `^${ESCAPE_REGEX(String(row._id).trim())}$`, $options: 'i' } },
    }));
  }

  return [{ name: 'Haloferax volcanii', filter: { protein_id: { $regex: '^HVO_', $options: 'i' } } }];
}

// Species coverage stats
router.get('/species/coverage-stats', async (req, res) => {
  try {
    const now = Date.now();
    if (coverageCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
      console.log('✅ Returning cached coverage stats');
      return res.json(coverageCache);
    }

    console.log('🔄 Calculating coverage stats (this may take a moment)...');
    const speciesConfigs = await buildSpeciesConfigs();

    const results = [];

    for (const config of speciesConfigs) {
      try {
        console.log(`Processing ${config.name}...`);

        // Only the lengths are needed here, so project sequence_length (an int)
        // instead of transferring every full sequence string.
        const proteinDocs = await Protein.find(config.filter, { _id: 1, protein_id: 1, sequence_length: 1 }).lean();

        const proteinLengths = {};
        for (const p of proteinDocs) {
          if (p.sequence_length) {
            proteinLengths[p.protein_id] = p.sequence_length;
          }
        }

        const totalProteins = Object.keys(proteinLengths).length;
        const totalProteomeLength = Object.values(proteinLengths).reduce((a, b) => a + b, 0);

        const objectIdToName = {};
        for (const p of proteinDocs) {
          objectIdToName[p._id.toString()] = p.protein_id;
        }

        // Fetch passing peptides via the indexed, denormalized species_id rather
        // than a $in over thousands of protein _ids.
        const peptides = await Peptide.find(
          {
            species_id: config.name,
            q_value: { $lte: Q_VALUE_THRESHOLD },
          },
          { protein_id: 1, start_index: 1, end_index: 1, _id: 0 }
        ).lean();

        const intervalsByProtein = {};
        for (const pep of peptides) {
          const pid = objectIdToName[pep.protein_id.toString()];
          if (!pid) continue;
          if (!intervalsByProtein[pid]) {
            intervalsByProtein[pid] = [];
          }
          let start = pep.start_index;
          let end = pep.end_index;
          if (typeof start !== 'number' || typeof end !== 'number') continue;
          if (end < start) [start, end] = [end, start];
          intervalsByProtein[pid].push([start, end]);
        }

        const observedProteins = Object.keys(intervalsByProtein).length;

        let totalCoveredLength = 0;
        for (const [pid, length] of Object.entries(proteinLengths)) {
          const intervals = intervalsByProtein[pid] || [];
          const covered = mergeIntervals(intervals);
          const cappedCovered = Math.min(covered, length);
          totalCoveredLength += cappedCovered;
        }

        const coveragePercent = totalProteomeLength > 0
          ? (totalCoveredLength * 100.0 / totalProteomeLength)
          : 0;

        results.push({
          species: config.name,
          coveragePercent: parseFloat(coveragePercent.toFixed(2)),
          totalProteins: totalProteins,
          observedProteins: observedProteins,
          totalLength: totalProteomeLength,
          coveredLength: totalCoveredLength,
        });

      } catch (err) {
        console.error(`Coverage calc failed for ${config.name}:`, err);
        results.push({
          species: config.name,
          coveragePercent: 0,
          totalProteins: 0,
          observedProteins: 0,
          error: err.message,
        });
      }
    }

    coverageCache = results;
    cacheTimestamp = Date.now();
    console.log('✅ Coverage stats cached successfully');

    res.json(results);
  } catch (e) {
    console.error('Coverage stats error:', e);
    res.status(500).json({ error: 'Failed to calculate coverage stats', details: e.message });
  }
});

// Count proteins in each dataset
router.get('/species/:speciesId/dataset-stats', async (req, res) => {
  try {
    const { speciesId } = req.params;
    const filter = speciesToProteinIdFilter(speciesId);

    const pipeline = [
      { $match: filter },
      { $unwind: '$dataset_ids' },
      { $match: { dataset_ids: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: '$dataset_ids',
          proteins: { $addToSet: '$protein_id' }
        }
      },
      { $project: { _id: 1, proteinCount: { $size: '$proteins' } } },
      { $sort: { proteinCount: -1 } },
      {
        $project: {
          _id: 0,
          dataset: '$_id',
          proteinCount: 1
        }
      }
    ];

    const results = await Protein.aggregate(pipeline).exec();
    res.json(results);
  } catch (e) {
    console.error('Dataset stats error:', e);
    res.status(500).json({ error: 'Failed to get dataset stats' });
  }
});

// Count proteins by number of datasets they appear in
router.get('/species/:speciesId/dataset-overlap', async (req, res) => {
  try {
    const { speciesId } = req.params;
    const filter = speciesToProteinIdFilter(speciesId);

    const pipeline = [
      { $match: filter },
      {
        $project: {
          protein_id: 1,
          datasetCount: {
            $cond: {
              if: { $isArray: '$dataset_ids' },
              then: { $size: { $setUnion: ['$dataset_ids', []] } },
              else: 0
            }
          }
        }
      },
      {
        $group: {
          _id: '$datasetCount',
          proteinCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          overlapCount: '$_id',
          proteinCount: 1
        }
      }
    ];

    const results = await Protein.aggregate(pipeline).exec();
    res.json(results);
  } catch (e) {
    console.error('Dataset overlap error:', e);
    res.status(500).json({ error: 'Failed to get dataset overlap' });
  }
});

// Modification stats
router.get('/species/:speciesId/modification-stats', async (req, res) => {
  try {
    const { speciesId } = req.params;
    const filter = speciesToProteinIdFilter(speciesId);

    if (!Object.keys(filter).length) {
      return res.status(400).json({ error: 'Invalid species' });
    }

    const speciesProteinDocs = await Protein.find(
      filter,
      { _id: 1, protein_id: 1 }
    ).lean();
    const speciesObjIds = speciesProteinDocs.map(p => p._id);
    const objIdToProteinName = {};
    for (const p of speciesProteinDocs) {
      objIdToProteinName[p._id.toString()] = p.protein_id;
    }

    const peptides = await Peptide.find(
      speciesObjIds.length > 0 ? { protein_id: { $in: speciesObjIds } } : { protein_id: null },
      { modification: 1, protein_id: 1, _id: 0 }
    ).lean();

    const modCounts = {};
    const proteinsByMod = {};
    const allowedMods = Object.keys(MOD_COLORS);

    peptides.forEach(pep => {
      if (pep.modification && pep.modification !== 'N/A' && pep.modification.trim()) {
        const mods = pep.modification.split(';');
        mods.forEach(mod => {
          const modType = mod.split(':')[0].trim();
          if (modType && allowedMods.includes(modType)) {
            modCounts[modType] = (modCounts[modType] || 0) + 1;
            if (!proteinsByMod[modType]) {
              proteinsByMod[modType] = new Set();
            }
            const proteinName = objIdToProteinName[pep.protein_id.toString()] || pep.protein_id.toString();
            proteinsByMod[modType].add(proteinName);
          }
        });
      }
    });

    const modifications = Object.keys(modCounts).map(modType => ({
      modification: modType,
      count: modCounts[modType],
      uniqueProteins: proteinsByMod[modType].size
    })).sort((a, b) => b.count - a.count);

    const totalOccurrences = modifications.reduce((sum, m) => sum + m.count, 0);
    const allUniqueProteins = new Set();
    Object.values(proteinsByMod).forEach(set => {
      set.forEach(pid => allUniqueProteins.add(pid));
    });

    res.json({
      modifications,
      totalOccurrences,
      totalUniqueProteins: allUniqueProteins.size
    });
  } catch (e) {
    console.error('modification-stats error:', e);
    res.status(500).json({ error: 'Failed to get modification stats' });
  }
});

module.exports = router;
