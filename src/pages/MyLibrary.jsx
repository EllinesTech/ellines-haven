import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import './MyLibrary.css';

const WA_NUMBER = '254748255466';

function toDownloadUrl(url) {
  if (!url) return '#';
  try {
    if (url.includes('uc?export=download')) return url;
    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
  } catch {}
  return url;
}

// ── Account Settings Panel ──────────────────────────────────────────────────
function AccountSettings({ user, myPerms }) {
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eh_user_prefs_' + user.email) || '{}'); } catch { return {}; }
  });
  const [pwForm, setPwForm]   = useState({ current:'', newPw:'', confirm:'' });
  const [pwMsg,  setPwMsg]    = useState('');
  const [saved,  setSaved]    = useState('');

  const savePrefs = (next) => {
    setPrefs(next);
    localStorage.setItem('eh_user_prefs_' + user.email, JSON.stringify(next));
    setSaved('✅ Preferences saved');
    setTimeout(() => setSaved(''), 2500);
  };

  const toggle = (key, def = true) => savePrefs({ ...prefs, [key]: prefs[key] === undefined ? !def : !prefs[key] });
  const get    = (key, def = true) => prefs[key] === undefined ? def : prefs[key];

  const handlePwChange = e => {
    e.preventDefault();
    setPwMsg('');
    const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
    const stored    = overrides[user.email.toLowerCase()];
    // Require current password before allowing change
    if (stored && pwForm.current !== stored) { setPwMsg('❌ Current password is incorrect'); return; }
    if (pwForm.newPw.length < 4) { setPwMsg('❌ New password must be at least 4 characters'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg('❌ Passwords do not match'); return; }
    overrides[user.email.toLowerCase()] = pwForm.newPw;
    localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));
    setPwMsg('✅ Password updated successfully');
    setPwForm({ current:'', newPw:'', confirm:'' });
  };

  const preferenceGroups = [
    {
      label: 'Reading Experience',
      items: [
        { key:'darkReader',     label:'Dark reader background',       desc:'Darker background in the online reader',       def:true  },
        { key:'largeText',      label:'Larger text by default',       desc:'Start reader with bigger font size',           def:false },
        { key:'showProgress',   label:'Show reading progress',        desc:'Display chapter progress indicator',           def:true  },
        { key:'autoNextChapter',label:'Auto-advance chapters',        desc:'Automatically scroll to next chapter',         def:false },
      ]
    },
    {
      label: 'Notifications',
      items: [
        { key:'notifyNewBooks',  label:'New book releases',           desc:'Get notified when new books are published',    def:true  },
        { key:'notifyOrders',    label:'Order status updates',        desc:'Updates on your payment verification',         def:true  },
        { key:'notifyPromos',    label:'Promotions & discounts',      desc:'Exclusive deals and promo codes',              def:false },
      ]
    },
    {
      label: 'Privacy',
      items: [
        { key:'showInLeaders',   label:'Show in reading leaderboard', desc:'Let others see you\'ve read a book',           def:true  },
        { key:'publicProfile',   label:'Public profile',              desc:'Allow others to see your book collection',     def:false },
      ]
    },
  ];

  return (
    <div style={{ maxWidth:640, margin:'0 auto', padding:'32px 0 80px' }}>
      {/* Account Info Card */}
      <div className="card" style={{ padding:24, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,var(--gold),#e8c96d)', color:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', fontWeight:700, flexShrink:0 }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style={{ fontSize:'1.1rem', marginBottom:3 }}>{user.name}</h3>
            <span style={{ fontSize:'0.82rem', color:'var(--muted)' }}>{user.email}</span>
            <span style={{ display:'block', fontSize:'0.72rem', marginTop:4, padding:'2px 8px', background:'rgba(201,168,76,0.1)', color:'var(--gold)', border:'1px solid rgba(201,168,76,0.25)', borderRadius:10, width:'fit-content' }}>
              {user.role === 'admin' ? '🛡 Admin' : user.role === 'superadmin' ? '⭐ Super Admin' : '📚 Reader'}
            </span>
          </div>
          <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hi, I need help with my Ellines Haven account: ' + user.email)}`}
            target="_blank" rel="noopener noreferrer"
            className="btn btn-outline btn-sm" style={{ marginLeft:'auto', color:'#25D366', borderColor:'rgba(37,211,102,0.4)', flexShrink:0 }}>
            💬 Support
          </a>
        </div>
        {/* Permission badges */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {[
            { key:'canBrowse',     label:'Browse' },
            { key:'canPurchase',   label:'Purchase' },
            { key:'canReadOnline', label:'Read Online' },
            { key:'canDownload',   label:'Download' },
            { key:'canReview',     label:'Reviews' },
          ].map(p => (
            <span key={p.key} style={{ fontSize:'0.72rem', padding:'3px 10px', borderRadius:10, background: myPerms?.[p.key]===false ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.08)', color: myPerms?.[p.key]===false ? '#e74c3c' : '#2ecc71', border: myPerms?.[p.key]===false ? '1px solid rgba(231,76,60,0.3)' : '1px solid rgba(46,204,113,0.25)' }}>
              {myPerms?.[p.key]===false ? '✗' : '✓'} {p.label}
            </span>
          ))}
        </div>
      </div>

      {/* Preferences */}
      {saved && <div style={{ background:'rgba(46,204,113,0.08)', border:'1px solid rgba(46,204,113,0.25)', borderRadius:'var(--r-sm)', padding:'10px 16px', marginBottom:16, fontSize:'0.84rem', color:'var(--ok)' }}>{saved}</div>}
      {preferenceGroups.map(group => (
        <div key={group.label} className="card" style={{ padding:20, marginBottom:16 }}>
          <h4 style={{ fontSize:'0.88rem', color:'var(--gold)', textTransform:'uppercase', letterSpacing:1, marginBottom:14 }}>{group.label}</h4>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {group.items.map(item => (
              <div key={item.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                <div style={{ flex:1 }}>
                  <strong style={{ fontSize:'0.88rem', display:'block' }}>{item.label}</strong>
                  <span style={{ fontSize:'0.76rem', color:'var(--muted)' }}>{item.desc}</span>
                </div>
                <button type="button"
                  onClick={() => toggle(item.key, item.def)}
                  style={{ flexShrink:0, padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.78rem', minWidth:52, background: get(item.key, item.def) ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.06)', color: get(item.key, item.def) ? 'var(--gold)' : 'var(--muted)', transition:'all 0.2s' }}>
                  {get(item.key, item.def) ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Change Password */}
      <div className="card" style={{ padding:20, marginBottom:16 }}>
        <h4 style={{ fontSize:'0.88rem', color:'var(--gold)', textTransform:'uppercase', letterSpacing:1, marginBottom:14 }}>Change Password</h4>
        {pwMsg && <div style={{ padding:'8px 12px', borderRadius:'var(--r-sm)', marginBottom:12, fontSize:'0.82rem', background: pwMsg.startsWith('✅') ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)', color: pwMsg.startsWith('✅') ? 'var(--ok)' : '#e74c3c', border: pwMsg.startsWith('✅') ? '1px solid rgba(46,204,113,0.25)' : '1px solid rgba(231,76,60,0.25)' }}>{pwMsg}</div>}
        <form onSubmit={handlePwChange} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ fontSize:'0.8rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Current Password</label>
            <input className="field" type="password" placeholder="Your current password" value={pwForm.current} onChange={e => setPwForm(f=>({...f,current:e.target.value}))} />
          </div>
          <div>
            <label style={{ fontSize:'0.8rem', color:'var(--muted)', display:'block', marginBottom:4 }}>New Password</label>
            <input className="field" type="password" placeholder="Minimum 4 characters" value={pwForm.newPw} onChange={e => setPwForm(f=>({...f,newPw:e.target.value}))} />
          </div>
          <div>
            <label style={{ fontSize:'0.8rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Confirm New Password</label>
            <input className="field" type="password" placeholder="Repeat new password" value={pwForm.confirm} onChange={e => setPwForm(f=>({...f,confirm:e.target.value}))} />
          </div>
          <button type="submit" className="btn btn-outline btn-sm" style={{ width:'fit-content' }}>Update Password</button>
        </form>
      </div>

      {/* Quick contact */}
      <div className="card" style={{ padding:20, display:'flex', alignItems:'center', gap:14 }}>
        <span style={{ fontSize:'1.8rem' }}>💬</span>
        <div style={{ flex:1 }}>
          <strong style={{ display:'block', marginBottom:3 }}>Need help?</strong>
          <span style={{ fontSize:'0.8rem', color:'var(--muted)' }}>WhatsApp us directly — we reply fast</span>
        </div>
        <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ background:'rgba(37,211,102,0.12)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', flexShrink:0 }}>
          Open WhatsApp
        </a>
      </div>
    </div>
  );
}

// ── Main MyLibrary Page ─────────────────────────────────────────────────────
export default function MyLibrary() {
  const { user, library, books: catalog, myPerms } = useApp();
  const [liveOrders, setLiveOrders] = useState([]);
  const [activeTab,  setActiveTab]  = useState('library');

  useEffect(() => {
    if (!user?.email) { setLiveOrders([]); return; }
    const q = query(collection(db, 'orders'), where('userEmail', '==', user.email.toLowerCase()));
    const unsub = onSnapshot(q,
      snap => {
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt || 0 }));
        orders.sort((a, b) => b.createdAt - a.createdAt);
        setLiveOrders(orders);
      },
      err => console.error('MyLibrary orders listener:', err)
    );
    return () => unsub();
  }, [user?.email]);

  if (!user) return (
    <main className="mylib-page">
      <div className="container">
        <div className="mylib-gate">
          <img src="/logo-nobg3.png" alt="" style={{ height:100, margin:'0 auto 20px', display:'block', filter:'drop-shadow(0 2px 12px rgba(201,168,76,0.5))' }} />
          <h2>Sign in to view your library</h2>
          <p>Your purchased books will appear here.</p>
          <Link to="/login" className="btn btn-primary">Sign In</Link>
        </div>
      </div>
    </main>
  );

  if (myPerms?.canAccessMyLibrary === false) return (
    <main className="mylib-page">
      <div className="container">
        <div className="mylib-gate">
          <div style={{ fontSize:'3rem', marginBottom:16 }}>🔒</div>
          <h2>Library Access Restricted</h2>
          <p style={{ color:'var(--muted)' }}>Your access has been restricted. Contact support.</p>
          <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Contact Support</a>
        </div>
      </div>
    </main>
  );

  const myPending = liveOrders.filter(o => o.status === 'Pending');

  const enrichedLibrary = library.map(lb => {
    const cat = catalog.find(b => b.id === lb.id);
    return {
      ...lb,
      cover:      cat?.cover      ?? lb.cover,
      coverType:  cat?.coverType  ?? lb.coverType,
      coverColor: cat?.coverColor ?? lb.coverColor,
      coverAccent:cat?.coverAccent?? lb.coverAccent,
      title:      cat?.title      ?? lb.title,
      author:     cat?.author     ?? lb.author,
      genre:      cat?.genre      ?? lb.genre,
      pages:      cat?.pages      ?? lb.pages,
      readTime:   cat?.readTime   ?? lb.readTime,
      driveUrl:   cat?.driveUrl   ?? lb.driveUrl,
    };
  });

  return (
    <main className="mylib-page">
      <div className="page-header">
        <div className="container" style={{ position: 'relative' }}>
          <h1>My <span className="gold-text">Library</span></h1>
          <p>Welcome back, {user.name}. You have <strong>{library.length}</strong> book{library.length !== 1 ? 's' : ''} in your collection.</p>
          <Link to="/profile" style={{ position:'absolute', top:0, right:0, display:'inline-flex', alignItems:'center', gap:8, background:'rgba(201,168,76,0.12)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:'var(--r-sm)', padding:'8px 16px', color:'var(--gold)', fontSize:'0.82rem', fontWeight:600, textDecoration:'none', transition:'all 0.2s' }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(201,168,76,0.2)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(201,168,76,0.12)'}}>
            👤 My Profile
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ borderBottom:'1px solid var(--dim)', background:'var(--surface)', position:'sticky', top:0, zIndex:10 }}>
        <div className="container" style={{ display:'flex', gap:0 }}>
          {[
            { k:'library',  label:'📚 My Books' },
            { k:'orders',   label:'🛒 Orders' },
            { k:'account',  label:'⚙️ Account' },
          ].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)}
              style={{ padding:'14px 20px', border:'none', background:'none', cursor:'pointer', fontSize:'0.88rem', fontWeight:600, color: activeTab===t.k ? 'var(--gold)' : 'var(--muted)', borderBottom: activeTab===t.k ? '2px solid var(--gold)' : '2px solid transparent', transition:'all 0.2s' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="container">

        {/* ── Library tab ── */}
        {activeTab === 'library' && (
          <>
            {library.length > 0 && (
              <div style={{ background:'rgba(46,204,113,0.07)', border:'1px solid rgba(46,204,113,0.25)', borderLeft:'4px solid var(--ok)', borderRadius:'var(--r-sm)', padding:'12px 18px', marginTop:24, marginBottom:8, fontSize:'0.86rem' }}>
                ✅ <strong style={{ color:'var(--ok)' }}>{library.length} book{library.length !== 1 ? 's' : ''}</strong> in your library — ready to read!
              </div>
            )}
            {library.length === 0 && myPending.length === 0 && (
              <div className="mylib-empty">
                <div style={{ fontSize:'4rem', marginBottom:16 }}>📚</div>
                <h3>Your library is empty</h3>
                <p>Browse and purchase books to start your collection.</p>
                <Link to="/library" className="btn btn-primary">Browse Books</Link>
              </div>
            )}
            {enrichedLibrary.length > 0 && (
              <div className="mylib-grid">
                {enrichedLibrary.map(b => {
                  const isFullOff    = b.active === false;
                  const isReadOff    = b.readDeactivated === true;
                  const isDlOff      = b.downloadDeactivated === true;
                  const reason       = b.deactivationReason || 'Access restricted by administrator.';
                  const canRead      = myPerms?.canReadOnline !== false && !isReadOff && !isFullOff;
                  const canDl        = myPerms?.canDownload   !== false && !isDlOff  && !isFullOff;
                  return (
                    <div key={b.id} className={`mylib-card card${isFullOff ? ' mylib-card--deactivated' : ''}`}>
                      {b.coverType === 'photo' && b.cover
                        ? <img src={b.cover} alt={b.title} className="mylib-card__img" />
                        : <div className="mylib-card__img mylib-card__img--styled" style={{ background: b.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}>
                            <img src="/logo-icon.png" alt="" style={{ width:40, opacity:0.5 }} />
                          </div>
                      }
                      <div className="mylib-card__body">
                        <span className="mylib-card__genre">{b.genre}</span>
                        <h3>{b.title}</h3>
                        <p>by {b.author}</p>
                        <p style={{ color:'var(--muted)', fontSize:'.78rem', margin:'4px 0 14px' }}>
                          {b.pages > 0 ? b.pages + ' pages · ' : ''}{b.readTime}
                        </p>
                        {(isFullOff || isReadOff || isDlOff) && (
                          <div style={{ background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.25)', borderRadius:'var(--r-sm)', padding:'8px 12px', marginBottom:12, fontSize:'0.78rem' }}>
                            <strong style={{ color:'#e74c3c' }}>⚠ Access Restricted</strong>
                            <p style={{ color:'var(--muted)', marginTop:3 }}>{reason}</p>
                          </div>
                        )}
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          {canRead
                            ? <Link to={`/read/${b.id}`} className="btn btn-primary btn-sm">Read Online</Link>
                            : <span className="btn btn-primary btn-sm" style={{ opacity:0.4, cursor:'not-allowed', pointerEvents:'none' }} title={reason}>Read Online</span>
                          }
                          {b.downloadUnlocked && canDl && b.driveUrl
                            ? <a href={toDownloadUrl(b.driveUrl)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">⬇ Download PDF</a>
                            : b.downloadUnlocked && canDl
                              ? <span className="btn btn-outline btn-sm" style={{ opacity:0.6, cursor:'default' }}>PDF Coming Soon</span>
                              : b.downloadUnlocked && !canDl
                                ? <span className="btn btn-outline btn-sm" style={{ opacity:0.4, cursor:'not-allowed', pointerEvents:'none' }} title={reason}>Download Restricted</span>
                                : null
                          }
                        </div>
                        {b.downloadUnlocked && <p className="mylib-license-note">Licensed to {user.name} only</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Orders tab ── */}
        {activeTab === 'orders' && (
          <div style={{ padding:'32px 0 80px' }}>
            <h3 style={{ fontSize:'1rem', marginBottom:20 }}>Your Orders</h3>
            {liveOrders.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--muted)' }}>
                <div style={{ fontSize:'3rem', marginBottom:12 }}>🛒</div>
                <p>No orders yet.</p>
                <Link to="/library" className="btn btn-primary" style={{ marginTop:16, display:'inline-block' }}>Browse Books</Link>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {liveOrders.map(o => (
                  <div key={o.id} className="card" style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', borderLeft: o.status==='Pending' ? '3px solid var(--gold)' : o.status==='Completed' ? '3px solid var(--ok)' : '3px solid var(--err)' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <strong style={{ fontSize:'0.88rem', display:'block' }}>{o.items?.map(i=>i.title).join(', ') || 'Order'}</strong>
                      <span style={{ fontSize:'0.76rem', color:'var(--muted)' }}>{o.id} · {o.date} · {o.method}</span>
                      {o.ref && <span style={{ display:'block', fontSize:'0.76rem', color:'var(--gold)', marginTop:2 }}>Ref: {o.ref}</span>}
                    </div>
                    <strong style={{ color:'var(--gold)', flexShrink:0 }}>KSh {(o.total||0).toLocaleString()}</strong>
                    <span style={{ flexShrink:0, fontSize:'0.75rem', padding:'3px 10px', borderRadius:10, background: o.status==='Completed'?'rgba(46,204,113,0.1)':o.status==='Pending'?'rgba(201,168,76,0.1)':'rgba(231,76,60,0.1)', color: o.status==='Completed'?'var(--ok)':o.status==='Pending'?'var(--gold)':'#e74c3c', border: o.status==='Completed'?'1px solid rgba(46,204,113,0.25)':o.status==='Pending'?'1px solid rgba(201,168,76,0.25)':'1px solid rgba(231,76,60,0.25)' }}>
                      {o.status}
                    </span>
                    {o.status === 'Pending' && (
                      <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hi, I have a pending order ' + o.id + ' for KSh ' + o.total + '. Please verify my payment. Ref: ' + (o.ref||'N/A'))}`}
                        target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ background:'rgba(37,211,102,0.1)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', flexShrink:0, fontSize:'0.76rem' }}>
                        Follow Up
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Account tab ── */}
        {activeTab === 'account' && <AccountSettings user={user} myPerms={myPerms} />}

      </div>
    </main>
  );
}
