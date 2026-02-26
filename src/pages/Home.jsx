import React, { useEffect, useRef, useState } from 'react';
import { useCountUp } from '../hooks/useCountUp';

/* ─── Animated satellite orbit canvas ───────────────────────────────────── */
function OrbitCanvas() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let rafId;
        let t = 0;

        const draw = () => {
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);

            const cx = W / 2, cy = H / 2;

            // Orbit rings
            [130, 190, 250].forEach((r, i) => {
                ctx.beginPath();
                ctx.ellipse(cx, cy, r, r * 0.38, -0.3, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0,229,255,${0.06 - i * 0.015})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            });

            // Earth/Planet
            const earthGrad = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, 58);
            earthGrad.addColorStop(0, '#0d4f3a');
            earthGrad.addColorStop(0.4, '#0a6644');
            earthGrad.addColorStop(0.7, '#073d2b');
            earthGrad.addColorStop(1, '#020d08');
            ctx.beginPath();
            ctx.arc(cx, cy, 58, 0, Math.PI * 2);
            ctx.fillStyle = earthGrad;
            ctx.fill();

            // Continent blobs
            ctx.fillStyle = 'rgba(0,255,136,0.18)';
            [[cx - 18, cy - 10, 22, 14], [cx + 8, cy + 12, 18, 10], [cx - 30, cy + 18, 12, 8]].forEach(([x, y, rw, rh]) => {
                ctx.beginPath(); ctx.ellipse(x, y, rw, rh, 0.5, 0, Math.PI * 2); ctx.fill();
            });

            // Atmosphere glow
            const atmGrad = ctx.createRadialGradient(cx, cy, 52, cx, cy, 75);
            atmGrad.addColorStop(0, 'rgba(0,229,255,0.06)');
            atmGrad.addColorStop(1, 'transparent');
            ctx.beginPath(); ctx.arc(cx, cy, 75, 0, Math.PI * 2);
            ctx.fillStyle = atmGrad; ctx.fill();

            // Satellites on orbits
            const sats = [
                { orbit: 130, speed: 0.8, startAngle: 0, size: 5, color: '#00e5ff' },
                { orbit: 190, speed: 0.5, startAngle: 2.1, size: 4, color: '#00ff88' },
                { orbit: 250, speed: 0.35, startAngle: 4.2, size: 3, color: '#7c3aed' },
            ];

            sats.forEach(sat => {
                const angle = t * sat.speed + sat.startAngle;
                const sx = cx + sat.orbit * Math.cos(angle);
                const sy = cy + sat.orbit * 0.38 * Math.sin(angle);

                // Glow
                const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sat.size * 3);
                g.addColorStop(0, sat.color + 'aa');
                g.addColorStop(1, 'transparent');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sat.size * 3, 0, Math.PI * 2); ctx.fill();

                // Body
                ctx.fillStyle = sat.color;
                ctx.beginPath(); ctx.arc(sx, sy, sat.size, 0, Math.PI * 2); ctx.fill();

                // Solar panels
                ctx.fillStyle = sat.color + '99';
                ctx.fillRect(sx - sat.size * 3.5, sy - sat.size * 0.4, sat.size * 2.5, sat.size * 0.8);
                ctx.fillRect(sx + sat.size, sy - sat.size * 0.4, sat.size * 2.5, sat.size * 0.8);

                // Signal beam to earth
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(cx + (sx - cx) * 0.4, cy + (sy - cy) * 0.4);
                ctx.strokeStyle = sat.color + '30';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            });

            // Stars
            const stars = [[20, 30], [80, 60], [150, 20], [300, 80], [350, 40], [420, 70], [500, 25], [60, 120], [380, 110]];
            stars.forEach(([sx, sy]) => {
                const twinkle = 0.4 + 0.3 * Math.sin(t * 2 + sx);
                ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
                ctx.fillRect(sx, sy, 1.5, 1.5);
            });

            t += 0.012;
            rafId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(rafId);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={560}
            height={420}
            style={{ width: '100%', height: '100%', display: 'block' }}
            aria-hidden="true"
        />
    );
}

