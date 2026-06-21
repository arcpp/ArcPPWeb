// Downloadable per-peptide table on the protein page: each peptide's sequence,
// PSM count, and the datasets it was seen in. Data from GET /api/proteins/:id/peptides.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button, Chip, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import GlassCard from './GlassCard';
import { useTheme } from '../ThemeContext';

// Per-protein peptide overview: every peptide sequence with its PSM count and
// the datasets it was identified in. Sortable, downloadable as CSV.
export default function PeptideTable({ proteinId }) {
  const { isDark } = useTheme();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: 'psm_count', dir: 'desc' });

  useEffect(() => {
    if (!proteinId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/proteins/${proteinId}/peptides`);
        if (cancelled) return;
        setData(res.data?.success ? res.data.data || [] : []);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setData([]);
        } else {
          setError(err.message || 'Failed to load peptide data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [proteinId]);

  const rowBorder   = isDark ? 'rgba(159,195,222,0.12)' : '#e8eff3';
  const headerColor = isDark ? '#9cb0c4' : '#5f7282';
  const textColor   = isDark ? '#e6edf7' : '#132334';
  const mutedColor  = isDark ? '#8ea4ba' : '#718493';
  const labelColor  = isDark ? '#6b8ba4' : '#7a909f';

  const onSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'sequence' ? 'asc' : 'desc' }));
  };
  const sortIcon = (key) => (sort.key !== key ? '↕' : sort.dir === 'asc' ? '↑' : '↓');

  const rows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (r) => {
      if (sort.key === 'sequence') return r.sequence || '';
      if (sort.key === 'modifications') return r.modifications || '';
      if (sort.key === 'datasets') return (r.datasets || []).length;
      return r.psm_count ?? -1;
    };
    return [...data].sort((a, b) => {
      const A = val(a), B = val(b);
      if (A < B) return -1 * dir;
      if (A > B) return 1 * dir;
      return 0;
    });
  }, [data, sort]);

  const downloadCSV = () => {
    const headers = ['Peptide Sequence', 'Modifications', 'PSMs', 'Datasets'];
    const csvRows = [headers.join(',')];
    rows.forEach((r) => {
      const datasets = Array.isArray(r.datasets) ? r.datasets.join('; ') : '';
      csvRows.push([r.sequence || '', r.modifications || '', r.psm_count ?? '', datasets].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `peptides_${proteinId}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: labelColor }}>
        Peptides
      </span>
      {!loading && !error && data.length > 0 && (
        <span style={{ fontSize: 12, color: mutedColor }}>{data.length.toLocaleString()} identified</span>
      )}
      <div style={{ marginLeft: 'auto' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={downloadCSV}
          disabled={rows.length === 0}
          sx={isDark ? {
            color: '#89a2c0',
            borderColor: 'rgba(255,255,255,0.2)',
            '&:hover': { borderColor: '#0ea5e9', color: '#0ea5e9', background: 'rgba(14,165,233,0.08)' },
          } : {}}
        >
          CSV
        </Button>
      </div>
    </div>
  );

  return (
    <GlassCard title={title} style={{ marginTop: 14 }} variant={isDark ? 'dark' : 'light'}>
      {loading ? (
        <div style={{ padding: 18, color: mutedColor }}>Loading peptides…</div>
      ) : error ? (
        <div style={{ padding: 18, color: '#f87171' }}>{error}</div>
      ) : data.length === 0 ? (
        <div style={{ padding: 18, color: mutedColor }}>No peptide data available for this protein.</div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto', borderRadius: 10, border: `1px solid ${rowBorder}` }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 80px 1.1fr',
            gap: 12,
            padding: '10px 16px',
            color: headerColor,
            fontWeight: 600,
            fontSize: 13,
            borderBottom: `1px solid ${rowBorder}`,
            position: 'sticky',
            top: 0,
            background: isDark ? 'rgba(13,20,32,0.96)' : '#f8fbfc',
            zIndex: 1,
          }}>
            <div style={{ cursor: 'pointer' }} onClick={() => onSort('sequence')}>Peptide Sequence {sortIcon('sequence')}</div>
            <div style={{ cursor: 'pointer' }} onClick={() => onSort('modifications')}>Modifications {sortIcon('modifications')}</div>
            <div style={{ cursor: 'pointer' }} onClick={() => onSort('psm_count')}>PSMs {sortIcon('psm_count')}</div>
            <div style={{ cursor: 'pointer' }} onClick={() => onSort('datasets')}>Datasets {sortIcon('datasets')}</div>
          </div>

          {rows.map((r, idx) => {
            const datasets = Array.isArray(r.datasets) ? r.datasets : [];
            const shown = datasets.slice(0, 3);
            const more = datasets.length - shown.length;
            return (
              <div
                key={`${r.sequence}-${idx}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 80px 1.1fr',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom: idx === rows.length - 1 ? 'none' : `1px solid ${rowBorder}`,
                  alignItems: 'center',
                  color: textColor,
                }}
              >
                <div style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  wordBreak: 'break-all',
                  lineHeight: 1.4,
                }}>
                  {r.sequence}
                </div>
                <div style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                  color: r.modifications ? textColor : mutedColor,
                }}>
                  {r.modifications || '—'}
                </div>
                <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                  {r.psm_count?.toLocaleString() ?? '—'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {datasets.length === 0 ? (
                    <span style={{ fontSize: 14, color: mutedColor }}>—</span>
                  ) : (
                    <>
                      {shown.map((ds, i) => (
                        <Chip key={i} label={ds} size="small" sx={{
                          height: 22, fontSize: 11, fontWeight: 500,
                          backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe',
                          color: isDark ? '#7dd3fc' : '#0369a1',
                        }} />
                      ))}
                      {more > 0 && (
                        <Tooltip
                          arrow
                          placement="top"
                          title={<div style={{ padding: 4 }}>{datasets.slice(3).map((ds, i) => (<div key={i} style={{ padding: '2px 0', fontSize: 12 }}>{ds}</div>))}</div>}
                        >
                          <span style={{ fontSize: 11, color: isDark ? '#60a5fa' : '#3366ff', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                            +{more} more
                          </span>
                        </Tooltip>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
