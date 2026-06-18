const { mergeIntervals } = require('../utils/mergeIntervals');
const { Q_VALUE_THRESHOLD } = require('../utils/constants');

// Per-protein stats from its peptides — the single source of truth shared by the
// Redis cache builder (cacheRefresh) and the Mongo fallback (proteinsSummary) so
// the two paths can never drift. `doc` needs sequence/protein_id/hvo_id/etc.;
// `peptides` are that protein's peptides (sequence, q_value, start_index,
// end_index, modification).
function computeProteinStats(doc, peptides) {
  // Prefer the stored sequence_length (lets callers skip loading full sequences);
  // fall back to the sequence string's length when only that is projected.
  const seqLen = doc.sequence_length ?? (doc.sequence || '').length;
  const uniqueSeqs = new Set();
  const intervals = [];
  const mods = new Set();

  for (const p of peptides) {
    if (p.sequence) uniqueSeqs.add(p.sequence);
    if (p.q_value != null && p.q_value <= Q_VALUE_THRESHOLD
        && typeof p.start_index === 'number' && typeof p.end_index === 'number') {
      intervals.push([p.start_index, p.end_index]);
    }
    const mod = p.modification?.trim();
    if (mod && mod !== 'Unmodified' && mod !== 'N/A') {
      mod.split(';').forEach((part) => { const t = part.trim(); if (t) mods.add(t); });
    }
  }

  const coveredLength = (seqLen > 0 && intervals.length) ? Math.min(mergeIntervals(intervals), seqLen) : 0;
  const coveragePercent = seqLen > 0 ? (coveredLength / seqLen) * 100 : 0;
  return { seqLen, psm_count: uniqueSeqs.size, coveredLength, coveragePercent, modifications: Array.from(mods) };
}

// The protein-table summary row, built from a protein doc + its computed stats.
function buildSummaryRow(doc, stats) {
  const pid = doc.hvo_id || doc.protein_id;
  const cleanProteinId = (doc.protein_id || '').trim();
  return {
    hvoId: pid,
    uniProtId: (cleanProteinId && cleanProteinId !== '-') ? cleanProteinId : pid,
    species_id: doc.species_id || null,
    description: doc.description || null,
    psm_count: stats.psm_count,
    coveragePercent: Math.round(stats.coveragePercent * 10) / 10,
    datasets: Array.isArray(doc.dataset_ids) ? doc.dataset_ids : [],
    modifications: stats.modifications,
  };
}

module.exports = { computeProteinStats, buildSummaryRow };
