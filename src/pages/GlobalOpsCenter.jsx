import React, { useState, useEffect, useRef, useCallback } from 'react';
import useAIInsight from '../hooks/useAIInsight';
import AIInsightPanel from '../components/AIInsightPanel';

/* ──────────────────────────────────────────────────────────────────────────
   Tile map math helpers (Web Mercator / Slippy Map)
─────────────────────────────────────────────────────────────────────────── */
function lon2tile(lon, zoom) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
function lat2tile(lat, zoom) {
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}
function tile2lon(x, zoom) { return x / Math.pow(2, zoom) * 360 - 180; }
function tile2lat(y, zoom) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/* ──────────────────────────────────────────────────────────────────────────
   Pseudo-random location-specific data
─────────────────────────────────────────────────────────────────────────── */
function seedRng(lat, lon) {
    const s = Math.abs(Math.round(lat * 1000) * 31337 + Math.round(lon * 1000) * 7919) % 99991;
    return (n) => { const x = Math.sin(n + s) * 43758.5453; return x - Math.floor(x); };
}

function generateLocationData(lat, lon) {
    const r = seedRng(lat, lon);
    const stressPct = Math.round(r(1) * 85 + 5);
    const alertLevel = stressPct < 30 ? 'SAFE' : stressPct < 60 ? 'MONITOR' : 'CRITICAL';
    const ndvi = +(0.2 + r(2) * 0.7).toFixed(3);
    const ndre = +(0.1 + r(3) * 0.5).toFixed(3);
    const msi = +(0.1 + r(4) * 0.9).toFixed(3);
    const temp = +(25 + r(5) * 20).toFixed(1);
    const humidity = +(30 + r(6) * 55).toFixed(1);
    const rainfall = +(r(7) * 180).toFixed(1);
    const soilMoist = +(15 + r(8) * 65).toFixed(1);
    const cropType = ['Wheat', 'Rice', 'Maize', 'Soybean', 'Cotton', 'Sugarcane', 'Tomato', 'Barley'][Math.floor(r(9) * 8)];
    const growthStage = ['Germination', 'Tillering', 'Vegetative', 'Flowering', 'Grain Fill', 'Maturity'][Math.floor(r(10) * 6)];
    const yieldEst = +(1.5 + r(11) * 6.5).toFixed(2);
    const yieldRisk = stressPct > 60 ? 'HIGH RISK (-35%)' : stressPct > 30 ? 'MODERATE (-15%)' : 'NOMINAL';

    const forecast = Array.from({ length: 7 }, (_, i) => {
        const s = Math.round(Math.min(100, Math.max(0, stressPct + (r(20 + i) - 0.42) * 14)));
        return { day: i + 1, stress: s, level: s < 30 ? 'SAFE' : s < 60 ? 'MONITOR' : 'CRITICAL' };
    });

    const N_def = Math.round(r(30) * 85);
    const P_def = Math.round(r(31) * 70);
    const K_def = Math.round(r(32) * 75);

    return { lat, lon, stressPct, alertLevel, ndvi, ndre, msi, temp, humidity, rainfall, soilMoist, cropType, growthStage, yieldEst, yieldRisk, forecast, nutrients: { N: N_def, P: P_def, K: K_def } };
}

/* ──────────────────────────────────────────────────────────────────────────
   Alert config
─────────────────────────────────────────────────────────────────────────── */
const ALERT_CFG = {
    SAFE: { color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.25)', icon: '✅' },
    MONITOR: { color: '#ffd60a', bg: 'rgba(255,214,10,0.08)', border: 'rgba(255,214,10,0.25)', icon: '⚠️' },
    CRITICAL: { color: '#ff3864', bg: 'rgba(255,56,100,0.08)', border: 'rgba(255,56,100,0.25)', icon: '🚨' },
};

/* ──────────────────────────────────────────────────────────────────────────
   Tile Map Component
─────────────────────────────────────────────────────────────────────────── */
const TILE_SIZE = 256;

