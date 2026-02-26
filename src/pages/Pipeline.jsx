import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Static step data ───────────────────────────────────────────────────── */
const STEPS_DATA = [
    { id: 'ingest', icon: '🛰️', label: 'Data Ingestion', sublabel: 'Sentinel-2 / ASTER', durationMs: 1200, color: '#00e5ff' },
    { id: 'calibrate', icon: '📡', label: 'Radiometric Calib', sublabel: 'Atmospheric correction', durationMs: 900, color: '#00ff88' },
    { id: 'index', icon: '📊', label: 'Index Extraction', sublabel: 'NDVI, NDWI, Red-edge', durationMs: 1800, color: '#aaff00' },
    { id: 'thermal', icon: '🌡️', label: 'Thermal Analysis', sublabel: 'LST from TIR bands', durationMs: 1400, color: '#ffd60a' },
    { id: 'hypspec', icon: '🔬', label: 'Hyperspectral AI', sublabel: 'CNN feature extraction', durationMs: 2800, color: '#7c3aed' },
    { id: 'fuse', icon: '🔮', label: 'Sensor Fusion', sublabel: 'Multi-modal ensemble', durationMs: 600, color: '#00e5ff' },
    { id: 'map', icon: '🗺️', label: 'Stress Mapping', sublabel: 'Zone segmentation', durationMs: 900, color: '#ff6b2b' },
    { id: 'alert', icon: '🚨', label: 'Alert Engine', sublabel: 'Priority scoring + notify', durationMs: 400, color: '#ff3864' },
];

const STEP_DETAILS = {
    ingest: { title: 'Satellite Data Ingestion', desc: 'Raw Level-1C imagery pulled from ESA Copernicus Hub & NASA EarthData. 13 multispectral bands + TIR bands.', inputs: ['Sentinel-2 L1C tiles (.SAFE)', 'ASTER HDF-EOS files', 'Orbit metadata'], outputs: ['Raw band arrays [B1..B12, TIR1..5]', 'Cloud mask pre-screen', 'Metadata JSON'], params: [{ k: 'Tile Grid', v: '32R/33R (UTM)' }, { k: 'Cloud Cover Limit', v: '< 15%' }, { k: 'Revisit', v: '5 days' }] },
    calibrate: { title: 'Radiometric & Atmospheric Correction', desc: 'Convert DN → TOA reflectance, then Sen2Cor for BOA correction. Removes aerosol, water vapor, Rayleigh scattering.', inputs: ['Raw DN values', 'Solar zenith angle', 'Esun irradiance constants'], outputs: ['BOA reflectance [0..1]', 'Scene classification layer', 'Water vapor map'], params: [{ k: 'Algorithm', v: 'Sen2Cor 02.11' }, { k: 'DEM', v: 'SRTM 30m' }, { k: 'AOT Estimation', v: 'Auto-detect' }] },
    index: { title: 'Vegetation Index Extraction', desc: 'Compute NDVI, NDWI, NDRE, CRE, IRECI, SAVI and MSI from corrected reflectances.', inputs: ['BOA reflectance bands', 'Band math config'], outputs: ['NDVI raster', 'NDWI raster', 'CRE raster', 'IRECI raster'], params: [{ k: 'NDVI Formula', v: '(NIR−Red)/(NIR+Red)' }, { k: 'NDRE Formula', v: '(NIR−RedEdge)/(NIR+RedEdge)' }, { k: 'Spatial Res', v: '10m/px' }] },
    thermal: { title: 'Thermal Infrared Analysis (LST)', desc: 'TES algorithm converts ASTER TIR radiance to Land Surface Temperature. Computes CWSI from canopy vs reference temp.', inputs: ['ASTER TIR bands 10–14', 'NDVI emissivity proxy', 'Reference DEM'], outputs: ['LST raster (°C)', 'CWSI map', 'Thermal anomaly layer'], params: [{ k: 'Algorithm', v: 'TES (Gillespie 1998)' }, { k: 'Resolution', v: '90m → 10m interp' }, { k: 'Accuracy', v: '±1.5°C' }] },
    hypspec: { title: 'Hyperspectral CNN Inference', desc: 'ResNet-1D + Attention model extracts 512-dim spectral features per pixel. Detects chlorophyll fluorescence decline 10–21 days pre-visual.', inputs: ['12-band corrected cube', 'PRISMA auxiliary data', 'Stress training labels'], outputs: ['512-dim feature vectors', 'Per-pixel stress prob [0..1]', 'Band importance heatmap'], params: [{ k: 'Architecture', v: 'ResNet-1D + Attention' }, { k: 'Lead Time', v: '10–21 days' }, { k: 'Bands', v: '200 (10nm)' }] },
    fuse: { title: 'Multi-Modal Sensor Fusion', desc: 'Weighted ensemble combines NDVI velocity, LST anomaly, CRE shift, and CNN features into a unified stress probability map.', inputs: ['NDVI Δvelocity', 'LST anomaly', 'CRE raster', 'CNN features'], outputs: ['Unified stress prob map', 'Uncertainty bounds', 'Feature weights'], params: [{ k: 'Weights', v: 'Learned calibration' }, { k: 'Fusion', v: 'Weighted linear ensemble' }, { k: 'Uncertainty', v: 'Monte Carlo Dropout' }] },
    map: { title: 'Stress Zone Segmentation (U-Net)', desc: 'Semantic segmentation delineates stress zones into GeoJSON polygons with severity class and area estimates.', inputs: ['Fused probability map', 'Field boundary shapefile', 'Historical reference'], outputs: ['GeoJSON zone polygons', 'Per-zone CSV statistics', 'Change detection diff'], params: [{ k: 'Model', v: 'U-Net (ResNet-34 enc)' }, { k: 'Min Zone', v: '0.5 ha' }, { k: 'Classes', v: '5 (none→severe)' }] },
    alert: { title: 'Alert Engine & Recommendations', desc: 'Priority scoring ranks zones by stress × economic value. Generates irrigation schedules and pushes alerts to dashboard + SMS.', inputs: ['Stress zone GeoJSON', 'Crop yield model', 'Irrigation API'], outputs: ['Priority-ranked alerts', 'Irrigation schedule JSON', 'Mobile push notifications'], params: [{ k: 'Priority', v: 'Severity × Economic weight' }, { k: 'Lead Action', v: '10–21 days pre-visual' }, { k: 'Channels', v: 'Dashboard + SMS + API' }] },
};

