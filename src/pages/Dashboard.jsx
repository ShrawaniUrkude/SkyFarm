import React, { useEffect, useRef, useState } from 'react';
import { OVERVIEW_METRICS, FIELD_ZONES, STRESS_COLORS, ALERTS, TIME_SERIES } from '../utils/data';
import { useCountUp } from '../hooks/useCountUp';

/* ─── tiny sub-components ──────────────────────────────────────────────── */

function AnimatedMetric({ value, unit }) {
    const isFloat = String(value).includes('.');
    const numericEnd = parseFloat(value);
    const count = useCountUp(numericEnd, 1400);
    const display = isFloat ? count.toFixed(2) : Math.round(count).toString();
    return <>{display}<span className="metric-unit">{unit}</span></>;
}

function MetricCard({ metric, delay = 0 }) {
    return (
        <div className="metric-card animate-fade-up" style={{ '--metric-color': metric.color, animationDelay: `${delay}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="metric-label">{metric.label}</span>
                <span style={{ fontSize: '1.4rem' }}>{metric.icon}</span>
            </div>
            <div className="metric-value">
                <AnimatedMetric value={metric.value} unit={metric.unit} />
            </div>
            <div className={`metric-delta ${metric.trend === 'up' ? 'up' : 'down'}`}>
                {metric.trend === 'up' ? '↑' : '↓'} {metric.delta}
            </div>
        </div>
    );
}

function StressBar({ zone }) {
    const color = STRESS_COLORS[zone.stressLevel];
    return (
        <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{zone.name}</span>
                    <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{zone.id}</span>
                </div>
                <span className={`badge badge-${zone.stressLevel}`}>{zone.stressLevel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="progress-bar" style={{ flex: 1 }}>
                    <div className="progress-fill" style={{ width: `${zone.stressScore}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color, width: '30px', textAlign: 'right' }}>{zone.stressScore}</span>
            </div>
        </div>
    );
}

/* ─── Main Dashboard Canvas Map ───────────────────────────────────────── */

function MiniMapCanvas({ zones }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        // Dark base
        ctx.fillStyle = '#030d18';
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = 'rgba(0,229,255,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        // Zone layout (simplified grid layout)
        const positions = [
            { x: 80, y: 60 }, { x: 220, y: 60 },
            { x: 360, y: 100 }, { x: 50, y: 200 },
            { x: 270, y: 220 }, { x: 170, y: 150 },
        ];

        const sizes = [80, 70, 90, 65, 85, 72];

        zones.forEach((zone, i) => {
            const { x, y } = positions[i];
            const w = sizes[i], h = sizes[i] * 0.7;
            const color = STRESS_COLORS[zone.stressLevel];
            const alpha = 0.45 + zone.stressScore / 200;

            // Field polygon fill
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 6);
            ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Label
            ctx.fillStyle = '#e8f4fd';
            ctx.font = `bold 9px 'JetBrains Mono', monospace`;
            ctx.fillText(zone.id, x + 6, y + 14);
            ctx.fillStyle = color;
            ctx.font = `bold 8px monospace`;
            ctx.fillText(`${zone.stressScore}%`, x + 6, y + h - 6);

            // Pulse ring for severe/high
            if (zone.stressLevel === 'severe' || zone.stressLevel === 'high') {
                const cx = x + w / 2, cy = y + h / 2;
                const pulsed = (Date.now() % 2000) / 2000;
                ctx.beginPath();
                ctx.arc(cx, cy, (w / 2 + 10) * pulsed, 0, Math.PI * 2);
                ctx.strokeStyle = color + '60';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });

        // Compass
        ctx.fillStyle = 'rgba(0,229,255,0.5)';
        ctx.font = '10px monospace';
        ctx.fillText('N', W - 28, 22);
        ctx.beginPath(); ctx.moveTo(W - 24, 26); ctx.lineTo(W - 24, 42); ctx.strokeStyle = 'rgba(0,229,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();

        // Scale bar
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(20, H - 20, 60, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px monospace';
        ctx.fillText('500m', 26, H - 24);

    }, [zones]);

    // Animate pulse rings
    useEffect(() => {
        let rafId;
        const loop = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const W = canvas.width, H = canvas.height;

            const positions = [
                { x: 80, y: 60 }, { x: 220, y: 60 },
                { x: 360, y: 100 }, { x: 50, y: 200 },
                { x: 270, y: 220 }, { x: 170, y: 150 },
            ];
            const sizes = [80, 70, 90, 65, 85, 72];

            zones.forEach((zone, i) => {
                if (zone.stressLevel !== 'severe' && zone.stressLevel !== 'high') return;
                const { x, y } = positions[i];
                const w = sizes[i], h = sizes[i] * 0.7;
                const cx = x + w / 2, cy = y + h / 2;
                const color = STRESS_COLORS[zone.stressLevel];
                const pulsed = (Date.now() % 2000) / 2000;

                // Clear pulse area first
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(cx, cy, w / 2 + 25, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.01)';
                ctx.fill();
                ctx.restore();

                ctx.beginPath();
                ctx.arc(cx, cy, (w / 2 + 10) + 15 * pulsed, 0, Math.PI * 2);
                ctx.strokeStyle = color + Math.round((1 - pulsed) * 100).toString(16).padStart(2, '0');
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafId);
    }, [zones]);

    return (
        <canvas
            ref={canvasRef}
            width={480}
            height={320}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
    );
}

