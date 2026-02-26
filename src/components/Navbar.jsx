import React from 'react';
import './Navbar.css';

export default function Navbar({ activePage, setActivePage }) {
    const navItems = [
        { id: 'home', label: 'Home', icon: '🏠' },
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'stressview', label: 'Stress-Vision', icon: '🔬' },
        { id: 'pipeline', label: 'Pipeline', icon: '⚡' },
        { id: 'alerts', label: 'Alerts', icon: '🚨' },
    ];

    return (
        <nav className="navbar" role="banner">
            <button className="navbar-brand" onClick={() => setActivePage('dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <OrbitalLogo />
                <div>
                    <div className="navbar-title">SkyFarm</div>
                    <div className="navbar-subtitle">Stress-Vision Platform</div>
                </div>
            </button>

            <ul className="navbar-nav" role="navigation">
                {navItems.map(item => (
                    <li key={item.id}>
                        <a
                            className={activePage === item.id ? 'active' : ''}
                            onClick={() => setActivePage(item.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && setActivePage(item.id)}
                            id={`nav-${item.id}`}
                        >
                            {item.icon} {item.label}
                        </a>
                    </li>
                ))}
            </ul>

            <div className="navbar-badge">
                <span className="live-dot" />
                LIVE · SDG 2
            </div>
        </nav>
    );
}

function OrbitalLogo() {
    return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#00e5ff" />
                    <stop offset="100%" stopColor="#00ff88" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                    <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
            {/* Planet */}
            <circle cx="18" cy="18" r="8" fill="url(#logoGrad)" opacity="0.9" filter="url(#glow)" />
            {/* Orbit ring */}
            <ellipse cx="18" cy="18" rx="16" ry="6" stroke="url(#logoGrad)" strokeWidth="1.5" fill="none" opacity="0.6" />
            {/* Satellite */}
            <g transform="rotate(-30, 18, 18)">
                <circle cx="34" cy="18" r="2.5" fill="#00e5ff" filter="url(#glow)" />
                <rect x="31.5" y="14.5" width="5" height="1.5" rx="0.5" fill="#00e5ff" opacity="0.7" />
                <rect x="31.5" y="20" width="5" height="1.5" rx="0.5" fill="#00e5ff" opacity="0.7" />
            </g>
            {/* Leaf */}
            <path d="M15 15 Q18 10 21 15 Q18 20 15 15Z" fill="#00ff88" opacity="0.85" />
        </svg>
    );
}
