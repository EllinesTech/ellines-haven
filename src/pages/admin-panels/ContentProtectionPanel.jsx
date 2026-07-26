/**
 * ContentProtectionPanel — Admin / Super-admin DRM + Keep forever settings.
 *
 * Stored in siteControls (Firestore site_data/perms → siteControls)
 * and read in real-time by Reader, My Library, and App.jsx SiteControls.
 */

import { useState } from 'react';

function Toggle({ label, desc, checked, onChange }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ flex: 1, paddingRight: 24 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {desc && (
          <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          position: 'relative', flexShrink: 0,
          background: checked ? 'var(--gold)' : 'rgba(255,255,255,0.15)',
          transition: 'background 0.2s',
        }}
        aria-pressed={checked}
        aria-label={label}
      >
        <span style={{
          position: 'absolute', top: 3,
          left: checked ? 22 : 2,
          width: 18, height: 18,
          borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  );
}

const DRM_TOGGLES = [
  {
    key: 'disableRightClick',
    label: 'Disable Right-Click',
    desc: 'Blocks the browser context menu on the reader page.',
    def: true,
  },
  {
    key: 'disableCopy',
    label: 'Disable Copy & Paste',
    desc: 'Blocks Ctrl+C, cut, and drag-to-copy on book content.',
    def: true,
  },
  {
    key: 'disableSelect',
    label: 'Disable Text Selection',
    desc: 'CSS user-select:none on the reader — text cannot be highlighted.',
    def: true,
  },
  {
    key: 'disableKeyboardShortcuts',
    label: 'Block Copy Keyboard Shortcuts',
    desc: 'Blocks Ctrl+C, Ctrl+A, Ctrl+S, Ctrl+P, Ctrl+U, and F12 while reading.',
    def: true,
  },
  {
    key: 'disablePrint',
    label: 'Disable Printing',
    desc: 'Intercepts print and shows a DRM notice instead of the book.',
    def: true,
  },
  {
    key: 'disableInspect',
    label: 'Block DevTools (F12)',
    desc: 'Blocks F12 and Ctrl+Shift+I / Ctrl+Shift+J.',
    def: true,
  },
  {
    key: 'watermarkForce',
    label: 'Force Identity Watermark',
    desc: 'Always show the reader’s name & email watermark (anti-sharing). Default ON.',
    def: true,
  },
  {
    key: 'screenshotOverlay',
    label: 'Screenshot Deterrent Overlay',
    desc: 'Subtle overlay pattern so screenshots include identity watermarks.',
    def: false,
  },
  {
    key: 'offlineEnabled',
    label: 'Allow Keep Forever',
    desc: 'Lets readers keep chapters on their device (Owned forever). Stays after refresh; works offline. Not a shareable file export.',
    def: true,
  },
];

export default function ContentProtectionPanel({ showToast, siteControls, saveSiteControls, isSuper }) {
  const c = siteControls || {};
  const [saving, setSaving] = useState(false);

  const get = (key, def) => {
    if (key in c) return !!c[key];
    return def;
  };

  const maxBooks = Math.max(1, Number(c.maxOfflineBooks) || 10);

  const toggle = async (key, def) => {
    const current = get(key, def);
    setSaving(true);
    try {
      await saveSiteControls({ ...c, [key]: !current });
      showToast?.(`${!current ? '✅' : '⭕'} ${key} ${!current ? 'enabled' : 'disabled'}`);
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSaving(false);
  };

  const setMaxBooks = async (n) => {
    setSaving(true);
    try {
      await saveSiteControls({ ...c, maxOfflineBooks: n });
      showToast?.(`✅ Max Keep forever books set to ${n}`);
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSaving(false);
  };

  const score = DRM_TOGGLES.filter(t => get(t.key, t.def) && t.key !== 'offlineEnabled').length;
  const maxScore = DRM_TOGGLES.filter(t => t.key !== 'offlineEnabled').length;
  const pct = Math.round((score / maxScore) * 100);
  const scoreColor = pct >= 80 ? '#2ecc71' : pct >= 50 ? '#e8832a' : '#e74c3c';

  return (
    <div className="adm-page">

      <div className="adm-page-head" style={{ marginBottom: 24 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Content Protection
          {isSuper && (
            <span style={{
              fontSize: '0.68rem', background: 'linear-gradient(135deg,#c9a84c,#e8c96d)',
              color: '#000', padding: '2px 8px', borderRadius: 10, fontWeight: 700, letterSpacing: 1,
            }}>SUPER ADMIN</span>
          )}
          {saving && (
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 400 }}>Saving…</span>
          )}
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.84rem', marginTop: 4 }}>
          Anti-sharing (watermarks, copy blocks) and Keep forever / Owned forever device storage.
          Changes apply instantly for all readers.
        </p>
      </div>

      <div className="card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: `3px solid ${scoreColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem', fontWeight: 800, color: scoreColor, flexShrink: 0,
        }}>
          {pct}%
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Anti-sharing score</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 3 }}>
            {score} of {maxScore} protection layers active.
            {pct < 80 && ' Enable more layers for stronger protection.'}
            {pct >= 80 && ' Good — most protection layers are active.'}
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)',
        borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 24,
        fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--gold)' }}>Anti-sharing:</strong> Identity watermarks, licence notes,
        and copy/print blocks stay active while reading — online or from a kept copy.
        Keep forever stores chapters only in the reader’s browser (not a shareable file).
        No web DRM is 100% unbreakable; watermarks + legal terms are the durable layer.
      </div>

      <div className="card" style={{ padding: '4px 20px 16px', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, padding: '16px 0 6px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 0 }}>
          Copy &amp; Access Controls
        </h3>
        {DRM_TOGGLES.filter(t => !['screenshotOverlay', 'offlineEnabled', 'watermarkForce'].includes(t.key)).map(t => (
          <Toggle
            key={t.key}
            label={t.label}
            desc={t.desc}
            checked={get(t.key, t.def)}
            onChange={() => toggle(t.key, t.def)}
          />
        ))}
      </div>

      <div className="card" style={{ padding: '4px 20px 16px', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, padding: '16px 0 6px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 0 }}>
          Visual / Anti-sharing
        </h3>
        {DRM_TOGGLES.filter(t => ['watermarkForce', 'screenshotOverlay'].includes(t.key)).map(t => (
          <Toggle
            key={t.key}
            label={t.label}
            desc={t.desc}
            checked={get(t.key, t.def)}
            onChange={() => toggle(t.key, t.def)}
          />
        ))}
      </div>

      <div className="card" style={{ padding: '4px 20px 16px', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, padding: '16px 0 6px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 0 }}>
          Keep forever / Owned forever
        </h3>
        {DRM_TOGGLES.filter(t => t.key === 'offlineEnabled').map(t => (
          <Toggle
            key={t.key}
            label={t.label}
            desc={t.desc}
            checked={get(t.key, t.def)}
            onChange={() => toggle(t.key, t.def)}
          />
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Max books per device</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
              How many titles a reader can mark Owned forever on one browser.
              Also configurable under Device &amp; Phone (both apply; Content Protection wins if set).
            </div>
          </div>
          <select
            className="field"
            style={{ maxWidth: 100, fontSize: '0.82rem' }}
            value={maxBooks}
            onChange={(e) => setMaxBooks(parseInt(e.target.value, 10))}
            disabled={saving}
          >
            {[1, 3, 5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          Readers who skip Keep forever can still read online after refresh (account library).
          Without Keep forever they cannot read that title offline. Disabling this hides new Keep forever
          actions; existing device copies remain until the user removes them or clears site data.
        </p>
      </div>

      <div className="card" style={{ padding: '16px 20px' }}>
        <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 10 }}>Screenshot protection</h3>
        <ul style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Identity watermarks (name + email) appear on the reader when Force Identity Watermark is on.</li>
          <li>Screenshot Deterrent Overlay adds a repeating pattern so captures still show the licence.</li>
          <li>True OS-level screenshot blocking is not possible in browsers.</li>
        </ul>
      </div>
    </div>
  );
}
