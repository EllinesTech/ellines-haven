import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * RESPONSIVE LAYOUT EDITOR
 * 
 * Allows admin/super-admin to customize responsive layout settings per device type:
 * - Mobile (≤768px): Font sizes, padding, button heights, reader defaults
 * - Tablet (769-1024px): Grid layout, section padding, card sizing  
 * - Desktop (≥1025px): Max widths, sidebar widths, multi-column layouts
 * 
 * All settings persist to Firestore and apply site-wide via CSS variables
 */

const BREAKPOINTS = {
  mobile: { min: 0, max: 768, label: '📱 Mobile' },
  tablet: { min: 769, max: 1024, label: '📟 Tablet' },
  desktop: { min: 1025, max: Infinity, label: '🖥️ Desktop' },
};

const DEFAULTS = {
  // Mobile Layout (≤768px)
  mobile: {
    pagePadding: 16,
    sectionPadding: 24,
    cardPadding: 12,
    baseFontSize: 14,
    headingFontSize: 20,
    bodyFontSize: 14,
    buttonHeight: 44,
    inputHeight: 40,
    gridCols: 1,
    navbarHeight: 60,
    borderRadius: 8,
    cardSpacing: 12,
    maxWidth: '100%',
  },
  // Tablet Layout (769-1024px)
  tablet: {
    pagePadding: 24,
    sectionPadding: 40,
    cardPadding: 16,
    baseFontSize: 15,
    headingFontSize: 24,
    bodyFontSize: 15,
    buttonHeight: 44,
    inputHeight: 40,
    gridCols: 2,
    navbarHeight: 70,
    borderRadius: 10,
    cardSpacing: 16,
    maxWidth: '100%',
  },
  // Desktop Layout (≥1025px)
  desktop: {
    pagePadding: 32,
    sectionPadding: 88,
    cardPadding: 20,
    baseFontSize: 16,
    headingFontSize: 28,
    bodyFontSize: 16,
    buttonHeight: 48,
    inputHeight: 44,
    gridCols: 3,
    navbarHeight: 90,
    borderRadius: 12,
    cardSpacing: 20,
    maxWidth: '1400px',
  },
};

function NumericInput({ label, desc, value, onChange, min = 0, max = 200, step = 2, unit = 'px' }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <strong style={{ fontSize: '0.82rem', display: 'block', marginBottom: 2 }}>{label}</strong>
          {desc && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{desc}</span>}
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--gold)', fontWeight: 600, fontFamily: 'monospace' }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--gold)' }}
      />
    </div>
  );
}

