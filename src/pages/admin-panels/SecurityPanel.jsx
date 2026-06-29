import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const TIMEOUT_OPTS = [{l:'15 min',v:15},{l:'30 min',v:30},{l:'1 hour',v:60},{l:'Never',v:0}];
const MIN_PW = [4,6,8,12];
const MAX_ATT = [3,5,10];
const LOCKOUT = [{l:'5 min',v:5},{l:'15 min',v:15},{l:'1 hr',v:60}];

function Toggle({label,desc,checked,onChange}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'11px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
      <div><div style={{fontSize:'0.86rem',fontWeight:600}}>{label}</div>{desc&&<div style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:2}}>{desc}</div>}</div>
      <button onClick={()=>onChange(!checked)} style={{width:42,height:23,borderRadius:12,border:'none',cursor:'pointer',position:'relative',flexShrink:0,background:checked?'var(--gold)':'rgba(255,255,255,0.15)',transition:'background 0.2s'}}>
        <span style={{position:'absolute',top:2,left:checked?21:2,width:19,height:19,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
      </button>
    </div>
  );
}

function calcScore(c,pw) {
  let n=0;
  if(c.forceHttps) n+=12; if(c.disableDevTools) n+=14; if(c.disableCopy) n+=8;
  if(c.disablePrint) n+=5; if(c.disableRightClick) n+=5; if(c.disableSelect) n+=4;
  if(c.watermarkAll) n+=8; if(pw.minLength>=8) n+=14; if(pw.requireNumbers) n+=10;
  if(pw.requireSpecial) n+=12; if(pw.maxAttempts<=5) n+=5; if(pw.brute) n+=8;
  return Math.min(100,n);
}

