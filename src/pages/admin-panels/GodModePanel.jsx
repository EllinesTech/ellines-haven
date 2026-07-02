import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, serverTimestamp, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

/* ── Merge two user lists, deduped by email, Firestore wins for conflicts ── */
function mergeUserLists(propUsers, fsUsers) {
  const map = new Map();
  // Local/prop users go in first (lower priority)
  (propUsers || []).forEach(u => {
    if (u.email) map.set(u.email.toLowerCase(), u);
  });
  // Firestore users override — they are authoritative
  (fsUsers || []).forEach(u => {
    if (u.email) {
      const key = u.email.toLowerCase();
      const existing = map.get(key) || {};
      map.set(key, { ...existing, ...u });
    }
  });
  return Array.from(map.values());
}

const TABS = ['overview','users','deletions','mass','database','emergency'];
const TAB_LABELS = { overview:'Overview', users:'User Control', deletions:'Pending Deletions', mass:'Mass Actions', database:'Database', emergency:'Emergency' };
const COLLS = ['site_data','orders','libraries','contact_messages','user_profiles','reviews','admin_notifications'];
const libDocId = e => (e||'').toLowerCase().replace(/[^a-z0-9]/g,'_');

function ConfirmGate({ label, onConfirm, onCancel }) {
  const [val, setVal] = useState('');
  return (
    <div className="adm-overlay">
      <div className="adm-confirm card" style={{maxWidth:420}}>
        <h3 style={{color:'var(--err)',marginBottom:10}}>⚠️ Confirm</h3>
        <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:12}}>{label}</p>
        <p style={{fontSize:'0.8rem',marginBottom:8}}>Type <strong style={{color:'var(--gold)'}}>CONFIRM</strong>:</p>
        <input className="field" value={val} onChange={e=>setVal(e.target.value)} placeholder="CONFIRM" style={{marginBottom:14}} autoFocus />
        <div className="adm-confirm-btns">
          <button className="btn btn-primary btn-sm" disabled={val!=='CONFIRM'} onClick={onConfirm} style={{background:val==='CONFIRM'?'var(--err)':''}}>Proceed</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function GodModePanel({ showToast, books, users: propUsers, isSuper }) {
  const { user, setUser, saveBook, setSuspended, isUserSuspended, manualUnlock } = useApp();
  const [tab, setTab] = useState('overview');
  const [godLog, setGodLog] = useState(false);
  const [confirmGate, setConfirmGate] = useState(null);
  const [impersonating, setImpersonating] = useState(null);
  const [adminSession, setAdminSession] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userLibrary, setUserLibrary] = useState([]);
  const [editFields, setEditFields] = useState({});
  const [newPw, setNewPw] = useState('');
  const [newRole, setNewRole] = useState('');
  const [pendingDels, setPendingDels] = useState([]);
  const [collDocs, setCollDocs] = useState([]);
  const [selectedColl, setSelectedColl] = useState('site_data');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docJson, setDocJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [recentLogs, setRecentLogs] = useState([]);
  const [adminStats, setAdminStats] = useState({ users:0, suspended:0, deletions:0 });
  const [selectedBook, setSelectedBook] = useState('');
  const [transferEmail, setTransferEmail] = useState('');

  // ── Live Firestore users ─────────────────────────────────────────────────
  const [fsUsers, setFsUsers] = useState([]);
  const [fsUsersLoading, setFsUsersLoading] = useState(true);

  useEffect(() => {
    setFsUsersLoading(true);
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFsUsers(fetched);
      setFsUsersLoading(false);
    }, () => setFsUsersLoading(false));
    return () => unsub();
  }, []);

  // Merge Firestore users + prop users + localStorage — deduplicated, Firestore wins
  const allUsers = mergeUserLists(
    [
      ...(propUsers || []),
      ...JSON.parse(localStorage.getItem('eh_registered_users') || '[]'),
    ],
    fsUsers
  ).filter((u, i, a) => a.findIndex(x => x.email?.toLowerCase() === u.email?.toLowerCase()) === i);

  const filtered = allUsers.filter(u =>
    !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  useEffect(()=>{
    // Load recent admin logs
    try {
      const q = query(collection(db,'admin_logs'), orderBy('ts','desc'), limit(20));
      const unsub = onSnapshot(q, snap=>{
        setRecentLogs(snap.docs.map(d=>({id:d.id,...d.data()})));
      }, ()=>{});
      return ()=>unsub();
    } catch {}
  },[]);

  useEffect(()=>{
    setAdminStats(s=>({...s, users:allUsers.length, suspended:allUsers.filter(u=>isUserSuspended?.(u.email)).length}));
  },[allUsers.length]); // eslint-disable-line

  useEffect(()=>{
    // Load pending deletions from user_profiles
    getDocs(collection(db,'user_profiles')).then(snap=>{
      const dels = [];
      snap.forEach(d=>{
        const data = d.data();
        if (data.pendingDeletion) {
          const ms = typeof data.pendingDeletion === 'number' ? data.pendingDeletion : data.pendingDeletion?.toMillis?.() || 0;
          const daysLeft = Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
          if (daysLeft > 0) dels.push({ email:d.id, name:data.name||d.id, daysLeft, scheduledAt:ms, data });
          else if (daysLeft <= 0 && ms > 0) dels.push({ email:d.id, name:data.name||d.id, daysLeft:0, scheduledAt:ms, data, overdue:true });
        }
      });
      setPendingDels(dels);
      setAdminStats(s=>({...s, deletions:dels.length}));
    }).catch(()=>{});
    setAdminStats(s=>({...s, users:allUsers.length, suspended:allUsers.filter(u=>isUserSuspended?.(u.email)).length}));
  },[]);

  const selectUser = async u => {
    setSelectedUser(u); setEditFields({name:u.name||'',phone:'',bio:'',location:''}); setNewPw('');
    setNewRole(u.role||'user'); setUserLibrary([]);
    try {
      const snap = await getDoc(doc(db,'user_profiles',u.email.toLowerCase()));
      if (snap.exists()) { const d=snap.data(); setUserProfile(d); setEditFields(e=>({...e,name:d.name||u.name||'',phone:d.phone||'',bio:d.bio||'',location:d.location||''})); }
      const libSnap = await getDoc(doc(db,'libraries',libDocId(u.email)));
      if (libSnap.exists()) setUserLibrary(libSnap.data().books||[]);
    } catch {}
  };

  const saveUserProfile = async () => {
    if (!selectedUser) return; setSaving(true);
    try {
      await setDoc(doc(db,'user_profiles',selectedUser.email.toLowerCase()), {...editFields, updatedAt:serverTimestamp()},{merge:true});
      if (newPw.length >= 4) {
        const ov = JSON.parse(localStorage.getItem('eh_pw_overrides')||'{}');
        ov[selectedUser.email.toLowerCase()] = newPw;
        localStorage.setItem('eh_pw_overrides', JSON.stringify(ov));
        // Write directly to Firestore users/{id} — this is what Login checks first on any device
        try {
          const userId = selectedUser.id || selectedUser.email.toLowerCase().replace(/[^a-z0-9]/g,'_');
          await setDoc(doc(db,'users',userId), { passwordHash: newPw, updatedAt: serverTimestamp() }, { merge: true });
        } catch {}
        // Also sync pwOverrides into registered_users with merge:true (never wipe the whole doc)
        try {
          await setDoc(doc(db,'site_data','registered_users'), { pwOverrides: ov, updatedAt: serverTimestamp() }, { merge: true });
        } catch {}
      }
      if (newRole !== selectedUser.role) {
        // Persist role to Firestore (not just localStorage)
        const regSnap = await getDoc(doc(db,'site_data','registered_users')).catch(()=>null);
        if (regSnap?.exists()) {
          const reg = (regSnap.data().registered||[]).map(r =>
            r.email?.toLowerCase() === selectedUser.email.toLowerCase() ? {...r, role:newRole} : r
          );
          const roleOv = regSnap.data().roleOverrides || {};
          roleOv[selectedUser.email.toLowerCase()] = newRole;
          await setDoc(doc(db,'site_data','registered_users'),{registered:reg, roleOverrides:roleOv, updatedAt:serverTimestamp()},{merge:true});
        }
        // Also update Firestore users collection
        try { await setDoc(doc(db,'users',selectedUser.id||selectedUser.email.replace(/[^a-z0-9]/g,'_')),{role:newRole},{merge:true}); } catch {}
        const ro = JSON.parse(localStorage.getItem('eh_role_overrides')||'{}');
        ro[selectedUser.email.toLowerCase()] = newRole;
        localStorage.setItem('eh_role_overrides', JSON.stringify(ro));
      }
      await logAction('user_edit','Edited user: '+selectedUser.email);
      showToast?.('✅ User updated');
    } catch(e){ showToast?.('❌ '+e.message); }
    setSaving(false);
  };

  const unlockBook = async () => {
    if (!selectedUser||!selectedBook) return;
    const book = books?.find(b=>b.id===selectedBook);
    if (book) { await manualUnlock?.(selectedUser.email, book.id); setUserLibrary(l=>[...l,{...book,downloadUnlocked:true}]); showToast?.('✅ Book unlocked'); }
  };

  const removeBook = async (bookId) => {
    if (!selectedUser) return;
    const ref = doc(db,'libraries',libDocId(selectedUser.email));
    const updated = userLibrary.filter(b=>b.id!==bookId);
    await setDoc(ref,{books:updated},{merge:true}); setUserLibrary(updated); showToast?.('Book removed');
  };

  const restoreAccount = async (email) => {
    await setDoc(doc(db,'user_profiles',email),{pendingDeletion:null,status:'active',restoredAt:serverTimestamp()},{merge:true});
    setPendingDels(p=>p.filter(d=>d.email!==email)); showToast?.('✅ Account restored: '+email);
  };

  const forceDeleteUser = async (email) => {
    await setDoc(doc(db,'user_profiles',email),{status:'deleted',deletedAt:serverTimestamp()},{merge:true});
    const del = JSON.parse(localStorage.getItem('eh_deleted_users')||'[]');
    del.push(email.toLowerCase()); localStorage.setItem('eh_deleted_users',JSON.stringify(del));
    setPendingDels(p=>p.filter(d=>d.email!==email)); showToast?.('🗑 Account deleted: '+email);
  };

  const impersonate = u => { setAdminSession({...user}); setUser({...u}); localStorage.setItem('eh_user',JSON.stringify(u)); setImpersonating(u); showToast?.('👤 Impersonating '+u.name); };
  const exitImpersonation = () => { if(adminSession){setUser({...adminSession});localStorage.setItem('eh_user',JSON.stringify(adminSession));} setImpersonating(null);setAdminSession(null);showToast?.('✅ Back to admin'); };

  const logAction = async (type, action) => {
    if (!godLog) return;
    try { await setDoc(doc(db,'admin_logs','a_'+Date.now()),{type,action,admin:user?.email,ts:serverTimestamp()}); } catch {}
  };

  const loadColl = async () => {
    setLoading(true); setCollDocs([]); setSelectedDoc(null); setDocJson('');
    const snap = await getDocs(collection(db,selectedColl)).catch(()=>null);
    if (snap) { const d=[]; snap.forEach(doc=>d.push({id:doc.id,data:doc.data()})); setCollDocs(d); }
    setLoading(false);
  };

  const saveDoc = async () => {
    setSaving(true);
    try { const p=JSON.parse(docJson); await setDoc(doc(db,selectedColl,selectedDoc),{...p,updatedAt:serverTimestamp()},{merge:true}); showToast?.('✅ Saved'); } catch(e){ showToast?.('❌ '+e.message); }
    setSaving(false);
  };

  const sendAnnouncement = async () => {
    if (!announcement.trim()) return;
    await setDoc(doc(db,'site_data','global_announcement'),{message:announcement,sentAt:serverTimestamp(),sentBy:user?.email}).catch(()=>{});
    showToast?.('📢 Announcement sent'); setAnnouncement('');
  };

  const S = (label, color='var(--gold)') => (
    <span style={{fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:1,padding:'2px 8px',borderRadius:4,background:color+'22',color,border:`1px solid ${color}44`}}>{label}</span>
  );

  return (
    <div className="adm-page">
      {impersonating && (
        <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',zIndex:9999,background:'rgba(231,76,60,0.95)',borderRadius:50,padding:'10px 24px',display:'flex',gap:16,alignItems:'center',boxShadow:'0 4px 24px rgba(0,0,0,0.5)'}}>
          <span style={{fontWeight:700,fontSize:'0.88rem'}}>👤 Impersonating: {impersonating.name}</span>
          <button className="btn btn-sm" style={{background:'#fff',color:'#e74c3c',fontWeight:700}} onClick={exitImpersonation}>Exit</button>
        </div>
      )}
      {confirmGate && <ConfirmGate label={confirmGate.label} onConfirm={()=>{confirmGate.action();setConfirmGate(null);}} onCancel={()=>setConfirmGate(null)} />}

      {/* Warning */}
      <div style={{background:'rgba(231,76,60,0.08)',border:'2px solid rgba(231,76,60,0.4)',borderRadius:'var(--r)',padding:'14px 18px',marginBottom:20,display:'flex',gap:14,alignItems:'center'}}>
        <span style={{fontSize:'1.6rem'}}>⚡</span>
        <div style={{flex:1}}><div style={{fontWeight:700,color:'#e74c3c',marginBottom:3}}>God Mode — Full Site Control</div><div style={{fontSize:'0.8rem',color:'var(--muted)'}}>Changes affect all users instantly. All actions are logged when logging is enabled.</div></div>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.82rem',cursor:'pointer',flexShrink:0}}>
          <input type="checkbox" checked={godLog} onChange={e=>setGodLog(e.target.checked)} /> Logging
        </label>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:20,background:'var(--surface)',borderRadius:'var(--r)',padding:6,border:'1px solid var(--border)'}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'7px 14px',borderRadius:'var(--r-sm)',border:'none',background:tab===t?'var(--gold)':'transparent',color:tab===t?'#000':'var(--muted)',fontWeight:600,fontSize:'0.82rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s'}}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab==='overview' && (
        <div>
          <div className="adm-stats-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:20}}>
            {[{l:'Total Users',v:adminStats.users,c:'var(--gold)'},{l:'Suspended',v:adminStats.suspended,c:'#e8832a'},{l:'Pending Deletion',v:adminStats.deletions,c:'#e74c3c'},{l:'Books',v:books?.length||0,c:'#4a9eff'}].map(s=>(
              <div key={s.l} className="adm-stat-card card"><div className="adm-stat-body"><strong style={{color:s.c}}>{s.v}</strong><span>{s.l}</span></div></div>
            ))}
          </div>
          <div className="card" style={{padding:20}}>
            <h3 style={{fontSize:'0.92rem',marginBottom:14,color:'var(--gold)'}}>📋 Recent Admin Actions</h3>
            {recentLogs.length===0 ? <p style={{color:'var(--muted)',fontSize:'0.82rem'}}>No logs yet. Enable logging above.</p> : (
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {recentLogs.map((l,i)=>(
                  <div key={i} style={{display:'flex',gap:12,alignItems:'center',padding:'7px 10px',background:'var(--bg)',borderRadius:'var(--r-sm)',border:'1px solid var(--border)',fontSize:'0.8rem'}}>
                    <span style={{color:'var(--gold)',flexShrink:0}}>{l.type||'sys'}</span>
                    <span style={{flex:1,color:'var(--text)'}}>{l.action}</span>
                    <span style={{color:'var(--muted)',fontSize:'0.72rem',flexShrink:0}}>{l.admin}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── USER CONTROL ── */}
      {tab==='users' && (
        <div style={{display:'grid',gridTemplateColumns:selectedUser?'1fr 1.4fr':'1fr',gap:20}}>
          <div>
            <input className="field" value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Search users by name or email…" style={{marginBottom:12,width:'100%'}} />
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:'65vh',overflowY:'auto'}}>
              {fsUsersLoading && (
                <div style={{textAlign:'center',padding:'12px 0',fontSize:'0.78rem',color:'var(--muted)'}}>
                  ⏳ Loading users from Firestore…
                </div>
              )}
              {filtered.map((u,i)=>(
                <div key={i} onClick={()=>selectUser(u)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:selectedUser?.email===u.email?'rgba(201,168,76,0.1)':'var(--card)',border:selectedUser?.email===u.email?'1px solid rgba(201,168,76,0.4)':'1px solid var(--border)',borderRadius:'var(--r-sm)',cursor:'pointer',transition:'all 0.15s'}}>
                  <div style={{width:34,height:34,borderRadius:'50%',background:u.role==='superadmin'?'var(--gold)':u.role==='admin'?'#4a9eff':'rgba(255,255,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',fontWeight:800,color:u.role==='superadmin'||u.role==='admin'?'#000':'var(--muted)',flexShrink:0}}>
                    {(u.name||u.email||'?')[0].toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'0.84rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</div>
                    <div style={{fontSize:'0.7rem',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email}</div>
                  </div>
                  <div style={{flexShrink:0}}>{S(u.role||'user', u.role==='superadmin'?'#c9a84c':u.role==='admin'?'#4a9eff':'#9490a0')}</div>
                </div>
              ))}
              {filtered.length===0 && <p style={{color:'var(--muted)',textAlign:'center',padding:'24px 0',fontSize:'0.82rem'}}>No users found</p>}
            </div>
          </div>
          {selectedUser && (
            <div className="card" style={{padding:20,overflowY:'auto',maxHeight:'75vh'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <h3 style={{fontSize:'0.95rem',color:'var(--gold)'}}>👤 {selectedUser.name}</h3>
                <button className="adm-close-btn" onClick={()=>setSelectedUser(null)}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                {[{k:'name',l:'Name'},{k:'phone',l:'Phone'},{k:'location',l:'Location'}].map(f=>(
                  <div key={f.k} className="adm-field-group">
                    <label>{f.l}</label>
                    <input className="field" value={editFields[f.k]||''} onChange={e=>setEditFields(p=>({...p,[f.k]:e.target.value}))} />
                  </div>
                ))}
                <div className="adm-field-group">
                  <label>Role</label>
                  <select className="field" value={newRole} onChange={e=>setNewRole(e.target.value)}>
                    <option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option>
                  </select>
                </div>
                <div className="adm-field-group" style={{gridColumn:'1/-1'}}>
                  <label>Reset Password (min 4 chars)</label>
                  <input className="field" type="text" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password…" />
                </div>
                <div className="adm-field-group" style={{gridColumn:'1/-1'}}>
                  <label>Bio</label>
                  <textarea className="field" rows={2} value={editFields.bio||''} onChange={e=>setEditFields(p=>({...p,bio:e.target.value}))} style={{resize:'vertical'}} />
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
                <button className="btn btn-primary btn-sm" onClick={saveUserProfile} disabled={saving}>{saving?'⏳':'💾 Save Changes'}</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>impersonate(selectedUser)}>👤 Impersonate</button>
                <button className="btn btn-sm" style={{background:isUserSuspended?.(selectedUser.email)?'rgba(46,204,113,0.1)':'rgba(231,76,60,0.1)',color:isUserSuspended?.(selectedUser.email)?'var(--ok)':'#e74c3c',border:`1px solid ${isUserSuspended?.(selectedUser.email)?'rgba(46,204,113,0.3)':'rgba(231,76,60,0.3)'}`}}
                  onClick={()=>setSuspended?.(selectedUser.email,!isUserSuspended?.(selectedUser.email))}>
                  {isUserSuspended?.(selectedUser.email)?'✓ Reinstate':'🚫 Suspend'}
                </button>
                <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.1)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.3)'}}
                  onClick={()=>setConfirmGate({label:'Permanently delete '+selectedUser.name+'\'s account?',action:()=>forceDeleteUser(selectedUser.email)})}>
                  🗑 Force Delete
                </button>
              </div>
              <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <strong style={{fontSize:'0.82rem',color:'var(--gold)'}}>📚 Library ({userLibrary.length})</strong>
                  <div style={{display:'flex',gap:6}}>
                    <select className="field" value={selectedBook} onChange={e=>setSelectedBook(e.target.value)} style={{fontSize:'0.75rem',padding:'4px 8px'}}>
                      <option value="">Add book…</option>
                      {(books||[]).filter(b=>!userLibrary.find(l=>l.id===b.id)).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={unlockBook} disabled={!selectedBook} style={{fontSize:'0.72rem'}}>+ Unlock</button>
                  </div>
                </div>
                {userLibrary.length===0 ? <p style={{color:'var(--muted)',fontSize:'0.78rem'}}>No books in library</p> : (
                  <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:160,overflowY:'auto'}}>
                    {userLibrary.map(b=>(
                      <div key={b.id} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 10px',background:'var(--bg)',borderRadius:'var(--r-sm)',border:'1px solid var(--border)'}}>
                        <span style={{flex:1,fontSize:'0.8rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.title}</span>
                        <button onClick={()=>removeBook(b.id)} style={{background:'rgba(231,76,60,0.1)',border:'none',color:'#e74c3c',borderRadius:4,padding:'2px 7px',cursor:'pointer',fontSize:'0.7rem',fontFamily:'inherit'}}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PENDING DELETIONS ── */}
      {tab==='deletions' && (
        <div>
          <div className="adm-info-note" style={{marginBottom:16}}>Users who requested account deletion. You have up to 30 days to restore or permanently delete.</div>
          {pendingDels.length===0 ? (
            <div className="adm-empty"><div style={{fontSize:'2.5rem',marginBottom:10}}>✅</div><p>No pending deletions</p></div>
          ) : (
            <div className="card" style={{overflow:'hidden'}}>
              <table className="adm-table">
                <thead><tr><th>User</th><th>Email</th><th>Days Left</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {pendingDels.map((d,i)=>(
                    <tr key={i}>
                      <td><strong>{d.name}</strong></td>
                      <td style={{fontSize:'0.8rem',color:'var(--muted)'}}>{d.email}</td>
                      <td><span style={{color:d.daysLeft<=3?'#e74c3c':d.daysLeft<=10?'#e8832a':'var(--ok)',fontWeight:700}}>{d.daysLeft === 0 ? 'OVERDUE' : d.daysLeft + 'd'}</span></td>
                      <td><span className="adm-status adm-status--pending">{d.overdue?'Overdue':'Pending'}</span></td>
                      <td className="adm-actions">
                        <button className="adm-act-btn adm-act-edit" onClick={()=>restoreAccount(d.email)}>↩ Restore</button>
                        <button className="adm-act-btn adm-act-del" onClick={()=>setConfirmGate({label:'Permanently delete '+d.name+'?',action:()=>forceDeleteUser(d.email)})}>Delete Now</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MASS ACTIONS ── */}
      {tab==='mass' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card" style={{padding:20}}>
            <h3 style={{fontSize:'0.92rem',marginBottom:12,color:'var(--gold)'}}>📢 Global Announcement</h3>
            <textarea className="field" rows={4} value={announcement} onChange={e=>setAnnouncement(e.target.value)} placeholder="Message to all users…" style={{width:'100%',resize:'vertical',marginBottom:10}} />
            <button className="btn btn-primary btn-sm" onClick={sendAnnouncement} disabled={!announcement.trim()}>Send to All</button>
          </div>
          <div className="card" style={{padding:20,display:'flex',flexDirection:'column',gap:10}}>
            <h3 style={{fontSize:'0.92rem',marginBottom:4,color:'var(--gold)'}}>⚡ Site Controls</h3>
            {[
              {l:'🔴 Lock Site (Maintenance)',action:async()=>{await setDoc(doc(db,'site_data','site_controls'),{maintenanceMode:true,updatedAt:serverTimestamp()},{merge:true});showToast?.('Site locked');}},
              {l:'🔓 Unlock Site',action:async()=>{await setDoc(doc(db,'site_data','site_controls'),{maintenanceMode:false,updatedAt:serverTimestamp()},{merge:true});showToast?.('Site unlocked');}},
              {l:'🔄 Force Refresh All Users',action:async()=>{await setDoc(doc(db,'site_data','force_refresh'),{ts:serverTimestamp()});showToast?.('Refresh signal sent');}},
              {l:'🔁 Reset All Permissions',action:async()=>{
                await setDoc(doc(db,'site_data','user_permissions'),{perms:{},updatedAt:serverTimestamp()},{merge:false});
                localStorage.removeItem('eh_user_perms');
                showToast?.('✅ All permissions reset to defaults');
              }},
              {l:'🔓 Enable Purchases for All',action:async()=>{
                const snap = await getDoc(doc(db,'site_data','user_permissions')).catch(()=>null);
                const existing = snap?.exists() ? (snap.data().perms||{}) : {};
                const updated = {};
                allUsers.forEach(u => { updated[u.email.toLowerCase()] = {...(existing[u.email.toLowerCase()]||{}), canPurchase:true }; });
                await setDoc(doc(db,'site_data','user_permissions'),{perms:updated,updatedAt:serverTimestamp()},{merge:true});
                showToast?.('✅ Purchases enabled for all users');
              }},
            ].map(a=>(
              <button key={a.l} className="btn btn-ghost btn-sm" onClick={()=>setConfirmGate({label:a.l+'?',action:a.action})} style={{textAlign:'left'}}>{a.l}</button>
            ))}
          </div>
          <div className="card" style={{padding:20,gridColumn:'1/-1'}}>
            <h3 style={{fontSize:'0.92rem',marginBottom:12,color:'var(--gold)'}}>📚 Bulk Unlock Book for All Users</h3>
            <p style={{fontSize:'0.8rem',color:'var(--muted)',marginBottom:12}}>This will unlock the selected book for every registered user — use for free releases or promotions.</p>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <select className="field" value={selectedBook} onChange={e=>setSelectedBook(e.target.value)} style={{flex:1}}>
                <option value="">Select book to unlock for ALL users…</option>
                {(books||[]).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" disabled={!selectedBook}
                onClick={()=>setConfirmGate({
                  label:'Unlock "'+((books||[]).find(b=>b.id===selectedBook)?.title||'this book')+'" for ALL '+allUsers.length+' users?',
                  action:async()=>{
                    const book = (books||[]).find(b=>b.id===selectedBook);
                    if (!book) return;
                    let count = 0;
                    for (const u of allUsers) {
                      try {
                        const libId = u.email.toLowerCase().replace(/[^a-z0-9]/g,'_');
                        const snap = await getDoc(doc(db,'libraries',libId));
                        const existing = snap.exists() ? (snap.data().books||[]) : [];
                        if (!existing.find(b=>b.id===book.id)) {
                          await setDoc(doc(db,'libraries',libId),{email:u.email.toLowerCase(),books:[...existing,{...book,downloadUnlocked:true}]},{merge:true});
                          count++;
                        }
                      } catch {}
                    }
                    showToast?.(`✅ Unlocked for ${count} users`);
                  }
                })}>
                🔓 Unlock for All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DATABASE ── */}
      {tab==='database' && (
        <div>
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            <select className="field" value={selectedColl} onChange={e=>setSelectedColl(e.target.value)} style={{flex:1}}>
              {COLLS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadColl} disabled={loading}>{loading?'⏳':'Load'}</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:selectedDoc?'1fr 2fr':'1fr',gap:14}}>
            <div style={{maxHeight:500,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
              {collDocs.map(d=>(
                <button key={d.id} onClick={()=>{setSelectedDoc(d.id);setDocJson(JSON.stringify(d.data,null,2));}}
                  style={{textAlign:'left',padding:'7px 10px',background:selectedDoc===d.id?'rgba(201,168,76,0.12)':'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',cursor:'pointer',fontSize:'0.8rem',color:selectedDoc===d.id?'var(--gold)':'var(--text)',fontFamily:'monospace',transition:'all 0.15s'}}>
                  {d.id}
                </button>
              ))}
              {collDocs.length===0 && !loading && <p style={{color:'var(--muted)',fontSize:'0.8rem',padding:'20px 0',textAlign:'center'}}>No docs loaded. Click Load.</p>}
            </div>
            {selectedDoc && (
              <div>
                <textarea className="field" rows={18} value={docJson} onChange={e=>setDocJson(e.target.value)} style={{width:'100%',resize:'vertical',fontFamily:'monospace',fontSize:'0.78rem',marginBottom:10}} />
                <button className="btn btn-primary btn-sm" onClick={saveDoc} disabled={saving}>{saving?'⏳ Saving…':'💾 Save Document'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EMERGENCY ── */}
      {tab==='emergency' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card" style={{padding:20}}>
            <h3 style={{fontSize:'0.92rem',marginBottom:14,color:'var(--gold)'}}>🚨 Emergency Controls</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={async()=>{setLoading(true);const snap=await getDocs(collection(db,'site_data'));const d={};snap.forEach(s=>d[s.id]=s.data());const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='ellines-config.json';a.click();URL.revokeObjectURL(u);setLoading(false);showToast?.('📦 Config exported');}}>
                📦 Export Full Site Config
              </button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setConfirmGate({label:'Clear all local caches?',action:()=>{localStorage.removeItem('eh_books');localStorage.removeItem('eh_design');showToast?.('✅ Caches cleared');}})}>
                🗑 Clear All Caches
              </button>
              <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.1)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.3)'}}
                onClick={()=>setConfirmGate({label:'NUCLEAR RESET — clear all localStorage data?',action:()=>{const cur=localStorage.getItem('eh_user');localStorage.clear();if(cur)localStorage.setItem('eh_user',cur);showToast?.('Nuclear reset complete');}})}>
                ☢️ Nuclear Reset
              </button>
            </div>
          </div>
          <div className="card" style={{padding:20}}>
            <h3 style={{fontSize:'0.92rem',marginBottom:14,color:'var(--gold)'}}>👑 Transfer Super Admin</h3>
            <p style={{fontSize:'0.8rem',color:'var(--muted)',marginBottom:12}}>Transfer super admin to another user.</p>
            <input className="field" value={transferEmail} onChange={e=>setTransferEmail(e.target.value)} placeholder="email@example.com" style={{marginBottom:10}} />
            <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.1)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.3)'}} disabled={!transferEmail.trim()}
              onClick={()=>setConfirmGate({label:'Transfer super admin to '+transferEmail+'?',action:async()=>{await setDoc(doc(db,'site_data','super_admin'),{email:transferEmail,transferredAt:serverTimestamp(),from:user?.email},{merge:true});showToast?.('✅ Transferred to '+transferEmail);setTransferEmail('');}})}> 
              👑 Transfer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
