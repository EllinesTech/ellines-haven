# -*- coding: utf-8 -*-
"""Inject UserLibrariesTab component into Admin.jsx before ManualUnlockForm"""

COMPONENT = r"""
// ── UserLibrariesTab ─────────────────────────────────────────────────────────
// Shows all users and the books in their library.
// Admin can toggle each book active/inactive (remove/restore from user library).
function UserLibrariesTab({ users, books, showToast }) {
  const [libs,        setLibs]        = useState({});   // { email: [book, ...] }
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [expanded,    setExpanded]    = useState({});   // { email: bool }
  const [busy,        setBusy]        = useState({});   // { email_bookId: bool }

  // Derive doc key the same way AppContext does
  const libDocId = email => (email||'').toLowerCase().replace(/[^a-z0-9]/g,'_');

  // Load every user's library from Firestore
  useEffect(() => {
    const nonAdmin = users.filter(u => u.role === 'user');
    if (!nonAdmin.length) { setLoading(false); return; }
    let done = 0;
    const result = {};
    nonAdmin.forEach(u => {
      getDoc(doc(db,'libraries',libDocId(u.email)))
        .then(snap => {
          result[u.email.toLowerCase()] = snap.exists() ? (snap.data().books || []) : [];
        })
        .catch(() => { result[u.email.toLowerCase()] = []; })
        .finally(() => {
          done++;
          if (done === nonAdmin.length) { setLibs({ ...result }); setLoading(false); }
        });
    });
  }, [users]); // eslint-disable-line

  // Toggle a book in a user's library (deactivate = mark downloadUnlocked:false + active:false)
  const toggleBook = async (userEmail, bookId, currentActive) => {
    const key    = userEmail.toLowerCase();
    const busyKey = key + '_' + bookId;
    setBusy(b => ({ ...b, [busyKey]: true }));
    try {
      const ref  = doc(db, 'libraries', libDocId(userEmail));
      const snap = await getDoc(ref);
      if (!snap.exists()) { showToast('No library found for ' + userEmail); return; }
      const existing = snap.data().books || [];
      const updated  = existing.map(b => b.id === bookId
        ? { ...b, active: !currentActive, downloadUnlocked: !currentActive }
        : b
      );
      await setDoc(ref, { books: updated }, { merge: true });
      setLibs(prev => ({ ...prev, [key]: updated }));
      showToast(
        (currentActive ? 'Deactivated' : 'Reactivated') + ' book for ' + userEmail.split('@')[0]
      );
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setBusy(b => { const n = { ...b }; delete n[busyKey]; return n; });
    }
  };

  // Remove a book completely from user's library
  const removeBook = async (userEmail, bookId) => {
    if (!window.confirm('Remove this book from ' + userEmail.split('@')[0] + "'s library?")) return;
    const key = userEmail.toLowerCase();
    try {
      const ref  = doc(db, 'libraries', libDocId(userEmail));
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const updated = (snap.data().books || []).filter(b => b.id !== bookId);
      await setDoc(ref, { books: updated }, { merge: true });
      setLibs(prev => ({ ...prev, [key]: updated }));
      showToast('Book removed from ' + userEmail.split('@')[0] + "'s library");
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const filteredUsers = users.filter(u =>
    u.role === 'user' &&
    (u.name.toLowerCase().includes(search.toLowerCase()) ||
     u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const totalBooks = Object.values(libs).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>User Libraries</h1>
          <span className="adm-page-sub">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} &nbsp;·&nbsp; {totalBooks} total books owned
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          setLoading(true);
          setLibs({});
          const nonAdmin = users.filter(u => u.role === 'user');
          let done = 0; const result = {};
          nonAdmin.forEach(u => {
            getDoc(doc(db,'libraries',libDocId(u.email)))
              .then(snap => { result[u.email.toLowerCase()] = snap.exists()?(snap.data().books||[]): []; })
              .catch(() => { result[u.email.toLowerCase()] = []; })
              .finally(() => { done++; if(done===nonAdmin.length){ setLibs({...result}); setLoading(false); } });
          });
        }}>
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="adm-toolbar card" style={{ marginBottom: 16 }}>
        <input className="field adm-search" placeholder="Search users by name or email..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="adm-toolbar-count">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--muted)' }}>
          <div className="adm-photo-spinner" style={{ margin:'0 auto 16px' }} />
          Loading user libraries...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="adm-empty"><p>No users found.</p></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filteredUsers.map(u => {
            const userBooks = libs[u.email.toLowerCase()] || [];
            const isOpen    = !!expanded[u.email];
            return (
              <div key={u.id} className="card" style={{ overflow:'hidden' }}>
                {/* User header row */}
                <div
                  onClick={() => setExpanded(p => ({ ...p, [u.email]: !p[u.email] }))}
                  style={{
                    display:'flex', alignItems:'center', gap:14,
                    padding:'14px 20px', cursor:'pointer',
                    borderBottom: isOpen && userBooks.length > 0 ? '1px solid var(--dim)' : 'none',
                    transition:'background 0.15s',
                  }}
                >
                  <div className="adm-user-avatar" style={{ flexShrink:0 }}>{u.name.charAt(0)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <strong style={{ fontSize:'0.92rem' }}>{u.name}</strong>
                    <span style={{ display:'block', fontSize:'0.75rem', color:'var(--muted)' }}>{u.email}</span>
                  </div>
                  {/* Book count badge */}
                  <div style={{
                    background: userBooks.length > 0 ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                    border: userBooks.length > 0 ? '1px solid rgba(201,168,76,0.3)' : '1px solid var(--dim)',
                    borderRadius:20, padding:'3px 12px',
                    fontSize:'0.78rem', fontWeight:600,
                    color: userBooks.length > 0 ? 'var(--gold)' : 'var(--muted)',
                    flexShrink:0,
                  }}>
                    {userBooks.length} book{userBooks.length !== 1 ? 's' : ''}
                  </div>
                  <span style={{ fontSize:'0.75rem', color:'var(--muted)', flexShrink:0 }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>

                {/* Book list */}
                {isOpen && (
                  userBooks.length === 0 ? (
                    <div style={{ padding:'20px', color:'var(--muted)', fontSize:'0.85rem', textAlign:'center' }}>
                      This user has no books in their library.
                    </div>
                  ) : (
                    <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                      {userBooks.map(lb => {
                        const catalogBook = books.find(b => b.id === lb.id);
                        const title       = catalogBook?.title || lb.title || lb.id;
                        const cover       = catalogBook?.cover || lb.cover;
                        const coverType   = catalogBook?.coverType || lb.coverType;
                        const coverColor  = catalogBook?.coverColor || lb.coverColor || '#1a1a3a';
                        const coverAccent = catalogBook?.coverAccent || '#c9a84c';
                        const isActive    = lb.active !== false;
                        const busyKey     = u.email.toLowerCase() + '_' + lb.id;
                        return (
                          <div key={lb.id} style={{
                            display:'flex', alignItems:'center', gap:12,
                            padding:'10px 12px', borderRadius:'var(--r-sm)',
                            background: isActive ? 'rgba(255,255,255,0.03)' : 'rgba(231,76,60,0.05)',
                            border: isActive ? '1px solid var(--dim)' : '1px solid rgba(231,76,60,0.2)',
                            transition:'all 0.15s',
                          }}>
                            {/* Cover thumbnail */}
                            {coverType==='photo' && cover
                              ? <img src={cover} alt="" style={{ width:32,height:44,objectFit:'cover',borderRadius:4,flexShrink:0 }} />
                              : <div style={{ width:32,height:44,background:coverColor,borderRadius:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.55rem',color:coverAccent }}>EH</div>
                            }
                            {/* Book info */}
                            <div style={{ flex:1, minWidth:0 }}>
                              <strong style={{ fontSize:'0.85rem', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {title}
                              </strong>
                              <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>
                                {lb.downloadUnlocked ? 'Download unlocked' : 'Read only'}
                                {!isActive && <span style={{ color:'var(--err)', marginLeft:8 }}>· Deactivated</span>}
                              </span>
                            </div>
                            {/* Status badge */}
                            <span className={'adm-status adm-status--' + (isActive ? 'completed' : 'rejected')}
                              style={{ flexShrink:0, fontSize:'0.68rem' }}>
                              {isActive ? 'Active' : 'Off'}
                            </span>
                            {/* Toggle button */}
                            <button
                              disabled={!!busy[busyKey]}
                              onClick={() => toggleBook(u.email, lb.id, isActive)}
                              className={'adm-flag-btn' + (isActive ? ' on' : '')}
                              style={!isActive ? { borderColor:'var(--err)', color:'var(--err)' } : {}}
                              title={isActive ? 'Deactivate — block user access to this book' : 'Reactivate — restore user access'}
                            >
                              {busy[busyKey] ? '…' : isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                            {/* Remove button */}
                            <button
                              onClick={() => removeBook(u.email, lb.id)}
                              className="adm-act-btn adm-act-del"
                              title="Remove from library permanently"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"""

f = r"b:\Ellines Haven\ellines-haven\src\pages\Admin.jsx"
with open(f, "r", encoding="utf-8") as fh: c = fh.read()

if "function UserLibrariesTab" in c:
    print("Already injected - skipping")
elif "function ManualUnlockForm" in c:
    c = c.replace("function ManualUnlockForm", COMPONENT + "function ManualUnlockForm", 1)
    with open(f, "w", encoding="utf-8") as fh: fh.write(c)
    print(f"Injected UserLibrariesTab. File size: {len(c):,} chars")
else:
    print("ERROR: anchor not found")
