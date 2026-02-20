// src/pages/DatasetsPage.jsx
import React, { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import GlassCard from '../components/GlassCard';
import { useTheme } from '../ThemeContext';

export default function DatasetsPage() {
  const { isDark } = useTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const pageBg = {
    minHeight: '100vh',
    background: isDark ? '#0b1320' : '#f4f7f8',
  };

  const normalizeDatasetId = (id) => {
    const text = String(id || '').trim().toUpperCase();
    const match = text.match(/\b(?:PXD|RPXD|PRXD)\d{6}\b/);
    return match ? match[0] : text;
  };
  const datasetSourceFromId = (id) => {
    const normalized = normalizeDatasetId(id);
    if (/^(PXD|RPXD|PRXD)\d{6}$/.test(normalized)) {
      const canonical = normalized.startsWith('RPXD')
        ? normalized.slice(1)
        : normalized.startsWith('PRXD')
          ? `PXD${normalized.slice(4)}`
          : normalized;
      return `https://www.ebi.ac.uk/pride/archive/projects/${encodeURIComponent(canonical)}`;
    }
    return `https://proteomecentral.proteomexchange.org/cgi/GetDataset?ID=${encodeURIComponent(normalized)}`;
  };
  const safeUrl = (rawUrl, fallbackUrl) => {
    const raw = String(rawUrl || '').trim();
    if (!raw) return fallbackUrl;
    if (/^javascript:/i.test(raw)) return fallbackUrl;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return `https:${raw}`;
    if (/^doi:\s*/i.test(raw)) return `https://doi.org/${raw.replace(/^doi:\s*/i, '').trim()}`;
    if (/^10\.\d{4,9}\//.test(raw)) return `https://doi.org/${raw}`;
    const pmid = raw.match(/^pmid:\s*(\d+)$/i);
    if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid[1]}/`;
    if (/^[a-z0-9.-]+\.[a-z]{2,}($|\/)/i.test(raw)) return `https://${raw}`;
    try {
      return new URL(raw, 'https://proteomecentral.proteomexchange.org').href;
    } catch {
      return fallbackUrl;
    }
  };

  const linkStyle = { color: isDark ? '#a9c9df' : '#325f86', textDecoration: 'underline', textDecorationThickness: '1px', textUnderlineOffset: '2px' };

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/datasets/summaries');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to fetch dataset summaries');
        if (!cancel) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancel) setErr(e.message || 'Something went wrong.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div style={pageBg}>
      <NavBar />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 64px' }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 42, fontWeight: 700, color: isDark ? '#e6edf7' : '#13212f', marginBottom: 2 }}>
            Datasets
          </h1>
          <p style={{ color: isDark ? '#9cb0c4' : '#5f7282', marginTop: 6, fontSize: 15 }}>
            Title, Publication Details and Citations from ProteomeCentral.
          </p>
        </header>

        <GlassCard style={{ padding: '16px 18px' }} variant={isDark ? 'dark' : 'light'}>
          {loading ? (
            <div style={{ color: isDark ? '#89a2c0' : '#64748b' }}>Loading...</div>
          ) : err ? (
            <div style={{ color: '#ef4444' }}>{err}</div>
          ) : rows.length === 0 ? (
            <div style={{ color: isDark ? '#89a2c0' : '#64748b' }}>No datasets found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <Th isDark={isDark} style={{ width: 160 }}>Dataset ID</Th>
                    <Th isDark={isDark}>Title</Th>
                    <Th isDark={isDark} style={{ width: 460 }}>Publication &amp; Citation</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <Td isDark={isDark} mono>
                        <a href={safeUrl(r.sourceUrl, datasetSourceFromId(r.id))} target="_blank" rel="noreferrer" style={linkStyle}>
                          {r.id}
                        </a>
                      </Td>
                      <Td isDark={isDark}>{r.title || <span style={{ color: isDark ? '#6b7fa5' : '#94a3b8' }}>{'\u2014'}</span>}</Td>
                      <Td isDark={isDark}>
                        {r.firstPublicationRow ? (
                          <div style={{ marginBottom: 6 }}>{r.firstPublicationRow}</div>
                        ) : (
                          <span style={{ color: isDark ? '#6b7fa5' : '#94a3b8' }}>{'\u2014'}</span>
                        )}

                        {Array.isArray(r.citations) && r.citations.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {r.citations.map((c, idx) => (
                              <a
                                key={idx}
                                href={safeUrl(c?.url, safeUrl(r.sourceUrl, datasetSourceFromId(r.id)))}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  background: isDark ? 'rgba(159,195,222,0.12)' : 'rgba(50,95,134,0.1)',
                                  color: isDark ? '#a9c9df' : '#325f86',
                                  fontSize: 12,
                                  textDecoration: 'none',
                                  border: `1px solid ${isDark ? 'rgba(159,195,222,0.25)' : 'rgba(50,95,134,0.25)'}`,
                                }}
                                title={c?.label || 'citation'}
                              >
                                [{(c && c.label) || 'link'}]
                              </a>
                            ))}
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </main>
    </div>
  );
}

function Th({ children, style, isDark }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        fontSize: 12,
        letterSpacing: '0.06em',
        color: isDark ? '#7e92b5' : '#64748b',
        borderBottom: `1px solid ${isDark ? 'rgba(159,195,222,0.16)' : '#d8e2e8'}`,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, mono, isDark }) {
  return (
    <td
      style={{
        padding: '12px 14px',
        color: isDark ? '#e6edf7' : '#13212f',
        borderBottom: `1px solid ${isDark ? 'rgba(159,195,222,0.12)' : '#e1e8ed'}`,
        verticalAlign: 'top',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
      }}
    >
      {children}
    </td>
  );
}
