/**
 * LiveChat — floating chat widget for site users.
 * Creates a real-time conversation in Firestore under:
 *   contact_messages/{chatId}               (header doc, type: 'live_chat')
 *   contact_messages/{chatId}/messages/{id} (individual messages)
 *
 * Admins see these sessions in MessagesPanel under the "Live Chat" tab.
 */

import { useState, useEffect, useRef } from 'react';
import {
  collection, doc, setDoc, addDoc, onSnapshot, deleteDoc, writeBatch,
  serverTimestamp, query, orderBy, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';

/* ─── helpers ─── */
const fmtTime = ts => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

/* ─── tiny sound for new admin message ─── */
function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
  } catch {}
}

export default function LiveChat() {
  const { user } = useApp();

  const [open,        setOpen]        = useState(false);
  const [chatId,      setChatId]      = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [draft,       setDraft]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [unread,      setUnread]      = useState(0);
  const [selectMode,  setSelectMode]  = useState(false);
  const [selected,    setSelected]    = useState(new Set());
  const [deleting,    setDeleting]    = useState(false);

  const bottomRef    = useRef(null);
  const prevMsgCount = useRef(0);
  const inputRef     = useRef(null);

  /* ── listen for AI handoff event ── */
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setUnread(0);
    };
    window.addEventListener('ellines-open-livechat', handler);
    return () => window.removeEventListener('ellines-open-livechat', handler);
  }, []);

  /* ── restore existing chat session from localStorage ── */
  useEffect(() => {
    const stored = localStorage.getItem('eh_live_chat_id');
    if (stored) setChatId(stored);
  }, []);

  /* ── auto-start chat when opened via AI handoff (no existing session) ── */
  useEffect(() => {
    if (!open) return;
    const stored = localStorage.getItem('eh_live_chat_id');
    if (stored || chatId) return; // session already exists

    // create a new session automatically
    (async () => {
      const email = user?.email || 'guest@unknown.com';
      const name  = user?.name  || 'Guest';
      const newId = 'chat_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now();
      await setDoc(doc(db, 'contact_messages', newId), {
        name,
        email:      email.toLowerCase(),
        userId:     user?.id || '',
        subject:    'Live Chat',
        message:    '',
        type:       'live_chat',
        status:     'new',
        threadId:   newId,
        createdAt:  serverTimestamp(),
        lastMsg:    '',
        lastMsgAt:  serverTimestamp(),
        lastSender: 'user',
        userRead:   true,
        agentOnline: false,
      });
      setChatId(newId);
      localStorage.setItem('eh_live_chat_id', newId);
      await addDoc(collection(db, 'contact_messages', newId, 'messages'), {
        text:       `👋 Hi ${name}! You're now connected. An agent will be with you shortly.`,
        sender:     'system',
        senderName: 'Ellines Haven',
        createdAt:  serverTimestamp(),
      });
    })();
  }, [open]); // eslint-disable-line

  /* ── listen for agent online status ── */
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'agent_status'), snap => {
      setAgentOnline(snap.exists() ? !!snap.data()?.online : false);
    }, () => {});
    return () => unsub();
  }, []);

  /* ── messages listener ── */
  useEffect(() => {
    if (!chatId) return;
    const q = query(
      collection(db, 'contact_messages', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // play sound + count unread admin messages when chat is closed
      const newAdminMsgs = msgs.filter(m => m.sender === 'admin').length;
      if (!open && newAdminMsgs > prevMsgCount.current) {
        const added = newAdminMsgs - prevMsgCount.current;
        setUnread(u => u + added);
        if (msgs.length > prevMsgCount.current) playPing();
      }
      prevMsgCount.current = newAdminMsgs;
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }, () => {});
    return () => unsub();
  }, [chatId, open]);

  /* ── clear unread when opened ── */
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  /* ── auto-scroll on new message when open ── */
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, [messages, open]);

  /* ── start or resume conversation ── */
  const startChat = async () => {
    if (chatId) return; // already exists

    const email  = user?.email || 'guest@unknown.com';
    const name   = user?.name  || 'Guest';
    const newId  = 'chat_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now();

    await setDoc(doc(db, 'contact_messages', newId), {
      name,
      email:      email.toLowerCase(),
      userId:     user?.id || '',
      subject:    'Live Chat',
      message:    '',
      type:       'live_chat',
      status:     'new',
      threadId:   newId,
      createdAt:  serverTimestamp(),
      lastMsg:    '',
      lastMsgAt:  serverTimestamp(),
      lastSender: 'user',
      userRead:   true,
      agentOnline: false,
    });

    setChatId(newId);
    localStorage.setItem('eh_live_chat_id', newId);

    // send system greeting
    await addDoc(collection(db, 'contact_messages', newId, 'messages'), {
      text:       `👋 Hi ${name}! You're now connected. An agent will be with you shortly.`,
      sender:     'system',
      senderName: 'Ellines Haven',
      createdAt:  serverTimestamp(),
    });
  };

  /* ── send a message ── */
  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);

    let id = chatId;
    if (!id) {
      // create session on first message
      const email = user?.email || 'guest@unknown.com';
      const name  = user?.name  || 'Guest';
      id = 'chat_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now();
      await setDoc(doc(db, 'contact_messages', id), {
        name,
        email:     email.toLowerCase(),
        userId:    user?.id || '',
        subject:   'Live Chat',
        message:   draft.trim().slice(0, 100),
        type:      'live_chat',
        status:    'new',
        threadId:  id,
        createdAt: serverTimestamp(),
        lastMsg:   draft.trim().slice(0, 80),
        lastMsgAt: serverTimestamp(),
        lastSender:'user',
        userRead:  true,
      });
      setChatId(id);
      localStorage.setItem('eh_live_chat_id', id);
    }

    await addDoc(collection(db, 'contact_messages', id, 'messages'), {
      text:        draft.trim(),
      sender:      'user',
      senderName:  user?.name || 'Guest',
      senderEmail: (user?.email || '').toLowerCase(),
      createdAt:   serverTimestamp(),
    });

    await setDoc(doc(db, 'contact_messages', id), {
      lastMsg:    draft.trim().slice(0, 80),
      lastMsgAt:  serverTimestamp(),
      lastSender: 'user',
      userRead:   true,
      status:     'new',
    }, { merge: true });

    setDraft('');
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* ── delete a single message (user can only delete their own) ── */
  const deleteMessage = async (msgId, sender) => {
    if (sender !== 'user' || !chatId) return; // users can only delete their own msgs
    try {
      await deleteDoc(doc(db, 'contact_messages', chatId, 'messages', msgId));
      setSelected(s => { const n = new Set(s); n.delete(msgId); return n; });
    } catch {}
  };

  /* ── bulk delete selected messages ── */
  const deleteSelected = async () => {
    if (!chatId || selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} message${selected.size > 1 ? 's' : ''}?`)) return;
    setDeleting(true);
    const batch = writeBatch(db);
    selected.forEach(id => {
      // only allow deleting user's own messages
      const msg = messages.find(m => m.id === id);
      if (msg?.sender === 'user') {
        batch.delete(doc(db, 'contact_messages', chatId, 'messages', id));
      }
    });
    await batch.commit().catch(() => {});
    setSelected(new Set());
    setSelectMode(false);
    setDeleting(false);
  };

  /* ── clear all user messages ── */
  const clearMyMessages = async () => {
    if (!chatId) return;
    if (!window.confirm('Clear all your messages from this chat?')) return;
    setDeleting(true);
    const batch = writeBatch(db);
    messages.forEach(m => {
      if (m.sender === 'user') {
        batch.delete(doc(db, 'contact_messages', chatId, 'messages', m.id));
      }
    });
    await batch.commit().catch(() => {});
    setSelectMode(false);
    setSelected(new Set());
    setDeleting(false);
  };

  const toggleSelect = (id, sender) => {
    if (sender !== 'user') return; // can only select own messages
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  /* ── reset chat (start new session) ── */
  const resetChat = () => {
    localStorage.removeItem('eh_live_chat_id');
    setChatId(null);
    setMessages([]);
    setDraft('');
    prevMsgCount.current = 0;
  };

  /* ─── render ─── */
  return (
    <>
      {/* ── FAB toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Live Chat"
        title="Chat with us"
        style={{
          position:    'fixed',
          bottom:      80,       // stack: WhatsApp(20px) + 50px height + 10px gap
          right:       20,
          zIndex:      7900,
          width:       50,
          height:      50,
          borderRadius:'50%',
          background:  'linear-gradient(135deg,#6c63ff,#4a9eff)',
          border:      'none',
          color:       '#fff',
          cursor:      'pointer',
          display:     'flex',
          alignItems:  'center',
          justifyContent:'center',
          boxShadow:   '0 4px 20px rgba(106,99,255,0.5)',
          transition:  'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform='scale(1.1)'; e.currentTarget.style.boxShadow='0 6px 28px rgba(106,99,255,0.65)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform='scale(1)';   e.currentTarget.style.boxShadow='0 4px 20px rgba(106,99,255,0.5)'; }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
        {/* unread badge */}
        {!open && unread > 0 && (
          <span style={{
            position:'absolute', top:-4, right:-4,
            background:'#e74c3c', color:'#fff',
            borderRadius:'50%', width:20, height:20,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'0.7rem', fontWeight:700, border:'2px solid var(--bg,#0d0d1a)',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div className="lc-window" style={{
          position:     'fixed',
          bottom:       140,
          right:        80,
          zIndex:       7900,
          width:        340,
          maxWidth:     'calc(100vw - 24px)',
          height:       480,
          maxHeight:    'calc(100vh - 200px)',
          background:   'var(--surface, #12122a)',
          border:       '1px solid rgba(106,99,255,0.35)',
          borderRadius: 16,
          boxShadow:    '0 16px 48px rgba(0,0,0,0.6)',
          display:      'flex',
          flexDirection:'column',
          overflow:     'hidden',
          animation:    'lc-appear 0.2s ease',
        }}>
          <style>{`
            @keyframes lc-appear {
              from { opacity:0; transform:translateY(12px) scale(0.97); }
              to   { opacity:1; transform:none; }
            }
            @media (max-width: 480px) {
              .lc-window {
                right: 0 !important;
                left: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                max-width: 100vw !important;
                height: 80vh !important;
                max-height: 80vh !important;
                border-radius: 20px 20px 0 0 !important;
                border-bottom: none !important;
              }
            }
            @media (min-width: 481px) and (max-width: 768px) {
              .lc-window {
                right: 12px !important;
                left: auto !important;
                bottom: 140px !important;
                width: calc(100vw - 24px) !important;
                max-width: calc(100vw - 24px) !important;
              }
            }
          `}</style>

          {/* header */}
          <div style={{
            background:  'linear-gradient(135deg,#6c63ff,#4a9eff)',
            padding:     '14px 16px',
            display:     'flex',
            alignItems:  'center',
            gap:         10,
            flexShrink:  0,
          }}>
            <div style={{
              width:36, height:36, borderRadius:'50%',
              background:'rgba(255,255,255,0.2)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1.1rem', flexShrink:0,
            }}>💬</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:'#fff', fontSize:'0.95rem', lineHeight:1.2 }}>Ellines Haven Support</div>
              <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.8)', display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background: agentOnline ? '#2ecc71' : 'rgba(255,255,255,0.4)', flexShrink:0, display:'inline-block' }}/>
                {agentOnline ? 'Agent online' : 'Leave a message — we reply within 24 hrs'}
              </div>
            </div>
            <button
              onClick={resetChat}
              title="Start new chat"
              style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:'0.7rem', fontFamily:'inherit' }}>
              New
            </button>
          </div>

          {/* multi-select toolbar */}
          {chatId && (
            <div style={{
              display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
              background:'rgba(0,0,0,0.25)', borderBottom:'1px solid rgba(255,255,255,0.07)',
              flexShrink:0,
            }}>
              {!selectMode ? (
                <>
                  <button onClick={() => { setSelectMode(true); setSelected(new Set()); }}
                    style={{ background:'none', border:'1px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.7)', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontSize:'0.68rem', fontFamily:'inherit' }}>
                    ☑ Select
                  </button>
                  <button onClick={clearMyMessages} disabled={deleting || messages.filter(m=>m.sender==='user').length===0}
                    style={{ background:'none', border:'1px solid rgba(231,76,60,0.3)', color:'rgba(231,76,60,0.8)', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontSize:'0.68rem', fontFamily:'inherit', opacity: messages.filter(m=>m.sender==='user').length===0?0.4:1 }}>
                    🗑 Clear Mine
                  </button>
                </>
              ) : (
                <>
                  <span style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.6)', marginRight:2 }}>
                    {selected.size} selected
                  </span>
                  <button onClick={deleteSelected} disabled={deleting || selected.size === 0}
                    style={{ background: selected.size>0?'rgba(231,76,60,0.2)':'none', border:'1px solid rgba(231,76,60,0.4)', color:'#e74c3c', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontSize:'0.68rem', fontFamily:'inherit', opacity:selected.size===0?0.4:1 }}>
                    {deleting ? '⏳' : `🗑 Delete (${selected.size})`}
                  </button>
                  <button onClick={() => { setSelectMode(false); setSelected(new Set()); }}
                    style={{ background:'none', border:'1px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.6)', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontSize:'0.68rem', fontFamily:'inherit', marginLeft:'auto' }}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}

          {/* messages area */}
          <div style={{
            flex:      1,
            overflowY: 'auto',
            padding:   selectMode ? '14px 12px 14px 32px' : '14px 12px',
            display:   'flex',
            flexDirection: 'column',
            gap:       10,
            transition: 'padding 0.15s',
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign:'center', padding:'24px 12px', color:'var(--muted,#7a7a9a)', fontSize:'0.82rem' }}>
                <div style={{ fontSize:'2rem', marginBottom:8 }}>👋</div>
                <p style={{ marginBottom:6 }}>Hi{user?.name ? ` ${user.name.split(' ')[0]}` : ''}! How can we help you today?</p>
                <p style={{ fontSize:'0.72rem', marginTop:4 }}>Type a message below — an agent will reply shortly.</p>
                <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid rgba(255,255,255,0.07)' }}>
                  <p style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)', marginBottom:8 }}>Need a faster reply?</p>
                  <a
                    href="https://wa.me/254748255466"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display:'inline-flex', alignItems:'center', gap:6,
                      background:'rgba(37,211,102,0.12)', border:'1px solid rgba(37,211,102,0.3)',
                      color:'#2ecc71', borderRadius:20, padding:'6px 14px',
                      fontSize:'0.75rem', fontWeight:600, textDecoration:'none',
                      transition:'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(37,211,102,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(37,211,102,0.12)'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#2ecc71"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp us directly
                  </a>
                </div>
              </div>
            )}
            {messages.map(msg => {
              const isUser   = msg.sender === 'user';
              const isSystem = msg.sender === 'system';
              const isSelectedMsg = selected.has(msg.id);
              if (isSystem) return (
                <div key={msg.id} style={{ textAlign:'center', fontSize:'0.72rem', color:'var(--muted,#7a7a9a)', padding:'4px 8px', background:'rgba(255,255,255,0.04)', borderRadius:20 }}>
                  {msg.text}
                </div>
              );
              return (
                <div key={msg.id}
                  style={{ display:'flex', flexDirection:'column', alignItems: isUser ? 'flex-end' : 'flex-start', position:'relative' }}
                  onClick={() => selectMode && isUser && toggleSelect(msg.id, msg.sender)}
                >
                  {/* selection indicator */}
                  {selectMode && isUser && (
                    <div style={{
                      position:'absolute', left:-22, top:'50%', transform:'translateY(-50%)',
                      width:16, height:16, borderRadius:4,
                      border:'2px solid rgba(106,99,255,0.7)',
                      background: isSelectedMsg ? '#6c63ff' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      cursor:'pointer', flexShrink:0,
                    }}>
                      {isSelectedMsg && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  )}
                  <div style={{
                    maxWidth:    '80%',
                    padding:     '9px 13px',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background:   isSelectedMsg
                      ? 'rgba(231,76,60,0.25)'
                      : isUser ? 'linear-gradient(135deg,#6c63ff,#4a9eff)' : 'rgba(255,255,255,0.08)',
                    color:        '#fff',
                    fontSize:     '0.88rem',
                    lineHeight:   1.55,
                    wordBreak:    'break-word',
                    whiteSpace:   'pre-wrap',
                    cursor:       selectMode && isUser ? 'pointer' : 'default',
                    transition:   'background 0.15s',
                    outline:      isSelectedMsg ? '2px solid rgba(231,76,60,0.5)' : 'none',
                  }}>{msg.text}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3, paddingInline:4 }}>
                    <span style={{ fontSize:'0.65rem', color:'var(--muted,#7a7a9a)' }}>
                      {isUser ? 'You' : '🛡️ Agent'} · {fmtTime(msg.createdAt)}
                    </span>
                    {/* delete own message (non-select mode) */}
                    {isUser && !selectMode && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteMessage(msg.id, msg.sender); }}
                        title="Delete message"
                        style={{ background:'none', border:'none', color:'rgba(255,255,255,0.25)', cursor:'pointer', padding:'0 2px', fontSize:'0.65rem', lineHeight:1, display:'flex', alignItems:'center' }}
                        onMouseEnter={e => e.currentTarget.style.color='rgba(231,76,60,0.8)'}
                        onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.25)'}
                      >🗑</button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* input bar */}
          <div style={{
            borderTop:  '1px solid rgba(255,255,255,0.08)',
            padding:    '10px 10px',
            display:    'flex',
            gap:        8,
            flexShrink: 0,
            background: 'rgba(0,0,0,0.2)',
          }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type a message…"
              style={{
                flex:        1,
                resize:      'none',
                background:  'rgba(255,255,255,0.07)',
                border:      '1px solid rgba(255,255,255,0.1)',
                borderRadius:10,
                color:       '#fff',
                padding:     '8px 12px',
                fontSize:    '0.88rem',
                lineHeight:  1.5,
                fontFamily:  'inherit',
                outline:     'none',
                maxHeight:   80,
                overflowY:   'auto',
              }}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              style={{
                flexShrink:  0,
                width:       38,
                height:      38,
                borderRadius:'50%',
                background:  draft.trim() ? 'linear-gradient(135deg,#6c63ff,#4a9eff)' : 'rgba(255,255,255,0.08)',
                border:      'none',
                color:       '#fff',
                cursor:      draft.trim() ? 'pointer' : 'default',
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'center',
                transition:  'background 0.2s',
                alignSelf:   'flex-end',
              }}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          {/* footer note */}
          <div style={{ textAlign:'center', fontSize:'0.62rem', color:'var(--muted,#7a7a9a)', padding:'5px 8px 7px', flexShrink:0, background:'rgba(0,0,0,0.15)' }}>
            Powered by Ellines Haven · Mon–Sat 8am–8pm EAT
          </div>
        </div>
      )}
    </>
  );
}
