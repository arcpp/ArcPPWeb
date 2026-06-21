const mongoose = require('mongoose');

const peptideSchema = new mongoose.Schema({
  sequence: String,
  end_index: Number,
  modifications: String,
  protein_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Protein' },
  q_value: Number,
  start_index: Number
});

module.exports = mongoose.model('Peptide', peptideSchema, 'Peptides');