/* ─── Log message templates per step ────────────────────────────────────── */
const LOG_TEMPLATES = {
    ingest: ['[INF] Connecting to ESA Copernicus Open Access Hub…', '[INF] Querying S2A_MSIL1C tile 32RKH…', '[INF] Tile found: 2026-02-24T10:22:31Z', '[DWL] Downloading 13 bands + metadata (842 MB)…', '[OK ] Download complete. Cloud coverage: 6.3%.', '[INF] ASTER HDF-EOS acquired from NASA EarthData.'],
    calibrate: ['[INF] Initialising Sen2Cor 02.11 …', '[INF] Computing solar zenith angle: 42.3°', '[INF] AOT estimated: 0.12 (low aerosol)', '[INF] Rayleigh correction applied.', '[INF] Water vapor correction applied (PWV: 18mm)', '[OK ] BOA reflectance generated. QA4 score: 0.97'],
    index: ['[INF] Computing NDVI = (B8−B4)/(B8+B4) …', '[INF] NDVI range: −0.12 to 0.89 | Mean: 0.58', '[INF] Computing NDWI = (B3−B8)/(B3+B8) …', '[INF] Computing Red-Edge CRE = B8A/B5 − 1 …', '[INF] Computing MSI = B11/B8 …', '[WARN] Zone Z1 NDVI declining: 0.42 (↓0.09 vs baseline)', '[OK ] 5 index rasters written (GeoTIFF, EPSG:32643)'],
    thermal: ['[INF] Loading ASTER TIR bands 10–14 (90m res)…', '[INF] Applying TES algorithm (Gillespie 1998)…', '[INF] LST computed. Range: 28.9°C–42.1°C', '[WARN] Zone Z1 canopy temp: 42.1°C (+9.6°C above ambient)', '[INF] CWSI map generated. Zones Z1, Z6 critical.', '[OK ] Thermal anomaly layer exported.'],
    hypspec: ['[INF] Loading ResNet-1D model (512 latent dims)…', '[INF] Generating 200-band hyperspectral cube (S2→PRISMA expansion)…', '[GPU] CUDA batch inference: 1.2M pixels', '[INF] Chlorophyll fluorescence decline detected: Z1 (−18%), Z6 (−14%)', '[INF] Carotenoid accumulation anomaly: Z4 (+11 σ)', '[WARN] Pre-visual stress signature in Z1 — 14 days before visible yellowing', '[OK ] Per-pixel stress probability map complete.'],
    fuse: ['[INF] Initialising multi-modal fusion layer…', '[INF] Weights: NDVI-vel=0.30, LST-anom=0.25, CRE=0.20, CNN=0.25', '[INF] Fusing 4 feature streams…', '[INF] Uncertainty quantification via MC-Dropout (N=50)…', '[OK ] Unified stress map ready. σ < 0.04 (high confidence)'],
    map: ['[INF] Loading U-Net segmentation model (ResNet-34 encoder)…', '[INF] Running semantic segmentation on fused probability map…', '[INF] Post-processing: morphological close, min-area 0.5ha', '[INF] Identified 6 stress zones matching field boundaries', '[OK ] GeoJSON polygon layer written. 6 zones, 5 severity classes.'],
    alert: ['[INF] Scoring zones by severity × economic weight…', '[CRIT] ALERT A001 fired: Zone Z1 — Water Deficit. Action window < 18h.', '[CRIT] ALERT A002 fired: Zone Z6 — Heat Stress. Action window < 42h.', '[INF] Irrigation schedule generated for Z1 (45mm deficit drip).', '[INF] SMS alert dispatched to 3 agronomist contacts.', '[OK ] Pipeline complete. Total latency: 6.8s.'],
};

