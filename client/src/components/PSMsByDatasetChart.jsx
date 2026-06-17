// src/components/PSMsByDatasetChart.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import GlassCard from './GlassCard';

/* ---------- Custom Tooltip ---------- */
function CustomTooltip({ active, payload, isDark }) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: isDark
            ? 'linear-gradient(180deg, rgba(18,25,43,0.98), rgba(15,20,36,0.98))'
            : 'rgba(255,255,255,0.98)',
          border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
          borderRadius: 10,
          padding: '10px 14px',
          boxShadow: isDark ? '0 8px 24px rgba(0,0,0,.6)' : '0 4px 16px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ color: isDark ? '#e6edf7' : '#0f172a', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
          {payload[0].payload.dataset}
        </div>
        <div style={{ color: '#60A5FA', fontSize: 13 }}>
          PSMs: <strong>{payload[0].value.toLocaleString()}</strong>
        </div>
      </div>
    );
  }
  return null;
}

const cardStyle = { height: '100%', display: 'flex', flexDirection: 'column' };

/* ---------- Main Component ---------- */
function PSMsByDatasetChart({ proteinId, mode = 'dark' }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!proteinId) return;

    const fetchPsmData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await axios.get(
          `/api/proteins/${proteinId}/psms-by-dataset`
        );

        if (response.data.success) {
          const psmData = response.data.data || [];
          setData(psmData);
        } else {
          setError(response.data.message || 'Failed to fetch PSM data');
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setError('No PSM data available for this protein');
        } else if (err.response?.status === 500) {
          setError('Server error loading PSM data');
        } else {
          setError(err.message || 'Failed to load PSM data');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPsmData();
  }, [proteinId]);

  // Transform data for Recharts and sort by PSM count (high to low)
  const chartData = data
    .map((item) => ({
      dataset: item.dataset,
      PSMs: item.psmCount,
    }))
    .sort((a, b) => b.PSMs - a.PSMs);

  const isDark = mode === 'dark';
  const cardVariant = isDark ? 'dark' : 'light';
  const mutedColor = isDark ? '#c7d8e8' : '#111827';
  const axisColor = isDark ? 'rgba(248,250,252,0.9)' : '#111827';

  // Loading state
  if (loading) {
    return (
      <GlassCard title="PSMs by Dataset" style={cardStyle} variant={cardVariant}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, color: mutedColor }}>
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner" style={{
              width: 40, height: 40,
              border: '4px solid rgba(91,141,243,0.2)',
              borderTopColor: '#5b8df3',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <div>Loading PSM data...</div>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </GlassCard>
    );
  }

  // Error state
  if (error) {
    return (
      <GlassCard title="PSMs by Dataset" style={cardStyle} variant={cardVariant}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, color: '#f87171', textAlign: 'center' }}>
          <div><div style={{ fontSize: 16, fontWeight: 500 }}>{error}</div></div>
        </div>
      </GlassCard>
    );
  }

  // No data state
  if (chartData.length === 0) {
    return (
      <GlassCard title="PSMs by Dataset" style={cardStyle} variant={cardVariant}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, color: mutedColor, textAlign: 'center' }}>
          <div><div style={{ fontSize: 16 }}>No PSM data available for this protein</div></div>
        </div>
      </GlassCard>
    );
  }

  // Generate colors for bars (gradient from blue to purple)
  const getBarColor = (index, total) => {
    const hue = 210 + (index / Math.max(total - 1, 1)) * 60;
    return `hsl(${hue}, 70%, 60%)`;
  };

  // Main render
  return (
    <GlassCard title="PSMs by Dataset" style={cardStyle} variant={cardVariant}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} vertical={false} />

          <XAxis
            dataKey="dataset"
            angle={-45}
            textAnchor="end"
            height={78}
            interval={0}
            tick={{ fill: mutedColor, fontSize: 11 }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
            tickMargin={6}
          />

          <YAxis
            tick={{ fill: mutedColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'PSMs', angle: -90, position: 'insideLeft', fill: mutedColor, fontSize: 12 }}
          />

          <Tooltip content={<CustomTooltip isDark={isDark} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }} />

          <Bar dataKey="PSMs" radius={[6, 6, 0, 0]} animationDuration={800} minPointSize={3}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(index, chartData.length)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Footer info */}
      <div style={{
        paddingTop: 12,
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 11,
        color: mutedColor,
      }}>
        <div>
          <strong style={{ color: isDark ? '#e6edf7' : '#0f172a', fontSize: 12 }}>{chartData.length}-datasets</strong> identified
        </div>
      </div>
    </GlassCard>
  );
}

export default PSMsByDatasetChart;
