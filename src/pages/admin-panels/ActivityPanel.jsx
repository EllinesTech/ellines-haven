import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  NOTIFICATION_CATEGORIES,
  CATEGORY_LABELS,
  getCategoryIcon,
  getCategoryLabel,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getAdminNotificationPreferences,
  saveAdminNotificationPreferences,
} from '../../utils/adminActivityTracker';

const fmtTimeFull = ts => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-KE', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch { return ''; }
};

export default function ActivityPanel({ user, showToast }) {
  const [notifs, setNotifs] = useState([]);
  const [filteredNotifs, setFilteredNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [preferences, setPreferences] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    unread: 0,
    byCategory: {},
  });
  const [firestoreError, setFirestoreError] = useState(null);
  const [testWriting, setTestWriting] = useState(false);

  const adminEmail = user?.email?.toLowerCase() || '';
  const isSuper = user?.role === 'superadmin';

  // Load preferences
  useEffect(() => {
    if (!adminEmail) return;
    getAdminNotificationPreferences(adminEmail).then(prefs => {
      setPreferences(prefs);
    });
  }, [adminEmail]);

  // Write a test activity to verify Firestore connectivity
  const writeTestActivity = async () => {
    setTestWriting(true);
    try {
      const testId = `test_activity_${Date.now()}`;
      await setDoc(doc(db, 'admin_notifications', testId), {
        id: testId,
        category: 'system',
        title: '🧪 Test Activity',
        message: `Activity feed test written by ${user?.name || adminEmail} at ${new Date().toLocaleString('en-KE')}`,
        icon: '🧪',
        userEmail: adminEmail,
        userName: user?.name || adminEmail,
        metadata: { test: true },
        priority: 'low',
        readBy: [],
        createdAt: serverTimestamp(),
      });
      showToast?.('✅ Test activity written — it should appear below');
    } catch (err) {
      console.error('[writeTestActivity]', err);
      showToast?.('❌ Write failed: ' + err.message);
      setFirestoreError(err.message);
    }
    setTestWriting(false);
  };

  // Listen to notifications
  // NOTE: No orderBy — we sort client-side so legacy docs without `createdAt`
  // are also included (Firestore excludes docs missing the ordered field).
  useEffect(() => {
    setLoading(true);
    setFirestoreError(null);

    // Use a simple collection scan — no composite index needed, sort client-side.
    // limitToLast not used — plain limit(500) with client-side sort.
    const q = query(
      collection(db, 'admin_notifications'),
      limit(500)
    );

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      snap => {
      // Filter out soft-deleted notifications client-side
      const fresh = snap.docs
        .map(d => {
          const data = d.data();
          // Normalize schema: older Cloud Function notifications use `type` instead of `category`
          // and `status: "unread"` instead of `readBy: []`. Normalize them here.
          const normalized = { id: d.id, ...data };
          if (!normalized.category && normalized.type) {
            // Map known legacy types to proper categories
            const typeToCategory = {
              order_confirmed_auto: 'book_purchase',
              new_order:            'cart_checkout',
              payment_issue:        'payment',
              account_deletion:     'account_deletion',
            };
            normalized.category = typeToCategory[normalized.type] || 'system';
          }
          if (!normalized.readBy) {
            // Legacy: status:"unread" → readBy:[], status:"read" → readBy:["*"]
            normalized.readBy = normalized.status === 'read' ? ['*'] : [];
          }
          if (!normalized.title && normalized.type) {
            normalized.title = normalized.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
          if (!normalized.message && normalized.orderId) {
            normalized.message = `Order #${normalized.orderId} — KES ${normalized.total || 0}`;
          }
          return normalized;
        })
        .filter(n => n.deleted !== true)
        // Sort newest first client-side — handles both Timestamp and missing createdAt
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? (typeof a.createdAt === 'number' ? a.createdAt : 0);
          const tb = b.createdAt?.toMillis?.() ?? (typeof b.createdAt === 'number' ? b.createdAt : 0);
          return tb - ta;
        });
      setNotifs(fresh);
      setFirestoreError(null);
      
      // Calculate stats
      const byCategory = {};
      Object.values(NOTIFICATION_CATEGORIES).forEach(cat => {
        byCategory[cat] = 0;
      });
      
      fresh.forEach(n => {
        if (byCategory[n.category] !== undefined) {
          byCategory[n.category]++;
        }
      });
      
      const unread = fresh.filter(n => !(n.readBy || []).includes(adminEmail)).length;
      
      setStats({
        total: fresh.length,
        unread,
        byCategory,
      });
      
      setLoading(false);
    }, (err) => {
      console.error('[ActivityPanel] Firestore error:', err);
      setFirestoreError(err.message || 'Failed to load activity feed');
      setLoading(false);
    });

    return () => unsub();
  }, [adminEmail]);

  // Filter notifications
  useEffect(() => {
    let filtered = [...notifs];
    
    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(n => n.category === selectedCategory);
    }
    
    // Unread filter
    if (showUnreadOnly) {
      filtered = filtered.filter(n => !(n.readBy || []).includes(adminEmail));
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n => 
        n.title?.toLowerCase().includes(query) ||
        n.message?.toLowerCase().includes(query) ||
        n.userEmail?.toLowerCase().includes(query) ||
        n.userName?.toLowerCase().includes(query)
      );
    }
    
    setFilteredNotifs(filtered);
  }, [notifs, selectedCategory, showUnreadOnly, searchQuery, adminEmail]);

  const handleMarkRead = async (notifId) => {
    await markNotificationRead(notifId, adminEmail);
  };

  const handleMarkAllRead = async () => {
    const unreadIds = filteredNotifs
      .filter(n => !(n.readBy || []).includes(adminEmail))
      .map(n => n.id);
    if (unreadIds.length === 0) return;
    await markAllNotificationsRead(unreadIds, adminEmail);
    showToast?.('✅ Marked all as read');
  };

  const handleDelete = async (notifId) => {
    if (!isSuper) {
      showToast?.('❌ Only super admins can delete notifications');
      return;
    }
    if (!confirm('Delete this notification? This cannot be undone.')) return;
    await deleteNotification(notifId);
    showToast?.('🗑 Notification deleted');
  };

  const handleClearAll = async () => {
    if (!isSuper) {
      showToast?.('❌ Only super admins can clear notifications');
      return;
    }
    if (!confirm(`Clear all ${filteredNotifs.length} notifications? This cannot be undone.`)) return;
    
    const promises = filteredNotifs.map(n => deleteNotification(n.id));
    await Promise.all(promises);
    showToast?.('🗑 All notifications cleared');
  };

  const categoryOptions = [
    { value: 'all', label: '📊 All Activity', count: stats.total },
    ...Object.values(NOTIFICATION_CATEGORIES).map(cat => ({
      value: cat,
      label: `${getCategoryIcon(cat)} ${getCategoryLabel(cat)}`,
      count: stats.byCategory[cat] || 0,
    }))
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
        <p>Loading activity...</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: 6 }}>
            📊 Activity & Notifications
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Real-time tracking of user activity and site events
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={writeTestActivity}
            disabled={testWriting}
            className="btn btn-ghost btn-sm"
            style={{ background: 'rgba(74,158,255,0.08)', color: '#4a9eff', border: '1px solid rgba(74,158,255,0.2)' }}
            title="Write a test activity to verify Firestore is working"
          >
            {testWriting ? '⏳ Writing…' : '🧪 Test'}
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            className="btn btn-ghost btn-sm"
            style={{ background: showSettings ? 'rgba(201,168,76,0.1)' : undefined }}
          >
            ⚙️ Settings
          </button>
          {isSuper && filteredNotifs.length > 0 && (
            <button onClick={handleClearAll} className="btn btn-sm" style={{ background: 'rgba(231,76,60,0.1)', color: '#e74c3c' }}>
              🗑 Clear All
            </button>
          )}
        </div>
      </div>

      {/* Firestore error banner */}
      {firestoreError && (
        <div style={{
          background: 'rgba(231,76,60,0.1)',
          border: '1px solid rgba(231,76,60,0.4)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <div>
            <strong style={{ color: '#e74c3c', display: 'block', marginBottom: 2 }}>Firestore connection error</strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{firestoreError}</span>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && preferences && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <NotificationSettings
            preferences={preferences}
            setPreferences={setPreferences}
            adminEmail={adminEmail}
            onClose={() => setShowSettings(false)}
            showToast={showToast}
          />
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 20,
      }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>
            Total Activity
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--gold)' }}>
            {stats.total}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>
            Unread
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#e74c3c' }}>
            {stats.unread}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>
            Filtered Results
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4a9eff' }}>
            {filteredNotifs.length}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {/* Category Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, color: 'var(--muted)' }}>
              Category
            </label>
            <select
              className="field"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ width: '100%' }}
            >
              {categoryOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.count})
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, color: 'var(--muted)' }}>
              Search
            </label>
            <input
              type="text"
              className="field"
              placeholder="Search title, message, user..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {/* Unread Toggle */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showUnreadOnly}
                onChange={e => setShowUnreadOnly(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Show unread only
            </label>
            {stats.unread > 0 && (
              <button onClick={handleMarkAllRead} className="btn btn-sm btn-ghost">
                ✓ Mark all read
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      {filteredNotifs.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {firestoreError ? '⚠️' : searchQuery ? '🔍' : showUnreadOnly ? '✅' : '📊'}
          </div>
          <p style={{ fontSize: '1rem', marginBottom: 8, fontWeight: 600 }}>
            {firestoreError
              ? 'Firestore connection problem'
              : searchQuery
              ? 'No matching activity'
              : showUnreadOnly
              ? 'All caught up!'
              : notifs.length === 0
              ? 'No activity recorded yet'
              : 'No results for this filter'}
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', maxWidth: 420, margin: '0 auto 20px' }}>
            {firestoreError
              ? 'Check your internet connection and try refreshing.'
              : searchQuery
              ? 'Try adjusting your search or filters.'
              : showUnreadOnly
              ? 'You have no unread notifications.'
              : notifs.length === 0
              ? 'Activity is recorded when users log in, register, place orders, submit contact messages, or interact with the site. Use the 🧪 Test button above to verify the feed is working.'
              : 'Try selecting a different category or clearing filters.'}
          </p>
          {notifs.length === 0 && !firestoreError && !searchQuery && !showUnreadOnly && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={writeTestActivity}
                disabled={testWriting}
                className="btn btn-primary btn-sm"
              >
                {testWriting ? '⏳ Writing…' : '🧪 Write Test Activity'}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn btn-ghost btn-sm"
              >
                🔄 Reload Page
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredNotifs.map(n => {
            const isUnread = !(n.readBy || []).includes(adminEmail);
            return (
              <div
                key={n.id}
                className="card"
                style={{
                  padding: 16,
                  background: isUnread ? 'rgba(201,168,76,0.05)' : 'var(--card)',
                  border: isUnread ? '1px solid rgba(201,168,76,0.3)' : '1px solid var(--border)',
                  borderLeft: isUnread ? '4px solid var(--gold)' : '4px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {/* Icon */}
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: isUnread ? 'rgba(201,168,76,0.15)' : 'rgba(148,144,160,0.1)',
                    color: isUnread ? 'var(--gold)' : 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.3rem',
                  }}>
                    {n.icon || '🔔'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'flex-start',
                      gap: 12,
                      marginBottom: 6,
                    }}>
                      <strong style={{
                        fontSize: '0.95rem',
                        fontWeight: isUnread ? 700 : 500,
                        color: isUnread ? 'var(--gold)' : 'var(--text)',
                        lineHeight: 1.3,
                      }}>
                        {n.title}
                      </strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isUnread && (
                          <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--gold)',
                            flexShrink: 0,
                          }} />
                        )}
                        {isSuper && (
                          <button
                            onClick={() => handleDelete(n.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#e74c3c',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '0.85rem',
                              opacity: 0.6,
                            }}
                            title="Delete notification"
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </div>

                    <p style={{
                      fontSize: '0.85rem',
                      color: 'var(--muted)',
                      lineHeight: 1.5,
                      marginBottom: 10,
                    }}>
                      {n.message}
                    </p>

                    <div style={{ 
                      display: 'flex', 
                      gap: 12, 
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{
                        fontSize: '0.7rem',
                        color: 'var(--gold)',
                        background: 'rgba(201,168,76,0.1)',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}>
                        {getCategoryLabel(n.category)}
                      </span>
                      
                      {n.userEmail && (
                        <span style={{
                          fontSize: '0.72rem',
                          color: 'var(--muted)',
                        }}>
                          👤 {n.userName || n.userEmail}
                        </span>
                      )}
                      
                      <span style={{
                        fontSize: '0.72rem',
                        color: 'var(--muted)',
                      }}>
                        🕐 {fmtTimeFull(n.createdAt)}
                      </span>

                      {n.priority === 'high' && (
                        <span style={{
                          fontSize: '0.68rem',
                          color: '#e74c3c',
                          background: 'rgba(231,76,60,0.1)',
                          padding: '2px 7px',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}>
                          ⚠️ HIGH
                        </span>
                      )}

                      {isUnread && (
                        <button
                          onClick={() => handleMarkRead(n.id)}
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--gold)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            padding: 0,
                          }}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotificationSettings({ preferences, setPreferences, adminEmail, onClose, showToast }) {
  const [localPrefs, setLocalPrefs] = useState(preferences);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const success = await saveAdminNotificationPreferences(adminEmail, localPrefs);
    if (success) {
      setPreferences(localPrefs);
      showToast?.('✅ Settings saved');
      onClose();
    } else {
      showToast?.('❌ Failed to save settings');
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

  const muteAll = () => {
    setLocalPrefs(prev => ({
      ...prev,
      mutedCategories: Object.values(NOTIFICATION_CATEGORIES),
    }));
  };

  const unmuteAll = () => {
    setLocalPrefs(prev => ({
      ...prev,
      mutedCategories: [],
    }));
  };

  const categories = Object.values(NOTIFICATION_CATEGORIES);
  const allMuted = (localPrefs.mutedCategories || []).length === categories.length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>🔔 Notification Preferences</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>
          ✕
        </button>
      </div>

      {/* Global toggles */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 12,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1px solid var(--border)',
      }}>
        <label style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.88rem',
          cursor: 'pointer',
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
        }}>
          <span>🔊 Sound Alerts</span>
          <input
            type="checkbox"
            checked={localPrefs.soundEnabled}
            onChange={e => setLocalPrefs(prev => ({ ...prev, soundEnabled: e.target.checked }))}
            style={{ cursor: 'pointer', width: 18, height: 18 }}
          />
        </label>
        <label style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.88rem',
          cursor: 'pointer',
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
        }}>
          <span>💻 Desktop Notifications</span>
          <input
            type="checkbox"
            checked={localPrefs.desktopEnabled}
            onChange={e => setLocalPrefs(prev => ({ ...prev, desktopEnabled: e.target.checked }))}
            style={{ cursor: 'pointer', width: 18, height: 18 }}
          />
        </label>
      </div>

      {/* Category toggles */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}>
          <div style={{ 
            fontSize: '0.82rem', 
            color: 'var(--muted)', 
            fontWeight: 600,
          }}>
            Notification Categories:
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={unmuteAll}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.72rem' }}
            >
              Enable All
            </button>
            <button 
              onClick={muteAll}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.72rem' }}
            >
              Mute All
            </button>
          </div>
        </div>
        
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 8,
        }}>
          {categories.map(cat => {
            const isMuted = (localPrefs.mutedCategories || []).includes(cat);
            return (
              <label
                key={cat}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.82rem',
                  padding: '10px 12px',
                  background: isMuted ? 'rgba(231,76,60,0.05)' : 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  border: isMuted ? '1px solid rgba(231,76,60,0.2)' : '1px solid transparent',
                }}
              >
                <span style={{ opacity: isMuted ? 0.5 : 1 }}>
                  {getCategoryIcon(cat)} {CATEGORY_LABELS[cat] || cat}
                </span>
                <input
                  type="checkbox"
                  checked={!isMuted}
                  onChange={() => toggleCategory(cat)}
                  style={{ cursor: 'pointer', width: 16, height: 16 }}
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ flex: 1, fontSize: '0.85rem' }}
        >
          {saving ? '⏳ Saving...' : '💾 Save Preferences'}
        </button>
        <button
          onClick={onClose}
          className="btn btn-ghost"
          style={{ fontSize: '0.85rem' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
