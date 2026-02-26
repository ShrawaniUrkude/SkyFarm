import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FIELD_ZONES, STRESS_COLORS } from '../utils/data';

/* ─── Stress-Vision Satellite Viewer ───────────────────────────────────── */

const LAYERS = [
    { id: 'rgb', label: 'True Color (RGB)', icon: '🌿', color: '#00ff88' },
    { id: 'ndvi', label: 'NDVI Index', icon: '📊', color: '#aaff00' },
    { id: 'thermal', label: 'Thermal IR (LST)', icon: '🌡️', color: '#ff6b2b' },
    { id: 'hyperspect', label: 'Hyperspectral AI', icon: '🔬', color: '#00e5ff' },
    { id: 'stress', label: 'Stress-Vision™ Overlay', icon: '🚨', color: '#ff3864' },
    { id: 'redEdge', label: 'Red-Edge (N Deficiency)', icon: '🌾', color: '#ffd60a' },
];

const INFO_PANELS = {
    rgb: { title: 'True Color Composite', desc: 'Standard Sentinel-2 B4-B3-B2 composite. Shows visual appearance — note that stress is NOT yet visible here.' },
    ndvi: { title: 'Normalized Difference Vegetation Index', desc: 'NDVI = (NIR-Red)/(NIR+Red). Values: <0.2 bare soil, 0.2-0.5 sparse veg, 0.5-0.9 dense. Early decline detectable 7-14 days before visual.' },
    thermal: { title: 'Land Surface Temperature', desc: 'Derived from ASTER TIR bands 10-14. Stressed/water-deficient crops transpire less → higher canopy temperature. Δ+5°C = significant thermal stress.' },
    hyperspect: { title: 'Hyperspectral CNN Analysis', desc: 'Deep CNN (ResNet-based) processes 200+ narrow spectral bands. Detects chlorophyll fluorescence decline, chlorophyll-a/b ratio changes 10-21 days before visible yellowing.' },
    stress: { title: 'Stress-Vision™ Multi-Modal Fusion', desc: 'Ensemble of NDVI decline velocity, LST anomaly, Red-Edge indices, and CNN hyperspectral features. Weighted sensor fusion outputs pre-visual stress probability maps.' },
    redEdge: { title: 'Red-Edge Nitrogen Index', desc: 'Chlorophyll Red-Edge (CRE) = (NIR/Red-Edge)-1. Directly correlates with leaf chlorophyll content and nitrogen status. Ideal for early deficiency detection.' },
};

