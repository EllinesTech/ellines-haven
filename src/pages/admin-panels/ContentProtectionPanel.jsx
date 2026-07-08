/**
 * ContentProtectionPanel — Admin control for DRM / copy-protection settings.
 *
 * All toggles are stored in siteControls (Firestore site_data/perms → siteControls)
 * and read in real-time by the Reader and SiteControls components on every page.
 *
 * Toggles:
 *  disableRightClick      — block contextmenu on reader
 *  disableCopy            — block copy / cut / drag on reader
 *  disableSelect          — CSS user-select:none on reader (already default, but toggleable)
 *  disableKeyboardShortcuts — block Ctrl+C/A/S/P/U, F12, Ctrl+Shift+I/J
 *  disablePrint           — intercept beforeprint, show DRM block screen
 *  disableInspect         — block F12 and devtools shortcuts
 *  watermarkForce         — enforce watermark even if site-wide watermark is off
 *  screenshotOverlay      — adds a semi-transparent CSS overlay that degrades screenshots
 *  offlineEnabled         — allow users to save books for offline reading (default: true)
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
    label: '🖱️ Disable Right-Click',
    desc: 'Blocks the browser context menu on the reader page. Prevents "Save image", "View page source", etc.',
    def: true,
  },
  {
    key: 'disableCopy',
    label: '📋 Disable Copy & Paste',
    desc: 'Blocks Ctrl+C, cut, and drag-to-copy on book content. Text cannot be copied out of the reader.',
    def: true,
  },
  {
    key: 'disableSelect',
    label: '🖊️ Disable Text Selection',
    desc: 'CSS user-select:none on the reader — text cannot be highlighted or selected by mouse or keyboard.',
    def: true,
  },
  {
    key: 'disableKeyboardShortcuts',
    label: '⌨️ Block Copy Keyboard Shortcuts',
    desc: 'Blocks Ctrl+C, Ctrl+A, Ctrl+S, Ctrl+P, Ctrl+U, and F12 while reading.',
    def: true,
  },
  {
    key: 'disablePrint',
    label: '🖨️ Disable Printing',
    desc: 'Intercepts Ctrl+P and the print dialog. Replaces the page with a DRM notice when printing is attempted.',
    def: true,
  },
  {
    key: 'disableInspect',
    label: '🛠️ Block DevTools (F12)',
    desc: 'Blocks F12 and Ctrl+Shift+I / Ctrl+Shift+J to prevent inspecting the page source.',
    def: true,
  },
  {
    key: 'watermarkForce',
    label: '💧 Force Watermark on Reader',
    desc: 'Always show the user identity watermark on the reader page, regardless of site-wide watermark settings.',
    def: true,
  },
  {
    key: 'screenshotOverlay',
    label: '📸 Screenshot Deterrent Overlay',
    desc: 'Adds a subtle CSS overlay pattern over book content. Does not fully prevent screenshots but adds a visible watermark layer that degrades the quality of any screenshot.',
    def: false,
  },
  {
    key: 'offlineEnabled',
    label: '📥 Allow Offline Reading',
    desc: 'Lets users save book chapter text to their browser for offline reading. The data stays on their device only — it cannot be shared or exported as a file.',
    def: true,
  },
];

export default function ContentProtectionPanel({ showToast, siteControls, saveSiteControls }) {
  const c = siteControls || {};
  const [saving, setSaving] = useState(false);

  const get = (key, def) => {
    if (key in c) return !!c[key];
    return def;
  };

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

  // Compute a simple score
  const score = DRM_TOGGLES.filter(t => get(t.key, t.def) && t.key !== 'offlineEnabled').length;
  const maxScore = DRM_TOGGLES.filter(t => t.key !== 'offlineEnabled').length;
  const pct = Math.round((score / maxScore) * 100);
  const scoreColor = pct >= 80 ? '#2ecc71' : pct >= 50 ? '#e8832a' : '#e74c3c';

  return (
    <div className="adm-page">

      {/* Header */}
      <div className="adm-page-head" style={{ marginBottom: 24 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          🛡️ Content Protection
          {saving && (
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 400 }}>Saving…</span>
          )}
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.84rem', marginTop: 4 }}>
          Control how the reader protects book content from copying, screenshots, and unauthorised sharing.
          Changes take effect instantly for all users.
        </p>
      </div>

      {/* Protection score */}
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
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Protection Score</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 3 }}>
            {score} of {maxScore} protection layers active.
            {pct < 80 && ' Enable more layers for stronger protection.'}
            {pct >= 80 && ' Good — most protection layers are active.'}
          </div>
        </div>
      </div>

      {/* Important note */}
      <div style={{
        background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)',
        borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 24,
        fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--gold)' }}>ℹ️ Important:</strong> These controls are a strong deterrent, but no web-based DRM is
        100% unbreakable. Determined users with technical knowledge can always bypass browser-level
        protections. The best protection is the combination of watermarks (user identity embedded in
        content), legal terms, and community trust. Use these controls together with your watermark
        and legal policy.
      </div>

      {/* Toggle cards by group */}
      <div className="card" style={{ padding: '4px 20px 16px', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, padding: '16px 0 6px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 0 }}>
          🔒 Copy & Access Controls
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
          🎨 Visual Protection
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
          📥 Offline Access
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
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          When offline reading is enabled, users see a "Save Offline" button in the reader. Chapter text is
          stored only in their own browser storage — it cannot be exported, shared, or accessed from another device.
          Disabling this removes the button and prevents new offline saves. Existing cached data stays until the
          user clears their browser storage.
        </p>
      </div>

      {/* Screenshot tips */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 10 }}>📸 About Screenshot Protection</h3>
        <ul style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.8, paddingLeft: 20 }}>
          <li>The <strong>Screenshot Deterrent Overlay</strong> adds a repeating watermark grid over the reader content, making any screenshot include the user's identity information.</li>
          <li>The reader already embeds the user's name and email in the page content as ghost watermarks.</li>
          <li>True screenshot blocking is not possible on the web — operating systems handle screenshots at a level browsers cannot access.</li>
          <li>The user's name and email are burned into the ghost watermark tiles. If a screenshot is shared, the watermark identifies the source.</li>
        </ul>
      </div>
    </div>
  );
}
