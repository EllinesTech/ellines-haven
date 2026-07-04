/**
 * SMSPanel — Admin panel for sending SMS broadcasts to users via Africa's Talking.
 * Also shows campaign history from Firestore `sms_campaigns` collection.
 *
 * Requires Cloud Function `sendSmsBroadcast` to be deployed with:
 *   AT_API_KEY, AT_USERNAME, AT_SENDER_ID secrets set via:
 *   firebase functions:secrets:set AT_API_KEY
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

  /* ── composer state ── */
  const [message,      setMessage]      = useState('');
  const [audience,     setAudience]     = useState('all'); // 'all' | 'custom'
  const [customPhones, setCustomPhones] = useState('');    // comma / newline separated phones
  const [campaignName, setCampaignName] = useState('');
  const [sending,      setSending]      = useState(false);
  const [sendResult,   setSendResult]   = useState(null);  // { sent, failed, reason }

  /* ── campaign history ── */
  const [campaigns, setCampaigns] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  /* ── Firestore users with phones ── */
  const [fsUsers, setFsUsers] = useState([]);

  useEffect(() => {
    // Pull users that have a phone number set
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

  /* ── derive target phones ── */
  const allUsersWithPhone = [
    ...fsUsers.filter(u => u.phone),
    ...users.filter(u => u.phone && !fsUsers.find(f => f.email?.toLowerCase() === u.email?.toLowerCase())),
  ];

  const getTargetPhones = () => {
    if (audience === 'all') {
      return allUsersWithPhone.map(u => u.phone).filter(Boolean);
    }
    // parse custom list
    return customPhones
      .split(/[\n,;]+/)
      .map(p => p.trim())
      .filter(p => p.length >= 7);
  };

  const targetPhones = getTargetPhones();
  const charsLeft    = MAX_SMS - message.length;

  /* ── send ── */
  const handleSend = async () => {
    if (!message.trim()) { showToast?.('⚠️ Message is empty'); return; }
    if (message.length > MAX_SMS) { showToast?.('⚠️ Message exceeds 160 characters'); return; }
    if (!targetPhones.length) { showToast?.('⚠️ No phone numbers to send to'); return; }

    const confirmed = window.confirm(
      `Send SMS to ${targetPhones.length} recipient${targetPhones.length !== 1 ? 's' : ''}?\n\n"${message}"`
    );
    if (!confirmed) return;

    setSending(true);
    setSendResult(null);

    try {
      const fn = httpsCallable(getFunctions(), 'sendSmsBroadcast');
      const res = await fn({
        message:      message.trim(),
        phones:       targetPhones,
        campaignName: campaignName.trim() || 'Admin Broadcast',
        adminEmail:   user?.email || 'admin',
      });

      if (res.data?.success) {
        setSendResult({ success: true, sent: res.data.sent, failed: res.data.failed });
        showToast?.(`✅ SMS sent to ${res.data.sent} recipient${res.data.sent !== 1 ? 's' : ''}`);
        setMessage('');
        setCampaignName('');
        setCustomPhones('');
      } else {
        setSendResult({ success: false, reason: res.data?.reason || 'Unknown error' });
        showToast?.('⚠️ ' + (res.data?.reason || 'Send failed'));
      }
    } catch (err) {
      const msg = err.message || 'Cloud Function error';
      setSendResult({ success: false, reason: msg });
      showToast?.('❌ ' + msg);
    }
    setSending(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Info banner ── */}
      <div style={{
        background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.25)',
        borderRadius: 'var(--r)', padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>📱</span>
        <div>
          <div style={{ fontWeight: 700, color: '#4a9eff', marginBottom: 4 }}>SMS Broadcast via Africa's Talking</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.7 }}>
            Send promotional SMS, order updates, or announcements to your users' mobile phones.
            Requires <strong style={{ color: 'var(--text)' }}>AT_API_KEY</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>AT_USERNAME</strong>, and{' '}
            <strong style={{ color: 'var(--text)' }}>AT_SENDER_ID</strong> secrets set on the Cloud Function.
            <br />
            Users with no phone number on file will be skipped.
            Register at{' '}
            <a href="https://africastalking.com" target="_blank" rel="noopener noreferrer"
              style={{ color: '#4a9eff' }}>africastalking.com</a>.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>

        {/* ── LEFT: Compose ── */}
        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold)' }}>✉️ Compose SMS</h3>

          {/* Campaign name */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
              Campaign Name (optional)
            </label>
            <input
              className="field"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. July Promotion"
            />
          </div>

          {/* Audience */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
              Recipients
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { k: 'all', label: `All users with phones (${allUsersWithPhone.length})` },
                { k: 'custom', label: 'Custom phone list' },
              ].map(opt => (
                <button
                  key={opt.k}
                  onClick={() => setAudience(opt.k)}
                  style={{
                    flex: 1, padding: '8px 10px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${audience === opt.k ? 'var(--gold)' : 'var(--border)'}`,
                    background: audience === opt.k ? 'rgba(201,168,76,0.12)' : 'var(--card)',
                    color: audience === opt.k ? 'var(--gold)' : 'var(--muted)',
                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'center', transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {audience === 'custom' && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginBottom: 5 }}>
                  One phone per line or comma-separated (254XXXXXXXXX or 07XXXXXXXX)
                </label>
                <textarea
                  className="field"
                  rows={4}
                  value={customPhones}
                  onChange={e => setCustomPhones(e.target.value)}
                  placeholder="+254712345678&#10;0722000001&#10;0733000002"
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                  {targetPhones.length} valid number{targetPhones.length !== 1 ? 's' : ''} detected
                </div>
              </div>
            )}
          </div>

          {/* Message */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Message
              </label>
              <span style={{
                fontSize: '0.72rem', fontWeight: 600,
                color: charsLeft < 0 ? '#e74c3c' : charsLeft < 20 ? '#e8832a' : 'var(--muted)',
              }}>
                {message.length}/{MAX_SMS}
              </span>
            </div>
            <textarea
              className="field"
              rows={5}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your SMS message here (max 160 characters)…"
              style={{ resize: 'vertical', lineHeight: 1.65, fontSize: '0.95rem' }}
            />
            {charsLeft < 0 && (
              <p style={{ color: '#e74c3c', fontSize: '0.75rem', margin: '5px 0 0' }}>
                ⚠️ Message is {Math.abs(charsLeft)} character{Math.abs(charsLeft) !== 1 ? 's' : ''} too long
              </p>
            )}
          </div>

          {/* Preview */}
          {message.trim() && (
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', padding: '12px 14px',
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Preview</div>
              <div style={{
                background: '#2ecc71', color: '#fff', borderRadius: '12px 12px 4px 12px',
                padding: '10px 14px', fontSize: '0.85rem', lineHeight: 1.6,
                display: 'inline-block', maxWidth: '90%', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{message}</div>
            </div>
          )}

          {/* Send result */}
          {sendResult && (
            <div style={{
              padding: '12px 14px', borderRadius: 'var(--r-sm)', fontSize: '0.85rem', fontWeight: 600,
              background: sendResult.success ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
              border: `1px solid ${sendResult.success ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`,
              color: sendResult.success ? 'var(--ok)' : '#e74c3c',
            }}>
              {sendResult.success
                ? `✅ Sent to ${sendResult.sent} · Failed: ${sendResult.failed}`
                : `❌ ${sendResult.reason}`}
            </div>
          )}

          {/* CTA */}
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={sending || !message.trim() || message.length > MAX_SMS || targetPhones.length === 0}
            style={{ width: '100%', marginTop: 4 }}
          >
            {sending
              ? '⏳ Sending…'
              : `📤 Send SMS to ${targetPhones.length} Recipient${targetPhones.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* ── RIGHT: Users with phones + campaign history ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Users with phone numbers */}
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'var(--gold)' }}>
              📋 Users with Phone Numbers ({allUsersWithPhone.length})
            </h3>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {allUsersWithPhone.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
                  No users have added a phone number yet.<br />
                  <span style={{ fontSize: '0.72rem' }}>Users can add their phone in Profile settings.</span>
                </p>
              ) : allUsersWithPhone.map((u, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', background: 'var(--bg)',
                  borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: '0.8rem',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(201,168,76,0.15)', color: 'var(--gold)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.78rem', flexShrink: 0,
                  }}>{(u.name || u.email || '?')[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{u.phone}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Campaign history */}
          <div className="card" style={{ padding: 18, flex: 1 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'var(--gold)' }}>📜 Campaign History</h3>
            {loadingHistory ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>Loading…</p>
            ) : campaigns.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>No campaigns sent yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{
                    padding: '10px 12px', background: 'var(--bg)',
                    borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <strong style={{ fontSize: '0.82rem' }}>{c.campaignName || 'Broadcast'}</strong>
                      <span style={{
                        fontSize: '0.65rem', padding: '2px 7px', borderRadius: 10, fontWeight: 700,
                        background: c.status === 'sent' ? 'rgba(46,204,113,0.12)' : 'rgba(74,158,255,0.12)',
                        color: c.status === 'sent' ? 'var(--ok)' : '#4a9eff',
                        border: `1px solid ${c.status === 'sent' ? 'rgba(46,204,113,0.3)' : 'rgba(74,158,255,0.3)'}`,
                      }}>{c.status}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {c.message}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: '0.7rem', color: 'var(--muted)' }}>
                      <span>📤 {c.sentCount ?? c.totalRecipients ?? '—'} sent</span>
                      {c.failCount > 0 && <span style={{ color: '#e74c3c' }}>❌ {c.failCount} failed</span>}
                      <span style={{ marginLeft: 'auto' }}>{fmtDate(c.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