/* ─── Floating stress heatmap preview canvas ────────────────────────────── */
function HeatmapPreview() {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        let t = 0, rafId;

        const zones = [
            { x: 0.1, y: 0.1, w: 0.35, h: 0.38, stress: 'severe', score: 87 },
            { x: 0.5, y: 0.08, w: 0.28, h: 0.32, stress: 'moderate', score: 54 },
            { x: 0.12, y: 0.55, w: 0.3, h: 0.38, stress: 'high', score: 71 },
            { x: 0.55, y: 0.48, w: 0.38, h: 0.45, stress: 'none', score: 9 },
        ];
        const COLORS = { severe: '#ff3864', high: '#ff6b2b', moderate: '#ffd60a', low: '#aaff00', none: '#00ff88' };

        const draw = () => {
            ctx.fillStyle = '#030d18'; ctx.fillRect(0, 0, W, H);
            // Grid
            ctx.strokeStyle = 'rgba(0,229,255,0.05)'; ctx.lineWidth = 1;
            for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
            for (let y = 0; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

            zones.forEach((z, i) => {
                const x = z.x * W, y = z.y * H, fw = z.w * W, fh = z.h * H;
                const c = COLORS[z.stress];
                const pulse = 0.6 + 0.15 * Math.sin(t * 1.5 + i);

                ctx.beginPath(); ctx.roundRect(x, y, fw, fh, 6);
                ctx.fillStyle = c + Math.round(pulse * 100).toString(16).padStart(2, '0');
                ctx.fill();
                ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();

                if (z.stress === 'severe' || z.stress === 'high') {
                    const ping = (t * 0.8 + i) % 1;
                    ctx.beginPath(); ctx.arc(x + fw / 2, y + fh / 2, (Math.max(fw, fh) / 2 + 10) * ping, 0, Math.PI * 2);
                    ctx.strokeStyle = c + Math.round((1 - ping) * 80).toString(16).padStart(2, '0');
                    ctx.lineWidth = 2; ctx.stroke();
                }

                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.font = 'bold 11px JetBrains Mono, monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${z.score}%`, x + fw / 2, y + fh / 2 + 4);
            });

            // Scan line
            const scanY = ((t * 50) % (H + 10)) - 5;
            const sg = ctx.createLinearGradient(0, scanY - 4, 0, scanY + 4);
            sg.addColorStop(0, 'transparent'); sg.addColorStop(0.5, 'rgba(0,229,255,0.15)'); sg.addColorStop(1, 'transparent');
            ctx.fillStyle = sg; ctx.fillRect(0, scanY - 4, W, 8);

            t += 0.016;
            rafId = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(rafId);
    }, []);

    return (
        <canvas ref={canvasRef} width={340} height={220}
            style={{ width: '100%', borderRadius: '12px', border: '1px solid rgba(0,229,255,0.15)', display: 'block' }}
            aria-label="Live stress heatmap preview"
        />
    );
}

/* ─── Animated stat counter ─────────────────────────────────────────────── */
function StatCounter({ end, unit, decimals = 0 }) {
    const val = useCountUp(end, 1800);
    return <>{decimals ? val.toFixed(decimals) : Math.round(val)}{unit}</>;
}

