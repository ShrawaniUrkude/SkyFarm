import React, { useState, useEffect, useCallback } from 'react';

const SLIDES = [
  { src: '/img1.jpg', caption: 'Satellite Imagery — Field Overview' },
  { src: '/img2.jpg', caption: 'Hyperspectral Stress Detection' },
  { src: '/img3.jpg', caption: 'Crop Health Analysis' },
  { src: '/img4.jpg', caption: 'Pre-Visual Stress Mapping' },
  { src: '/img5.jpg', caption: 'Precision Agriculture Insights' },
];

export default function ImageSlider() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);

  const goTo = useCallback((idx) => {
    if (animating) return;
    setAnimating(true);
    setCurrent(idx);
    setTimeout(() => setAnimating(false), 700);
  }, [animating]);

  const prev = () => goTo((current - 1 + SLIDES.length) % SLIDES.length);
  const next = useCallback(() => goTo((current + 1) % SLIDES.length), [current, goTo]);

  // Auto-advance every 4 seconds
  useEffect(() => {
    const t = setInterval(next, 4000);
    return () => clearInterval(t);
  }, [next]);

  return (
    <section
      id="home-image-slider"
      aria-label="Farm imagery slideshow"
      style={{
        position: 'relative',
        width: '100%',
        height: 'clamp(320px, 55vh, 620px)',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* ── Slides ── */}
      {SLIDES.map((slide, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            inset: 0,
            transition: 'opacity 0.7s ease, transform 0.7s ease',
            opacity: i === current ? 1 : 0,
            transform: i === current ? 'scale(1)' : 'scale(1.04)',
            zIndex: i === current ? 1 : 0,
            pointerEvents: i === current ? 'auto' : 'none',
          }}
        >
          <img
            src={slide.src}
            alt={slide.caption}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              userSelect: 'none',
            }}
            draggable={false}
          />

          {/* Dark gradient overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 50%, transparent 100%)',
          }} />

          {/* Cyan top glow */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #00e5ff, #00ff88, #00e5ff)',
            backgroundSize: '200% 100%',
            animation: 'gradientShift 4s ease infinite',
          }} />
        </div>
      ))}

      {/* ── Caption ── */}
      <div style={{
        position: 'absolute',
        bottom: '64px',
        left: '48px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <span style={{
          fontSize: '0.65rem',
          fontFamily: 'var(--font-mono)',
          color: '#00e5ff',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontWeight: 700,
        }}>
          {String(current + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
        </span>
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-primary)',
          fontSize: 'clamp(1rem, 2.5vw, 1.5rem)',
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '-0.02em',
          textShadow: '0 2px 16px rgba(0,0,0,0.8)',
          maxWidth: '460px',
          transition: 'opacity 0.5s ease',
        }}>
          {SLIDES[current].caption}
        </p>
      </div>

      {/* ── Dot indicators ── */}
      <div style={{
        position: 'absolute',
        bottom: '22px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
      }}>
        {SLIDES.map((_, i) => (
          <button
            key={i}
            id={`slider-dot-${i}`}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)}
            style={{
              width: i === current ? '28px' : '8px',
              height: '8px',
              borderRadius: '100px',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              background: i === current
                ? 'linear-gradient(90deg, #00e5ff, #00ff88)'
                : 'rgba(255,255,255,0.35)',
              transition: 'all 0.4s ease',
              outline: 'none',
            }}
          />
        ))}
      </div>

      {/* ── Prev / Next arrows ── */}
      {[
        { id: 'slider-prev', label: '←', action: prev, side: 'left' },
        { id: 'slider-next', label: '→', action: next, side: 'right' },
      ].map(({ id, label, action, side }) => (
        <button
          key={id}
          id={id}
          aria-label={id === 'slider-prev' ? 'Previous slide' : 'Next slide'}
          onClick={action}
          style={{
            position: 'absolute',
            top: '50%',
            [side]: '20px',
            transform: 'translateY(-50%)',
            zIndex: 10,
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            fontSize: '1.1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.25s ease',
            outline: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(0,229,255,0.25)';
            e.currentTarget.style.borderColor = '#00e5ff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.45)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
          }}
        >
          {label}
        </button>
      ))}
    </section>
  );
}
