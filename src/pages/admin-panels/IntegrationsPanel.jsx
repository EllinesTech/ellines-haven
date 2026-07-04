import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const INTEGRATIONS = [
  { id:'whatsapp',    icon:'💬', name:'WhatsApp Business',   cat:'Messaging',  status:'active', desc:'Live chat and order notifications via WhatsApp.',          fields:[{k:'number',l:'WhatsApp Number',ph:'254748255466'}] },
  { id:'firebase',    icon:'🔥', name:'Firebase / Firestore',cat:'Database',   status:'active', desc:'Real-time database, auth, and cloud functions.',           fields:[] },
  { id:'mpesa',       icon:'📱', name:'M-Pesa Daraja',       cat:'Payments',   status:'active', desc:'STK push, C2B, and B2C mobile payments via Safaricom.',   fields:[{k:'shortcode',l:'Shortcode',ph:'174379'},{k:'passkey',l:'Passkey',ph:'••••••••'}] },
  { id:'paystack',    icon:'🟢', name:'Paystack',            cat:'Payments',   status:'active', desc:'M-Pesa, Visa, Mastercard, and bank — instant unlock.',     fields:[{k:'pubKey',l:'Public Key',ph:'pk_live_…'},{k:'secKey',l:'Secret Key',ph:'sk_live_…'}] },
  { id:'airtel',      icon:'🔴', name:'Airtel Money',        cat:'Payments',   status:'active', desc:'Airtel Money payment integration for Kenya.',              fields:[{k:'merchantId',l:'Merchant ID',ph:'AIRTEL_ID'}] },
  { id:'paypal',      icon:'🅿', name:'PayPal',              cat:'Payments',   status:'config', desc:'Accept PayPal, credit & debit cards worldwide.',           fields:[{k:'clientId',l:'Client ID',ph:'AXxxx…'},{k:'clientSecret',l:'Client Secret',ph:'EKxxx…'},{k:'mode',l:'Mode',ph:'live'}] },
  { id:'flutterwave', icon:'🦋', name:'Flutterwave',         cat:'Payments',   status:'idle',   desc:'Pan-African payments: mobile money, cards, bank transfers.',fields:[{k:'pubKey',l:'Public Key',ph:'FLWPUBK_TEST-…'},{k:'secKey',l:'Secret Key',ph:'FLWSECK_TEST-…'},{k:'encKey',l:'Encryption Key',ph:'FLWENCK…'}] },
  { id:'stripe',      icon:'💳', name:'Stripe',              cat:'Payments',   status:'config', desc:'International card payments — Visa, Mastercard, Amex.',   fields:[{k:'pubKey',l:'Publishable Key',ph:'pk_live_…'},{k:'secKey',l:'Secret Key',ph:'sk_live_…'}] },
  { id:'pesapal',     icon:'🏦', name:'Pesapal',             cat:'Payments',   status:'idle',   desc:'East Africa: M-Pesa, Airtel, Visa, Mastercard.',           fields:[{k:'consumerKey',l:'Consumer Key',ph:'qkio1BGG…'},{k:'consumerSecret',l:'Consumer Secret',ph:'osGQ364R…'}] },
  { id:'ga4',         icon:'📊', name:'Google Analytics 4',  cat:'Analytics',  status:'config', desc:'Page views, events, and user behaviour tracking.',         fields:[{k:'measureId',l:'Measurement ID',ph:'G-XXXXXXXXXX'}] },
  { id:'fbpixel',     icon:'📘', name:'Facebook/Meta Pixel',  cat:'Marketing', status:'idle',   desc:'Conversion tracking and retargeting ads.',                 fields:[{k:'pixelId',l:'Pixel ID',ph:'1234567890123'}] },
  { id:'tiktokpixel', icon:'🎵', name:'TikTok Pixel',         cat:'Marketing', status:'idle',   desc:'TikTok ad conversion tracking.',                           fields:[{k:'pixelCode',l:'Pixel Code',ph:'CXXXXXXXXXXXXXX'}] },
  { id:'mailchimp',   icon:'📧', name:'Mailchimp',            cat:'Email',     status:'idle',   desc:'Newsletter campaigns and subscriber management.',          fields:[{k:'apiKey',l:'API Key',ph:'xxxxxxxx-us1'},{k:'listId',l:'List ID',ph:'abc123'}] },
  { id:'sendgrid',    icon:'✉️', name:'SendGrid',             cat:'Email',     status:'idle',   desc:'Transactional email delivery for receipts and resets.',    fields:[{k:'apiKey',l:'API Key',ph:'SG.xxxxxxxxxx'},{k:'fromEmail',l:'From Email',ph:'no-reply@ellines.co.ke'}] },
  { id:'slack',       icon:'🔔', name:'Slack Notifications',  cat:'Alerts',   status:'idle',   desc:'Send new order and user alerts to a Slack channel.',       fields:[{k:'webhookUrl',l:'Webhook URL',ph:'https://hooks.slack.com/…'}] },
  { id:'webhook',     icon:'🔗', name:'Custom Webhook',       cat:'Custom',   status:'idle',   desc:'Send event data to any external URL on order/user events.',fields:[{k:'url',l:'Webhook URL',ph:'https://yourapp.com/webhook'},{k:'secret',l:'Secret Token',ph:'••••••••'}] },
  { id:'openai',      icon:'🤖', name:'OpenAI / GPT',         cat:'AI',       status:'config', desc:'Powers EllineaAI — the site assistant. Add your API key.',  fields:[{k:'apiKey',l:'OpenAI API Key',ph:'sk-…'},{k:'model',l:'Model',ph:'gpt-4o-mini'}] },
  { id:'zapier',      icon:'⚡', name:'Zapier',               cat:'Automation',status:'idle',   desc:'Connect Ellines Haven to 6,000+ apps via Zapier.',        fields:[{k:'webhookUrl',l:'Zapier Webhook',ph:'https://hooks.zapier.com/…'}] },
  { id:'googlesheets',icon:'📋', name:'Google Sheets',        cat:'Data',     status:'idle',   desc:'Sync orders and users to a Google Sheet automatically.',   fields:[{k:'sheetId',l:'Sheet ID',ph:'1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms'}] },
];

