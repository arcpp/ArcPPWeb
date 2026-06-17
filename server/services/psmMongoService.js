// PSMs-by-dataset, computed from MongoDB with the new direct-FK schema.
//
// In the rebuilt PeptideSpectrumMatches collection, each PSM doc carries:
//   protein_id   ObjectId  → Proteins._id
//   peptide_id   ObjectId  → Peptides._id
//   dataSet_id   string    (PXD accession, denormalized from the source CSV)
//
// So a per-protein, per-dataset PSM count is a single indexed match + group —
// no joins through MassSpectrometryFiles or sequence-string keys.
//
// Required indexes (created by arcpp-ingestion at ingest time):
//   PeptideSpectrumMatches.protein_id, .dataSet_id, (protein_id, dataSet_id)
const mongoose = require('mongoose');
const Protein = require('../model/proteins');

async function _resolveProteinObjectId(displayId) {
  if (!displayId) return null;
  let p = await Protein.findOne({ hvo_id: displayId }, { _id: 1 }).lean();
  if (p) return p._id;
  p = await Protein.findOne({ protein_id: displayId }, { _id: 1 }).lean();
  return p ? p._id : null;
}

async function getPsmsByDataset(displayId) {
  const objectId = await _resolveProteinObjectId(displayId);
  if (!objectId) return [];

  const psms = mongoose.connection.db.collection('PeptideSpectrumMatches');
  return psms
    .aggregate([
      { $match: { protein_id: objectId } },
      { $group: { _id: '$dataSet_id', psmCount: { $sum: 1 } } },
      { $project: { _id: 0, dataset: '$_id', psmCount: 1 } },
      { $sort: { psmCount: -1 } },
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
      { $match: { protein_id: objectId } },
      {
        $group: {
          _id: '$peptide_id',
          psmCount: { $sum: 1 },
          datasets: { $addToSet: '$dataSet_id' },
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
          startIndex: '$pep.startIndex',
          endIndex: '$pep.endIndex',
          psmCount: 1,
          datasets: 1,
        },
      },
      { $sort: { psmCount: -1 } },
    ])
    .toArray();

  // Normalise: drop empty/blank dataset ids and sort them for stable display.
  return rows.map((r) => ({
    sequence: r.sequence,
    startIndex: r.startIndex,
    endIndex: r.endIndex,
    psmCount: r.psmCount,
    datasets: (r.datasets || [])
      .filter((d) => typeof d === 'string' && d.trim())
      .sort((a, b) => a.localeCompare(b)),
  }));
}

module.exports = { getPsmsByDataset, getPeptidesByProtein };
