import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const DEFAULT_SETTINGS = {
  // Widget visibility
  widgetEnabled: true,
  aiTabEnabled: true,
  liveTabEnabled: true,
  waTabEnabled: true,

  // AI tab
  aiName: 'Ellinea',
  aiTagline: 'Your Ellines Haven Assistant',
  aiWelcomeMessage: "Hi! I'm **Ellinea**, your Ellines Haven assistant. Ask me anything about books, payments, your account, or the platform! 📚\n\nWant to talk to a human? Click the **💬 Live Agent** tab above.",
  aiEnabled: true,

  // Quick replies
  quickReplies: [
    { label: '📚 Browse books',    value: 'Show me the books available' },
    { label: '💳 How to pay',      value: 'How do I pay for a book?' },
    { label: '📖 My library',      value: 'How do I access my library?' },
    { label: '✍️ About author',    value: 'Tell me about the author' },
    { label: '💬 Talk to a human', value: 'I want to talk to a human agent' },
  ],

  // WhatsApp tab
  waNumbers: [
    { num: '254748255466', label: '0748 255 466', role: 'Primary support' },
    { num: '254728807213', label: '0728 807 213', role: 'Alternate' },
  ],
  waEmail: 'ellines.haven@gmail.com',
  waSupportHours: 'Mon–Sat\n8am–8pm EAT',
  waResponseTime: 'Usually under\n1 hour',

  // Live chat
  agentOnline: false,
  liveOfflineMessage: 'Leave a message — reply within 24 hrs',
  liveOnlineMessage: 'Agent online',
  liveGreeting: "Hi! How can we help you today?\nType a message below — an agent will reply shortly.",

  // Contact info (shown in footer / contact page)
  contactPhone1: '0748 255 466',
  contactPhone2: '0728 807 213',
  contactEmail: 'ellines.haven@gmail.com',
  contactHours: 'Mon–Sat, 8am–8pm EAT',
  contactLocation: 'Nairobi, Kenya',
};

