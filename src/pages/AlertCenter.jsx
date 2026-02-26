import React, { useState } from 'react';
import { ALERTS, FIELD_ZONES, STRESS_COLORS } from '../utils/data';

const SEVERITY_ICONS = { critical: '🚨', warning: '⚠️', info: 'ℹ️', success: '✅' };
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, success: 3 };

const ALL_ALERTS = [
    ...ALERTS,
    { id: 'A005', zone: 'Z2', severity: 'info', type: 'N Deficiency Watch', message: 'Red-edge index slightly below seasonal baseline. Monitor nitrogen inputs.', time: '2d ago', previsual: true },
    { id: 'A006', zone: 'Z5', severity: 'success', type: 'Irrigation Complete', message: 'Zone Z5 irrigation complete. Soil moisture restored to optimal level.', time: '3d ago', previsual: false },
    { id: 'A007', zone: 'Z3', severity: 'warning', type: 'Wind Desiccation', message: 'High wind event combined with low humidity — monitor for desiccation stress.', time: '4d ago', previsual: true },
    { id: 'A008', zone: 'Z6', severity: 'critical', type: 'Early Blight Risk', message: 'Crop Water Stress Index > 0.8 combined with high humidity — disease risk elevated.', time: '5d ago', previsual: false },
];

const RECOMMENDATIONS = [
    { zone: 'Z1', priority: 1, action: 'Immediate Irrigation', detail: 'Apply 45mm water deficit irrigation within 24 hours. Recommend drip system at 0.4m depth.', icon: '💧', effort: 'High' },
    { zone: 'Z6', priority: 2, action: 'Foliar Cooling', detail: 'Apply reflective kaolin clay spray to reduce canopy temperature by 3–5°C.', icon: '🌡️', effort: 'Medium' },
    { zone: 'Z4', priority: 3, action: 'Nitrogenous Top-Dress', detail: 'Apply 60 kg/ha urea or equivalent liquid N fertilizer within 5 days.', icon: '🌿', effort: 'Medium' },
    { zone: 'Z2', priority: 4, action: 'Soil Moisture Monitor', detail: 'Install additional tensiometers in zone center. Increase monitoring frequency to 6h.', icon: '📊', effort: 'Low' },
];

