import React from 'react';
import { FIELD_ZONES, SPECTRAL_BANDS, STRESS_COLORS } from '../utils/data';

/* Additional pages that are accessible from side nav but not primary tabs */

export function SpectralView() {
    return (
        <section className="page-section">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">🔬 Hyperspectral Analysis</div>
                    <h1 className="section-title">Spectral Band Explorer</h1>
                    <p className="section-desc">Explore reflectance values across all Sentinel-2 spectral bands and understand how each band contributes to stress detection.</p>
                </div>
            </div>

            <div className="grid-2">
                <div className="card">
                    <div className="card-header"><span className="card-title">📡 Sentinel-2 Band Reflectance</span></div>
                    {SPECTRAL_BANDS.map((band, i) => {
                        const pct = band.reflectance * 200;
                        const catColors = { VNIR: '#00ff88', 'Red-Edge': '#ffd60a', NIR: '#00e5ff', SWIR: '#ff6b2b' };
                        return (
                            <div key={band.band} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-muted)', width: '80px', flexShrink: 0 }}>{band.band}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', width: '120px', flexShrink: 0 }}>{band.name}</span>
                                <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: catColors[band.category], borderRadius: '4px', transition: 'width 1s ease', opacity: 0.85 }} />
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: catColors[band.category], width: '40px', textAlign: 'right' }}>{band.reflectance.toFixed(2)}</span>
                                <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', background: catColors[band.category] + '20', color: catColors[band.category], fontFamily: 'var(--font-mono)', width: '80px', textAlign: 'center', flexShrink: 0 }}>{band.category}</span>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="card">
                        <div className="card-header"><span className="card-title">🎯 Key Diagnostic Bands</span></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[
                                { bands: 'B4 + B8 (665/842nm)', purpose: 'NDVI — general vegetation health', status: 'Primary' },
                                { bands: 'B5–B7 (705–783nm)', purpose: 'Red-Edge — chlorophyll/N early warning', status: 'Critical' },
                                { bands: 'TIR (8–12μm)', purpose: 'LST — thermal stress, CWSI', status: 'Critical' },
                                { bands: 'B8A (865nm)', purpose: 'Narrow NIR — water stress', status: 'Secondary' },
                                { bands: 'B11 + B12 (SWIR)', purpose: 'NDWI — canopy water content', status: 'Secondary' },
                            ].map(d => (
                                <div key={d.bands} style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 700 }}>{d.bands}</span>
                                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', background: d.status === 'Critical' ? 'rgba(255,56,100,0.15)' : d.status === 'Primary' ? 'rgba(0,255,136,0.15)' : 'rgba(0,229,255,0.1)', color: d.status === 'Critical' ? '#ff3864' : d.status === 'Primary' ? '#00ff88' : 'var(--color-primary)' }}>{d.status}</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{d.purpose}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">🌡️ Land Surface Temperature</span></div>
                        {FIELD_ZONES.map(z => (
                            <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', width: '24px' }}>{z.id}</span>
                                <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${((z.lst - 28) / (44 - 28)) * 100}%`, height: '100%', background: `linear-gradient(90deg, #00e5ff, #ffd60a, #ff3864)`, opacity: 0.85 }} />
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: z.lst > 40 ? '#ff3864' : z.lst > 36 ? '#ff6b2b' : '#00ff88', fontWeight: 700, width: '48px', textAlign: 'right' }}>{z.lst}°C</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

export function TimeSeries() {
    return (
        <section className="page-section">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">📈 Historical Analytics</div>
                    <h1 className="section-title">Time Series Analysis</h1>
                    <p className="section-desc">Track vegetation health indices over time to identify stress onset and recovery patterns.</p>
                </div>
            </div>
            <div className="alert alert-info">
                <span className="alert-icon">📊</span>
                <div>Extended time series view is available in the Stress-Vision™ Viewer. Navigate to <strong>Stress-Vision → Spectral Signatures</strong> or the main Dashboard chart to see NDVI vs Stress trends.</div>
            </div>
        </section>
    );
}

export function Satellites() {
    const satellites = [
        { name: 'Sentinel-2A', agency: 'ESA', orbit: '705km SSO', swath: '290km', revisit: '10 days (5 with 2B)', res: '10/20/60m', bands: 13, status: 'online', lastPass: '26 Feb 2026 08:12 UTC' },
        { name: 'Sentinel-2B', agency: 'ESA', orbit: '705km SSO', swath: '290km', revisit: '10 days (5 with 2A)', res: '10/20/60m', bands: 13, status: 'online', lastPass: '26 Feb 2026 09:47 UTC' },
        { name: 'ASTER', agency: 'NASA/METI', orbit: '705km SSO', swath: '60km', revisit: '16 days', res: '15/30/90m', bands: 14, status: 'standby', lastPass: '25 Feb 2026 14:30 UTC' },
    ];

    return (
        <section className="page-section">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">🛰️ Constellation Status</div>
                    <h1 className="section-title">Active Satellites</h1>
                    <p className="section-desc">Real-time tracking of satellite constellation providing hyperspectral and thermal infrared data.</p>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {satellites.map(sat => (
                    <div key={sat.name} className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ fontSize: '2.5rem' }}>🛰️</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <span style={{ fontFamily: 'var(--font-primary)', fontSize: '1.1rem', fontWeight: 700 }}>{sat.name}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{sat.agency}</span>
                                    <span style={{ marginLeft: 'auto' }} className={`badge ${sat.status === 'online' ? 'badge-done' : 'badge-moderate'}`}>
                                        {sat.status === 'online' ? '● ' : '○ '}{sat.status.toUpperCase()}
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '10px' }}>
                                    {[
                                        { l: 'Orbit', v: sat.orbit }, { l: 'Swath', v: sat.swath }, { l: 'Revisit', v: sat.revisit },
                                        { l: 'Resolution', v: sat.res }, { l: 'Bands', v: sat.bands }, { l: 'Last Pass', v: sat.lastPass }
                                    ].map(({ l, v }) => (
                                        <div key={l} style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{v}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function Reports() {
    return (
        <section className="page-section">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">📄 Analytics Reports</div>
                    <h1 className="section-title">Stress Reports</h1>
                    <p className="section-desc">Auto-generated crop stress analysis reports for stakeholders and agronomists.</p>
                </div>
                <button className="btn btn-primary btn-sm">⬇ Export PDF</button>
            </div>
            <div className="grid-2">
                {[
                    { title: 'Weekly Stress Summary', date: 'Feb 17–23, 2026', zones: 6, critical: 2, status: 'Ready', size: '2.4 MB' },
                    { title: 'Pre-Visual Detection Report', date: 'Feb 24, 2026', zones: 3, critical: 3, status: 'Ready', size: '1.8 MB' },
                    { title: 'Spectral Analysis Deep-Dive', date: 'Feb 15, 2026', zones: 6, critical: 1, status: 'Ready', size: '5.1 MB' },
                    { title: 'Monthly AgriOps Briefing', date: 'Jan 2026', zones: 6, critical: 0, status: 'Draft', size: '3.2 MB' },
                ].map(r => (
                    <div key={r.title} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{ fontSize: '2rem' }}>📄</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-primary)' }}>{r.title}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>{r.date}</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(0,229,255,0.1)', color: 'var(--color-primary)', borderRadius: '20px' }}>{r.zones} zones</span>
                                {r.critical > 0 && <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,56,100,0.1)', color: '#ff3864', borderRadius: '20px' }}>{r.critical} critical</span>}
                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: r.status === 'Ready' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)', color: r.status === 'Ready' ? '#00ff88' : 'var(--color-text-muted)', borderRadius: '20px' }}>{r.status}</span>
                                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{r.size}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function FieldCompare() {
    return (
        <section className="page-section">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">🗺️ Side-by-Side Comparison</div>
                    <h1 className="section-title">Field Comparison</h1>
                </div>
            </div>
            <div className="grid-2">
                {FIELD_ZONES.slice(0, 4).map(z => (
                    <div key={z.id} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 700, fontSize: '1rem' }}>{z.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{z.crop}</div>
                            </div>
                            <span className={`badge badge-${z.stressLevel}`}>{z.stressLevel}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {[['NDVI', z.ndvi], ['LST', `${z.lst}°C`], ['Water', `${z.waterContent}%`], ['N-Idx', z.nitrogenIndex]].map(([l, v]) => (
                                <div key={l} style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{l}</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: z.stressLevel === 'severe' ? '#ff3864' : z.stressLevel === 'high' ? '#ff6b2b' : '#00ff88' }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
