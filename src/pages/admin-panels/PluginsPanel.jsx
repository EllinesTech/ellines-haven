import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

// ── Installed / bundled plugins ──────────────────────────────────────────────
const INSTALLED = [
  { id: 'whatsapp',  name: 'WhatsApp Chat',         icon: '💬', desc: 'Live chat widget + order notifications via WhatsApp.', status: 'active',  cat: 'Messaging' },
  { id: 'firestore', name: 'Firestore Database',     icon: '🔥', desc: 'Real-time cloud database by Firebase.',               status: 'active',  cat: 'Database'  },
  { id: 'mpesa',     name: 'M-Pesa STK Push',        icon: '📱', desc: 'Instant mobile payment via Safaricom Daraja API.',    status: 'active',  cat: 'Payments'  },
  { id: 'paystack',  name: 'Paystack',               icon: '🟢', desc: 'Accept M-Pesa, Visa, Mastercard & bank payments.',    status: 'active',  cat: 'Payments'  },
  { id: 'airtel',    name: 'Airtel Money',            icon: '🔴', desc: 'Airtel Money manual payment (Kenya).',                status: 'active',  cat: 'Payments'  },
  { id: 'watermark', name: 'Watermark Protection',   icon: '🔒', desc: 'Embeds user identity watermarks on book content.',    status: 'active',  cat: 'Security'  },
  { id: 'controls',  name: 'Site Controls',           icon: '⚙️', desc: 'Maintenance mode, right-click lock, copy block.',    status: 'active',  cat: 'Admin'     },
  { id: 'ellineaai', name: 'EllineaAI Assistant',    icon: '🤖', desc: 'Floating AI chat assistant powered by OpenAI.',       status: 'active',  cat: 'AI'        },
];

