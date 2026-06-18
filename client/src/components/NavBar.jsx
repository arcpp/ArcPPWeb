import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../ThemeContext';

// Top navigation bar (Home / Datasets / About) with the light/dark theme toggle.
export default function NavBar() {
  const { isDark, toggleTheme } = useTheme();

  const link = {
    fontSize: 16,
    color: isDark ? '#9db4cf' : '#5d6f7e',
    textDecoration: 'none',
    fontWeight: 600,
    padding: '6px 2px',
    borderBottom: '2px solid transparent',
    transition: 'color 0.2s ease, border-color 0.2s ease',
  };
  const active = { color: isDark ? '#e6edf7' : '#13212f', borderBottomColor: isDark ? '#9dc4e0' : '#5f88ad' };

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 24px',
      borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#d7e1e7'}`,
      background: isDark ? 'rgba(10,16,26,0.92)' : 'rgba(244,247,248,0.94)',
      backdropFilter: 'blur(8px)',
    }}>
      <Link to="/" style={{ display: 'flex', gap: 8, alignItems: 'center', textDecoration: 'none' }}>
        <span style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: `1px solid ${isDark ? 'rgba(157,196,224,0.45)' : '#9bb6cb'}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          color: isDark ? '#c5d8e7' : '#3e5e78',
          fontFamily: 'Newsreader, Georgia, serif',
        }}>
          A
        </span>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: isDark ? '#e6edf7' : '#13212f', fontFamily: 'Newsreader, Georgia, serif' }}>ArcPP</div>
          <div style={{ fontSize: 12, color: isDark ? '#8da4bd' : '#687b8b', marginTop: 1, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Research Portal</div>
        </div>
      </Link>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <NavLink to="/" style={({ isActive }) => ({ ...link, ...(isActive ? active : null) })}>
          Home
        </NavLink>
        <NavLink to="/about" style={({ isActive }) => ({ ...link, ...(isActive ? active : null) })}>
          About
        </NavLink>
        <NavLink to="/datasets" style={({ isActive }) => ({ ...link, ...(isActive ? active : null) })}>
          Datasets
        </NavLink>
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: isDark ? 'rgba(157,196,224,0.12)' : '#edf3f7',
            border: `1px solid ${isDark ? 'rgba(157,196,224,0.28)' : '#c7d6e1'}`,
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDark ? '#c4d8e8' : '#466783',
            transition: 'all 0.2s ease',
          }}
        >
          {isDark ? '☀' : '☾'}
        </button>
      </div>
    </nav>
  );
}
