import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import GlassCard from './GlassCard';

// Protein feature viewer built on the Nightingale web components (lazy-loaded
// once): renders the sequence track with peptide coverage, modifications, and
// enzyme cleavage sites, from GET /api/proteins/:id/features.
let nightingaleLoaded = null;
function loadNightingale() {
  if (!nightingaleLoaded) {
    nightingaleLoaded = Promise.all([
      import('@nightingale-elements/nightingale-manager'),
      import('@nightingale-elements/nightingale-navigation'),
      import('@nightingale-elements/nightingale-sequence'),
      import('@nightingale-elements/nightingale-track'),
    ]);
  }
  return nightingaleLoaded;
}

const TRACK_HEIGHT = 44;
// Nightingale's circle shape is drawn at a hardcoded y=0..10 instead of being
// centered by featureHeight (see node_modules/@nightingale-elements/nightingale-track).
// Using a small trackHeight (≤12) makes featureHeight clamp to minHeight (10),
// which puts the circle's geometric center at the SVG center — so it lines up
// with the label when the SVG is flex-centered inside the row.
const CIRCLE_TRACK_HEIGHT = 12;

const TRACKS = [
  { key: 'peptides',      label: 'Peptides',       dataKey: 'peptides',      layout: 'non-overlapping', trackHeight: TRACK_HEIGHT },
  { key: 'modifications', label: 'Modifications',  dataKey: 'modifications', layout: 'default',         trackHeight: CIRCLE_TRACK_HEIGHT },
  { key: 'gluc',          label: 'GluC sites',     dataKey: 'glucSites',     layout: 'default',         trackHeight: CIRCLE_TRACK_HEIGHT },
  { key: 'trypsin',       label: 'Trypsin sites',  dataKey: 'trypsinSites',  layout: 'default',         trackHeight: CIRCLE_TRACK_HEIGHT },
];

