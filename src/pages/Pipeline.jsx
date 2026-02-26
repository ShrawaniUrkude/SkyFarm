import React, { useState, useEffect, useRef } from 'react';
import { PIPELINE_STEPS } from '../utils/data';

const STEP_DETAILS = {
    ingest: {
        title: 'Satellite Data Ingestion',
        desc: 'Raw Level-1C imagery is pulled from ESA Copernicus Hub (Sentinel-2) and NASA EarthData (ASTER). Data includes 13 multispectral bands (10–60m resolution) plus TIR bands (90m).',
        inputs: ['Sentinel-2 L1C tiles (.SAFE)', 'ASTER HDF-EOS files', 'Ephemeris/orbit metadata'],
        outputs: ['Raw band arrays [B1..B12, TIR1..5]', 'Cloud mask pre-screen', 'Metadata JSON'],
        params: [{ label: 'Tile Grid', value: '32R/33R (UTM)' }, { label: 'Cloud Cover', value: '< 15%' }, { label: 'Revisit Time', value: '5 days' }],
    },
    calibrate: {
        title: 'Radiometric & Atmospheric Correction',
        desc: 'Convert DN values to Top-of-Atmosphere reflectance, then apply Sen2Cor for atmospheric correction to Bottom-of-Atmosphere. Correct for Rayleigh scattering, aerosol, and water vapor absorption.',
        inputs: ['Raw DN values', 'Solar zenith angle', 'Esun constants (solar irradiance)'],
        outputs: ['BOA reflectance [0..1]', 'Scene classification layer', 'Water vapor map'],
        params: [{ label: 'Algorithm', value: 'Sen2Cor 02.11' }, { label: 'DEM', value: 'SRTM 30m' }, { label: 'AOT Est.', value: 'Auto-detect' }],
    },
    index: {
        title: 'Vegetation Index Extraction',
        desc: 'Compute suite of spectral indices from corrected reflectances. NDVI for general vegetation health, NDWI for water content, Red-Edge indices (CRE, IRECI) for early chlorophyll loss, SAVI for soil-adjusted analysis.',
        inputs: ['BOA reflectance bands', 'Band math formulas'],
        outputs: ['NDVI raster', 'NDWI raster', 'CRE raster', 'IRECI raster', 'SAVI raster'],
        params: [{ label: 'NDVI Formula', value: '(NIR-Red)/(NIR+Red)' }, { label: 'CRE Formula', value: 'NIR/RedEdge - 1' }, { label: 'Spatial Res', value: '10m/px' }],
    },
    thermal: {
        title: 'Thermal Infrared Analysis (LST)',
        desc: 'Convert ASTER TIR-band radiance to Land Surface Temperature using the Temperature/Emissivity Separation (TES) algorithm. Compute Crop Water Stress Index (CWSI) from LST vs reference temperature.',
        inputs: ['ASTER TIR bands 10–14', 'NDVI (emissivity proxy)', 'Ref. elevation map'],
        outputs: ['LST raster (°C)', 'CWSI map', 'Thermal anomaly detection layer'],
        params: [{ label: 'Algorithm', value: 'TES (Gillespie 1998)' }, { label: 'Resolution', value: '90m → 10m interp' }, { label: 'Accuracy', value: '±1.5°C' }],
    },
    hypspec: {
        title: 'Hyperspectral CNN Feature Extraction',
        desc: 'A custom ResNet-1D architecture processes 200-band hyperspectral cubes (simulated from Sentinel-2 + S2S expansion). The model extracts latent spectral features indicative of chlorophyll fluorescence decline, carotenoid accumulation, and water potential changes — detectable 10–21 days pre-visual.',
        inputs: ['12-band Sentinel-2 corrected cube', 'PRISMA/DESIS hyperspectral auxiliary', 'Training labels (field-truth stress maps)'],
        outputs: ['512-dim spectral feature vectors', 'Per-pixel stress probability [0..1]', 'Band importance heatmap'],
        params: [{ label: 'Architecture', value: 'ResNet-1D + Attention' }, { label: 'Bands', value: '200 (10nm width)' }, { label: 'Lead Time', value: '10–21 days' }],
    },
    fuse: {
        title: 'Multi-Modal Sensor Fusion',
        desc: 'Weighted ensemble combining NDVI velocity (rate of change), LST anomaly magnitude, Red-Edge shift, and CNN hyperspectral features using a learned linear fusion layer. Outputs unified stress probability map.',
        inputs: ['NDVI Δvelocity raster', 'LST anomaly raster', 'CRE raster', 'CNN feature vectors'],
        outputs: ['Unified stress probability map [0..1]', 'Uncertainty bounds', 'Feature contribution weights'],
        params: [{ label: 'Weights', value: 'Learned (calibration set)' }, { label: 'Fusion', value: 'Weighted linear ensemble' }, { label: 'Uncertainty', value: 'Monte Carlo Dropout' }],
    },
    map: {
        title: 'Stress Zone Segmentation',
        desc: 'Apply semantic segmentation (U-Net) to the fused probability map to delineate field-scale stress zones. Each zone is assigned a stress severity class and area estimate. Output is a GeoJSON polygon layer.',
        inputs: ['Fused probability map', 'Field boundary shapefile', 'Historical reference maps'],
        outputs: ['Stress zone GeoJSON polygons', 'Per-zone statistics CSV', 'Change detection diff map'],
        params: [{ label: 'Model', value: 'U-Net (ResNet-34 enc)' }, { label: 'Min Zone', value: '0.5 ha' }, { label: 'Classes', value: '5 (none → severe)' }],
    },
    alert: {
        title: 'Alert Engine & Recommendations',
        desc: 'Priority scoring algorithm ranks zones by stress severity × crop economic value. Generates actionable recommendations (irrigation scheduling, fertilizer application schedule) and pushes alerts to agronomist dashboard and mobile app.',
        inputs: ['Stress zone polygons', 'Crop calendar + yield model', 'Irrigation system API'],
        outputs: ['Priority-ranked alert list', 'Irrigation schedule JSON', 'Mobile push notifications'],
        params: [{ label: 'Priority', value: 'Severity × Economic weight' }, { label: 'Lead Action', value: 'Pre-visual (10–21 days)' }, { label: 'Channels', value: 'Dashboard + SMS + API' }],
    },
};

