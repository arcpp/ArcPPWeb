// The display ID for a protein: protein_id (the HVO locus tag for Haloferax,
// the UniProt accession for other species). Shared so every caller agrees.
function displayId(doc) {
  return doc.protein_id;
}

module.exports = { displayId };