function generateFieldTexture(ctx, W, H, layer, opacity = 0.7) {
    // Background field pattern
    const fields = [
        { x: 0.05, y: 0.05, w: 0.3, h: 0.35, zone: 'Z1' },
        { x: 0.38, y: 0.05, w: 0.25, h: 0.3, zone: 'Z2' },
        { x: 0.66, y: 0.08, w: 0.3, h: 0.38, zone: 'Z3' },
        { x: 0.04, y: 0.45, w: 0.2, h: 0.4, zone: 'Z4' },
        { x: 0.28, y: 0.5, w: 0.35, h: 0.42, zone: 'Z5' },
        { x: 0.66, y: 0.5, w: 0.28, h: 0.4, zone: 'Z6' },
    ];

    const zoneMap = {};
    FIELD_ZONES.forEach(z => { zoneMap[z.id] = z; });

    fields.forEach(f => {
        const zone = zoneMap[f.zone];
        const x = f.x * W, y = f.y * H, fw = f.w * W, fh = f.h * H;

        let fillColor;
        const stress = zone.stressScore / 100;

        if (layer === 'rgb') {
            // True color: lush green to yellowish
            const r = Math.round(30 + stress * 80);
            const g = Math.round(120 - stress * 60);
            const b = Math.round(30 + stress * 10);
            fillColor = `rgba(${r},${g},${b},${opacity})`;
        } else if (layer === 'ndvi') {
            // NDVI: green (high) to red (low)
            const ndvi = zone.ndvi;
            const r = Math.round(255 * (1 - ndvi));
            const g = Math.round(200 * ndvi);
            fillColor = `rgba(${r},${g},0,${opacity})`;
        } else if (layer === 'thermal') {
            // Thermal: blue (cool) to red (hot)
            const t = (zone.lst - 28) / 16; // 28-44 range
            const r = Math.round(t * 255);
            const g = Math.round((1 - Math.abs(t - 0.5) * 2) * 180);
            const b = Math.round((1 - t) * 255);
            fillColor = `rgba(${r},${g},${b},${opacity})`;
        } else if (layer === 'hyperspect') {
            // False color hyperspectral
            const r = Math.round(100 + stress * 155);
            const g = Math.round(200 * (1 - stress * 0.6));
            const b = Math.round(200 - stress * 100);
            fillColor = `rgba(${r},${g},${b},${opacity})`;
        } else if (layer === 'stress') {
            // Stress-Vision: pure color mapping
            fillColor = STRESS_COLORS[zone.stressLevel] + Math.round(opacity * 220).toString(16).padStart(2, '0');
        } else if (layer === 'redEdge') {
            // Red-edge: nitrogen indicator — purple to yellow
            const ni = zone.nitrogenIndex;
            const r = Math.round(200 - ni * 120);
            const g = Math.round(ni * 200);
            const b = Math.round(170 - ni * 100);
            fillColor = `rgba(${r},${g},${b},${opacity})`;
        }

        // Fill field
        ctx.beginPath();
        ctx.roundRect(x, y, fw, fh, 8);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Add noise texture
        for (let nx = 0; nx < fw; nx += 8) {
            for (let ny = 0; ny < fh; ny += 8) {
                const n = (Math.random() - 0.5) * 0.12;
                ctx.fillStyle = `rgba(${n > 0 ? 255 : 0},${n > 0 ? 255 : 0},${n > 0 ? 255 : 0},${Math.abs(n)})`;
                ctx.fillRect(x + nx, y + ny, 4, 4);
            }
        }

        // Stress pulse for severe
        if ((layer === 'stress' || layer === 'hyperspect') && (zone.stressLevel === 'severe' || zone.stressLevel === 'high')) {
            const cx = x + fw / 2, cy = y + fh / 2;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(fw, fh) / 1.5);
            grad.addColorStop(0, STRESS_COLORS[zone.stressLevel] + '60');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, fw, fh);
        }

        // Field label
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold 11px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(f.zone, x + fw / 2, y + 18);
        ctx.font = `9px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        if (layer === 'ndvi') ctx.fillText(`NDVI:${zone.ndvi}`, x + fw / 2, y + fh - 8);
        else if (layer === 'thermal') ctx.fillText(`${zone.lst}°C`, x + fw / 2, y + fh - 8);
        else if (layer === 'stress') ctx.fillText(`${zone.stressScore}%`, x + fw / 2, y + fh - 8);
        else if (layer === 'redEdge') ctx.fillText(`N:${zone.nitrogenIndex}`, x + fw / 2, y + fh - 8);
    });
}

function SatelliteViewer({ activeLayer, overlayOpacity, showGrid, showLabels }) {
    const canvasRef = useRef(null);
    const animRef = useRef(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        // Black background
        ctx.fillStyle = '#030d18';
        ctx.fillRect(0, 0, W, H);

        // Always draw RGB base layer
        generateFieldTexture(ctx, W, H, 'rgb', 0.8);

        // Overlay active layer if not rgb
        if (activeLayer !== 'rgb') {
            generateFieldTexture(ctx, W, H, activeLayer, overlayOpacity / 100);
        }

        // Grid overlay
        if (showGrid) {
            ctx.strokeStyle = 'rgba(0,229,255,0.08)';
            ctx.lineWidth = 1;
            for (let x = 0; x < W; x += 50) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            }
            for (let y = 0; y < H; y += 50) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }
        }

        // Scan line effect
        const t = Date.now() / 1000;
        const scanY = (t * 60) % (H + 20) - 10;
        if (activeLayer !== 'rgb') {
            const scanGrad = ctx.createLinearGradient(0, scanY - 8, 0, scanY + 8);
            scanGrad.addColorStop(0, 'transparent');
            scanGrad.addColorStop(0.5, 'rgba(0,229,255,0.12)');
            scanGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = scanGrad;
            ctx.fillRect(0, scanY - 8, W, 16);
        }

        // Corner markers (satellite frame)
        const markers = [[0, 0], [W, 0], [0, H], [W, H]];
        ctx.strokeStyle = 'rgba(0,229,255,0.5)';
        ctx.lineWidth = 2;
        markers.forEach(([mx, my]) => {
            const dx = mx === 0 ? 1 : -1, dy = my === 0 ? 1 : -1;
            ctx.beginPath(); ctx.moveTo(mx + dx * 20, my); ctx.lineTo(mx, my); ctx.lineTo(mx, my + dy * 20); ctx.stroke();
        });

        // Crosshair center
        ctx.strokeStyle = 'rgba(0,229,255,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        ctx.setLineDash([]);

        // Coordinates HUD
        if (showLabels) {
            ctx.fillStyle = 'rgba(0,229,255,0.7)';
            ctx.font = `10px 'JetBrains Mono', monospace`;
            ctx.textAlign = 'left';
            ctx.fillText('28.6073°N  77.2310°E', 20, H - 20);
            ctx.textAlign = 'right';
            ctx.fillText(`Sentinel-2 · 10m res · ${new Date().toISOString().slice(0, 10)}`, W - 20, H - 20);
        }

        animRef.current = requestAnimationFrame(draw);
    }, [activeLayer, overlayOpacity, showGrid, showLabels]);

    useEffect(() => {
        animRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animRef.current);
    }, [draw]);

    return (
        <canvas
            ref={canvasRef}
            width={900}
            height={420}
            style={{ width: '100%', height: '100%', display: 'block' }}
            aria-label="Satellite stress-vision viewer"
        />
    );
}

/* ─── Spectral Signature Chart ──────────────────────────────────────────── */
function SpectralChart({ selectedZone }) {
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

        const zone = FIELD_ZONES.find(z => z.id === selectedZone) || FIELD_ZONES[0];
        const factor = 1 - zone.stressScore / 130;

        // Healthy reference signature
        const healthyRef = [0.08, 0.07, 0.13, 0.07, 0.32, 0.40, 0.44, 0.47, 0.45, 0.04, 0.23, 0.15];
        // Stressed signature (modified)
        const stressedSig = healthyRef.map((v, i) => {
            if (i >= 4 && i <= 8) return v * factor; // Red-edge & NIR suppressed
            if (i === 2 || i === 3) return v * (1 + (1 - factor) * 0.4); // Green/Red elevation
            return v;
        });

        const bands = 12;
        const xScale = (i) => PAD.left + (i / (bands - 1)) * chartW;
        const yScale = (v) => PAD.top + chartH * (1 - v / 0.55);

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = PAD.top + (i / 5) * chartH;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        }

        // Healthy fill
        const healthGrad = ctx.createLinearGradient(0, PAD.top, 0, H);
        healthGrad.addColorStop(0, 'rgba(0,255,136,0.25)');
        healthGrad.addColorStop(1, 'rgba(0,255,136,0.02)');
        ctx.beginPath();
        ctx.moveTo(xScale(0), yScale(healthyRef[0]));
        healthyRef.forEach((v, i) => ctx.lineTo(xScale(i), yScale(v)));
        ctx.lineTo(xScale(bands - 1), PAD.top + chartH); ctx.lineTo(xScale(0), PAD.top + chartH);
        ctx.closePath(); ctx.fillStyle = healthGrad; ctx.fill();

        // Healthy line
        ctx.beginPath();
        healthyRef.forEach((v, i) => {
            if (i === 0) ctx.moveTo(xScale(i), yScale(v)); else ctx.lineTo(xScale(i), yScale(v));
        });
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2; ctx.stroke();

        // Stressed fill
        const stressGrad = ctx.createLinearGradient(0, PAD.top, 0, H);
        stressGrad.addColorStop(0, 'rgba(255,107,43,0.2)');
        stressGrad.addColorStop(1, 'rgba(255,107,43,0.02)');
        ctx.beginPath();
        ctx.moveTo(xScale(0), yScale(stressedSig[0]));
        stressedSig.forEach((v, i) => ctx.lineTo(xScale(i), yScale(v)));
        ctx.lineTo(xScale(bands - 1), PAD.top + chartH); ctx.lineTo(xScale(0), PAD.top + chartH);
        ctx.closePath(); ctx.fillStyle = stressGrad; ctx.fill();

        // Stressed line
        ctx.beginPath();
        stressedSig.forEach((v, i) => {
            if (i === 0) ctx.moveTo(xScale(i), yScale(v)); else ctx.lineTo(xScale(i), yScale(v));
        });
        ctx.strokeStyle = '#ff6b2b'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.stroke();
        ctx.setLineDash([]);

        // Red-edge annotation
        ctx.fillStyle = 'rgba(0,229,255,0.15)';
        ctx.fillRect(xScale(4), PAD.top, xScale(8) - xScale(4), chartH);
        ctx.fillStyle = 'rgba(0,229,255,0.7)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
        ctx.fillText('Red-Edge', (xScale(4) + xScale(8)) / 2, PAD.top + 12);

        // Band labels
        const bandNames = ['443', '490', '560', '665', '705', '740', '783', '842', '865', '940', '1610', '2190'];
        ctx.fillStyle = 'rgba(126,184,212,0.5)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
        bandNames.forEach((name, i) => {
            if (i % 2 === 0) ctx.fillText(name, xScale(i), H - 10);
        });

        // Y axis
        ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(126,184,212,0.5)';
        [0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach(v => {
            ctx.fillText(v.toFixed(1), PAD.left - 4, yScale(v) + 4);
        });

        // Legend
        ctx.fillStyle = '#00ff88'; ctx.fillRect(W - 130, 5, 12, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
        ctx.fillText('Healthy reference', W - 114, 10);
        ctx.fillStyle = '#ff6b2b'; ctx.fillRect(W - 130, 18, 12, 3);
        ctx.fillText(`${zone.name} (${zone.stressLevel})`, W - 114, 24);

    }, [selectedZone]);

    return (
        <canvas
            ref={canvasRef}
            width={680}
            height={220}
            style={{ width: '100%', height: '220px' }}
            aria-label="Spectral signature chart"
        />
    );
}

/* ─── StressView Page ───────────────────────────────────────────────────── */
export default function StressView() {
    const [activeLayer, setActiveLayer] = useState('stress');
    const [overlayOpacity, setOverlayOpacity] = useState(70);
    const [showGrid, setShowGrid] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [selectedZone, setSelectedZone] = useState('Z1');
    const [activeTab, setActiveTab] = useState('viewer');

    const info = INFO_PANELS[activeLayer];
    const zone = FIELD_ZONES.find(z => z.id === selectedZone) || FIELD_ZONES[0];

    return (
        <section className="page-section" id="stressview-page">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">🔬 Hyperspectral + Thermal IR</div>
                    <h1 className="section-title">Stress-Vision™ Viewer</h1>
                    <p className="section-desc">Pre-visual crop stress detection superimposed over standard satellite imagery. Switch layers to explore different analytical dimensions.</p>
                </div>
                <div className="tabs">
                    {['viewer', 'spectral'].map(t => (
                        <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                            {t === 'viewer' ? '🛰️ Satellite View' : '📊 Spectral Signatures'}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'viewer' && (
                <>
                    {/* Main viewer */}
                    <div className="map-container" style={{ height: '480px', marginBottom: '20px' }}>
                        <SatelliteViewer activeLayer={activeLayer} overlayOpacity={overlayOpacity} showGrid={showGrid} showLabels={showLabels} />

                        {/* Top bar */}
                        <div className="map-toolbar">
                            <div className="map-toolbar-left">
                                <div className="map-pill">
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', display: 'inline-block', animation: 'ping 1.5s ease infinite' }} />
                                    SENTINEL-2A
                                </div>
                                <div className="map-pill">📡 10m Resolution</div>
                                <div className="map-pill">⏱ {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
                            </div>
                            <div className="map-toolbar-right">
                                <button id="toggle-grid" className={`map-btn ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(p => !p)} title="Toggle grid">⊞</button>
                                <button id="toggle-labels" className={`map-btn ${showLabels ? 'active' : ''}`} onClick={() => setShowLabels(p => !p)} title="Toggle labels">🏷️</button>
                            </div>
                        </div>

                        {/* Bottom legend */}
                        <div className="stress-legend">
                            <span className="stress-legend-title">Stress Level</span>
                            <div className="stress-legend-bar-wrap">
                                <div className="stress-legend-bar" />
                                <div className="stress-legend-labels">
                                    <span>None</span><span>Low</span><span>Moderate</span><span>High</span><span>Severe</span>
                                </div>
                            </div>
                            <div className="stress-indicators">
                                {Object.entries(STRESS_COLORS).map(([k, v]) => (
                                    <div key={k} className="stress-indicator">
                                        <span className="stress-dot" style={{ background: v, boxShadow: `0 0 4px ${v}` }} />
                                        {k.charAt(0).toUpperCase() + k.slice(1)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Controls row */}
                    <div className="grid-2" style={{ gap: '20px' }}>
                        {/* Layer selector */}
                        <div className="card">
                            <div className="card-header"><span className="card-title">🗂️ Analysis Layer</span></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                                {LAYERS.map(l => (
                                    <button
                                        key={l.id}
                                        id={`layer-${l.id}`}
                                        onClick={() => setActiveLayer(l.id)}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            background: activeLayer === l.id ? l.color + '20' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${activeLayer === l.id ? l.color : 'var(--color-border)'}`,
                                            color: activeLayer === l.id ? l.color : 'var(--color-text-muted)',
                                            cursor: 'pointer',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s ease',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <span>{l.icon}</span>
                                        <span>{l.label}</span>
                                    </button>
                                ))}
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Overlay Opacity</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-primary)' }}>{overlayOpacity}%</span>
                                </div>
                                <input
                                    type="range" min={10} max={100} value={overlayOpacity}
                                    onChange={e => setOverlayOpacity(+e.target.value)}
                                    className="range-slider"
                                    style={{ '--slider-pct': `${overlayOpacity}%` }}
                                    id="opacity-slider"
                                />
                            </div>
                        </div>

                        {/* Info panel + zone detail */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className="card" style={{ padding: '16px' }}>
                                <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
                                    Active Layer Info
                                </div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-primary)' }}>{info.title}</div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>{info.desc}</p>
                            </div>

                            {/* Zone selector */}
                            <div className="card" style={{ padding: '16px' }}>
                                <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                                    Zone Inspector
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                                    {FIELD_ZONES.map(z => (
                                        <button key={z.id} id={`zone-${z.id}`} onClick={() => setSelectedZone(z.id)} style={{
                                            padding: '4px 12px', borderRadius: '20px', border: `1px solid ${selectedZone === z.id ? STRESS_COLORS[z.stressLevel] : 'var(--color-border)'}`,
                                            background: selectedZone === z.id ? STRESS_COLORS[z.stressLevel] + '20' : 'transparent',
                                            color: selectedZone === z.id ? STRESS_COLORS[z.stressLevel] : 'var(--color-text-muted)',
                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s',
                                        }}>{z.id}</button>
                                    ))}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {[
                                        { label: 'Crop', value: zone.crop.split(' ')[0] },
                                        { label: 'Area', value: `${zone.area} ha` },
                                        { label: 'NDVI', value: zone.ndvi },
                                        { label: 'LST', value: `${zone.lst}°C` },
                                        { label: 'H₂O Content', value: `${zone.waterContent}%` },
                                        { label: 'N-Index', value: zone.nitrogenIndex },
                                    ].map(({ label, value }) => (
                                        <div key={label} style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'spectral' && (
                <div>
                    <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                        <span className="alert-icon">🔬</span>
                        <div>
                            <strong>Hyperspectral Analysis</strong> — The red-edge region (705–865nm) is the critical pre-visual indicator. Stressed crops show suppressed red-edge and NIR reflectance 10–21 days before visible chlorosis.
                        </div>
                    </div>

                    {/* Zone selector */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        {FIELD_ZONES.map(z => (
                            <button key={z.id} id={`spectral-zone-${z.id}`} onClick={() => setSelectedZone(z.id)} style={{
                                padding: '6px 16px', borderRadius: '20px', border: `1px solid ${selectedZone === z.id ? STRESS_COLORS[z.stressLevel] : 'var(--color-border)'}`,
                                background: selectedZone === z.id ? STRESS_COLORS[z.stressLevel] + '20' : 'rgba(255,255,255,0.03)',
                                color: selectedZone === z.id ? STRESS_COLORS[z.stressLevel] : 'var(--color-text-muted)',
                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.2s',
                            }}>
                                {z.id} — {z.name} <span className={`badge badge-${z.stressLevel}`} style={{ marginLeft: '6px', fontSize: '0.6rem' }}>{z.stressLevel}</span>
                            </button>
                        ))}
                    </div>

                    <div className="grid-2">
                        <div className="card">
                            <div className="card-header"><span className="card-title">📊 Spectral Signature Comparison</span></div>
                            <SpectralChart selectedZone={selectedZone} />
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                                Wavelength (nm) • Highlighted region = Red-Edge window (diagnostic for pre-visual stress)
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className="card">
                                <div className="card-header"><span className="card-title">🧬 Zone Biophysical Parameters</span></div>
                                {[
                                    { label: 'NDVI', val: zone.ndvi, max: 1, color: '#00ff88', desc: 'Vegetation index' },
                                    { label: 'NDWI', val: zone.ndwi + 0.3, max: 0.6, color: '#00e5ff', desc: 'Water content' },
                                    { label: 'N-Index', val: zone.nitrogenIndex, max: 1, color: '#ffd60a', desc: 'Nitrogen status' },
                                    { label: 'Water Content', val: zone.waterContent / 100, max: 1, color: '#7c3aed', desc: 'Soil moisture' },
                                ].map(p => (
                                    <div key={p.label} style={{ marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{p.label} <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>— {p.desc}</span></span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: p.color, fontWeight: 700 }}>{(p.val * (p.label === 'Water Content' ? 100 : 1)).toFixed(p.label === 'Water Content' ? 0 : 2)}{p.label === 'Water Content' ? '%' : ''}</span>
                                        </div>
                                        <div className="progress-bar">
                                            <div className="progress-fill" style={{ width: `${(p.val / p.max) * 100}%`, background: p.color }} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="card" style={{ flex: 1 }}>
                                <div className="card-header"><span className="card-title">⚠️ Stress Classification</span></div>
                                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                    <div style={{
                                        width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 16px',
                                        background: `conic-gradient(${STRESS_COLORS[zone.stressLevel]} ${zone.stressScore}%, rgba(255,255,255,0.06) 0%)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                                    }}>
                                        <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'var(--color-bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontFamily: 'var(--font-primary)', fontSize: '1.4rem', fontWeight: 800, color: STRESS_COLORS[zone.stressLevel] }}>{zone.stressScore}</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>STRESS%</span>
                                        </div>
                                    </div>
                                    <span className={`badge badge-${zone.stressLevel}`} style={{ fontSize: '0.8rem', padding: '6px 20px' }}>
                                        {zone.stressLevel.toUpperCase()} STRESS
                                    </span>
                                    <p style={{ marginTop: '12px', fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                                        {zone.alertAge ? `⚡ Pre-visually detected ${zone.alertAge} day${zone.alertAge > 1 ? 's' : ''} ago — before RGB change` : '✅ Healthy — within normal spectral range'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
