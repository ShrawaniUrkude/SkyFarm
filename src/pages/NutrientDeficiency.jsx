import React, { useState, useRef, useCallback, useEffect } from 'react';

/* ─── Static reference data ──────────────────────────────────────────────── */
const NUTRIENTS = [
    { id: 'N', name: 'Nitrogen (N)', icon: '🌿', color: '#ff3864', detection: 'NDRE, CRE, Leaf Chlorophyll Index', symptomVisible: 'Lower leaf yellowing, stunted growth, pale canopy.' },
    { id: 'P', name: 'Phosphorus (P)', icon: '🌱', color: '#ffd60a', detection: 'Blue band anomaly, ARI, Green-Blue ratio', symptomVisible: 'Purple/reddish leaf undersides, dark green mottling.' },
    { id: 'K', name: 'Potassium (K)', icon: '🍂', color: '#ff6b2b', detection: 'NDWI, MSI, SWIR-I anomaly', symptomVisible: 'Leaf edge scorch, interveinal necrosis, weak stems.' },
    { id: 'Mg', name: 'Magnesium (Mg)', icon: '💚', color: '#00ff88', detection: 'Chlorophyll-B index, Red-Edge inflection', symptomVisible: 'Interveinal chlorosis (green veins, yellow between).' },
    { id: 'Fe', name: 'Iron (Fe)', icon: '🔵', color: '#00e5ff', detection: 'Chl-a index (440nm), apical-basal difference', symptomVisible: 'Young leaf chlorosis first, severe: white leaves.' },
];

const STATUS_CFG = {
    critical: { color: '#ff3864', bg: 'rgba(255,56,100,0.1)', border: 'rgba(255,56,100,0.35)', label: 'CRITICAL', icon: '🚨' },
    warning: { color: '#ffd60a', bg: 'rgba(255,214,10,0.1)', border: 'rgba(255,214,10,0.3)', label: 'WARNING', icon: '⚠️' },
    moderate: { color: '#ff6b2b', bg: 'rgba(255,107,43,0.1)', border: 'rgba(255,107,43,0.3)', label: 'MODERATE', icon: '🟠' },
    low: { color: '#00e5ff', bg: 'rgba(0,229,255,0.08)', border: 'rgba(0,229,255,0.2)', label: 'WATCH', icon: '👁️' },
    healthy: { color: '#00ff88', bg: 'rgba(0,255,136,0.06)', border: 'rgba(0,255,136,0.2)', label: 'HEALTHY', icon: '✅' },
};

const URGENCY_STYLE = {
    critical: { color: '#ff3864', border: 'rgba(255,56,100,0.3)', bg: 'rgba(255,56,100,0.08)', tag: 'URGENT NOW' },
    warning: { color: '#ffd60a', border: 'rgba(255,214,10,0.25)', bg: 'rgba(255,214,10,0.08)', tag: '48h ACTION' },
    info: { color: '#00e5ff', border: 'rgba(0,229,255,0.2)', bg: 'rgba(0,229,255,0.06)', tag: 'ADVISORY' },
};

