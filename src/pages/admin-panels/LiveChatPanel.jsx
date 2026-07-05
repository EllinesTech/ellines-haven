import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, getDocs, writeBatch, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
};

function playAdminNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const [o1, o2, g] = [ctx.createOscillator(), ctx.createOscillator(), ctx.createGain()];
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.type = 'sine'; o1.frequency.setValueAtTime(660, ctx.currentTime);
    o2.type = 'sine'; o2.frequency.setValueAtTime(880, ctx.currentTime + 0.14);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.2);
    o2.start(ctx.currentTime + 0.14); o2.stop(ctx.currentTime + 0.6);
  } catch {}
}

export default function LiveChatPanel({ showToast }) {
  const { user } = useApp();
  const [chatSessions,    setChatSessions]    = useState([]);
  const [activeChat,      setActiveChat]      = useState(null);
  const [chatThread,      setChatThread]      = useState([]);
  const [chatReply,       setChatReply]       = useState('');
  const [chatSending,     setChatSending]     = useState(false);
  const [agentOnline,     setAgentOnline]     = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [selected,        setSelected]        = useState(new Set());
  const [delConfirm,      setDelConfirm]      = useState(null);
  // Thread message multi-select
  const [msgSelectMode,   setMsgSelectMode]   = useState(false);
  const [selectedMsgs,    setSelectedMsgs]    = useState(new Set());
  const [msgDeleting,     setMsgDeleting]     = useState(false);
  const chatBottomRef     = useRef(null);
  const prevChatIds       = useRef(new Set());
  const chatMounted       = useRef(false);

  // Request browser notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // ── Live chat sessions listener ───────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    // NOTE: no orderBy here — combining where() + orderBy() requires a composite
    // Firestore index that may not exist. Sort client-side instead.
    const q = query(
      collection(db, 'contact_messages'),
      where('type', '==', 'live_chat')
    );
    const unsub = onSnapshot(q, snap => {
      const sessions = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.lastMsgAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const tb = b.lastMsgAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
      // sound for new chat sessions from users
      if (chatMounted.current) {
        sessions.forEach(s => {
          if (!prevChatIds.current.has(s.id) && s.lastSender === 'user') {
            playAdminNotifSound();
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('💬 New Live Chat — Ellines Haven', {
                body: `${s.name || 'A user'} started a chat`,
                icon: '/logo-icon.png',
                tag: s.id,
              });
            }
          }
        });
      }
      prevChatIds.current = new Set(sessions.map(s => s.id));
      chatMounted.current = true;
      setChatSessions(sessions);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // ── Live chat thread listener ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeChat) { setChatThread([]); return; }
    // reset message select state when switching chats
    setMsgSelectMode(false);
    setSelectedMsgs(new Set());
    const q = query(
      collection(db, 'contact_messages', activeChat, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChatThread(msgs);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }, () => {});
    return () => unsub();
  }, [activeChat]);

  // ── Agent online / offline toggle ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'agent_status'), snap => {
      setAgentOnline(snap.exists() ? !!snap.data()?.online : false);
    }, () => {});
    return () => unsub();
  }, []);

  const toggleAgentOnline = async () => {
    const next = !agentOnline;
    await setDoc(doc(db, 'site_data', 'agent_status'), {
      online: next, updatedBy: user?.email, updatedAt: serverTimestamp(),
    }).catch(() => {});
    setAgentOnline(next);
    showToast?.(next ? '🟢 You are now shown as Online' : '⚫ You are now shown as Offline');
  };

  const sendChatReply = async () => {
    if (!chatReply.trim() || !activeChat || chatSending) return;
    setChatSending(true);
    try {
      await addDoc(collection(db, 'contact_messages', activeChat, 'messages'), {
        text:        chatReply.trim(),
        sender:      'admin',
        senderName:  user?.name || 'Admin',
        senderEmail: user?.email || '',
        createdAt:   serverTimestamp(),
      });
      await setDoc(doc(db, 'contact_messages', activeChat), {
        lastMsg:    chatReply.trim().slice(0, 80),
        lastMsgAt:  serverTimestamp(),
        lastSender: 'admin',
        userRead:   false,
        status:     'replied',
      }, { merge: true });
      setChatReply('');
      showToast?.('✅ Reply sent');
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setChatSending(false);
  };

  const closeChatSession = async (sessionId) => {
    await setDoc(doc(db, 'contact_messages', sessionId), {
      status: 'closed', closedAt: serverTimestamp(),
    }, { merge: true });
    if (activeChat === sessionId) setActiveChat(null);
    showToast?.('✅ Chat session closed');
  };

  // ── Delete a single session + its messages subcollection ──────────────────
  const deleteChatSession = async (sessionId) => {
    try {
      // Delete all messages in subcollection first
      const msgsSnap = await getDocs(collection(db, 'contact_messages', sessionId, 'messages'));
      await Promise.all(msgsSnap.docs.map(d => deleteDoc(d.ref)));
      // Delete the parent session doc
      await deleteDoc(doc(db, 'contact_messages', sessionId));
      if (activeChat === sessionId) setActiveChat(null);
      setSelected(prev => { const n = new Set(prev); n.delete(sessionId); return n; });
      showToast?.('🗑 Chat session deleted');
    } catch (e) {
      showToast?.('❌ Delete failed: ' + e.message);
    }
    setDelConfirm(null);
  };

  // ── Bulk delete all selected sessions ────────────────────────────────────
  const bulkDelete = async () => {
    const ids = Array.from(selected);
    try {
      await Promise.all(ids.map(async id => {
        const msgsSnap = await getDocs(collection(db, 'contact_messages', id, 'messages'));
        await Promise.all(msgsSnap.docs.map(d => deleteDoc(d.ref)));
        await deleteDoc(doc(db, 'contact_messages', id));
      }));
      if (selected.has(activeChat)) setActiveChat(null);
      setSelected(new Set());
      showToast?.(`🗑 ${ids.length} session${ids.length > 1 ? 's' : ''} deleted`);
    } catch (e) {
      showToast?.('❌ Bulk delete failed: ' + e.message);
    }
    setDelConfirm(null);
  };

  // ── Delete a single thread message ──────────────────────────────────────────
  const deleteThreadMsg = async (msgId) => {
    if (!activeChat) return;
    await deleteDoc(doc(db, 'contact_messages', activeChat, 'messages', msgId)).catch(() => {});
    setSelectedMsgs(s => { const n = new Set(s); n.delete(msgId); return n; });
  };

  // ── Delete selected thread messages ─────────────────────────────────────────
  const deleteSelectedMsgs = async () => {
    if (!activeChat || selectedMsgs.size === 0) return;
    setMsgDeleting(true);
    const batch = writeBatch(db);
    selectedMsgs.forEach(id => batch.delete(doc(db, 'contact_messages', activeChat, 'messages', id)));
    await batch.commit().catch(() => {});
    setSelectedMsgs(new Set());
    setMsgSelectMode(false);
    setMsgDeleting(false);
    showToast?.('🗑 Messages deleted');
  };

  // ── Clear all messages in active chat ────────────────────────────────────────
  const clearAllThreadMsgs = async () => {
    if (!activeChat) return;
    if (!window.confirm('Clear ALL messages in this chat? This cannot be undone.')) return;
    setMsgDeleting(true);
    const snap = await getDocs(collection(db, 'contact_messages', activeChat, 'messages')).catch(() => ({ docs: [] }));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(() => {});
    setMsgSelectMode(false);
    setSelectedMsgs(new Set());
    setMsgDeleting(false);
    showToast?.('🗑 Chat cleared');
  };

  const toggleMsgSelect = (id) => {
    setSelectedMsgs(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll  = () => setSelected(new Set(chatSessions.map(s => s.id)));
  const clearSel   = () => setSelected(new Set());

  return (
    <>
    {/* ── Delete confirmation modal ── */}
    {delConfirm && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
        onClick={e => e.target === e.currentTarget && setDelConfirm(null)}>
        <div style={{ background:'var(--surface)', border:'1px solid rgba(231,76,60,0.4)', borderRadius:'var(--r)', padding:28, maxWidth:380, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:10 }}>🗑</div>
          <h3 style={{ marginBottom:8, color:'#e74c3c' }}>
            {delConfirm === 'bulk' ? `Delete ${selected.size} session${selected.size > 1 ? 's' : ''}?` : 'Delete this chat session?'}
          </h3>
          <p style={{ fontSize:'0.85rem', color:'var(--muted)', marginBottom:20 }}>
            This permanently removes the session and all messages. This cannot be undone.
          </p>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button className="btn btn-sm" onClick={delConfirm === 'bulk' ? bulkDelete : () => deleteChatSession(delConfirm)}
              style={{ background:'rgba(231,76,60,0.15)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.4)' }}>
              🗑 Delete
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDelConfirm(null)}>Cancel</button>
          </div>
        </div>
      </div>
    )}

    <div className="adm-messages-shell">
      {/* ── Page header ── */}
      <div className="adm-messages-topbar">
        <div>
          <h1 style={{ fontSize:'1.5rem', margin:0, marginBottom:3 }}>⚡ Live Chat</h1>
          <span style={{ fontSize:'0.85rem', color:'var(--muted)' }}>
            {chatSessions.length} session{chatSessions.length !== 1 ? 's' : ''} · 
            <span style={{ marginLeft:8, display:'inline-flex', alignItems:'center', gap:6 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background: agentOnline ? '#2ecc71' : '#64748b' }} />
              {agentOnline ? '🟢 Online' : '⚫ Offline'}
            </span>
          </span>
        </div>
        {/* Bulk action toolbar — shown when sessions are selected */}
        {selected.size > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.82rem', color:'var(--gold)', fontWeight:600 }}>
              {selected.size} selected
            </span>
            <button className="btn btn-sm" onClick={clearSel}
              style={{ background:'rgba(255,255,255,0.06)', color:'var(--muted)', border:'1px solid var(--dim)' }}>
              ✕ Clear
            </button>
            <button className="btn btn-sm" onClick={() => setDelConfirm('bulk')}
              style={{ background:'rgba(231,76,60,0.12)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.35)' }}>
              🗑 Delete Selected
            </button>
          </div>
        )}
        {/* Select all when none selected */}
        {selected.size === 0 && chatSessions.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={selectAll} style={{ fontSize:'0.78rem' }}>
            ☑ Select All
          </button>
        )}
      </div>

      {/* ── Main grid: session list + thread ── */}
      <div className="adm-livechat-shell">

        {/* ── Session list (left column) ── */}
        <div className="adm-livechat-list">

          {/* Sessions header with online toggle */}
          <div className="adm-livechat-list-header">
            <span style={{ fontSize:'0.76rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5 }}>
              Sessions ({chatSessions.length})
            </span>
            <button
              className="adm-online-toggle"
              onClick={toggleAgentOnline}
            >
              <span style={{ width:6, height:6, borderRadius:'50%', background: agentOnline ? '#2ecc71' : '#64748b', display:'inline-block' }} />
              {agentOnline ? 'Online' : 'Go Online'}
            </button>
          </div>

          {/* Sessions list */}
          <div className="adm-livechat-sessions">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                Loading sessions…
              </div>
            ) : chatSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>💬</div>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>No live chat sessions yet</p>
                <p style={{ fontSize: '0.75rem' }}>
                  Users start a chat using the widget on the site.
                  <br />Toggle <strong>Go Online</strong> above so they know an agent is available.
                </p>
              </div>
            ) : chatSessions.map(s => {
              const isActive   = activeChat === s.id;
              const hasNew     = s.lastSender === 'user' && s.status !== 'closed';
              const isSelected = selected.has(s.id);
              return (
                <div key={s.id}
                  className={'adm-livechat-session-row' + (isActive ? ' active' : '') + (hasNew ? ' has-new' : '')}
                  onClick={() => setActiveChat(s.id)}
                  style={{ outline: isSelected ? '2px solid rgba(201,168,76,0.45)' : undefined, outlineOffset: '-2px' }}
                >
                  {/* Top row: checkbox + avatar + name + status */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
                      <input
                        type="checkbox" checked={isSelected}
                        onChange={e => toggleSelect(s.id, e)}
                        onClick={e => e.stopPropagation()}
                        style={{ accentColor:'var(--gold)', width:13, height:13, flexShrink:0, cursor:'pointer' }}
                      />
                      <div className="adm-livechat-avatar">{(s.name || '?')[0].toUpperCase()}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:'0.88rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name || 'Guest'}</div>
                        <div style={{ fontSize:'0.7rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.email || ''}</div>
                      </div>
                    </div>
                    <span className={'adm-livechat-status-badge' + (s.status === 'closed' ? ' closed' : hasNew ? ' new' : ' active')}>
                      {s.status === 'closed' ? 'closed' : hasNew ? '● new' : 'active'}
                    </span>
                  </div>
                  {/* Preview */}
                  <div style={{ fontSize:'0.78rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4, paddingLeft:21 }}>
                    {s.lastMsg || 'Chat started'}
                  </div>
                  {/* Bottom: timestamp + End + Delete */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingLeft:21 }}>
                    <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{fmtDate(s.lastMsgAt || s.createdAt)}</span>
                    <div style={{ display:'flex', gap:3 }} onClick={e => e.stopPropagation()}>
                      {s.status !== 'closed' && (
                        <button onClick={() => closeChatSession(s.id)}
                          style={{ background:'none', border:'none', color:'var(--muted)', fontSize:'0.68rem', cursor:'pointer', padding:'1px 5px', fontFamily:'inherit', borderRadius:3, transition:'color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.color='var(--gold)'}
                          onMouseLeave={e => e.currentTarget.style.color='var(--muted)'}
                          title="End chat">End</button>
                      )}
                      <button onClick={() => setDelConfirm(s.id)}
                        style={{ background:'none', border:'none', color:'var(--muted)', fontSize:'0.75rem', cursor:'pointer', padding:'1px 5px', fontFamily:'inherit', borderRadius:3, transition:'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color='#e74c3c'}
                        onMouseLeave={e => e.currentTarget.style.color='var(--muted)'}
                        title="Delete session">🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Chat thread (right column) ── */}
        {activeChat ? (
          <div className="adm-livechat-thread">
            {/* header */}
            {(() => {
              const s = chatSessions.find(x => x.id === activeChat);
              return (
                <div className="adm-livechat-thread-header">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '0.95rem' }}>💬 {s?.name || 'Guest'}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 10 }}>{s?.email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap:'wrap', alignItems:'center', justifyContent:'flex-end' }}>
                    {!msgSelectMode ? (
                      <>
                        {chatThread.length > 0 && (
                          <button
                            onClick={() => { setMsgSelectMode(true); setSelectedMsgs(new Set()); }}
                            style={{ fontSize:'0.72rem', padding:'4px 8px', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit' }}>
                            ☑ Select
                          </button>
                        )}
                        {chatThread.length > 0 && (
                          <button
                            onClick={clearAllThreadMsgs}
                            disabled={msgDeleting}
                            style={{ fontSize:'0.72rem', padding:'4px 8px', background:'rgba(231,76,60,0.1)', border:'1px solid rgba(231,76,60,0.3)', color:'#e74c3c', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit' }}>
                            🗑 Clear All
                          </button>
                        )}
                        {s?.status !== 'closed' && (
                          <button className="btn btn-sm btn-ghost" onClick={() => closeChatSession(activeChat)}>End Chat</button>
                        )}
                        <button className="btn btn-sm"
                          onClick={() => setDelConfirm(activeChat)}
                          style={{ background:'rgba(231,76,60,0.1)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.3)' }}
                          title="Delete this session permanently">
                          🗑 Delete
                        </button>
                        <button className="adm-close-btn" onClick={() => setActiveChat(null)}>✕</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{selectedMsgs.size} selected</span>
                        <button
                          disabled={msgDeleting || selectedMsgs.size === 0}
                          onClick={deleteSelectedMsgs}
                          style={{ fontSize:'0.72rem', padding:'4px 10px', background:'rgba(231,76,60,0.12)', border:'1px solid rgba(231,76,60,0.3)', color:'#e74c3c', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit', opacity:selectedMsgs.size===0?0.4:1 }}>
                          {msgDeleting ? '⏳' : `🗑 Delete (${selectedMsgs.size})`}
                        </button>
                        <button
                          onClick={() => { setMsgSelectMode(false); setSelectedMsgs(new Set()); }}
                          style={{ fontSize:'0.72rem', padding:'4px 8px', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit' }}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* messages */}
            <div className="adm-livechat-messages">
              {chatThread.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px 0', fontSize: '0.82rem' }}>No messages yet</div>
              )}
              {chatThread.map(msg => {
                const isAdmin  = msg.sender === 'admin';
                const isSystem = msg.sender === 'system';
                const isMsgSel = selectedMsgs.has(msg.id);
                if (isSystem) return (
                  <div key={msg.id} style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: 20, alignSelf: 'center' }}>
                    {msg.text}
                  </div>
                );
                return (
                  <div key={msg.id}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start', cursor: msgSelectMode ? 'pointer' : 'default' }}
                    onClick={() => msgSelectMode && toggleMsgSelect(msg.id)}
                  >
                    <div style={{ display:'flex', alignItems:'flex-end', gap:6, flexDirection: isAdmin ? 'row-reverse' : 'row' }}>
                      {/* select checkbox */}
                      {msgSelectMode && (
                        <div style={{
                          width:16, height:16, borderRadius:4, flexShrink:0,
                          border:`2px solid ${isMsgSel ? 'var(--gold)' : 'rgba(255,255,255,0.25)'}`,
                          background: isMsgSel ? 'var(--gold)' : 'transparent',
                          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4,
                        }}>
                          {isMsgSel && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                      )}
                      <div style={{
                        maxWidth: '78%', padding: '10px 14px',
                        borderRadius: isAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMsgSel
                          ? 'rgba(231,76,60,0.18)'
                          : isAdmin ? 'rgba(201,168,76,0.16)' : 'rgba(74,158,255,0.1)',
                        border: isMsgSel
                          ? '2px solid rgba(231,76,60,0.4)'
                          : isAdmin ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(74,158,255,0.2)',
                        fontSize: '0.88rem', lineHeight: 1.55, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                        transition:'background 0.1s, border 0.1s',
                      }}>{msg.text}</div>
                      {/* per-message delete (non-select mode) */}
                      {!msgSelectMode && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteThreadMsg(msg.id); }}
                          title="Delete message"
                          style={{ background:'none', border:'none', color:'rgba(255,255,255,0.18)', cursor:'pointer', padding:'2px 4px', fontSize:'0.72rem', lineHeight:1, flexShrink:0, alignSelf:'center' }}
                          onMouseEnter={e => e.currentTarget.style.color='rgba(231,76,60,0.85)'}
                          onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.18)'}
                        >🗑</button>
                      )}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 3, paddingInline: 4 }}>
                      {isAdmin ? '🛡️ You' : `👤 ${msg.senderName || 'User'}`}
                      {msg.createdAt && ' · '}
                      {msg.createdAt && (() => {
                        try { const d = msg.createdAt?.toDate?.() || new Date(msg.createdAt); return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
                      })()}
                    </span>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* reply box */}
            <div className="adm-livechat-reply-box">
              {chatSessions.find(x => x.id === activeChat)?.status !== 'closed' ? (
                <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'flex-end' }}>
                  <textarea
                    className="field"
                    rows={2}
                    value={chatReply}
                    onChange={e => setChatReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendChatReply(); }}
                    placeholder="Type reply… (Ctrl+Enter to send)"
                    style={{ flex: 1, resize: 'none', fontSize: '0.9rem' }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={sendChatReply}
                    disabled={chatSending || !chatReply.trim()}
                    style={{ minWidth: 80, flexShrink: 0 }}
                  >{chatSending ? '⏳' : '↩ Send'}</button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  This chat session is closed.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, background: 'var(--card)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize:'3rem', marginBottom:12 }}>💬</div>
              <p style={{ fontSize:'0.95rem', fontWeight:600, marginBottom:6 }}>Select a chat session</p>
              <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Click a conversation on the left to view and reply</p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
