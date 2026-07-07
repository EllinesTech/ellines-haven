import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
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

  const adminEmail = user?.email?.toLowerCase() || '';
  const isSuper = user?.role === 'superadmin';

  // Load preferences
  useEffect(() => {
    if (!adminEmail) return;
    getAdminNotificationPreferences(adminEmail).then(prefs => {
      setPreferences(prefs);
    });
  }, [adminEmail]);

  // Listen to notifications
  useEffect(() => {
    setLoading(true);
    // Simple query with no composite-index requirement.
    // We filter out soft-deleted docs client-side to avoid needing
    // a (deleted ASC + createdAt DESC) composite index in Firestore.
    const q = query(
      collection(db, 'admin_notifications'),
      orderBy('createdAt', 'desc'),
      limit(500)
    );

    const unsub = onSnapshot(q, snap => {
      // Filter out soft-deleted notifications client-side
      const fresh = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => n.deleted !== true);
      setNotifs(fresh);
      
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
    }, () => setLoading(false));

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
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📊</div>
          <p style={{ fontSize: '1rem', marginBottom: 8 }}>
            {searchQuery ? 'No matching activity' : showUnreadOnly ? 'All caught up!' : 'No activity yet'}
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            {searchQuery 
              ? 'Try adjusting your search or filters'
              : showUnreadOnly 
                ? 'You have no unread notifications'
                : 'User activity will appear here as it happens'
            }
          </p>
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
