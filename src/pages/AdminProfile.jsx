import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, getDoc, setDoc, getDocs, collection, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './AdminProfile.css';

const QUICK_ACTIONS = [
  { icon:'📚', label:'Manage Books',    sub:'Add, edit, delete books',          tab:'books'       },
  { icon:'👥', label:'Manage Users',    sub:'User accounts & permissions',       tab:'users'       },
  { icon:'🛒', label:'View Orders',     sub:'Pending & completed orders',        tab:'orders'      },
  { icon:'✏️', label:'Edit Pages',      sub:'Live page content editor',          tab:'pageeditor'  },
  { icon:'🎨', label:'Design Studio',   sub:'Colors, fonts, theme',              tab:'design'      },
  { icon:'🔌', label:'Integrations',    sub:'Connect external services',         tab:'integrations'},
  { icon:'🔒', label:'Security',        sub:'Access control & audit logs',       tab:'security'    },
  { icon:'📊', label:'Reports',         sub:'Revenue & analytics',               tab:'reports'     },
  { icon:'💬', label:'Messages',        sub:'Customer messages',                 tab:'messages'    },
  { icon:'🔔', label:'Notifications',   sub:'Push & email alerts',               tab:'notifications'},
];
const SUPER_ACTIONS = [
  { icon:'⚡', label:'God Mode',        sub:'Full site control',                 tab:'godmode'     },
  { icon:'🛡️', label:'Admin Control',  sub:'Manage admin accounts',             tab:'admins'      },
  { icon:'📋', label:'System Logs',     sub:'Full audit trail',                  tab:'logs'        },
  { icon:'💾', label:'Backup & Restore',sub:'Export & import data',              tab:'backup'      },
];

