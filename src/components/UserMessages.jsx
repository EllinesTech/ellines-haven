import { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  doc, setDoc, addDoc, serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import './UserMessages.css';

/* ────────────────────────────────────────────────────────────
   UserMessages — full two-way chat between user and admin
   Firestore paths (both sides use same collection):
     contact_messages/{convId}           ← conversation header
     contact_messages/{convId}/messages  ← thread messages
──────────────────────────────────────────────────────────── */

const fmtTime = ts => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

// ── Soft notification sound using Web Audio API ──────────────────────────────
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g  = ctx.createGain();
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.type = 'sine'; o1.frequency.setValueAtTime(880, ctx.currentTime);
    o2.type = 'sine'; o2.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.18);
    o2.start(ctx.currentTime + 0.12); o2.stop(ctx.currentTime + 0.55);
  } catch {}
}

export default function UserMessages({ user }) {
  const [convos,      setConvos]      = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [thread,      setThread]      = useState([]);
  const [draft,       setDraft]       = useState('');
  const [subject,     setSubject]     = useState('');
  const [newMode,     setNewMode]     = useState(false);
  const [sending,     setSending]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const bottomRef    = useRef(null);
  const prevConvosRef = useRef([]);     // track previous convos to detect new admin replies
  const mountedRef   = useRef(false);   // avoid sound on initial load

  const emailKey = user?.email?.toLowerCase() || '';

  // ── Load user's conversations + detect new admin replies for sound ──
  useEffect(() => {
    if (!emailKey) return;
    setLoading(true);
    // Use only where() without orderBy to avoid needing a composite index.
    // Sort client-side instead.
    const q = query(
      collection(db, 'contact_messages'),
      where('email', '==', emailKey)
    );
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || a.createdAt || 0;
          const tb = b.createdAt?.toMillis?.() || b.createdAt || 0;
          return tb - ta;
        });

      if (mountedRef.current) {
        // Check if any conversation got a new admin reply since last snapshot
        fresh.forEach(c => {
          if (c.lastSender === 'admin' && c.userRead === false) {
            const prev = prevConvosRef.current.find(p => p.id === c.id);
            // Play sound if this is a new unread admin message (not seen before or newly unread)
            if (!prev || prev.userRead !== false || prev.lastSender !== 'admin') {
              playNotifSound();
            }
          }
        });
      }

      prevConvosRef.current = fresh;
      mountedRef.current = true;
      setConvos(fresh);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [emailKey]);

  // ── Load thread for active conversation ──
  useEffect(() => {
    if (!activeConvo) { setThread([]); return; }
    const q = query(
      collection(db, 'contact_messages', activeConvo, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setThread(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }, () => {});
    return () => unsub();
  }, [activeConvo]);

  // Mark as read when user opens a conversation that has unread admin messages
  const openConversation = async (convo) => {
    setActiveConvo(convo.id);
    setNewMode(false);
    if (convo.lastSender === 'admin' && convo.userRead === false) {
      await setDoc(doc(db, 'contact_messages', convo.id), { userRead: true }, { merge: true }).catch(() => {});
      setConvos(prev => prev.map(c => c.id === convo.id ? { ...c, userRead: true } : c));
    }
  };

  // Start a new conversation
  const startConversation = async () => {
    if (!subject.trim() || !draft.trim()) return;
    setSending(true);
    try {
      const convId = 'conv_' + emailKey.replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
      await setDoc(doc(db, 'contact_messages', convId), {
        name:       user.name,
        email:      emailKey,
        userId:     user.id,
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
      await addDoc(collection(db, 'contact_messages', convId, 'messages'), {
        text:        draft.trim(),
        sender:      'user',
        senderName:  user.name,
        senderEmail: emailKey,
        createdAt:   serverTimestamp(),
      });
      setActiveConvo(convId);
      setSubject(''); setDraft(''); setNewMode(false);
    } catch (e) { console.error(e); }
    setSending(false);
  };

  // Reply in existing conversation
  const sendReply = async () => {
    if (!draft.trim() || !activeConvo) return;
    setSending(true);
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
        status:     'new',  // re-flags as new for admin
      }, { merge: true });
      setDraft('');
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const activeConvoData = convos.find(c => c.id === activeConvo);
  const unread = convos.filter(c => c.lastSender === 'admin' && c.userRead === false).length;

  return (
    <div className="um-root">
      {/* Header */}
      <div className="um-header">
        <div>
          <h2 className="um-title">
            Messages
            {unread > 0 && <span className="um-unread-badge">{unread} new</span>}
          </h2>
          <p className="um-sub">Direct conversations with the Ellines Haven team</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setNewMode(true); setActiveConvo(null); }}>
          + New Message
        </button>
      </div>

      <div className="um-layout">
        {/* ── Conversation list ── */}
        <div className="um-convos">
          {loading && <p className="um-empty">Loading…</p>}
          {!loading && convos.length === 0 && !newMode && (
            <div className="um-empty-state">
              <div className="um-empty-icon">💬</div>
              <p>No messages yet</p>
              <span>Start a conversation with our team</span>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }}
                onClick={() => setNewMode(true)}>
                Send First Message
              </button>
            </div>
          )}
          {convos.map(c => (
            <div key={c.id}
              onClick={() => openConversation(c)}
              className={`um-convo-row${activeConvo === c.id ? ' um-convo-row--active' : ''}${c.lastSender === 'admin' && c.userRead === false ? ' um-convo-row--unread' : ''}`}>
              <div className="um-convo-avatar">
                {c.lastSender === 'admin' ? '🛡️' : (user.name[0] || '?').toUpperCase()}
              </div>
              <div className="um-convo-body">
                <div className="um-convo-subject">{c.subject || 'No subject'}</div>
                <div className="um-convo-preview">{c.lastMsg || c.message || '—'}</div>
              </div>
              <div className="um-convo-meta">
                <span className="um-convo-time">{fmtTime(c.lastMsgAt || c.createdAt)}</span>
                {c.lastSender === 'admin' && c.userRead === false && (
                  <span className="um-convo-dot" />
                )}
                {c.status === 'replied' && c.userRead !== false && (
                  <span className="um-convo-status">↩ Replied</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Active pane ── */}
        <div className="um-pane">
          {/* New conversation form */}
          {newMode && (
            <div className="um-new-form">
              <div className="um-pane-header">
                <h3>New Message</h3>
                <button className="um-close" onClick={() => setNewMode(false)}>✕</button>
              </div>
              <input className="field" value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Subject — What do you need help with?" style={{ marginBottom: 10 }} />
              <textarea className="field" rows={5} value={draft} onChange={e => setDraft(e.target.value)}
                placeholder="Describe your question or issue in detail…"
                style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={startConversation}
                  disabled={sending || !subject.trim() || !draft.trim()}>
                  {sending ? '⏳ Sending…' : '📤 Send Message'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setNewMode(false)}>Cancel</button>
              </div>
              <p className="um-hint">Usually replied within 24 hours · Mon–Sat, 8am–8pm EAT</p>
            </div>
          )}

          {/* Thread view */}
          {!newMode && activeConvo && (
            <div className="um-thread">
              <div className="um-pane-header">
                <div>
                  <h3>{activeConvoData?.subject || 'Conversation'}</h3>
                  <span className="um-pane-sub">
                    {activeConvoData?.status === 'replied' ? '↩ Admin replied' : activeConvoData?.status === 'new' ? '📨 Awaiting reply' : activeConvoData?.status}
                  </span>
                </div>
                <button className="um-close" onClick={() => setActiveConvo(null)}>✕</button>
              </div>

              <div className="um-messages">
                {thread.map(msg => (
                  <div key={msg.id} className={`um-msg${msg.sender === 'user' ? ' um-msg--user' : ' um-msg--admin'}`}>
                    {msg.sender === 'admin' && (
                      <div className="um-msg-avatar admin">🛡️</div>
                    )}
                    <div className="um-msg-wrap">
                      <div className="um-msg-name">
                        {msg.sender === 'admin' ? 'Ellines Haven Team' : 'You'}
                      </div>
                      <div className="um-msg-bubble">{msg.text}</div>
                      <div className="um-msg-time">{fmtTime(msg.createdAt)}</div>
                    </div>
                    {msg.sender === 'user' && (
                      <div className="um-msg-avatar user">
                        {(user.name[0] || 'U').toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="um-reply-box">
                <textarea className="field" rows={3} value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }}
                  placeholder="Type your reply… (Ctrl+Enter to send)"
                  style={{ resize: 'none', width: '100%', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraft('')}>Clear</button>
                  <button className="btn btn-primary btn-sm" onClick={sendReply}
                    disabled={sending || !draft.trim()}>
                    {sending ? '⏳' : '↩ Send Reply'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!newMode && !activeConvo && convos.length > 0 && (
            <div className="um-select-prompt">
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💬</div>
              <p>Select a conversation to view it</p>
              <span>or start a new message above</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