/* ─── Mini time-series chart ────────────────────────────────────────────── */
function TimeSeries() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        const PAD = { top: 20, right: 20, bottom: 40, left: 46 };
        const chartW = W - PAD.left - PAD.right;
        const chartH = H - PAD.top - PAD.bottom;

        ctx.clearRect(0, 0, W, H);

        const data = TIME_SERIES;
        const stressMax = 100, stressMin = 0;
        const ndviMax = 1, ndviMin = 0;

        const xScale = (i) => PAD.left + (i / (data.length - 1)) * chartW;
        const stressY = (v) => PAD.top + chartH - ((v - stressMin) / (stressMax - stressMin)) * chartH;
        const ndviY = (v) => PAD.top + chartH - ((v - ndviMin) / (ndviMax - ndviMin)) * chartH;

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = PAD.top + (i / 5) * chartH;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        }

        // Stress area
        const stressGrad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
        stressGrad.addColorStop(0, 'rgba(255,56,100,0.5)');
        stressGrad.addColorStop(1, 'rgba(255,56,100,0.02)');
        ctx.beginPath();
        ctx.moveTo(xScale(0), stressY(data[0].stress));
        data.forEach((d, i) => ctx.lineTo(xScale(i), stressY(d.stress)));
        ctx.lineTo(xScale(data.length - 1), PAD.top + chartH);
        ctx.lineTo(xScale(0), PAD.top + chartH);
        ctx.closePath();
        ctx.fillStyle = stressGrad;
        ctx.fill();

        // Stress line
        ctx.beginPath();
        data.forEach((d, i) => {
            if (i === 0) ctx.moveTo(xScale(i), stressY(d.stress));
            else ctx.lineTo(xScale(i), stressY(d.stress));
        });
        ctx.strokeStyle = '#ff3864';
        ctx.lineWidth = 2;
        ctx.stroke();

        // NDVI line
        ctx.beginPath();
        data.forEach((d, i) => {
            if (i === 0) ctx.moveTo(xScale(i), ndviY(d.ndvi));
            else ctx.lineTo(xScale(i), ndviY(d.ndvi));
        });
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // X labels
        ctx.fillStyle = 'rgba(126,184,212,0.6)';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        data.forEach((d, i) => {
            ctx.fillText(d.date, xScale(i), H - PAD.bottom + 14);
        });

        // Y axis labels
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(126,184,212,0.5)';
        for (let i = 0; i <= 5; i++) {
            ctx.fillText(`${(i * 20)}`, PAD.left - 6, PAD.top + chartH - (i / 5) * chartH + 4);
        }

        // Legend
        ctx.fillStyle = '#ff3864'; ctx.fillRect(W - 110, 5, 12, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
        ctx.fillText('Stress Index', W - 94, 9);
        ctx.fillStyle = '#00ff88'; ctx.fillRect(W - 110, 18, 12, 3);
        ctx.fillText('NDVI', W - 94, 22);

    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={640}
            height={200}
            style={{ width: '100%', height: '200px' }}
        />
    );
}

/* ─── Dashboard Page ────────────────────────────────────────────────────── */
export default function Dashboard({ setActivePage }) {
    return (
        <section className="page-section" id="dashboard-page">
            {/* Header */}
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">🌍 Global Operations Center</div>
                    <h1 className="section-title">Farm Command Dashboard</h1>
                    <p className="section-desc">Real-time pre-visual crop stress monitoring across all agricultural zones. Powered by hyperspectral AI and thermal infrared analysis.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'flex-start' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setActivePage('pipeline')}>⚡ Pipeline</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setActivePage('stressview')}>🔬 Stress-Vision</button>
                </div>
            </div>

            {/* Metrics */}
            <div className="metric-grid">
                {OVERVIEW_METRICS.map((m, i) => <MetricCard key={m.label} metric={m} delay={i * 80} />)}
            </div>

            {/* Main grid */}
            <div className="grid-2" style={{ marginBottom: '24px' }}>
                {/* Map */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="card-title">🗺️ Field Map — Live</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <span className="badge badge-running" style={{ fontSize: '0.65rem' }}>● LIVE</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => setActivePage('stressview')}>Full View →</button>
                        </div>
                    </div>
                    <div style={{ height: '320px', position: 'relative' }}>
                        <MiniMapCanvas zones={FIELD_ZONES} />
                    </div>
                </div>

                {/* Stress ranking */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">📍 Zone Stress Ranking</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>6 zones active</span>
                    </div>
                    {[...FIELD_ZONES].sort((a, b) => b.stressScore - a.stressScore).map(z => (
                        <StressBar key={z.id} zone={z} />
                    ))}
                </div>
            </div>

            {/* Time series + Alerts */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">📈 NDVI vs Stress Trend — Zone Z1</span>
                    </div>
                    <TimeSeries />
                    <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            <span style={{ color: '#ff3864', fontWeight: 700 }}>↑ 79%</span> peak stress Mar 25
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            <span style={{ color: '#ff3864' }}>Pre-visual detected</span> 14 days before RGB change
                        </div>
                    </div>
                </div>

                {/* Alerts */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">🚨 Active Alerts</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setActivePage('alerts')}>View all</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {ALERTS.map(alert => (
                            <div key={alert.id} className={`alert alert-${alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'info'}`}>
                                <span className="alert-icon">{alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{alert.type}</span>
                                        {alert.previsual && <span className="badge badge-running" style={{ fontSize: '0.6rem', padding: '2px 6px' }}>PRE-VISUAL</span>}
                                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.6 }}>{alert.time}</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>{alert.message}</p>
                                    <div style={{ fontSize: '0.7rem', marginTop: '4px', opacity: 0.6, fontFamily: 'var(--font-mono)' }}>Zone {alert.zone}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