// ── Available / installable plugins ─────────────────────────────────────────
const AVAILABLE = [
  // ── Payments ──────────────────────────────────────────────────────────────
  {
    id: 'paypal', name: 'PayPal', icon: '🅿', cat: 'Payments',
    desc: 'Accept PayPal, credit & debit cards worldwide via PayPal Checkout.',
    badge: 'Global',
    fields: [
      { k: 'clientId',   l: 'Client ID',     ph: 'AXxxx…',        type: 'text'     },
      { k: 'clientSecret', l: 'Client Secret', ph: 'EKxxx…',      type: 'password' },
      { k: 'mode',       l: 'Environment',   ph: 'live',          type: 'select', options: ['sandbox','live'] },
    ],
  },
  {
    id: 'flutterwave', name: 'Flutterwave', icon: '🦋', cat: 'Payments',
    desc: 'Pan-African payments: mobile money, cards, bank — 20+ African countries.',
    badge: 'Africa',
    fields: [
      { k: 'pubKey',  l: 'Public Key',  ph: 'FLWPUBK_TEST-…', type: 'text'     },
      { k: 'secKey',  l: 'Secret Key',  ph: 'FLWSECK_TEST-…', type: 'password' },
      { k: 'encKey',  l: 'Encrypt Key', ph: 'FLWENCK…',        type: 'password' },
    ],
  },
  {
    id: 'stripe', name: 'Stripe', icon: '💳', cat: 'Payments',
    desc: 'International card payments — Visa, Mastercard, American Express.',
    badge: 'International',
    fields: [
      { k: 'pubKey',  l: 'Publishable Key', ph: 'pk_live_…', type: 'text'     },
      { k: 'secKey',  l: 'Secret Key',       ph: 'sk_live_…', type: 'password' },
    ],
  },
  {
    id: 'pesapal', name: 'Pesapal', icon: '🏦', cat: 'Payments',
    desc: 'East Africa payments: M-Pesa, Airtel, Visa, Mastercard.',
    badge: 'East Africa',
    fields: [
      { k: 'consumerKey',    l: 'Consumer Key',    ph: 'qkio1BGGYAXTu2JOfm7XSXzK4JLkr3O6', type: 'text'     },
      { k: 'consumerSecret', l: 'Consumer Secret', ph: 'osGQ364R49cXKeOYSpaOnT++ZIlHMy8',  type: 'password' },
      { k: 'env',            l: 'Environment',      ph: 'live', type: 'select', options: ['sandbox','live'] },
    ],
  },
  // ── Analytics & Marketing ─────────────────────────────────────────────────
  {
    id: 'ga4', name: 'Google Analytics 4', icon: '📊', cat: 'Analytics',
    desc: 'Track page views, user journeys and conversions with GA4.',
    badge: 'Free',
    fields: [{ k: 'measureId', l: 'Measurement ID', ph: 'G-XXXXXXXXXX', type: 'text' }],
  },
  {
    id: 'fbpixel', name: 'Facebook / Meta Pixel', icon: '📘', cat: 'Marketing',
    desc: 'Conversion tracking and retargeting ads for Facebook & Instagram.',
    fields: [{ k: 'pixelId', l: 'Pixel ID', ph: '1234567890123', type: 'text' }],
  },
  {
    id: 'tiktokpixel', name: 'TikTok Pixel', icon: '🎵', cat: 'Marketing',
    desc: 'Track purchases and run TikTok ads with conversion data.',
    fields: [{ k: 'pixelCode', l: 'Pixel Code', ph: 'CXXXXXXXXXXXXXX', type: 'text' }],
  },
  // ── Email & CRM ───────────────────────────────────────────────────────────
  {
    id: 'mailchimp', name: 'Mailchimp Newsletter', icon: '📧', cat: 'Email',
    desc: 'Collect subscribers and send email newsletters.',
    fields: [
      { k: 'apiKey', l: 'API Key', ph: 'xxxxxxxx-us1', type: 'password' },
      { k: 'listId', l: 'Audience ID', ph: 'abc123',    type: 'text'     },
    ],
  },
  {
    id: 'sendgrid', name: 'SendGrid', icon: '✉️', cat: 'Email',
    desc: 'Transactional email for receipts, order confirmations, and resets.',
    fields: [
      { k: 'apiKey',    l: 'API Key',     ph: 'SG.xxxxxxxx',            type: 'password' },
      { k: 'fromEmail', l: 'From Email',  ph: 'no-reply@ellines.co.ke', type: 'text'     },
    ],
  },
  // ── AI & Automation ───────────────────────────────────────────────────────
  {
    id: 'openai', name: 'OpenAI / GPT', icon: '🤖', cat: 'AI',
    desc: 'Powers EllineaAI — the floating site assistant. Add your API key.',
    badge: 'Powers AI',
    fields: [
      { k: 'apiKey', l: 'OpenAI API Key', ph: 'sk-…',       type: 'password' },
      { k: 'model',  l: 'Model',           ph: 'gpt-4o-mini', type: 'text'     },
    ],
  },
  {
    id: 'zapier', name: 'Zapier', icon: '⚡', cat: 'Automation',
    desc: 'Connect Ellines Haven to 6,000+ apps — automate orders, emails, and more.',
    fields: [{ k: 'webhookUrl', l: 'Zapier Webhook URL', ph: 'https://hooks.zapier.com/…', type: 'text' }],
  },
  // ── SEO & Infrastructure ──────────────────────────────────────────────────
  {
    id: 'seo', name: 'SEO Meta Manager', icon: '🔍', cat: 'SEO',
    desc: 'Page titles, meta descriptions, Open Graph tags, and sitemap.',
    fields: [
      { k: 'siteTitle',  l: 'Default Site Title',  ph: 'Ellines Haven — Home For The Story Soul', type: 'text' },
      { k: 'siteMeta',   l: 'Default Description', ph: 'Kenya\'s premier digital bookstore.',       type: 'text' },
    ],
  },
  {
    id: 'webhook', name: 'Custom Webhook', icon: '🔗', cat: 'Custom',
    desc: 'POST event data (orders, signups) to any external URL.',
    fields: [
      { k: 'url',    l: 'Webhook URL',   ph: 'https://yourapp.com/webhook', type: 'text'     },
      { k: 'secret', l: 'Secret Token',  ph: '••••••••',                    type: 'password' },
    ],
  },
];

const CAT_COLORS = {
  Payments: '#2ecc71', Analytics: '#4a9eff', Marketing: '#e8832a',
  Email: '#a855f7', AI: '#c9a84c', Automation: '#4a9eff',
  SEO: '#2ecc71', Custom: '#9490a0',
};