function DeviceCard({ device, label, settings, onChange }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 20 }}>
      <div style={{
        padding: '12px 0',
        marginBottom: 16,
        borderBottom: '2px solid var(--gold)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: '1.3rem' }}>{label.split(' ')[0]}</span>
        <div>
          <strong style={{ fontSize: '0.88rem', display: 'block' }}>{label}</strong>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            {BREAKPOINTS[device].min === 0
              ? `≤ ${BREAKPOINTS[device].max}px`
              : BREAKPOINTS[device].max === Infinity
              ? `≥ ${BREAKPOINTS[device].min}px`
              : `${BREAKPOINTS[device].min}–${BREAKPOINTS[device].max}px`}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <NumericInput
          label="Page Padding"
          desc="Outer margin around content"
          value={settings.pagePadding}
          onChange={(v) => onChange({ ...settings, pagePadding: v })}
          min={8}
          max={48}
        />
        <NumericInput
          label="Section Padding"
          desc="Space between major sections"
          value={settings.sectionPadding}
          onChange={(v) => onChange({ ...settings, sectionPadding: v })}
          min={16}
          max={120}
        />
        <NumericInput
          label="Card Padding"
          desc="Inner spacing in cards"
          value={settings.cardPadding}
          onChange={(v) => onChange({ ...settings, cardPadding: v })}
          min={8}
          max={32}
        />
        <NumericInput
          label="Card Spacing"
          desc="Gap between cards in grid"
          value={settings.cardSpacing}
          onChange={(v) => onChange({ ...settings, cardSpacing: v })}
          min={8}
          max={32}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <NumericInput
          label="Base Font Size"
          desc="Default text size"
          value={settings.baseFontSize}
          onChange={(v) => onChange({ ...settings, baseFontSize: v })}
          min={12}
          max={24}
        />
        <NumericInput
          label="Heading Font Size"
          desc="Page titles (h1, h2)"
          value={settings.headingFontSize}
          onChange={(v) => onChange({ ...settings, headingFontSize: v })}
          min={16}
          max={48}
        />
        <NumericInput
          label="Body Font Size"
          desc="Paragraph text"
          value={settings.bodyFontSize}
          onChange={(v) => onChange({ ...settings, bodyFontSize: v })}
          min={12}
          max={20}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <NumericInput
          label="Button Height"
          desc="Default button size"
          value={settings.buttonHeight}
          onChange={(v) => onChange({ ...settings, buttonHeight: v })}
          min={32}
          max={64}
        />
        <NumericInput
          label="Input Height"
          desc="Form field height"
          value={settings.inputHeight}
          onChange={(v) => onChange({ ...settings, inputHeight: v })}
          min={32}
          max={56}
        />
        <NumericInput
          label="Navbar Height"
          desc="Header/navigation height"
          value={settings.navbarHeight}
          onChange={(v) => onChange({ ...settings, navbarHeight: v })}
          min={48}
          max={120}
        />
        <NumericInput
          label="Border Radius"
          desc="Corner roundness"
          value={settings.borderRadius}
          onChange={(v) => onChange({ ...settings, borderRadius: v })}
          min={0}
          max={24}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <strong style={{ fontSize: '0.82rem', display: 'block', marginBottom: 8 }}>Grid Columns</strong>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => onChange({ ...settings, gridCols: n })}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  border: settings.gridCols === n ? '2px solid var(--gold)' : '1px solid var(--border)',
                  background: settings.gridCols === n ? 'rgba(201,168,76,0.1)' : 'transparent',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: settings.gridCols === n ? 'var(--gold)' : 'var(--text)',
                }}
              >
                {n} col{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
        <div>
          <strong style={{ fontSize: '0.82rem', display: 'block', marginBottom: 8 }}>Max Width</strong>
          <input
            className="field"
            value={settings.maxWidth}
            onChange={(e) => onChange({ ...settings, maxWidth: e.target.value })}
            placeholder="100% or 1400px"
            style={{ fontSize: '0.78rem' }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ResponsiveLayoutEditor({ showToast, isSuper }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLoading(true);
    getDoc(doc(db, 'site_data', 'responsive_layout'))
      .then((snap) => {
        if (snap.exists()) {
          setSettings(snap.data());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateDevice = (device, newSettings) => {
    setSettings((s) => ({ ...s, [device]: newSettings }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'site_data', 'responsive_layout'),
        {
          ...settings,
          updatedAt: serverTimestamp(),
          updatedBy: 'admin',
        },
        { merge: true }
      );

      // Apply to document root CSS variables
      applyResponsiveSettings(settings);

      showToast?.('✅ Responsive layout settings saved & live');
      setDirty(false);
    } catch (e) {
      showToast?.('❌ Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!window.confirm('Reset all responsive layout settings to defaults?')) return;
    setSettings(DEFAULTS);
    applyResponsiveSettings(DEFAULTS);
    setDirty(true);
    showToast?.('🔄 Reset to defaults');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>📐</div>
        <p>Loading responsive layout settings…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📐 Responsive Layout Editor</h1>
          <span className="adm-page-sub">
            Customize spacing, font sizes, and layout for each device type. Changes sync in real-time.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={reset}>
            Reset to Defaults
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={saving || !dirty}
            style={{ opacity: !dirty ? 0.6 : 1 }}
          >
            {saving ? '⏳ Saving…' : dirty ? '💾 Save Changes' : '✅ Saved'}
          </button>
        </div>
      </div>

      {dirty && (
        <div
          style={{
            background: 'rgba(232,131,42,0.1)',
            border: '1px solid rgba(232,131,42,0.35)',
            borderRadius: 'var(--r-sm)',
            padding: '10px 16px',
            marginBottom: 20,
            fontSize: '0.83rem',
            color: '#e8832a',
          }}
        >
          ⚠️ You have unsaved changes — click <strong>Save Changes</strong> to apply them.
        </div>
      )}

      <div style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '0.95rem', color: 'var(--gold)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          📱 Mobile Settings (≤768px)
        </h2>
        <DeviceCard
          device="mobile"
          label="📱 Mobile"
          settings={settings.mobile}
          onChange={(s) => updateDevice('mobile', s)}
        />
      </div>

      <div style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '0.95rem', color: 'var(--gold)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          📟 Tablet Settings (769–1024px)
        </h2>
        <DeviceCard
          device="tablet"
          label="📟 Tablet"
          settings={settings.tablet}
          onChange={(s) => updateDevice('tablet', s)}
        />
      </div>

      <div>
        <h2 style={{ fontSize: '0.95rem', color: 'var(--gold)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          🖥️ Desktop Settings (≥1025px)
        </h2>
        <DeviceCard
          device="desktop"
          label="🖥️ Desktop"
          settings={settings.desktop}
          onChange={(s) => updateDevice('desktop', s)}
        />
      </div>

      <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 40, borderTop: '1px solid rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: '0.82rem' }}>
        💡 All changes automatically sync across devices. Refresh your browser to see live updates.
      </div>
    </div>
  );
}

// Helper function to apply responsive settings to CSS
function applyResponsiveSettings(settings) {
  let style = document.getElementById('eh-responsive-layout');
  if (!style) {
    style = document.createElement('style');
    style.id = 'eh-responsive-layout';
    document.head.appendChild(style);
  }

  const mobile = settings.mobile;
  const tablet = settings.tablet;
  const desktop = settings.desktop;

  style.textContent = `
    /* Mobile Layout */
    @media (max-width: 768px) {
      :root {
        --page-pad: ${mobile.pagePadding}px;
        --section-pad: ${mobile.sectionPadding}px;
        --card-pad: ${mobile.cardPadding}px;
        --base-font: ${mobile.baseFontSize}px;
        --heading-font: ${mobile.headingFontSize}px;
        --body-font: ${mobile.bodyFontSize}px;
        --btn-h: ${mobile.buttonHeight}px;
        --input-h: ${mobile.inputHeight}px;
        --navbar-h: ${mobile.navbarHeight}px;
        --r: ${mobile.borderRadius}px;
        --grid-cols: ${mobile.gridCols};
      }
      body { font-size: ${mobile.baseFontSize}px; }
      h1, h2 { font-size: ${mobile.headingFontSize}px; }
      p, body { font-size: ${mobile.bodyFontSize}px; }
      .btn, button { height: ${mobile.buttonHeight}px; }
      input, select, textarea { height: ${mobile.inputHeight}px; }
    }

    /* Tablet Layout */
    @media (min-width: 769px) and (max-width: 1024px) {
      :root {
        --page-pad: ${tablet.pagePadding}px;
        --section-pad: ${tablet.sectionPadding}px;
        --card-pad: ${tablet.cardPadding}px;
        --base-font: ${tablet.baseFontSize}px;
        --heading-font: ${tablet.headingFontSize}px;
        --body-font: ${tablet.bodyFontSize}px;
        --btn-h: ${tablet.buttonHeight}px;
        --input-h: ${tablet.inputHeight}px;
        --navbar-h: ${tablet.navbarHeight}px;
        --r: ${tablet.borderRadius}px;
        --grid-cols: ${tablet.gridCols};
      }
      body { font-size: ${tablet.baseFontSize}px; }
      h1, h2 { font-size: ${tablet.headingFontSize}px; }
      p, body { font-size: ${tablet.bodyFontSize}px; }
      .btn, button { height: ${tablet.buttonHeight}px; }
      input, select, textarea { height: ${tablet.inputHeight}px; }
    }

    /* Desktop Layout */
    @media (min-width: 1025px) {
      :root {
        --page-pad: ${desktop.pagePadding}px;
        --section-pad: ${desktop.sectionPadding}px;
        --card-pad: ${desktop.cardPadding}px;
        --base-font: ${desktop.baseFontSize}px;
        --heading-font: ${desktop.headingFontSize}px;
        --body-font: ${desktop.bodyFontSize}px;
        --btn-h: ${desktop.buttonHeight}px;
        --input-h: ${desktop.inputHeight}px;
        --navbar-h: ${desktop.navbarHeight}px;
        --r: ${desktop.borderRadius}px;
        --grid-cols: ${desktop.gridCols};
      }
      body { font-size: ${desktop.baseFontSize}px; }
      h1, h2 { font-size: ${desktop.headingFontSize}px; }
      p, body { font-size: ${desktop.bodyFontSize}px; }
      .btn, button { height: ${desktop.buttonHeight}px; }
      input, select, textarea { height: ${desktop.inputHeight}px; }
    }
  `;
}

// Apply on mount
if (typeof window !== 'undefined') {
  getDoc(doc(db, 'site_data', 'responsive_layout')).then((snap) => {
    if (snap.exists()) {
      applyResponsiveSettings(snap.data());
    } else {
      applyResponsiveSettings(DEFAULTS);
    }
  }).catch(() => applyResponsiveSettings(DEFAULTS));
}