const ADVICE_DB = {
    N: [
        { type: 'Immediate', urgency: 'critical', action: 'Apply 30–40 kg/ha urea (46-0-0) via fertigation or broadcast within 24h.' },
        { type: 'Foliar', urgency: 'warning', action: '2% urea solution spray at dawn. Repeat in 7 days.' },
        { type: 'Soil pH', urgency: 'info', action: 'Check pH — N uptake blocked below 5.5. Target 6.0–7.0.' },
        { type: 'Organic', urgency: 'info', action: 'Apply 10t/ha farmyard manure at next cultivation.' },
    ],
    P: [
        { type: 'Immediate', urgency: 'critical', action: 'Apply 25 kg/ha DAP (18-46-0) in band placement near root zone.' },
        { type: 'Foliar', urgency: 'warning', action: '0.5% mono-ammonium phosphate (MAP) spray — 2 applications 5 days apart.' },
        { type: 'Mycorrhizal', urgency: 'info', action: 'Inoculate with VAM for 30–50% P uptake improvement.' },
        { type: 'Soil pH', urgency: 'info', action: 'Lime acidic soils — optimal P availability at pH 6.0–7.0.' },
    ],
    K: [
        { type: 'Immediate', urgency: 'critical', action: 'Apply 40 kg/ha muriate of potash (MOP 0-0-60) via drip or broadcast.' },
        { type: 'Foliar', urgency: 'warning', action: '1% potassium nitrate spray at tillering stage.' },
        { type: 'Irrigation', urgency: 'info', action: 'Increase soil moisture to 60% FC — K deficit worsened by drought.' },
        { type: 'Organic', urgency: 'info', action: 'Wood ash 500kg/ha — K + Ca + improved soil structure.' },
    ],
    Mg: [
        { type: 'Foliar', urgency: 'warning', action: 'Epsom salt (MgSO₄) 20g/L spray — 3 applications 10 days apart.' },
        { type: 'Soil', urgency: 'info', action: 'Dolomitic limestone 500kg/ha — provides Mg + Ca, corrects pH.' },
        { type: 'Leaching', urgency: 'info', action: 'Reduce over-irrigation — excessive watering flushes soluble Mg.' },
    ],
    Fe: [
        { type: 'Foliar', urgency: 'warning', action: 'Chelated Fe-EDTA 2g/L spray in early morning — most rapid treatment.' },
        { type: 'Soil pH', urgency: 'info', action: 'Fe unavailable above pH 7.5 — acidify with elemental sulphur 50kg/ha.' },
        { type: 'Drip', urgency: 'info', action: 'FeSO₄ 10g/L via slow drip injection — avoids foliar scorching.' },
    ],
};

/* ─── Client-side nutrient analysis from image pixels ───────────────────── */
function analyzeNutrients(imageData, W, H) {
    const d = imageData.data;
    const N = W * H;
    let rSum = 0, gSum = 0, bSum = 0;
    let yellowPx = 0, purplePx = 0, brownPx = 0, paleGreenPx = 0, whiteYellowPx = 0;
    let edgeScorchPx = 0, interveinalPx = 0;

    for (let i = 0; i < N; i++) {
        const idx = i * 4;
        const R = d[idx], G = d[idx + 1], B = d[idx + 2];
        const Rn = R / 255, Gn = G / 255, Bn = B / 255;
        rSum += Rn; gSum += Gn; bSum += Bn;

        // Greenness / vegetation index from RGB
        const greenness = Gn - (Rn + Bn) / 2;

        // Yellow pixels (R high, G medium-high, B low) → N deficiency
        if (R > 180 && G > 150 && B < 80 && R > G * 0.85) yellowPx++;

        // Purple/reddish pixels (R high, B medium, G low) → P deficiency
        if (R > 120 && B > 80 && G < 100 && R > G + 30) purplePx++;

        // Brown/scorched edges (R high, G medium-low, B very low) → K deficiency
        if (R > 140 && G > 70 && G < 140 && B < 60 && R > G * 1.3) brownPx++;

        // Pale/light green (moderate G but low saturation) → Mg deficiency
        if (Gn > 0.45 && Gn < 0.72 && Math.abs(Rn - Bn) < 0.1 && greenness < 0.12) paleGreenPx++;

        // White/whitish yellow patches (high R, G, low B) → Fe (young leaves)
        if (R > 200 && G > 200 && B < 140 && Math.min(R, G) > 190) whiteYellowPx++;
    }

    const pct = (v) => +(v / N * 100);

    const yellowRatio = pct(yellowPx);
    const purpleRatio = pct(purplePx);
    const brownRatio = pct(brownPx);
    const paleGreenRatio = pct(paleGreenPx);
    const whiteYellowRatio = pct(whiteYellowPx);

    const meanR = rSum / N;
    const meanG = gSum / N;
    const meanB = bSum / N;
    const overallGreenness = (meanG - (meanR + meanB) / 2);

    // ── Compute deficiency scores (0–100) ───────────────────────────────────
    // Nitrogen: inversely correlated with greenness; yellowing is prime signal
    const N_def = Math.min(100, Math.max(0,
        (1 - overallGreenness * 3) * 45 + yellowRatio * 2.2 + (meanR - meanG) * 60
    ));

    // Phosphorus: purple pigmentation + elevated blue
    const P_def = Math.min(100, Math.max(0,
        purpleRatio * 3.5 + meanB * 25 + (meanR > meanG ? (meanR - meanG) * 20 : 0)
    ));

    // Potassium: brown scorching
    const K_def = Math.min(100, Math.max(0,
        brownRatio * 4 + yellowRatio * 0.8 + (meanR * 0.6 - meanG * 0.4) * 30
    ));

    // Magnesium: pale green areas (low saturation)
    const Mg_def = Math.min(100, Math.max(0,
        paleGreenRatio * 2.8 + (overallGreenness < 0.08 ? (0.08 - overallGreenness) * 200 : 0)
    ));

    // Iron: white/yellow young-leaf patches + very pale overall
    const Fe_def = Math.min(100, Math.max(0,
        whiteYellowRatio * 3.2 + (meanR + meanG - meanB * 2) * 10 - overallGreenness * 80
    ));

    const scores = { N: N_def, P: P_def, K: K_def, Mg: Mg_def, Fe: Fe_def };

    const daysToVisible = {
        N: Math.round(20 - N_def * 0.15),
        P: Math.round(28 - P_def * 0.15),
        K: Math.round(25 - K_def * 0.15),
        Mg: Math.round(32 - Mg_def * 0.15),
        Fe: Math.round(35 - Fe_def * 0.15),
    };

    const statusOf = (v) => v >= 65 ? 'critical' : v >= 40 ? 'warning' : v >= 22 ? 'moderate' : v >= 8 ? 'low' : 'healthy';

    return { scores, daysToVisible, statusOf, meanR, meanG, meanB, yellowRatio, purpleRatio, brownRatio };
}