export default function PluginsPanel({ showToast, isSuper }) {
  const [pluginData, setPluginData] = useState({});
  const [scripts,    setScripts]    = useState([]);
  const [customCss,  setCustomCss]  = useState('');
  const [customJs,   setCustomJs]   = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [catFilter,  setCatFilter]  = useState('All');
  const [saving,     setSaving]     = useState(false);

  const allCats = ['All', ...new Set(AVAILABLE.map(p => p.cat))];

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
        css: customCss, js: customJs, scripts, plugins: pluginData,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast?.('✅ Plugin settings saved!');
    } catch (e) { showToast?.('❌ Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const applyCSS = () => {
    let s = document.getElementById('eh-custom-css');
    if (!s) { s = document.createElement('style'); s.id = 'eh-custom-css'; document.head.appendChild(s); }
    s.textContent = customCss;
    showToast?.('🎨 CSS applied');
  };

  const runJS = () => {
    try { new Function(customJs)(); showToast?.('⚡ JS executed'); } // eslint-disable-line no-new-func
    catch (e) { showToast?.('❌ JS error: ' + e.message); }
  };

  const installPlugin = (id) => {
    setPluginData(prev => ({ ...prev, [id]: { ...(prev[id] || {}), installed: true } }));
    showToast?.('✅ Plugin installed — fill in the config and save');
    setExpanded(id);
  };

  const uninstallPlugin = (id) => {
    setPluginData(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (expanded === id) setExpanded(null);
    showToast?.('🗑 Plugin removed');
  };

  const setPD = (id, k, v) => setPluginData(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [k]: v } }));

  const addScript = (src) => { if (src) setScripts(s => [...s, { src, addedAt: Date.now() }]); };
  const removeScript = (i) => setScripts(s => s.filter((_, idx) => idx !== i));

  const filtered = AVAILABLE.filter(p => catFilter === 'All' || p.cat === catFilter);
  const installedCount = INSTALLED.length + AVAILABLE.filter(p => pluginData[p.id]?.installed).length;


  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Plugins</h1>
          <span className="adm-page-sub">{installedCount} installed · Payments, analytics, email, AI, and more</span>
        </div>
        <button className="btn btn-primary" onClick={savePlugins} disabled={saving}>
          {saving ? '⏳ Saving…' : '💾 Save All'}
        </button>
      </div>

      {/* Stats row */}
      <div className="adm-stats-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:24 }}>
        {[
          { l:'Installed',  v: installedCount,                                                         c:'var(--ok)'   },
          { l:'Payments',   v: INSTALLED.filter(p=>p.cat==='Payments').length + AVAILABLE.filter(p=>p.cat==='Payments'&&pluginData[p.id]?.installed).length, c:'#2ecc71' },
          { l:'Available',  v: AVAILABLE.length,                                                       c:'var(--muted)' },
          { l:'Active APIs',v: AVAILABLE.filter(p=>pluginData[p.id]?.installed && Object.keys(pluginData[p.id]).some(k=>k!=='installed'&&pluginData[p.id][k])).length, c:'var(--gold)' },
        ].map(s => (
          <div key={s.l} className="adm-stat-card card">
            <div className="adm-stat-body"><strong style={{ color:s.c }}>{s.v}</strong><span>{s.l}</span></div>
          </div>
        ))}
      </div>

      {/* ── Installed plugins ── */}
      <h3 style={{ fontSize:'0.82rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>Installed</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12, marginBottom:28 }}>
        {[...INSTALLED, ...AVAILABLE.filter(p => pluginData[p.id]?.installed)].map(p => (
          <div key={p.id} className="card" style={{ padding:16, display:'flex', alignItems:'flex-start', gap:12, borderColor:'rgba(46,204,113,0.25)' }}>
            <div style={{ fontSize:'1.8rem', width:44, height:44, background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              {p.icon}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:'0.88rem', marginBottom:3, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                {p.name}
                {p.cat && <span style={{ fontSize:'0.62rem', padding:'1px 5px', borderRadius:3, background:`${CAT_COLORS[p.cat]||'#4a9eff'}22`, color:CAT_COLORS[p.cat]||'#4a9eff' }}>{p.cat}</span>}
              </div>
              <div style={{ fontSize:'0.73rem', color:'var(--muted)', marginBottom:8, lineHeight:1.4 }}>{p.desc}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:'0.7rem', fontWeight:700, background:'rgba(46,204,113,0.15)', color:'var(--ok)', borderRadius:4, padding:'2px 7px' }}>● Active</span>
                {AVAILABLE.find(a => a.id === p.id) && (
                  <button onClick={() => uninstallPlugin(p.id)} style={{ fontSize:'0.68rem', color:'var(--err)', background:'none', border:'none', cursor:'pointer', padding:0 }}>Remove</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Available plugins — with category filter ── */}
      <h3 style={{ fontSize:'0.82rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>Available</h3>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
        {allCats.map(c => (
          <button key={c} className={'adm-filter-btn'+(catFilter===c?' active':'')} onClick={() => setCatFilter(c)}>{c}</button>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12, marginBottom:28 }}>
        {filtered.map(p => {
          const isInst = !!pluginData[p.id]?.installed;
          const isOpen = expanded === p.id;
          const d = pluginData[p.id] || {};
          return (
            <div key={p.id} className="card" style={{ padding:0, overflow:'hidden', borderColor: isInst ? 'rgba(46,204,113,0.3)' : 'var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', cursor: isInst ? 'pointer' : 'default' }}
                onClick={() => isInst && setExpanded(isOpen ? null : p.id)}>
                <div style={{ fontSize:'1.7rem', width:44, height:44, background: isInst ? 'rgba(46,204,113,0.06)' : 'rgba(255,255,255,0.04)', border:`1px solid ${isInst ? 'rgba(46,204,113,0.3)' : 'var(--border)'}`, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {p.icon}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:'0.88rem', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {p.name}
                    {p.badge && <span style={{ fontSize:'0.62rem', padding:'1px 5px', borderRadius:3, background:'rgba(201,168,76,0.18)', color:'var(--gold)' }}>{p.badge}</span>}
                    {p.cat  && <span style={{ fontSize:'0.62rem', padding:'1px 5px', borderRadius:3, background:`${CAT_COLORS[p.cat]||'#4a9eff'}22`, color:CAT_COLORS[p.cat]||'#4a9eff' }}>{p.cat}</span>}
                    {isInst && <span style={{ fontSize:'0.7rem', fontWeight:700, background:'rgba(46,204,113,0.15)', color:'var(--ok)', borderRadius:4, padding:'2px 6px' }}>● Installed</span>}
                  </div>
                  <div style={{ fontSize:'0.73rem', color:'var(--muted)', marginTop:2, lineHeight:1.4 }}>{p.desc.slice(0,62)}…</div>
                </div>
                {!isInst
                  ? <button className="btn btn-primary btn-sm" style={{ flexShrink:0 }} onClick={e => { e.stopPropagation(); installPlugin(p.id); }}>Install</button>
                  : <span style={{ color:'var(--muted)', fontSize:'0.8rem', flexShrink:0 }}>{isOpen ? '▲' : '▼'}</span>
                }
              </div>
              {isOpen && isInst && (
                <div style={{ borderTop:'1px solid var(--border)', padding:'14px 16px', background:'rgba(255,255,255,0.01)' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {p.fields.map(f => (
                      <div key={f.k}>
                        <label style={{ fontSize:'0.75rem', color:'var(--muted)', display:'block', marginBottom:4 }}>{f.l}</label>
                        {f.type === 'select' ? (
                          <select className="field" value={d[f.k]||f.ph} onChange={e=>setPD(p.id,f.k,e.target.value)} style={{ fontSize:'0.82rem', width:'100%' }}>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input className="field" type={f.type} value={d[f.k]||''} placeholder={f.ph}
                            onChange={e=>setPD(p.id,f.k,e.target.value)}
                            style={{ fontSize:'0.82rem', fontFamily:f.type==='password'?'monospace':'inherit' }} />
                        )}
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:8, marginTop:4 }}>
                      <button onClick={() => { setExpanded(null); showToast?.('✅ '+p.name+' configured — click Save All'); }}
                        style={{ background:'var(--gold)', border:'none', color:'#000', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontWeight:700, fontSize:'0.78rem', fontFamily:'inherit' }}>
                        ✓ Done
                      </button>
                      <button onClick={() => uninstallPlugin(p.id)}
                        style={{ background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.25)', color:'#e74c3c', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:'0.78rem', fontFamily:'inherit' }}>
                        Uninstall
                      </button>
                    </div>
                  </div>
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