/* ─── Past run history ───────────────────────────────────────────────────── */
const PAST_RUNS = [
    { id: 'RUN-003', date: '2026-02-26 09:12', duration: '6.8s', status: 'success', stressZones: 4, alertsFired: 2 },
    { id: 'RUN-002', date: '2026-02-21 08:44', duration: '7.1s', status: 'success', stressZones: 3, alertsFired: 1 },
    { id: 'RUN-001', date: '2026-02-16 10:02', duration: '9.3s', status: 'warning', stressZones: 2, alertsFired: 0 },
];

/* ─── Mini throughput chart ──────────────────────────────────────────────── */
function ThroughputChart({ steps }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        const PAD = { top: 14, right: 10, bottom: 32, left: 36 };
        const cW = W - PAD.left - PAD.right;
        const cH = H - PAD.top - PAD.bottom;
        ctx.clearRect(0, 0, W, H);

        const durations = steps.map(s => s.durationMs);
        const maxD = Math.max(...durations);
        const bW = cW / steps.length - 6;

        steps.forEach((s, i) => {
            const bH = (s.durationMs / maxD) * cH;
            const x = PAD.left + i * (cW / steps.length) + 3;
            const y = PAD.top + cH - bH;

            const grad = ctx.createLinearGradient(x, y, x, y + bH);
            grad.addColorStop(0, s.color);
            grad.addColorStop(1, s.color + '33');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.roundRect(x, y, bW, bH, 4); ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = '8px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${(s.durationMs / 1000).toFixed(1)}s`, x + bW / 2, y - 4);

            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '7px monospace';
            ctx.fillText(s.icon, x + bW / 2, PAD.top + cH + 12);
        });

        // Y axis
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
        [0, 0.5, 1].forEach(f => {
            const y = PAD.top + cH - f * cH;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '8px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${(f * maxD / 1000).toFixed(1)}s`, PAD.left - 2, y + 3);
        });
    }, [steps]);
    return <canvas ref={canvasRef} width={640} height={160} style={{ width: '100%', height: '160px' }} />;
}

