import { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  doc, setDoc, addDoc, deleteDoc, serverTimestamp, where, writeBatch, getDocs,
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
  // multi-select for thread messages
  const [selectMode,   setSelectMode]  = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState(new Set());
  const [deleting,     setDeleting]    = useState(false);
  // multi-select for conversations
  const [convoSelectMode, setConvoSelectMode] = useState(false);
  const [selectedConvos,  setSelectedConvos]  = useState(new Set());
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
        // show: direct messages, conv threads, and contact form submissions (no type or type not live_chat/notification)
        .filter(d => !d.type || d.type === 'direct' || d.type === 'conv')
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
    // No orderBy — sort client-side to avoid index requirements
    const unsub = onSnapshot(
      collection(db, 'contact_messages', activeConvo, 'messages'),
      snap => {
        const msgs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const tb = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return ta - tb;
          });
        setThread(msgs);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      },
      err => console.error('Thread load error:', err.message)
    );
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

  // ── Delete helpers ──────────────────────────────────────────────────────────

  /** Delete a single message the user sent */
  const deleteMessage = async (msgId) => {
    if (!activeConvo) return;
    try {
      await deleteDoc(doc(db, 'contact_messages', activeConvo, 'messages', msgId));
      setSelectedMsgs(s => { const n = new Set(s); n.delete(msgId); return n; });
    } catch {}
  };

  /** Delete selected messages (user's own only) */
  const deleteSelectedMsgs = async () => {
    if (!activeConvo || selectedMsgs.size === 0) return;
    if (!window.confirm(`Delete ${selectedMsgs.size} message${selectedMsgs.size > 1 ? 's' : ''}?`)) return;
    setDeleting(true);
    const batch = writeBatch(db);
    selectedMsgs.forEach(id => {
      const msg = thread.find(m => m.id === id);
      if (msg?.sender === 'user') batch.delete(doc(db, 'contact_messages', activeConvo, 'messages', id));
    });
    await batch.commit().catch(() => {});
    setSelectedMsgs(new Set());
    setSelectMode(false);
    setDeleting(false);
  };

  /** Delete an entire conversation */
  const deleteConversation = async (convoId) => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    setDeleting(true);
    try {
      // delete all subcollection messages first
      const subSnap = await getDocs(collection(db, 'contact_messages', convoId, 'messages'));
      const batch = writeBatch(db);
      subSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'contact_messages', convoId));
      await batch.commit();
      setConvos(prev => prev.filter(c => c.id !== convoId));
      if (activeConvo === convoId) { setActiveConvo(null); setThread([]); }
    } catch {}
    setDeleting(false);
  };

  /** Delete selected conversations */
  const deleteSelectedConvos = async () => {
    if (selectedConvos.size === 0) return;
    if (!window.confirm(`Delete ${selectedConvos.size} conversation${selectedConvos.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    for (const id of selectedConvos) {
      try {
        const subSnap = await getDocs(collection(db, 'contact_messages', id, 'messages'));
        const batch = writeBatch(db);
        subSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, 'contact_messages', id));
        await batch.commit();
      } catch {}
    }
    setConvos(prev => prev.filter(c => !selectedConvos.has(c.id)));
    if (selectedConvos.has(activeConvo)) { setActiveConvo(null); setThread([]); }
    setSelectedConvos(new Set());
    setConvoSelectMode(false);
    setDeleting(false);
  };

  const toggleConvoSelect = (id) => {
    setSelectedConvos(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleMsgSelect = (id) => {
    const msg = thread.find(m => m.id === id);
    if (msg?.sender !== 'user') return;
    setSelectedMsgs(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
          {!convoSelectMode ? (
            <>
              {convos.length > 0 && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setConvoSelectMode(true); setSelectedConvos(new Set()); }}
                  style={{ fontSize:'0.74rem', padding:'4px 10px' }}>
                  ☑ Select
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setNewMode(true); setActiveConvo(null); setSendError(''); }}
              >
                + New Message
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize:'0.74rem', color:'var(--muted)' }}>{selectedConvos.size} selected</span>
              <button className="btn btn-sm"
                disabled={deleting || selectedConvos.size === 0}
                onClick={deleteSelectedConvos}
                style={{ fontSize:'0.74rem', padding:'4px 10px', background:'rgba(231,76,60,0.15)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.35)', borderRadius:'var(--r-sm)', cursor:'pointer', opacity:selectedConvos.size===0?0.4:1 }}>
                {deleting ? '⏳' : `🗑 Delete (${selectedConvos.size})`}
              </button>
              <button className="btn btn-ghost btn-sm"
                onClick={() => { setConvoSelectMode(false); setSelectedConvos(new Set()); }}
                style={{ fontSize:'0.74rem', padding:'4px 10px' }}>
                Cancel
              </button>
            </>
          )}
        </div>
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
            const isConvoSelected = selectedConvos.has(c.id);
            return (
              <div key={c.id}
                style={{ position:'relative', display:'flex', alignItems:'center' }}
              >
                {/* checkbox in select mode */}
                {convoSelectMode && (
                  <div
                    onClick={() => toggleConvoSelect(c.id)}
                    style={{
                      width:18, height:18, borderRadius:4, flexShrink:0, marginLeft:10,
                      border:`2px solid ${isConvoSelected?'var(--gold)':'rgba(255,255,255,0.2)'}`,
                      background: isConvoSelected ? 'var(--gold)' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                    }}>
                    {isConvoSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                )}
                <div
                  onClick={() => convoSelectMode ? toggleConvoSelect(c.id) : openConversation(c)}
                  className={`um-row${isActive ? ' um-row--active' : ''}${isUnread ? ' um-row--unread' : ''}`}
                  style={{ flex:1 }}
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
                {/* quick delete btn (non-select mode) */}
                {!convoSelectMode && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteConversation(c.id); }}
                    title="Delete conversation"
                    style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'rgba(255,255,255,0.18)', cursor:'pointer', padding:'3px 5px', fontSize:'0.78rem', lineHeight:1, borderRadius:4, zIndex:1 }}
                    onMouseEnter={e => e.currentTarget.style.color='rgba(231,76,60,0.85)'}
                    onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.18)'}
                  >🗑</button>
                )}
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
                <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                  {!selectMode ? (
                    <>
                      {thread.filter(m => m.sender === 'user').length > 0 && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => { setSelectMode(true); setSelectedMsgs(new Set()); }}
                          style={{ fontSize:'0.72rem', padding:'3px 8px' }}>
                          ☑ Select
                        </button>
                      )}
                      <button
                        onClick={() => deleteConversation(activeConvo)}
                        title="Delete conversation"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize:'0.72rem', padding:'3px 8px', color:'#e74c3c' }}>
                        🗑 Delete
                      </button>
                      <button className="um-close-btn" onClick={() => setActiveConvo(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{selectedMsgs.size} selected</span>
                      <button
                        disabled={deleting || selectedMsgs.size === 0}
                        onClick={deleteSelectedMsgs}
                        style={{ fontSize:'0.72rem', padding:'3px 8px', background:'rgba(231,76,60,0.12)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.3)', borderRadius:'var(--r-sm)', cursor:'pointer', opacity:selectedMsgs.size===0?0.4:1 }}>
                        {deleting ? '⏳' : `🗑 Delete (${selectedMsgs.size})`}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => { setSelectMode(false); setSelectedMsgs(new Set()); }}
                        style={{ fontSize:'0.72rem', padding:'3px 8px' }}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="um-messages">
                {thread.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
                    Loading conversation…
                  </div>
                )}
                {thread.map(msg => (
                  <div key={msg.id} className={`um-msg ${msg.sender === 'user' ? 'um-msg--user' : 'um-msg--admin'}`}
                    style={{ cursor: selectMode && msg.sender === 'user' ? 'pointer' : 'default' }}
                    onClick={() => selectMode && toggleMsgSelect(msg.id)}
                  >
                    {msg.sender === 'admin' && (
                      <div className="um-avatar um-avatar--admin">🛡️</div>
                    )}
                    <div className="um-bubble-wrap">
                      <span className="um-sender-name">
                        {msg.sender === 'admin' ? 'Ellines Haven Team' : 'You'}
                      </span>
                      <div style={{ position:'relative', display:'flex', alignItems:'center', gap:6, flexDirection: msg.sender==='user'?'row-reverse':'row' }}>
                        {/* select checkbox (user messages only) */}
                        {selectMode && msg.sender === 'user' && (
                          <div style={{
                            width:16, height:16, borderRadius:4, flexShrink:0,
                            border:`2px solid ${selectedMsgs.has(msg.id)?'var(--gold)':'rgba(255,255,255,0.25)'}`,
                            background: selectedMsgs.has(msg.id) ? 'var(--gold)' : 'transparent',
                            display:'flex', alignItems:'center', justifyContent:'center',
                          }}>
                            {selectedMsgs.has(msg.id) && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        )}
                        <div className={`um-bubble ${msg.sender === 'user' ? 'um-bubble--user' : 'um-bubble--admin'}`}
                          style={{ outline: selectedMsgs.has(msg.id) ? '2px solid var(--gold)' : 'none', transition:'outline 0.1s' }}>
                          {msg.text}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexDirection: msg.sender==='user'?'row-reverse':'row' }}>
                        <span className="um-time">{fmtTime(msg.createdAt)}</span>
                        {/* delete own message button (non-select mode) */}
                        {msg.sender === 'user' && !selectMode && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteMessage(msg.id); }}
                            title="Delete message"
                            style={{ background:'none', border:'none', color:'rgba(255,255,255,0.2)', cursor:'pointer', padding:'0 2px', fontSize:'0.65rem', lineHeight:1 }}
                            onMouseEnter={e => e.currentTarget.style.color='rgba(231,76,60,0.8)'}
                            onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.2)'}
                          >🗑</button>
                        )}
                      </div>
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
