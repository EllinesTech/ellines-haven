/**
 * SMSPanel — Admin panel for sending SMS broadcasts to users via Africa's Talking.
 */

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const MAX_SMS = 160;

export default function SMSPanel({ showToast, users = [] }) {
  const { user } = useApp();

  const [message,       setMessage]      = useState('');
  const [audience,      setAudience]     = useState('all');
  const [customPhones,  setCustomPhones] = useState('');
  const [campaignName,  setCampaignName] = useState('');
  const [sending,       setSending]      = useState(false);
  const [sendResult,    setSendResult]   = useState(null);
  const [campaigns,     setCampaigns]    = useState([]);
  const [loadingHistory,setLoadingHistory] = useState(true);
  const [fsUsers,       setFsUsers]      = useState([]);

  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setFsUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingHistory(true);
    const q = query(collection(db, 'sms_campaigns'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingHistory(false);
    }, () => setLoadingHistory(false));
    return () => unsub();
  }, []);

  const allUsersWithPhone = [
    ...fsUsers.filter(u => u.phone),
    ...users.filter(u => u.phone && !fsUsers.find(f => f.email?.toLowerCase() === u.email?.toLowerCase())),
  ];

  const targetPhones = audience === 'all'
    ? allUsersWithPhone.map(u => u.phone).filter(Boolean)
    : customPhones.split(/[\n,;]+/).map(p => p.trim()).filter(p => p.length >= 7);

  const charsLeft = MAX_SMS - message.length;

  const handleSend = async () => {
    if (!message.trim()) { showToast?.('⚠️ Message is empty'); return; }
    if (message.length > MAX_SMS) { showToast?.('⚠️ Exceeds 160 characters'); return; }
    if (!targetPhones.length) { showToast?.('⚠️ No phone numbers to send to'); return; }
    if (!window.confirm(`Send SMS to ${targetPhones.length} recipient${targetPhones.length !== 1 ? 's' : ''}?\n\n"${message}"`)) return;

    setSending(true);
    setSendResult(null);
    try {
      const fn  = httpsCallable(getFunctions(), 'sendSmsBroadcast');
      const res = await fn({ message: message.trim(), phones: targetPhones, campaignName: campaignName.trim() || 'Admin Broadcast', adminEmail: user?.email || 'admin' });
      if (res.data?.success) {
        setSendResult({ success: true, sent: res.data.sent, failed: res.data.failed });
        showToast?.(`✅ SMS sent to ${res.data.sent} recipient${res.data.sent !== 1 ? 's' : ''}`);
        setMessage(''); setCampaignName(''); setCustomPhones('');
      } else {
        setSendResult({ success: false, reason: res.data?.reason || 'Unknown error' });
        showToast?.('⚠️ ' + (res.data?.reason || 'Send failed'));
      }
    } catch (err) {
      setSendResult({ success: false, reason: err.message || 'Cloud Function error' });
      showToast?.('❌ ' + (err.message || 'Error'));
    }
    setSending(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Status banner ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {[
          { icon: '📱', label: 'Provider',    value: "Africa's Talking",       color: '#4a9eff' },
          { icon: '🌐', label: 'Mode',        value: 'Sandbox (free testing)',  color: '#2ecc71' },
          { icon: '💰', label: 'Cost',        value: 'Free sandbox · KSh 1–2 live', color: 'var(--gold)' },
          { icon: '👥', label: 'Recipients',  value: `${allUsersWithPhone.length} users with phones`, color: 'var(--text)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* LEFT — Compose */}
        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold)' }}>✉️ Compose SMS</h3>

          {/* Campaign name */}
          <div className="adm-field-group" style={{ marginBottom: 0 }}>
            <label>Campaign Name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="field" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. July Promotion" />
          </div>

          {/* Audience tabs */}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Recipients</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: audience === 'custom' ? 10 : 0 }}>
              {[
                { k: 'all',    label: `All with phones (${allUsersWithPhone.length})` },
                { k: 'custom', label: 'Custom list' },
              ].map(opt => (
                <button key={opt.k} onClick={() => setAudience(opt.k)} style={{
                  flex: 1, padding: '8px 10px', borderRadius: 'var(--r-sm)', fontFamily: 'inherit',
                  border: `1px solid ${audience === opt.k ? 'var(--gold)' : 'var(--border)'}`,
                  background: audience === opt.k ? 'rgba(201,168,76,0.12)' : 'transparent',
                  color: audience === opt.k ? 'var(--gold)' : 'var(--muted)',
                  fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {audience === 'custom' && (
              <>
                <textarea className="field" rows={3} value={customPhones} onChange={e => setCustomPhones(e.target.value)}
                  placeholder="+254712345678&#10;0722000001" style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }} />
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {targetPhones.length} valid number{targetPhones.length !== 1 ? 's' : ''} detected
                </p>
              </>
            )}
          </div>

          {/* Message */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Message</label>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: charsLeft < 0 ? '#e74c3c' : charsLeft < 20 ? '#e8832a' : 'var(--muted)' }}>
                {message.length}/{MAX_SMS}
              </span>
            </div>
            <textarea className="field" rows={5} value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Type your message here (max 160 characters)…"
              style={{ resize: 'vertical', lineHeight: 1.65, fontSize: '0.9rem' }} />
            {charsLeft < 0 && <p style={{ color: '#e74c3c', fontSize: '0.73rem', margin: '4px 0 0' }}>⚠️ {Math.abs(charsLeft)} characters too long</p>}
          </div>

          {/* Preview bubble */}
          {message.trim() && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Preview</div>
              <div style={{ background: '#2ecc71', color: '#fff', borderRadius: '12px 12px 4px 12px', padding: '9px 13px', fontSize: '0.84rem', lineHeight: 1.55, display: 'inline-block', maxWidth: '90%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {message}
              </div>
            </div>
          )}

          {/* Result */}
          {sendResult && (
            <div style={{ padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: '0.84rem', fontWeight: 600,
              background: sendResult.success ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
              border: `1px solid ${sendResult.success ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`,
              color: sendResult.success ? 'var(--ok)' : '#e74c3c' }}>
              {sendResult.success ? `✅ Sent to ${sendResult.sent} · Failed: ${sendResult.failed}` : `❌ ${sendResult.reason}`}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleSend} style={{ width: '100%' }}
            disabled={sending || !message.trim() || message.length > MAX_SMS || targetPhones.length === 0}>
            {sending ? '⏳ Sending…' : `📤 Send to ${targetPhones.length} Recipient${targetPhones.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* RIGHT — Users + History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Users list */}
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'var(--gold)' }}>
              📋 Users with Phones ({allUsersWithPhone.length})
            </h4>
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {allUsersWithPhone.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.78rem', textAlign: 'center', padding: '16px 0' }}>
                  No users have a phone number yet.<br />
                  <span style={{ fontSize: '0.7rem' }}>Users add their phone in Profile settings.</span>
                </p>
              ) : allUsersWithPhone.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
                    {(u.name || u.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{u.phone}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Campaign history */}
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'var(--gold)' }}>📜 Campaign History</h4>
            {loadingHistory ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.78rem', textAlign: 'center', padding: '16px 0' }}>Loading…</p>
            ) : campaigns.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.78rem', textAlign: 'center', padding: '16px 0' }}>No campaigns sent yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: '0.8rem' }}>{c.campaignName || 'Broadcast'}</strong>
                      <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: 8, fontWeight: 700,
                        background: c.status === 'sent' ? 'rgba(46,204,113,0.12)' : 'rgba(74,158,255,0.12)',
                        color: c.status === 'sent' ? 'var(--ok)' : '#4a9eff',
                        border: `1px solid ${c.status === 'sent' ? 'rgba(46,204,113,0.3)' : 'rgba(74,158,255,0.3)'}` }}>
                        {c.status}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 5px', fontSize: '0.76rem', color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.message}</p>
                    <div style={{ display: 'flex', gap: 10, fontSize: '0.68rem', color: 'var(--muted)' }}>
                      <span>📤 {c.sentCount ?? c.totalRecipients ?? '—'} sent</span>
                      {c.failCount > 0 && <span style={{ color: '#e74c3c' }}>❌ {c.failCount} failed</span>}
                      <span style={{ marginLeft: 'auto' }}>{fmtDate(c.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Setup note — collapsed, minimal */}
          <div style={{ padding: '10px 14px', background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.18)', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color: '#4a9eff' }}>📱 Africa's Talking sandbox is active.</strong>{' '}
            SMS delivers to numbers added in the{' '}
            <a href="https://developers.africastalking.com/simulator" target="_blank" rel="noopener noreferrer" style={{ color: '#4a9eff' }}>AT Simulator</a>.
            To go live: add credit to your AT account and update <code style={{ color: 'var(--gold)' }}>AT_USERNAME</code> secret to your live username.
          </div>
        </div>
      </div>
    </div>
  );
}