export default function ChatSettingsPanel({ showToast }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('widget'); // widget | ai | wa | live | contact
  const [agentBusy, setAgentBusy] = useState(false);

  // Load from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'chat_settings'), snap => {
      if (snap.exists()) {
        setSettings(s => ({ ...DEFAULT_SETTINGS, ...s, ...snap.data() }));
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Also listen to agent_status separately (it's a separate doc)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'agent_status'), snap => {
      if (snap.exists()) {
        setSettings(s => ({ ...s, agentOnline: !!snap.data()?.online }));
      }
    }, () => {});
    return () => unsub();
  }, []);

  const save = async (updates = settings) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', 'chat_settings'), {
        ...updates,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast?.('✅ Chat settings saved');
    } catch (e) {
      showToast?.('❌ Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const toggleAgentOnline = async () => {
    setAgentBusy(true);
    const next = !settings.agentOnline;
    try {
      await setDoc(doc(db, 'site_data', 'agent_status'), {
        online: next,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSettings(s => ({ ...s, agentOnline: next }));
      showToast?.(next ? '🟢 You are now ONLINE — users can see you' : '⭕ You are now OFFLINE');
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setAgentBusy(false);
  };

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const updateQR = (i, field, val) => {
    const next = settings.quickReplies.map((q, idx) => idx === i ? { ...q, [field]: val } : q);
    set('quickReplies', next);
  };
  const addQR = () => set('quickReplies', [...(settings.quickReplies || []), { label: '', value: '' }]);
  const removeQR = i => set('quickReplies', settings.quickReplies.filter((_, idx) => idx !== i));

  const updateWaNum = (i, field, val) => {
    const next = settings.waNumbers.map((n, idx) => idx === i ? { ...n, [field]: val } : n);
    set('waNumbers', next);
  };
  const addWaNum = () => set('waNumbers', [...(settings.waNumbers || []), { num: '', label: '', role: '' }]);
  const removeWaNum = i => set('waNumbers', settings.waNumbers.filter((_, idx) => idx !== i));

  const TABS = [
    { k: 'widget',  icon: '🧩', label: 'Widget' },
    { k: 'ai',      icon: '✦',  label: 'AI (Ellinea)' },
    { k: 'live',    icon: '💬', label: 'Live Chat' },
    { k: 'wa',      icon: '📱', label: 'WhatsApp' },
    { k: 'contact', icon: '📞', label: 'Contact Info' },
  ];

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
      <p>Loading chat settings…</p>
    </div>
  );

  return (
    <div className="adm-page">
      {/* Header */}
      <div className="adm-page-head">
        <div>
          <h1>Chat &amp; Contact Settings</h1>
          <span className="adm-page-sub">
            Control the unified chat widget — AI assistant, live agent, WhatsApp, and contact details
          </span>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => save()}
          disabled={saving}
        >
          {saving ? '⏳ Saving…' : '💾 Save All Changes'}
        </button>
      </div>

      {/* Agent Online Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px',
        background: settings.agentOnline ? 'rgba(46,204,113,0.08)' : 'rgba(100,116,139,0.08)',
        border: `1px solid ${settings.agentOnline ? 'rgba(46,204,113,0.35)' : 'rgba(100,116,139,0.25)'}`,
        borderRadius: 'var(--r-sm)', marginBottom: 20,
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: settings.agentOnline ? '#2ecc71' : '#64748b',
          flexShrink: 0,
          boxShadow: settings.agentOnline ? '0 0 8px rgba(46,204,113,0.6)' : 'none',
        }} />
        <div style={{ flex: 1 }}>
          <strong style={{ color: settings.agentOnline ? '#2ecc71' : 'var(--muted)', fontSize: '0.9rem' }}>
            Live Agent: {settings.agentOnline ? 'ONLINE' : 'OFFLINE'}
          </strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
            {settings.agentOnline
              ? 'Users can see you\'re online in the Live Agent tab. They\'ll expect a fast reply.'
              : 'Users see "Leave a message — we\'ll reply within 24hrs" in the Live Agent tab.'}
          </div>
        </div>
        <button
          onClick={toggleAgentOnline}
          disabled={agentBusy}
          style={{
            padding: '9px 22px', borderRadius: 'var(--r-sm)', border: 'none',
            cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit',
            background: settings.agentOnline ? 'rgba(231,76,60,0.15)' : 'rgba(46,204,113,0.15)',
            color: settings.agentOnline ? '#e74c3c' : '#2ecc71',
            transition: 'all 0.2s',
          }}
        >
          {agentBusy ? '⏳' : settings.agentOnline ? '🔴 Go Offline' : '🟢 Go Online'}
        </button>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap',
        background: 'var(--surface)', borderRadius: 'var(--r-sm)',
        padding: 6, border: '1px solid var(--border)', marginBottom: 24,
      }}>
        {TABS.map(t => (
          <button key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: '7px 16px', borderRadius: 'var(--r-sm)', border: 'none',
              background: tab === t.k ? 'var(--gold)' : 'transparent',
              color: tab === t.k ? '#000' : 'var(--muted)',
              fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── WIDGET TAB ── */}
      {tab === 'widget' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="adm-info-note" style={{ marginBottom: 4 }}>
            These controls show/hide entire sections of the chat widget. Turn off a tab to hide it from all users.
          </div>

          {[
            { key: 'widgetEnabled', icon: '🧩', label: 'Chat Widget Visible',       desc: 'Show the gold FAB button on all pages. Turn off to hide the whole widget.' },
            { key: 'aiTabEnabled',  icon: '✦',  label: 'Ellinea AI Tab',           desc: 'Show the AI assistant tab inside the widget.' },
            { key: 'liveTabEnabled',icon: '💬', label: 'Live Agent Tab',           desc: 'Show the Live Chat tab where users can talk to a real agent.' },
            { key: 'waTabEnabled',  icon: '📱', label: 'WhatsApp Tab',             desc: 'Show the WhatsApp contact tab with phone numbers and email.' },
          ].map(ctrl => (
            <div key={ctrl.key} className="card" style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
              border: settings[ctrl.key] ? '1px solid rgba(201,168,76,0.3)' : '1px solid var(--dim)',
              background: settings[ctrl.key] ? 'rgba(201,168,76,0.04)' : 'rgba(255,255,255,0.02)',
            }}>
              <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{ctrl.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 3 }}>{ctrl.label}</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{ctrl.desc}</span>
              </div>
              <button
                onClick={() => set(ctrl.key, !settings[ctrl.key])}
                style={{
                  flexShrink: 0, minWidth: 60, padding: '7px 16px',
                  borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit',
                  background: settings[ctrl.key] ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)',
                  color: settings[ctrl.key] ? 'var(--gold)' : 'var(--muted)',
                  transition: 'all 0.2s',
                }}
              >
                {settings[ctrl.key] ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={saving}>
              {saving ? '⏳' : '💾 Save'}
            </button>
          </div>
        </div>
      )}

      {/* ── AI TAB ── */}
      {tab === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="adm-settings-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="adm-field-group">
              <label>AI Assistant Name</label>
              <input className="field" value={settings.aiName || ''} onChange={e => set('aiName', e.target.value)} placeholder="Ellinea" />
              <small style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>Shown as the tab label and inside the chat</small>
            </div>
            <div className="adm-field-group">
              <label>AI Tagline</label>
              <input className="field" value={settings.aiTagline || ''} onChange={e => set('aiTagline', e.target.value)} placeholder="Your Ellines Haven Assistant" />
            </div>
          </div>

          <div className="adm-field-group">
            <label>Welcome Message (supports **bold** and line breaks)</label>
            <textarea className="field" rows={4} value={settings.aiWelcomeMessage || ''} onChange={e => set('aiWelcomeMessage', e.target.value)} style={{ resize: 'vertical' }} />
            <small style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>This is the first message users see when they open the AI tab.</small>
          </div>

          {/* Quick Replies */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: '0.9rem' }}>Quick Reply Buttons</strong>
              <button className="btn btn-ghost btn-sm" onClick={addQR}>+ Add Button</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(settings.quickReplies || []).map((qr, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <input className="field" value={qr.label} onChange={e => updateQR(i, 'label', e.target.value)} placeholder="Button label e.g. 📚 Browse books" />
                  <input className="field" value={qr.value} onChange={e => updateQR(i, 'value', e.target.value)} placeholder="Message sent e.g. Show me the books" />
                  <button onClick={() => removeQR(i)} style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#e74c3c', borderRadius: 'var(--r-sm)', padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {(!settings.quickReplies || settings.quickReplies.length === 0) && (
                <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No quick replies yet. Add buttons above.</p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={saving}>
              {saving ? '⏳' : '💾 Save AI Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── LIVE CHAT TAB ── */}
      {tab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="adm-info-note">
            The Live Agent tab lets users send real-time messages that appear in your <strong>Messages Panel</strong> → Live Chat tab. Toggle your online status using the banner above.
          </div>

          <div className="adm-settings-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="adm-field-group">
              <label>Online Status Message</label>
              <input className="field" value={settings.liveOnlineMessage || ''} onChange={e => set('liveOnlineMessage', e.target.value)} placeholder="Agent online" />
              <small style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>Shown when you're marked online</small>
            </div>
            <div className="adm-field-group">
              <label>Offline Status Message</label>
              <input className="field" value={settings.liveOfflineMessage || ''} onChange={e => set('liveOfflineMessage', e.target.value)} placeholder="Leave a message — reply within 24 hrs" />
              <small style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>Shown when you're offline</small>
            </div>
          </div>

          <div className="adm-field-group">
            <label>Greeting Message (shown when user opens a new chat)</label>
            <textarea className="field" rows={3} value={settings.liveGreeting || ''} onChange={e => set('liveGreeting', e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={saving}>
              {saving ? '⏳' : '💾 Save Live Chat Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── WHATSAPP TAB ── */}
      {tab === 'wa' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Phone Numbers */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: '0.9rem' }}>WhatsApp Numbers</strong>
              <button className="btn btn-ghost btn-sm" onClick={addWaNum}>+ Add Number</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(settings.waNumbers || []).map((n, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <div className="adm-field-group" style={{ margin: 0 }}>
                    {i === 0 && <label style={{ fontSize: '0.72rem' }}>Number (with country code)</label>}
                    <input className="field" value={n.num} onChange={e => updateWaNum(i, 'num', e.target.value)} placeholder="254748255466" />
                  </div>
                  <div className="adm-field-group" style={{ margin: 0 }}>
                    {i === 0 && <label style={{ fontSize: '0.72rem' }}>Display Label</label>}
                    <input className="field" value={n.label} onChange={e => updateWaNum(i, 'label', e.target.value)} placeholder="0748 255 466" />
                  </div>
                  <div className="adm-field-group" style={{ margin: 0 }}>
                    {i === 0 && <label style={{ fontSize: '0.72rem' }}>Role</label>}
                    <input className="field" value={n.role} onChange={e => updateWaNum(i, 'role', e.target.value)} placeholder="Primary support" />
                  </div>
                  <button
                    onClick={() => removeWaNum(i)}
                    style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#e74c3c', borderRadius: 'var(--r-sm)', padding: '8px 10px', cursor: 'pointer', alignSelf: i === 0 ? 'flex-end' : 'center' }}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="adm-settings-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="adm-field-group">
              <label>Support Email</label>
              <input className="field" value={settings.waEmail || ''} onChange={e => set('waEmail', e.target.value)} placeholder="ellines.haven@gmail.com" />
            </div>
            <div className="adm-field-group">
              <label>Response Time (shown in widget)</label>
              <input className="field" value={(settings.waResponseTime || '').replace(/\n/g, ' | ')} onChange={e => set('waResponseTime', e.target.value.replace(/ \| /g, '\n'))} placeholder="Usually under 1 hour" />
            </div>
            <div className="adm-field-group">
              <label>Support Hours (shown in widget)</label>
              <input className="field" value={(settings.waSupportHours || '').replace(/\n/g, ' | ')} onChange={e => set('waSupportHours', e.target.value.replace(/ \| /g, '\n'))} placeholder="Mon–Sat | 8am–8pm EAT" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={saving}>
              {saving ? '⏳' : '💾 Save WhatsApp Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── CONTACT INFO TAB ── */}
      {tab === 'contact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="adm-info-note">
            This contact information is used across the website — Contact page, footer, maintenance page, and anywhere else contact details appear.
          </div>

          <div className="adm-settings-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="adm-field-group">
              <label>Primary Phone Number</label>
              <input className="field" value={settings.contactPhone1 || ''} onChange={e => set('contactPhone1', e.target.value)} placeholder="0748 255 466" />
            </div>
            <div className="adm-field-group">
              <label>Secondary Phone Number</label>
              <input className="field" value={settings.contactPhone2 || ''} onChange={e => set('contactPhone2', e.target.value)} placeholder="0728 807 213" />
            </div>
            <div className="adm-field-group">
              <label>Support Email</label>
              <input className="field" value={settings.contactEmail || ''} onChange={e => set('contactEmail', e.target.value)} placeholder="ellines.haven@gmail.com" />
            </div>
            <div className="adm-field-group">
              <label>Business Hours</label>
              <input className="field" value={settings.contactHours || ''} onChange={e => set('contactHours', e.target.value)} placeholder="Mon–Sat, 8am–8pm EAT" />
            </div>
            <div className="adm-field-group">
              <label>Location</label>
              <input className="field" value={settings.contactLocation || ''} onChange={e => set('contactLocation', e.target.value)} placeholder="Nairobi, Kenya" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={saving}>
              {saving ? '⏳' : '💾 Save Contact Info'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
