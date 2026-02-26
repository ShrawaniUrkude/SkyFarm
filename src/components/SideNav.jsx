import React from 'react';

export default function SideNav({ activePage, setActivePage }) {
    const sections = [
        {
            label: 'Monitoring',
            items: [
                { id: 'home', icon: '🏠', label: 'Home', badge: null },
                { id: 'dashboard', icon: '📊', label: 'Overview', badge: null },
                { id: 'stressview', icon: '🌡️', label: 'Stress-Vision', badge: 'LIVE' },
                { id: 'pipeline', icon: '⚡', label: 'AI Pipeline', badge: null },
                { id: 'alerts', icon: '🚨', label: 'Alert Center', badge: '4' },
            ]
        },
        {
            label: 'Analysis',
            items: [
                { id: 'spectral', icon: '🔬', label: 'Spectral View', badge: 'NEW' },
                { id: 'history', icon: '📈', label: 'Time Series', badge: null },
                { id: 'compare', icon: '🗺️', label: 'Field Compare', badge: null },
            ]
        },
        {
            label: 'System',
            items: [
                { id: 'satellites', icon: '🛰️', label: 'Satellites', badge: null },
                { id: 'reports', icon: '📄', label: 'Reports', badge: null },
            ]
        }
    ];

    return (
        <aside className="side-nav" role="navigation" aria-label="Side navigation">
            {sections.map(section => (
                <div className="side-nav-section" key={section.label}>
                    <div className="side-nav-label">{section.label}</div>
                    {section.items.map(item => (
                        <button
                            key={item.id}
                            id={`sidenav-${item.id}`}
                            className={`side-nav-item ${activePage === item.id ? 'active' : ''}`}
                            onClick={() => setActivePage(item.id)}
                        >
                            <span className="side-nav-item-icon">{item.icon}</span>
                            <span className="side-nav-item-label">{item.label}</span>
                            {item.badge && (
                                <span className={`side-nav-item-badge ${item.badge === 'NEW' || item.badge === 'LIVE' ? 'new' : ''}`}>
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            ))}

            {/* Satellite status */}
            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <div className="side-nav-label">Satellite Status</div>
                {[
                    { name: 'Sentinel-2A', status: 'online', lat: '28.6°N' },
                    { name: 'Sentinel-2B', status: 'online', lat: '28.6°N' },
                    { name: 'ASTER', status: 'standby', lat: '14.2°N' },
                ].map(sat => (
                    <div key={sat.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        <span style={{
                            width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                            background: sat.status === 'online' ? 'var(--color-accent-green)' : 'var(--color-accent-orange)',
                            boxShadow: sat.status === 'online' ? '0 0 6px var(--color-accent-green-glow)' : 'none'
                        }} />
                        <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>{sat.name}</span>
                        <span style={{ color: sat.status === 'online' ? 'var(--color-accent-green)' : 'var(--color-accent-orange)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>{sat.status}</span>
                    </div>
                ))}
            </div>
        </aside>
    );
}