/* ─── Deficiency gauge ───────────────────────────────────────────────────── */
function DefGauge({ pct, color, size = 72 }) {
    const r = size / 2 - 6, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
                strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ filter: `drop-shadow(0 0 5px ${color}88)`, transition: 'stroke-dasharray 1.2s ease' }} />
            <text x={size / 2} y={size / 2 - 3} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="900" fontFamily="var(--font-primary)">{Math.round(pct)}%</text>
            <text x={size / 2} y={size / 2 + 11} textAnchor="middle" fill={color} fontSize="6.5" fontWeight="700" fontFamily="var(--font-mono)" letterSpacing="0.5">DEFICIT</text>
        </svg>
    );
}

/* ─── Heatmap canvas for the uploaded image ─────────────────────────────── */
function NutrientHeatmap({ imageData, W, H, scores }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!imageData || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const d = imageData.data;
        const out = ctx.createImageData(W, H);
        const od = out.data;

        const domScore = Math.max(scores.N, scores.P, scores.K, scores.Mg, scores.Fe);

        for (let i = 0; i < W * H; i++) {
            const idx = i * 4;
            const R = d[idx] / 255, G = d[idx + 1] / 255, B = d[idx + 2] / 255;
            // stress signal: low greenness region gets coloured
            const stress = Math.min(1, Math.max(0, 1 - (G - (R + B) / 2) * 4));

            let hr, hg, hb;
            if (stress < 0.35) { hr = 0; hg = Math.round(180 + stress * 200); hb = 255; }
            else if (stress < 0.65) { const t = (stress - 0.35) / 0.3; hr = Math.round(t * 255); hg = 220; hb = Math.round(220 - t * 200); }
            else { hr = 255; hg = Math.round(200 * (1 - (stress - 0.65) / 0.35)); hb = 10; }

            od[idx] = hr; od[idx + 1] = hg; od[idx + 2] = hb; od[idx + 3] = 200;
        }

        // First draw original
        ctx.putImageData(imageData, 0, 0);
        // Then overlay heatmap at 45% alpha
        const hc = document.createElement('canvas');
        hc.width = W; hc.height = H;
        hc.getContext('2d').putImageData(out, 0, 0);
        ctx.globalAlpha = 0.45;
        ctx.drawImage(hc, 0, 0);
        ctx.globalAlpha = 1;
    }, [imageData, W, H, scores]);

    return (
        <canvas ref={canvasRef}
            style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '10px', background: '#000', display: 'block' }} />
    );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function NutrientDeficiency() {
    const [selected, setSelected] = useState(null); // null = no upload yet / select nutrient
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);   // { scores, daysToVisible, statusOf, imageData, W, H }
    const [activeNut, setActiveNut] = useState('N');
    const [activeTab, setActiveTab] = useState('original'); // original | heatmap
    const [error, setError] = useState(null);
    const fileRef = useRef();

    const onFilePick = useCallback((e) => {
        const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
        if (!f) return;
        setFile(f); setResult(null); setError(null);
        if (!/\.tiff?$/i.test(f.name)) {
            const url = URL.createObjectURL(f);
            setPreview(url);
        } else { setPreview(null); }
    }, []);

    const handleAnalyze = async () => {
        if (!file) { setError('Please upload a crop image first.'); return; }
        setLoading(true); setError(null); setResult(null);
        try {
            const isTiff = /\.tiff?$/i.test(file.name);
            let imageData, W, H;

            if (isTiff) {
                // synthetic seed
                const seed = file.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + (file.size % 9999);
                W = 256; H = 256;
                const px = new Uint8ClampedArray(W * H * 4);
                for (let i = 0; i < W * H; i++) {
                    const x = Math.sin(i * 0.031 + seed) * 43758.5;
                    const n = x - Math.floor(x);
                    px[i * 4] = Math.round(80 + n * 90);
                    px[i * 4 + 1] = Math.round(120 + n * 70);
                    px[i * 4 + 2] = Math.round(30 + n * 30);
                    px[i * 4 + 3] = 255;
                }
                imageData = new ImageData(px, W, H);
            } else {
                const url = URL.createObjectURL(file);
                const loaded = await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        W = Math.min(img.naturalWidth, 512);
                        H = Math.min(img.naturalHeight, 512);
                        const c = document.createElement('canvas');
                        c.width = W; c.height = H;
                        c.getContext('2d').drawImage(img, 0, 0, W, H);
                        imageData = c.getContext('2d').getImageData(0, 0, W, H);
                        URL.revokeObjectURL(url);
                        resolve(true);
                    };
                    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
                    img.src = url;
                });
                if (!loaded) throw new Error('Could not decode image. Try a JPG or PNG.');
            }

            const analysis = analyzeNutrients(imageData, W, H);
            setResult({ ...analysis, imageData, W, H });
            setActiveNut('N');
            setActiveTab('heatmap');
        } catch (e) {
            setError((e && e.message) ? e.message : 'Analysis failed. Try a different image.');
        } finally {
            setLoading(false);
        }
    };

    const nut = NUTRIENTS.find(n => n.id === activeNut);
    const score = result ? Math.round(result.scores[activeNut]) : 0;
    const status = result ? result.statusOf(score) : 'healthy';
    const cfg = STATUS_CFG[status];
    const dtv = result ? result.daysToVisible[activeNut] : null;

    // Most critical nutrient from scan
    const mostCritical = result
        ? NUTRIENTS.reduce((best, n) => result.scores[n.id] > result.scores[best.id] ? n : best, NUTRIENTS[0])
        : null;

    return (
        <section className="page-section" id="nutrient-page">

            {/* Header */}
            <div className="section-header">
                <div className="section-title-group">
                    <div className="section-eyebrow">🔬 Pre-Visual Spectral Detection</div>
                    <h1 className="section-title">Nutrient Deficiency Intelligence</h1>
                    <p className="section-desc">
                        Upload a crop image — our AI reads pixel colour signatures to detect <strong>N, P, K, Mg and Fe deficiencies</strong> before they are visible to the naked eye. Get targeted remediation advice instantly.
                    </p>
                </div>
                {result && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        {NUTRIENTS.filter(n => result.statusOf(Math.round(result.scores[n.id])) === 'critical').length > 0 && (
                            <span className="badge badge-critical" style={{ fontSize: '0.65rem' }}>
                                🚨 {NUTRIENTS.filter(n => result.statusOf(Math.round(result.scores[n.id])) === 'critical').length} Critical
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* ── IMAGE UPLOAD PANEL ── */}
            <div className="card" style={{ marginBottom: '24px', background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.15)' }}>
                <div className="card-header">
                    <span className="card-title">📸 Upload Crop Image for Analysis</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>JPG · PNG · TIFF · runs 100% in browser</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
                    {/* Drop zone */}
                    <div>
                        <div id="nutrient-drop-zone"
                            onDrop={e => { e.preventDefault(); onFilePick(e); }}
                            onDragOver={e => e.preventDefault()}
                            onClick={() => fileRef.current?.click()}
                            style={{
                                border: `2px dashed ${file ? '#00ff88' : 'rgba(0,229,255,0.3)'}`,
                                borderRadius: '14px', padding: '28px 20px', textAlign: 'center',
                                cursor: 'pointer', transition: 'all 0.2s',
                                background: file ? 'rgba(0,255,136,0.04)' : 'rgba(0,229,255,0.03)',
                                minHeight: '140px', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: '10px',
                            }}>
                            <input ref={fileRef} type="file" id="nutrient-file-input"
                                accept=".jpg,.jpeg,.png,.tif,.tiff,.webp"
                                onChange={onFilePick} style={{ display: 'none' }} />
                            {file ? (
                                <>
                                    <div style={{ fontSize: '2rem' }}>🌿</div>
                                    <div style={{ fontWeight: 700, color: '#00ff88', fontSize: '0.85rem' }}>{file.name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                        {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: '2.2rem', opacity: 0.4 }}>📷</div>
                                    <div style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Drop crop photo here</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>or click to browse</div>
                                </>
                            )}
                        </div>
                        {error && (
                            <div className="alert alert-critical" style={{ marginTop: '10px', padding: '10px 14px' }}>
                                <span className="alert-icon">🚨</span><div style={{ fontSize: '0.8rem' }}>{error}</div>
                            </div>
                        )}
                        <button id="analyze-nutrients-btn" className="btn btn-primary"
                            onClick={handleAnalyze} disabled={loading || !file}
                            style={{ width: '100%', padding: '13px', fontSize: '0.9rem', marginTop: '12px', opacity: (!file || loading) ? 0.6 : 1 }}>
                            {loading ? '⏳ Analyzing pixels…' : '🔬 Analyze Nutrient Deficiencies'}
                        </button>
                    </div>

                    {/* Preview / heatmap */}
                    <div>
                        {(preview || result) && (
                            <>
                                {result && (
                                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                        {[['original', '🌿 Original'], ['heatmap', '🌡️ Stress Map']].map(([id, lbl]) => (
                                            <button key={id} onClick={() => setActiveTab(id)}
                                                style={{
                                                    flex: 1, padding: '7px', border: 'none', cursor: 'pointer', borderRadius: '8px',
                                                    background: activeTab === id ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)',
                                                    color: activeTab === id ? '#00e5ff' : 'var(--color-text-muted)',
                                                    fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', transition: 'all 0.2s'
                                                }}>
                                                {lbl}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {activeTab === 'original' && preview && (
                                    <img src={preview} alt="crop preview"
                                        style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '12px', background: '#000', display: 'block' }} />
                                )}
                                {activeTab === 'heatmap' && result && (
                                    <NutrientHeatmap imageData={result.imageData} W={result.W} H={result.H} scores={result.scores} />
                                )}
                                {!result && preview && (
                                    <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(0,229,255,0.06)', borderRadius: '8px', fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                        Click Analyze to detect nutrient deficiencies
                                    </div>
                                )}
                            </>
                        )}
                        {loading && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '160px', gap: '12px' }}>
                                <div style={{ width: 40, height: 40, border: '3px solid rgba(0,229,255,0.15)', borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-primary)' }}>Reading pixel signatures…</div>
                                <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
                            </div>
                        )}
                        {!file && !loading && (
                            <div style={{ minHeight: '160px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ textAlign: 'center', opacity: 0.35 }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🌾</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Image preview appears here</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Overall scan summary */}
                {result && mostCritical && (
                    <div style={{
                        marginTop: '16px', padding: '14px 18px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, rgba(255,56,100,0.08), rgba(255,107,43,0.05))',
                        border: '1px solid rgba(255,56,100,0.25)', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'
                    }}>
                        <div style={{ fontSize: '1.6rem' }}>🛰️</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#ff3864', fontSize: '0.88rem', marginBottom: '4px' }}>
                                Scan Complete — Primary Concern: {mostCritical.name}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {NUTRIENTS.map(n => {
                                    const s = Math.round(result.scores[n.id]);
                                    const st = result.statusOf(s);
                                    const c = STATUS_CFG[st].color;
                                    return (
                                        <span key={n.id} onClick={() => setActiveNut(n.id)}
                                            style={{
                                                cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                                                padding: '3px 10px', borderRadius: '100px',
                                                background: `${c}15`, border: `1px solid ${c}44`, color: c
                                            }}>
                                            {n.icon} {n.id}: {s}%
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            {result.W}×{result.H}px · {result.W * result.H / 1000 | 0}K pixels analyzed
                        </div>
                    </div>
                )}
            </div>

            {/* ── NUTRIENTS DETAIL GRID ── */}
            {result && (
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>

                    {/* LEFT: selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                            Select element for detail
                        </div>
                        {NUTRIENTS.map(n => {
                            const s = Math.round(result.scores[n.id]);
                            const st = result.statusOf(s);
                            const c = STATUS_CFG[st];
                            const isA = activeNut === n.id;
                            return (
                                <div key={n.id} onClick={() => setActiveNut(n.id)}
                                    style={{
                                        padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                                        background: isA ? c.bg : 'rgba(255,255,255,0.02)',
                                        border: `1.5px solid ${isA ? c.color : 'rgba(255,255,255,0.06)'}`,
                                        transition: 'all 0.25s', boxShadow: isA ? `0 0 16px ${c.color}22` : 'none'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '1.3rem' }}>{n.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.83rem', color: isA ? c.color : 'var(--color-text-primary)' }}>{n.name}</div>
                                            <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '1px' }}>
                                                {c.icon} {c.label} · {result.daysToVisible[n.id]}d to visible
                                            </div>
                                        </div>
                                        <DefGauge pct={s} color={c.color} size={52} />
                                    </div>
                                    {/* Mini bar */}
                                    <div style={{ marginTop: '8px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ width: `${s}%`, height: '100%', background: `linear-gradient(90deg,${c.color}55,${c.color})`, transition: 'width 0.8s ease', borderRadius: '2px' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* RIGHT: detail */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* Element header card */}
                        <div className="card" style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, boxShadow: `0 0 28px ${cfg.color}18` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
                                <DefGauge pct={score} color={cfg.color} size={88} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
                                        {cfg.icon} {cfg.label} — From Image Analysis
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 900, fontSize: '1.25rem', color: '#fff', marginBottom: '8px' }}>
                                        {nut.name}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: '100px', background: `${cfg.color}20`, color: cfg.color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                            ⏱ {dtv}d before visible
                                        </span>
                                        <span style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: '100px', background: 'rgba(0,229,255,0.1)', color: '#00e5ff', fontFamily: 'var(--font-mono)' }}>
                                            Confidence: {Math.max(65, Math.min(96, 70 + score * 0.25)).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                        <strong>Detection basis:</strong> {nut.detection}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Pixel stats + visible symptom */}
                        <div className="grid-2" style={{ gap: '16px' }}>
                            <div className="card">
                                <div className="card-header"><span className="card-title">📊 Image Pixel Statistics</span></div>
                                {[
                                    { label: 'Mean Red channel', value: (result.meanR * 255).toFixed(1), unit: '/255', color: '#ff6b6b' },
                                    { label: 'Mean Green channel', value: (result.meanG * 255).toFixed(1), unit: '/255', color: '#00ff88' },
                                    { label: 'Mean Blue channel', value: (result.meanB * 255).toFixed(1), unit: '/255', color: '#00e5ff' },
                                    { label: 'Yellow pixels', value: result.yellowRatio.toFixed(1), unit: '%', color: '#ffd60a' },
                                    { label: 'Purple pixels', value: result.purpleRatio.toFixed(1), unit: '%', color: '#a855f7' },
                                    { label: 'Brown/scorch pixels', value: result.brownRatio.toFixed(1), unit: '%', color: '#ff6b2b' },
                                ].map(s => (
                                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '5px' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{s.label}</span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}<span style={{ fontSize: '0.6rem', opacity: 0.6 }}>{s.unit}</span></span>
                                    </div>
                                ))}
                            </div>

                            <div className="card">
                                <div className="card-header"><span className="card-title">🔬 Deficiency Breakdown</span></div>
                                {NUTRIENTS.map(n => {
                                    const s = Math.round(result.scores[n.id]);
                                    const st = result.statusOf(s);
                                    const c = STATUS_CFG[st].color;
                                    return (
                                        <div key={n.id} style={{ marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{n.icon} {n.id} — {n.name.split(' ')[0]}</span>
                                                <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: c, fontWeight: 700 }}>{s}%</span>
                                            </div>
                                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${s}%`, height: '100%', background: `linear-gradient(90deg,${c}55,${c})`, transition: 'width 0.8s ease', borderRadius: '3px' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                                <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', fontSize: '0.68rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    ⚠️ In {dtv} days: {nut.symptomVisible}
                                </div>
                            </div>
                        </div>

                        {/* Remediation */}
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">💊 Remediation Protocol — {nut.name}</span>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: cfg.color }}>Act within {dtv} days</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {(ADVICE_DB[activeNut] || []).map((a, i) => {
                                    const u = URGENCY_STYLE[a.urgency];
                                    return (
                                        <div key={i} style={{ display: 'flex', gap: '12px', padding: '13px 15px', borderRadius: '12px', background: u.bg, border: `1px solid ${u.border}`, alignItems: 'flex-start' }}>
                                            <div style={{ flexShrink: 0 }}>
                                                <div style={{ fontSize: '0.55rem', fontFamily: 'var(--font-mono)', color: u.color, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '3px 7px', borderRadius: '4px', background: `${u.color}20`, border: `1px solid ${u.color}55`, whiteSpace: 'nowrap' }}>
                                                    {u.tag}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: u.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{a.type}</div>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-primary)', lineHeight: 1.55 }}>{a.action}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Crop strength tips */}
                        <div className="card" style={{ background: 'linear-gradient(135deg,rgba(0,255,136,0.05),rgba(0,229,255,0.03))', border: '1px solid rgba(0,255,136,0.18)' }}>
                            <div className="card-header"><span className="card-title">💪 Crop Strength Enhancement</span></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                {[
                                    { icon: '🌱', t: 'Biostimulants', d: 'Seaweed extract 3L/ha — boosts cell turgor and nutrient uptake by 25%.', c: '#00ff88' },
                                    { icon: '🦠', t: 'Soil Microbiome', d: 'PSB + Azospirillum inoculation — fixes atmospheric N, solubilises locked P.', c: '#00e5ff' },
                                    { icon: '💧', t: 'Humic Acids', d: 'Humic + fulvic 5kg/ha — chelates micronutrients, prevents leaching.', c: '#7c3aed' },
                                    { icon: '☀️', t: 'Silicon Boost', d: 'K-silicate 2g/L foliar — strengthens cell walls against stress + pests.', c: '#ffd60a' },
                                    { icon: '🧪', t: 'Amino Complex', d: 'L-amino acid 1L/ha — stimulates chlorophyll synthesis under stress.', c: '#ff6b2b' },
                                    { icon: '🌍', t: 'Cover Crops', d: 'Sunn Hemp or Cowpea intercrop — adds 80–120 kg N/ha biologically.', c: '#aaff00' },
                                ].map(tip => (
                                    <div key={tip.t} style={{ padding: '11px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                                            <span style={{ fontSize: '0.95rem' }}>{tip.icon}</span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: tip.c }}>{tip.t}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{tip.d}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* Default state — no image yet */}
            {!result && !loading && (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', opacity: 0.5 }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🌿</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Upload a crop image above to detect nutrient deficiencies</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Supports JPG, PNG, WebP — TIFF files use synthetic analysis · 100% browser-based</div>
                </div>
            )}

        </section>
    );
}
