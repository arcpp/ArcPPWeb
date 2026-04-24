import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Tooltip } from '@mui/material';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

import NavBar from '../components/NavBar';
import PeptideCoveragePlot from '../components/PeptideCoveragePlot';
import PSMsByDatasetChart from '../components/PSMsByDatasetChart';
import GlassCard from '../components/GlassCard';
import SequenceViewer from '../components/SequenceViewer';
import { useTheme } from '../ThemeContext';

export default function ProteinPlotPage() {
  const { hvoId } = useParams();
  const { isDark } = useTheme();

  const [coverage, setCoverage] = useState(null);
  const [protein, setProtein] = useState(null);
  const [psmCount, setPsmCount] = useState(null);
  const [totalPsms, setTotalPsms] = useState(null);
  const [sequenceData, setSequenceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(null);
  const plotRef = useRef(null);

  const pageBgStyle = {
    minHeight: '100vh',
    background: isDark ? '#0b1320' : '#f4f7f8',
  };

  const cardVariant = isDark ? 'dark' : 'light';

  useEffect(() => {
    let cancelled = false;

    function applyBundle(bundle) {
      if (cancelled || !bundle) return;
      setCoverage(bundle.coverage);
      setProtein(bundle.details);
      setPsmCount(typeof bundle.psmCount === 'number' ? bundle.psmCount : 0);
      setSequenceData(bundle.sequence);
      if (Array.isArray(bundle.psmsByDataset)) {
        const total = bundle.psmsByDataset.reduce((sum, item) => sum + (item.psmCount || 0), 0);
        setTotalPsms(total);
      }
    }

    async function fetchBundled() {
      try {
        const res = await axios.get(`/api/proteins/${hvoId}/page`);
        if (res.data?.coverage && res.data?.details && res.data?.sequence) {
          applyBundle(res.data);
          return true;
        }
      } catch (e) {
        if (e.response?.status !== 404) console.warn('Bundled fetch failed:', e.message);
      }
      return false;
    }

    async function fetchIndividual() {
      const [covRes, protRes, psmRes, seqRes, psmDatasetRes] = await Promise.all([
        axios.get(`/api/coverage/${hvoId}`),
        axios.get(`/api/proteins/${hvoId}/details`),
        axios.get(`/api/proteins/${hvoId}/psm-count`),
        axios.get(`/api/proteins/${hvoId}/sequence`),
        axios.get(`/api/proteins/${hvoId}/psms-by-dataset`).catch(() => ({ data: { success: false, data: [] } })),
      ]);
      if (cancelled) return;
      setCoverage(covRes.data);
      setProtein(protRes.data);
      setPsmCount(typeof psmRes.data?.psmCount === 'number' ? psmRes.data.psmCount : 0);
      setSequenceData(seqRes.data);
      if (psmDatasetRes.data?.success && psmDatasetRes.data.data) {
        const total = psmDatasetRes.data.data.reduce((sum, item) => sum + item.psmCount, 0);
        setTotalPsms(total);
      }
    }

    async function fetchAll() {
      setLoading(true);
      setErr('');
      try {
        const hit = await fetchBundled();
        if (!hit && !cancelled) await fetchIndividual();
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching data:', error);
          setErr('Failed to load protein data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [hvoId]);

  if (loading) {
    return (
      <div style={pageBgStyle}>
        <NavBar />
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px' }}>
          <div style={{ height: 160, borderRadius: 16, background: isDark ? '#0f1e30' : '#e8eef7', marginBottom: 12 }} />
          <div style={{ height: 80, borderRadius: 14, background: isDark ? '#0c1824' : '#edf2f7' }} />
        </div>
      </div>
    );
  }

  if (err || !coverage || !protein) {
    return (
      <div style={pageBgStyle}>
        <NavBar />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px', color: isDark ? '#89a2c0' : '#64748b' }}>
          {err || 'No data.'}
        </div>
      </div>
    );
  }

  const { total_length = 0, covered_length = 0, coverage_percent = 0 } = coverage;
  const { uniProtein_id, qValue, description, hydrophobicity, pI, molecular_weight } = protein;

  const statItems = [
    { label: 'q-Value',       value: qValue != null ? qValue : '—' },
    { label: 'Peptides',      value: psmCount != null ? psmCount : '—' },
    { label: 'PSMs',          value: totalPsms != null ? totalPsms.toLocaleString() : '—' },
    { label: 'pI',            value: pI != null ? pI.toFixed(2) : '—' },
    { label: 'Hydrophobicity',value: hydrophobicity != null ? hydrophobicity.toFixed(3) : '—' },
    { label: 'Mol. Weight',   value: molecular_weight != null ? molecular_weight : '—' },
  ];

  const mutedColor  = isDark ? '#8ea4ba' : '#718493';
  const labelColor  = isDark ? '#6b8ba4' : '#7a909f';
  const headingColor = isDark ? '#e7eef8' : '#132334';

  return (
    <div style={pageBgStyle}>
      <NavBar />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* Hero: gauge + protein info */}
        <GlassCard style={{ marginBottom: 14 }} variant={cardVariant}>
          <div style={{ display: 'flex', gap: 36, alignItems: 'center' }}>

            {/* Gauge */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Tooltip
                title={
                  <div style={{ lineHeight: 1.5, fontSize: 13 }}>
                    <div><strong>Coverage:</strong> {coverage_percent.toFixed(2)}%</div>
                    <div><strong>Total length:</strong> {total_length} AA</div>
                    <div><strong>Covered:</strong> {covered_length} AA</div>
                  </div>
                }
                arrow placement="right" enterTouchDelay={0} leaveTouchDelay={2500}
              >
                <div style={{ width: 148, height: 148 }}>
                  <CircularProgressbar
                    value={coverage_percent}
                    text={`${coverage_percent.toFixed(1)}%`}
                    strokeWidth={10}
                    styles={buildStyles({
                      textColor:           isDark ? '#e6edf7' : '#0f172a',
                      pathColor:           '#5f88ad',
                      trailColor:          isDark ? '#1a2c40' : '#dce5ec',
                      textSize:            '20px',
                      pathTransitionDuration: 1.0,
                    })}
                  />
                </div>
              </Tooltip>
              <div style={{ fontSize: 12, color: mutedColor, textAlign: 'center', lineHeight: 1.5 }}>
                <span style={{ color: '#6b99bc', fontWeight: 700 }}>{covered_length}</span>
                {' / '}
                <span style={{ fontWeight: 600, color: isDark ? '#c8d8e8' : '#334155' }}>{total_length}</span>
                {' AA covered'}
              </div>
            </div>

            {/* Protein info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                fontSize: 30, fontWeight: 700,
                color: headingColor,
                margin: '0 0 6px',
                fontFamily: 'Newsreader, Georgia, serif',
              }}>
                {hvoId}
              </h1>

              {uniProtein_id && (
                <a
                  href={`https://www.uniprot.org/uniprotkb/${uniProtein_id}/entry`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    fontSize: 13,
                    color: isDark ? '#9fc3de' : '#315f86',
                    textDecoration: 'none',
                    borderBottom: `1px dashed ${isDark ? 'rgba(159,195,222,0.55)' : 'rgba(49,95,134,0.5)'}`,
                    marginBottom: 12,
                  }}
                >
                  UniProt: {uniProtein_id} ↗
                </a>
              )}

              <p style={{
                margin: uniProtein_id ? '0' : '12px 0 0',
                color: mutedColor,
                fontSize: 14,
                lineHeight: 1.65,
                maxWidth: 680,
              }}>
                {description || 'No description available.'}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Stat strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 10,
          marginBottom: 14,
        }}>
          {statItems.map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: isDark ? 'rgba(15,25,40,0.8)' : '#ffffff',
                border: isDark ? '1px solid rgba(157,196,224,0.12)' : '1px solid #dce5ec',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: isDark ? '0 4px 12px rgba(3,9,16,0.28)' : '0 4px 12px rgba(17,39,58,0.06)',
              }}
            >
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: labelColor,
                marginBottom: 6,
              }}>
                {label}
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 600,
                color: headingColor,
                wordBreak: 'break-word',
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Two-column: sequence viewer + PSMs chart */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <GlassCard
            title={
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: labelColor }}>
                Protein Sequence — click highlighted residue to zoom
              </span>
            }
            style={{ minHeight: 300, display: 'flex', flexDirection: 'column' }}
            variant={cardVariant}
          >
            {sequenceData?.sequence && (
              <SequenceViewer
                sequence={sequenceData.sequence}
                modifications={sequenceData.modifications || []}
                onPositionClick={setSelectedPosition}
                highlightedPosition={selectedPosition}
              />
            )}
          </GlassCard>

          <div style={{ minHeight: 300 }}>
            <PSMsByDatasetChart
              proteinId={hvoId}
              mode={isDark ? 'dark' : 'light'}
            />
          </div>
        </section>

        {/* Full-width peptide coverage plot */}
        <PeptideCoveragePlot
          ref={plotRef}
          hvoId={hvoId}
          mode={isDark ? 'dark' : 'light'}
          zoomToPosition={selectedPosition}
        />
      </main>
    </div>
  );
}