/* ─── Animated pipeline node row ────────────────────────────────────────── */
function NodeRow({ steps, activeIdx, runState }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 8px', overflowX: 'auto' }}>
            {steps.map((s, i) => {
                const isDone = runState === 'idle' ? i < 5 : i < activeIdx;
                const isActive = runState !== 'idle' && i === activeIdx;
                const isPending = runState !== 'idle' ? i > activeIdx : i >= 5;
                const color = isDone ? '#00ff88' : isActive ? s.color : 'rgba(255,255,255,0.15)';

                return (
                    <React.Fragment key={s.id}>
                        {/* Node */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0, width: '72px' }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%',
                                background: isDone ? 'rgba(0,255,136,0.12)' : isActive ? `${s.color}18` : 'rgba(255,255,255,0.03)',
                                border: `2px solid ${color}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.2rem', position: 'relative',
                                boxShadow: isActive ? `0 0 18px ${s.color}55` : 'none',
                                animation: isActive ? 'pulse-ring 1.5s ease infinite' : 'none',
                                transition: 'all 0.4s ease',
                            }}>
                                {isDone ? '✓' : s.icon}
                                {isActive && (
                                    <div style={{
                                        position: 'absolute', inset: -4, borderRadius: '50%',
                                        border: `2px solid ${s.color}44`,
                                        animation: 'ping 1.2s ease infinite',
                                    }} />
                                )}
                            </div>
                            <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color, textAlign: 'center', lineHeight: 1.3 }}>
                                {s.label.split(' ').slice(0, 2).join('\n')}
                            </div>
                        </div>
                        {/* Connector */}
                        {i < steps.length - 1 && (
                            <div style={{ flex: 1, height: 2, minWidth: 12, position: 'relative', alignSelf: 'flex-start', marginTop: 22 }}>
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: isDone ? `linear-gradient(90deg, #00ff88, ${steps[i + 1].color})` : 'rgba(255,255,255,0.08)',
                                    transition: 'background 0.5s ease',
                                }} />
                                {isDone && (
                                    <div style={{
                                        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                                        width: 6, height: 6, borderRadius: '50%', background: '#00e5ff',
                                        boxShadow: '0 0 8px #00e5ff',
                                        animation: 'flow-particle 1.2s linear infinite',
                                    }} />
                                )}
                            </div>
                        )}
                        <style>{`
              @keyframes flow-particle {
                0%   { left: 0%; }
                100% { left: 100%; }
              }
              @keyframes pulse-ring {
                0%,100% { box-shadow: 0 0 12px ${s.color}44; }
                50%      { box-shadow: 0 0 28px ${s.color}88; }
              }
            `}</style>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

/* ─── Log console ────────────────────────────────────────────────────────── */
function LogConsole({ logs }) {
    const ref = useRef(null);
    useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
    return (
        <div ref={ref} style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem', lineHeight: 1.8,
            height: '200px', overflowY: 'auto', padding: '12px 16px',
            background: 'rgba(0,0,0,0.5)', borderRadius: '12px',
            border: '1px solid rgba(0,229,255,0.1)',
        }}>
            {logs.length === 0 && (
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>{'>'} Awaiting pipeline start…</span>
            )}
            {logs.map((log, i) => {
                const col = log.startsWith('[OK') ? '#00ff88'
                    : log.startsWith('[WARN') ? '#ffd60a'
                        : log.startsWith('[CRIT') ? '#ff3864'
                            : log.startsWith('[DWL') ? '#00e5ff'
                                : log.startsWith('[GPU') ? '#7c3aed'
                                    : 'rgba(255,255,255,0.55)';
                return <div key={i} style={{ color: col }}><span style={{ opacity: 0.3, marginRight: 8 }}>{'>'}</span>{log}</div>;
            })}
            {logs.length > 0 && <span style={{ color: 'rgba(0,229,255,0.6)', animation: 'ping 1s ease infinite', display: 'inline-block' }}>▋</span>}
        </div>
    );
}