const CATS = ['All', ...new Set(INTEGRATIONS.map(i => i.cat))];
const STATUS_COLOR = { active: '#2ecc71', config: '#c9a84c', idle: '#9490a0' };
const STATUS_LABEL = { active: '● Active', config: '⚙ Config needed', idle: '○ Not installed' };

export default function IntegrationsPanel({ showToast, isSuper }) {
  const [data,      setData]      = useState({});
  const [expanded,  setExpanded]  = useState(null);
  const [catFilter, setCatFilter] = useState('All');
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'integrations')).then(snap => {
      if (snap.exists()) setData(snap.data());
    }).catch(() => {});
  }, []);

  const set = (id, k, v) => setData(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [k]: v } }));
  const toggle = (id) => setData(prev => ({ ...prev, [id]: { ...(prev[id] || {}), active: !prev[id]?.active } }));

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', 'integrations'), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      showToast?.('✅ Integration settings saved!');
    } catch (e) { showToast?.('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  const filtered = INTEGRATIONS.filter(i =>
    (catFilter === 'All' || i.cat === catFilter) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.cat.toLowerCase().includes(search.toLowerCase()))
  );

  const activeCount = INTEGRATIONS.filter(i => data[i.id]?.active || i.status === 'active').length;

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Integrations</h1>
          <span className="adm-page-sub">{activeCount} active · Connect Ellines Haven to any service</span>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving…' : '💾 Save All'}
        </button>
      </div>

      <div className="adm-info-note" style={{marginBottom:20}}>
        🔌 Add API keys and webhook URLs below to connect external services. All credentials are stored in Firestore. OpenAI powers <strong style={{color:'var(--gold)'}}>EllineaAI</strong> — the site assistant.
      </div>

      {/* Stats */}
      <div className="adm-stats-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:20}}>
        {[
          { l:'Active',   v: INTEGRATIONS.filter(i=>data[i.id]?.active||i.status==='active').length, c:'var(--ok)' },
          { l:'Configured',v:INTEGRATIONS.filter(i=>data[i.id] && Object.keys(data[i.id]).some(k=>k!=='active'&&data[i.id][k])).length, c:'var(--gold)' },
          { l:'Available',v:INTEGRATIONS.length, c:'var(--muted)' },
          { l:'Categories',v:CATS.length-1, c:'#4a9eff' },
        ].map(s=>(
          <div key={s.l} className="adm-stat-card card">
            <div className="adm-stat-body"><strong style={{color:s.c}}>{s.v}</strong><span>{s.l}</span></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input className="field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search integrations…" style={{width:200,padding:'6px 10px',fontSize:'0.82rem'}} />
        {CATS.map(c=>(
          <button key={c} className={'adm-filter-btn'+(catFilter===c?' active':'')} onClick={()=>setCatFilter(c)}>{c}</button>
        ))}
      </div>

      {/* Integration cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:14}}>
        {filtered.map(integ => {
          const d = data[integ.id] || {};
          const isActive = d.active !== undefined ? d.active : integ.status === 'active';
          const isOpen = expanded === integ.id;
          const hasConfig = integ.fields.length > 0;
          const statusKey = isActive ? 'active' : (integ.status === 'config' ? 'config' : 'idle');

          return (
            <div key={integ.id} className="card" style={{padding:0,overflow:'hidden',transition:'border-color 0.2s',borderColor:isActive?'rgba(46,204,113,0.3)':'var(--border)'}}>
              {/* Card header */}
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',cursor:hasConfig?'pointer':'default'}}
                onClick={()=>hasConfig&&setExpanded(isOpen?null:integ.id)}>
                <div style={{fontSize:'1.8rem',width:44,height:44,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {integ.icon}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',display:'flex',alignItems:'center',gap:8}}>
                    {integ.name}
                    <span style={{fontSize:'0.65rem',fontWeight:700,padding:'2px 6px',borderRadius:4,background:STATUS_COLOR[statusKey]+'22',color:STATUS_COLOR[statusKey]}}>
                      {STATUS_LABEL[statusKey]}
                    </span>
                  </div>
                  <div style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:2}}>{integ.cat} · {integ.desc.slice(0,55)}…</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  {integ.status !== 'active' && (
                    <button onClick={e=>{e.stopPropagation();toggle(integ.id);}}
                      style={{width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',position:'relative',flexShrink:0,
                        background:isActive?'var(--ok)':'rgba(255,255,255,0.15)',transition:'all 0.2s'}}>
                      <span style={{position:'absolute',top:2,left:isActive?20:2,width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
                    </button>
                  )}
                  {hasConfig && <span style={{color:'var(--muted)',fontSize:'0.8rem',alignSelf:'center'}}>{isOpen?'▲':'▼'}</span>}
                </div>
              </div>

              {/* Config section */}
              {isOpen && (
                <div style={{borderTop:'1px solid var(--border)',padding:'14px 16px',background:'rgba(255,255,255,0.01)'}}>
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {integ.fields.map(f=>(
                      <div key={f.k}>
                        <label style={{fontSize:'0.75rem',color:'var(--muted)',display:'block',marginBottom:4}}>{f.l}</label>
                        <input className="field" value={d[f.k]||''} onChange={e=>set(integ.id,f.k,e.target.value)}
                          placeholder={f.ph} type={f.k.toLowerCase().includes('key')||f.k.toLowerCase().includes('secret')||f.k.toLowerCase().includes('passkey')?'password':'text'}
                          style={{fontSize:'0.82rem',fontFamily:f.k.includes('key')||f.k.includes('secret')?'monospace':'inherit'}} />
                      </div>
                    ))}
                    <div style={{display:'flex',gap:8,marginTop:4}}>
                      <button onClick={()=>{setExpanded(null);showToast?.('✅ '+integ.name+' configured — click Save All');}}
                        style={{background:'var(--gold)',border:'none',color:'#000',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontWeight:700,fontSize:'0.78rem',fontFamily:'inherit'}}>
                        ✓ Done
                      </button>
                      <button onClick={()=>setExpanded(null)}
                        style={{background:'rgba(255,255,255,0.07)',border:'1px solid var(--border)',color:'var(--muted)',borderRadius:6,padding:'6px 10px',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit'}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
