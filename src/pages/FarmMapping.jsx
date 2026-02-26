import React, { useEffect, useRef, useState } from 'react';

/* ── Leaflet marker icon fix (webpack/vite asset path issue) ─────────── */
function fixLeafletIcons() {
  if (!window.L) return;
  delete window.L.Icon.Default.prototype._getIconUrl;
  window.L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

/* ── colour tokens ──────────────────────────────────────────────────── */
const C = {
  bg:     'var(--color-bg-card,  #0e1117)',
  border: 'var(--color-border,   rgba(0,229,255,0.12))',
  accent: 'var(--color-accent-cyan,  #00e5ff)',
  green:  'var(--color-accent-green, #00ff88)',
  red:    '#ff3864',
  orange: 'var(--color-accent-orange,#ff9500)',
  text:   'var(--color-text,  #e2e8f0)',
  muted:  'var(--color-text-muted, #64748b)',
  mono:   'var(--font-mono, "JetBrains Mono", monospace)',
  deep:   'var(--color-bg-deep, #060810)',
};

const label = (txt) => ({
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: C.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: '5px',
  fontFamily: C.mono,
});

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${C.border}`,
  borderRadius: '7px',
  color: C.text,
  fontSize: '0.88rem',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const CROP_TYPES     = ['Wheat','Rice','Cotton','Sugarcane','Maize','Soybean','Groundnut','Onion','Tomato','Other'];
const IRRIGATION     = ['Drip','Sprinkler','Flood','Furrow','Rainfed','Other'];
const SOIL_TYPES     = ['Black (Vertisol)','Red (Alfisol)','Alluvial','Laterite','Sandy','Loamy','Clay','Other'];

const EMPTY_FORM = {
  farmName:      '',
  cropType:      '',
  sowingDate:    '',
  irrigationType:'',
  soilType:      '',
};

export default function FarmMapping() {
  const mapRef      = useRef(null);   // DOM node
  const leafletRef  = useRef(null);   // L.Map instance
  const drawnRef    = useRef(null);   // L.FeatureGroup
  const polygonRef  = useRef(null);   // current polygon layer

  const [geojson,  setGeojson]  = useState(null);
  const [areaHa,   setAreaHa]   = useState(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [status,   setStatus]   = useState(null);   // {type:'success'|'error', msg}
  const [saving,   setSaving]   = useState(false);

  /* ── init map once ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!window.L || leafletRef.current) return;

    fixLeafletIcons();
    const L = window.L;

    const map = L.map(mapRef.current, {
      center: [20.5937, 78.9629],   // centre of India
      zoom:   5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    /* drawn items container */
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnRef.current = drawnItems;

    /* draw control – polygon only */
    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon:   { shapeOptions: { color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 0.15, weight: 2 } },
        polyline:  false,
        rectangle: false,
        circle:    false,
        marker:    false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    /* created */
    map.on(L.Draw.Event.CREATED, (e) => {
      /* remove any previous polygon */
      drawnItems.clearLayers();
      polygonRef.current = null;

      const layer = e.layer;
      drawnItems.addLayer(layer);
      polygonRef.current = layer;

      const gj = layer.toGeoJSON();
      setGeojson(gj);

      const areaSqM = window.turf
        ? window.turf.area(gj)
        : 0;
      setAreaHa(areaSqM / 10000);
    });

    /* edited */
    map.on(L.Draw.Event.EDITED, (e) => {
      e.layers.eachLayer((layer) => {
        const gj = layer.toGeoJSON();
        setGeojson(gj);

        const areaSqM = window.turf ? window.turf.area(gj) : 0;
        setAreaHa(areaSqM / 10000);
        polygonRef.current = layer;
      });
    });

    /* deleted */
    map.on(L.Draw.Event.DELETED, () => {
      setGeojson(null);
      setAreaHa(null);
      polygonRef.current = null;
    });

    leafletRef.current = map;

    return () => {
      map.remove();
      leafletRef.current = null;
    };
  }, []);

  /* ── form helpers ──────────────────────────────────────────────────── */
  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSave(e) {
    e.preventDefault();

    if (!geojson) {
      setStatus({ type: 'error', msg: 'Please draw your farm boundary on the map first.' });
      return;
    }
    if (!form.farmName.trim()) {
      setStatus({ type: 'error', msg: 'Farm name is required.' });
      return;
    }

    setSaving(true);
    setStatus(null);

    const payload = {
      ...form,
      geometry: geojson,
      area_ha:  areaHa ? parseFloat(areaHa.toFixed(4)) : null,
    };

    try {
      const res = await fetch('/api/farms/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Server responded ${res.status}: ${err}`);
      }

      const data = await res.json();
      setStatus({ type: 'success', msg: `Farm "${form.farmName}" saved successfully!${data.id ? ` (ID: ${data.id})` : ''}` });
      setForm(EMPTY_FORM);
      setGeojson(null);
      setAreaHa(null);
      drawnRef.current?.clearLayers();
      polygonRef.current = null;

    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  /* ── render ────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <span style={{ fontSize: '1.6rem' }}>🗺️</span>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: C.text }}>
            Farm Mapping
          </h1>
          <span style={{
            marginLeft: 'auto', fontFamily: C.mono, fontSize: '0.68rem',
            color: C.green, border: `1px solid ${C.green}`, borderRadius: '20px',
            padding: '2px 10px', letterSpacing: '0.08em',
          }}>
            OSM · Leaflet · Turf
          </span>
        </div>
        <p style={{ margin: 0, color: C.muted, fontSize: '0.88rem' }}>
          Draw your farm boundary, fill in the details, then save to the platform.
        </p>
      </div>

      {/* instructions bar */}
      <div style={{
        display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px',
      }}>
        {[
          { icon: '🔍', text: 'Search or zoom to your farm location' },
          { icon: '✏️', text: 'Click the polygon tool (top-right of map)' },
          { icon: '📐', text: 'Click to draw vertices, double-click to finish' },
          { icon: '💾', text: 'Fill the form below and click Save Farm' },
        ].map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: '8px', padding: '6px 12px',
            fontSize: '0.78rem', color: C.muted,
          }}>
            <span>{s.icon}</span><span>{s.text}</span>
          </div>
        ))}
      </div>

      {/* map */}
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: '12px',
        overflow: 'hidden', marginBottom: '16px',
        boxShadow: '0 0 24px rgba(0,229,255,0.06)',
      }}>
        <div ref={mapRef} style={{ height: '480px', width: '100%', background: '#111' }} />
      </div>

      {/* area badge */}
      {areaHa !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: C.bg, border: `1px solid ${C.green}`,
          borderRadius: '10px', padding: '12px 20px', marginBottom: '20px',
        }}>
          <span style={{ fontSize: '1.4rem' }}>📐</span>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: '1.4rem', fontWeight: 800, color: C.green }}>
              {areaHa.toFixed(4)} ha
            </div>
            <div style={{ fontSize: '0.75rem', color: C.muted }}>
              Calculated field area &nbsp;·&nbsp; {(areaHa * 2.471).toFixed(3)} acres &nbsp;·&nbsp; {(areaHa * 10000).toFixed(0)} m²
            </div>
          </div>
          {geojson && (
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a'); a.href = url;
                a.download = 'farm_boundary.geojson'; a.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                marginLeft: 'auto', padding: '7px 16px', borderRadius: '7px',
                border: `1px solid ${C.accent}`, background: 'rgba(0,229,255,0.08)',
                color: C.accent, fontFamily: C.mono, fontSize: '0.75rem',
                cursor: 'pointer', fontWeight: 700,
              }}
            >
              ⬇ GeoJSON
            </button>
          )}
        </div>
      )}

      {/* form */}
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: '12px', padding: '24px', marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px',
        }}>
          <span style={{ fontSize: '1.1rem' }}>🌾</span>
          <span style={{ fontFamily: C.mono, fontSize: '0.8rem', fontWeight: 700,
            color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Farm Details
          </span>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

            {/* Farm name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label('Farm Name')}>Farm Name *</label>
              <input
                name="farmName" value={form.farmName} onChange={handleChange}
                placeholder="e.g. North Block – Wheat 2026"
                required
                style={inputStyle}
                onFocus={e  => e.target.style.borderColor = C.accent}
                onBlur={e   => e.target.style.borderColor = C.border}
              />
            </div>

            {/* Crop type */}
            <div>
              <label style={label('Crop Type')}>Crop Type</label>
              <select
                name="cropType" value={form.cropType} onChange={handleChange}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e  => e.target.style.borderColor = C.border}
              >
                <option value="">— Select —</option>
                {CROP_TYPES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            {/* Sowing date */}
            <div>
              <label style={label('Sowing Date')}>Sowing Date</label>
              <input
                type="date" name="sowingDate" value={form.sowingDate} onChange={handleChange}
                style={{ ...inputStyle, colorScheme: 'dark' }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e  => e.target.style.borderColor = C.border}
              />
            </div>

            {/* Irrigation type */}
            <div>
              <label style={label('Irrigation Type')}>Irrigation Type</label>
              <select
                name="irrigationType" value={form.irrigationType} onChange={handleChange}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e  => e.target.style.borderColor = C.border}
              >
                <option value="">— Select —</option>
                {IRRIGATION.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>

            {/* Soil type */}
            <div>
              <label style={label('Soil Type')}>Soil Type</label>
              <select
                name="soilType" value={form.soilType} onChange={handleChange}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e  => e.target.style.borderColor = C.border}
              >
                <option value="">— Select —</option>
                {SOIL_TYPES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

          </div>

          {/* GeoJSON preview */}
          {geojson && (
            <div style={{ marginTop: '16px' }}>
              <label style={label('Boundary GeoJSON')}>Boundary GeoJSON</label>
              <pre style={{
                background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`,
                borderRadius: '7px', padding: '10px 14px', fontSize: '0.72rem',
                color: C.green, fontFamily: C.mono, maxHeight: '120px',
                overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {JSON.stringify(geojson, null, 2)}
              </pre>
            </div>
          )}

          {/* status */}
          {status && (
            <div style={{
              marginTop: '14px', padding: '10px 14px', borderRadius: '8px',
              fontSize: '0.84rem', fontFamily: C.mono,
              color:   status.type === 'success' ? C.green : C.red,
              background: status.type === 'success' ? 'rgba(0,255,136,0.07)' : 'rgba(255,56,100,0.07)',
              border: `1px solid ${status.type === 'success' ? 'rgba(0,255,136,0.25)' : 'rgba(255,56,100,0.25)'}`,
            }}>
              {status.type === 'success' ? '✅ ' : '⚠ '}{status.msg}
            </div>
          )}

          {/* submit */}
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '11px 32px', borderRadius: '8px',
                background: saving ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.12)',
                border: `1px solid ${C.accent}`,
                color: saving ? C.muted : C.accent,
                fontFamily: C.mono, fontSize: '0.88rem', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                letterSpacing: '0.06em', transition: 'background 0.2s',
              }}
              onMouseEnter={e => { if (!saving) e.target.style.background = 'rgba(0,229,255,0.22)'; }}
              onMouseLeave={e => { if (!saving) e.target.style.background = 'rgba(0,229,255,0.12)'; }}
            >
              {saving ? '⏳ Saving…' : '💾 Save Farm'}
            </button>

            {(geojson || form.farmName) && (
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM); setStatus(null);
                  setGeojson(null); setAreaHa(null);
                  drawnRef.current?.clearLayers();
                  polygonRef.current = null;
                }}
                style={{
                  padding: '11px 20px', borderRadius: '8px',
                  background: 'transparent', border: `1px solid ${C.border}`,
                  color: C.muted, fontFamily: C.mono, fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            )}

            {areaHa !== null && (
              <span style={{ marginLeft: 'auto', fontFamily: C.mono,
                fontSize: '0.8rem', color: C.muted }}>
                Area: <strong style={{ color: C.green }}>{areaHa.toFixed(4)} ha</strong>
              </span>
            )}
          </div>
        </form>
      </div>

      {/* info footer */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px',
      }}>
        {[
          { icon: '🗺️', title: 'OpenStreetMap tiles', desc: 'High-res base map — zoom to field level for precision' },
          { icon: '✏️', title: 'Leaflet.draw',         desc: 'Draw, edit, or delete your polygon boundary at any time' },
          { icon: '📐', title: 'Turf.js area calc',    desc: 'Geodesic area computed on the WGS-84 ellipsoid (accurate)' },
        ].map(card => (
          <div key={card.title} style={{
            background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '14px 16px',
          }}>
            <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>{card.icon}</div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: C.text,
              marginBottom: '4px' }}>{card.title}</div>
            <div style={{ fontSize: '0.75rem', color: C.muted, lineHeight: 1.5 }}>{card.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
