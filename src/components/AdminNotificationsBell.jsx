import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import {
  markNotificationRead,
  markAllNotificationsRead,
  getAdminNotificationPreferences,
  saveAdminNotificationPreferences,
  getCategoryIcon,
  getCategoryLabel,
  isCategoryMuted,
  NOTIFICATION_CATEGORIES,
  CATEGORY_LABELS,
} from '../utils/adminActivityTracker';

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
    o1.type = 'sine'; o1.frequency.setValueAtTime(660, ctx.currentTime);
    o2.type = 'sine'; o2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.2);
    o2.start(ctx.currentTime + 0.1); o2.stop(ctx.currentTime + 0.6);
  } catch {}
}

function BellIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
    </svg>
  );
}

function MuteIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
    </svg>
  );
}

function UnmuteIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
    </svg>
  );
}

export default function AdminNotificationsBell({ user }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const dropRef = useRef(null);
  const prevIdsRef = useRef(new Set());
  const mountedRef = useRef(false);

  const adminEmail = user?.email?.toLowerCase() || '';
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // Load preferences
  useEffect(() => {
    if (!isAdmin || !adminEmail) return;
    getAdminNotificationPreferences(adminEmail).then(prefs => {
      setPreferences(prefs);
    });
  }, [isAdmin, adminEmail]);

  // Listen to notifications
  useEffect(() => {
    if (!isAdmin) return;
    
    const q = query(
      collection(db, 'admin_notifications'),
      where('deleted', '!=', true),
      orderBy('deleted', 'asc'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Play sound for new unread notifications (if sound enabled and category not muted)
      if (mountedRef.current && preferences) {
        const newUnread = fresh.filter(n => {
          const isNew = !prevIdsRef.current.has(n.id);
          const isUnread = !(n.readBy || []).includes(adminEmail);
          const isNotMuted = !isCategoryMuted(n.category, preferences.mutedCategories);
          return isNew && isUnread && isNotMuted;
        });
        
        if (newUnread.length > 0 && preferences.soundEnabled) {
          playNotifSound();
        }
        
        // Desktop notification (if enabled)
        if (newUnread.length > 0 && preferences.desktopEnabled && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            newUnread.slice(0, 3).forEach(n => {
              new Notification(n.title, {
                body: n.message,
                icon: '/logo-icon.png',
                tag: n.id,
              });
            });
          }
        }
      }
      
      prevIdsRef.current = new Set(fresh.map(n => n.id));
      mountedRef.current = true;
      setNotifs(fresh);
    }, () => {});
    
    return () => unsub();
  }, [isAdmin, adminEmail, preferences]);

  // Request desktop notification permission
  useEffect(() => {
    if (isAdmin && preferences?.desktopEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isAdmin, preferences]);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setOpen(false);
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isAdmin) return null;

  const handleMarkRead = async (notifId) => {
    await markNotificationRead(notifId, adminEmail);
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifs
      .filter(n => !(n.readBy || []).includes(adminEmail))
      .map(n => n.id);
    await markAllNotificationsRead(unreadIds, adminEmail);
  };

  const unreadCount = notifs.filter(n => {
    const isUnread = !(n.readBy || []).includes(adminEmail);
    const isNotMuted = preferences ? !isCategoryMuted(n.category, preferences.mutedCategories) : true;
    return isUnread && isNotMuted;
  }).length;

  const preview = notifs
    .filter(n => preferences ? !isCategoryMuted(n.category, preferences.mutedCategories) : true)
    .slice(0, 8);

  const allMuted = preferences?.soundEnabled === false;

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="nav__cart"
        aria-label="Admin Notifications"
        style={{ 
          position: 'relative', 
          color: open ? 'var(--gold)' : undefined,
          opacity: allMuted ? 0.6 : 1,
        }}
      >
        {allMuted ? <MuteIcon size={22} /> : <BellIcon />}
        {unreadCount > 0 && (
          <span className="nav__cart-badge" style={{ background: '#e74c3c' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, maxHeight: 420,
          background: '#13131f',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 'var(--r)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          zIndex: 3000,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: '0.9rem' }}>📊 Admin Activity</strong>
              {unreadCount > 0 && (
                <span style={{ 
                  background: 'var(--gold)', 
                  color: '#000', 
                  fontSize: '0.62rem', 
                  fontWeight: 800, 
                  padding: '2px 7px', 
                  borderRadius: 10 
                }}>
                  {unreadCount}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  title="Mark all read"
                  style={{ 
                    fontSize: '0.72rem', 
                    color: 'var(--gold)', 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}>
                  ✓ All
                </button>
              )}
              <button
                onClick={() => setShowSettings(s => !s)}
                title="Notification settings"
                style={{ 
                  fontSize: '1rem', 
                  color: showSettings ? 'var(--gold)' : 'var(--muted)', 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}>
                ⚙️
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && preferences && (
            <NotificationSettings
              preferences={preferences}
              setPreferences={setPreferences}
              adminEmail={adminEmail}
              onClose={() => setShowSettings(false)}
            />
          )}

          {/* Notification list */}
          {!showSettings && (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📊</div>
                  <p style={{ fontSize: '0.85rem', marginBottom: 4 }}>No activity yet</p>
                  <p style={{ fontSize: '0.75rem' }}>Admin notifications will appear here</p>
                </div>
              ) : preview.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🔇</div>
                  <p style={{ fontSize: '0.85rem' }}>All categories muted</p>
                </div>
              ) : (
                preview.map(n => {
                  const isUnread = !(n.readBy || []).includes(adminEmail);
                  return (
                    <div
                      key={n.id}
                      onClick={() => isUnread && handleMarkRead(n.id)}
                      style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        padding: '9px 12px',
                        background: isUnread ? 'rgba(201,168,76,0.05)' : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        borderLeft: isUnread ? '3px solid var(--gold)' : '3px solid transparent',
                        cursor: isUnread ? 'pointer' : 'default',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (isUnread) e.currentTarget.style.background = 'rgba(201,168,76,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isUnread ? 'rgba(201,168,76,0.05)' : 'transparent'; }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: isUnread ? 'rgba(201,168,76,0.15)' : 'rgba(148,144,160,0.1)',
                        color: isUnread ? 'var(--gold)' : 'var(--muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.78rem',
                      }}>
                        {n.icon || '🔔'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'flex-start', 
                          gap: 8,
                          marginBottom: 2,
                        }}>
                          <strong style={{ 
                            fontSize: '0.78rem', 
                            fontWeight: isUnread ? 700 : 500,
                            color: isUnread ? 'var(--gold)' : 'var(--text)',
                            lineHeight: 1.3,
                          }}>
                            {n.title}
                          </strong>
                          {isUnread && (
                            <div style={{ 
                              width: 7, 
                              height: 7, 
                              borderRadius: '50%', 
                              background: 'var(--gold)', 
                              flexShrink: 0,
                              marginTop: 3,
                            }} />
                          )}
                        </div>
                        <div style={{ 
                          fontSize: '0.7rem', 
                          color: 'var(--muted)', 
                          lineHeight: 1.35,
                          marginBottom: 3,
                        }}>
                          {n.message}
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          gap: 8, 
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}>
                          <span style={{
                            fontSize: '0.65rem',
                            color: 'var(--muted)',
                            background: 'rgba(255,255,255,0.05)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}>
                            {getCategoryLabel(n.category)}
                          </span>
                          <span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>
                            {fmtTime(n.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Footer */}
          {!showSettings && notifs.length > 8 && (
            <div style={{
              padding: '10px 16px', 
              borderTop: '1px solid rgba(255,255,255,0.07)',
              textAlign: 'center', 
              flexShrink: 0,
            }}>
              <Link 
                to="/admin" 
                onClick={() => setOpen(false)}
                style={{ 
                  fontSize: '0.78rem', 
                  color: 'var(--gold)', 
                  textDecoration: 'none', 
                  fontWeight: 600 
                }}>
                View all in admin panel →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationSettings({ preferences, setPreferences, adminEmail, onClose }) {
  const [localPrefs, setLocalPrefs] = useState(preferences);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const success = await saveAdminNotificationPreferences(adminEmail, localPrefs);
    if (success) {
      setPreferences(localPrefs);
      onClose();
    }
    setSaving(false);
  };

  const toggleCategory = (category) => {
    setLocalPrefs(prev => {
      const mutedCategories = prev.mutedCategories || [];
      const isMuted = mutedCategories.includes(category);
      return {
        ...prev,
        mutedCategories: isMuted
          ? mutedCategories.filter(c => c !== category)
          : [...mutedCategories, category],
      };
    });
  };

  const categories = Object.values(NOTIFICATION_CATEGORIES);

  return (
    <div style={{ 
      padding: '16px', 
      maxHeight: 480, 
      overflowY: 'auto',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: '0.85rem', marginBottom: 12, color: 'var(--gold)' }}>
          🔔 Notification Settings
        </h4>
        
        {/* Global toggles */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 10,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <label style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}>
            <span>🔊 Sound Alerts</span>
            <input
              type="checkbox"
              checked={localPrefs.soundEnabled}
              onChange={e => setLocalPrefs(prev => ({ ...prev, soundEnabled: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
          </label>
          <label style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}>
            <span>💻 Desktop Notifications</span>
            <input
              type="checkbox"
              checked={localPrefs.desktopEnabled}
              onChange={e => setLocalPrefs(prev => ({ ...prev, desktopEnabled: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
          </label>
        </div>

        {/* Category toggles */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ 
            fontSize: '0.75rem', 
            color: 'var(--muted)', 
            marginBottom: 8,
            fontWeight: 600,
          }}>
            Categories:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.map(cat => {
              const isMuted = (localPrefs.mutedCategories || []).includes(cat);
              return (
                <label
                  key={cat}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.76rem',
                    padding: '6px 10px',
                    background: isMuted ? 'rgba(231,76,60,0.05)' : 'rgba(255,255,255,0.03)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isMuted ? 'rgba(231,76,60,0.1)' : 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = isMuted ? 'rgba(231,76,60,0.05)' : 'rgba(255,255,255,0.03)'}
                >
                  <span style={{ opacity: isMuted ? 0.5 : 1 }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <input
                    type="checkbox"
                    checked={!isMuted}
                    onChange={() => toggleCategory(cat)}
                    style={{ cursor: 'pointer' }}
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-sm"
            style={{ flex: 1, fontSize: '0.78rem' }}
          >
            {saving ? '⏳ Saving...' : '💾 Save'}
          </button>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.78rem' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
