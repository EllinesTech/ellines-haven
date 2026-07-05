import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, getDoc, setDoc, serverTimestamp, addDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import UserMessages from '../components/UserMessages';
import { UserNotificationsPanel } from '../components/UserNotifications';
import './UserProfile.css';

const WA = '254748255466';
const AVATAR_COLORS = ['#c9a84c','#4a9eff','#a855f7','#2ecc71','#e8832a','#e74c3c','#06b6d4','#f43f5e'];
const fmtDate = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-KE',{year:'numeric',month:'short',day:'numeric'}); } catch { return d; } };
const fmtDays = ms => Math.max(0, Math.ceil(ms / 86400000));

function avatarColor(name) { return AVATAR_COLORS[(name||'U').charCodeAt(0) % AVATAR_COLORS.length]; }
function initials(name) { return (name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

/* ── Compress image to base64 ── */
function compressAvatar(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      res(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = rej;
    img.src = url;
  });
}

/* ── Notify admins of account deletion via Firestore ── */
async function notifyAdminDeletion(user, scheduledAt) {
  try {
    await setDoc(doc(db, 'admin_notifications', 'del_' + user.email.replace(/[^a-z0-9]/gi,'_')), {
      type:        'account_deletion',
      userEmail:   user.email.toLowerCase(),
      userName:    user.name,
      userId:      user.id,
      scheduledAt: scheduledAt,
      deletedAt:   serverTimestamp(),
      status:      'pending_deletion',
      message:     `User "${user.name}" (${user.email}) requested account deletion. Auto-deletes in 30 days.`,
      read:        false,
    });
  } catch {}
}

/* ── Direct Message to Admin ── */
function MessageAdminForm({ user, showToast }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);

  const send = async () => {
    if (!subject.trim() || !message.trim()) { showToast('Please fill subject and message', 'err'); return; }
    setSending(true);
    try {
      const emailLower = user.email.toLowerCase().trim();
      const id = 'direct_' + Date.now() + '_' + emailLower.replace(/[^a-z0-9]/g,'_');
      await setDoc(doc(db, 'contact_messages', id), {
        name:       user.name,
        email:      emailLower,           // always lowercase so the query matches
        subject:    subject.trim(),
        message:    message.trim(),
        type:       'direct',
        userId:     user.id || '',
        status:     'new',
        threadId:   id,                   // required for thread to load
        createdAt:  serverTimestamp(),
        lastMsg:    message.trim().slice(0, 80),
        lastMsgAt:  serverTimestamp(),
        lastSender: 'user',
        userRead:   true,
        source:     'user_profile',
      });
      // seed first message into subcollection so thread loads immediately
      await addDoc(collection(db, 'contact_messages', id, 'messages'), {
        text:        message.trim(),
        sender:      'user',
        senderName:  user.name,
        senderEmail: emailLower,
        createdAt:   serverTimestamp(),
      });
      setSent(true); setSubject(''); setMessage('');
      showToast('✅ Message sent to admin!');
      setTimeout(() => setSent(false), 4000);
    } catch(e) { showToast('❌ ' + e.message, 'err'); }
    setSending(false);
  };

  if (sent) return (
    <div style={{padding:'14px 16px',background:'rgba(46,204,113,0.08)',border:'1px solid rgba(46,204,113,0.25)',borderRadius:'var(--r-sm)',display:'flex',gap:10,alignItems:'center'}}>
      <span style={{fontSize:'1.4rem'}}>✅</span>
      <div><strong style={{color:'var(--ok)',display:'block'}}>Message sent!</strong><span style={{fontSize:'0.8rem',color:'var(--muted)'}}>Admin will reply within 24 hours. Check your email.</span></div>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <input className="field" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject — What do you need help with?" style={{maxWidth:480}} />
      <textarea className="field" rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Describe your issue or question in detail…" style={{resize:'vertical',maxWidth:480}} />
      <div>
        <button className="btn btn-primary btn-sm" onClick={send} disabled={sending||!subject.trim()||!message.trim()}>
          {sending ? '⏳ Sending…' : '📤 Send Message'}
        </button>
        <span style={{fontSize:'0.72rem',color:'var(--muted)',marginLeft:12}}>Goes directly to admin inbox · Usually replied within 24hrs</span>
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { user, setUser, logout, library, orders } = useApp();
  const navigate  = useNavigate();
  const avatarRef = useRef(null);

  const [form,       setForm]       = useState({ name:'', phone:'', bio:'', location:'' });
  const [avatar,     setAvatar]     = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [pw,         setPw]         = useState({ current:'', next:'', confirm:'' });
  const [pwMsg,      setPwMsg]      = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [prefs,      setPrefs]      = useState(() => { try { return JSON.parse(localStorage.getItem('eh_prefs')||'{}'); } catch { return {}; } });
  const [tab,        setTab]        = useState('account');
  const [toast,      setToast]      = useState('');
  const [toastType,  setToastType]  = useState('ok');
  const [delStep,    setDelStep]    = useState(0); // 0=idle 1=warn 2=confirm
  const [delBusy,    setDelBusy]    = useState(false);

  /* Pending deletion state */
  const [pendingDel, setPendingDel] = useState(null); // { scheduledAt, daysLeft }

  /* Unread notification count */
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const showToast = (msg, type='ok') => { setToast(msg); setToastType(type); setTimeout(()=>setToast(''),3500); };

  useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);

  /* Load saved profile + avatar + pending deletion from Firestore */
  useEffect(() => {
    if (!user?.email) return;
    getDoc(doc(db,'user_profiles',user.email.toLowerCase())).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setForm({ name: d.name||user.name||'', phone: d.phone||'', bio: d.bio||'', location: d.location||'' });
      if (d.avatar) setAvatar(d.avatar);
      if (d.pendingDeletion) {
        const ms = d.pendingDeletion.toMillis ? d.pendingDeletion.toMillis() : d.pendingDeletion;
        const daysLeft = fmtDays(ms - Date.now());
        if (daysLeft > 0) setPendingDel({ scheduledAt: ms, daysLeft });
        else setPendingDel(null);
      }
    }).catch(()=>{});
  }, [user?.email]);

  /* Live unread notification count */
  useEffect(() => {
    if (!user?.email) return;
    const q = query(
      collection(db, 'user_notifications'),
      where('userEmail', '==', user.email.toLowerCase()),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, snap => {
      setUnreadNotifs(snap.size);
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  if (!user) return null;

  const booksOwned  = library?.length || 0;
  const ordersCount = (orders||[]).filter(o=>o.userEmail===user?.email?.toLowerCase()).length;
  const completedOrders = (orders||[]).filter(o=>o.userEmail===user?.email?.toLowerCase()&&o.status==='Completed');
  const totalSpent  = completedOrders.reduce((s,o)=>s+Number(o.total||0),0);
  const memberSince = user.joined ? fmtDate(user.joined) : 'Recently';

  /* ── Upload avatar ── */
  const handleAvatarChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { showToast('JPG, PNG or WebP only','err'); return; }
    setAvatarBusy(true);
    try {
      const b64 = await compressAvatar(file);
      setAvatar(b64);
      await setDoc(doc(db,'user_profiles',user.email.toLowerCase()), { avatar:b64, updatedAt:serverTimestamp() }, {merge:true});
      showToast('✅ Photo updated');
    } catch { showToast('Upload failed','err'); }
    setAvatarBusy(false);
  };

  /* ── Save profile ── */
  const saveProfile = async () => {
    if (!form.name.trim()) { showToast('Name cannot be empty','err'); return; }
    setSaving(true);
    const updated = { ...user, name:form.name, phone:form.phone, bio:form.bio, location:form.location };
    setUser(updated);
    try {
      await setDoc(doc(db,'user_profiles',user.email.toLowerCase()),
        { name:form.name, phone:form.phone, bio:form.bio, location:form.location, updatedAt:serverTimestamp() }, {merge:true});
      showToast('✅ Profile saved!');
    } catch { showToast('✅ Saved locally'); }
    setSaving(false);
  };

  /* ── Change password ── */
  const changePassword = () => {
    if (!pw.current||!pw.next||!pw.confirm) { setPwMsg('Fill all fields'); return; }
    if (pw.next !== pw.confirm) { setPwMsg('Passwords do not match'); return; }
    if (pw.next.length < 4)    { setPwMsg('Minimum 4 characters'); return; }
    const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides')||'{}');
    const stored = overrides[user.email.toLowerCase()] || user.password || '';
    if (pw.current !== stored && pw.current !== user.password) { setPwMsg('Current password is incorrect'); return; }
    overrides[user.email.toLowerCase()] = pw.next;
    localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));
    setPw({ current:'', next:'', confirm:'' }); setPwMsg('');
    showToast('✅ Password updated');
  };

  /* ── Preferences ── */
  const savePrefs = patch => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem('eh_prefs', JSON.stringify(next));
  };

  /* ── Soft delete — 30-day grace period ── */
  const requestDeletion = async () => {
    setDelBusy(true);
    try {
      const scheduledAt = Date.now() + 30 * 86400000; // 30 days from now
      await setDoc(doc(db,'user_profiles',user.email.toLowerCase()),
        { pendingDeletion: scheduledAt, deletionRequestedAt: serverTimestamp(), status:'pending_deletion' }, {merge:true});
      await notifyAdminDeletion(user, scheduledAt);
      setPendingDel({ scheduledAt, daysLeft: 30 });
      setDelStep(0);
      showToast('Account scheduled for deletion in 30 days');
      logout();
      navigate('/');
    } catch (e) { showToast('Error: ' + e.message, 'err'); }
    setDelBusy(false);
  };

  /* ── Cancel pending deletion ── */
  const cancelDeletion = async () => {
    try {
      await setDoc(doc(db,'user_profiles',user.email.toLowerCase()),
        { pendingDeletion:null, status:'active', restoredAt:serverTimestamp() }, {merge:true});
      // Remove from admin notifications
      await setDoc(doc(db,'admin_notifications','del_'+user.email.replace(/[^a-z0-9]/gi,'_')),
        { status:'restored', read:true }, {merge:true});
      setPendingDel(null);
      showToast('✅ Deletion cancelled — your account is fully restored');
    } catch (e) { showToast('Error: ' + e.message,'err'); }
  };

  /* SVG icons — stroke-based, inherit currentColor */
  const NAV_ICONS = {
    account: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
    library: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v15"/><path d="M4 19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1"/><path d="M8 7h6M8 11h6"/>
      </svg>
    ),
    activity: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    ),
    notifications: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    messages: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    password: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    prefs: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
    contact: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.36 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
    danger: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  };

  /* Stats strip icons */
  const STAT_ICONS = {
    books: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v15"/><path d="M4 19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1"/>
      </svg>
    ),
    orders: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    ),
    spent: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    status: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  };

  const TABS = [
    ['account',       NAV_ICONS.account,       'Profile'],
    ['library',       NAV_ICONS.library,       'My Books'],
    ['activity',      NAV_ICONS.activity,      'Orders'],
    ['notifications', NAV_ICONS.notifications, unreadNotifs > 0 ? `Notifications (${unreadNotifs})` : 'Notifications'],
    ['messages',      NAV_ICONS.messages,      'Messages'],
    ['password',      NAV_ICONS.password,      'Security'],
    ['prefs',         NAV_ICONS.prefs,         'Settings'],
    ['contact',       NAV_ICONS.contact,       'Contact'],
    ['danger',        NAV_ICONS.danger,        'Danger'],
  ];

  return (
    <div className="up-root">
      {/* Toast */}
      {toast && (
        <div className={`up-toast up-toast--${toastType}`}>{toast}</div>
      )}

      {/* ── Hero Header ── */}
      <div className="up-hero">
        <div className="up-hero__glow" />
        <div className="up-hero__inner">

          {/* Avatar upload */}
          <div className="up-avatar-wrap" onClick={()=>!avatarBusy&&avatarRef.current?.click()} title="Click to change photo">
            {avatar
              ? <img src={avatar} alt={user.name} className="up-avatar-img" />
              : <div className="up-avatar-initials" style={{ background: avatarColor(user.name) }}>
                  {initials(user.name)}
                </div>
            }
            <div className="up-avatar-overlay">
              {avatarBusy ? <span className="up-avatar-spinner" /> : <span className="up-avatar-cam">📷</span>}
            </div>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}} onChange={handleAvatarChange} />
          </div>

          {/* Info */}
          <div className="up-hero__info">
            <div className="up-hero__name">{user.name || 'Reader'}</div>
            <div className="up-hero__email">{user.email}</div>
            {form.location && <div className="up-hero__loc">📍 {form.location}</div>}
            <div className="up-hero__badges">
              <span className={`up-role-badge up-role-${user.role||'user'}`}>{user.role||'reader'}</span>
              <span className="up-hero__since">Member since {memberSince}</span>
              {pendingDel && (
                <span className="up-hero__del-warn">⚠️ Deletion in {pendingDel.daysLeft}d</span>
              )}
            </div>
          </div>

          {/* Hero quick actions */}
          <div className="up-hero__actions">
            <a href={`https://wa.me/${WA}?text=${encodeURIComponent('Hi Ellines Haven, I need help with my account: ' + user.email)}`}
              target="_blank" rel="noopener noreferrer" className="btn btn-sm up-hero__wa-btn">
              💬 WhatsApp Support
            </a>
            <Link to="/my-library" className="btn btn-ghost btn-sm">📚 My Library</Link>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="up-stats">
        {[
          { n: booksOwned,   l:'Books Owned',  icon: STAT_ICONS.books  },
          { n: ordersCount,  l:'Orders',        icon: STAT_ICONS.orders },
          { n:`KSh ${totalSpent.toLocaleString()}`, l:'Total Spent', icon: STAT_ICONS.spent },
          { n: booksOwned > 0 ? 'Active' : '—', l:'Status', icon: STAT_ICONS.status },
        ].map(s => (
          <div key={s.l} className="up-stat">
            <span className="up-stat-icon">{s.icon}</span>
            <span className="up-stat-num">{s.n}</span>
            <span className="up-stat-label">{s.l}</span>
          </div>
        ))}
      </div>

      {/* ── Pending deletion banner ── */}
      {pendingDel && (
        <div className="up-del-banner">
          <span className="up-del-banner__icon">⚠️</span>
          <div className="up-del-banner__text">
            <strong>Account deletion scheduled</strong>
            <span>Your account will be permanently deleted in <strong>{pendingDel.daysLeft} days</strong>. You can cancel this anytime before then.</span>
          </div>
          <button className="btn btn-sm up-del-banner__btn" onClick={cancelDeletion}>
            ↩ Cancel Deletion
          </button>
        </div>
      )}

      <div className="up-layout">
        {/* ── Sidebar tabs ── */}
        <nav className="up-nav">
          {TABS.map(([t, icon, label]) => (
            <button key={t} className={`up-nav-btn${tab===t?' up-nav-btn--active':''}`} onClick={()=>setTab(t)}>
              <span className="up-nav-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* ── Content ── */}
        <div className="up-content">

          {/* ── PROFILE TAB ── */}
          {tab === 'account' && (
            <div className="up-panel">
              <div className="up-panel__head">
                <h2>Profile Details</h2>
                <span>How others see you on Ellines Haven</span>
              </div>
              <div className="up-form-grid">
                <div className="up-field">
                  <label>Display Name *</label>
                  <input className="field" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Your full name" />
                </div>
                <div className="up-field">
                  <label>Email <span className="up-readonly">(read-only)</span></label>
                  <input className="field" value={user.email} readOnly style={{opacity:0.5,cursor:'not-allowed'}} />
                </div>
                <div className="up-field">
                  <label>Phone Number</label>
                  <input className="field" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+254 7xx xxx xxx" />
                </div>
                <div className="up-field">
                  <label>Location</label>
                  <input className="field" value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} placeholder="e.g. Nairobi, Kenya" />
                </div>
                <div className="up-field up-field--full">
                  <label>About Me</label>
                  <textarea className="field" rows={3} value={form.bio} onChange={e=>setForm(p=>({...p,bio:e.target.value}))} placeholder="A short bio — your favourite genre, reading goals…" style={{resize:'vertical'}} />
                </div>
              </div>
              <div className="up-panel__footer">
                <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
                  {saving ? '⏳ Saving…' : '💾 Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* ── MY BOOKS TAB ── */}
          {tab === 'library' && (
            <div className="up-panel">
              <div className="up-panel__head">
                <h2>My Books</h2>
                <span>{booksOwned} book{booksOwned!==1?'s':''} in your collection</span>
              </div>
              {booksOwned === 0 ? (
                <div className="up-empty">
                  <div className="up-empty__icon">📚</div>
                  <h3>No books yet</h3>
                  <p>Browse the library and start your collection.</p>
                  <Link to="/library" className="btn btn-primary">Browse Books →</Link>
                </div>
              ) : (
                <div className="up-books-grid">
                  {library.map(b => (
                    <Link key={b.id} to={`/read/${b.id}`} className="up-book-card">
                      {b.cover && b.coverType==='photo'
                        ? <img src={b.cover} alt={b.title} className="up-book-card__img" />
                        : <div className="up-book-card__img up-book-card__img--styled" style={{background:b.coverColor||'linear-gradient(145deg,#0f0f22,#1a1a3a)'}} />
                      }
                      <div className="up-book-card__info">
                        <span className="up-book-card__title">{b.title}</span>
                        <span className="up-book-card__cta">Read Now →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ORDERS TAB ── */}
          {tab === 'activity' && (
            <div className="up-panel">
              <div className="up-panel__head">
                <h2>Order History</h2>
                <span>{ordersCount} order{ordersCount!==1?'s':''} placed</span>
              </div>
              {completedOrders.length === 0 ? (
                <div className="up-empty">
                  <div className="up-empty__icon">🛒</div>
                  <h3>No orders yet</h3>
                  <p>Your completed purchases will appear here.</p>
                  <Link to="/library" className="btn btn-primary">Browse Books →</Link>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {completedOrders.map(order => (
                    <div key={order.id} className="up-order-row">
                      <div className="up-order-row__dot" />
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:'0.88rem',marginBottom:2}}>
                          {(order.items||[]).map(i=>i.title).join(', ')||'Order'}
                        </div>
                        <div style={{fontSize:'0.75rem',color:'var(--muted)'}}>
                          {fmtDate(order.date||order.createdAt)} · {order.method} · <strong style={{color:'var(--gold)'}}>KSh {order.total}</strong>
                        </div>
                      </div>
                      <span className="up-order-row__status">✅ Completed</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SECURITY TAB ── */}
          {tab === 'password' && (
            <div className="up-panel">
              <div className="up-panel__head">
                <h2>Security</h2>
                <span>Manage your password and account access</span>
              </div>
              {pwMsg && (
                <div className={`up-pw-msg${pwMsg.startsWith('✅')?' up-pw-msg--ok':''}`}>{pwMsg}</div>
              )}
              <div className="up-form-grid">
                <div className="up-field up-field--full">
                  <label>Current Password</label>
                  <div className="up-pw-wrap">
                    <input type={showPw?'text':'password'} className="field" value={pw.current}
                      onChange={e=>setPw(p=>({...p,current:e.target.value}))} placeholder="Your current password" />
                    <button type="button" className="up-pw-eye" onClick={()=>setShowPw(v=>!v)}>{showPw?'🙈':'👁️'}</button>
                  </div>
                </div>
                <div className="up-field">
                  <label>New Password</label>
                  <input type={showPw?'text':'password'} className="field" value={pw.next}
                    onChange={e=>setPw(p=>({...p,next:e.target.value}))} placeholder="Minimum 4 characters" />
                </div>
                <div className="up-field">
                  <label>Confirm New Password</label>
                  <input type={showPw?'text':'password'} className="field" value={pw.confirm}
                    onChange={e=>setPw(p=>({...p,confirm:e.target.value}))} placeholder="Repeat new password" />
                </div>
              </div>
              <div className="up-panel__footer">
                <button className="btn btn-primary" onClick={changePassword}>🔑 Update Password</button>
              </div>

              {/* Account info security */}
              <div className="up-security-info">
                <div className="up-security-item">
                  <span className="up-security-item__icon">✅</span>
                  <div><strong>Email Verified</strong><span>{user.email}</span></div>
                </div>
                <div className="up-security-item">
                  <span className="up-security-item__icon">📱</span>
                  <div><strong>Phone</strong><span>{form.phone||'Not set — add in Profile tab'}</span></div>
                </div>
                <div className="up-security-item">
                  <span className="up-security-item__icon">📅</span>
                  <div><strong>Account Created</strong><span>{memberSince}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* ── SETTINGS TAB ── */}
          {tab === 'prefs' && (
            <div className="up-panel">
              <div className="up-panel__head">
                <h2>Preferences</h2>
                <span>Personalise your Ellines Haven experience</span>
              </div>
              {[
                { key:'emailNotifs',   label:'New Release Alerts',    desc:'Get notified when new books are published',   def:true  },
                { key:'orderUpdates',  label:'Order Status Updates',  desc:'Updates when your payment is verified',       def:true  },
                { key:'promoAlerts',   label:'Promotions & Discounts',desc:'Exclusive deals and promo codes',             def:false },
                { key:'autoProgress',  label:'Auto-advance Chapters', desc:'Scroll to next chapter automatically',        def:false },
              ].map(item => (
                <div key={item.key} className="up-pref-row">
                  <div>
                    <div className="up-pref-label">{item.label}</div>
                    <div className="up-pref-desc">{item.desc}</div>
                  </div>
                  <button className="up-toggle"
                    style={{ background: (prefs[item.key]??item.def) ? 'var(--gold)' : 'rgba(255,255,255,0.12)' }}
                    onClick={() => savePrefs({ [item.key]: !(prefs[item.key]??item.def) })}>
                    <span className="up-toggle-dot" style={{ left: (prefs[item.key]??item.def) ? 22 : 2 }} />
                  </button>
                </div>
              ))}
              <div className="up-pref-row">
                <div>
                  <div className="up-pref-label">Reader Font Size</div>
                  <div className="up-pref-desc">Default text size in the online reader</div>
                </div>
                <div style={{display:'flex',gap:6}}>
                  {['small','medium','large'].map(s => (
                    <button key={s} onClick={()=>savePrefs({fontSize:s})}
                      className={(prefs.fontSize===s||(!prefs.fontSize&&s==='medium'))?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'}
                      style={{textTransform:'capitalize',fontSize:'0.78rem'}}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="up-pref-row" style={{borderBottom:'none'}}>
                <div>
                  <div className="up-pref-label">Theme</div>
                  <div className="up-pref-desc">Dark mode is always on — it&apos;s better this way ✨</div>
                </div>
                <button className="up-toggle" style={{background:'var(--gold)',cursor:'not-allowed',opacity:0.7}}>
                  <span className="up-toggle-dot" style={{left:22}} />
                </button>
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS TAB ── */}
          {tab === 'notifications' && (
            <div className="up-panel">
              <UserNotificationsPanel user={user} />
            </div>
          )}

          {/* ── MESSAGES TAB ── */}
          {tab === 'messages' && (
            <div className="up-panel" style={{ padding: 0, overflow: 'hidden' }}>
              <UserMessages user={user} />
            </div>
          )}

          {/* ── CONTACT TAB ── */}
          {tab === 'contact' && (
            <div className="up-panel">
              <div className="up-panel__head">
                <h2>Contact &amp; Messages</h2>
                <span>Talk to us directly or use the channels below</span>
              </div>

              {/* Full two-way chat with admin */}
              <div style={{ padding: '0 0 20px 0' }}>
                <UserMessages user={user} />
              </div>

              {/* Contact cards */}
              <div className="up-contact-grid" style={{padding:'20px 24px'}}>
                <a href={`https://wa.me/${WA}?text=${encodeURIComponent('Hi Ellines Haven, I need help: ')}`}
                  target="_blank" rel="noopener noreferrer" className="up-contact-card up-contact-card--wa">
                  <span className="up-contact-card__icon">💬</span>
                  <div><strong>WhatsApp</strong><span>0748 255 466 — Fast replies</span></div>
                  <span className="up-contact-card__arrow">→</span>
                </a>
                <a href="mailto:ellines.haven@gmail.com" className="up-contact-card">
                  <span className="up-contact-card__icon">📧</span>
                  <div><strong>Email</strong><span>ellines.haven@gmail.com</span></div>
                  <span className="up-contact-card__arrow">→</span>
                </a>
                <a href="tel:+254748255466" className="up-contact-card">
                  <span className="up-contact-card__icon">📞</span>
                  <div><strong>Phone</strong><span>0748 255 466</span></div>
                  <span className="up-contact-card__arrow">→</span>
                </a>
                <Link to="/contact" className="up-contact-card">
                  <span className="up-contact-card__icon">✉️</span>
                  <div><strong>Contact Form</strong><span>Send a detailed message</span></div>
                  <span className="up-contact-card__arrow">→</span>
                </Link>
                <Link to="/faq" className="up-contact-card">
                  <span className="up-contact-card__icon">❓</span>
                  <div><strong>FAQ</strong><span>Quick answers</span></div>
                  <span className="up-contact-card__arrow">→</span>
                </Link>
                <a href={`https://wa.me/${WA}?text=${encodeURIComponent('Hi Ellines Haven, I have an issue with my order. My email is: ' + user.email)}`}
                  target="_blank" rel="noopener noreferrer" className="up-contact-card">
                  <span className="up-contact-card__icon">🛒</span>
                  <div><strong>Order Support</strong><span>Payment or access issues</span></div>
                  <span className="up-contact-card__arrow">→</span>
                </a>
              </div>
              <div className="up-contact-hours">
                <span>⏰</span>
                <span>Mon–Sat, 8am–8pm EAT · WhatsApp: usually within 1 hour · Direct message: within 24 hours</span>
              </div>
            </div>
          )}

          {/* ── DANGER TAB ── */}
          {tab === 'danger' && (
            <div className="up-panel up-panel--danger">
              <div className="up-panel__head">
                <h2 style={{color:'var(--err)'}}>⚠️ Danger Zone</h2>
                <span>Irreversible actions — proceed with caution</span>
              </div>

              {pendingDel ? (
                <div className="up-danger-pending">
                  <div className="up-danger-pending__icon">⏳</div>
                  <h3>Deletion Scheduled</h3>
                  <p>Your account is set to be permanently deleted in <strong style={{color:'#e74c3c'}}>{pendingDel.daysLeft} days</strong>.</p>
                  <p style={{fontSize:'0.82rem',color:'var(--muted)',marginTop:6}}>
                    All your books and data will be erased on {fmtDate(pendingDel.scheduledAt)}. You can cancel this below.
                  </p>
                  <button className="btn btn-primary" style={{marginTop:16}} onClick={cancelDeletion}>
                    ↩ Cancel — Keep My Account
                  </button>
                </div>
              ) : (
                <>
                  <div className="up-danger-info">
                    <p>When you delete your account:</p>
                    <ul>
                      <li>You will be logged out immediately</li>
                      <li>Your account is scheduled for permanent deletion after <strong>30 days</strong></li>
                      <li>You can log back in and cancel within that period to restore everything</li>
                      <li>After 30 days, all data — library, orders, profile — is permanently erased</li>
                      <li>The Ellines Haven admin team will be notified of your request</li>
                    </ul>
                  </div>

                  {delStep === 0 && (
                    <button className="up-danger-btn" onClick={()=>setDelStep(1)}>
                      🗑️ Request Account Deletion
                    </button>
                  )}

                  {delStep === 1 && (
                    <div className="up-danger-step">
                      <div className="up-danger-step__warn">
                        <strong>⚠️ Are you sure?</strong>
                        <p>This will schedule your account for deletion. You have 30 days to change your mind.</p>
                      </div>
                      <div style={{display:'flex',gap:10,marginTop:14}}>
                        <button className="up-danger-btn" onClick={()=>setDelStep(2)}>Yes, I understand — continue</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setDelStep(0)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {delStep === 2 && (
                    <div className="up-danger-step">
                      <div className="up-danger-step__confirm">
                        <strong>Final confirmation</strong>
                        <p>You will be signed out. Log back in within 30 days to cancel the deletion.</p>
                      </div>
                      <div style={{display:'flex',gap:10,marginTop:14}}>
                        <button className="up-danger-btn" onClick={requestDeletion} disabled={delBusy}>
                          {delBusy ? '⏳ Processing…' : '🗑️ Delete My Account'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setDelStep(0)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
