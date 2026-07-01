import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const PROVIDERS = [
  { id:'smtp',      label:'Custom SMTP',          icon:'📧', desc:'Use your own mail server or hosting provider SMTP' },
  { id:'sendgrid',  label:'SendGrid',             icon:'✉️', desc:'Transactional email via SendGrid API' },
  { id:'mailgun',   label:'Mailgun',              icon:'🔫', desc:'Developer-friendly email API by Mailgun' },
  { id:'resend',    label:'Resend',               icon:'🚀', desc:'Modern email API — recommended for haven.ellines.co.ke' },
  { id:'zoho',      label:'Zoho Mail',            icon:'🏢', desc:'Zoho Mail SMTP — good for custom domains' },
  { id:'gmail',     label:'Gmail / Google Workspace', icon:'📮', desc:'Send via Gmail SMTP with app password' },
];

const DEFAULT = {
  provider: 'smtp',
  fromName: 'Ellines Haven',
  fromEmail: 'noreply@haven.ellines.co.ke',
  replyTo: 'ellines.haven@gmail.com',
  // SMTP
  smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', smtpTls: true,
  // SendGrid
  sendgridKey: '',
  // Mailgun
  mailgunKey: '', mailgunDomain: '',
  // Resend
  resendKey: '',
  // Zoho
  zohoUser: '', zohoPass: '',
  // Gmail
  gmailUser: '', gmailPass: '',
  // Templates
  orderConfirmEnabled: true,
  orderConfirmSubject: 'Your Ellines Haven order is confirmed!',
  passwordResetEnabled: true,
  passwordResetSubject: 'Reset your Ellines Haven password',
  welcomeEnabled: true,
  welcomeSubject: 'Welcome to Ellines Haven!',
  newOrderAdminEnabled: true,
  newOrderAdminEmail: 'ellines.haven@gmail.com',
};

function Field({ label, value, onChange, type='text', placeholder='', mono=false, hint='' }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:'0.75rem', color:'var(--muted)', display:'block', marginBottom:4, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</label>
      <input className="field" type={type} value={value||''} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{ fontFamily:mono?'monospace':'inherit', fontSize:'0.85rem' }} />
      {hint && <p style={{ fontSize:'0.72rem', color:'var(--muted)', marginTop:4 }}>{hint}</p>}
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ fontSize:'0.86rem', fontWeight:600 }}>{label}</div>
        {desc && <div style={{ fontSize:'0.72rem', color:'var(--muted)', marginTop:2 }}>{desc}</div>}
      </div>
      <button onClick={()=>onChange(!checked)}
        style={{ width:42, height:23, borderRadius:12, border:'none', cursor:'pointer', position:'relative', flexShrink:0,
          background:checked?'var(--gold)':'rgba(255,255,255,0.15)', transition:'background 0.2s' }}>
        <span style={{ position:'absolute', top:2, left:checked?21:2, width:19, height:19, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
      </button>
    </div>
  );
}