function TileMap({ onLocationSelect, selectedPin, onClearPin }) {
    const canvasRef = useRef(null);
    const tileCache = useRef({});
    const viewRef = useRef({ lat: 20.5937, lon: 78.9629, zoom: 5 }); // India default
    const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startLat: 0, startLon: 0 });
    const rafRef = useRef(null);
    const [, forceRender] = useState(0);

    const W = 900, H = 520;

    /* Convert lat/lon → canvas pixel */
    const latLon2canvas = useCallback((lat, lon) => {
        const { lat: cLat, lon: cLon, zoom } = viewRef.current;
        const scale = Math.pow(2, zoom) * TILE_SIZE;
        const cX = (cLon + 180) / 360 * scale;
        const cY = (1 - Math.log(Math.tan(cLat * Math.PI / 180) + 1 / Math.cos(cLat * Math.PI / 180)) / Math.PI) / 2 * scale;
        const pX = (lon + 180) / 360 * scale;
        const pY = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * scale;
        return { x: W / 2 + (pX - cX), y: H / 2 + (pY - cY) };
    }, []);

    /* Convert canvas pixel → lat/lon */
    const canvas2latLon = useCallback((px, py) => {
        const { lat: cLat, lon: cLon, zoom } = viewRef.current;
        const scale = Math.pow(2, zoom) * TILE_SIZE;
        const cX = (cLon + 180) / 360 * scale;
        const cY = (1 - Math.log(Math.tan(cLat * Math.PI / 180) + 1 / Math.cos(cLat * Math.PI / 180)) / Math.PI) / 2 * scale;
        const mapX = cX + (px - W / 2);
        const mapY = cY + (py - H / 2);
        const lon = mapX / scale * 360 - 180;
        const n = Math.PI - 2 * Math.PI * mapY / scale;
        const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        return { lat: Math.max(-85, Math.min(85, lat)), lon: Math.max(-180, Math.min(180, lon)) };
    }, []);

    /* Draw tiles onto canvas */
    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { lat, lon, zoom } = viewRef.current;
        const scale = Math.pow(2, zoom) * TILE_SIZE;

        const cX = (lon + 180) / 360 * scale;
        const cY = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * scale;

        // Fill dark background (for tiles still loading)
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, W, H);

        const tX0 = Math.floor((cX - W / 2) / TILE_SIZE);
        const tY0 = Math.floor((cY - H / 2) / TILE_SIZE);
        const tX1 = Math.ceil((cX + W / 2) / TILE_SIZE);
        const tY1 = Math.ceil((cY + H / 2) / TILE_SIZE);

        for (let tx = tX0; tx <= tX1; tx++) {
            for (let ty = tY0; ty <= tY1; ty++) {
                const maxT = Math.pow(2, zoom) - 1;
                const wtx = ((tx % (maxT + 1)) + (maxT + 1)) % (maxT + 1);
                const key = `${zoom}/${wtx}/${ty}`;
                const dx = tx * TILE_SIZE - (cX - W / 2);
                const dy = ty * TILE_SIZE - (cY - H / 2);

                if (ty < 0 || ty > maxT) continue;

                if (tileCache.current[key]?.complete) {
                    ctx.drawImage(tileCache.current[key], Math.round(dx), Math.round(dy), TILE_SIZE, TILE_SIZE);
                    // Darken the tile slightly for dark-mode look
                    ctx.fillStyle = 'rgba(10,14,26,0.45)';
                    ctx.fillRect(Math.round(dx), Math.round(dy), TILE_SIZE, TILE_SIZE);
                } else if (!tileCache.current[key]) {
                    // Load from OpenStreetMap (free, no key needed)
                    const servers = ['a', 'b', 'c'];
                    const srv = servers[(wtx + ty) % 3];
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = `https://${srv}.tile.openstreetmap.org/${zoom}/${wtx}/${ty}.png`;
                    img.onload = () => { tileCache.current[key] = img; requestAnimationFrame(draw); };
                    img.onerror = () => { tileCache.current[key] = { complete: false, error: true }; };
                    tileCache.current[key] = img;
                    // Placeholder
                    ctx.fillStyle = '#131a2d';
                    ctx.fillRect(Math.round(dx), Math.round(dy), TILE_SIZE, TILE_SIZE);
                    ctx.strokeStyle = 'rgba(0,229,255,0.06)';
                    ctx.strokeRect(Math.round(dx), Math.round(dy), TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // Draw selected pin
        if (selectedPin) {
            const { x, y } = latLon2canvas(selectedPin.lat, selectedPin.lon);
            if (x > -40 && x < W + 40 && y > -40 && y < H + 40) {
                // Pulse rings
                const t = (Date.now() / 800) % 1;
                for (let ring = 0; ring < 3; ring++) {
                    const rt = (t + ring * 0.33) % 1;
                    ctx.beginPath();
                    ctx.arc(x, y, 12 + rt * 30, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(0,229,255,${0.6 * (1 - rt)})`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
                // Pin circle
                ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
                ctx.fillStyle = '#00e5ff'; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
                // Cross-hair
                ctx.strokeStyle = '#00e5ff44'; ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
                ctx.setLineDash([]);
                // Label
                const label = `${selectedPin.lat.toFixed(4)}°N, ${selectedPin.lon.toFixed(4)}°E`;
                ctx.font = 'bold 11px JetBrains Mono, monospace';
                const lw = ctx.measureText(label).width;
                const lx = Math.min(Math.max(x - lw / 2, 4), W - lw - 4);
                const ly = y + 24;
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.beginPath(); ctx.roundRect(lx - 6, ly - 13, lw + 12, 20, 4); ctx.fill();
                ctx.fillStyle = '#00e5ff'; ctx.fillText(label, lx, ly);
            }
        }

        // HUD overlays
        // Zoom level indicator
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.roundRect(W - 80, 10, 68, 26, 6); ctx.fill();
        ctx.fillStyle = '#00e5ff'; ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.textAlign = 'center'; ctx.fillText(`ZOOM ${zoom}`, W - 46, 27);
        ctx.textAlign = 'left';

        rafRef.current = requestAnimationFrame(draw);
    }, [selectedPin, latLon2canvas]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    }, [draw]);

    /* Mouse events */
    const onMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = W / rect.width;
        const scaleY = H / rect.height;
        dragRef.current = {
            dragging: true,
            startX: e.clientX, startY: e.clientY,
            startLat: viewRef.current.lat,
            startLon: viewRef.current.lon,
            moved: false,
        };
    };

    const onMouseMove = (e) => {
        if (!dragRef.current.dragging) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = W / rect.width, scaleY = H / rect.height;
        // Approx degrees per pixel at current zoom
        const degPerPx = 360 / (Math.pow(2, viewRef.current.zoom) * TILE_SIZE);
        viewRef.current.lon = Math.max(-180, Math.min(180, dragRef.current.startLon - dx * scaleX * degPerPx));
        viewRef.current.lat = Math.max(-85, Math.min(85, dragRef.current.startLat + dy * scaleY * degPerPx * 0.8));
    };

    const onMouseUp = (e) => {
        /* Only treat as a click if mouse button was actively pressed (dragging=true) and didn't move */
        if (dragRef.current.dragging && !dragRef.current.moved) {
            // Click → select location
            const rect = canvasRef.current.getBoundingClientRect();
            const scaleX = W / rect.width, scaleY = H / rect.height;
            const px = (e.clientX - rect.left) * scaleX;
            const py = (e.clientY - rect.top) * scaleY;
            const { lat, lon } = canvas2latLon(px, py);
            onLocationSelect(lat, lon);
        }
        dragRef.current.dragging = false; dragRef.current.moved = false;
    };

    /* Mouse leave — just cancel drag, never fire a spurious click */
    const onMouseLeave = () => {
        dragRef.current.dragging = false;
        dragRef.current.moved = false;
    };

    const onWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        viewRef.current.zoom = Math.max(2, Math.min(14, viewRef.current.zoom + delta));
        forceRender(n => n + 1);
    };

    /* Touch support */
    const lastTouchRef = useRef(null);
    const onTouchStart = (e) => {
        if (e.touches.length === 1) {
            const t = e.touches[0];
            lastTouchRef.current = { x: t.clientX, y: t.clientY };
            dragRef.current = { dragging: true, startX: t.clientX, startY: t.clientY, startLat: viewRef.current.lat, startLon: viewRef.current.lon, moved: false };
        }
    };
    const onTouchMove = (e) => {
        if (e.touches.length === 1 && dragRef.current.dragging) {
            onMouseMove(e.touches[0]);
        }
    };
    const onTouchEnd = (e) => {
        if (!dragRef.current.moved && lastTouchRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const scaleX = W / rect.width, scaleY = H / rect.height;
            const px = (lastTouchRef.current.x - rect.left) * scaleX;
            const py = (lastTouchRef.current.y - rect.top) * scaleY;
            const { lat, lon } = canvas2latLon(px, py);
            onLocationSelect(lat, lon);
        }
        dragRef.current.dragging = false;
    };

    return (
        <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(0,229,255,0.2)', cursor: 'crosshair', boxShadow: '0 0 40px rgba(0,229,255,0.08)' }}>
            <canvas ref={canvasRef} width={W} height={H}
                style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
                onWheel={onWheel}
                onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
            />

            {/* Map controls */}
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                    { label: '+', action: () => { viewRef.current.zoom = Math.min(14, viewRef.current.zoom + 1); forceRender(n => n + 1); } },
                    { label: '−', action: () => { viewRef.current.zoom = Math.max(2, viewRef.current.zoom - 1); forceRender(n => n + 1); } },
                ].map(btn => (
                    <button key={btn.label} onClick={btn.action}
                        style={{ width: 32, height: 32, borderRadius: '8px', border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.7)', color: '#00e5ff', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                        {btn.label}
                    </button>
                ))}
                {/* Quick jump presets */}
                <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {[
                        { label: '🇮🇳 India', lat: 20.59, lon: 78.96, zoom: 5 },
                        { label: '🌍 Africa', lat: 0.0, lon: 20.0, zoom: 4 },
                        { label: '🌾 Punjab', lat: 30.9, lon: 75.8, zoom: 8 },
                        { label: '🌿 Brazil', lat: -14.2, lon: -51.9, zoom: 5 },
                    ].map(p => (
                        <button key={p.label} onClick={() => { viewRef.current = { lat: p.lat, lon: p.lon, zoom: p.zoom }; forceRender(n => n + 1); }}
                            style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.7)', fontSize: '0.62rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bottom-left hint */}
            <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: '0.64rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: '4px' }}>
                Click anywhere to pin a location · Drag to pan · Scroll to zoom · © OpenStreetMap
            </div>

            {/* Pinned location badge + clear button */}
            {selectedPin && (
                <div style={{
                    position: 'absolute', top: 12, right: 12,
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(0,229,255,0.45)',
                    borderRadius: '10px', padding: '6px 12px',
                    backdropFilter: 'blur(6px)',
                }}>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: '#00e5ff', fontWeight: 700 }}>
                        📌 {selectedPin.lat.toFixed(4)}°N, {selectedPin.lon.toFixed(4)}°E
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onClearPin(); }}
                        style={{
                            background: 'rgba(255,56,100,0.15)', border: '1px solid rgba(255,56,100,0.4)',
                            color: '#ff3864', borderRadius: '6px', padding: '2px 8px',
                            cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                        }}
                    >
                        × Clear
                    </button>
                </div>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Stress gauge
─────────────────────────────────────────────────────────────────────────── */
function StressGauge({ pct, color }) {
    const r = 40, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
    return (
        <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
                strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" transform="rotate(-90 48 48)"
                style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: 'stroke-dasharray 1s ease' }} />
            <text x="48" y="44" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="var(--font-primary)">{pct}%</text>
            <text x="48" y="60" textAnchor="middle" fill={color} fontSize="7" fontWeight="700" fontFamily="var(--font-mono)" letterSpacing="0.5">STRESS</text>
        </svg>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Global Regions quick-jump data
────────────────────────────────────────────────────────────────────────── */
const GLOBAL_REGIONS = [
    { label: '🇮🇳 South Asia',   lat: 20.59,  lon: 78.96,  zoom: 5, color: '#ffd60a' },
    { label: '🌍 Africa',       lat: 0.0,    lon: 20.0,   zoom: 4, color: '#ff6b2b' },
    { label: '🌾 Punjab Belt',  lat: 30.9,   lon: 75.8,   zoom: 7, color: '#00ff88' },
    { label: '🌿 Brazil AgBlt', lat: -14.2,  lon: -51.9,  zoom: 5, color: '#aaff00' },
    { label: '🇺🇸 US Midwest',  lat: 41.5,   lon: -93.5,  zoom: 5, color: '#00e5ff' },
    { label: '🇪🇺 EU Farmland', lat: 48.5,   lon: 9.0,    zoom: 5, color: '#ff3864' },
];

/* ──────────────────────────────────────────────────────────────────────────
   Main Page
────────────────────────────────────────────────────────────────────────── */
export default function GlobalOpsCenter() {
    const [selectedPin, setSelectedPin] = useState(null);
    const [locData, setLocData] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [searchLat, setSearchLat] = useState('');
    const [searchLon, setSearchLon] = useState('');
    const [recentPins, setRecentPins] = useState([]);
    const [dataTab, setDataTab] = useState('overview');
    const { solution: aiSolution, loading: aiLoading, error: aiError, model: aiModel, fetchInsight, clear: clearAI } = useAIInsight();

    const handleLocationSelect = useCallback((lat, lon) => {
        setSelectedPin({ lat, lon });
        setAnalyzing(true);
        setLocData(null);
        setDataTab('overview');
        clearAI();
        // Simulate brief analysis delay
        setTimeout(() => {
            const data = generateLocationData(lat, lon);
            setLocData(data);
            setAnalyzing(false);
            setRecentPins(prev => {
                const entry = { lat, lon, alertLevel: data.alertLevel, cropType: data.cropType, stressPct: data.stressPct, ts: Date.now() };
                return [entry, ...prev.filter(p => !(Math.abs(p.lat - lat) < 0.01 && Math.abs(p.lon - lon) < 0.01))].slice(0, 6);
            });
        }, 650);
    }, []);

    const handleSearch = () => {
        const la = parseFloat(searchLat), lo = parseFloat(searchLon);
        if (isNaN(la) || isNaN(lo)) return;
        handleLocationSelect(la, lo);
    };

    const cfg = locData ? (ALERT_CFG[locData.alertLevel] || ALERT_CFG.SAFE) : null;

    return (
        <section className="page-section" id="ops-center-page">
            {/* ── Animated header ── */}
            <div className="section-header" style={{ position: 'relative', overflow: 'hidden' }}>
                <div className="section-title-group">
                    <div className="section-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.2rem', animation: 'spin 12s linear infinite', display: 'inline-block' }}>🌍</span>
                        Global Operations Center
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', animation: 'globalOpsLiveBlink 1.8s ease infinite' }}>⬤ LIVE</span>
                    </div>
                    <h1 className="section-title">Live Location Intelligence</h1>
                    <p className="section-desc">
                        Click anywhere on the map to instantly receive satellite-derived crop stress, spectral indices,
                        weather, soil &amp; nutrient data for that exact coordinate — or pick a global region below.
                    </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
                    {locData && <span className={`badge badge-${locData.alertLevel === 'CRITICAL' ? 'critical' : locData.alertLevel === 'MONITOR' ? 'moderate' : 'done'}`} style={{ fontSize: '0.65rem' }}>{cfg.icon} {locData.alertLevel}</span>}
                    <span className="badge badge-running" style={{ fontSize: '0.65rem' }}>● LIVE · Sentinel-2</span>
                    <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                        {recentPins.length} location{recentPins.length !== 1 ? 's' : ''} analysed
                    </span>
                </div>
            </div>

            {/* ── Global Regions Quick-Select ── */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {GLOBAL_REGIONS.map(r => {
                    const rd = generateLocationData(r.lat, r.lon);
                    const rc = ALERT_CFG[rd.alertLevel];
                    return (
                        <div key={r.label} className="ops-region-card" style={{ '--ops-region-color': r.color }}
                            onClick={() => handleLocationSelect(r.lat, r.lon)}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{r.label}</span>
                                <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: rc.color }}>{rc.icon}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ width: `${rd.stressPct}%`, height: '100%', background: `linear-gradient(90deg,${rc.color}88,${rc.color})`, transition: 'width 0.6s ease' }} />
                                </div>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: rc.color, flexShrink: 0 }}>{rd.stressPct}%</span>
                            </div>
                            <div style={{ fontSize: '0.58rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>NDVI {rd.ndvi} · {rd.cropType}</div>
                        </div>
                    );
                })}
            </div>

            {/* Search bar */}
            <div className="card" style={{ padding: '14px 18px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', flexShrink: 0 }}>📍 Jump to coordinates:</span>
                <input id="search-lat" type="number" step="0.0001" value={searchLat} onChange={e => setSearchLat(e.target.value)} placeholder="Latitude (e.g. 28.6139)"
                    style={{ flex: 1, minWidth: '120px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', outline: 'none' }} />
                <input id="search-lon" type="number" step="0.0001" value={searchLon} onChange={e => setSearchLon(e.target.value)} placeholder="Longitude (e.g. 77.2090)"
                    style={{ flex: 1, minWidth: '120px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', outline: 'none' }} />
                <button id="search-coords-btn" className="btn btn-primary btn-sm" onClick={handleSearch} style={{ padding: '8px 18px', fontSize: '0.8rem', flexShrink: 0 }}>🎯 Go</button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleLocationSelect(28.6139, 77.2090)} style={{ padding: '8px 14px', fontSize: '0.75rem', flexShrink: 0 }}>📍 My Location (Delhi)</button>
            </div>

            {/* ── Map with scan overlay ── */}
            <div style={{ marginBottom: '20px', position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(0,229,255,0.2)', boxShadow: '0 0 32px rgba(0,229,255,0.07)' }}>
                <TileMap onLocationSelect={handleLocationSelect} selectedPin={selectedPin} onClearPin={() => { setSelectedPin(null); setLocData(null); }} />
                {/* Scan overlay */}
                <div className="ops-scan-overlay">
                    <div className="ops-scan-line" />
                </div>
                {/* Corner HUD brackets */}
                {[
                    { top: 0, left: 0, borderTop: '2px solid #00e5ff', borderLeft: '2px solid #00e5ff' },
                    { top: 0, right: 0, borderTop: '2px solid #00e5ff', borderRight: '2px solid #00e5ff' },
                    { bottom: 0, left: 0, borderBottom: '2px solid #00e5ff', borderLeft: '2px solid #00e5ff' },
                    { bottom: 0, right: 0, borderBottom: '2px solid #00e5ff', borderRight: '2px solid #00e5ff' },
                ].map((s, i) => (
                    <div key={i} style={{ position: 'absolute', width: 16, height: 16, pointerEvents: 'none', ...s }} />
                ))}
            </div>

            {/* Data panel */}
            {/* ── empty state ── */}
            {!selectedPin && !analyzing && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
                    <div className="card" style={{ textAlign: 'center', padding: '40px 24px', opacity: 0.7, gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🌍</div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Click the map or a region card above to analyse that location</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Pan by dragging · Scroll to zoom · Use quick-jump buttons inside the map</div>
                    </div>
                </div>
            )}

            {analyzing && (
                <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ width: 40, height: 40, border: '3px solid rgba(0,229,255,0.15)', borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', marginBottom: '6px' }}>Pulling satellite data for {selectedPin?.lat.toFixed(4)}°N, {selectedPin?.lon.toFixed(4)}°E…</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Querying Sentinel-2 overpass · Computing spectral indices · Cross-referencing ERA5 weather…</div>
                    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {locData && !analyzing && (<>

                {/* Coordinates strip */}
                <div style={{ padding: '10px 18px', marginBottom: '16px', borderRadius: '10px', background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#00e5ff' }}>
                        📍 {locData.lat.toFixed(6)}°N, {locData.lon.toFixed(6)}°E
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        🌾 Crop: <strong style={{ color: 'var(--color-text-primary)' }}>{locData.cropType}</strong>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        🌱 Stage: <strong style={{ color: 'var(--color-text-primary)' }}>{locData.growthStage}</strong>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Yield est: <strong style={{ color: 'var(--color-text-primary)' }}>{locData.yieldEst} t/ha</strong>
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
                        {new Date().toLocaleTimeString()} IST
                    </span>
                </div>

                {/* Top row: Gauge + Spectral + Weather */}
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: '16px', marginBottom: '16px' }}>

                    {/* Stress summary */}
                    <div className="card" style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, textAlign: 'center', padding: '24px 16px', boxShadow: `0 0 24px ${cfg.color}18` }}>
                        <StressGauge pct={locData.stressPct} color={cfg.color} />
                        <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 900, fontSize: '1rem', color: cfg.color, marginTop: '10px' }}>{cfg.icon} {locData.alertLevel}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>Yield Risk:<br /><span style={{ color: locData.yieldRisk.startsWith('HIGH') ? '#ff3864' : locData.yieldRisk.startsWith('MOD') ? '#ffd60a' : '#00ff88', fontWeight: 700 }}>{locData.yieldRisk}</span></div>
                    </div>

                    {/* Spectral indices */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">📡 Spectral Indices</span></div>
                        {[
                            { k: 'NDVI', v: locData.ndvi, desc: 'Vegetation health', color: '#00ff88', min: -1, max: 1 },
                            { k: 'NDRE', v: locData.ndre, desc: 'Chlorophyll / N proxy', color: '#aaff00', min: -1, max: 1 },
                            { k: 'MSI', v: locData.msi, desc: 'Moisture stress', color: '#00e5ff', min: 0, max: 3 },
                        ].map(idx => {
                            const norm = Math.min(1, Math.max(0, (idx.v - idx.min) / (idx.max - idx.min)));
                            const barW = idx.k === 'MSI' ? Math.min(1, idx.v / 1.5) : norm;
                            return (
                                <div key={idx.k} style={{ marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}><span style={{ color: idx.color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{idx.k}</span> — {idx.desc}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: idx.color }}>{idx.v}</span>
                                    </div>
                                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${barW * 100}%`, height: '100%', background: `linear-gradient(90deg,${idx.color}55,${idx.color})`, borderRadius: '4px', transition: 'width 0.8s ease' }} />
                                    </div>
                                </div>
                            );
                        })}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                            {[
                                { k: 'N Deficit', v: locData.nutrients.N + '%', c: '#ff3864' },
                                { k: 'P Deficit', v: locData.nutrients.P + '%', c: '#ffd60a' },
                                { k: 'K Deficit', v: locData.nutrients.K + '%', c: '#ff6b2b' },
                                { k: 'Crop Type', v: locData.cropType, c: '#00ff88' },
                            ].map(item => (
                                <div key={item.k} style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '7px' }}>
                                    <div style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{item.k}</div>
                                    <div style={{ fontSize: '0.83rem', fontWeight: 700, color: item.c, fontFamily: 'var(--font-mono)' }}>{item.v}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Weather + Soil */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">🌤️ Weather & Soil</span></div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {[
                                { icon: '🌡️', label: 'Temperature', value: `${locData.temp}°C`, color: '#ff6b2b' },
                                { icon: '💧', label: 'Humidity', value: `${locData.humidity}%`, color: '#00e5ff' },
                                { icon: '🌧️', label: 'Rainfall/mo', value: `${locData.rainfall}mm`, color: '#00e5ff' },
                                { icon: '🌱', label: 'Soil Moisture', value: `${locData.soilMoist}%`, color: '#00ff88' },
                                { icon: '📈', label: 'Growth Stage', value: locData.growthStage, color: '#aaff00' },
                                { icon: '⚖️', label: 'Yield Est.', value: `${locData.yieldEst} t/ha`, color: '#ffd60a' },
                            ].map(item => (
                                <div key={item.label} style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '9px', border: '1px solid var(--color-border)' }}>
                                    <div style={{ fontSize: '1rem', marginBottom: '3px' }}>{item.icon}</div>
                                    <div style={{ fontSize: '0.58rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '1px' }}>{item.label}</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 7-day forecast strip */}
                <div className="card" style={{ marginBottom: '16px' }}>
                    <div className="card-header"><span className="card-title">📅 7-Day Stress Forecast</span><span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Satellite revisit projection</span></div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {locData.forecast.map(day => {
                            const c = ALERT_CFG[day.level] || ALERT_CFG.SAFE;
                            const now = new Date(); now.setDate(now.getDate() + day.day);
                            return (
                                <div key={day.day} style={{ flex: 1, textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginBottom: '4px' }}>{now.toLocaleDateString('en', { weekday: 'short' })}</div>
                                    <div style={{ height: `${day.stress * 0.7 + 10}px`, minHeight: '10px', background: `linear-gradient(180deg,${c.color},${c.color}55)`, borderRadius: '4px 4px 0 0', margin: '0 4px', boxShadow: `0 0 6px ${c.color}44`, transition: 'height 0.6s ease' }} />
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: c.color, marginTop: '4px' }}>{day.stress}%</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Solution */}
                <div className="card" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, marginBottom: '16px' }}>
                    <div className="card-header"><span className="card-title">🌾 AI Field Solution</span><span style={{ fontSize: '0.65rem', color: cfg.color }}>{cfg.icon} {locData.alertLevel}</span></div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                        {locData.alertLevel === 'SAFE' && `✅ Location ${locData.lat.toFixed(3)}°N is in HEALTHY condition. NDVI: ${locData.ndvi} (good vegetation cover). Soil moisture: ${locData.soilMoist}% (adequate). Temperature: ${locData.temp}°C. Continue routine 5-day satellite monitoring. Yield estimate: ${locData.yieldEst} t/ha — on track.`}
                        {locData.alertLevel === 'MONITOR' && `⚠️ MODERATE STRESS at ${locData.lat.toFixed(3)}°N — stress at ${locData.stressPct}%. NDVI declining to ${locData.ndvi}. MSI elevated at ${locData.msi} (water stress signal). N-deficit: ${locData.nutrients.N}%. Recommended: Schedule irrigation within 48h. Apply 20kg/ha foliar nitrogen. Re-analyze in 3 days. Yield risk: ${locData.yieldRisk}.`}
                        {locData.alertLevel === 'CRITICAL' && `🚨 CRITICAL STRESS at ${locData.lat.toFixed(3)}°N — stress at ${locData.stressPct}%! NDVI severely declined: ${locData.ndvi}. MSI critical: ${locData.msi}. N-deficit: ${locData.nutrients.N}%, K-deficit: ${locData.nutrients.K}%. IMMEDIATE ACTION: Apply 45mm irrigation within 24h. Foliar urea 2% spray urgently. Contact agronomist. Without intervention, estimated yield loss: 35–55% (${locData.yieldRisk}).`}
                    </div>
                    <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.25)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.15)' }}>
                        📱 SMS: [SkyFarm] {locData.alertLevel} at {locData.lat.toFixed(3)}°N,{locData.lon.toFixed(3)}°E — {locData.cropType} stress {locData.stressPct}%. NDVI:{locData.ndvi}. {locData.alertLevel === 'CRITICAL' ? 'Irrigate NOW.' : locData.alertLevel === 'MONITOR' ? 'Irrigate within 48h.' : 'Monitor in 5d.'}
                    </div>
                    {/* OpenAI Solution */}
                    <AIInsightPanel
                        solution={aiSolution} loading={aiLoading} error={aiError} model={aiModel}
                        accentColor="#ffd60a"
                        label="🤖 Get OpenAI Global Solution"
                        onFetch={() => fetchInsight('global', {
                            lat: locData.lat.toFixed(4),
                            lon: locData.lon.toFixed(4),
                            stressPct: locData.stressPct,
                            alertLevel: locData.alertLevel,
                            ndvi: locData.ndvi,
                            ndre: locData.ndre,
                            msi: locData.msi,
                            soilMoisture: locData.soilMoist,
                            crop: locData.cropType,
                            season: locData.growthStage,
                            weatherFlags: `temp ${locData.temp}°C, humidity ${locData.humidity}%, rain ${locData.rainfall}mm/mo`,
                        })}
                        onClear={clearAI}
                    />
                </div>
                )}

                {/* ── Recent Analyses ── */}
                {recentPins.length > 1 && (
                <div className="card" style={{ marginBottom: '4px' }}>
                    <div className="card-header"><span className="card-title">📍 Recent Analyses</span><span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Click to re-load</span></div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {recentPins.map((p, i) => {
                            const rc = ALERT_CFG[p.alertLevel];
                            return (
                                <div key={i} className="ops-history-item" onClick={() => handleLocationSelect(p.lat, p.lon)}
                                    style={{ border: `1px solid ${rc.color}30` }}>
                                    <span style={{ fontSize: '0.9rem' }}>{rc.icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{p.lat.toFixed(3)}°N, {p.lon.toFixed(3)}°E</div>
                                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.62rem' }}>{p.cropType} · {p.stressPct}% stress</div>
                                    </div>
                                    <span className="ops-metric-pill" style={{ background: `${rc.color}15`, border: `1px solid ${rc.color}35`, color: rc.color }}>{p.alertLevel}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                )}

            </>)}
        </section>
    );
}
