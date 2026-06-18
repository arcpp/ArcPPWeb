import React, { useRef } from 'react';
import { Tooltip } from '@mui/material';
import { useTheme } from '../ThemeContext';

// Protein sequence grid: colors residues covered by identified peptides and marks
// modification sites (hover for the peptide/position detail).
const COVERED_COLOR = '#60A5FA';

export default function SequenceViewer({ sequence, modifications, onPositionClick, highlightedPosition }) {
  const { isDark } = useTheme();
  const sequenceRef = useRef(null);

  const modificationColors = {};
  const modMap = {};
  const coveredPositions = new Set();
  const seenModEntries = new Set();

  if (modifications && Array.isArray(modifications)) {
    modifications.forEach(mod => {
      const pos = mod.position;
      const type = mod.type;
      const color = mod.color;

      if (type && color) {
        modificationColors[type] = color;
      }

      if (pos) {
        const normalizedType = String(type || '').trim().toLowerCase();
        const key = `${pos}|${normalizedType}`;
        if (seenModEntries.has(key)) return;
        seenModEntries.add(key);
        if (!modMap[pos]) modMap[pos] = [];
        modMap[pos].push({ ...mod, type: String(type || '').trim() });
      }

      if (mod.peptideStart && mod.peptideEnd) {
        for (let i = mod.peptideStart; i <= mod.peptideEnd; i++) {
          coveredPositions.add(i);
        }
      }
    });
  }

  const renderSequence = () => {
    if (!sequence) return null;

    const chars = sequence.split('');
    const CHARS_PER_ROW = 28;
    const rows = [];

    for (let rowStart = 0; rowStart < chars.length; rowStart += CHARS_PER_ROW) {
      const rowChars = chars.slice(rowStart, rowStart + CHARS_PER_ROW);
      const rowElements = [];

      rowChars.forEach((char, idx) => {
        const position = rowStart + idx + 1;
        const mods = modMap[position];
        const isCovered = coveredPositions.has(position);
        const isHighlighted = highlightedPosition === position;

        let bgColor = 'transparent';
        let isClickable = false;

        if (mods && mods.length > 0) {
          isClickable = true;

          if (mods.length === 1) {
            bgColor = mods[0].color || '#5b8df3';
          } else {
            const colors = mods.map(m => m.color);
            const numColors = colors.length;
            const segmentSize = 100 / numColors;
            const gradientStops = colors.map((color, i) => {
              const start = i * segmentSize;
              const end = (i + 1) * segmentSize;
              return `${color} ${start}%, ${color} ${end}%`;
            }).join(', ');
            bgColor = `linear-gradient(90deg, ${gradientStops})`;
          }
        } else if (isCovered) {
          bgColor = COVERED_COLOR;
          isClickable = true;
        }

        const style = {
          display: 'inline-block',
          width: '1.15em',
          textAlign: 'center',
          fontFamily: 'Monaco, Consolas, "Courier New", monospace',
          fontSize: '13px',
          fontWeight: 500,
          cursor: isClickable ? 'pointer' : 'default',
          background: bgColor,
          color: (mods || isCovered) ? '#000' : (isDark ? '#e6edf7' : '#334155'),
          borderRadius: '3px',
          padding: '2px 0',
          margin: '0 0.5px',
          transition: 'all 0.2s ease',
          border: isHighlighted ? '2px solid #fff' : 'none',
          transform: isHighlighted ? 'scale(1.15)' : 'scale(1)',
        };

        let tooltipText;
        if (mods) {
          if (mods.length > 1) {
            tooltipText = `Position ${position}: ${char}\nMULTIPLE MODIFICATIONS (gradient shown):\n${mods.map(m => `  - ${m.type} (peptide ${m.peptideStart}-${m.peptideEnd})`).join('\n')}`;
          } else {
            tooltipText = `Position ${position}: ${char}\n${mods.map(m => `${m.type} (peptide ${m.peptideStart}-${m.peptideEnd})`).join('\n')}`;
          }
        } else if (isCovered) {
          tooltipText = `Position ${position}: ${char}\nCovered by peptide`;
        } else {
          tooltipText = `Position ${position}: ${char}`;
        }

        rowElements.push(
          <Tooltip key={`char-${position}`} title={<span style={{ whiteSpace: 'pre-line' }}>{tooltipText}</span>} arrow placement="top">
            <span
              style={style}
              onClick={() => isClickable && onPositionClick(position)}
              onMouseEnter={(e) => {
                if (isClickable) {
                  e.target.style.transform = 'scale(1.15)';
                  e.target.style.boxShadow = '0 0 8px rgba(255,255,255,0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isHighlighted) {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = 'none';
                }
              }}
            >
              {char}
            </span>
          </Tooltip>
        );
      });

      rows.push(
        <div key={`row-${rowStart}`} style={{ whiteSpace: 'nowrap' }}>
          {rowElements}
        </div>
      );
    }

    return rows;
  };

  const uniqueModTypes = {};
  if (modifications) {
    modifications.forEach(mod => {
      const type = mod.type;
      if (modificationColors[type]) {
        uniqueModTypes[type] = modificationColors[type];
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={sequenceRef}
        style={{
          borderRadius: 12,
          padding: '16px',
          background: isDark
            ? 'linear-gradient(180deg, rgba(18,25,43,0.9), rgba(15,20,36,0.9))'
            : 'linear-gradient(180deg, #f8fafc, #f1f5f9)',
          border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.35) inset' : '0 1px 4px rgba(0,0,0,0.06) inset',
          maxHeight: '280px',
          overflowY: 'auto',
          overflowX: 'hidden',
          lineHeight: 2.2,
          flex: 1,
        }}
      >
        {renderSequence()}
      </div>

      {Object.keys(uniqueModTypes).length > 0 && (
        <div style={{
          marginTop: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 11,
          color: isDark ? '#89a2c0' : '#64748b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 16,
              height: 16,
              background: COVERED_COLOR,
              borderRadius: 3,
              border: isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)'
            }} />
            <span>Covered</span>
          </div>
          {Object.entries(uniqueModTypes).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 16,
                height: 16,
                background: color,
                borderRadius: 3,
                border: isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)'
              }} />
              <span>{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