/* ─── Feature card ──────────────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, color, delay }) {
    return (
        <div className="card animate-fade-up" style={{
            animationDelay: `${delay}ms`,
            borderTop: `2px solid ${color}`,
            transition: 'all 0.3s ease',
        }}>
            <div style={{
                width: '48px', height: '48px', borderRadius: '14px', marginBottom: '16px',
                background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', border: `1px solid ${color}33`,
            }}>{icon}</div>
            <h3 style={{ fontFamily: 'var(--font-primary)', fontSize: '1rem', fontWeight: 700, marginBottom: '8px', color: 'var(--color-text-primary)' }}>{title}</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)', lineHeight: 1.7, margin: 0 }}>{desc}</p>
        </div>
    );
}

/* ─── Process step ──────────────────────────────────────────────────────── */
function ProcessStep({ num, icon, title, desc, color }) {
    return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                    width: '52px', height: '52px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: color + '18', border: `2px solid ${color}`, fontSize: '1.4rem',
                    boxShadow: `0 0 20px ${color}30`,
                }}>{icon}</div>
                {num < 4 && <div style={{ width: '2px', height: '40px', background: `linear-gradient(${color}, transparent)`, marginTop: '4px' }} />}
            </div>
            <div style={{ paddingTop: '8px' }}>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Step {num}</div>
                <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 700, fontSize: '1rem', marginBottom: '6px', color: 'var(--color-text-primary)' }}>{title}</div>
                <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
        </div>
    );
}

