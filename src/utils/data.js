// Simulated crop stress data — in production this would come from backend ML API
export const FIELD_ZONES = [
    { id: 'Z1', name: 'North Block A', area: 42.3, crop: 'Wheat (Triticum aestivum)', lat: 28.61, lon: 77.23, stressLevel: 'severe', stressScore: 87, waterContent: 18, nitrogenIndex: 0.31, ndvi: 0.42, ndwi: -0.28, lst: 42.1, alertAge: 2 },
    { id: 'Z2', name: 'North Block B', area: 38.7, crop: 'Rice (Oryza sativa)', lat: 28.62, lon: 77.25, stressLevel: 'moderate', stressScore: 54, waterContent: 34, nitrogenIndex: 0.58, ndvi: 0.61, ndwi: -0.05, lst: 36.4, alertAge: 5 },
    { id: 'Z3', name: 'East Section', area: 55.1, crop: 'Maize (Zea mays)', lat: 28.60, lon: 77.28, stressLevel: 'low', stressScore: 22, waterContent: 52, nitrogenIndex: 0.74, ndvi: 0.78, ndwi: 0.11, lst: 31.2, alertAge: null },
    { id: 'Z4', name: 'West Quadrant', area: 29.4, crop: 'Soybean (Glycine max)', lat: 28.59, lon: 77.20, stressLevel: 'high', stressScore: 71, waterContent: 26, nitrogenIndex: 0.44, ndvi: 0.53, ndwi: -0.18, lst: 39.7, alertAge: 3 },
    { id: 'Z5', name: 'South Section', area: 47.8, crop: 'Cotton (Gossypium)', lat: 28.57, lon: 77.24, stressLevel: 'none', stressScore: 9, waterContent: 61, nitrogenIndex: 0.82, ndvi: 0.85, ndwi: 0.19, lst: 28.9, alertAge: null },
    { id: 'Z6', name: 'Central Core', area: 33.6, crop: 'Sunflower (Helianthus)', lat: 28.60, lon: 77.23, stressLevel: 'high', stressScore: 68, waterContent: 29, nitrogenIndex: 0.41, ndvi: 0.49, ndwi: -0.21, lst: 38.5, alertAge: 1 },
];

export const PIPELINE_STEPS = [
    { id: 'ingest', icon: '🛰️', label: 'Data Ingestion', sublabel: 'Sentinel-2 / ASTER', status: 'completed', progress: 100, duration: '1.2s' },
    { id: 'calibrate', icon: '📡', label: 'Radiometric Calib', sublabel: 'Atmospheric correction', status: 'completed', progress: 100, duration: '0.8s' },
    { id: 'index', icon: '📊', label: 'Index Extraction', sublabel: 'NDVI, NDWI, Red-edge', status: 'completed', progress: 100, duration: '2.1s' },
    { id: 'thermal', icon: '🌡️', label: 'Thermal Analysis', sublabel: 'LST from TIR bands', status: 'completed', progress: 100, duration: '1.5s' },
    { id: 'hypspec', icon: '🔬', label: 'Hyperspectral AI', sublabel: 'CNN feature extraction', status: 'active', progress: 73, duration: '—' },
    { id: 'fuse', icon: '🔮', label: 'Sensor Fusion', sublabel: 'Multi-modal ensemble', status: 'pending', progress: 0, duration: '—' },
    { id: 'map', icon: '🗺️', label: 'Stress Mapping', sublabel: 'Zone segmentation', status: 'pending', progress: 0, duration: '—' },
    { id: 'alert', icon: '🚨', label: 'Alert Engine', sublabel: 'Priority scoring + notify', status: 'pending', progress: 0, duration: '—' },
];