export default function EmailPanel({ showToast, isSuper }) {
  const [cfg,     setCfg]     = useState(DEFAULT);
  const [tab,     setTab]     = useState('provider');
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testMsg,   setTestMsg]   = useState('');

  const TABS = [
    { k:'provider', l:'📧 Provider' },
    { k:'templates',l:'✉️ Templates' },
    { k:'domain',   l:'🌐 Domain Setup' },
    { k:'test',     l:'🧪 Test & Verify' },
  ];

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'email_config')).then(snap => {
      if (snap.exists()) setCfg(c => ({ ...c, ...snap.data() }));
    }).catch(() => {});
  }, []);

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', 'email_config'), { ...cfg, updatedAt: serverTimestamp() }, { merge: true });
      showToast?.('✅ Email settings saved!');
    } catch (e) { showToast?.('❌ ' + e.message); }
    setSaving(false);
  };

  const sendTest = async () => {
    if (!testEmail.trim()) { setTestMsg('Enter a test email address'); return; }
    setTesting(true); setTestMsg('');
    // In production this would call a Cloud Function or backend endpoint
    // For now we simulate and tell the admin what to configure
    await new Promise(r => setTimeout(r, 800));
    setTestMsg(`⚠️ Test email to ${testEmail} — To actually send emails you need a backend (Cloud Function or server) that calls your email provider API. The configuration below is saved to Firestore and ready to use once you connect a backend function.`);
    setTesting(false);
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Email Configuration</h1>
          <span className="adm-page-sub">Configure email delivery for password resets, order confirmations, and notifications</span>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </button>
      </div>

      <div className="adm-info-note" style={{ marginBottom:20 }}>
        📧 <strong>Email setup for haven.ellines.co.ke</strong> — Once you register your domain, use <strong>Resend</strong> or <strong>Zoho Mail</strong> for the best experience with custom domains. Configure below and connect a Cloud Function to actually send emails.
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--surface)', borderRadius:'var(--r)', padding:6, border:'1px solid var(--border)', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ padding:'7px 14px', borderRadius:'var(--r-sm)', border:'none', background:tab===t.k?'var(--gold)':'transparent', color:tab===t.k?'#000':'var(--muted)', fontWeight:600, fontSize:'0.82rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── PROVIDER TAB ── */}
      {tab === 'provider' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          {/* Provider selection */}
          <div className="card" style={{ padding:20 }}>
            <h3 style={{ fontSize:'0.92rem', marginBottom:14, color:'var(--gold)' }}>Choose Email Provider</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => set('provider', p.id)}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', border:`1px solid ${cfg.provider===p.id?'var(--gold)':'var(--border)'}`,
                    background:cfg.provider===p.id?'rgba(201,168,76,0.08)':'transparent', borderRadius:'var(--r-sm)', cursor:'pointer', textAlign:'left', width:'100%' }}>
                  <span style={{ fontSize:'1.4rem', flexShrink:0 }}>{p.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:'0.84rem', color:cfg.provider===p.id?'var(--gold)':'var(--text)' }}>{p.label}</div>
                    <div style={{ fontSize:'0.71rem', color:'var(--muted)' }}>{p.desc}</div>
                  </div>
                  {cfg.provider===p.id && <span style={{ color:'var(--gold)', fontSize:'0.9rem' }}>✓</span>}
                </button>
              ))}
            </div>

            {/* Sender info */}
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
              <h4 style={{ fontSize:'0.82rem', color:'var(--gold)', marginBottom:12 }}>Sender Info</h4>
              <Field label="From Name" value={cfg.fromName} onChange={v=>set('fromName',v)} placeholder="Ellines Haven" />
              <Field label="From Email" value={cfg.fromEmail} onChange={v=>set('fromEmail',v)} placeholder="noreply@haven.ellines.co.ke"
                hint="Use your custom domain email for best deliverability" />
              <Field label="Reply-To Email" value={cfg.replyTo} onChange={v=>set('replyTo',v)} placeholder="ellines.haven@gmail.com" />
            </div>
          </div>

          {/* Provider config */}
          <div className="card" style={{ padding:20 }}>
            <h3 style={{ fontSize:'0.92rem', marginBottom:14, color:'var(--gold)' }}>
              {PROVIDERS.find(p=>p.id===cfg.provider)?.icon} {PROVIDERS.find(p=>p.id===cfg.provider)?.label} Settings
            </h3>

            {cfg.provider === 'smtp' && <>
              <Field label="SMTP Host" value={cfg.smtpHost} onChange={v=>set('smtpHost',v)} placeholder="smtp.yourdomain.com" />
              <Field label="SMTP Port" value={cfg.smtpPort} onChange={v=>set('smtpPort',v)} placeholder="587" />
              <Field label="SMTP Username" value={cfg.smtpUser} onChange={v=>set('smtpUser',v)} placeholder="noreply@haven.ellines.co.ke" />
              <Field label="SMTP Password" value={cfg.smtpPass} onChange={v=>set('smtpPass',v)} type="password" placeholder="••••••••" mono />
              <Toggle label="Use TLS/STARTTLS" desc="Recommended for port 587" checked={!!cfg.smtpTls} onChange={v=>set('smtpTls',v)} />
            </>}

            {cfg.provider === 'sendgrid' && <>
              <Field label="SendGrid API Key" value={cfg.sendgridKey} onChange={v=>set('sendgridKey',v)} type="password" placeholder="SG.xxxxxxxxxx" mono
                hint="Get from SendGrid → Settings → API Keys" />
              <div className="adm-info-note">SendGrid free tier: 100 emails/day. Good for getting started.</div>
            </>}

            {cfg.provider === 'mailgun' && <>
              <Field label="Mailgun API Key" value={cfg.mailgunKey} onChange={v=>set('mailgunKey',v)} type="password" placeholder="key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" mono />
              <Field label="Mailgun Domain" value={cfg.mailgunDomain} onChange={v=>set('mailgunDomain',v)} placeholder="haven.ellines.co.ke"
                hint="Must match a verified domain in your Mailgun account" />
            </>}

            {cfg.provider === 'resend' && <>
              <Field label="Resend API Key" value={cfg.resendKey} onChange={v=>set('resendKey',v)} type="password" placeholder="re_xxxxxxxxxx" mono
                hint="Get from resend.com — supports custom domains, 3000 emails/month free" />
              <div className="adm-info-note">
                <strong>Recommended for haven.ellines.co.ke</strong> — Resend has simple setup, great deliverability, and free custom domain support. Add DNS records in Cloudflare after setup.
              </div>
            </>}

            {cfg.provider === 'zoho' && <>
              <Field label="Zoho Username" value={cfg.zohoUser} onChange={v=>set('zohoUser',v)} placeholder="noreply@haven.ellines.co.ke" />
              <Field label="Zoho App Password" value={cfg.zohoPass} onChange={v=>set('zohoPass',v)} type="password" placeholder="App-specific password from Zoho" mono
                hint="Generate at myaccount.zoho.com → Security → App Passwords" />
              <div className="adm-info-note">Zoho SMTP: smtp.zoho.com, Port: 587, TLS enabled</div>
            </>}

            {cfg.provider === 'gmail' && <>
              <Field label="Gmail Address" value={cfg.gmailUser} onChange={v=>set('gmailUser',v)} placeholder="ellines.haven@gmail.com" />
              <Field label="App Password" value={cfg.gmailPass} onChange={v=>set('gmailPass',v)} type="password" placeholder="xxxx xxxx xxxx xxxx" mono
                hint="Generate at myaccount.google.com → Security → 2-Step → App Passwords. NOT your Gmail password." />
              <div className="adm-info-note">Gmail: smtp.gmail.com, Port: 587. Requires 2FA enabled on Google account.</div>
            </>}
          </div>
        </div>
      )}

      {/* ── TEMPLATES TAB ── */}
      {tab === 'templates' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {[
            { key:'orderConfirm', label:'Order Confirmation', icon:'🛒', desc:'Sent when a customer\'s payment is verified', subjectKey:'orderConfirmSubject', enableKey:'orderConfirmEnabled' },
            { key:'passwordReset',label:'Password Reset',     icon:'🔑', desc:'OTP code for forgot password flow',          subjectKey:'passwordResetSubject', enableKey:'passwordResetEnabled' },
            { key:'welcome',      label:'Welcome Email',      icon:'👋', desc:'Sent when a new user registers',             subjectKey:'welcomeSubject',       enableKey:'welcomeEnabled' },
            { key:'newOrderAdmin',label:'New Order Alert',    icon:'🔔', desc:'Notify admin when a new order is placed',    subjectKey:null,                   enableKey:'newOrderAdminEnabled', emailKey:'newOrderAdminEmail' },
          ].map(t => (
            <div key={t.key} className="card" style={{ padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                <div>
                  <h4 style={{ fontSize:'0.9rem', marginBottom:4 }}>{t.icon} {t.label}</h4>
                  <p style={{ fontSize:'0.76rem', color:'var(--muted)', margin:0 }}>{t.desc}</p>
                </div>
                <button onClick={() => set(t.enableKey, !cfg[t.enableKey])}
                  style={{ width:42, height:23, borderRadius:12, border:'none', cursor:'pointer', position:'relative', flexShrink:0,
                    background:cfg[t.enableKey]?'var(--gold)':'rgba(255,255,255,0.15)', transition:'background 0.2s' }}>
                  <span style={{ position:'absolute', top:2, left:cfg[t.enableKey]?21:2, width:19, height:19, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                </button>
              </div>
              {t.subjectKey && (
                <Field label="Subject Line" value={cfg[t.subjectKey]} onChange={v=>set(t.subjectKey,v)} placeholder="Email subject…" />
              )}
              {t.emailKey && (
                <Field label="Admin Email to Notify" value={cfg[t.emailKey]} onChange={v=>set(t.emailKey,v)} placeholder="admin@example.com" />
              )}
              <div style={{ fontSize:'0.72rem', color:cfg[t.enableKey]?'var(--ok)':'var(--muted)', marginTop:4 }}>
                {cfg[t.enableKey] ? '● Enabled' : '○ Disabled'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── DOMAIN SETUP TAB ── */}
      {tab === 'domain' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div className="card" style={{ padding:20 }}>
            <h3 style={{ fontSize:'0.92rem', marginBottom:14, color:'var(--gold)' }}>🌐 haven.ellines.co.ke Email Setup</h3>
            <div className="adm-info-note" style={{ marginBottom:16 }}>
              Once you register <strong>haven.ellines.co.ke</strong>, add these DNS records in Cloudflare to enable email sending.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { type:'MX',  name:'@',                   value:'mx.zoho.com (priority 10)',          desc:'Receive emails at @haven.ellines.co.ke' },
                { type:'MX',  name:'@',                   value:'mx2.zoho.com (priority 20)',         desc:'Backup mail server' },
                { type:'TXT', name:'@',                   value:'v=spf1 include:zoho.com ~all',        desc:'SPF record — prevents spam flagging' },
                { type:'TXT', name:'_dmarc',              value:'v=DMARC1; p=none; rua=mailto:dmarc@haven.ellines.co.ke', desc:'DMARC policy' },
                { type:'TXT', name:'zmail._domainkey',    value:'(get from Zoho → Domains → DKIM)',   desc:'DKIM signing key' },
              ].map((r, i) => (
                <div key={i} style={{ padding:'10px 14px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)' }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:'0.68rem', fontWeight:700, padding:'2px 6px', borderRadius:4, background:'rgba(201,168,76,0.15)', color:'var(--gold)' }}>{r.type}</span>
                    <code style={{ fontSize:'0.78rem', color:'var(--text)' }}>{r.name}</code>
                  </div>
                  <code style={{ fontSize:'0.75rem', color:'#4a9eff', display:'block', marginBottom:4, wordBreak:'break-all' }}>{r.value}</code>
                  <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{r.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding:20 }}>
            <h3 style={{ fontSize:'0.92rem', marginBottom:14, color:'var(--gold)' }}>📧 Recommended Email Addresses</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { addr:'noreply@haven.ellines.co.ke',  use:'System emails (orders, resets)' },
                { addr:'hello@haven.ellines.co.ke',    use:'General contact' },
                { addr:'support@haven.ellines.co.ke',  use:'Customer support' },
                { addr:'admin@haven.ellines.co.ke',    use:'Admin notifications' },
              ].map(e => (
                <div key={e.addr} style={{ padding:'10px 14px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)' }}>
                  <code style={{ fontSize:'0.82rem', color:'var(--gold)' }}>{e.addr}</code>
                  <p style={{ fontSize:'0.72rem', color:'var(--muted)', margin:'3px 0 0' }}>{e.use}</p>
                </div>
              ))}
            </div>
            <div className="adm-info-note" style={{ marginTop:16 }}>
              <strong>Steps:</strong>
              <ol style={{ paddingLeft:16, margin:'8px 0 0', fontSize:'0.78rem', lineHeight:1.8 }}>
                <li>Register <strong>haven.ellines.co.ke</strong> via your registrar</li>
                <li>Point it to Cloudflare nameservers</li>
                <li>Add DNS records (left panel)</li>
                <li>Create a Zoho Mail / Resend account</li>
                <li>Verify domain ownership</li>
                <li>Set up Cloud Functions to send emails using config above</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ── TEST TAB ── */}
      {tab === 'test' && (
        <div style={{ maxWidth:520 }}>
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:'0.92rem', marginBottom:14, color:'var(--gold)' }}>🧪 Send Test Email</h3>
            <Field label="Test Email Address" value={testEmail} onChange={setTestEmail} placeholder="your@email.com"
              hint="We'll send a test email to verify your configuration works" />
            <button className="btn btn-primary btn-sm" onClick={sendTest} disabled={testing || !testEmail.trim()}>
              {testing ? '⏳ Sending…' : '📤 Send Test Email'}
            </button>
            {testMsg && (
              <div style={{ marginTop:16, padding:'12px 16px', background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.25)', borderRadius:'var(--r-sm)', fontSize:'0.82rem', lineHeight:1.6 }}>
                {testMsg}
              </div>
            )}
          </div>
          <div className="card" style={{ padding:24, marginTop:16 }}>
            <h3 style={{ fontSize:'0.92rem', marginBottom:12, color:'var(--gold)' }}>⚙️ Backend Integration</h3>
            <p style={{ fontSize:'0.82rem', color:'var(--muted)', lineHeight:1.7 }}>
              Email sending requires a backend. Your configuration is saved to Firestore. To actually send emails, deploy a <strong style={{color:'var(--text)'}}>Firebase Cloud Function</strong> or connect a serverless endpoint that:
            </p>
            <ol style={{ fontSize:'0.8rem', color:'var(--muted)', lineHeight:1.9, paddingLeft:20, marginTop:8 }}>
              <li>Reads config from <code style={{color:'var(--gold)'}}>site_data/email_config</code></li>
              <li>Listens for Firestore triggers (new order, new user, etc.)</li>
              <li>Calls your provider API (Resend, SendGrid, etc.)</li>
              <li>Logs sent emails to <code style={{color:'var(--gold)'}}>email_logs</code> collection</li>
            </ol>
            <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(74,158,255,0.06)', border:'1px solid rgba(74,158,255,0.2)', borderRadius:'var(--r-sm)', fontSize:'0.78rem' }}>
              💡 <strong>Quickest path:</strong> Use <a href="https://resend.com" target="_blank" rel="noopener noreferrer" style={{color:'var(--gold)'}}>Resend.com</a> — it has a simple REST API you can call directly from the browser for transactional emails during development, then move to Cloud Functions for production.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