export default function AlertCenter() {
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState('severity');
    const [dismissed, setDismissed] = useState(new Set());

    const filtered = ALL_ALERTS
        .filter(a => !dismissed.has(a.id))
        .filter(a => filter === 'all' || a.severity === filter || (filter === 'previsual' && a.previsual))
        .sort((a, b) => sortBy === 'severity' ? SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] : 0);

    const counts = {
        critical: ALL_ALERTS.filter(a => a.severity === 'critical').length,
        warning: ALL_ALERTS.filter(a => a.severity === 'warning').length,
        previsual: ALL_ALERTS.filter(a => a.previsual).length,
    };

    return (
        <section className="page-section" id="alerts-page">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">🚨 Intelligent Alert Management</div>
                    <h1 className="section-title">Alert Center</h1>
                    <p className="section-desc">AI-generated crop stress alerts with pre-visual detection. Act before the damage is visible to save yield.</p>
                </div>
            </div>

            {/* ── EMERGENCY DESTRUCTION TIMELINE PANEL ───────────────── */}
            {ALL_ALERTS.filter(a => a.destructionTime).length > 0 && (
                <div style={{
                    marginBottom: '28px',
                    borderRadius: '16px',
                    border: '1.5px solid rgba(255,56,100,0.45)',
                    background: 'linear-gradient(135deg, rgba(255,56,100,0.07) 0%, rgba(10,5,15,0.9) 100%)',
                    overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '14px 24px',
                        background: 'rgba(255,56,100,0.1)',
                        borderBottom: '1px solid rgba(255,56,100,0.25)',
                    }}>
                        <span style={{ fontSize: '1.2rem', animation: 'ping 1.2s ease infinite', display: 'inline-block' }}>🚨</span>
                        <div>
                            <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 800, fontSize: '0.95rem', color: '#ff3864', letterSpacing: '-0.01em' }}>
                                CROP DESTRUCTION TIMELINE — IMMEDIATE ACTION REQUIRED
                            </div>
                            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                                AI-estimated time until irreversible crop damage if no intervention is made
                            </div>
                        </div>
                    </div>

                    {/* Alert rows */}
                    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {ALL_ALERTS.filter(a => a.destructionTime && !dismissed.has(a.id)).map(alert => {
                            const urgColor = alert.severity === 'critical' ? '#ff3864' : '#ff6b2b';
                            const barPct = Math.min(100, Math.max(5, 100 - (alert.hoursLeft / 120) * 100));
                            return (
                                <div key={alert.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '16px',
                                    padding: '14px 18px',
                                    borderRadius: '12px',
                                    background: `${urgColor}0d`,
                                    border: `1px solid ${urgColor}33`,
                                }}>
                                    {/* Crop + zone */}
                                    <div style={{ minWidth: '120px' }}>
                                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--color-text-primary)', fontFamily: 'var(--font-primary)' }}>
                                            🌾 {alert.crop}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                            Zone {alert.zone} · {alert.type}
                                        </div>
                                    </div>

                                    {/* Progress bar (urgency) */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ height: '6px', borderRadius: '100px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${barPct}%`,
                                                borderRadius: '100px',
                                                background: `linear-gradient(90deg, ${urgColor}88, ${urgColor})`,
                                                transition: 'width 0.6s ease',
                                            }} />
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                                            Risk level: {barPct.toFixed(0)}%
                                        </div>
                                    </div>

                                    {/* Destruction time badge — KEY INFO */}
                                    <div style={{
                                        flexShrink: 0,
                                        textAlign: 'center',
                                        padding: '8px 18px',
                                        borderRadius: '10px',
                                        background: `${urgColor}18`,
                                        border: `1.5px solid ${urgColor}55`,
                                        minWidth: '140px',
                                    }}>
                                        <div style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: urgColor, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
                                            🕐 {alert.destructionLabel}
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: 'var(--font-primary)', color: urgColor, letterSpacing: '-0.02em' }}>
                                            {alert.destructionTime}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                                            without intervention
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Alert summary metrics */}
            <div className="grid-4" style={{ marginBottom: '24px' }}>
                {[
                    { label: 'Critical Alerts', val: counts.critical, color: '#ff3864', icon: '🚨', sub: 'Require immediate action' },
                    { label: 'Warnings', val: counts.warning, color: '#ffd60a', icon: '⚠️', sub: 'Monitor within 48h' },
                    { label: 'Pre-Visual Detected', val: counts.previsual, color: '#00e5ff', icon: '🔬', sub: 'Before visible stress' },
                    { label: 'Zones Affected', val: 4, color: '#ff6b2b', icon: '📍', sub: 'Out of 6 monitored' },
                ].map(m => (
                    <div key={m.label} className="metric-card" style={{ '--metric-color': m.color }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div className="metric-label">{m.label}</div>
                            <span style={{ fontSize: '1.3rem' }}>{m.icon}</span>
                        </div>
                        <div className="metric-value" style={{ fontSize: '2.4rem', color: m.color }}>{m.val}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{m.sub}</div>
                    </div>
                ))}
            </div>

            <div className="grid-2" style={{ gap: '20px', alignItems: 'start' }}>
                {/* Alert list */}
                <div>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div className="tabs" style={{ flex: 1 }}>
                            {['all', 'critical', 'warning', 'info', 'previsual'].map(f => (
                                <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)} id={`alert-filter-${f}`}>
                                    {f === 'previsual' ? '🔬 Pre-Visual' : f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {filtered.map(alert => (
                            <div key={alert.id} className={`alert alert-${alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : alert.severity === 'success' ? 'success' : 'info'}`}
                                style={{ position: 'relative' }}>
                                <span className="alert-icon" style={{ fontSize: '1.4rem' }}>{SEVERITY_ICONS[alert.severity]}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>[{alert.id}] {alert.type}</span>
                                        {alert.previsual && <span className="badge badge-running" style={{ fontSize: '0.6rem' }}>🔬 PRE-VISUAL</span>}
                                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{alert.time}</span>
                                    </div>
                                    <p style={{ margin: '0 0 6px', fontSize: '0.82rem', lineHeight: 1.5 }}>{alert.message}</p>

                                    {/* ── Destruction Time Pill ── */}
                                    {alert.destructionTime && (
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                                            margin: '4px 0 8px',
                                            padding: '5px 14px',
                                            borderRadius: '8px',
                                            background: alert.severity === 'critical' ? 'rgba(255,56,100,0.12)' : 'rgba(255,107,43,0.12)',
                                            border: `1px solid ${alert.severity === 'critical' ? 'rgba(255,56,100,0.4)' : 'rgba(255,107,43,0.4)'}`,
                                        }}>
                                            <span style={{ fontSize: '0.75rem' }}>🕐</span>
                                            <span style={{
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: alert.severity === 'critical' ? '#ff3864' : '#ff6b2b',
                                                letterSpacing: '0.03em',
                                            }}>
                                                {alert.destructionLabel} IN {alert.destructionTime}
                                            </span>
                                            <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)' }}>
                                                · without intervention
                                            </span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', alignItems: 'center' }}>
                                        <span>Zone: {alert.zone}</span>
                                        <span style={{ color: STRESS_COLORS[FIELD_ZONES.find(z => z.id === alert.zone)?.stressLevel || 'none'] }}>
                                            {FIELD_ZONES.find(z => z.id === alert.zone)?.stressLevel?.toUpperCase() || '—'} STRESS
                                        </span>
                                        <button onClick={() => setDismissed(s => new Set([...s, alert.id]))}
                                            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}
                                            id={`dismiss-${alert.id}`}>
                                            × Dismiss
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div className="alert alert-success">
                                <span className="alert-icon">✅</span>
                                <div>No active alerts in this category. All monitored zones are within acceptable parameters.</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Recommendations panel */}
                <div>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div className="card-header"><span className="card-title">💡 AI Recommendations</span><span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Priority-ranked</span></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {RECOMMENDATIONS.map((rec, i) => (
                                <div key={rec.zone} style={{
                                    padding: '14px', borderRadius: '12px',
                                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)',
                                    borderLeft: `3px solid ${i === 0 ? '#ff3864' : i === 1 ? '#ff6b2b' : i === 2 ? '#ffd60a' : '#00e5ff'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '1.2rem' }}>{rec.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                                    #{rec.priority} {rec.action}
                                                </span>
                                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '20px', fontFamily: 'var(--font-mono)' }}>
                                                    Zone {rec.zone}
                                                </span>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                            {rec.effort} effort
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{rec.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Zone stress summary */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">🗺️ Zone Stress Summary</span></div>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Zone</th><th>Crop</th><th>Stress</th><th>Action Deadline</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...FIELD_ZONES].sort((a, b) => b.stressScore - a.stressScore).map(z => (
                                    <tr key={z.id}>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{z.id}</td>
                                        <td>{z.crop.split(' ')[0]}</td>
                                        <td><span className={`badge badge-${z.stressLevel}`}>{z.stressLevel}</span></td>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: z.stressLevel === 'severe' ? '#ff3864' : z.stressLevel === 'high' ? '#ff6b2b' : 'var(--color-text-muted)' }}>
                                            {z.stressLevel === 'severe' ? '< 24h' : z.stressLevel === 'high' ? '< 48h' : z.stressLevel === 'moderate' ? '< 5 days' : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
}
