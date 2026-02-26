import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { ALERTS, FIELD_ZONES, STRESS_COLORS } from '../utils/data';

/* ─── Fix default Leaflet marker icons (Vite asset handling) ─────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/* ─── helpers ─────────────────────────────────────────────────────────── */
function calcPolygonStats(layer) {
    const latlngs = layer.getLatLngs()[0];
    const areaM2 = L.GeometryUtil.geodesicArea(latlngs);
    const bounds = layer.getBounds();
    const center = bounds.getCenter();
    let perim = 0;
    for (let i = 0; i < latlngs.length; i++)
        perim += latlngs[i].distanceTo(latlngs[(i + 1) % latlngs.length]);
    return {
        area_m2: Math.round(areaM2),
        area_ha: (areaM2 / 10000).toFixed(4),
        area_acres: (areaM2 / 4046.86).toFixed(4),
        perimeter_m: Math.round(perim),
        vertices: latlngs.length,
        centroid: { lat: center.lat.toFixed(6), lng: center.lng.toFixed(6) },
        bbox: {
            north: bounds.getNorth().toFixed(6),
            south: bounds.getSouth().toFixed(6),
            east: bounds.getEast().toFixed(6),
            west: bounds.getWest().toFixed(6),
        },
        coordinates: latlngs.map(ll => ({ lat: ll.lat.toFixed(6), lng: ll.lng.toFixed(6) })),
    };
}

/* ─── weather code → icon ─────────────────────────────────────────────── */
function wxIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '🌨️';
    if (code <= 82) return '🌦️';
    if (code <= 99) return '⛈️';
    return '🌡️';
}

/* ─── fetch reverse-geocode + weather for a lat/lng ──────────────────── */
async function fetchLocationData(lat, lng) {
    const [geoRes, wxRes] = await Promise.all([
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`),
        fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
            `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,cloud_cover,surface_pressure` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max` +
            `&hourly=soil_temperature_0cm,soil_moisture_0_to_1cm` +
            `&timezone=auto&forecast_days=1`
        ),
    ]);
    const geo = await geoRes.json();
    const wx = await wxRes.json();
    return { geo, wx, lat, lng };
}