export default function NightingalePeptidePlot({ hvoId, mode = 'light', zoomToPosition = null }) {
  const [features, setFeatures] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const managerRef = useRef(null);
  const trackRefs = useRef({});
  const sequenceRef = useRef(null);
  const navigationRef = useRef(null);
  const containerWidth = useRef(1000);
  const containerDiv = useRef(null);

  const isDark = mode === 'dark';

  useEffect(() => {
    loadNightingale().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!hvoId) return;
    let cancelled = false;
    setLoading(true); setErr('');
    axios.get(`/api/proteins/${hvoId}/features`)
      .then((res) => { if (!cancelled) setFeatures(res.data); })
      .catch((e) => { if (!cancelled) setErr(e.response?.data?.error || 'Failed to load features'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hvoId]);

  // Measure width for responsive layout
  useEffect(() => {
    if (!containerDiv.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        containerWidth.current = Math.max(400, Math.floor(e.contentRect.width - 180));
      }
    });
    ro.observe(containerDiv.current);
    return () => ro.disconnect();
  }, []);

  // Push data into each track once refs & data are ready
  useEffect(() => {
    if (!ready || !features) return;

    const manager = managerRef.current;
    const seq = sequenceRef.current;
    const nav = navigationRef.current;

    if (seq) seq.sequence = features.sequence;
    if (manager) {
      if (nav) manager.register(nav);
      if (seq) manager.register(seq);
    }

    for (const t of TRACKS) {
      const el = trackRefs.current[t.key];
      if (!el) continue;
      el.data = features[t.dataKey] || [];
      if (manager) manager.register(el);
    }
  }, [ready, features]);

  // Zoom to highlight position
  useEffect(() => {
    if (!zoomToPosition || !features || !managerRef.current) return;
    const window = 40;
    const start = Math.max(1, zoomToPosition - window / 2);
    const end = Math.min(features.length, zoomToPosition + window / 2);
    managerRef.current.setAttribute('display-start', String(start));
    managerRef.current.setAttribute('display-end', String(end));
    managerRef.current.setAttribute('highlight', `${zoomToPosition}:${zoomToPosition}`);
  }, [zoomToPosition, features]);

  const titleLabel = useMemo(() => (
    <span style={{ fontWeight: 600, color: isDark ? '#e6edf7' : '#1b2d3f' }}>
      Peptides · Modifications · Cleavage Sites
    </span>
  ), [isDark]);

  const LABEL_WIDTH = 150;

  const labelStyle = {
    fontSize: 12,
    color: isDark ? '#e6edf7' : '#0f172a',
    fontWeight: 600,
    paddingRight: 8,
    textAlign: 'right',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  };

  const customElemStyle = { display: 'block', verticalAlign: 'top', width: '100%' };

  if (err) {
    return (
      <GlassCard title={titleLabel} variant={isDark ? 'dark' : 'light'}>
        <div style={{ color: isDark ? '#fecaca' : '#b91c1c', padding: 24 }}>{err}</div>
      </GlassCard>
    );
  }

  if (loading || !features || !ready) {
    return (
      <GlassCard title={titleLabel} variant={isDark ? 'dark' : 'light'}>
        <div style={{ padding: 48, color: isDark ? '#a9bfd3' : '#64748b', textAlign: 'center' }}>
          Loading peptide tracks…
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard title={titleLabel} variant={isDark ? 'dark' : 'light'}>
      <div ref={containerDiv} style={{
        background: isDark ? 'rgba(12,22,36,0.55)' : '#fbfdff',
        border: isDark ? '1px solid rgba(157,196,224,0.12)' : '1px solid #e2eaf1',
        borderRadius: 12,
        padding: '14px 18px 18px',
      }}>
        <style>{`
          .ngl-grid nightingale-navigation,
          .ngl-grid nightingale-sequence,
          .ngl-grid nightingale-track,
          .ngl-grid nightingale-navigation svg,
          .ngl-grid nightingale-sequence svg,
          .ngl-grid nightingale-track svg {
            display: block !important;
            vertical-align: top !important;
          }
        `}</style>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <nightingale-manager
          ref={managerRef}
          reflected-attributes="display-start,display-end,highlight"
        >
          <div
            className="ngl-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: `${LABEL_WIDTH}px 1fr`,
              gridAutoRows: 'min-content',
              alignItems: 'center',
              rowGap: 4,
            }}
          >
            {/* Navigation ruler */}
            <div style={{ ...labelStyle, height: 40 }}>Position</div>
            <div style={{ height: 40 }}>
              <nightingale-navigation
                ref={navigationRef}
                length={features.length}
                display-start="1"
                display-end={features.length}
                height="40"
                margin-color="transparent"
                style={customElemStyle}
              />
            </div>

            {/* Sequence */}
            <div style={{ ...labelStyle, height: 32 }}>Sequence</div>
            <div style={{ height: 32 }}>
              <nightingale-sequence
                ref={sequenceRef}
                length={features.length}
                display-start="1"
                display-end={features.length}
                height="32"
                margin-color="transparent"
                use-ctrl-to-zoom
                highlight-event="onmouseover"
                style={customElemStyle}
              />
            </div>

            {/* Feature tracks */}
            {TRACKS.map((t) => (
              <React.Fragment key={t.key}>
                <div style={{ ...labelStyle, height: TRACK_HEIGHT }}>{t.label}</div>
                <div style={{ height: TRACK_HEIGHT, display: 'flex', alignItems: 'center' }}>
                  <nightingale-track
                    ref={(el) => { trackRefs.current[t.key] = el; }}
                    length={features.length}
                    display-start="1"
                    display-end={features.length}
                    height={t.trackHeight}
                    layout={t.layout}
                    margin-color="transparent"
                    highlight-event="onmouseover"
                    style={customElemStyle}
                  />
                </div>
              </React.Fragment>
            ))}
          </div>
        </nightingale-manager>

        {/* Legend */}
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${isDark ? 'rgba(157,196,224,0.1)' : '#e5edf3'}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          fontSize: 11,
          color: isDark ? '#9fb4ca' : '#5f7282',
        }}>
          <Swatch color="#6FA8DC" label="Peptide" />
          {[...new Set((features.modifications || []).map((m) => m.type))].map((t) => {
            const color = features.modifications.find((m) => m.type === t)?.color || '#999';
            return <Swatch key={t} color={color} label={t} />;
          })}
          <Swatch color="#14B8A6" label="Trypsin (K/R)" />
          <Swatch color="#86EFAC" label="GluC (D/E)" />
          <span style={{ marginLeft: 'auto', fontSize: 10, fontStyle: 'italic' }}>
            Drag ruler to pan · Hold Ctrl + scroll to zoom
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

function Swatch({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block',
      }} />
      {label}
    </span>
  );
}
