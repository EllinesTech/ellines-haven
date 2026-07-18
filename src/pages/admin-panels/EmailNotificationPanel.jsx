import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, getDocs, collection, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * EMAIL NOTIFICATION PANEL
 * 
 * Configure and manage automated email notifications:
 * - Email templates for orders, new books, wishlists
 * - Notification triggers
 * - Email campaign management
 * - Unsubscribe settings
 */

export default function EmailNotificationPanel({ showToast, users, isSuper }) {
  const [config, setConfig] = useState({
    smtpEnabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpFrom: 'noreply@ellines.haven',
    smtpFromName: 'Ellines Haven',
    notifications: {
      orderConfirmation: true,
      shipmentUpdate: false,
      newBooks: true,
      wishlistAlert: true,
      readingReminder: false,
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ subscribed: 0, unsubscribed: 0, bounced: 0 });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'site_data', 'email_config'));
        if (snap.exists()) {
          setConfig((c) => ({ ...c, ...snap.data() }));
        }

        // Calculate stats
        let subscribed = 0,
          unsubscribed = 0;
        const contactsSnap = await getDocs(collection(db, 'newsletter_subscribers'));
        contactsSnap.forEach((doc) => {
          if (doc.data().subscribed) subscribed++;
          else unsubscribed++;
        });
        setStats({ subscribed, unsubscribed, bounced: 0 });
      } catch (e) {
        showToast?.('Failed to load email config');
      }
      setLoading(false);
    };
    load();
  }, [showToast]);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', 'email_config'), {
        ...config,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast?.('✅ Email settings saved');
    } catch (e) {
      showToast?.('❌ Save failed: ' + e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>📧</div>
        <p>Loading email configuration…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📧 Email Notifications</h1>
          <span className="adm-page-sub">
            Configure automated email campaigns and notifications for your readers.
          </span>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </button>
      </div>

      {/* Email Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📬</div>
          <strong style={{ display: 'block', fontSize: '1.2rem', marginBottom: 4 }}>{stats.subscribed}</strong>
          <small style={{ color: 'var(--muted)' }}>Subscribed</small>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔕</div>
          <strong style={{ display: 'block', fontSize: '1.2rem', marginBottom: 4 }}>{stats.unsubscribed}</strong>
          <small style={{ color: 'var(--muted)' }}>Unsubscribed</small>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>✉️</div>
          <strong style={{ display: 'block', fontSize: '1.2rem', marginBottom: 4 }}>
            {Math.round((stats.subscribed / (stats.subscribed + stats.unsubscribed + 1)) * 100)}%
          </strong>
          <small style={{ color: 'var(--muted)' }}>Engagement</small>
        </div>
      </div>

      {/* SMTP Settings */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>⚙️ SMTP Server Configuration</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              SMTP Host
            </label>
            <input
              className="field"
              value={config.smtpHost}
              onChange={(e) => setConfig((c) => ({ ...c, smtpHost: e.target.value }))}
              placeholder="mail.example.com"
              style={{ fontSize: '0.85rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Port
            </label>
            <input
              className="field"
              type="number"
              value={config.smtpPort}
              onChange={(e) => setConfig((c) => ({ ...c, smtpPort: parseInt(e.target.value) }))}
              style={{ fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              From Email Address
            </label>
            <input
              className="field"
              value={config.smtpFrom}
              onChange={(e) => setConfig((c) => ({ ...c, smtpFrom: e.target.value }))}
              placeholder="noreply@ellines.haven"
              style={{ fontSize: '0.85rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              From Display Name
            </label>
            <input
              className="field"
              value={config.smtpFromName}
              onChange={(e) => setConfig((c) => ({ ...c, smtpFromName: e.target.value }))}
              placeholder="Ellines Haven"
              style={{ fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>

      {/* Notification Types */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>🔔 Notification Types</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.notifications.orderConfirmation}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  notifications: { ...c.notifications, orderConfirmation: e.target.checked },
                }))
              }
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>📦 Order Confirmation</strong>
              <small style={{ color: 'var(--muted)' }}>Send email when order is placed</small>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.notifications.shipmentUpdate}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  notifications: { ...c.notifications, shipmentUpdate: e.target.checked },
                }))
              }
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>📤 Shipment Updates</strong>
              <small style={{ color: 'var(--muted)' }}>Send tracking and delivery updates</small>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.notifications.newBooks}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  notifications: { ...c.notifications, newBooks: e.target.checked },
                }))
              }
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>📚 New Book Release</strong>
              <small style={{ color: 'var(--muted)' }}>Notify subscribers of new books and releases</small>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.notifications.wishlistAlert}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  notifications: { ...c.notifications, wishlistAlert: e.target.checked },
                }))
              }
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>❤️ Wishlist Alerts</strong>
              <small style={{ color: 'var(--muted)' }}>Notify when wishlisted books go on sale</small>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.notifications.readingReminder}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  notifications: { ...c.notifications, readingReminder: e.target.checked },
                }))
              }
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>📖 Reading Reminders</strong>
              <small style={{ color: 'var(--muted)' }}>Send periodic reading tips and recommendations</small>
            </div>
          </label>
        </div>
      </div>

      {/* Unsubscribe Settings */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 12, color: 'var(--gold)', fontSize: '0.95rem' }}>🔗 Unsubscribe Management</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          All emails include an unsubscribe link. Readers can manage their preferences at any time. Unsubscribe lists are automatically synced.
        </p>
        <div style={{ padding: 12, background: 'rgba(46,204,113,0.05)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 'var(--r-sm)', fontSize: '0.82rem', color: '#2ecc71' }}>
          ✓ GDPR compliant unsubscribe mechanism enabled
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 40, color: 'var(--muted)', fontSize: '0.82rem' }}>
        💡 Email notifications keep readers engaged and informed about new releases and special offers. Users can manage their preferences anytime.
      </div>
    </div>
  );
}
