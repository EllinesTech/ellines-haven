import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

/* ──────────────────────────────────────────────────────────────
   Device & Phone Settings Panel
   Lets admin/superadmin configure device-specific behaviour:
     - Mobile layout tweaks (font sizes, reader defaults)
     - PWA / home-screen installation prompt control
     - Device-level DRM (extra protections for mobile)
     - Screen orientation lock hint
     - Phone number & WhatsApp contact settings
     - Touch/swipe gesture settings in reader
   All settings are stored in Firestore site_data/device_settings
   and read by AppContext (via siteControls / deviceSettings).
────────────────────────────────────────────────────────────── */

const FS_DOC = 'device_settings';

const DEFAULTS = {
  /* Reader UX */
  mobileFontSizeDefault: 17,
  mobileReaderDefaultMode: 'text',
  mobileSidebarDefaultOpen: false,
  swipeToChangeChapter: true,
  doubleTapToFontSize: true,
  showMobileProgressBar: true,

  /* PWA / Install prompt */
  pwaInstallPrompt: true,
  pwaShortName: 'Ellines Haven',
  pwaThemeColor: '#0d0d1a',
  pwaBackgroundColor: '#0d0d1a',

  /* Mobile DRM extras */
  disableScreenshotMobile: false,
  requirePortraitOnMobile: false,

  /* Contact / phone numbers */
  primaryPhone: '0748255466',
  secondaryPhone: '0728807213',
  whatsappNumber: '254748255466',
  whatsappDefaultMsg: 'Hello Ellines Haven, I would like to inquire about',
  supportEmail: 'ellines.haven@gmail.com',
  showWhatsappFloat: true,
  showCallFloat: false,

  /* Device access control */
  mobileAccessEnabled: true,
  tabletAccessEnabled: true,
  desktopAccessEnabled: true,
  restrictedDeviceMsg: 'Access to Ellines Haven is restricted on this device type.',

  /* Offline / caching */
  offlineEnabled: true,
  maxOfflineBooks: 10,
  cacheVersionBust: false,
};

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        flexShrink: 0,
        minWidth: 60,
        padding: '7px 14px',
        borderRadius: 'var(--r-sm)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        fontSize: '0.82rem',
        transition: 'all 0.2s',
        opacity: disabled ? 0.5 : 1,
        background: value ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)',
        color: value ? 'var(--gold)' : 'var(--muted)',
      }}
    >
      {value ? 'ON' : 'OFF'}
    </button>
  );
}

