import { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  doc, setDoc, addDoc, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import './UserMessages.css';

const fmtTime = ts => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) + ' · ' +
        d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.type = 'sine'; o1.frequency.setValueAtTime(880, ctx.currentTime);
    o2.type = 'sine'; o2.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.18);
    o2.start(ctx.currentTime + 0.12); o2.stop(ctx.currentTime + 0.5);
  } catch {}
}

export default function UserMessages({ user }) {
  const [convos,       setConvos]      = useState([]);
  const [activeConvo,  setActiveConvo] = useState(null);
  const [thread,       setThread]      = useState([]);
  const [draft,        setDraft]       = useState('');
  const [subject,      setSubject]     = useState('');
  const [newMode,      setNewMode]     = useState(false);
  const [sending,      setSending]     = useState(false);
  const [loading,      setLoading]     = useState(true);
  const [sendError,    setSendError]   = useState('');
  const [sendSuccess,  setSendSuccess] = useState(false);
  const bottomRef     = useRef(null);
  const prevConvosRef = useRef([]);
  const mountedRef    = useRef(false);
  const textareaRef   = useRef(null);

  const emailKey = user?.email?.toLowerCase() || '';

  // ── Conversations listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!emailKey) return;
    setLoading(true);
    const q = query(collection(db, 'contact_messages'), where('email', '==', emailKey));
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.type === 'direct' || d.type === 'conv')  // only real conversations
        .sort((a, b) => {
          const ta = a.lastMsgAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const tb = b.lastMsgAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });

      if (mountedRef.current) {
        fresh.forEach(c => {
          if (c.lastSender === 'admin' && c.userRead === false) {
            const prev = prevConvosRef.current.find(p => p.id === c.id);
            if (!prev || prev.userRead !== false || prev.lastSender !== 'admin') playNotifSound();
          }
        });
      }
      prevConvosRef.current = fresh;
      mountedRef.current = true;
      setConvos(fresh);
      setLoading(false);
    }, err => {
      console.error('UserMessages load error:', err.message);
      setLoading(false);
    });
    return () => unsub();
  }, [emailKey]);

  // ── Thread listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConvo) { setThread([]); return; }
    const q = query(
      collection(db, 'contact_messages', activeConvo, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setThread(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }, err => console.error('Thread load error:', err.message));
    return () => unsub();
  }, [activeConvo]);

  const openConversation = async (convo) => {
    setActiveConvo(convo.id);
    setNewMode(false);
    setSendError('');
    if (convo.lastSender === 'admin' && convo.userRead === false) {
      setConvos(prev => prev.map(c => c.id === convo.id ? { ...c, userRead: true } : c));
      setDoc(doc(db, 'contact_messages', convo.id), { userRead: true }, { merge: true }).catch(() => {});
    }
  };

  // ── Start new conversation ───────────────────────────────────────────────────
  const startConversation = async () => {
    if (!subject.trim() || !draft.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const convId = 'conv_' + emailKey.replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

      // Step 1: write header doc
      await setDoc(doc(db, 'contact_messages', convId), {
        name:       user.name,
        email:      emailKey,
        userId:     user.id || '',
        subject:    subject.trim(),
        message:    draft.trim(),
        type:       'direct',
        status:     'new',
        threadId:   convId,
        createdAt:  serverTimestamp(),
        lastMsg:    draft.trim().slice(0, 80),
        lastMsgAt:  serverTimestamp(),
        lastSender: 'user',
        userRead:   true,
      });

      // Step 2: write first message to subcollection
      await addDoc(collection(db, 'contact_messages', convId, 'messages'), {
        text:        draft.trim(),
        sender:      'user',
        senderName:  user.name,
        senderEmail: emailKey,
        createdAt:   serverTimestamp(),
      });

      setSubject('');
      setDraft('');
      setNewMode(false);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
      setActiveConvo(convId);
    } catch (err) {
      console.error('Send error:', err);
      setSendError('Failed to send: ' + (err.message || 'Unknown error'));
    }
    setSending(false);
  };

  // ── Reply in existing conversation ───────────────────────────────────────────
  const sendReply = async () => {
    if (!draft.trim() || !activeConvo) return;
    setSending(true);
    setSendError('');
    try {
      await addDoc(collection(db, 'contact_messages', activeConvo, 'messages'), {
        text:        draft.trim(),
        sender:      'user',
        senderName:  user.name,
        senderEmail: emailKey,
        createdAt:   serverTimestamp(),
      });
      await setDoc(doc(db, 'contact_messages', activeConvo), {
        lastMsg:    draft.trim().slice(0, 80),
        lastMsgAt:  serverTimestamp(),
        lastSender: 'user',
        userRead:   true,
        status:     'new',
      }, { merge: true });
      setDraft('');
      textareaRef.current?.focus();
    } catch (err) {
      setSendError('Failed to send: ' + (err.message || 'Unknown error'));
    }
    setSending(false);
  };

  const activeConvoData = convos.find(c => c.id === activeConvo);
  const unread = convos.filter(c => c.lastSender === 'admin' && c.userRead === false).length;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="um-root">

      {/* ── Header bar ── */}
      <div className="um-header">
        <div className="um-header-left">
          <h2 className="um-title">
            💬 Messages
            {unread > 0 && <span className="um-badge">{unread} new</span>}
          </h2>
          <p className="um-sub">Your conversations with the Ellines Haven team</p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => { setNewMode(true); setActiveConvo(null); setSendError(''); }}
        >
          + New Message
        </button>
      </div>

      {/* ── Main layout ── */}
      <div className="um-shell">

        {/* ── Sidebar: conversation list ── */}
        <div className="um-sidebar">
          {loading && (
            <div className="um-center-state">
              <span className="um-spin">⏳</span>
              <p>Loading…</p>
            </div>
          )}

          {!loading && convos.length === 0 && !newMode && (
            <div className="um-center-state">
              <div className="um-state-icon">💬</div>
              <p className="um-state-title">No messages yet</p>
              <span className="um-state-sub">Start a conversation with our team</span>
              <button className="btn btn-primary btn-sm um-state-btn"
                onClick={() => setNewMode(true)}>
                Send First Message
              </button>
            </div>
          )}

          {convos.map(c => {
            const isUnread = c.lastSender === 'admin' && c.userRead === false;
            const isActive = activeConvo === c.id;
            return (
              <div key={c.id}
                onClick={() => openConversation(c)}
                className={`um-row${isActive ? ' um-row--active' : ''}${isUnread ? ' um-row--unread' : ''}`}
              >
                <div className={`um-row-avatar${isUnread ? ' um-row-avatar--admin' : ''}`}>
                  {isUnread ? '🛡️' : (user.name?.[0] || 'U').toUpperCase()}
                </div>
                <div className="um-row-body">
                  <div className="um-row-subject">{c.subject || 'No subject'}</div>
                  <div className="um-row-preview">{c.lastMsg || c.message || '—'}</div>
                </div>
                <div className="um-row-right">
                  <span className="um-row-time">{fmtTime(c.lastMsgAt || c.createdAt)}</span>
                  {isUnread && <span className="um-dot" />}
                  {c.status === 'replied' && !isUnread && (
                    <span className="um-replied-badge">↩ replied</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Main pane ── */}
        <div className="um-pane">

          {/* NEW MESSAGE FORM */}
          {newMode && (
            <div className="um-compose">
              <div className="um-compose-head">
                <h3>New Message</h3>
                <button className="um-close-btn" onClick={() => { setNewMode(false); setSendError(''); }}>✕</button>
              </div>

              {sendSuccess && (
                <div className="um-success-banner">
                  ✅ Message sent! We'll reply within 24 hours.
                </div>
              )}
              {sendError && (
                <div className="um-error-banner">⚠️ {sendError}</div>
              )}

              <div className="um-compose-fields">
                <label className="um-label">Subject</label>
                <input
                  className="field"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="What do you need help with?"
                />
                <label className="um-label" style={{ marginTop: 12 }}>Message</label>
                <textarea
                  className="field"
                  rows={6}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="Describe your question or issue in detail…"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="um-compose-footer">
                <button
                  className="btn btn-primary"
                  onClick={startConversation}
                  disabled={sending || !subject.trim() || !draft.trim()}
                >
                  {sending ? '⏳ Sending…' : '📤 Send Message'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setNewMode(false); setSendError(''); }}>
                  Cancel
                </button>
                <span className="um-hint">Usually replied within 24 hrs · Mon–Sat, 8am–8pm EAT</span>
              </div>
            </div>
          )}

          {/* THREAD VIEW */}
          {!newMode && activeConvo && (
            <div className="um-thread">
              <div className="um-thread-head">
                <div className="um-thread-meta">
                  <h3>{activeConvoData?.subject || 'Conversation'}</h3>
                  <span className={`um-thread-status ${activeConvoData?.status === 'replied' ? 'ok' : 'pending'}`}>
                    {activeConvoData?.status === 'replied' ? '↩ Admin replied' : '📨 Awaiting reply'}
                  </span>
                </div>
                <button className="um-close-btn" onClick={() => setActiveConvo(null)}>✕</button>
              </div>

              <div className="um-messages">
                {thread.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
                    Loading conversation…
                  </div>
                )}
                {thread.map(msg => (
                  <div key={msg.id} className={`um-msg ${msg.sender === 'user' ? 'um-msg--user' : 'um-msg--admin'}`}>
                    {msg.sender === 'admin' && (
                      <div className="um-avatar um-avatar--admin">🛡️</div>
                    )}
                    <div className="um-bubble-wrap">
                      <span className="um-sender-name">
                        {msg.sender === 'admin' ? 'Ellines Haven Team' : 'You'}
                      </span>
                      <div className={`um-bubble ${msg.sender === 'user' ? 'um-bubble--user' : 'um-bubble--admin'}`}>
                        {msg.text}
                      </div>
                      <span className="um-time">{fmtTime(msg.createdAt)}</span>
                    </div>
                    {msg.sender === 'user' && (
                      <div className="um-avatar um-avatar--user">
                        {(user.name?.[0] || 'U').toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {sendError && <div className="um-error-banner" style={{ margin: '0 14px 8px' }}>⚠️ {sendError}</div>}

              <div className="um-reply-bar">
                <textarea
                  ref={textareaRef}
                  className="field um-reply-input"
                  rows={3}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }}
                  placeholder="Type your reply… (Ctrl+Enter to send)"
                />
                <div className="um-reply-actions">
                  <span className="um-hint">Ctrl+Enter to send</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraft('')}>Clear</button>
                  <button className="btn btn-primary btn-sm" onClick={sendReply}
                    disabled={sending || !draft.trim()}>
                    {sending ? '⏳' : '↩ Reply'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* EMPTY PANE */}
          {!newMode && !activeConvo && (
            <div className="um-pane-empty">
              {convos.length > 0 ? (
                <>
                  <div className="um-state-icon">💬</div>
                  <p className="um-state-title">Select a conversation</p>
                  <span className="um-state-sub">or start a new message</span>
                </>
              ) : (
                <>
                  <div className="um-state-icon">📩</div>
                  <p className="um-state-title">No messages yet</p>
                  <span className="um-state-sub">We're here to help. Send us a message!</span>
                  <button className="btn btn-primary btn-sm um-state-btn"
                    onClick={() => setNewMode(true)}>
                    + New Message
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
