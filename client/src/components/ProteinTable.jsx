// Home-page protein table for the selected species: paginated + searchable, with
// dataset/overlap filters. Each row links to that protein's plot page.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TextField,
  InputAdornment,
  Tooltip,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DownloadIcon from '@mui/icons-material/Download';
import { useTheme } from '../ThemeContext';

export default function ProteinTable({
  tableSpeciesFilter,
  setTableSpeciesFilter,
  processedRows,
  tableSearch,
  setTableSearch,
  tableLoading,
  tableError,
  total,
  page,
  totalPages,
  fetchPage,
  onSort,
  sortIcon,
  speciesOptions = [],
  selectedDatasets,
  selectedOverlaps,
}) {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const borderColor = isDark ? 'rgba(159,195,222,0.14)' : '#d8e2e8';
  const rowBorder = isDark ? 'rgba(159,195,222,0.12)' : '#e8eff3';
  const headerColor = isDark ? '#9cb0c4' : '#5f7282';
  const mutedColor = isDark ? '#9cb0c4' : '#5f7282';
  const textColor = isDark ? '#e6edf7' : '#132334';
  const descColor = isDark ? '#9cb0c4' : '#4f6375';

  const muiInputSx = isDark ? {
    '& .MuiOutlinedInput-root': {
      background: '#17223a',
      color: '#e6edf7',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
      '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
      '&.Mui-focused fieldset': { borderColor: '#0ea5e9' },
    },
    '& .MuiInputBase-input': { color: '#e6edf7' },
    '& .MuiInputBase-input::placeholder': { color: '#89a2c0', opacity: 1 },
    '& .MuiInputAdornment-root .MuiSvgIcon-root': { color: '#89a2c0' },
  } : {};

  const muiSelectSx = isDark ? {
    background: '#17223a',
    color: '#e6edf7',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#0ea5e9' },
    '& .MuiSvgIcon-root': { color: '#89a2c0' },
  } : {};

  const muiLabelSx = isDark ? {
    color: '#89a2c0',
    '&.Mui-focused': { color: '#0ea5e9' },
  } : {};

  const downloadCSV = () => {
    const headers = ['UniProt ID', 'Protein ID', 'Peptides', 'Coverage (%)', 'Datasets', 'Modifications', 'Description'];
    const csvRows = [headers.join(',')];
    processedRows.forEach(r => {
      const datasets = Array.isArray(r.datasets) ? r.datasets.join('; ') : '';
      const modifications = Array.isArray(r.modifications) ? r.modifications.join('; ') : '';
      const description = (r.description || '').replace(/,/g, ';');
      const uniProt = r.uniProtId || r.hvoId || '';
      csvRows.push([uniProt, r.hvoId || '', r.psm_count ?? '', Number.isFinite(r.coveragePercent) ? r.coveragePercent.toFixed(1) : '', datasets, modifications, description].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `proteins_${tableSpeciesFilter.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{
      maxWidth: 1150,
      margin: '0 auto 40px auto',
      background: isDark ? 'rgba(14,24,37,0.96)' : 'linear-gradient(180deg, #ffffff, #f7fafb)',
      borderRadius: 16,
      boxShadow: isDark ? '0 12px 26px rgba(3,9,16,0.44)' : '0 12px 26px rgba(17,39,58,0.08)',
      border: `1px solid ${borderColor}`,
      overflow: 'hidden',
    }}>
      {/* Table header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 18px',
        gap: 12,
        flexWrap: 'wrap',
        borderBottom: `1px solid ${borderColor}`,
        background: isDark ? 'rgba(12,20,32,0.68)' : '#f8fbfc',
      }}>
        <div style={{ fontWeight: 700, color: textColor, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Proteins</span>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel sx={muiLabelSx}>Filter by Species</InputLabel>
            <Select
              value={tableSpeciesFilter}
              label="Filter by Species"
              onChange={(e) => setTableSpeciesFilter(e.target.value)}
              sx={{ ...muiSelectSx, fontStyle: 'italic' }}
              MenuProps={isDark ? {
                PaperProps: {
                  sx: { background: '#17223a', color: '#e6edf7', '& .MuiMenuItem-root:hover': { background: 'rgba(255,255,255,0.08)' } }
                }
              } : {}}
            >
              {(speciesOptions.length > 0 ? speciesOptions : [{ label: 'Haloferax volcanii', value: 'Haloferax volcanii' }]).map((species) => (
                <MenuItem key={species.value} value={species.value} sx={{ fontStyle: 'italic' }}>{species.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <TextField
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Search all proteins..."
            size="small"
            sx={muiInputSx}
            InputProps={{
              startAdornment: (<InputAdornment position="start"><SearchIcon sx={isDark ? { color: '#89a2c0' } : {}} /></InputAdornment>),
              endAdornment: tableLoading && tableSearch ? (
                <InputAdornment position="end">
                  <div style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600 }}>Searching...</div>
                </InputAdornment>
              ) : null
            }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={downloadCSV}
            disabled={processedRows.length === 0}
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

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '120px 120px 80px 100px 180px 180px 1fr',
        gap: 12,
        padding: '10px 18px',
        color: headerColor,
        borderBottom: `1px solid ${rowBorder}`,
        fontWeight: 600,
        background: isDark ? 'rgba(12,18,34,0.4)' : 'transparent',
      }}>
        <div style={{ cursor: 'pointer' }} onClick={() => onSort('uniProtId')}>UniProt ID {sortIcon('uniProtId')}</div>
        <div style={{ cursor: 'pointer' }} onClick={() => onSort('hvoId')}>Protein ID {sortIcon('hvoId')}</div>
        <div style={{ cursor: 'pointer' }} onClick={() => onSort('psm_count')}>Peptides {sortIcon('psm_count')}</div>
        <div style={{ cursor: 'pointer' }} onClick={() => onSort('coveragePercent')}>Coverage {sortIcon('coveragePercent')}</div>
        <div>Datasets</div>
        <div>Modifications</div>
        <div>Description</div>
      </div>

      {tableLoading ? (
        <div style={{ padding: 18, color: mutedColor }}>Loading...</div>
      ) : tableError ? (
        <div style={{ padding: 18, color: '#b91c1c' }}>{tableError}</div>
      ) : processedRows.length === 0 ? (
        <div style={{ padding: 18, color: mutedColor }}>No rows.</div>
      ) : (
        processedRows.map((r) => {
          const datasets = Array.isArray(r.datasets) && r.datasets.length ? r.datasets : [];
          const displayDatasets = datasets.slice(0, 2);
          const moreDatasetCount = datasets.length - 2;
          const modifications = Array.isArray(r.modifications) && r.modifications.length ? r.modifications : [];
          const displayMods = modifications.slice(0, 2);
          const moreModCount = modifications.length - 2;

          return (
            <div
              key={r.hvoId}
              onClick={() => navigate(`/plot/${r.hvoId}`)}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 120px 80px 100px 180px 180px 1fr',
                gap: 12,
                padding: '12px 18px',
                borderBottom: `1px solid ${rowBorder}`,
                alignItems: 'center',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                color: textColor,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ fontSize: 14 }}>
                {(() => {
                  const accession = r.uniProtId || r.hvoId;
                  return accession ? (
                    <span style={{ color: isDark ? '#7dd3fc' : '#0369a1', textDecoration: 'underline', fontWeight: 600 }}>
                      {accession}
                    </span>
                  ) : '\u2014';
                })()}
              </div>
              <div>
                <span style={{ color: isDark ? '#a9c9df' : '#325f86', fontWeight: 600 }}>
                  {r.hvoId}
                </span>
              </div>
              <div style={{ fontSize: 14, color: textColor }}>{r.psm_count ?? '\u2014'}</div>
              <div style={{ fontSize: 14, color: textColor }}>
                {Number.isFinite(r.coveragePercent) ? `${r.coveragePercent.toFixed(1)}%` : '\u2014'}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {datasets.length === 0 ? (
                  <span style={{ fontSize: 14, color: mutedColor }}>{'\u2014'}</span>
                ) : (
                  <>
                    {displayDatasets.map((ds, idx) => (
                      <Chip key={idx} label={ds} size="small" sx={{
                        height: 22, fontSize: 11, fontWeight: 500,
                        backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe',
                        color: isDark ? '#7dd3fc' : '#0369a1',
                      }} />
                    ))}
                    {moreDatasetCount > 0 && (
                      <Tooltip title={<div style={{ padding: 4 }}>{datasets.slice(2).map((ds, idx) => (<div key={idx} style={{ padding: '2px 0', fontSize: 12 }}>{ds}</div>))}</div>} arrow placement="top">
                        <span style={{ fontSize: 11, color: isDark ? '#60a5fa' : '#3366ff', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                          +{moreDatasetCount} more
                        </span>
                      </Tooltip>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {modifications.length === 0 ? (
                  <span style={{ fontSize: 14, color: mutedColor }}>{'\u2014'}</span>
                ) : (
                  <>
                    {displayMods.map((mod, idx) => (
                      <Chip key={idx} label={mod} size="small" sx={{
                        height: 22, fontSize: 11, fontWeight: 500,
                        backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : '#fef3c7',
                        color: isDark ? '#fcd34d' : '#92400e',
                      }} />
                    ))}
                    {moreModCount > 0 && (
                      <Tooltip title={<div style={{ padding: 4 }}>{modifications.slice(2).map((mod, idx) => (<div key={idx} style={{ padding: '2px 0', fontSize: 12 }}>{mod}</div>))}</div>} arrow placement="top">
                        <span style={{ fontSize: 11, color: isDark ? '#fcd34d' : '#92400e', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                          +{moreModCount} more
                        </span>
                      </Tooltip>
                    )}
                  </>
                )}
              </div>

              <div style={{
                fontSize: 14, color: descColor, lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis',
              }} title={r.description || ''}>
                {r.description || '\u2014'}
              </div>
            </div>
          );
        })
      )}

      {/* Pagination */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 12px',
        borderTop: `1px solid ${rowBorder}`,
        background: isDark ? 'rgba(12,18,34,0.4)' : 'transparent',
      }}>
        <IconButton
          onClick={() => fetchPage(page - 1, tableSearch, tableSpeciesFilter, selectedDatasets, selectedOverlaps)}
          disabled={page <= 1 || tableLoading}
          size="small"
          sx={isDark ? { color: '#89a2c0', '&.Mui-disabled': { color: 'rgba(255,255,255,0.2)' } } : {}}
        >
          <ChevronLeftIcon />
        </IconButton>
        <div style={{ fontSize: 14, color: mutedColor }}>
          Page {page} / {totalPages} - Showing {processedRows.length} of {total}
        </div>
        <IconButton
          onClick={() => fetchPage(page + 1, tableSearch, tableSpeciesFilter, selectedDatasets, selectedOverlaps)}
          disabled={page >= totalPages || tableLoading}
          size="small"
          sx={isDark ? { color: '#89a2c0', '&.Mui-disabled': { color: 'rgba(255,255,255,0.2)' } } : {}}
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
    </div>
  );
}
