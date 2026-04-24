import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const DatasetsPage = lazy(() => import('./pages/DatasetsPage'));
const ProteinPlotPage = lazy(() => import('./pages/ProteinPlotPage'));

function RouteFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--app-bg, #f4f7f8)',
      color: '#5f88ad',
      fontFamily: 'Inter, -apple-system, sans-serif',
      fontSize: 14,
    }}>
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/plot/:hvoId" element={<ProteinPlotPage />} />
          </Routes>
        </Suspense>
      </Router>
    </ThemeProvider>
  );
}