function PipelineCanvas({ steps, activeStep }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const nodeCount = steps.length;
        const spacing = W / (nodeCount + 1);
        const cx = (i) => spacing * (i + 1);
        const cy = H / 2;
        const R = 28;

        // Connector lines
        steps.forEach((step, i) => {
            if (i === nodeCount - 1) return;
            const x1 = cx(i) + R, x2 = cx(i + 1) - R;
            const isActive = step.status === 'completed';

            if (isActive) {
                const grad = ctx.createLinearGradient(x1, cy, x2, cy);
                grad.addColorStop(0, '#00e5ff');
                grad.addColorStop(1, step.status === 'completed' && steps[i + 1].status !== 'pending' ? '#00ff88' : '#00e5ff40');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
            }
            ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke();
            ctx.setLineDash([]);

            // Data flow particle
            if (step.status === 'completed') {
                const t = (Date.now() / 1000) % 1;
                const px = x1 + (x2 - x1) * t;
                ctx.beginPath(); ctx.arc(px, cy, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#00e5ff';
                ctx.fill();
            }
        });

        // Nodes
        steps.forEach((step, i) => {
            const x = cx(i);
            const isActive = step.id === activeStep;
            const isCompleted = step.status === 'completed';
            const isPending = step.status === 'pending';

            // Outer ring
            ctx.beginPath(); ctx.arc(x, cy, R + 4, 0, Math.PI * 2);
            if (isCompleted) {
                ctx.strokeStyle = 'rgba(0,255,136,0.3)';
                ctx.lineWidth = 1;
            } else if (isActive) {
                ctx.strokeStyle = `rgba(0,229,255,${0.4 + 0.3 * Math.sin(Date.now() / 400)})`;
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = 'transparent';
            }
            ctx.stroke();

            // Node fill
            ctx.beginPath(); ctx.arc(x, cy, R, 0, Math.PI * 2);
            if (isCompleted) {
                const g = ctx.createRadialGradient(x, cy, 0, x, cy, R);
                g.addColorStop(0, 'rgba(0,255,136,0.3)'); g.addColorStop(1, 'rgba(0,255,136,0.05)');
                ctx.fillStyle = g;
                ctx.strokeStyle = '#00ff88';
            } else if (isActive) {
                const g = ctx.createRadialGradient(x, cy, 0, x, cy, R);
                g.addColorStop(0, 'rgba(0,229,255,0.3)'); g.addColorStop(1, 'rgba(0,229,255,0.05)');
                ctx.fillStyle = g;
                ctx.strokeStyle = '#00e5ff';
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            }
            ctx.lineWidth = isActive ? 2 : 1;
            ctx.fill(); ctx.stroke();

            // Progress arc for active
            if (isActive && step.progress > 0) {
                ctx.beginPath();
                ctx.arc(x, cy, R, -Math.PI / 2, -Math.PI / 2 + (step.progress / 100) * Math.PI * 2);
                ctx.strokeStyle = '#00e5ff';
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            // Icon/number
            ctx.font = `18px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isCompleted ? '#00ff88' : isActive ? '#00e5ff' : 'rgba(255,255,255,0.3)';
            if (isCompleted) {
                ctx.fillText('✓', x, cy);
            } else {
                ctx.font = `14px serif`;
                ctx.fillText(step.icon, x, cy);
            }

            // Label
            ctx.font = `bold 9px 'JetBrains Mono', monospace`;
            ctx.fillStyle = isCompleted ? '#00ff88cc' : isActive ? '#00e5ffcc' : 'rgba(255,255,255,0.25)';
            ctx.textBaseline = 'top';
            const words = step.label.split(' ');
            words.forEach((word, wi) => ctx.fillText(word, x, cy + R + 10 + wi * 12));

        }, []);

    });

    // Continuous animation for active particles
    useEffect(() => {
        let rafId;
        const redraw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const W = canvas.width, H = canvas.height;
            const nodeCount = steps.length;
            const spacing = W / (nodeCount + 1);
            const cx = (i) => spacing * (i + 1);
            const cy = H / 2;
            const R = 28;

            // Only redraw connecting lines + particles
            steps.forEach((step, i) => {
                if (i === nodeCount - 1) return;
                if (step.status !== 'completed') return;
                const x1 = cx(i) + R, x2 = cx(i + 1) - R;
                // Particle
                const t = (Date.now() / 800) % 1;
                const px = x1 + (x2 - x1) * t;

                // Clear particle area
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(x1 + 1, cy - 8, x2 - x1 - 2, 16);
                // Redraw line under particle
                const grad = ctx.createLinearGradient(x1, cy, x2, cy);
                grad.addColorStop(0, '#00e5ff'); grad.addColorStop(1, '#00e5ff40');
                ctx.strokeStyle = grad; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke();
                ctx.restore();

                ctx.beginPath(); ctx.arc(px, cy, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#00e5ff';
                ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 8;
                ctx.fill(); ctx.shadowBlur = 0;
            });

            rafId = requestAnimationFrame(redraw);
        };
        rafId = requestAnimationFrame(redraw);
        return () => cancelAnimationFrame(rafId);
    }, [steps]);

    return (
        <canvas
            ref={canvasRef}
            width={900}
            height={140}
            style={{ width: '100%', height: '140px' }}
            aria-label="AI processing pipeline diagram"
        />
    );
}

export default function Pipeline() {
    const [activeStep, setActiveStep] = useState('hypspec');
    const [progress, setProgress] = useState(73);

    // Simulate progress
    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(p => {
                if (p >= 100) { clearInterval(interval); return 100; }
                return p + 0.3;
            });
        }, 300);
        return () => clearInterval(interval);
    }, []);

    const detail = STEP_DETAILS[activeStep];
    const step = PIPELINE_STEPS.find(s => s.id === activeStep);

    return (
        <section className="page-section" id="pipeline-page">
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">⚡ Data Processing Architecture</div>
                    <h1 className="section-title">AI Processing Pipeline</h1>
                    <p className="section-desc">End-to-end hyperspectral and thermal infrared data processing pipeline — from raw satellite ingestion to actionable stress alerts.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                    <span className="badge badge-running">● Processing</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Step 5/8</span>
                </div>
            </div>

            {/* Pipeline canvas */}
            <div className="card" style={{ padding: '24px 12px', marginBottom: '24px', overflow: 'hidden' }}>
                <PipelineCanvas steps={PIPELINE_STEPS} activeStep={activeStep} />

                {/* Click targets (invisible overlay buttons) */}
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '4px' }}>
                    {PIPELINE_STEPS.map(s => (
                        <button key={s.id} id={`pipeline-step-${s.id}`} onClick={() => setActiveStep(s.id)} style={{
                            background: activeStep === s.id ? 'rgba(0,229,255,0.1)' : 'transparent',
                            border: `1px solid ${activeStep === s.id ? 'rgba(0,229,255,0.3)' : 'transparent'}`,
                            borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', color: 'transparent', fontSize: '0.7rem',
                            width: `${100 / PIPELINE_STEPS.length}%`, height: '20px',
                        }}>{s.label}</button>
                    ))}
                </div>
            </div>

            {/* Detail + status row */}
            <div className="grid-2" style={{ gap: '20px', marginBottom: '24px' }}>
                {/* Active step detail */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-primary-dim)', border: '2px solid var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                            {step?.icon}
                        </div>
                        <div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
                                <span style={{ fontFamily: 'var(--font-primary)', fontSize: '1rem', fontWeight: 700 }}>{detail.title}</span>
                                <span className={`badge badge-${step?.status === 'completed' ? 'done' : step?.status === 'active' ? 'running' : 'moderate'}`}>
                                    {step?.status}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>{detail.desc}</p>
                        </div>
                    </div>

                    {step?.status === 'active' && (
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Processing progress</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-primary)' }}>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="grid-2" style={{ gap: '12px' }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Inputs</div>
                            {detail.inputs.map(inp => (
                                <div key={inp} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--color-primary)', fontSize: '0.7rem', marginTop: '3px' }}>▶</span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{inp}</span>
                                </div>
                            ))}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Outputs</div>
                            {detail.outputs.map(out => (
                                <div key={out} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--color-accent-green)', fontSize: '0.7rem', marginTop: '3px' }}>✓</span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{out}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Parameters + All steps status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="card">
                        <div className="card-header"><span className="card-title">⚙️ Step Parameters</span></div>
                        <table className="data-table">
                            <tbody>
                                {detail.params.map(p => (
                                    <tr key={p.label}>
                                        <td style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', width: '40%' }}>{p.label}</td>
                                        <td style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">📋 All Steps Status</span></div>
                        {PIPELINE_STEPS.map(s => (
                            <div key={s.id} onClick={() => setActiveStep(s.id)} style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                                background: activeStep === s.id ? 'rgba(0,229,255,0.07)' : 'transparent',
                                transition: 'background 0.2s',
                            }}>
                                <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center' }}>{s.icon}</span>
                                <span style={{ flex: 1, fontSize: '0.8rem', color: activeStep === s.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{s.label}</span>
                                {s.status === 'completed' && <span style={{ color: 'var(--color-accent-green)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>✓ {s.duration}</span>}
                                {s.status === 'active' && <span className="badge badge-running" style={{ fontSize: '0.6rem' }}>● {s.progress}%</span>}
                                {s.status === 'pending' && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>—</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tech specs */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title">🏗️ System Architecture</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {[
                        { icon: '🛰️', label: 'Data Sources', value: 'Sentinel-2 + ASTER + PRISMA', sub: 'ESA Copernicus / NASA' },
                        { icon: '🧠', label: 'AI Backbone', value: 'ResNet-1D + U-Net', sub: 'PyTorch 2.x / CUDA' },
                        { icon: '⚡', label: 'Processing', value: '6.8s end-to-end latency', sub: 'GPU cluster (A100)' },
                        { icon: '🎯', label: 'Accuracy', value: '94% pre-visual detection', sub: '10–21 day lead time' },
                        { icon: '🌍', label: 'Coverage', value: '10m spatial resolution', sub: '5-day revisit cycle' },
                        { icon: '📡', label: 'Output Format', value: 'GeoJSON + GeoTIFF + REST', sub: 'OGC/STAC compliant' },
                    ].map(item => (
                        <div key={item.label} style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{item.icon}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{item.label}</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '2px' }}>{item.value}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{item.sub}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