/* ─── Zone Map Panel component ────────────────────────────────────────── */
function ZoneMapPanel() {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const drawnRef = useRef(null);
    const debounceRef = useRef(null);

    const [stats, setStats] = useState(null);
    const [mapStyle, setMapStyle] = useState('satellite');
    const tileLayerRef = useRef(null);
    const [coordsOpen, setCoordsOpen] = useState(false);

    /* live location intelligence */
    const [locInfo, setLocInfo] = useState(null);
    const [locLoading, setLocLoading] = useState(false);
    const [locSource, setLocSource] = useState('map'); // 'map' | 'polygon'

    const TILES = {
        satellite: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attr: 'Tiles © Esri',
        },
        street: {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attr: '© OpenStreetMap contributors',
        },
    };

    /* debounced fetch helper */
    const triggerFetch = (lat, lng, source) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLocLoading(true);
            setLocSource(source);
            try {
                const data = await fetchLocationData(lat, lng);
                setLocInfo(data);
            } catch (_) { /* network error — keep old data */ }
            setLocLoading(false);
        }, 900);
    };

    useEffect(() => {
        if (mapRef.current) return;

        const map = L.map(containerRef.current, {
            center: [20.5937, 78.9629],
            zoom: 13,
            zoomControl: true,
        });
        mapRef.current = map;

        tileLayerRef.current = L.tileLayer(TILES.satellite.url, { attribution: TILES.satellite.attr, maxZoom: 20 }).addTo(map);

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        drawnRef.current = drawnItems;

        const drawControl = new L.Control.Draw({
            position: 'topright',
            draw: {
                polygon: {
                    allowIntersection: false,
                    showArea: true,
                    shapeOptions: { color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 0.18, weight: 2 },
                },
                rectangle: {
                    shapeOptions: { color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.18, weight: 2 },
                },
                circle: false, circlemarker: false, marker: false, polyline: false,
            },
            edit: {
                featureGroup: drawnItems,
                poly: { allowIntersection: false },
                edit: { selectedPathOptions: { color: '#ffd60a', fillColor: '#ffd60a', fillOpacity: 0.22 } },
                remove: true,
            },
        });
        map.addControl(drawControl);

        /* polygon created → compute stats + fetch location for centroid */
        map.on(L.Draw.Event.CREATED, (e) => {
            drawnItems.clearLayers();
            drawnItems.addLayer(e.layer);
            const s = calcPolygonStats(e.layer);
            setStats(s);
            triggerFetch(parseFloat(s.centroid.lat), parseFloat(s.centroid.lng), 'polygon');
        });

        /* polygon edited → recompute stats + re-fetch */
        map.on(L.Draw.Event.EDITED, (e) => {
            e.layers.eachLayer(layer => {
                const s = calcPolygonStats(layer);
                setStats(s);
                triggerFetch(parseFloat(s.centroid.lat), parseFloat(s.centroid.lng), 'polygon');
            });
        });

        map.on(L.Draw.Event.DELETED, () => {
            setStats(null);
            const c = map.getCenter();
            triggerFetch(c.lat, c.lng, 'map');
        });

        /* map pan/zoom → fetch location for new center */
        map.on('moveend', () => {
            const c = map.getCenter();
            triggerFetch(c.lat, c.lng, 'map');
        });

        /* initial fetch for default center */
        triggerFetch(20.5937, 78.9629, 'map');

        return () => { map.remove(); mapRef.current = null; };
    }, []);

    /* swap tile layer when mapStyle changes */
    useEffect(() => {
        if (!mapRef.current || !tileLayerRef.current) return;
        mapRef.current.removeLayer(tileLayerRef.current);
        tileLayerRef.current = L.tileLayer(TILES[mapStyle].url, {
            attribution: TILES[mapStyle].attr, maxZoom: 20,
        }).addTo(mapRef.current);
        mapRef.current.eachLayer(l => { if (l instanceof L.FeatureGroup) l.bringToFront(); });
    }, [mapStyle]);

    /* ── derived weather values ── */
    const cur = locInfo?.wx?.current;
    const daily = locInfo?.wx?.daily;
    const hourly = locInfo?.wx?.hourly;
    const addr = locInfo?.geo?.address || {};
    const placeName = locInfo?.geo?.display_name?.split(',').slice(0, 3).join(', ') || '—';
    const soilTemp = hourly?.soil_temperature_0cm?.[0];
    const soilMoist = hourly?.soil_moisture_0_to_1cm?.[0];

    return (
        <div style={{ marginBottom: '28px' }}>
            {/* ── Panel header ── */}
            <div style={{
                borderRadius: '16px 16px 0 0',
                border: '1.5px solid rgba(0,229,255,0.3)',
                borderBottom: 'none',
                background: 'linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(10,5,15,0.9) 100%)',
                padding: '14px 22px',
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
            }}>
                <span style={{ fontSize: '1.2rem' }}>📍</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 800, fontSize: '0.95rem', color: '#00e5ff', letterSpacing: '-0.01em' }}>
                        FIELD ZONE MAPPER — Live Location Intelligence
                    </div>
                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                        Pan the map to explore any location · Draw a polygon to define a zone · Data updates automatically for every location
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {['satellite', 'street'].map(s => (
                        <button key={s} onClick={() => setMapStyle(s)} style={{
                            padding: '5px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.72rem',
                            fontFamily: 'var(--font-mono)', fontWeight: 700, border: 'none', transition: 'all 0.2s',
                            background: mapStyle === s ? '#00e5ff' : 'rgba(255,255,255,0.07)',
                            color: mapStyle === s ? '#0a050f' : 'rgba(255,255,255,0.6)',
                        }}>
                            {s === 'satellite' ? '🛰 Satellite' : '🗺 Street'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Map ── */}
            <div ref={containerRef} style={{
                height: '420px',
                border: '1.5px solid rgba(0,229,255,0.3)',
                borderTop: '1px solid rgba(0,229,255,0.15)',
                borderBottom: 'none',
            }} />

            {/* ── Live Location Intelligence (always visible) ── */}
            <div style={{
                border: '1.5px solid rgba(0,229,255,0.28)',
                borderTop: '1px solid rgba(0,229,255,0.12)',
                background: 'linear-gradient(180deg, rgba(0,229,255,0.04) 0%, rgba(0,0,0,0.25) 100%)',
                padding: '18px 22px',
                borderRadius: stats ? '0' : '0 0 16px 16px',
            }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 800, fontSize: '0.82rem', color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        🌍 Location Intelligence
                    </div>
                    {locLoading && (
                        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#ffd60a', animation: 'pulse 1s ease infinite' }}>⟳ fetching…</span>
                    )}
                    {!locLoading && locInfo && (
                        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: locSource === 'polygon' ? '#39ff14' : 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                            {locSource === 'polygon' ? '📌 Polygon centroid' : '🗺 Map center'}
                            &nbsp;· {parseFloat(locInfo.lat).toFixed(5)}°N, {parseFloat(locInfo.lng).toFixed(5)}°E
                        </span>
                    )}
                </div>

                {locInfo ? (
                    <>
                        {/* Place name */}
                        <div style={{
                            padding: '12px 16px', borderRadius: '10px', marginBottom: '14px',
                            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,229,255,0.15)',
                            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                        }}>
                            <span style={{ fontSize: '1.5rem' }}>{wxIcon(cur?.weather_code ?? 0)}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-text-primary)', fontFamily: 'var(--font-primary)' }}>
                                    {placeName}
                                </div>
                                <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                                    {[addr.county || addr.city_district, addr.state, addr.country].filter(Boolean).join(' · ')}
                                </div>
                            </div>
                            {addr.postcode && (
                                <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', padding: '3px 10px', borderRadius: '20px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
                                    📮 {addr.postcode}
                                </span>
                            )}
                        </div>

                        {/* Weather + Soil grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                            {[
                                { label: 'Temperature', val: cur ? `${cur.temperature_2m}°C` : '—', icon: '🌡️', color: '#ff6b2b', sub: daily ? `↑${daily.temperature_2m_max?.[0]}° ↓${daily.temperature_2m_min?.[0]}°` : '' },
                                { label: 'Humidity', val: cur ? `${cur.relative_humidity_2m}%` : '—', icon: '💧', color: '#00e5ff', sub: 'Relative humidity' },
                                { label: 'Wind Speed', val: cur ? `${cur.wind_speed_10m} km/h` : '—', icon: '🌬️', color: '#7c3aed', sub: 'At 10m height' },
                                { label: 'Precipitation', val: cur ? `${cur.precipitation} mm` : '—', icon: '🌧️', color: '#39ff14', sub: daily ? `Today: ${daily.precipitation_sum?.[0]} mm` : '' },
                                { label: 'Cloud Cover', val: cur ? `${cur.cloud_cover}%` : '—', icon: '☁️', color: '#ffd60a', sub: `Pressure: ${cur?.surface_pressure ?? '—'} hPa` },
                                { label: 'UV Index', val: daily ? `${daily.uv_index_max?.[0]}` : '—', icon: '☀️', color: '#ff3864', sub: daily?.uv_index_max?.[0] > 6 ? 'HIGH — protect crops' : 'Moderate' },
                                { label: 'Soil Temp', val: soilTemp != null ? `${soilTemp}°C` : '—', icon: '🌱', color: '#39ff14', sub: 'Surface (0 cm)' },
                                { label: 'Soil Moisture', val: soilMoist != null ? `${(soilMoist * 100).toFixed(1)}%` : '—', icon: '💦', color: '#00e5ff', sub: 'Vol. water content' },
                            ].map(m => (
                                <div key={m.label} style={{
                                    padding: '11px 13px', borderRadius: '10px',
                                    background: 'rgba(0,0,0,0.28)', border: `1px solid ${m.color}28`,
                                }}>
                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                                        {m.icon} {m.label}
                                    </div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-primary)', color: m.color }}>
                                        {m.val}
                                    </div>
                                    {m.sub && <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.32)', fontFamily: 'var(--font-mono)', marginTop: '3px' }}>{m.sub}</div>}
                                </div>
                            ))}
                        </div>

                        {/* Admin details row */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {[
                                addr.country && { label: `🌐 ${addr.country}`, color: '#00e5ff' },
                                addr.state && { label: `🏛 ${addr.state}`, color: '#7c3aed' },
                                (addr.county || addr.city || addr.town || addr.village) && { label: `📌 ${addr.county || addr.city || addr.town || addr.village}`, color: '#ffd60a' },
                                addr.road && { label: `🛤 ${addr.road}`, color: '#ff6b2b' },
                                locInfo?.wx?.timezone && { label: `🕐 ${locInfo.wx.timezone}`, color: '#39ff14' },
                            ].filter(Boolean).map(tag => (
                                <span key={tag.label} style={{
                                    fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                                    padding: '3px 10px', borderRadius: '20px',
                                    background: `${tag.color}12`, border: `1px solid ${tag.color}38`, color: tag.color,
                                }}>
                                    {tag.label}
                                </span>
                            ))}
                        </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', padding: '20px 0' }}>
                        {locLoading ? '⟳ Loading location data…' : 'Pan the map to load location intelligence'}
                    </div>
                )}
            </div>

            {/* ── Polygon Data Stats (shown only when polygon exists) ── */}
            {stats && (
                <div style={{
                    border: '1.5px solid rgba(0,229,255,0.3)',
                    borderTop: '1px solid rgba(0,229,255,0.12)',
                    borderRadius: '0 0 16px 16px',
                    background: 'rgba(0,229,255,0.04)',
                    padding: '18px 22px',
                }}>
                    <div style={{ fontFamily: 'var(--font-primary)', fontWeight: 800, fontSize: '0.82rem', color: '#00e5ff', marginBottom: '14px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        📐 Zone Polygon Data
                    </div>

                    {/* Main metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                        {[
                            { label: 'Area (m²)', val: stats.area_m2.toLocaleString(), icon: '📏', color: '#00e5ff' },
                            { label: 'Area (ha)', val: stats.area_ha, icon: '🌾', color: '#39ff14' },
                            { label: 'Area (acres)', val: stats.area_acres, icon: '🏞️', color: '#ffd60a' },
                            { label: 'Perimeter', val: `${stats.perimeter_m.toLocaleString()} m`, icon: '📐', color: '#ff6b2b' },
                            { label: 'Vertices', val: stats.vertices, icon: '🔵', color: '#7c3aed' },
                        ].map(m => (
                            <div key={m.label} style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', border: `1px solid ${m.color}33` }}>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>{m.icon} {m.label}</div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-primary)', color: m.color }}>{m.val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Centroid + BBox */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,229,255,0.18)' }}>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>🎯 Centroid</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#00e5ff' }}>
                                <div>Lat: <span style={{ color: '#fff' }}>{stats.centroid.lat}</span></div>
                                <div>Lng: <span style={{ color: '#fff' }}>{stats.centroid.lng}</span></div>
                            </div>
                        </div>
                        <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,229,255,0.18)' }}>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>📦 Bounding Box</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)' }}>
                                <div>N: {stats.bbox.north} · S: {stats.bbox.south}</div>
                                <div>E: {stats.bbox.east} · W: {stats.bbox.west}</div>
                            </div>
                        </div>
                    </div>

                    {/* Vertex list collapsible */}
                    <button onClick={() => setCoordsOpen(o => !o)} style={{
                        width: '100%', padding: '9px 14px', borderRadius: '8px', cursor: 'pointer',
                        border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.06)',
                        color: '#00e5ff', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span>🗺️ All Vertex Coordinates ({stats.vertices} points)</span>
                        <span>{coordsOpen ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {coordsOpen && (
                        <div style={{ marginTop: '8px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,229,255,0.15)', padding: '12px', maxHeight: '180px', overflowY: 'auto' }}>
                            {stats.coordinates.map((c, i) => (
                                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', padding: '3px 0', borderBottom: i < stats.coordinates.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <span style={{ color: '#00e5ff', marginRight: '8px' }}>P{i + 1}</span>
                                    Lat: <span style={{ color: '#39ff14' }}>{c.lat}</span>
                                    &nbsp;&nbsp;Lng: <span style={{ color: '#ffd60a' }}>{c.lng}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Combined alert card — polygon + live weather */}
                    <div style={{
                        marginTop: '14px', padding: '14px 16px', borderRadius: '12px',
                        background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.25)',
                        borderLeft: '3px solid #00e5ff',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '1.1rem' }}>📌</span>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>Custom Zone — Live Field Report</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.35)' }}>just now</span>
                        </div>
                        <p style={{ margin: '0 0 8px', fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                            Zone covers <strong style={{ color: '#00e5ff' }}>{stats.area_ha} ha ({stats.area_acres} acres)</strong> with perimeter <strong style={{ color: '#ffd60a' }}>{stats.perimeter_m.toLocaleString()} m</strong> at <strong style={{ color: '#39ff14' }}>{placeName || stats.centroid.lat + '°N, ' + stats.centroid.lng + '°E'}</strong>.
                            {cur && <> Current conditions: <strong style={{ color: '#ff6b2b' }}>{cur.temperature_2m}°C</strong>, humidity <strong style={{ color: '#00e5ff' }}>{cur.relative_humidity_2m}%</strong>, wind <strong style={{ color: '#7c3aed' }}>{cur.wind_speed_10m} km/h</strong>.</>}
                            {soilTemp != null && <> Soil temperature <strong style={{ color: '#39ff14' }}>{soilTemp}°C</strong>, moisture <strong style={{ color: '#00e5ff' }}>{(soilMoist * 100).toFixed(1)}%</strong>.</>}
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {[
                                { label: `${stats.area_ha} ha`, color: '#00e5ff' },
                                { label: `${stats.vertices} vertices`, color: '#7c3aed' },
                                { label: `${stats.perimeter_m} m perimeter`, color: '#ffd60a' },
                                cur && { label: `${cur.temperature_2m}°C`, color: '#ff6b2b' },
                                cur && { label: `${cur.relative_humidity_2m}% RH`, color: '#00e5ff' },
                            ].filter(Boolean).map(tag => (
                                <span key={tag.label} style={{
                                    fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                                    padding: '3px 10px', borderRadius: '20px',
                                    background: `${tag.color}15`, border: `1px solid ${tag.color}44`, color: tag.color,
                                }}>
                                    {tag.label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

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

            {/* ── ZONE FIELD MAP ─────────────────────────────────────────── */}
            <ZoneMapPanel />

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