function SettingRow({ icon, label, desc, children, danger }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 18px',
      background: danger ? 'rgba(231,76,60,0.03)' : 'rgba(255,255,255,0.015)',
      border: `1px solid ${danger ? 'rgba(231,76,60,0.2)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 'var(--r-sm)',
    }}>
      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: 2 }}>{label}</strong>
        {desc && <span style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</span>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(201,168,76,0.04)',
      }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <strong style={{ fontSize: '0.9rem', color: 'var(--gold)' }}>{title}</strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px' }}>
        {children}
      </div>
    </div>
  );
}

export default function DeviceSettingsPanel({ showToast, isSuper }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [dirty,   setDirty]     = useState(false);

  useEffect(() => {
    setLoading(true);
    getDoc(doc(db, 'site_data', FS_DOC))
      .then(snap => {
        if (snap.exists()) {
          setSettings({ ...DEFAULTS, ...snap.data() });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key, val) => {
    setSettings(s => ({ ...s, [key]: val }));
    setDirty(true);
  };

  const toggle = key => set(key, !settings[key]);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', FS_DOC), {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: 'admin',
      }, { merge: true });
      showToast?.('✅ Device settings saved');
      setDirty(false);
    } catch (e) {
      showToast?.('❌ Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!window.confirm('Reset all device settings to defaults?')) return;
    setSettings(DEFAULTS);
    setDirty(true);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>📱</div>
        <p>Loading device settings…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      {/* Header */}
      <div className="adm-page-head">
        <div>
          <h1>📱 Device &amp; Phone Settings</h1>
          <span className="adm-page-sub">
            Configure how Ellines Haven behaves across phones, tablets, and desktops — all settings sync in real-time.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={reset}>Reset to Defaults</button>
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
        <div style={{
          background: 'rgba(232,131,42,0.1)', border: '1px solid rgba(232,131,42,0.35)',
          borderRadius: 'var(--r-sm)', padding: '10px 16px', marginBottom: 20,
          fontSize: '0.83rem', color: '#e8832a',
        }}>
          ⚠️ You have unsaved changes — click <strong>Save Changes</strong> to apply them.
        </div>
      )}

      {/* ── Device Access Control ── */}
      <SectionCard title="Device Access Control" icon="🔒">
        <SettingRow icon="📱" label="Mobile Access" desc="Allow visitors on smartphones (≤768px) to access the site.">
          <Toggle value={settings.mobileAccessEnabled} onChange={v => set('mobileAccessEnabled', v)} />
        </SettingRow>
        <SettingRow icon="📟" label="Tablet Access" desc="Allow visitors on tablets (769–1024px) to access the site.">
          <Toggle value={settings.tabletAccessEnabled} onChange={v => set('tabletAccessEnabled', v)} />
        </SettingRow>
        <SettingRow icon="🖥️" label="Desktop Access" desc="Allow visitors on desktop/laptop browsers to access the site.">
          <Toggle value={settings.desktopAccessEnabled} onChange={v => set('desktopAccessEnabled', v)} />
        </SettingRow>
        {(!settings.mobileAccessEnabled || !settings.tabletAccessEnabled || !settings.desktopAccessEnabled) && (
          <div style={{ padding: '8px 10px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Message shown to blocked device users:
            </label>
            <input
              className="field"
              value={settings.restrictedDeviceMsg}
              onChange={e => set('restrictedDeviceMsg', e.target.value)}
              placeholder="Access to Ellines Haven is restricted on this device type."
            />
          </div>
        )}
      </SectionCard>

      {/* ── Reader Mobile UX ── */}
      <SectionCard title="Reader — Mobile Reading Experience" icon="📖">
        <SettingRow icon="🔤" label="Default Font Size on Mobile" desc="Starting font size (px) when a user opens a book on mobile.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="reader__font-btn"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
              onClick={() => set('mobileFontSizeDefault', Math.max(13, settings.mobileFontSizeDefault - 1))}
            >−</button>
            <span style={{ minWidth: 38, textAlign: 'center', fontSize: '0.88rem', fontWeight: 700 }}>
              {settings.mobileFontSizeDefault}px
            </span>
            <button
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
              onClick={() => set('mobileFontSizeDefault', Math.min(26, settings.mobileFontSizeDefault + 1))}
            >+</button>
          </div>
        </SettingRow>

        <SettingRow icon="📄" label="Default Mode on Mobile" desc="Which reading mode opens first on phones.">
          <select
            className="field"
            style={{ maxWidth: 120, fontSize: '0.82rem' }}
            value={settings.mobileReaderDefaultMode}
            onChange={e => set('mobileReaderDefaultMode', e.target.value)}
          >
            <option value="pdf">📄 PDF</option>
            <option value="text">📖 Read</option>
            <option value="listen">🎧 Listen</option>
          </select>
        </SettingRow>

        <SettingRow icon="☰" label="Start with Sidebar Open on Mobile" desc="When disabled, the chapter list is hidden on open — readers see content immediately.">
          <Toggle value={settings.mobileSidebarDefaultOpen} onChange={v => set('mobileSidebarDefaultOpen', v)} />
        </SettingRow>

        <SettingRow icon="👆" label="Swipe to Change Chapter" desc="Allow left/right swipe gestures to navigate between chapters on touchscreens.">
          <Toggle value={settings.swipeToChangeChapter} onChange={v => set('swipeToChangeChapter', v)} />
        </SettingRow>

        <SettingRow icon="✌️" label="Double-Tap to Reset Font Size" desc="Double-tap the reading area to snap font size back to default.">
          <Toggle value={settings.doubleTapToFontSize} onChange={v => set('doubleTapToFontSize', v)} />
        </SettingRow>

        <SettingRow icon="📊" label="Show Reading Progress Bar on Mobile" desc="Display a thin progress bar at the top of the reader on phones.">
          <Toggle value={settings.showMobileProgressBar} onChange={v => set('showMobileProgressBar', v)} />
        </SettingRow>
      </SectionCard>

      {/* ── Mobile DRM ── */}
      <SectionCard title="Mobile DRM &amp; Content Protection" icon="🛡️">
        <SettingRow
          icon="📸"
          label="Extra Screenshot Deterrent on Mobile"
          desc="Adds a full-screen grid overlay pattern that degrades screenshots on mobile browsers."
          danger={settings.disableScreenshotMobile}
        >
          <Toggle value={settings.disableScreenshotMobile} onChange={v => set('disableScreenshotMobile', v)} />
        </SettingRow>
        <SettingRow
          icon="🔄"
          label="Require Portrait Orientation (Reader)"
          desc="Hint to mobile OS to lock screen in portrait while reading. Not enforced on all devices."
        >
          <Toggle value={settings.requirePortraitOnMobile} onChange={v => set('requirePortraitOnMobile', v)} />
        </SettingRow>
      </SectionCard>

      {/* ── Offline / Caching ── */}
      <SectionCard title="Offline &amp; Caching" icon="💾">
        <SettingRow icon="📥" label="Allow Offline Saving" desc="Users can save books to their browser for offline reading.">
          <Toggle value={settings.offlineEnabled} onChange={v => set('offlineEnabled', v)} />
        </SettingRow>
        <SettingRow icon="📚" label="Max Offline Books per User" desc="Maximum number of books a user can save offline at one time.">
          <select
            className="field"
            style={{ maxWidth: 90, fontSize: '0.82rem' }}
            value={settings.maxOfflineBooks}
            onChange={e => set('maxOfflineBooks', parseInt(e.target.value))}
          >
            {[1, 3, 5, 10, 20, 50].map(n => (
              <option key={n} value={n}>{n} book{n !== 1 ? 's' : ''}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          icon="🔄"
          label="Force Cache Bust"
          desc="On next page load, clears old cached assets. Turn ON briefly if a deployment isn't showing for users, then turn OFF."
          danger={settings.cacheVersionBust}
        >
          <Toggle value={settings.cacheVersionBust} onChange={v => set('cacheVersionBust', v)} />
        </SettingRow>
      </SectionCard>

      {/* ── PWA / Install Prompt ── */}
      <SectionCard title="PWA &amp; Home Screen Install" icon="📲">
        <SettingRow icon="📲" label="Show Install Prompt" desc="Show a 'Add to Home Screen' banner on mobile browsers that support PWA installation.">
          <Toggle value={settings.pwaInstallPrompt} onChange={v => set('pwaInstallPrompt', v)} />
        </SettingRow>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-group">
            <label>App Short Name (Home Screen label)</label>
            <input
              className="field"
              value={settings.pwaShortName}
              maxLength={12}
              onChange={e => set('pwaShortName', e.target.value)}
              placeholder="Ellines Haven"
            />
            <small>Keep under 12 characters so it displays cleanly under the icon.</small>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Theme Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={settings.pwaThemeColor}
                  onChange={e => set('pwaThemeColor', e.target.value)}
                  style={{ width: 40, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                />
                <input
                  className="field"
                  value={settings.pwaThemeColor}
                  onChange={e => set('pwaThemeColor', e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Splash Background Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={settings.pwaBackgroundColor}
                  onChange={e => set('pwaBackgroundColor', e.target.value)}
                  style={{ width: 40, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                />
                <input
                  className="field"
                  value={settings.pwaBackgroundColor}
                  onChange={e => set('pwaBackgroundColor', e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Contact & Phone Numbers ── */}
      <SectionCard title="Contact Numbers &amp; WhatsApp" icon="📞">
        <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          <div className="form-group">
            <label>Primary Phone Number</label>
            <input
              className="field"
              value={settings.primaryPhone}
              onChange={e => set('primaryPhone', e.target.value)}
              placeholder="0748255466"
              type="tel"
            />
            <small>Displayed in footer, contact page, and WhatsApp links.</small>
          </div>
          <div className="form-group">
            <label>Secondary Phone Number</label>
            <input
              className="field"
              value={settings.secondaryPhone}
              onChange={e => set('secondaryPhone', e.target.value)}
              placeholder="0728807213"
              type="tel"
            />
          </div>
          <div className="form-group">
            <label>WhatsApp Number (with country code)</label>
            <input
              className="field"
              value={settings.whatsappNumber}
              onChange={e => set('whatsappNumber', e.target.value)}
              placeholder="254748255466"
              type="tel"
            />
            <small>Format: 254XXXXXXXXX (no +, no spaces).</small>
          </div>
          <div className="form-group">
            <label>Support Email</label>
            <input
              className="field"
              value={settings.supportEmail}
              onChange={e => set('supportEmail', e.target.value)}
              placeholder="ellines.haven@gmail.com"
              type="email"
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>WhatsApp Pre-filled Message</label>
            <input
              className="field"
              value={settings.whatsappDefaultMsg}
              onChange={e => set('whatsappDefaultMsg', e.target.value)}
              placeholder="Hello Ellines Haven, I would like to inquire about"
            />
            <small>Users clicking the WhatsApp button will have this text pre-filled.</small>
          </div>
        </div>
        <SettingRow icon="💬" label="Show WhatsApp Floating Button" desc="Display the green WhatsApp FAB on all pages.">
          <Toggle value={settings.showWhatsappFloat} onChange={v => set('showWhatsappFloat', v)} />
        </SettingRow>
        <SettingRow icon="📞" label="Show Call Floating Button" desc="Show a phone call FAB alongside WhatsApp.">
          <Toggle value={settings.showCallFloat} onChange={v => set('showCallFloat', v)} />
        </SettingRow>
      </SectionCard>

      {/* Save footer strip */}
      <div style={{
        position: 'sticky', bottom: 0,
        background: 'rgba(13,13,26,0.97)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(201,168,76,0.2)',
        padding: '12px 0',
        display: 'flex', justifyContent: 'flex-end', gap: 10,
        zIndex: 10,
      }}>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={saving || !dirty}
          style={{ opacity: !dirty ? 0.6 : 1 }}
        >
          {saving ? '⏳ Saving…' : '💾 Save Changes'}
        </button>
      </div>
    </div>
  );
}
