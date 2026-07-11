import { useState, useEffect, useRef } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, serverTimestamp, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const fmtRelative = ts => {
  if (!ts) return '—';
  try {
    const ms = ts?.toMillis?.() || (typeof ts === 'number' ? ts : new Date(ts).getTime());
    const diff = Date.now() - ms;
    if (diff < 10000) return 'Just now';
    if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    return Math.floor(diff / 3600000) + 'h ago';
  } catch { return '—'; }
};

const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts?.toMillis?.() || ts);
    return d.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const FLAG_BASE = 'https://flagcdn.com/16x12/';

// Heartbeat interval: users send a ping every 30s, we consider them online if seen within 90s
const ONLINE_THRESHOLD_MS = 90_000;

export default function OnlineUsersPanel({ showToast }) {
  const [presences, setPresences] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('online'); // online | all

  // Tick every 10s to refresh "online" status display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Real-time listener on user_presence collection
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'user_presence'),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.lastSeen?.toMillis?.() || (typeof a.lastSeen === 'number' ? a.lastSeen : 0);
            const tb = b.lastSeen?.toMillis?.() || (typeof b.lastSeen === 'number' ? b.lastSeen : 0);
            return tb - ta;
          });
        setPresences(data);
        setLoading(false);
      },
      err => { console.error('[OnlineUsersPanel]', err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  // Load recent sessions (login history)
  useEffect(() => {
    getDocs(query(collection(db, 'user_sessions'), orderBy('loginTime', 'desc')))
      .then(snap => setRecentSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 100)))
      .catch(() => {});
  }, []);

  const isOnline = p => {
    const ms = p.lastSeen?.toMillis?.() || (typeof p.lastSeen === 'number' ? p.lastSeen : 0);
    return (now - ms) < ONLINE_THRESHOLD_MS;
  };

  const online = presences.filter(isOnline);
  const offline = presences.filter(p => !isOnline(p));

  const displayed = (filter === 'online' ? online : presences)
    .filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.email?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.ip?.toLowerCase().includes(q) ||
        p.page?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.country?.toLowerCase().includes(q)
      );
    });

  const forceLogout = async (presenceId) => {
    if (!window.confirm('Force this user offline? They will be redirected on next action.')) return;
    try {
      await setDoc(doc(db, 'user_presence', presenceId), { forceLogout: true }, { merge: true });
      showToast?.('✅ Force logout signal sent');
    } catch (e) {
      showToast?.('❌ Failed: ' + e.message);
    }
  };

  const clearStale = async () => {
    const stale = presences.filter(p => {
      const ms = p.lastSeen?.toMillis?.() || (typeof p.lastSeen === 'number' ? p.lastSeen : 0);
      return (now - ms) > 7 * 86400000; // older than 7 days
    });
    if (stale.length === 0) { showToast?.('No stale records to clear'); return; }
    if (!window.confirm(`Clear ${stale.length} stale records (inactive > 7 days)?`)) return;
    await Promise.all(stale.map(p => deleteDoc(doc(db, 'user_presence', p.id)).catch(() => {})));
    showToast?.(`✅ Cleared ${stale.length} stale presence records`);
  };

  return (
    <div className="adm-page">
      {/* Header */}
      <div className="adm-page-head">
        <div>
          <h1>🟢 Online Users</h1>
          <span className="adm-page-sub">
            Real-time user presence — who's online now, their IP addresses, and browsing activity
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={clearStale}
            style={{ fontSize: '0.78rem' }}
          >
            🗑 Clear Stale
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="adm-stats-grid cols-4" style={{ marginBottom: 24 }}>
        {[
          { icon: '🟢', label: 'Online Now',     value: online.length,      color: '#2ecc71', bg: 'rgba(46,204,113,0.1)' },
          { icon: '👥', label: 'Total Tracked',  value: presences.length,   color: '#c9a84c', bg: 'rgba(201,168,76,0.1)' },
          { icon: '🌐', label: 'Unique IPs',      value: new Set(presences.map(p => p.ip).filter(Boolean)).size, color: '#4a9eff', bg: 'rgba(74,158,255,0.1)' },
          { icon: '🗺️', label: 'Countries',       value: new Set(presences.map(p => p.country).filter(Boolean)).size, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ background: s.bg, fontSize: '1.4rem' }}>{s.icon}</div>
            <div className="adm-stat-body">
              <strong style={{ color: s.color, fontSize: '1.5rem' }}>{loading ? '…' : s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Online users live list */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: '0.92rem', color: 'var(--gold)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ecc71', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            Live — {online.length} user{online.length !== 1 ? 's' : ''} online right now
          </h3>
          <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }`}</style>
        </div>

        {online.length === 0 ? (
          <div className="adm-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>👤</div>
            <p>No users currently online. Online status is updated every 30 seconds.</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 6 }}>
              Users appear here after they log in and browse the site with the presence heartbeat active.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {online.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px',
                background: 'rgba(46,204,113,0.04)',
                border: '1px solid rgba(46,204,113,0.2)',
                borderLeft: '3px solid #2ecc71',
                borderRadius: 'var(--r-sm)',
                cursor: 'pointer',
              }}
                onClick={() => setSelected(selected?.id === p.id ? null : p)}
              >
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(46,204,113,0.15)', border: '2px solid #2ecc71',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '0.85rem', color: '#2ecc71', flexShrink: 0,
                }}>
                  {(p.name || p.email || '?')[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: '0.88rem' }}>{p.name || 'Anonymous'}</strong>
                    <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(46,204,113,0.15)', color: '#2ecc71', fontWeight: 700 }}>ONLINE</span>
                    {p.role === 'admin' && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(74,158,255,0.15)', color: '#4a9eff', fontWeight: 700 }}>ADMIN</span>}
                    {p.role === 'superadmin' && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(201,168,76,0.15)', color: 'var(--gold)', fontWeight: 700 }}>SUPER ADMIN</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                    {p.email && <span>{p.email} · </span>}
                    <span>{fmtRelative(p.lastSeen)}</span>
                    {p.page && <span> · 📄 {p.page}</span>}
                  </div>
                </div>

                {/* IP + Location */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div>
                    <code style={{ fontSize: '0.78rem', color: '#7eb6ff', background: 'rgba(74,158,255,0.08)', padding: '2px 7px', borderRadius: 4 }}>
                      {p.ip || '—'}
                    </code>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    {p.countryCode && (
                      <img src={`${FLAG_BASE}${p.countryCode.toLowerCase()}.png`} alt={p.country} style={{ width: 14, height: 10, borderRadius: 2 }} onError={e => { e.target.style.display = 'none'; }} />
                    )}
                    {[p.city, p.country].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>

                {/* Device */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
                  <div style={{ fontSize: '0.8rem' }}>{p.device === 'Mobile' ? '📱' : '💻'} {p.device || 'Desktop'}</div>
                  <button
                    className="adm-act-btn adm-act-del"
                    style={{ marginTop: 4, fontSize: '0.68rem' }}
                    onClick={e => { e.stopPropagation(); forceLogout(p.id); }}
                    title="Force this user offline"
                  >
                    Force Offline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter + search for full presence history */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['online', 'all'].map(f => (
            <button key={f} className={'adm-filter-btn' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
              {f === 'online' ? '🟢 Online' : '👥 All Presence'}
            </button>
          ))}
        </div>
        <input
          className="field"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, IP, page, city…"
          style={{ maxWidth: 380, marginLeft: 'auto' }}
        />
      </div>

      {/* Presence table */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.88rem' }}>
            {filter === 'online' ? '🟢 Online Users' : '👥 All Presence Records'}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem', marginLeft: 6 }}>({displayed.length})</span>
          </strong>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="adm-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>👤</div>
            <p>No records match your filter.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>User</th>
                  <th>IP Address</th>
                  <th>Location</th>
                  <th>Current Page</th>
                  <th>Device</th>
                  <th>Last Seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(p => {
                  const online_ = isOnline(p);
                  return (
                    <>
                      <tr key={p.id} style={{ cursor: 'pointer', background: selected?.id === p.id ? 'rgba(201,168,76,0.05)' : 'transparent' }}
                        onClick={() => setSelected(selected?.id === p.id ? null : p)}>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '2px 8px', borderRadius: 10,
                            background: online_ ? 'rgba(46,204,113,0.12)' : 'rgba(148,144,160,0.1)',
                            color: online_ ? '#2ecc71' : 'var(--muted)',
                            fontSize: '0.72rem', fontWeight: 700,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: online_ ? '#2ecc71' : '#666' }} />
                            {online_ ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name || 'Anonymous'}</div>
                          {p.email && <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{p.email}</div>}
                          {p.role && p.role !== 'user' && (
                            <div style={{ fontSize: '0.68rem', color: p.role === 'superadmin' ? 'var(--gold)' : '#4a9eff', fontWeight: 700 }}>
                              {p.role === 'superadmin' ? '👑 Super Admin' : '🛡 Admin'}
                            </div>
                          )}
                        </td>
                        <td>
                          <code style={{ fontSize: '0.78rem', color: '#7eb6ff', background: 'rgba(74,158,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                            {p.ip || '—'}
                          </code>
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {p.countryCode && (
                              <img src={`${FLAG_BASE}${p.countryCode.toLowerCase()}.png`} alt={p.country} style={{ width: 16, height: 12, borderRadius: 2 }} onError={e => { e.target.style.display = 'none'; }} />
                            )}
                            {[p.city, p.country].filter(Boolean).join(', ') || '—'}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.page || '/'}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {p.device === 'Mobile' ? '📱' : '💻'} {p.device || 'Desktop'}
                        </td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {fmtRelative(p.lastSeen)}
                          {p.lastSeen && <div style={{ fontSize: '0.68rem' }}>{fmtDate(p.lastSeen)}</div>}
                        </td>
                        <td>
                          {online_ && (
                            <button
                              className="adm-act-btn adm-act-del"
                              onClick={e => { e.stopPropagation(); forceLogout(p.id); }}
                            >
                              Force Off
                            </button>
                          )}
                        </td>
                      </tr>
                      {selected?.id === p.id && (
                        <tr key={p.id + '_detail'}>
                          <td colSpan={8} style={{ background: 'rgba(255,255,255,0.02)', padding: 0 }}>
                            <div style={{ padding: '14px 18px', borderLeft: '3px solid var(--gold)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, fontSize: '0.8rem' }}>
                                {[
                                  ['🌐 IP Address', p.ip || '—'],
                                  ['👤 Name', p.name || '—'],
                                  ['📧 Email', p.email || '—'],
                                  ['🎭 Role', p.role || 'user'],
                                  ['📍 City', p.city || '—'],
                                  ['🗺️ Country', p.country || '—'],
                                  ['📡 ISP', p.isp || '—'],
                                  ['📄 Current Page', p.page || '/'],
                                  ['💻 Device', p.device || 'Desktop'],
                                  ['🔌 Timezone', p.timezone || '—'],
                                  ['🕐 Last Seen', fmtDate(p.lastSeen)],
                                  ['🔑 Session ID', p.id],
                                ].map(([label, value]) => (
                                  <div key={label} style={{ padding: '7px 10px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--dim)' }}>
                                    <div style={{ fontSize: '0.67rem', color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
                                    <div style={{ fontWeight: 600, wordBreak: 'break-all', color: 'var(--text)', fontSize: '0.82rem' }}>{value}</div>
                                  </div>
                                ))}
                              </div>
                              {p.lat && p.lon && (
                                <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}&zoom=12`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="btn btn-ghost btn-sm" style={{ marginTop: 10, fontSize: '0.75rem' }}>
                                  🗺️ View on Map
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent login sessions */}
      {recentSessions.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: '0.88rem' }}>🔐 Recent Login Sessions</strong>
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem', marginLeft: 6 }}>({recentSessions.length})</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr><th>User</th><th>IP</th><th>Device</th><th>Login Time</th></tr>
              </thead>
              <tbody>
                {recentSessions.slice(0, 20).map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.userName || s.userEmail || '—'}</div>
                      {s.userEmail && <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{s.userEmail}</div>}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.78rem', color: '#7eb6ff', background: 'rgba(74,158,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                        {s.ip || '—'}
                      </code>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{s.device || '—'}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {fmtDate(s.loginTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Note */}
      <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--dim)', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>ℹ️ How it works:</strong> Users send a presence heartbeat every 30 seconds while browsing. They're shown as Online if last seen within 90 seconds. IP and location are captured when they log in or visit the site.
      </div>
    </div>
  );
}
