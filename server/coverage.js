// Protein sequence coverage = residues covered by identified peptides (q <= cutoff),
// merged into intervals, over the protein length. Used by the protein page and coverage-stats.
const Peptide = require('./model/peptides');
const Protein = require('./model/proteins');
const { mergeIntervals } = require('./utils/mergeIntervals');
const { Q_VALUE_THRESHOLD } = require('./utils/constants');

async function getCoveredLength(proteinObjectId) {
  const peptides = await Peptide.find({
    protein_id: proteinObjectId,
    q_value: { $lte: Q_VALUE_THRESHOLD }
  }, {
    start_index: 1,
    end_index: 1,
    _id: 0
  }).lean();

  const intervals = [];
  for (const pep of peptides) {
    const { start_index: start, end_index: end } = pep;
    if (typeof start === 'number' && typeof end === 'number' && end >= start) {
      intervals.push([start, end]);
    }
  }
  return mergeIntervals(intervals);
}

// Accept hvo_id or protein_id
async function getProteinCoverage(proteinId) {
  let proteinDoc = await Protein.findOne({ hvo_id: proteinId }, { _id: 1, sequence: 1 }).lean();
  if (!proteinDoc) {
    proteinDoc = await Protein.findOne({ protein_id: proteinId }, { _id: 1, sequence: 1 }).lean();
  }

  if (!proteinDoc || !proteinDoc.sequence) {
    throw new Error(`Protein ${proteinId} not found in database`);
  }

  const totalLength = proteinDoc.sequence.length;
  const coveredLength = await getCoveredLength(proteinDoc._id);
  const coveragePercent = (coveredLength / totalLength) * 100;

  return {
    protein_id: proteinId,
    total_length: totalLength,
    covered_length: coveredLength,
    coverage_percent: coveragePercent
  };
}

module.exports = { getProteinCoverage };
