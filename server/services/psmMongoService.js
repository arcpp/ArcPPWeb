// PSMs-by-dataset, computed from MongoDB with the new direct-FK schema.
//
// In the rebuilt PeptideSpectrumMatches collection, each PSM doc carries:
//   protein_id   ObjectId  → Proteins._id
//   peptide_id   ObjectId  → Peptides._id
//   dataset_id   string    (PXD accession, denormalized from the source CSV)
//
// So a per-protein, per-dataset PSM count is a single indexed match + group —
// no joins through MassSpectrometryFiles or sequence-string keys.
//
// Required indexes (created by arcpp-ingestion at ingest time):
//   PeptideSpectrumMatches.protein_id, .dataset_id, (protein_id, dataset_id)
const mongoose = require('mongoose');
const Protein = require('../model/proteins');
const { Q_VALUE_THRESHOLD } = require('../utils/constants');

async function _resolveProteinObjectId(displayId) {
  if (!displayId) return null;
  const p = await Protein.findOne({ protein_id: displayId }, { _id: 1 }).lean();
  return p ? p._id : null;
}

async function getPsmsByDataset(displayId) {
  const objectId = await _resolveProteinObjectId(displayId);
  if (!objectId) return [];

  const psms = mongoose.connection.db.collection('PeptideSpectrumMatches');
  return psms
    .aggregate([
      { $match: { protein_id: objectId, q_value: { $lte: Q_VALUE_THRESHOLD } } },
      { $group: { _id: '$dataset_id', psm_count: { $sum: 1 } } },
      { $project: { _id: 0, dataset: '$_id', psm_count: 1 } },
      { $sort: { psm_count: -1 } },
    ])
    .toArray();
}

// Per-peptide overview for a protein: each distinct peptide (by peptide_id),
// its PSM count, and the datasets it was identified in. Grouped straight off
// the direct-FK PSM collection, then joined to Peptides for the sequence.
async function getPeptidesByProtein(displayId) {
  const objectId = await _resolveProteinObjectId(displayId);
  if (!objectId) return [];

  const psms = mongoose.connection.db.collection('PeptideSpectrumMatches');
  const rows = await psms
    .aggregate([
      { $match: { protein_id: objectId, q_value: { $lte: Q_VALUE_THRESHOLD } } },
      {
        $group: {
          _id: '$peptide_id',
          psm_count: { $sum: 1 },
          datasets: { $addToSet: '$dataset_id' },
        },
      },
      {
        $lookup: {
          from: 'Peptides',
          localField: '_id',
          foreignField: '_id',
          as: 'pep',
        },
      },
      { $unwind: '$pep' },
      {
        $project: {
          _id: 0,
          sequence: '$pep.sequence',
          modifications: '$pep.modifications',
          start_index: '$pep.start_index',
          end_index: '$pep.end_index',
          psm_count: 1,
          datasets: 1,
        },
      },
      { $sort: { psm_count: -1 } },
    ])
    .toArray();

  // Normalise: drop empty/blank dataset ids and sort them for stable display.
  return rows.map((r) => ({
    sequence: r.sequence,
    modifications: r.modifications || '',
    start_index: r.start_index,
    end_index: r.end_index,
    psm_count: r.psm_count,
    datasets: (r.datasets || [])
      .filter((d) => typeof d === 'string' && d.trim())
      .sort((a, b) => a.localeCompare(b)),
  }));
}

module.exports = { getPsmsByDataset, getPeptidesByProtein };
