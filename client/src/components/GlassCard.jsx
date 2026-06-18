import React from 'react';

// Frosted "glass" card wrapper: optional title + children, light/dark variant.
export default function GlassCard({ title, children, style, className = '', variant = 'dark' }) {
  const isLight = variant === 'light';

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        borderRadius: 16,
        padding: isLight ? '16px 18px' : '20px 22px',
        background: isLight
          ? 'linear-gradient(180deg, #ffffff, #f6f9fb)'
          : 'linear-gradient(180deg, rgba(20,29,45,0.96), rgba(13,20,32,0.96))',
        border: `1px solid ${isLight ? '#dbe4ea' : 'rgba(198,218,236,0.14)'}`,
        boxShadow: isLight
          ? '0 10px 24px rgba(23, 42, 57, 0.08)'
          : '0 10px 24px rgba(2, 8, 18, 0.44)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {!isLight && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(160% 110% at 50% -20%, rgba(181,212,238,0.14), rgba(181,212,238,0) 56%)',
          }}
        />
      )}
      {title && (
        <div
          style={{
            position: 'relative',
            fontWeight: 600,
            color: isLight ? '#1b2d3f' : '#e6edf7',
            margin: isLight ? '4px 6px 12px 6px' : '0 0 12px 0',
          }}
        >
          {title}
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
