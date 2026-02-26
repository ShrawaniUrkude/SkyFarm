import React from 'react';

/**
 * AIInsightPanel — renders the OpenAI-powered field solution.
 *
 * Props:
 *  solution   : string | null  — GPT response text
 *  loading    : bool
 *  error      : string | null
 *  model      : string | null  — e.g. "gpt-4o-mini"
 *  onFetch    : () => void     — called when user clicks "Get AI Solution"
 *  onClear    : () => void     — called when user clicks "Clear"
 *  label      : string         — button label (optional)
 *  accentColor: string         — hex colour (optional, defaults to #00e5ff)
 */
export default function AIInsightPanel({
    solution, loading, error, model,
    onFetch, onClear,
    label       = '🤖 Get AI Solution',
    accentColor = '#00e5ff',
}) {
    /* Parse bullet lines — each line starting with an emoji is its own bullet */
    const lines = solution
        ? solution.split('\n').map(l => l.trim()).filter(Boolean)
        : [];

    return (
        <div style={{
            marginTop: 16,
            borderRadius: 12,
            border: `1.5px solid ${accentColor}33`,
            background: `linear-gradient(135deg,rgba(0,0,0,0.35),rgba(0,0,0,0.2))`,
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: `1px solid ${accentColor}22`,
                background: `${accentColor}0a`,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1rem' }}>⚡</span>
                    <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                        color: accentColor, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                    }}>
                        AI Solution  {model && <span style={{ fontWeight: 400, opacity: 0.6 }}>· {model}</span>}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {solution && (
                        <button onClick={onClear}
                            style={{
                                padding: '3px 10px', borderRadius: 5,
                                background: 'transparent', border: `1px solid rgba(255,255,255,0.1)`,
                                color: 'rgba(255,255,255,0.35)', fontSize: '0.65rem', cursor: 'pointer',
                                fontFamily: 'var(--font-mono)',
                            }}>Clear</button>
                    )}
                    <button onClick={onFetch} disabled={loading}
                        style={{
                            padding: '4px 14px', borderRadius: 6,
                            background: loading ? 'rgba(0,0,0,0.3)' : `${accentColor}18`,
                            border: `1px solid ${accentColor}44`,
                            color: loading ? 'rgba(255,255,255,0.3)' : accentColor,
                            fontSize: '0.7rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                            display: 'flex', alignItems: 'center', gap: 5,
                            transition: 'all 0.2s',
                        }}>
                        {loading ? (
                            <>
                                <span style={{
                                    display: 'inline-block', width: 10, height: 10,
                                    border: `2px solid ${accentColor}33`, borderTopColor: accentColor,
                                    borderRadius: '50%',
                                    animation: 'ai-spin 0.8s linear infinite',
                                }}/>
                                Thinking…
                            </>
                        ) : label}
                    </button>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px 16px', minHeight: solution || loading || error ? 60 : 0 }}>
                {/* Error */}
                {error && (
                    <div style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(255,56,100,0.08)', border: '1px solid rgba(255,56,100,0.25)',
                        fontSize: '0.75rem', color: '#ff3864',
                    }}>
                        🚨 {error}
                    </div>
                )}

                {/* Loading skeleton */}
                {loading && !solution && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[90, 75, 85, 60].map((w, i) => (
                            <div key={i} style={{
                                height: 10, borderRadius: 4, width: `${w}%`,
                                background: 'rgba(255,255,255,0.06)',
                                animation: 'ai-pulse 1.4s ease-in-out infinite',
                                animationDelay: `${i * 0.15}s`,
                            }}/>
                        ))}
                    </div>
                )}

                {/* Solution bullets */}
                {solution && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {lines.map((line, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                padding: '7px 10px', borderRadius: 8,
                                background: line.startsWith('📅')
                                    ? `${accentColor}0d`
                                    : 'rgba(255,255,255,0.03)',
                                border: line.startsWith('📅')
                                    ? `1px solid ${accentColor}22`
                                    : '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <span style={{ fontSize: '0.85rem', lineHeight: 1, marginTop: 1, flexShrink: 0 }}>
                                    {line.match(/^\p{Emoji}/u)?.[0] || '•'}
                                </span>
                                <span style={{
                                    fontSize: '0.78rem',
                                    color: line.startsWith('📅')
                                        ? accentColor
                                        : 'var(--color-text-secondary)',
                                    lineHeight: 1.6,
                                }}>
                                    {line.replace(/^\p{Emoji_Presentation}+/u, '').replace(/^[\p{Emoji}\uFE0F]+\s*/u, '').trim()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Placeholder when no action taken yet */}
                {!solution && !loading && !error && (
                    <p style={{
                        fontSize: '0.74rem', color: 'var(--color-text-muted)',
                        textAlign: 'center', margin: '8px 0',
                    }}>
                        Click "{label}" to get an OpenAI-powered field solution based on your current data.
                    </p>
                )}
            </div>

            {/* Inline keyframes */}
            <style>{`
                @keyframes ai-spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                @keyframes ai-pulse {
                    0%, 100% { opacity: 0.3; }
                    50%       { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}