export default function AdminProfile() {
  const { user, setUser, logout, books, orders } = useApp();
  const navigate = useNavigate();
  const [tab,      setTab]      = useState('dashboard');
  const [stats,    setStats]    = useState({ books:0, users:0, orders:0, revenue:0 });
  const [recentAct,setRecentAct]= useState([]);
  const [form,     setForm]     = useState({ name:'', bio:'' });
  const [pw,       setPw]       = useState({ current:'', next:'', confirm:'' });
  const [pwMsg,    setPwMsg]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');

  const isSuper = user?.role === 'superadmin';
  const showToast = m => { setToast(m); setTimeout(()=>setToast(''),3000); };

  useEffect(()=>{ if(!user||!(user.role==='admin'||user.role==='superadmin')) navigate('/login'); },[user,navigate]);

  useEffect(()=>{
    if (!user) return;
    setForm({ name:user.name||'', bio:'' });
    // Load profile
    getDoc(doc(db,'user_profiles',user.email.toLowerCase())).then(snap=>{
      if (snap.exists()) setForm(f=>({...f,...snap.data()}));
    }).catch(()=>{});
    // Stats
    const allOrders = orders || [];
    const rev = allOrders.filter(o=>o.status==='Completed').reduce((s,o)=>s+Number(o.total||0),0);
    const users = JSON.parse(localStorage.getItem('eh_registered_users')||'[]');
    setStats({ books:books?.length||0, users:users.length||0, orders:allOrders.length, revenue:rev });
    // Recent admin logs
    try {
      const q=query(collection(db,'admin_logs'),orderBy('ts','desc'),limit(5));
      const unsub=onSnapshot(q,snap=>setRecentAct(snap.docs.map(d=>({id:d.id,...d.data()}))),()=>{});
      return ()=>unsub();
    } catch {}
  },[user?.email, books?.length, orders?.length]);

  if (!user || !(user.role==='admin'||user.role==='superadmin')) return null;

  const initials = (n=(user?.name||'A')) => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  const saveProfile = async () => {
    setSaving(true);
    try {
      setUser({...user, name:form.name});
      await setDoc(doc(db,'user_profiles',user.email.toLowerCase()),{name:form.name,bio:form.bio,updatedAt:serverTimestamp()},{merge:true});
      showToast('✅ Profile saved');
    } catch(e){ showToast('❌ '+e.message); }
    finally { setSaving(false); } // Added finally to ensure state is always cleared
  };

  const changePw = () => {
    if(!pw.current||!pw.next||!pw.confirm){setPwMsg('Fill all fields');return;}
    if(pw.next!==pw.confirm){setPwMsg('Passwords do not match');return;}
    if(pw.next.length<4){setPwMsg('Minimum 4 characters');return;}
    const ov=JSON.parse(localStorage.getItem('eh_pw_overrides')||'{}');
    const stored=ov[user.email.toLowerCase()]||user.password||'';
    if(pw.current!==stored&&pw.current!==user.password){setPwMsg('Current password incorrect');return;}
    ov[user.email.toLowerCase()]=pw.next;
    localStorage.setItem('eh_pw_overrides',JSON.stringify(ov));
    setPw({current:'',next:'',confirm:''}); setPwMsg(''); showToast('✅ Password updated');
  };

  const goAdmin = (tab) => navigate('/admin', { state:{ tab } });

  const TABS = [
    {k:'dashboard',l:'🏠 Dashboard'},
    {k:'settings', l:'⚙️ Settings'},
    {k:'password', l:'🔑 Password'},
  ];

  return (
    <div className="ap-root">
      {toast && <div className="ap-toast">{toast}</div>}

      {/* ── Top bar ── */}
      <div className="ap-topbar">
        <div className="ap-topbar__brand">
          <img src="/logo-nobg3.png" alt="Ellines Haven" style={{height:36,objectFit:'contain'}} />
          <span>Admin Command Center</span>
        </div>
        <div className="ap-topbar__right">
          <Link to="/admin" className="btn btn-ghost btn-sm">← Back to Admin</Link>
          <Link to="/" className="btn btn-ghost btn-sm">🌐 View Site</Link>
          <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.1)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.3)'}} onClick={()=>{logout();navigate('/');}}>Sign Out</button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="ap-hero">
        <div className="ap-hero__glow" />
        <div className="ap-hero__inner">
          <div className="ap-avatar">{initials()}</div>
          <div className="ap-hero__info">
            <div className="ap-hero__name">{user.name}</div>
            <div className="ap-hero__email">{user.email}</div>
            <div className="ap-hero__role">
              {isSuper ? <><span className="ap-role-badge ap-role-super">⚡ Super Admin</span><span className="ap-hero__desc">Full site control — all features unlocked</span></>
                       : <><span className="ap-role-badge ap-role-admin">🛡️ Administrator</span><span className="ap-hero__desc">Site management access</span></>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="ap-stats">
        {[{n:stats.books,l:'Books',i:'📚'},{n:stats.users,l:'Users',i:'👥'},{n:stats.orders,l:'Orders',i:'🛒'},{n:`KSh ${stats.revenue.toLocaleString()}`,l:'Revenue',i:'💰'}].map(s=>(
          <div key={s.l} className="ap-stat">
            <span className="ap-stat__icon">{s.i}</span>
            <span className="ap-stat__num">{s.n}</span>
            <span className="ap-stat__label">{s.l}</span>
          </div>
        ))}
      </div>

      <div className="ap-layout">
        {/* Sidebar */}
        <nav className="ap-nav">
          {TABS.map(t=>(
            <button key={t.k} className={`ap-nav-btn${tab===t.k?' ap-nav-btn--active':''}`} onClick={()=>setTab(t.k)}>{t.l}</button>
          ))}
          <div className="ap-nav-divider" />
          <div className="ap-nav-section">Quick Nav</div>
          <button className="ap-nav-btn" onClick={()=>navigate('/admin')}>⚡ Admin Panel →</button>
          {isSuper && <button className="ap-nav-btn" style={{color:'var(--gold)'}} onClick={()=>goAdmin('godmode')}>🔥 God Mode →</button>}
        </nav>

        {/* Content */}
        <div className="ap-content">

          {/* Dashboard */}
          {tab==='dashboard' && (
            <div>
              <h2 className="ap-section-title">Quick Actions</h2>
              <div className="ap-actions-grid">
                {QUICK_ACTIONS.map(a=>(
                  <button key={a.tab} className="ap-action-card" onClick={()=>goAdmin(a.tab)}>
                    <span className="ap-action-card__icon">{a.icon}</span>
                    <strong>{a.label}</strong>
                    <span>{a.sub}</span>
                  </button>
                ))}
              </div>
              {isSuper && <>
                <h2 className="ap-section-title" style={{marginTop:28}}>⚡ Super Admin Actions</h2>
                <div className="ap-actions-grid">
                  {SUPER_ACTIONS.map(a=>(
                    <button key={a.tab} className="ap-action-card ap-action-card--super" onClick={()=>goAdmin(a.tab)}>
                      <span className="ap-action-card__icon">{a.icon}</span>
                      <strong>{a.label}</strong>
                      <span>{a.sub}</span>
                    </button>
                  ))}
                </div>
              </>}
              <div className="ap-panel" style={{marginTop:24}}>
                <h3 className="ap-panel__title">📋 Recent Admin Activity</h3>
                {recentAct.length===0 ? (
                  <p style={{color:'var(--muted)',fontSize:'0.82rem',padding:'12px 0'}}>No activity logged yet. Enable logging in God Mode.</p>
                ) : recentAct.map((a,i)=>(
                  <div key={i} style={{display:'flex',gap:12,alignItems:'center',padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'0.82rem'}}>
                    <span style={{color:'var(--gold)',fontSize:'0.68rem',flexShrink:0,fontFamily:'monospace'}}>{a.type}</span>
                    <span style={{flex:1,color:'var(--text)'}}>{a.action}</span>
                    <span style={{color:'var(--muted)',fontSize:'0.72rem',flexShrink:0}}>{a.admin}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          {tab==='settings' && (
            <div className="ap-panel">
              <h3 className="ap-panel__title">Profile Settings</h3>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:18}}>
                <div className="ap-field"><label>Display Name</label><input className="field" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="ap-field"><label>Email <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>(read-only)</span></label><input className="field" value={user.email} readOnly style={{opacity:0.5,cursor:'not-allowed'}} /></div>
                <div className="ap-field" style={{gridColumn:'1/-1'}}><label>Bio / Notes</label><textarea className="field" rows={3} value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} style={{resize:'vertical'}} /></div>
              </div>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>{saving?'⏳ Saving…':'💾 Save Changes'}</button>
            </div>
          )}

          {/* Password */}
          {tab==='password' && (
            <div className="ap-panel" style={{maxWidth:460}}>
              <h3 className="ap-panel__title">Change Password</h3>
              {pwMsg && <div style={{padding:'10px 14px',borderRadius:'var(--r-sm)',marginBottom:14,fontSize:'0.82rem',background:pwMsg.startsWith('✅')?'rgba(46,204,113,0.1)':'rgba(231,76,60,0.1)',color:pwMsg.startsWith('✅')?'var(--ok)':'#e74c3c',border:`1px solid ${pwMsg.startsWith('✅')?'rgba(46,204,113,0.3)':'rgba(231,76,60,0.3)'}`}}>{pwMsg}</div>}
              <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:18}}>
                <div className="ap-field"><label>Current Password</label><input type="password" className="field" value={pw.current} onChange={e=>setPw(p=>({...p,current:e.target.value}))} /></div>
                <div className="ap-field"><label>New Password</label><input type="password" className="field" value={pw.next} onChange={e=>setPw(p=>({...p,next:e.target.value}))} /></div>
                <div className="ap-field"><label>Confirm Password</label><input type="password" className="field" value={pw.confirm} onChange={e=>setPw(p=>({...p,confirm:e.target.value}))} /></div>
              </div>
              <button className="btn btn-primary" onClick={changePw}>🔑 Update Password</button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
