import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const INSTALLED = [
  { id: 'whatsapp',  name: 'WhatsApp Chat',       icon: '💬', desc: 'Live chat widget for customer support', status: 'active' },
  { id: 'firestore', name: 'Firestore Database',   icon: '🔥', desc: 'Real-time cloud database by Firebase',  status: 'active' },
  { id: 'mpesa',     name: 'M-Pesa / Airtel Pay',  icon: '💳', desc: 'Mobile payment gateway integration',    status: 'active' },
  { id: 'watermark', name: 'Watermark Protection',  icon: '🔒', desc: 'Protects book content from copying',   status: 'config' },
  { id: 'controls',  name: 'Site Controls',         icon: '⚙️', desc: 'Admin toggle switches for the site',   status: 'active' },
];

const AVAILABLE = [
  { id: 'ga4',        name: 'Google Analytics',     icon: '📊', desc: 'Track visitors with GA4',       field: 'ga4Id',        placeholder: 'G-XXXXXXXXXX',    label: 'GA4 Measurement ID' },
  { id: 'mailchimp',  name: 'Mailchimp Newsletter',  icon: '📧', desc: 'Email newsletter integration',  field: 'mailchimpKey', placeholder: 'API Key…',         label: 'Mailchimp API Key' },
  { id: 'fbpixel',    name: 'Facebook Pixel',        icon: '📘', desc: 'Facebook/Meta ad tracking',     field: 'fbPixelId',    placeholder: 'Pixel ID…',        label: 'Pixel ID' },
  { id: 'seo',        name: 'SEO Meta Manager',      icon: '🔍', desc: 'Page titles, descriptions, OG', field: 'seoTitle',     placeholder: 'Site title…',      label: 'Default Title' },
];

export default function PluginsPanel({ showToast, isSuper }) {
  const [pluginData,  setPluginData]  = useState({});
  const [scripts,     setScripts]     = useState([]);
  const [customCss,   setCustomCss]   = useState('');
  const [customJs,    setCustomJs]    = useState('');
  const [expanded,    setExpanded]    = useState(null);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'custom_code')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setCustomCss(d.css || '');
        setCustomJs(d.js || '');
        setScripts(d.scripts || []);
        setPluginData(d.plugins || {});
      }
    }).catch(() => {});
  }, []);

  const savePlugins = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', 'custom_code'), {
        css: customCss, js: customJs, scripts, plugins: pluginData, updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast?.('✅ Plugin settings saved!');
    } catch (e) { showToast?.('❌ Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const applyCSS = () => {
    let style = document.getElementById('eh-custom-css');
    if (!style) { style = document.createElement('style'); style.id = 'eh-custom-css'; document.head.appendChild(style); }
    style.textContent = customCss;
    showToast?.('🎨 CSS applied to page');
  };

  const runJS = () => {
    try {
      // eslint-disable-next-line no-new-func
      new Function(customJs)();
      showToast?.('⚡ JS executed');
    } catch (e) { showToast?.('❌ JS error: ' + e.message); }
  };

  const installPlugin = (id) => {
    setPluginData(prev => ({ ...prev, [id]: { ...prev[id], installed: true } }));
    showToast?.('✅ Plugin activated');
  };

  const removeScript = (idx) => {
    setScripts(s => s.filter((_, i) => i !== idx));
  };

  const addScript = (src) => {
    if (!src) return;
    setScripts(s => [...s, { src, addedAt: Date.now() }]);
  };

  const setPD = (id, key, val) => setPluginData(prev => ({ ...prev, [id]: { ...prev[id], [key]: val } }));

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div><h1>Plugins & Integrations</h1><span className="adm-page-sub">Manage integrations, custom code, and scripts</span></div>
        <button className="btn btn-primary" onClick={savePlugins} disabled={saving}>{saving ? '⏳ Saving…' : '💾 Save All'}</button>
      </div>

      {/* Installed plugins */}
      <h3 style={{ fontSize: '0.82rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Installed</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 28 }}>
        {INSTALLED.map(p => (
          <div key={p.id} className="card" style={{ padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>{p.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 3 }}>{p.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 8, lineHeight: 1.4 }}>{p.desc}</div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, background: p.status === 'active' ? 'rgba(46,204,113,0.15)' : 'rgba(201,168,76,0.15)', color: p.status === 'active' ? 'var(--ok)' : 'var(--gold)', borderRadius: 4, padding: '2px 7px' }}>
                {p.status === 'active' ? '● Active' : '⚙ Config'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Available plugins */}
      <h3 style={{ fontSize: '0.82rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Available</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {AVAILABLE.map(p => {
          const isInstalled = pluginData[p.id]?.installed;
          const isOpen = expanded === p.id;
          return (
            <div key={p.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: '1.5rem' }}>{p.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{p.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isInstalled && <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(isOpen ? null : p.id)}>⚙ Config</button>}
                  <button className={isInstalled ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                    onClick={() => isInstalled ? setExpanded(isOpen ? null : p.id) : installPlugin(p.id)}>
                    {isInstalled ? (isOpen ? '▲ Close' : '▼ Open') : 'Install'}
                  </button>
                </div>
              </div>
              {isOpen && isInstalled && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <label style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{p.label}</label>
                  <input className="field" value={pluginData[p.id]?.[p.field] || ''} placeholder={p.placeholder}
                    onChange={e => setPD(p.id, p.field, e.target.value)} style={{ width: '100%', maxWidth: 400 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom CSS / JS — superAdmin only */}
      <h3 style={{ fontSize: '0.82rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        Custom Code Injector {!isSuper && <span style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>(superAdmin only for JS)</span>}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>🎨 Custom CSS</span>
            <button className="btn btn-primary btn-sm" onClick={applyCSS}>Apply CSS</button>
          </div>
          <textarea className="field" rows={8} value={customCss} onChange={e => setCustomCss(e.target.value)}
            placeholder="/* Custom CSS here */&#10;.my-class { color: red; }"
            style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>⚡ Custom JS</span>
            {isSuper ? (
              <button className="btn btn-primary btn-sm" onClick={runJS}>Run JS</button>
            ) : (
              <span className="adm-super-tag">SuperAdmin Only</span>
            )}
          </div>
          <textarea className="field" rows={8} value={customJs} onChange={e => isSuper && setCustomJs(e.target.value)}
            placeholder={isSuper ? '// Custom JavaScript here\nconsole.log("Hello!");' : '🔒 SuperAdmin access required'}
            disabled={!isSuper}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem', opacity: isSuper ? 1 : 0.5 }} />
        </div>
      </div>

      {/* Script Manager */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: 14, color: 'var(--gold)' }}>📜 Script Manager</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="field" id="script-src-input" placeholder="https://example.com/script.js" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const el = document.getElementById('script-src-input');
            addScript(el?.value?.trim()); if (el) el.value = '';
          }}>+ Add Script</button>
        </div>
        {scripts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No injected scripts yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scripts.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <code style={{ flex: 1, fontSize: '0.78rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.src}</code>
                <button className="btn btn-sm" style={{ background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }} onClick={() => removeScript(i)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
