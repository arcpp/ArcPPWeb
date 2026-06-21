const mongoose = require('mongoose');

const proteinSchema = new mongoose.Schema({
  protein_id: String,
  description: String,
  q_value: Number,
  species_id: String,
  current_database: String,
  uniprot_id: String,
  sequence: String,
  hydrophobicity: Number,
  molecular_weight: Number,
  pI: Number,
  dataset_ids: [String],
},
{ collection: 'Proteins' }
);
proteinSchema.index({ protein_id: 1 });
proteinSchema.index({ species_id: 1 });

module.exports = mongoose.model('Protein', proteinSchema);
