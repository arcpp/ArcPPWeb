import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import {
  Autocomplete,
  TextField,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import { filterModifications } from '../constants/modifications';
import CoverageOverview from '../components/CoverageOverview';
import DatasetCharts from '../components/DatasetCharts';
import ProteinTable from '../components/ProteinTable';

const PAGE_SIZE = 25;

function SpeciesTick({ x, y, payload, fill }) {
  const [abbrev, ...rest] = (payload?.value || '').split(' ');
  const name = rest.join(' ');
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy="1.1em" textAnchor="middle" fill={fill} fontSize={11} fontStyle="italic">{abbrev}</text>
      {name && <text dy="2.4em" textAnchor="middle" fill={fill} fontSize={11}>{name}</text>}
    </g>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const inputSx = {
    width: '100%',
    borderRadius: '12px',
    backgroundColor: isDark ? '#17253a' : '#ffffff',
    '& .MuiOutlinedInput-root': {
      borderRadius: '12px',
      color: isDark ? '#e6edf7' : '#142434',
      '& fieldset': { borderColor: isDark ? 'rgba(177,207,231,0.2)' : '#cbd8e1' },
      '&:hover fieldset': { borderColor: isDark ? 'rgba(177,207,231,0.36)' : '#9eb6c8' },
      '&.Mui-focused fieldset': { borderColor: isDark ? '#8fb6d1' : '#6c91ae' },
    },
    '& .MuiInputBase-input': { fontSize: 15, color: isDark ? '#e6edf7' : '#142434' },
    '& .MuiInputLabel-root': { color: isDark ? '#9db4cc' : '#5e7283' },
    '& .MuiInputLabel-root.Mui-focused': { color: isDark ? '#9fc2dc' : '#567d9c' },
    '& .MuiSvgIcon-root': { color: isDark ? '#9db4cc' : '#6d8191' },
    '& .MuiAutocomplete-popupIndicator': { color: isDark ? '#9db4cc' : '#6d8191' },
    '& .MuiAutocomplete-clearIndicator': { color: isDark ? '#9db4cc' : '#6d8191' },
  };

  const controlLabelStyle = {
    fontSize: 13,
    color: isDark ? '#8fa6bc' : '#607485',
    marginBottom: 8,
    paddingLeft: 4,
    fontWeight: 600,
  };

  const [coverageData, setCoverageData] = useState([]);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const speciesOptions = useMemo(
    () =>
      coverageData
        .filter((s) => s?.species)
        .map((s) => ({ label: s.species, value: s.species })),
    [coverageData]
  );
  const [speciesValue, setSpeciesValue] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [tableSpeciesFilter, setTableSpeciesFilter] = useState('');
  const [datasetStats, setDatasetStats] = useState([]);
  const [datasetOverlap, setDatasetOverlap] = useState([]);
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedOverlaps, setSelectedOverlaps] = useState([]);
  const [showDatasetGraphs, setShowDatasetGraphs] = useState(false);
  const [options, setOptions] = useState([]);
  const [optLoading, setOptLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [picked, setPicked] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [sort, setSort] = useState({ key: 'hvoId', dir: 'asc' });

  useEffect(() => {
    if (!speciesOptions.length) return;
    const exists = speciesValue && speciesOptions.some((s) => s.value === speciesValue.value);
    if (exists) return;

    const first = speciesOptions[0];
    setSpeciesValue(first);
    setTableSpeciesFilter(first.value);
    setShowTable(true);
    setShowDatasetGraphs(true);
  }, [speciesOptions, speciesValue]);

  const onSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const sortIcon = (key) => sort.key !== key ? '↕' : sort.dir === 'asc' ? '↑' : '↓';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPage = async (nextPage, searchQuery = '', speciesFilter = '', datasetFilter = [], overlapFilter = []) => {
    const currentSpecies = speciesFilter || tableSpeciesFilter;
    if (!currentSpecies) return;

    const p = Math.max(1, Math.min(nextPage, totalPages || 1));
    setPage(p);
    setTableError('');
    try {
      setTableLoading(true);
      const offset = (p - 1) * PAGE_SIZE;
      let url = `/api/species/${encodeURIComponent(currentSpecies)}/proteins-summary?limit=${PAGE_SIZE}&offset=${offset}`;

      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      if (datasetFilter.length > 0) {
        url += `&datasets=${encodeURIComponent(JSON.stringify(datasetFilter))}`;
      }

      if (overlapFilter.length > 0) {
        url += `&overlaps=${encodeURIComponent(JSON.stringify(overlapFilter))}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load proteins');

      const filteredRows = (Array.isArray(data?.rows) ? data.rows : []).map(row => ({
        ...row,
        modifications: filterModifications(row.modifications)
      }));

      setRows(filteredRows);
      setTotal(data?.total ?? 0);
    } catch (e) {
      console.error(e);
      setTableError(e.message || 'Failed to fetch data');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    if (tableSpeciesFilter) {
      fetchPage(1, tableSearch, tableSpeciesFilter, selectedDatasets, selectedOverlaps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSpeciesFilter, selectedDatasets, selectedOverlaps]);

  useEffect(() => {
    if (tableSpeciesFilter) {
      const timer = setTimeout(() => {
        setPage(1);
        fetchPage(1, tableSearch, tableSpeciesFilter, selectedDatasets, selectedOverlaps);
      }, 150);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSearch]);

  const processedRows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const key = sort.key;
    const val = (row) => {
      if (key === 'hvoId') return row.hvoId || '';
      if (key === 'uniProtId') return row.uniProtId || '';
      if (key === 'psmCount') return row.psmCount ?? -1;
      if (key === 'coveragePercent') return row.coveragePercent ?? -1;
      return '';
    };
    return [...rows].sort((a, b) => {
      const A = val(a), B = val(b);
      if (A < B) return -1 * dir;
      if (A > B) return 1 * dir;
      return 0;
    });
  }, [rows, sort]);

  useEffect(() => {
    const q = searchInput.trim();
    if (q.length < 2) {
      setOptions([]);
      setOptLoading(false);
      return;
    }
    let cancelled = false;
    setOptLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proteins/search?q=${encodeURIComponent(q)}&limit=20`);
        const data = await res.json();
        if (!cancelled) setOptions(Array.isArray(data?.results) ? data.results : []);
      } catch (err) {
        if (!cancelled) console.error('Search failed:', err);
      } finally {
        if (!cancelled) setOptLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    async function loadCoverage() {
      try {
        setCoverageLoading(true);
        const res = await fetch('/api/species/coverage-stats');
        const data = await res.json();
        setCoverageData(data);
      } catch (err) {
        console.error('Error loading coverage data:', err);
      } finally {
        setCoverageLoading(false);
      }
    }
    loadCoverage();
  }, []);

  useEffect(() => {
    if (!speciesValue) return;
    async function loadDatasets() {
      try {
        const [statsRes, overlapRes] = await Promise.all([
          fetch(`/api/species/${encodeURIComponent(speciesValue.value)}/dataset-stats`),
          fetch(`/api/species/${encodeURIComponent(speciesValue.value)}/dataset-overlap`)
        ]);
        const stats = await statsRes.json();
        const overlap = await overlapRes.json();
        setDatasetStats(stats);
        setDatasetOverlap(overlap);
      } catch (err) {
        console.error('Error loading dataset stats:', err);
      }
    }
    loadDatasets();
  }, [speciesValue]);

  const selectedSpeciesStats = useMemo(
    () => coverageData.find((d) => d.species === speciesValue?.value) || null,
    [coverageData, speciesValue]
  );

  const { coverageChartData, proteinsChartData } = useMemo(() => {
    const speciesNames = coverageData.map((d) => d.species);
    const speciesNamesShort = speciesNames.map((name) => {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
    });
    return {
      coverageChartData: speciesNamesShort.map((name, i) => ({
        name,
        value: coverageData[i]?.coveragePercent || 0,
        fullName: speciesNames[i],
      })),
      proteinsChartData: speciesNamesShort.map((name, i) => ({
        name,
        value: coverageData[i]?.observedProteins || 0,
        fullName: speciesNames[i],
      })),
    };
  }, [coverageData]);

  const chartGrid      = isDark ? 'rgba(255,255,255,0.05)' : '#e8edf2';
  const chartAxisColor = isDark ? 'rgba(255,255,255,0.12)' : '#d1d9e0';
  const chartTickFill  = isDark ? '#c8d8e8' : '#475569';

  const tipStyle = useMemo(() => ({
    contentStyle: {
      background: isDark ? '#162032' : '#fff',
      border: `1px solid ${isDark ? 'rgba(157,196,224,0.22)' : '#dce5ec'}`,
      borderRadius: 8,
      fontSize: 13,
      color: isDark ? '#e2e8f0' : '#132334',
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
    },
    labelStyle: { fontWeight: 600, color: isDark ? '#e2e8f0' : '#132334', marginBottom: 2 },
    itemStyle:  { color: isDark ? '#9cb0c4' : '#5f7282' },
    cursor:     { fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
  }), [isDark]);

  const handleBarClick = (data) => {
    if (!data?.fullName) return;
    setSpeciesValue({ label: data.fullName, value: data.fullName });
    setTableSpeciesFilter(data.fullName);
    setShowTable(true);
    setShowDatasetGraphs(true);
  };

  const panelStyle = {
    background: isDark ? 'rgba(12,22,36,0.82)' : '#f7fafc',
    borderRadius: 14,
    padding: '20px 22px',
    border: isDark ? '1px solid rgba(157,196,224,0.12)' : '1px solid #d8e2e8',
  };

  return (
    <div style={{ minHeight: '100vh', background: isDark ? '#0b1320' : '#f4f7f8' }}>
      <nav style={{
        background: isDark ? 'rgba(10,16,26,0.92)' : 'rgba(244,247,248,0.94)',
        padding: '14px 24px',
        boxShadow: isDark ? '0 1px 0 rgba(167,196,219,0.14)' : '0 1px 0 #d7e1e7',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto' }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 999,
              border: `1px solid ${isDark ? 'rgba(157,196,224,0.5)' : '#9bb6cb'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600,
              color: isDark ? '#c5d8e7' : '#3e5e78',
              fontFamily: 'Newsreader, Georgia, serif',
            }}>A</div>
            <div style={{
              fontWeight: 700, fontSize: 23,
              color: isDark ? '#e5edf7' : '#122538',
              letterSpacing: '0.01em',
              fontFamily: 'Newsreader, Georgia, serif',
            }}>ArcPP</div>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => navigate('/datasets')}
              style={{
                padding: '8px 14px',
                background: isDark ? 'rgba(157,196,224,0.14)' : '#e6eef4',
                color: isDark ? '#d6e6f2' : '#2f5675',
                fontWeight: 600, fontSize: 13,
                border: `1px solid ${isDark ? 'rgba(157,196,224,0.28)' : '#c4d3df'}`,
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              Browse Datasets
            </div>
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                background: isDark ? 'rgba(157,196,224,0.12)' : '#edf3f7',
                border: `1px solid ${isDark ? 'rgba(157,196,224,0.28)' : '#c7d6e1'}`,
                borderRadius: 8, cursor: 'pointer',
                fontSize: 11, color: isDark ? '#c4d8e8' : '#466783',
                fontWeight: 700, width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {isDark ? '☀' : '☾'}
            </button>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px' }}>
        <div style={{
          background: isDark
            ? 'linear-gradient(180deg, rgba(17,28,43,0.97), rgba(11,19,31,0.97))'
            : 'linear-gradient(180deg, #ffffff, #f7fafb)',
          borderRadius: 16,
          padding: '32px 36px',
          boxShadow: isDark ? '0 14px 28px rgba(3,9,16,0.44)' : '0 14px 28px rgba(17,39,58,0.08)',
          border: isDark ? '1px solid rgba(157,196,224,0.16)' : '1px solid #d7e1e7',
          marginBottom: 32,
        }}>
          <h1 style={{
            fontSize: 34, fontWeight: 700,
            color: isDark ? '#e7eef8' : '#132334',
            margin: 0, marginBottom: 6, lineHeight: 1.1,
            fontFamily: 'Newsreader, Georgia, serif',
          }}>
            Archaeal Proteome Project
          </h1>
          <p style={{ fontSize: 15, color: isDark ? '#9cb0c4' : '#5f7282', margin: '0 0 28px', maxWidth: 680, lineHeight: 1.5 }}>
            Explore protein coverage, modifications, and datasets across archaeal species.
          </p>

          <CoverageOverview
            coverageData={coverageData}
            coverageLoading={coverageLoading}
            selectedSpecies={selectedSpeciesStats}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            <div>
              <div style={controlLabelStyle}>Select a Species</div>
              <Autocomplete
                disablePortal
                options={speciesOptions}
                value={speciesValue}
                onChange={(e, v) => {
                  setSpeciesValue(v);
                  setShowTable(!!v);
                  setShowDatasetGraphs(!!v);
                  setTableSpeciesFilter(v?.value || '');
                }}
                renderInput={(params) => <TextField {...params} placeholder="Select species" sx={inputSx} />}
                isOptionEqualToValue={(option, value) => option.value === value.value}
                componentsProps={isDark ? { paper: { sx: { background: '#17223a', color: '#e6edf7', '& .MuiAutocomplete-option:hover': { background: 'rgba(255,255,255,0.08)' }, '& .MuiAutocomplete-option[aria-selected="true"]': { background: 'rgba(14,165,233,0.2)' } } } } : {}}
              />
            </div>
            <div>
              <div style={controlLabelStyle}>Search by Protein ID</div>
              <Autocomplete
                disablePortal
                options={options}
                value={picked}
                inputValue={searchInput}
                onInputChange={(_, v) => setSearchInput(v)}
                onChange={(e, v) => {
                  setPicked(v);
                  if (v?.value) navigate(`/plot/${v.value}`);
                }}
                loading={optLoading}
                filterOptions={(x) => x}
                noOptionsText={searchInput.trim().length < 2 ? 'Type at least 2 characters' : 'No matches'}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Enter Protein ID or UniProt ID"
                    sx={inputSx}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={isDark ? { color: '#89a2c0' } : {}} />
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
                isOptionEqualToValue={(option, value) => option.value === value.value}
                componentsProps={isDark ? { paper: { sx: { background: '#17223a', color: '#e6edf7', '& .MuiAutocomplete-option:hover': { background: 'rgba(255,255,255,0.08)' }, '& .MuiAutocomplete-option[aria-selected="true"]': { background: 'rgba(14,165,233,0.2)' } } } } : {}}
              />
            </div>
          </div>

          {speciesValue && coverageData.length > 0 && (
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>

              {/* Coverage bar chart */}
              <div style={panelStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: isDark ? '#e2e8f0' : '#132334', margin: '0 0 4px' }}>
                  Species Proteome Coverage
                </h3>
                <p style={{ fontSize: 12, color: isDark ? '#7a9ab5' : '#718493', margin: '0 0 12px' }}>
                  Click a bar to select species
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={coverageChartData} margin={{ top: 6, right: 6, bottom: 8, left: 4 }} barSize={36}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={<SpeciesTick fill={chartTickFill} />}
                      tickLine={false}
                      axisLine={{ stroke: chartAxisColor }}
                      interval={0}
                      height={44}
                    />
                    <YAxis
                      tick={{ fill: chartTickFill, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                      width={42}
                    />
                    <RechartsTip
                      {...tipStyle}
                      formatter={(value) => [`${value.toFixed(1)}%`, 'Coverage']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                    />
                    <Bar dataKey="value" radius={[5, 5, 0, 0]} onClick={handleBarClick} cursor="pointer">
                      {coverageChartData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.fullName === speciesValue?.value
                            ? '#5f88ad'
                            : isDark ? '#243d56' : '#a8c7de'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Proteins bar chart */}
              <div style={panelStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: isDark ? '#e2e8f0' : '#132334', margin: '0 0 4px' }}>
                  Identified Proteins by Species
                </h3>
                <p style={{ fontSize: 12, color: isDark ? '#7a9ab5' : '#718493', margin: '0 0 12px' }}>
                  Total proteins identified per species
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={proteinsChartData} margin={{ top: 6, right: 6, bottom: 8, left: 4 }} barSize={36}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={<SpeciesTick fill={chartTickFill} />}
                      tickLine={false}
                      axisLine={{ stroke: chartAxisColor }}
                      interval={0}
                      height={44}
                    />
                    <YAxis
                      tick={{ fill: chartTickFill, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => v.toLocaleString()}
                      width={52}
                    />
                    <RechartsTip
                      {...tipStyle}
                      formatter={(value) => [value.toLocaleString(), 'Proteins']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                    />
                    <Bar dataKey="value" radius={[5, 5, 0, 0]} onClick={handleBarClick} cursor="pointer">
                      {proteinsChartData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.fullName === speciesValue?.value
                            ? '#4f9b7e'
                            : isDark ? '#1c4a38' : '#8fcabb'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}

          {showDatasetGraphs && speciesValue && (
            <DatasetCharts
              datasetStats={datasetStats}
              datasetOverlap={datasetOverlap}
              selectedDatasets={selectedDatasets}
              setSelectedDatasets={setSelectedDatasets}
              selectedOverlaps={selectedOverlaps}
              setSelectedOverlaps={setSelectedOverlaps}
            />
          )}
        </div>
      </div>

      {showTable && speciesValue && (
        <ProteinTable
          tableSpeciesFilter={tableSpeciesFilter}
          setTableSpeciesFilter={setTableSpeciesFilter}
          processedRows={processedRows}
          tableSearch={tableSearch}
          setTableSearch={setTableSearch}
          tableLoading={tableLoading}
          tableError={tableError}
          total={total}
          page={page}
          totalPages={totalPages}
          fetchPage={fetchPage}
          onSort={onSort}
          sortIcon={sortIcon}
          speciesOptions={speciesOptions}
          selectedDatasets={selectedDatasets}
          selectedOverlaps={selectedOverlaps}
        />
      )}
    </div>
  );
}