export default function SecurityPanel({ showToast, siteControls, saveSiteControls, isSuper }) {
  const c = siteControls || {};
  const [pw, setPw] = useState({minLength:c.pwMinLength??6,requireNumbers:!!c.pwNumbers,requireSpecial:!!c.pwSpecial,maxAttempts:c.maxAttempts??5,lockoutMins:c.lockoutMins??15,brute:!!c.brute,autoBan:!!c.autoBan});
  const [sessionTimeout, setSessionTimeout] = useState(c.sessionTimeout??60);
  const [ipList,    setIpList]    = useState('');
  const [emailDoms, setEmailDoms] = useState('');
  const [rateLimit, setRateLimit] = useState(c.rateLimit??60);
  const [saving,    setSaving]    = useState(false);
  const [logoutConf,setLogoutConf]= useState(false);
  const [authLogs,  setAuthLogs]  = useState([]);
  const [adminLogs, setAdminLogs] = useState([]);
  const [tab, setTab] = useState('controls');

  const TABS = [{k:'controls',l:'Controls'},{k:'sessions',l:'Sessions'},{k:'passwords',l:'Passwords'},{k:'logs',l:'Auth Logs'},{k:'admin',l:'Admin Log'}];

  useEffect(()=>{
    getDoc(doc(db,'site_data','security_settings')).then(snap=>{
      if(snap.exists()){
        const d=snap.data();
        setIpList((d.blockedIps||[]).join('\n')); setEmailDoms((d.blockedDomains||[]).join('\n'));
        if(d.sessionTimeout!==undefined) setSessionTimeout(d.sessionTimeout);
        if(d.rateLimit!==undefined) setRateLimit(d.rateLimit);
        if(d.pwPolicy) setPw(p=>({...p,...d.pwPolicy}));
      }
    }).catch(()=>{});
    // Auth logs from system_logs
    try {
      const q=query(collection(db,'site_data'),orderBy('updatedAt','desc'),limit(1));
      getDoc(doc(db,'site_data','system_logs')).then(snap=>{
        if(snap.exists()) setAuthLogs((snap.data().logs||[]).filter(l=>l.type==='auth').slice(0,20));
      }).catch(()=>{});
    } catch {}
    // Admin logs
    try {
      const q2=query(collection(db,'admin_logs'),orderBy('ts','desc'),limit(20));
      const unsub=onSnapshot(q2,snap=>{setAdminLogs(snap.docs.map(d=>({id:d.id,...d.data()})));},()=>{});
      return ()=>unsub();
    } catch {}
  },[]);

  const toggle = (k,v) => saveSiteControls?.({...c,[k]:v});

  const saveAll = async () => {
    setSaving(true);
    const blockedIps = ipList.split('\n').map(l=>l.trim()).filter(Boolean);
    const blockedDomains = emailDoms.split('\n').map(l=>l.trim()).filter(Boolean);
    try {
      await setDoc(doc(db,'site_data','security_settings'),{blockedIps,blockedDomains,sessionTimeout,rateLimit,pwPolicy:pw,updatedAt:serverTimestamp()},{merge:true});
      await saveSiteControls?.({...c,sessionTimeout,rateLimit,pwMinLength:pw.minLength,pwNumbers:pw.requireNumbers,pwSpecial:pw.requireSpecial,maxAttempts:pw.maxAttempts,lockoutMins:pw.lockoutMins,brute:pw.brute,autoBan:pw.autoBan});
      showToast?.('✅ Security settings saved');
    } catch(e){ showToast?.('❌ '+e.message); }
    setSaving(false);
  };

  const forceLogout = () => {
    Object.keys(localStorage).filter(k=>k.startsWith('eh_user')).forEach(k=>localStorage.removeItem(k));
    setLogoutConf(false); showToast?.('✅ All sessions cleared');
  };

  const score = calcScore(c,pw);
  const scoreColor = score>=75?'var(--ok)':score>=45?'#e8832a':'var(--err)';
  const scoreLabel = score>=75?'Strong':score>=45?'Moderate':'Weak';

  const exportLogs = () => {
    const rows = authLogs.map(l=>`"${l.time}","${l.type}","${l.event}","${l.user}","${l.status}"`).join('\n');
    const b=new Blob(['Time,Type,Event,User,Status\n'+rows],{type:'text/csv'});
    const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download='auth-logs.csv'; a.click(); URL.revokeObjectURL(u);
  };

  return (
    <div className="adm-page">
      {logoutConf && (
        <div className="adm-overlay"><div className="adm-confirm card">
          <p style={{marginBottom:14}}>Force logout all active users?</p>
          <div className="adm-confirm-btns"><button className="btn btn-primary btn-sm" onClick={forceLogout}>Yes</button><button className="btn btn-ghost btn-sm" onClick={()=>setLogoutConf(false)}>Cancel</button></div>
        </div></div>
      )}

      <div className="adm-page-head">
        <div><h1>Security</h1><span className="adm-page-sub">Access control, sessions, passwords, and audit logs</span></div>
        <button className="btn btn-primary" onClick={saveAll} disabled={saving}>{saving?'⏳ Saving…':'💾 Save Settings'}</button>
      </div>

      {/* Score */}
      <div className="card" style={{padding:18,marginBottom:18}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
          <span style={{fontWeight:700}}>🛡️ Security Score</span>
          <span style={{fontWeight:700,color:scoreColor}}>{score}/100 — {scoreLabel}</span>
        </div>
        <div style={{height:10,background:'var(--surface)',borderRadius:5,overflow:'hidden',marginBottom:10}}>
          <div style={{width:score+'%',height:'100%',background:scoreColor,borderRadius:5,transition:'width 0.5s'}}/>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {[['HTTPS',c.forceHttps],['No DevTools',c.disableDevTools],['No Copy',c.disableCopy],['Watermark',c.watermarkAll],['Strong PW',pw.minLength>=8],['Numbers',pw.requireNumbers],['Special',pw.requireSpecial],['Rate Limit',c.rateLimit],['Brute Force',pw.brute]].map(([l,v])=>(
            <span key={l} style={{fontSize:'0.68rem',padding:'2px 8px',borderRadius:4,background:v?'rgba(46,204,113,0.1)':'rgba(255,255,255,0.05)',color:v?'var(--ok)':'var(--muted)',border:`1px solid ${v?'rgba(46,204,113,0.3)':'rgba(255,255,255,0.08)'}`}}>{v?'✓':' '} {l}</span>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:18,background:'var(--surface)',borderRadius:'var(--r)',padding:5,border:'1px solid var(--border)'}}>
        {TABS.map(t=><button key={t.k} onClick={()=>setTab(t.k)} style={{padding:'6px 14px',borderRadius:'var(--r-sm)',border:'none',background:tab===t.k?'var(--gold)':'transparent',color:tab===t.k?'#000':'var(--muted)',fontWeight:600,fontSize:'0.8rem',cursor:'pointer',fontFamily:'inherit'}}>{t.l}</button>)}
      </div>

      {tab==='controls' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:6,color:'var(--gold)'}}>🔒 Access Controls</h3>
            <Toggle label="Force HTTPS" desc="Redirect HTTP to HTTPS" checked={!!c.forceHttps} onChange={v=>toggle('forceHttps',v)} />
            <Toggle label="Disable Right-Click" desc="Block context menu" checked={!!c.disableRightClick} onChange={v=>toggle('disableRightClick',v)} />
            <Toggle label="Disable Text Selection" desc="Can't select/highlight text" checked={!!c.disableSelect} onChange={v=>toggle('disableSelect',v)} />
            <Toggle label="Disable Copy/Paste" desc="Block Ctrl+C / Ctrl+V" checked={!!c.disableCopy} onChange={v=>toggle('disableCopy',v)} />
            <Toggle label="Block DevTools" desc="Prevent inspect element" checked={!!c.disableDevTools} onChange={v=>toggle('disableDevTools',v)} />
            <Toggle label="Block Print" desc="Disable Ctrl+P" checked={!!c.disablePrint} onChange={v=>toggle('disablePrint',v)} />
            <Toggle label="Watermark Content" desc="Show user email on all content" checked={!!c.watermarkAll} onChange={v=>toggle('watermarkAll',v)} />
            <Toggle label="Maintenance Mode" desc="Show maintenance page to non-admins" checked={!!c.maintenanceMode} onChange={v=>toggle('maintenanceMode',v)} />
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="card" style={{padding:18}}>
              <h3 style={{fontSize:'0.88rem',marginBottom:12,color:'var(--gold)'}}>⚡ Rate Limiting</h3>
              <div style={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><label style={{fontSize:'0.78rem',color:'var(--muted)'}}>Max requests/min</label><span style={{fontSize:'0.78rem',color:'var(--gold)',fontFamily:'monospace'}}>{rateLimit}</span></div>
                <input type="range" min="10" max="200" step="10" value={rateLimit} onChange={e=>setRateLimit(Number(e.target.value))} style={{width:'100%',accentColor:'var(--gold)'}} />
              </div>
              <Toggle label="Brute Force Detection" desc="Track failed login attempts" checked={!!pw.brute} onChange={v=>setPw(p=>({...p,brute:v}))} />
              <Toggle label="Auto-ban IPs on abuse" desc="Block after too many failures" checked={!!pw.autoBan} onChange={v=>setPw(p=>({...p,autoBan:v}))} />
            </div>
            <div className="card" style={{padding:18}}>
              <h3 style={{fontSize:'0.88rem',marginBottom:10,color:'var(--gold)'}}>🚫 Blocklists</h3>
              <label style={{fontSize:'0.75rem',color:'var(--muted)',display:'block',marginBottom:4}}>Blocked IPs (one per line)</label>
              <textarea className="field" rows={3} value={ipList} onChange={e=>setIpList(e.target.value)} style={{width:'100%',resize:'vertical',fontSize:'0.78rem',fontFamily:'monospace',marginBottom:10}} placeholder="192.168.1.1&#10;10.0.0.5" />
              <label style={{fontSize:'0.75rem',color:'var(--muted)',display:'block',marginBottom:4}}>Blocked Email Domains</label>
              <textarea className="field" rows={3} value={emailDoms} onChange={e=>setEmailDoms(e.target.value)} style={{width:'100%',resize:'vertical',fontSize:'0.78rem',fontFamily:'monospace'}} placeholder="tempmail.com&#10;guerrillamail.com" />
            </div>
          </div>
        </div>
      )}

      {tab==='sessions' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:14,color:'var(--gold)'}}>⏱️ Session Timeout</h3>
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:14}}>
              {TIMEOUT_OPTS.map(o=><button key={o.v} onClick={()=>setSessionTimeout(o.v)} className={sessionTimeout===o.v?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'}>{o.l}</button>)}
            </div>
            <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.1)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.3)',width:'100%'}} onClick={()=>setLogoutConf(true)}>🔴 Force Logout All Users</button>
          </div>
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:10,color:'var(--gold)'}}>📊 Session Overview</h3>
            {[{l:'Session timeout',v:sessionTimeout===0?'Never':sessionTimeout+'min'},{l:'Rate limit',v:rateLimit+' req/min'},{l:'Brute force detection',v:pw.brute?'On':'Off'},{l:'Auto-ban',v:pw.autoBan?'On':'Off'}].map(r=>(
              <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'0.82rem'}}>
                <span style={{color:'var(--muted)'}}>{r.l}</span><span style={{color:'var(--text)',fontWeight:600}}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==='passwords' && (
        <div className="card" style={{padding:20,maxWidth:520}}>
          <h3 style={{fontSize:'0.92rem',marginBottom:16,color:'var(--gold)'}}>🔑 Password Policy</h3>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:8}}>Minimum Length</label>
            <div style={{display:'flex',gap:8}}>{MIN_PW.map(n=><button key={n} onClick={()=>setPw(p=>({...p,minLength:n}))} className={pw.minLength===n?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'}>{n}</button>)}</div>
          </div>
          <Toggle label="Require Numbers" checked={pw.requireNumbers} onChange={v=>setPw(p=>({...p,requireNumbers:v}))} />
          <Toggle label="Require Special Characters" checked={pw.requireSpecial} onChange={v=>setPw(p=>({...p,requireSpecial:v}))} />
          <div style={{marginTop:14,marginBottom:14}}>
            <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:8}}>Max Failed Attempts</label>
            <div style={{display:'flex',gap:8}}>{MAX_ATT.map(n=><button key={n} onClick={()=>setPw(p=>({...p,maxAttempts:n}))} className={pw.maxAttempts===n?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'}>{n}</button>)}</div>
          </div>
          <div>
            <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:8}}>Lockout Duration</label>
            <div style={{display:'flex',gap:8}}>{LOCKOUT.map(o=><button key={o.v} onClick={()=>setPw(p=>({...p,lockoutMins:o.v}))} className={pw.lockoutMins===o.v?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'}>{o.l}</button>)}</div>
          </div>
          <div style={{marginTop:18,padding:14,background:'rgba(201,168,76,0.06)',borderRadius:'var(--r-sm)',border:'1px solid rgba(201,168,76,0.2)',fontSize:'0.78rem',color:'var(--muted)'}}>
            <strong style={{color:'var(--gold)',display:'block',marginBottom:4}}>Current Policy</strong>
            Min {pw.minLength} chars · {pw.requireNumbers?'Numbers ✓':'No number req'} · {pw.requireSpecial?'Special chars ✓':'No special req'} · Max {pw.maxAttempts} attempts · {pw.lockoutMins}min lockout
          </div>
        </div>
      )}

      {tab==='logs' && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontWeight:600,fontSize:'0.88rem'}}>🔐 Authentication Log (last 20)</span>
            <button className="btn btn-ghost btn-sm" onClick={exportLogs}>⬇ Export CSV</button>
          </div>
          {authLogs.length===0 ? (
            <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'0.85rem'}}>No auth logs yet. Logs are written when users sign in.</div>
          ) : (
            <table className="adm-table">
              <thead><tr><th>Time</th><th>Event</th><th>User</th><th>Status</th></tr></thead>
              <tbody>
                {authLogs.map((l,i)=>(
                  <tr key={i}>
                    <td style={{fontSize:'0.72rem',color:'var(--muted)',whiteSpace:'nowrap'}}>{l.time}</td>
                    <td style={{fontSize:'0.82rem'}}>{l.event}</td>
                    <td style={{fontSize:'0.78rem',color:'var(--muted)'}}>{l.user}</td>
                    <td><span className={'adm-status adm-status--'+(l.status==='success'?'completed':'refunded')}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab==='admin' && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontWeight:600,fontSize:'0.88rem'}}>👑 Admin Activity Log (last 20)</div>
          {adminLogs.length===0 ? (
            <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'0.85rem'}}>No admin logs yet. Enable God Mode logging to capture admin actions.</div>
          ) : (
            <table className="adm-table">
              <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Type</th></tr></thead>
              <tbody>
                {adminLogs.map((l,i)=>(
                  <tr key={i}>
                    <td style={{fontSize:'0.72rem',color:'var(--muted)',whiteSpace:'nowrap'}}>{l.ts?.toDate?.()?.toLocaleString?.()??'—'}</td>
                    <td style={{fontSize:'0.78rem',color:'var(--muted)'}}>{l.admin}</td>
                    <td style={{fontSize:'0.82rem'}}>{l.action}</td>
                    <td><span className="adm-badge" style={{background:'rgba(74,158,255,0.1)',color:'#7eb6ff'}}>{l.type}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab!=='controls'&&tab!=='sessions'&&tab!=='passwords'&&tab!=='logs'&&tab!=='admin' && (
        <div className="card" style={{padding:20,textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:8}}>🔐</div>
          <p style={{color:'var(--muted)'}}>2FA — Coming in a future update</p>
        </div>
      )}
    </div>
  );
}
