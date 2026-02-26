import React, { useState, useEffect } from 'react';
import './Navbar.css';
import { ALERTS } from '../utils/data';

/* ─── Emergency ticker items = alerts with a destructionTime ──────────────── */
const EMERGENCY_ALERTS = ALERTS.filter(a => a.destructionTime);

export default function Navbar({ activePage, setActivePage }) {
    const navItems = [
        { id: 'home',      label: 'Home',          icon: '🏠' },
        { id: 'analyze',   label: 'Analyze Field',  icon: '🛰️' },
        { id: 'nutrients', label: 'Nutrients',       icon: '🌿' },
        { id: 'water',     label: 'Water Level',     icon: '💧' },
        { id: 'globalops', label: 'Global Ops',      icon: '🌍' },
        { id: 'pipeline',  label: 'Pipeline',        icon: '⚡' },
        { id: 'alerts',    label: 'Alerts',          icon: '🚨' },
    ];

    const criticalCount = ALERTS.filter(a => a.severity === 'critical').length;

    return (
        <div style={{ position: 'sticky', top: 0, zIndex: 1000 }}>
            {/* ── Main Nav (exact structure from reference) ── */}
            <nav className="navbar" role="banner" style={{ position: 'relative', zIndex: 2 }}>
                <button className="navbar-brand" onClick={() => setActivePage('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                                style={{ position: 'relative' }}
                            >
                                {/* Critical badge on Alerts */}
                                {item.id === 'alerts' && criticalCount > 0 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-10px',
                                        background: '#ff3864',
                                        color: '#fff',
                                        borderRadius: '50%',
                                        width: '16px',
                                        height: '16px',
                                        fontSize: '0.6rem',
                                        fontWeight: 900,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        animation: 'ping 1.2s ease infinite',
                                        fontFamily: 'var(--font-mono)',
                                    }}>{criticalCount}</span>
                                )}
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

            {/* ── Emergency Alert Ticker ── */}
            {EMERGENCY_ALERTS.length > 0 && (
                <EmergencyTicker alerts={EMERGENCY_ALERTS} setActivePage={setActivePage} />
            )}
        </div>
    );
}

/* ─── Scrolling emergency ticker bar ─────────────────────────────────────── */
function EmergencyTicker({ alerts, setActivePage }) {
    const [activeIdx, setActiveIdx] = useState(0);
    const [visible, setVisible] = useState(true);

    // Rotate through emergency alerts every 5 seconds
    useEffect(() => {
        if (alerts.length <= 1) return;
        const t = setInterval(() => {
            setActiveIdx(i => (i + 1) % alerts.length);
        }, 5000);
        return () => clearInterval(t);
    }, [alerts.length]);

    if (!visible) return null;

    const alert = alerts[activeIdx];
    const isCritical = alert.severity === 'critical';
    const urgencyColor = isCritical ? '#ff3864' : '#ff6b2b';

    return (
        <div
            id="emergency-alert-ticker"
            role="alert"
            aria-live="assertive"
            style={{
                width: '100%',
                background: isCritical
                    ? 'linear-gradient(90deg, rgba(255,56,100,0.18) 0%, rgba(20,0,8,0.95) 40%, rgba(20,0,8,0.95) 60%, rgba(255,56,100,0.18) 100%)'
                    : 'linear-gradient(90deg, rgba(255,107,43,0.18) 0%, rgba(15,8,0,0.95) 40%, rgba(15,8,0,0.95) 60%, rgba(255,107,43,0.18) 100%)',
                borderBottom: `1px solid ${urgencyColor}44`,
                borderTop: `2px solid ${urgencyColor}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0',
                minHeight: '38px',
                overflow: 'hidden',
                position: 'relative',
                backdropFilter: 'blur(10px)',
                zIndex: 1,
            }}
        >
            {/* Left label badge */}
            <div style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0 16px',
                height: '38px',
                background: urgencyColor,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
            }}>
                <span style={{ animation: 'ping 1s ease infinite', display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />
                {isCritical ? '⚠ EMERGENCY' : '⚠ WARNING'}
            </div>

            {/* Scrolling ticker content */}
            <div style={{
                flex: 1,
                overflow: 'hidden',
                position: 'relative',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
            }}>
                <div
                    key={activeIdx}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '32px',
                        paddingLeft: '24px',
                        whiteSpace: 'nowrap',
                        animation: 'tickerScroll 18s linear infinite',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.76rem',
                        color: '#fff',
                    }}
                >
                    {/* Crop + zone */}
                    <span style={{ color: urgencyColor, fontWeight: 700 }}>
                        🌾 Zone {alert.zone} — {alert.crop}
                    </span>

                    {/* Alert type */}
                    <span style={{ color: 'rgba(255,255,255,0.8)' }}>
                        {alert.type}: {alert.message}
                    </span>

                    {/* Separator */}
                    <span style={{ color: urgencyColor, opacity: 0.5 }}>◆</span>

                    {/* Tentative destruction time — key info */}
                    <span style={{
                        background: `${urgencyColor}22`,
                        border: `1px solid ${urgencyColor}66`,
                        borderRadius: '4px',
                        padding: '2px 10px',
                        color: urgencyColor,
                        fontWeight: 900,
                        fontSize: '0.74rem',
                        letterSpacing: '0.05em',
                    }}>
                        🕐 ESTIMATED {alert.destructionLabel} IN: {alert.destructionTime}
                    </span>

                    {/* Separator */}
                    <span style={{ color: urgencyColor, opacity: 0.5 }}>◆</span>

                    {/* Action prompt */}
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                        Immediate action required to prevent loss —
                    </span>
                    <span style={{ color: '#00e5ff', fontWeight: 700, cursor: 'pointer' }}
                        onClick={() => setActivePage('alerts')}>
                        → View Alert Center
                    </span>

                    {/* Repeat for seamless loop */}
                    <span style={{ color: urgencyColor, opacity: 0.3, marginLeft: '48px' }}>⬤</span>
                    <span style={{ color: urgencyColor, fontWeight: 700 }}>
                        🌾 Zone {alert.zone} — {alert.crop}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.8)' }}>
                        {alert.type}: {alert.message}
                    </span>
                    <span style={{ color: urgencyColor, opacity: 0.5 }}>◆</span>
                    <span style={{
                        background: `${urgencyColor}22`,
                        border: `1px solid ${urgencyColor}66`,
                        borderRadius: '4px',
                        padding: '2px 10px',
                        color: urgencyColor,
                        fontWeight: 900,
                        fontSize: '0.74rem',
                    }}>
                        🕐 ESTIMATED {alert.destructionLabel} IN: {alert.destructionTime}
                    </span>
                </div>
            </div>

            {/* Alert counter (e.g. 1/2) */}
            {alerts.length > 1 && (
                <div style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.45)',
                }}>
                    {alerts.map((_, i) => (
                        <div
                            key={i}
                            onClick={() => setActiveIdx(i)}
                            style={{
                                width: i === activeIdx ? '18px' : '6px',
                                height: '6px',
                                borderRadius: '100px',
                                background: i === activeIdx ? urgencyColor : 'rgba(255,255,255,0.2)',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Dismiss button */}
            <button
                id="dismiss-ticker"
                aria-label="Dismiss emergency alert ticker"
                onClick={() => setVisible(false)}
                style={{
                    flexShrink: 0,
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: '0 14px',
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
            >
                ✕
            </button>

            <style>{`
                @keyframes tickerScroll {
                    0%   { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>
        </div>
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
