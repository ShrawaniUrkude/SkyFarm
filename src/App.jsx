import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import SideNav from './components/SideNav';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import StressView from './pages/StressView';
import Pipeline from './pages/Pipeline';
import AlertCenter from './pages/AlertCenter';
import { SpectralView, TimeSeries, Satellites, Reports, FieldCompare } from './pages/ExtraPages';

/* ─── Star Field ─────────────────────────────────────────────────────────── */
function StarField() {
  return (
    <div className="star-field" aria-hidden="true">
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="bgGlow1" cx="30%" cy="20%" r="40%">
            <stop offset="0%" stopColor="rgba(0,229,255,0.04)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="bgGlow2" cx="70%" cy="70%" r="40%">
            <stop offset="0%" stopColor="rgba(0,255,136,0.03)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgGlow1)" />
        <rect width="100%" height="100%" fill="url(#bgGlow2)" />
      </svg>
    </div>
  );
}

/* ─── App ───────────────────────────────────────────────────────────────── */
export default function App() {
  const [activePage, setActivePage] = useState('home');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Simulate brief loading splash
    const t = setTimeout(() => setIsLoaded(true), 600);
    return () => clearTimeout(t);
  }, []);

  if (!isLoaded) {
    return <LoadingSplash />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'home': return <Home setActivePage={setActivePage} />;
      case 'dashboard': return <Dashboard setActivePage={setActivePage} />;
      case 'stressview': return <StressView />;
      case 'pipeline': return <Pipeline />;
      case 'alerts': return <AlertCenter />;
      case 'spectral': return <SpectralView />;
      case 'history': return <TimeSeries />;
      case 'compare': return <FieldCompare />;
      case 'satellites': return <Satellites />;
      case 'reports': return <Reports />;
      default: return <Home setActivePage={setActivePage} />;
    }
  };

  return (
    <div id="app-root">
      <StarField />
      <Navbar activePage={activePage} setActivePage={setActivePage} />
      <SideNav activePage={activePage} setActivePage={setActivePage} />
      <main className="main-content" role="main">
        {renderPage()}
      </main>
      <footer className="footer" role="contentinfo">
        <div className="footer-left">
          © 2026 SkyFarm · Stress-Vision™ — Advancing SDG 2: Zero Hunger
        </div>
        <div className="footer-links">
          <a href="#" onClick={e => { e.preventDefault(); setActivePage('pipeline'); }}>Pipeline Docs</a>
          <a href="#" onClick={e => { e.preventDefault(); setActivePage('satellites'); }}>Satellites</a>
          <a href="#" onClick={e => { e.preventDefault(); setActivePage('reports'); }}>Reports</a>
          <a href="https://sdgs.un.org/goals/goal2" target="_blank" rel="noreferrer">UN SDG 2 ↗</a>
        </div>
      </footer>
    </div>
  );
}

function LoadingSplash() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--color-bg-deep)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '24px',
    }}>
      {/* Orbital animation */}
      <div style={{ position: 'relative', width: '120px', height: '120px' }}>
        <svg viewBox="0 0 120 120" width="120" height="120">
          <defs>
            <linearGradient id="splashGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00e5ff" />
              <stop offset="100%" stopColor="#00ff88" />
            </linearGradient>
          </defs>
          {/* Planet */}
          <circle cx="60" cy="60" r="20" fill="url(#splashGrad)" opacity="0.9" />
          {/* Orbit ring */}
          <ellipse cx="60" cy="60" rx="50" ry="18" stroke="url(#splashGrad)" strokeWidth="1.5" fill="none" opacity="0.4" />
          {/* Spinning satellite */}
          <g style={{ animation: 'spin 2.5s linear infinite', transformOrigin: '60px 60px' }}>
            <circle cx="110" cy="60" r="5" fill="#00e5ff" />
            <rect x="103" y="53" width="14" height="3" rx="1" fill="#00e5ff" opacity="0.6" />
            <rect x="103" y="63" width="14" height="3" rx="1" fill="#00e5ff" opacity="0.6" />
          </g>
        </svg>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-primary)', fontSize: '1.4rem', fontWeight: 800,
          background: 'linear-gradient(135deg, #00e5ff, #00ff88)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: '6px',
        }}>
          SkyFarm
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          Initializing Stress-Vision™ Platform…
        </div>
      </div>

      {/* Loading bar */}
      <div style={{ width: '200px', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '100px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #00e5ff, #00ff88)',
          borderRadius: '100px',
          animation: 'loadBar 0.6s ease-out forwards',
        }} />
      </div>

      <style>{`
        @keyframes loadBar {
          from { width: 0; }
          to   { width: 100%; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