/* ─── HOME PAGE ─────────────────────────────────────────────────────────── */
export default function Home({ setActivePage }) {

    /* Scroll-reveal via IntersectionObserver */
    useEffect(() => {
        const els = document.querySelectorAll('.reveal');
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed'); });
        }, { threshold: 0.15 });
        els.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, []);

    return (
        <div id="home-page" style={{ overflow: 'hidden' }}>

            {/* ── HERO ─────────────────────────────────────────────── */}
            <section style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', position: 'relative', padding: '60px 48px' }}>
                {/* Ambient glow blobs */}
                <div style={{ position: 'absolute', top: '-10%', left: '5%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,255,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '0', right: '5%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,255,136,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

                <div style={{ flex: 1, maxWidth: '580px', zIndex: 1 }}>
                    {/* Eyebrow */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '6px 16px', borderRadius: '100px', marginBottom: '28px',
                        background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)',
                        fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                        color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.12em',
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent-green)', animation: 'ping 1.5s ease infinite', display: 'inline-block' }} />
                        Powered by Sentinel-2 + Hyperspectral AI
                    </div>

                    <h1 style={{
                        fontFamily: 'var(--font-primary)', fontSize: 'clamp(2.8rem, 5vw, 4.8rem)',
                        fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: '24px',
                    }}>
                        <span style={{ color: 'var(--color-text-primary)' }}>See Crop Stress</span><br />
                        <span style={{
                            background: 'linear-gradient(135deg, #00e5ff 0%, #00ff88 55%, #00e5ff 100%)',
                            backgroundSize: '200% 200%', animation: 'gradientShift 4s ease infinite',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                        }}>Before It's Visible.</span>
                    </h1>

                    <p style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)', lineHeight: 1.75, marginBottom: '36px', maxWidth: '500px' }}>
                        <strong style={{ color: 'var(--color-text-primary)' }}>SkyFarm</strong> uses hyperspectral satellite imaging and AI to detect water stress and nutrient deficiency <em>10–21 days</em> before visible yellowing — saving yield, saving farms.
                    </p>

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '48px' }}>
                        <button className="btn btn-primary" id="home-cta-dashboard" onClick={() => setActivePage('dashboard')} style={{ padding: '14px 32px', fontSize: '0.95rem' }}>
                            🛰️ Open Dashboard
                        </button>
                        <button className="btn btn-secondary" id="home-cta-stressview" onClick={() => setActivePage('stressview')} style={{ padding: '14px 32px', fontSize: '0.95rem' }}>
                            🔬 Stress-Vision Demo
                        </button>
                    </div>

                    {/* Trust indicators */}
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Detection Lead Time', val: '21 days' },
                            { label: 'Accuracy Rate', val: '94%' },
                            { label: 'Coverage Resolution', val: '10 m/px' },
                        ].map(d => (
                            <div key={d.label}>
                                <div style={{ fontFamily: 'var(--font-primary)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>{d.val}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{d.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Hero visual */}
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '420px', position: 'relative', zIndex: 1 }}>
                    <div style={{ width: '100%', maxWidth: '520px', animation: 'float 5s ease-in-out infinite' }}>
                        <OrbitCanvas />
                    </div>
                </div>
            </section>

            {/* ── STATS BAR ───────────────────────────────────────── */}
            <section style={{
                padding: '32px 48px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)',
                background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(12px)',
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '24px', textAlign: 'center' }}>
                    {[
                        { val: 247, unit: ' ha', dec: 0, label: 'Area Monitored', icon: '🌍' },
                        { val: 94, unit: '%', dec: 0, label: 'Pre-Visual Accuracy', icon: '🎯' },
                        { val: 6.8, unit: 's', dec: 1, label: 'Processing Latency', icon: '⚡' },
                        { val: 10, unit, dec: 0, label: 'Day Detection Lead', icon: '📅', unit: '+' },
                        { val: 3, unit: '', dec: 0, label: 'Satellites Active', icon: '🛰️' },
                        { val: 100, unit: '%', dec: 0, label: 'Open Standard APIs', icon: '🔗' },
                    ].map(s => (
                        <div key={s.label} className="reveal" style={{ opacity: 0, transform: 'translateY(20px)', transition: 'all 0.6s ease' }}>
                            <div style={{ fontSize: '1.1rem', marginBottom: '6px' }}>{s.icon}</div>
                            <div style={{ fontFamily: 'var(--font-primary)', fontSize: '2rem', fontWeight: 900, color: 'var(--color-primary)', lineHeight: 1 }}>
                                <StatCounter end={s.val} unit={s.unit} decimals={s.dec} />
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── PROBLEM / SOLUTION ──────────────────────────────── */}
            <section style={{ padding: '80px 48px' }}>
                <div style={{ textAlign: 'center', marginBottom: '56px' }}>
                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>The Problem We Solve</div>
                    <h2 style={{ fontFamily: 'var(--font-primary)', fontSize: 'clamp(1.8rem, 3.5vw, 3rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>
                        Traditional NDVI <span style={{ color: 'var(--color-accent-red)' }}>Already Too Late.</span>
                    </h2>
                    <p style={{ fontSize: '1rem', color: 'var(--color-text-muted)', maxWidth: '560px', margin: '16px auto 0', lineHeight: 1.7 }}>
                        By the time a satellite detects yellowing in standard RGB imagery, up to 40% of the harvestable yield is already lost. SkyFarm acts earlier — in the invisible spectrum.
                    </p>
                </div>

                <div className="grid-2" style={{ gap: '32px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                            { scenario: 'Traditional RGB Monitoring', day: 'Day 0', desc: 'Crop looks healthy in true-color imagery. No alert triggered.', bad: false },
                            { scenario: 'Physiological Stress Onset', day: 'Day +3', desc: 'Chlorophyll fluorescence begins to decline — detectable only in hyperspectral bands. SkyFarm fires an alert here.', bad: false, highlight: true },
                            { scenario: 'NDVI begins to drop', day: 'Day +8', desc: 'Standard NDVI now shows slight decline. Moderate corrective action still possible.', bad: false },
                            { scenario: 'Visual Yellowing Appears', day: 'Day +18', desc: 'Traditional systems finally detect stress. Yield loss already 30–40%. Too late for most interventions.', bad: true },
                        ].map(item => (
                            <div key={item.day} style={{
                                padding: '16px 20px', borderRadius: '12px',
                                background: item.highlight ? 'rgba(0,229,255,0.06)' : item.bad ? 'rgba(255,56,100,0.05)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${item.highlight ? 'rgba(0,229,255,0.25)' : item.bad ? 'rgba(255,56,100,0.2)' : 'var(--color-border)'}`,
                                borderLeft: `3px solid ${item.highlight ? 'var(--color-primary)' : item.bad ? 'var(--color-accent-red)' : 'var(--color-border)'}`,
                            }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: item.highlight ? 'var(--color-primary)' : item.bad ? 'var(--color-accent-red)' : 'var(--color-text-muted)' }}>{item.day}</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>{item.scenario}</span>
                                    {item.highlight && <span className="badge badge-running" style={{ fontSize: '0.6rem', marginLeft: 'auto' }}>SkyFarm Detects</span>}
                                    {item.bad && <span className="badge badge-severe" style={{ fontSize: '0.6rem', marginLeft: 'auto' }}>Too Late</span>}
                                </div>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{item.desc}</p>
                            </div>
                        ))}
                    </div>

                    {/* Live heatmap preview */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{
                            padding: '20px', borderRadius: '16px',
                            background: 'rgba(10,25,41,0.8)', border: '1px solid var(--color-border)',
                            backdropFilter: 'blur(16px)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live Stress-Vision™ Preview</span>
                                <span className="badge badge-running" style={{ fontSize: '0.62rem' }}>● Scanning</span>
                            </div>
                            <HeatmapPreview />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                <span>Values: Stress Index % per zone</span>
                                <span>10m resolution</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FEATURES ────────────────────────────────────────── */}
            <section style={{ padding: '72px 48px', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ textAlign: 'center', marginBottom: '52px' }}>
                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-accent-green)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>Platform Capabilities</div>
                    <h2 style={{ fontFamily: 'var(--font-primary)', fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>
                        Everything You Need to<br /><span style={{ color: 'var(--color-accent-green)' }}>Protect Your Harvest</span>
                    </h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                    {[
                        { icon: '🔬', title: 'Hyperspectral CNN Analysis', color: '#00e5ff', delay: 0, desc: 'A custom ResNet-1D architecture processes 200 narrow spectral bands to detect chlorophyll fluorescence decline and carotenoid shifts 10–21 days before visible symptom onset.' },
                        { icon: '🌡️', title: 'Thermal Infrared (LST) Maps', color: '#ff6b2b', delay: 80, desc: 'Derive Land Surface Temperature from ASTER TIR bands. Compute Crop Water Stress Index (CWSI) — stressed crops transpire less and run hotter by up to 10°C.' },
                        { icon: '📊', title: 'Multi-Index Fusion Dashboard', color: '#00ff88', delay: 160, desc: 'Combine NDVI, NDWI, Red-Edge CRE, and thermal anomaly scores into a single unified stress probability map using a calibrated weighted ensemble model.' },
                        { icon: '🚨', title: 'Pre-Visual Alert Engine', color: '#ff3864', delay: 240, desc: 'Priority-ranked alerts fire the moment the AI detects spectral anomalies. Receive irrigation schedules, nitrogen recommendations, and action deadlines — days in advance.' },
                        { icon: '🗺️', title: 'Zone Segmentation (U-Net)', color: '#7c3aed', delay: 320, desc: 'Semantic segmentation of field-scale stress zones into GeoJSON polygons. Drill into individual sub-field zones and compare across seasons.' },
                        { icon: '🛰️', title: 'Multi-Satellite Constellation', color: '#ffd60a', delay: 400, desc: 'Automated ingestion from Sentinel-2A/B (5-day revisit, 10m) and ASTER (90m TIR). Atmospheric correction via Sen2Cor for bottom-of-atmosphere reflectance.' },
                    ].map(f => <FeatureCard key={f.title} {...f} />)}
                </div>
            </section>

            {/* ── HOW IT WORKS ────────────────────────────────────── */}
            <section style={{ padding: '80px 48px' }}>
                <div className="grid-2" style={{ gap: '64px', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>Under the Hood</div>
                        <h2 style={{ fontFamily: 'var(--font-primary)', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '40px' }}>
                            From Orbit to Insight<br />in <span style={{ color: 'var(--color-primary)' }}>Under 7 Seconds</span>
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <ProcessStep num={1} icon="🛰️" color="#00e5ff" title="Satellite Acquisition" desc="Sentinel-2 Level-1C imagery and ASTER TIR data pulled from ESA Copernicus Hub and NASA EarthData at every 5-day overpass." />
                            <ProcessStep num={2} icon="📡" color="#00ff88" title="Atmospheric Correction" desc="Sen2Cor converts Top-of-Atmosphere reflectance to Bottom-of-Atmosphere, removing aerosol, water vapor, and Rayleigh scattering effects." />
                            <ProcessStep num={3} icon="🔬" color="#7c3aed" title="Hyperspectral AI Inference" desc="ResNet-1D + Attention model extracts 512-dim spectral features per pixel, detecting pre-visual stress signatures invisible to standard RGB cameras." />
                            <ProcessStep num={4} icon="🚨" color="#ff3864" title="Alert & Recommendation" desc="Priority engine scores zones and instantly generates agronomic recommendations — irrigation schedules, fertilizer plans, and mobile alerts." />
                        </div>
                    </div>

                    {/* Tech stack badges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ padding: '28px', borderRadius: '20px', background: 'rgba(10,25,41,0.8)', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>Technology Stack</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {[
                                    ['Python 3.12', '#00e5ff'], ['PyTorch 2.x', '#ee4c2c'], ['GDAL / Rasterio', '#6ab04c'],
                                    ['Sentinel-2', '#00a8e0'], ['ASTER TIR', '#ff6b2b'], ['Sen2Cor 2.11', '#00ff88'],
                                    ['ResNet-1D', '#7c3aed'], ['U-Net Seg.', '#f39c12'], ['GeoJSON/GeoTIFF', '#3498db'],
                                    ['FastAPI', '#009688'], ['React + Vite', '#61dafb'], ['Canvas API', '#00e5ff'],
                                ].map(([name, color]) => (
                                    <span key={name} style={{
                                        padding: '6px 14px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600,
                                        fontFamily: 'var(--font-mono)', background: `${color}18`, color, border: `1px solid ${color}33`,
                                    }}>{name}</span>
                                ))}
                            </div>
                        </div>

                        <div style={{ padding: '24px', borderRadius: '16px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary)' }}>🌍 Supporting UN SDG 2 — Zero Hunger</div>
                            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
                                Early crop stress detection directly reduces food insecurity by giving farmers the time to intervene before yield loss becomes irreversible — advancing the global goal of Zero Hunger by 2030.
                            </p>
                        </div>

                        <div style={{ padding: '24px', borderRadius: '16px', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary)' }}>📦 Open Standards / Interoperability</div>
                            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
                                All outputs are OGC/STAC-compliant GeoJSON and GeoTIFF. REST API ready to integrate with existing precision agriculture management systems, irrigation controllers, and ERP platforms.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── CTA BANNER ──────────────────────────────────────── */}
            <section style={{
                margin: '0 48px 80px', padding: '56px 48px', borderRadius: '24px', textAlign: 'center',
                background: 'linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(0,255,136,0.06) 100%)',
                border: '1px solid rgba(0,229,255,0.18)', position: 'relative', overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '300px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🚀</div>
                    <h2 style={{ fontFamily: 'var(--font-primary)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '16px' }}>
                        Start Monitoring Your Fields Today
                    </h2>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem', maxWidth: '500px', margin: '0 auto 32px', lineHeight: 1.7 }}>
                        Open the live Stress-Vision™ dashboard, explore the AI pipeline, or navigate straight to an active stress alert — all in your browser, no install required.
                    </p>
                    <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" id="home-bottom-cta" onClick={() => setActivePage('dashboard')} style={{ padding: '14px 36px', fontSize: '0.95rem' }}>
                            🌿 Launch Dashboard
                        </button>
                        <button className="btn btn-secondary" id="home-pipeline-cta" onClick={() => setActivePage('pipeline')} style={{ padding: '14px 36px', fontSize: '0.95rem' }}>
                            ⚡ See the Pipeline
                        </button>
                        <button className="btn btn-ghost" id="home-alerts-cta" onClick={() => setActivePage('alerts')} style={{ padding: '14px 36px', fontSize: '0.95rem' }}>
                            🚨 View Alerts
                        </button>
                    </div>
                </div>
            </section>

            {/* Scroll-reveal CSS injected here */}
            <style>{`
        .revealed { opacity: 1 !important; transform: translateY(0) !important; }
      `}</style>
        </div>
    );
}
