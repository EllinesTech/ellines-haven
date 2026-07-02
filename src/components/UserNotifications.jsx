import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';

const fmtTime = ts => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  } catch { return ''; }
};

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.type = 'sine'; o1.frequency.setValueAtTime(880, ctx.currentTime);
    o2.type = 'sine'; o2.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.18);
    o2.start(ctx.currentTime + 0.12); o2.stop(ctx.currentTime + 0.5);
  } catch {}
}

/* ── Bell icon ── */
function BellIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
    </svg>
  );
}

/* ── Inline notification panel (used on UserProfile notifications tab) ── */
export function UserNotificationsPanel({ user }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const emailKey = user?.email?.toLowerCase() || '';

  useEffect(() => {
    if (!emailKey) return;
    const q = query(
      collection(db, 'user_notifications'),
      where('userEmail', '==', emailKey)
    );
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || a.createdAt || 0;
          const tb = b.createdAt?.toMillis?.() || b.createdAt || 0;
          return tb - ta;
        });
      setNotifs(fresh);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [emailKey]);

  const markRead = async id => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setDoc(doc(db, 'user_notifications', id), { read: true, readAt: serverTimestamp() }, { merge: true }).catch(() => {});
  };

  const markAllRead = async () => {
    const unread = notifs.filter(n => !n.read);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    await Promise.all(unread.map(n =>
      setDoc(doc(db, 'user_notifications', n.id), { read: true, readAt: serverTimestamp() }, { merge: true }).catch(() => {})
    ));
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.88rem' }}>
      Loading notifications…
    </div>
  );

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>🔔 Notifications</h3>
          {unreadCount > 0 && (
            <span style={{ background: 'var(--gold)', color: '#000', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Mark all read
          </button>
        )}
      </div>

      {notifs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔔</div>
          <p style={{ fontSize: '0.88rem' }}>No notifications yet</p>
          <p style={{ fontSize: '0.78rem', marginTop: 4 }}>We'll let you know when your books are ready</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifs.map(n => (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '14px 16px',
                background: n.read ? 'rgba(255,255,255,0.02)' : 'rgba(201,168,76,0.07)',
                border: n.read ? '1px solid var(--border)' : '1px solid rgba(201,168,76,0.3)',
                borderLeft: n.read ? '3px solid transparent' : '3px solid var(--gold)',
                borderRadius: 'var(--r-sm)',
                cursor: n.read ? 'default' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: n.type === 'book_ready' ? 'rgba(201,168,76,0.15)' : 'rgba(74,158,255,0.15)',
                color: n.type === 'book_ready' ? 'var(--gold)' : '#4a9eff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem',
              }}>
                {n.type === 'book_ready' ? '📖' : '🔔'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{ fontSize: '0.88rem', color: n.read ? 'var(--text)' : 'var(--gold)', display: 'block', marginBottom: 3 }}>
                    {n.title || 'Book Ready'}
                  </strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--muted)', flexShrink: 0, marginTop: 2 }}>
                    {fmtTime(n.createdAt)}
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  {n.message}
                </p>
                {n.bookId && (
                  <Link
                    to={`/book/${n.bookId}`}
                    onClick={e => { e.stopPropagation(); markRead(n.id); }}
                    style={{ display: 'inline-block', marginTop: 8, fontSize: '0.78rem', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                    View Book →
                  </Link>
                )}
              </div>

              {!n.read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 4 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Bell button for Navbar (shows dropdown) ── */
export default function UserNotificationsBell({ user }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const dropRef = useRef(null);
  const prevIdsRef = useRef(new Set());
  const mountedRef = useRef(false);

  const emailKey = user?.email?.toLowerCase() || '';

  useEffect(() => {
    if (!emailKey) return;
    const q = query(
      collection(db, 'user_notifications'),
      where('userEmail', '==', emailKey)
    );
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || a.createdAt || 0;
          const tb = b.createdAt?.toMillis?.() || b.createdAt || 0;
          return tb - ta;
        });

      // Play sound for genuinely new unread notifications
      if (mountedRef.current) {
        const hasNew = fresh.some(n => !n.read && !prevIdsRef.current.has(n.id));
        if (hasNew) playNotifSound();
      }
      prevIdsRef.current = new Set(fresh.map(n => n.id));
      mountedRef.current = true;
      setNotifs(fresh);
    }, () => {});
    return () => unsub();
  }, [emailKey]);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async id => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setDoc(doc(db, 'user_notifications', id), { read: true, readAt: serverTimestamp() }, { merge: true }).catch(() => {});
  };

  const markAllRead = async () => {
    const unread = notifs.filter(n => !n.read);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    await Promise.all(unread.map(n =>
      setDoc(doc(db, 'user_notifications', n.id), { read: true, readAt: serverTimestamp() }, { merge: true }).catch(() => {})
    ));
  };

  const unreadCount = notifs.filter(n => !n.read).length;
  const preview = notifs.slice(0, 5);

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="nav__cart"
        aria-label="Notifications"
        style={{ position: 'relative', color: open ? 'var(--gold)' : undefined }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="nav__cart-badge" style={{ background: '#e74c3c' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: 340, maxHeight: 480,
          background: '#13131f',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 'var(--r)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          zIndex: 3000,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Dropdown header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: '0.9rem' }}>🔔 Notifications</strong>
              {unreadCount > 0 && (
                <span style={{ background: 'var(--gold)', color: '#000', fontSize: '0.62rem', fontWeight: 800, padding: '1px 6px', borderRadius: 8 }}>
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔔</div>
                <p style={{ fontSize: '0.82rem' }}>No notifications yet</p>
              </div>
            ) : (
              preview.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '12px 16px',
                    background: n.read ? 'transparent' : 'rgba(201,168,76,0.05)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: n.read ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!n.read) e.currentTarget.style.background = 'rgba(201,168,76,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(201,168,76,0.05)'; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(201,168,76,0.15)', color: 'var(--gold)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.9rem',
                  }}>
                    {n.type === 'book_ready' ? '📖' : '🔔'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: n.read ? 400 : 700, color: n.read ? 'var(--text)' : 'var(--gold)', marginBottom: 2, lineHeight: 1.3 }}>
                      {n.title || 'Notification'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                      {n.message}
                    </div>
                    {n.bookId && (
                      <Link to={`/book/${n.bookId}`} onClick={() => { markRead(n.id); setOpen(false); }}
                        style={{ display: 'inline-block', marginTop: 4, fontSize: '0.72rem', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                        View Book →
                      </Link>
                    )}
                    <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 3 }}>
                      {fmtTime(n.createdAt)}
                    </div>
                  </div>
                  {!n.read && (
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 3 }} />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifs.length > 5 && (
            <div style={{
              padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)',
              textAlign: 'center', flexShrink: 0,
            }}>
              <Link to="/profile"
                onClick={() => setOpen(false)}
                style={{ fontSize: '0.78rem', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                View all {notifs.length} notifications →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
