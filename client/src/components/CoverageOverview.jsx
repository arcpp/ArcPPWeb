import React, { useMemo } from 'react';
import { useTheme } from '../ThemeContext';

// Per-species coverage blocks shown at the top of the Home page.
// Each block reports: full species name, identified proteins, total proteins,
// and proteome coverage (identified proteins / total proteins). Blocks are
// sorted by coverage (descending).
export default function CoverageOverview({
  coverageLoading,
  coverageData = [],
  selectedSpecies,
  onSelectSpecies,
}) {
  const { isDark } = useTheme();

  const bg     = isDark ? 'rgba(15,25,40,0.8)' : '#ffffff';
  const border = isDark ? '1px solid rgba(157,196,224,0.14)' : '1px solid #dce5ec';
  const shadow = isDark ? '0 8px 20px rgba(3,9,16,0.32)' : '0 8px 20px rgba(17,39,58,0.07)';

  const labelColor = isDark ? '#6b8ba4' : '#8a9fb0';
  const nameColor  = isDark ? '#e2e8f0' : '#132334';
  const subColor   = isDark ? '#8ea4ba' : '#8a9fb0';
  const trackColor = isDark ? 'rgba(95,136,173,0.18)' : '#deeaf3';
  const ringColor  = '#5f88ad';
  const selectedBorder = isDark ? '1px solid rgba(111,153,188,0.85)' : '1px solid #6f99bc';

  // Coverage here = identified proteins / total proteins (a proteome-level
  // "how much of the proteome did we see" number), distinct from the
  // amino-acid sequence coverage shown in the bar chart below.
  const blocks = useMemo(() => {
    return coverageData
      .filter((d) => d && d.species)
      .map((d) => {
        const identified = d.observedProteins || 0;
        const total = d.totalProteins || 0;
        const pct = total > 0 ? (identified / total) * 100 : 0;
        return { species: d.species, identified, total, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [coverageData]);

  if (coverageLoading) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14,
        marginBottom: 28,
      }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            borderRadius: 14, padding: '18px 20px', background: bg, border, boxShadow: shadow,
          }}>
            <div style={{ height: 14, width: '70%', borderRadius: 6, background: isDark ? '#1e304a' : '#dde6ee', marginBottom: 14 }} />
            <div style={{ height: 26, width: '40%', borderRadius: 6, background: isDark ? '#1e304a' : '#dde6ee', marginBottom: 12 }} />
            <div style={{ height: 10, width: '60%', borderRadius: 6, background: isDark ? '#1e304a' : '#dde6ee' }} />
          </div>
        ))}
      </div>
    );
  }

  if (blocks.length === 0) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: 14,
      marginBottom: 28,
    }}>
      {blocks.map(({ species, identified, total, pct }) => {
        const isSelected = species === selectedSpecies?.species;
        const pctClamped = Math.min(Math.max(pct, 0), 100);
        return (
          <div
            key={species}
            onClick={onSelectSpecies ? () => onSelectSpecies(species) : undefined}
            style={{
              borderRadius: 14,
              padding: '18px 20px',
              background: bg,
              border: isSelected ? selectedBorder : border,
              boxShadow: shadow,
              cursor: onSelectSpecies ? 'pointer' : 'default',
              transition: 'border-color 0.2s ease, transform 0.2s ease',
            }}
          >
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              fontStyle: 'italic',
              color: nameColor,
              fontFamily: 'Newsreader, Georgia, serif',
              lineHeight: 1.25,
              marginBottom: 12,
              minHeight: 38,
            }}>
              {species}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <div style={{
                fontSize: 26, fontWeight: 700, color: ringColor,
                lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                fontFamily: 'Newsreader, Georgia, serif',
              }}>
                {pct.toFixed(1)}<span style={{ fontSize: 15 }}>%</span>
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: labelColor,
              }}>
                Coverage
              </div>
            </div>

            <div style={{ height: 6, borderRadius: 4, background: trackColor, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{
                height: '100%', width: `${pctClamped}%`, background: ringColor,
                borderRadius: 4, transition: 'width 0.8s ease',
              }} />
            </div>

            <div style={{ fontSize: 13, color: subColor }}>
              <span style={{ color: nameColor, fontWeight: 600 }}>{identified.toLocaleString()}</span>
              {' '}
              <span style={{ color: isDark ? '#4a6f8a' : '#9bb8cc' }}>/ {total.toLocaleString()} proteins identified</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