export const SPECTRAL_BANDS = [
    { band: 'B1 (443nm)', name: 'Coastal Aerosol', reflectance: 0.08, category: 'VNIR' },
    { band: 'B2 (490nm)', name: 'Blue', reflectance: 0.07, category: 'VNIR' },
    { band: 'B3 (560nm)', name: 'Green', reflectance: 0.12, category: 'VNIR' },
    { band: 'B4 (665nm)', name: 'Red', reflectance: 0.15, category: 'VNIR' },
    { band: 'B5 (705nm)', name: 'Red-Edge 1', reflectance: 0.28, category: 'Red-Edge' },
    { band: 'B6 (740nm)', name: 'Red-Edge 2', reflectance: 0.35, category: 'Red-Edge' },
    { band: 'B7 (783nm)', name: 'Red-Edge 3', reflectance: 0.38, category: 'Red-Edge' },
    { band: 'B8 (842nm)', name: 'NIR Broadband', reflectance: 0.41, category: 'NIR' },
    { band: 'B8A(865nm)', name: 'NIR Narrow', reflectance: 0.39, category: 'NIR' },
    { band: 'B9 (940nm)', name: 'Water Vapor', reflectance: 0.04, category: 'SWIR' },
    { band: 'B11(1610nm)', name: 'SWIR 1', reflectance: 0.22, category: 'SWIR' },
    { band: 'B12(2190nm)', name: 'SWIR 2', reflectance: 0.14, category: 'SWIR' },
];

export const TIME_SERIES = [
    { date: 'Jan 15', ndvi: 0.71, stress: 12, rainfall: 18 },
    { date: 'Jan 29', ndvi: 0.74, stress: 9, rainfall: 22 },
    { date: 'Feb 12', ndvi: 0.69, stress: 18, rainfall: 8 },
    { date: 'Feb 26', ndvi: 0.62, stress: 34, rainfall: 4 },
    { date: 'Mar 11', ndvi: 0.54, stress: 51, rainfall: 2 },
    { date: 'Mar 25', ndvi: 0.48, stress: 67, rainfall: 1 },
    { date: 'Apr  8', ndvi: 0.43, stress: 79, rainfall: 0 },
];

export const ALERTS = [
    { id: 'A001', zone: 'Z1', severity: 'critical', type: 'Water Deficit', message: 'Soil moisture 72% below threshold. Immediate irrigation required.', time: '2h ago', previsual: true },
    { id: 'A002', zone: 'Z6', severity: 'critical', type: 'Heat Stress', message: 'Canopy temperature 9.6°C above ambient. Heat stress detected.', time: '3h ago', previsual: true },
    { id: 'A003', zone: 'Z4', severity: 'warning', type: 'N Deficiency', message: 'Red-edge index decline indicates early nitrogen deficiency.', time: '6h ago', previsual: true },
    { id: 'A004', zone: 'Z2', severity: 'info', type: 'Mild Drought', message: 'Moderate water stress developing. Monitor for 48 hours.', time: '1d ago', previsual: false },
];

export const STRESS_COLORS = {
    none: '#00ff88',
    low: '#aaff00',
    moderate: '#ffd60a',
    high: '#ff6b2b',
    severe: '#ff3864',
};

export const OVERVIEW_METRICS = [
    { label: 'Total Area Monitored', value: '247', unit: 'ha', delta: '+12%', trend: 'up', color: '#00e5ff', icon: '🛰️' },
    { label: 'Active Stress Alerts', value: '4', unit: '', delta: '+2', trend: 'down', color: '#ff3864', icon: '🚨' },
    { label: 'Pre-Visual Detection', value: '94', unit: '%', delta: '+3%', trend: 'up', color: '#00ff88', icon: '🔬' },
    { label: 'Avg. NDVI Score', value: '0.58', unit: '', delta: '-0.06', trend: 'down', color: '#ffd60a', icon: '🌿' },
    { label: 'Processing Latency', value: '6.8', unit: 's', delta: '-0.4s', trend: 'up', color: '#7c3aed', icon: '⚡' },
    { label: 'Satellites Active', value: '3', unit: '', delta: 'live', trend: 'up', color: '#00e5ff', icon: '🌍' },
];