/* ─── Live metric card ───────────────────────────────────────────────────── */
function LiveMetric({ label, value, unit, color, icon }) {
    return (
        <div style={{ padding: '14px 18px', borderRadius: '12px', background: `${color}0d`, border: `1px solid ${color}33`, textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{icon}</div>
            <div style={{ fontFamily: 'var(--font-primary)', fontSize: '1.4rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.35)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{unit}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{label}</div>
        </div>
    );
}

/* ─── Main Pipeline Page ─────────────────────────────────────────────────── */
export default function Pipeline() {
    const [activeStepId, setActiveStepId] = useState('hypspec');
    const [runState, setRunState] = useState('idle');   // idle | running | done
    const [activeIdx, setActiveIdx] = useState(-1);
    const [stepProgress, setStepProgress] = useState(0);       // 0–100 for current step
    const [logs, setLogs] = useState([]);
    const [metrics, setMetrics] = useState({ tiles: 0, mb: 0, pixels: 0, elapsed: 0 });
    const [runs, setRuns] = useState(PAST_RUNS);
    const [tab, setTab] = useState('pipeline'); // pipeline | history | config
    const timerRef = useRef(null);
    const logIdxRef = useRef({});
    const startTimeRef = useRef(null);

    const detail = STEP_DETAILS[activeStepId];
    const stepObj = STEPS_DATA.find(s => s.id === activeStepId);

    /* ── run pipeline simulation ── */
    const runPipeline = useCallback(() => {
        if (runState === 'running') return;
        setRunState('running');
        setActiveIdx(0);
        setLogs([]);
        setStepProgress(0);
        logIdxRef.current = {};
        startTimeRef.current = Date.now();

        let stepI = 0;

        const nextStep = () => {
            if (stepI >= STEPS_DATA.length) {
                setRunState('done');
                setActiveIdx(-1);
                const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
                setRuns(prev => [{
                    id: `RUN-${String(prev.length + 1).padStart(3, '0')}`,
                    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
                    duration: `${elapsed}s`,
                    status: 'success', stressZones: 4, alertsFired: 2,
                }, ...prev]);
                return;
            }

            const step = STEPS_DATA[stepI];
            setActiveIdx(stepI);
            setActiveStepId(step.id);
            setStepProgress(0);

            const stepLogs = LOG_TEMPLATES[step.id] || [];
            let logI = 0;

            const progressInterval = setInterval(() => {
                setStepProgress(p => {
                    const next = p + (100 / (step.durationMs / 80));
                    return next >= 100 ? 100 : next;
                });
                // Emit a log line
                if (logI < stepLogs.length) {
                    setLogs(prev => [...prev, stepLogs[logI++]]);
                }
                // Update live metrics
                setMetrics(prev => ({
                    tiles: Math.min(prev.tiles + 0.3, 18),
                    mb: Math.min(prev.mb + 12, 842),
                    pixels: Math.min(prev.pixels + 48000, 1200000),
                    elapsed: ((Date.now() - startTimeRef.current) / 1000).toFixed(1),
                }));
            }, 80);

            timerRef.current = setTimeout(() => {
                clearInterval(progressInterval);
                setStepProgress(100);
                stepI++;
                setTimeout(nextStep, 150);
            }, step.durationMs);
        };

        nextStep();
    }, [runState]);

    const resetPipeline = () => {
        clearTimeout(timerRef.current);
        setRunState('idle'); setActiveIdx(-1); setStepProgress(0);
        setLogs([]); setMetrics({ tiles: 0, mb: 0, pixels: 0, elapsed: 0 });
    };

    useEffect(() => () => clearTimeout(timerRef.current), []);

    return (
        <section className="page-section" id="pipeline-page">
            {/* Header */}
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">⚡ Data Processing Architecture</div>
                    <h1 className="section-title">AI Processing Pipeline</h1>
                    <p className="section-desc">End-to-end hyperspectral + thermal IR pipeline — from raw satellite ingestion to actionable stress alerts. Click <strong>Run Pipeline</strong> to simulate live execution.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                    {runState === 'running' && <span className="badge badge-running" style={{ fontSize: '0.7rem' }}>● Processing {STEPS_DATA[activeIdx]?.label}</span>}
                    {runState === 'done' && <span className="badge badge-done" style={{ fontSize: '0.7rem' }}>✓ Complete — {metrics.elapsed}s</span>}
                    {runState !== 'idle' && <button className="btn btn-ghost btn-sm" onClick={resetPipeline}>↺ Reset</button>}
                    <button
                        id="run-pipeline-btn"
                        className={`btn ${runState === 'running' ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        onClick={runState === 'running' ? undefined : runPipeline}
                        disabled={runState === 'running'}
                        style={{ padding: '10px 22px', fontSize: '0.85rem', opacity: runState === 'running' ? 0.6 : 1 }}
                    >
                        {runState === 'running' ? '⏳ Running…' : '▶ Run Pipeline'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: '20px' }}>
                {[['pipeline', '🔬 Live Pipeline'], ['history', '📋 Run History'], ['config', '⚙️ Configuration']].map(([id, lbl]) => (
                    <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
                ))}
            </div>

            {/* ── PIPELINE TAB ── */}
            {tab === 'pipeline' && (<>

                {/* Node row */}
                <div className="card" style={{ padding: '24px 16px', marginBottom: '20px', overflow: 'hidden' }}>
                    <NodeRow steps={STEPS_DATA} activeIdx={activeIdx} runState={runState} />
                    {/* Step progress bar */}
                    {runState === 'running' && (
                        <div style={{ marginTop: '20px', padding: '0 8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: STEPS_DATA[activeIdx]?.color }}>
                                    {STEPS_DATA[activeIdx]?.label} — {STEPS_DATA[activeIdx]?.sublabel}
                                </span>
                                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: STEPS_DATA[activeIdx]?.color }}>
                                    {stepProgress.toFixed(0)}%
                                </span>
                            </div>
                            <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '100px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: '100px',
                                    width: `${stepProgress}%`,
                                    background: `linear-gradient(90deg, ${STEPS_DATA[activeIdx]?.color}88, ${STEPS_DATA[activeIdx]?.color})`,
                                    transition: 'width 0.1s linear',
                                }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Live metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    <LiveMetric label="Tiles Fetched" value={metrics.tiles.toFixed(1)} unit="Sentinel-2 tiles" color="#00e5ff" icon="🛰️" />
                    <LiveMetric label="Data Processed" value={Math.round(metrics.mb)} unit="MB ingested" color="#00ff88" icon="💾" />
                    <LiveMetric label="Pixels Analyzed" value={`${(metrics.pixels / 1000).toFixed(0)}K`} unit="per-pixel RF inference" color="#7c3aed" icon="🔬" />
                    <LiveMetric label="Elapsed" value={`${metrics.elapsed}s`} unit="pipeline latency" color="#ffd60a" icon="⚡" />
                </div>

                {/* Detail + log row */}
                <div className="grid-2" style={{ gap: '20px', marginBottom: '20px' }}>
                    {/* Step detail */}
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${stepObj?.color}18`, border: `2px solid ${stepObj?.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
                                {stepObj?.icon}
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>{detail.title}</div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>{detail.desc}</p>
                            </div>
                        </div>
                        <div className="grid-2" style={{ gap: '12px', marginBottom: '14px' }}>
                            <div>
                                <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Inputs</div>
                                {detail.inputs.map(v => (
                                    <div key={v} style={{ display: 'flex', gap: '8px', marginBottom: '5px', alignItems: 'flex-start' }}>
                                        <span style={{ color: '#00e5ff', fontSize: '0.65rem', marginTop: '3px' }}>▶</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Outputs</div>
                                {detail.outputs.map(v => (
                                    <div key={v} style={{ display: 'flex', gap: '8px', marginBottom: '5px', alignItems: 'flex-start' }}>
                                        <span style={{ color: '#00ff88', fontSize: '0.65rem', marginTop: '3px' }}>✓</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Params */}
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                            <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Parameters</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {detail.params.map(p => (
                                    <div key={p.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{p.k}</span>
                                        <span style={{ fontSize: '0.72rem', color: stepObj?.color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{p.v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Step list + log */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* All steps list */}
                        <div className="card" style={{ padding: '14px' }}>
                            <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>All Steps</div>
                            {STEPS_DATA.map((s, i) => {
                                const isDone = runState === 'idle' ? i < 5 : i < activeIdx;
                                const isActive = runState !== 'idle' && i === activeIdx;
                                return (
                                    <div key={s.id} onClick={() => setActiveStepId(s.id)} style={{
                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
                                        borderRadius: '8px', cursor: 'pointer',
                                        background: activeStepId === s.id ? `${s.color}12` : 'transparent',
                                        borderLeft: `3px solid ${activeStepId === s.id ? s.color : 'transparent'}`,
                                        transition: 'all 0.2s',
                                    }}>
                                        <span style={{ fontSize: '0.9rem', width: 18, textAlign: 'center' }}>{s.icon}</span>
                                        <span style={{ flex: 1, fontSize: '0.78rem', color: activeStepId === s.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{s.label}</span>
                                        {isDone && <span style={{ fontSize: '0.65rem', color: '#00ff88', fontFamily: 'var(--font-mono)' }}>✓ {(s.durationMs / 1000).toFixed(1)}s</span>}
                                        {isActive && <span className="badge badge-running" style={{ fontSize: '0.58rem' }}>● {stepProgress.toFixed(0)}%</span>}
                                        {!isDone && !isActive && <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)' }}>—</span>}
                                    </div>
                                );
                            })}
                        </div>
                        {/* Log console */}
                        <div>
                            <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
                                System Log {logs.length > 0 && `(${logs.length} lines)`}
                            </div>
                            <LogConsole logs={logs} />
                        </div>
                    </div>
                </div>

                {/* Throughput chart */}
                <div className="card">
                    <div className="card-header"><span className="card-title">📊 Step Duration Breakdown</span><span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>target latency per step</span></div>
                    <ThroughputChart steps={STEPS_DATA} />
                </div>
            </>)}

            {/* ── HISTORY TAB ── */}
            {tab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="alert alert-info" style={{ marginBottom: '8px' }}>
                        <span className="alert-icon">📋</span>
                        <div>Showing last <strong>{runs.length}</strong> pipeline runs. Click <strong>Run Pipeline</strong> to add a new entry.</div>
                    </div>
                    {runs.map(r => (
                        <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '18px 24px' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, color: 'var(--color-primary)', fontSize: '0.9rem', minWidth: 80 }}>{r.id}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-primary)', fontWeight: 600, marginBottom: '2px' }}>{r.date}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Duration: {r.duration} · Stress zones: {r.stressZones} · Alerts fired: {r.alertsFired}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {r.alertsFired > 0 && <span className="badge badge-critical" style={{ fontSize: '0.62rem' }}>🚨 {r.alertsFired} alerts</span>}
                                <span className={`badge badge-${r.status === 'success' ? 'done' : 'moderate'}`} style={{ fontSize: '0.65rem' }}>
                                    {r.status === 'success' ? '✓ Success' : '⚠ Warning'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── CONFIG TAB ── */}
            {tab === 'config' && (
                <div className="grid-2" style={{ gap: '20px' }}>
                    {[
                        { title: '🛰️ Data Source', fields: [['Satellite', 'Sentinel-2A/B + ASTER'], ['Tile Grid', 'UTM 32R/33R'], ['Max Cloud Cover', '15%'], ['Revisit Cycle', '5 days']] },
                        { title: '🧠 AI Model', fields: [['Architecture', 'ResNet-1D + Attention'], ['Bands', '200 (10nm width)'], ['Latent Dims', '512'], ['Inference', 'GPU (CUDA 12)']] },
                        { title: '📊 Indices', fields: [['NDVI Formula', '(NIR−Red)/(NIR+Red)'], ['NDRE Formula', '(NIR−RedEdge)/(NIR+RedEdge)'], ['MSI Formula', 'SWIR/NIR'], ['CWSI', 'Via TES algorithm']] },
                        { title: '🚨 Alert Engine', fields: [['SAFE threshold', '< 30% stress'], ['MONITOR threshold', '30%–60%'], ['CRITICAL threshold', '> 60%'], ['SMS Dispatch', 'Enabled']] },
                    ].map(section => (
                        <div key={section.title} className="card">
                            <div className="card-header"><span className="card-title">{section.title}</span><span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>read-only</span></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {section.fields.map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{k}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* System arch footer */}
            {tab === 'pipeline' && (
                <div className="card" style={{ marginTop: '20px' }}>
                    <div className="card-header"><span className="card-title">🏗️ System Architecture</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        {[
                            { icon: '🛰️', label: 'Data Sources', value: 'Sentinel-2 + ASTER', sub: 'ESA Copernicus / NASA' },
                            { icon: '🧠', label: 'AI Backbone', value: 'ResNet-1D + U-Net', sub: 'PyTorch 2.x / CUDA' },
                            { icon: '⚡', label: 'Latency', value: '6.8s end-to-end', sub: 'GPU cluster (A100)' },
                            { icon: '🎯', label: 'Accuracy', value: '94% pre-visual', sub: '10–21 day lead time' },
                            { icon: '🌍', label: 'Resolution', value: '10m/px', sub: '5-day revisit cycle' },
                            { icon: '📡', label: 'Output Format', value: 'GeoJSON + REST', sub: 'OGC/STAC compliant' },
                        ].map(item => (
                            <div key={item.label} style={{ padding: '14px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '1.3rem', marginBottom: '6px' }}>{item.icon}</div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{item.label}</div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '2px' }}>{item.value}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{item.sub}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
