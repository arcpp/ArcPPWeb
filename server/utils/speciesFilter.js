// Builds the Mongo filter that selects one species' documents: a case-insensitive
// species_id match, with prefix/name aliases for special cases (e.g. Haloferax HVO_).
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SPECIES_ALIASES = {
  haloferax_volcanii: {
    prefixes: ['HVO_'],
    speciesNames: ['Haloferax volcanii'],
  },
  halobacterium_salinarum: {
    prefixes: ['VNG_', 'HBSAL_'],
    speciesNames: ['Halobacterium salinarum'],
  },
  sulfolobus_solfataricus: {
    prefixes: ['SSO_'],
    speciesNames: ['Sulfolobus solfataricus'],
  },
  methanococcus_maripaludis: {
    prefixes: ['MMP_', 'MMP1_'],
    speciesNames: ['Methanococcus maripaludis'],
  },
};

const speciesToProteinIdFilter = (raw) => {
  if (!raw) return {};

  const rawText = String(raw).trim();
  const key = rawText.toLowerCase().replace(/[\s-]+/g, '_');
  const alias = SPECIES_ALIASES[key];
  const conditions = [];

  if (alias) {
    alias.prefixes.forEach((prefix) => {
      conditions.push({ protein_id: { $regex: `^${escapeRegex(prefix)}`, $options: 'i' } });
    });
    alias.speciesNames.forEach((name) => {
      conditions.push({ species_id: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
    });
  } else {
    conditions.push({ species_id: { $regex: `^${escapeRegex(rawText)}$`, $options: 'i' } });
  }

  if (conditions.length === 1) return conditions[0];
  return { $or: conditions };
};

module.exports = { speciesToProteinIdFilter };
