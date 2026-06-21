const Protein = require('../model/proteins');

// Resolve a protein identifier (protein_id — HVO locus tag or UniProt accession)
// to its MongoDB ObjectId.
async function resolveProteinId(idStr) {
  if (!idStr) return null;
  const doc = await Protein.findOne({ protein_id: idStr }, { _id: 1 }).lean();
  return doc ? doc._id : null;
}

async function resolveProteinIds(idStrs) {
  if (!idStrs || idStrs.length === 0) return [];
  const docs = await Protein.find(
    { protein_id: { $in: idStrs } },
    { _id: 1 }
  ).lean();
  return docs.map(d => d._id);
}

async function resolveProteinIdsByFilter(filter) {
  const docs = await Protein.find(filter, { _id: 1 }).lean();
  return docs.map(d => d._id);
}

module.exports = { resolveProteinId, resolveProteinIds, resolveProteinIdsByFilter };
