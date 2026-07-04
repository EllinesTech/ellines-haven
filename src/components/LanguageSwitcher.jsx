import { useState, useRef, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';

export default function LanguageSwitcher() {
  const { lang, setLang, currentLang, languages } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.25)',
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          color: 'var(--text)', fontSize: '0.82rem', fontWeight: 500,
          transition: 'all 0.2s',
        }}
        aria-label="Change language"
        title="Change language"
      >
        🌐 <span>{currentLang.native}</span>
        <span style={{ fontSize: '0.65rem', opacity: 0.6, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          minWidth: 180, zIndex: 3000, overflow: 'hidden',
          maxHeight: 320, overflowY: 'auto',
        }}>
          <div style={{ padding: '8px 12px 6px', fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Select Language
          </div>
          {languages.map(l => (
            <button key={l.code} onClick={() => { setLang(l.code); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 14px', background: lang === l.code ? 'rgba(201,168,76,0.12)' : 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                borderLeft: lang === l.code ? '3px solid var(--gold)' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (lang !== l.code) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (lang !== l.code) e.currentTarget.style.background = 'none'; }}
            >
              <span style={{ fontSize: '0.88rem', color: lang === l.code ? 'var(--gold)' : 'var(--text)', fontWeight: lang === l.code ? 600 : 400 }}>
                {l.native}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                {l.name}
              </span>
              {lang === l.code && <span style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
