// Home-page summary bar charts: "Species Proteome Sequence Coverage" and
// "Identified Proteins by Species" (data-driven, sorted descending).
import React from 'react';
import { Button, Chip } from '@mui/material';
import { useTheme } from '../ThemeContext';
import {
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar as ReBar,
  XAxis as ReXAxis,
  YAxis as ReYAxis,
  CartesianGrid as ReCartesianGrid,
  Tooltip as ReTooltip,
  Cell as ReCell,
} from 'recharts';

function ChartTooltip({ active, payload, isDark, labelKey, valueLabel }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div
      style={{
        background: isDark ? 'rgba(15,25,38,0.98)' : 'rgba(255,255,255,0.98)',
        color: isDark ? '#e2e8f0' : '#132334',
        border: `1px solid ${isDark ? 'rgba(157,196,224,0.25)' : '#cfdce6'}`,
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600 }}>{row[labelKey]}</div>
      <div>{Number(row.value || 0).toLocaleString()} {valueLabel}</div>
    </div>
  );
}

export default function DatasetCharts({
  datasetStats,
  datasetOverlap,
  selectedDatasets,
  setSelectedDatasets,
  selectedOverlaps,
  setSelectedOverlaps,
}) {
  const { isDark } = useTheme();

  const cardStyle = {
    background: isDark ? 'rgba(15,25,38,0.78)' : '#ffffff',
    padding: 14,
    borderRadius: 14,
    boxShadow: isDark ? '0 10px 22px rgba(3,9,16,0.34)' : '0 10px 22px rgba(17,39,58,0.07)',
    border: isDark ? '1px solid rgba(157,196,224,0.14)' : '1px solid #d8e2e8',
  };

  const headingColor = isDark ? '#e2e8f0' : '#132334';
  const mutedColor = isDark ? '#9cb0c4' : '#5f7282';
  const axisStroke = isDark ? '#f8fafc' : '#334155';

  const datasetRows = datasetStats.map((d) => ({
    dataset: d.dataset,
    value: d.proteinCount,
  }));

  const overlapRows = datasetOverlap.map((d) => ({
    overlapCount: String(d.overlapCount),
    value: d.proteinCount,
  }));

  return (
    <>
      <div style={{ height: 1, background: isDark ? 'rgba(157,196,224,0.14)' : '#d8e2e8', margin: '24px 0' }} />
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: headingColor, marginBottom: 4 }}>Dataset Analysis</h2>
        <p style={{ fontSize: 13, color: mutedColor, marginBottom: 18 }}>Click bars to filter proteins</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: headingColor, margin: 0 }}>Proteins per Dataset</h3>
              {selectedDatasets.length > 0 && (
                <Button size="small" onClick={() => setSelectedDatasets([])} sx={{ textTransform: 'none', fontSize: 11, minWidth: 'auto', padding: '2px 8px' }}>Clear</Button>
              )}
            </div>
            {selectedDatasets.length > 0 && (
              <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedDatasets.map((ds) => (
                  <Chip key={ds} label={ds} size="small" onDelete={() => setSelectedDatasets((prev) => prev.filter((d) => d !== ds))} sx={{ backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff', color: isDark ? '#93c5fd' : '#2563eb', fontSize: 10, height: 22 }} />
                ))}
              </div>
            )}
            {datasetRows.length === 0 ? (
              <div style={{ padding: 24, color: mutedColor, textAlign: 'center', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderRadius: 8 }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ReBarChart data={datasetRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <ReCartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} vertical={false} />
                  <ReXAxis
                    dataKey="dataset"
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={78}
                    tick={{ fill: axisStroke, fontSize: 10 }}
                    axisLine={{ stroke: axisStroke }}
                    tickLine={false}
                    tickMargin={6}
                  />
                  <ReYAxis
                    tick={{ fill: axisStroke, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Proteins', angle: -90, position: 'insideLeft', fill: axisStroke, fontSize: 12 }}
                  />
                  <ReTooltip content={<ChartTooltip isDark={isDark} labelKey="dataset" valueLabel="proteins" />} />
                  <ReBar
                    dataKey="value"
                    radius={[4, 4, 0, 0]}
                    onClick={(row) => {
                      const clickedDataset = row?.dataset;
                      if (!clickedDataset) return;
                      setSelectedDatasets((prev) => (prev.includes(clickedDataset) ? prev.filter((d) => d !== clickedDataset) : [...prev, clickedDataset]));
                    }}
                  >
                    {datasetRows.map((entry) => (
                      <ReCell key={entry.dataset} fill="#5f88ad" style={{ cursor: 'pointer' }} />
                    ))}
                  </ReBar>
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: headingColor, margin: 0 }}>Dataset Overlap</h3>
              {selectedOverlaps.length > 0 && (
                <Button size="small" onClick={() => setSelectedOverlaps([])} sx={{ textTransform: 'none', fontSize: 11, minWidth: 'auto', padding: '2px 8px' }}>Clear</Button>
              )}
            </div>
            {selectedOverlaps.length > 0 && (
              <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedOverlaps.map((ov) => (
                  <Chip key={ov} label={`${ov} dataset${ov !== 1 ? 's' : ''}`} size="small" onDelete={() => setSelectedOverlaps((prev) => prev.filter((o) => o !== ov))} sx={{ backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#f0fdf4', color: isDark ? '#86efac' : '#16a34a', fontSize: 10, height: 22 }} />
                ))}
              </div>
            )}
            {overlapRows.length === 0 ? (
              <div style={{ padding: 24, color: mutedColor, textAlign: 'center', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderRadius: 8 }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ReBarChart data={overlapRows} margin={{ top: 8, right: 16, left: 8, bottom: 40 }}>
                  <ReCartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} vertical={false} />
                  <ReXAxis
                    dataKey="overlapCount"
                    interval={0}
                    tick={{ fill: axisStroke, fontSize: 11 }}
                    axisLine={{ stroke: axisStroke }}
                    tickLine={false}
                    label={{ value: 'Number of Datasets', position: 'insideBottom', offset: -4, fill: axisStroke, fontSize: 12 }}
                  />
                  <ReYAxis
                    tick={{ fill: axisStroke, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Proteins', angle: -90, position: 'insideLeft', fill: axisStroke, fontSize: 12 }}
                  />
                  <ReTooltip content={<ChartTooltip isDark={isDark} labelKey="overlapCount" valueLabel="proteins" />} />
                  <ReBar
                    dataKey="value"
                    radius={[4, 4, 0, 0]}
                    onClick={(row) => {
                      const clickedOverlap = Number(row?.overlapCount);
                      if (!Number.isFinite(clickedOverlap)) return;
                      setSelectedOverlaps((prev) => (prev.includes(clickedOverlap) ? prev.filter((o) => o !== clickedOverlap) : [...prev, clickedOverlap]));
                    }}
                  >
                    {overlapRows.map((entry) => (
                      <ReCell key={entry.overlapCount} fill="#4f9b7e" style={{ cursor: 'pointer' }} />
                    ))}
                  </ReBar>
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {(selectedDatasets.length > 0 || selectedOverlaps.length > 0) && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: isDark ? 'rgba(159,195,222,0.08)' : '#f3f7fa', borderRadius: 8, border: isDark ? '1px solid rgba(159,195,222,0.16)' : '1px solid #d8e2e8' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <strong style={{ color: headingColor, fontSize: 12, display: 'block', marginBottom: 4 }}>Active Filters</strong>
                {selectedDatasets.length > 0 && (
                  <div style={{ marginBottom: selectedOverlaps.length > 0 ? 4 : 0, fontSize: 12 }}>
                    <span style={{ color: isDark ? '#c6d8e7' : '#325f86', fontWeight: 600, marginRight: 6 }}>Datasets:</span>
                    <span style={{ color: mutedColor }}>{selectedDatasets.join(', ')}</span>
                  </div>
                )}
                {selectedOverlaps.length > 0 && (
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: isDark ? '#a8d7c4' : '#2e7a62', fontWeight: 600, marginRight: 6 }}>Overlap:</span>
                    <span style={{ color: mutedColor }}>{selectedOverlaps.map((o) => `${o} dataset${o !== 1 ? 's' : ''}`).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
