import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, writeBatch,
         serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

const WA_ADMIN = '254748255466';
const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
};

/* ── Order notification banner shown at top of Messages panel ── */
function OrderNotificationBanner({ orders, onDismiss }) {
  const unread = orders.filter(o => o.status === 'unread');
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const requestPerm = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  if (!unread.length && notifPerm === 'granted') return null;

  return (
    <div style={{
      background:'rgba(232,131,42,0.12)', border:'2px solid rgba(232,131,42,0.5)',
      borderRadius:'var(--r)', padding:'14px 18px', marginBottom:16,
      display:'flex', flexDirection:'column', gap:10,
    }}>
      {/* Permission prompt if not granted */}
      {notifPerm !== 'granted' && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom: unread.length ? 10 : 0, borderBottom: unread.length ? '1px solid rgba(232,131,42,0.25)' : 'none' }}>
          <span style={{ fontSize:'0.82rem', color:'var(--muted)' }}>
            🔔 Enable browser notifications to get alerted for new orders — even when this tab isn't active
          </span>
          <button onClick={requestPerm}
            style={{ flexShrink:0, marginLeft:12, padding:'5px 12px', background:'var(--gold)', color:'#000', border:'none', borderRadius:20, cursor:'pointer', fontSize:'0.78rem', fontWeight:700, fontFamily:'inherit' }}>
            Enable
          </button>
        </div>
      )}

      {unread.length > 0 && (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <strong style={{ color:'#e8832a', fontSize:'0.95rem' }}>🛒 {unread.length} New Order{unread.length > 1 ? 's' : ''}!</strong>
            <button onClick={onDismiss} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'0.8rem' }}>
              Mark all read
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {unread.slice(0, 3).map(o => (
              <div key={o.orderId || o.id} style={{
                background:'rgba(0,0,0,0.2)', borderRadius:'var(--r-sm)', padding:'10px 14px',
                display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap',
              }}>
                <div>
                  <div style={{ fontSize:'0.88rem', fontWeight:700, color:'var(--text)' }}>
                    {o.userName || 'Unknown'} <span style={{ color:'var(--muted)', fontWeight:400 }}>({o.userEmail || 'no email'})</span>
                  </div>
                  <div style={{ fontSize:'0.78rem', color:'var(--muted)', marginTop:2 }}>
                    {(o.items || []).map(i => i.title).join(', ')} · <strong style={{ color:'#e8832a' }}>KSh {o.total}</strong> · {o.method}
                  </div>
                  <div style={{ fontSize:'0.7rem', color:'var(--muted)', marginTop:2 }}>{fmtDate(o.createdAt)}</div>
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  {o.waLink && (
                    <a href={o.waLink} target="_blank" rel="noopener noreferrer"
                      style={{
                        padding:'6px 14px', background:'rgba(37,211,102,0.15)', color:'#25D366',
                        border:'1px solid rgba(37,211,102,0.4)', borderRadius:20,
                        textDecoration:'none', fontSize:'0.8rem', fontWeight:600,
                        display:'flex', alignItems:'center', gap:5,
                      }}>
                      💬 WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => setDoc(doc(db, 'admin_notifications', o.orderId || o.id), { status:'read' }, { merge:true }).catch(() => {})}
                    style={{ padding:'6px 12px', background:'rgba(255,255,255,0.07)', color:'var(--muted)', border:'1px solid var(--border)', borderRadius:20, cursor:'pointer', fontSize:'0.78rem', fontFamily:'inherit' }}>
                    ✓ Dismiss
                  </button>
                </div>
              </div>
            ))}
            {unread.length > 3 && (
              <div style={{ fontSize:'0.78rem', color:'var(--muted)', textAlign:'center' }}>
                +{unread.length - 3} more orders — check the Orders tab
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
const SC = {
  new:          { bg:'rgba(232,131,42,0.12)', color:'#e8832a',    border:'rgba(232,131,42,0.3)'   },
  read:         { bg:'rgba(74,158,255,0.1)',  color:'#4a9eff',    border:'rgba(74,158,255,0.25)'  },
  replied:      { bg:'rgba(46,204,113,0.1)',  color:'var(--ok)',  border:'rgba(46,204,113,0.25)'  },
  spam:         { bg:'rgba(100,116,139,0.1)', color:'#64748b',    border:'rgba(100,116,139,0.25)' },
  notification: { bg:'rgba(201,168,76,0.1)',  color:'var(--gold)',border:'rgba(201,168,76,0.25)'  },
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

export default function MessagesPanel({ showToast, users = [] }) {
  const { user } = useApp();
  const [messages,    setMessages]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('all');
  const [selected,    setSelected]    = useState(null);
  const [thread,      setThread]      = useState([]);
  const [replyDraft,  setReplyDraft]  = useState('');
  const [sending,     setSending]     = useState(false);
  const [sendErr,     setSendErr]     = useState('');
  const [search,      setSearch]      = useState('');
  const [tab,         setTab]         = useState('messages');
  // Compose-to-user modal
  const [composeOpen, setComposeOpen] = useState(false);
  const [toEmail,     setToEmail]     = useState('');
  const [toSearch,    setToSearch]    = useState('');
  const [compSubject, setCompSubject] = useState('');
  const [compBody,    setCompBody]    = useState('');
  const [composing,   setComposing]   = useState(false);
  const [compErr,     setCompErr]     = useState('');
  // Multi-select for message list
  const [listSelected,    setListSelected]    = useState(new Set());
  const [listDeleting,    setListDeleting]    = useState(false);
  // Multi-select for thread messages (admin can delete any message)
  const [threadSelectMode, setThreadSelectMode] = useState(false);
  const [threadSelected,   setThreadSelected]   = useState(new Set());
  const [threadDeleting,   setThreadDeleting]   = useState(false);

  // ── Order notifications from admin_notifications ─────────────────────────
  const [orderNotifs, setOrderNotifs] = useState([]);
  const prevOrderIds = useRef(new Set());
  const orderMounted = useRef(false);

  // Request browser notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(n => n.type === 'new_order');

      // Find genuinely new unread orders (not seen before)
      if (orderMounted.current) {
        notifs.forEach(n => {
          if (n.status === 'unread' && !prevOrderIds.current.has(n.orderId || n.id)) {
            // Browser notification (works even if tab is in background)
            if ('Notification' in window && Notification.permission === 'granted') {
              const itemList = (n.items || []).map(i => i.title).join(', ');
              new Notification('🛒 New Order — Ellines Haven', {
                body: `${n.userName || 'A customer'} ordered: ${itemList} · KSh ${n.total}`,
                icon: '/logo-icon.png',
                tag: n.orderId || n.id,
              });
            }
            playAdminNotifSound();
          }
        });
      }
      prevOrderIds.current = new Set(notifs.map(n => n.orderId || n.id));
      orderMounted.current = true;
      setOrderNotifs(notifs);
    }, () => {});
    return () => unsub();
  }, []);

  const dismissAllOrders = async () => {
    const unread = orderNotifs.filter(o => o.status === 'unread');
    await Promise.all(unread.map(o =>
      setDoc(doc(db, 'admin_notifications', o.orderId || o.id), { status:'read' }, { merge:true }).catch(() => {})
    ));
  };
  const threadRef  = useRef(null);
  const prevIds    = useRef(new Set());
  const mounted    = useRef(false);

  // ── Messages listener ─────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'contact_messages'), snap => {
      const fresh = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
      if (mounted.current) {
        const hasNew = fresh.some(m =>
          !prevIds.current.has(m.id) &&
          (m.status === 'new' || !m.status) &&
          m.lastSender !== 'admin'
        );
        if (hasNew) playAdminNotifSound();
      }
      prevIds.current = new Set(fresh.map(m => m.id));
      mounted.current = true;
      setMessages(fresh);
      setLoading(false);
    }, (err) => { console.error('[MessagesPanel] listener error:', err.message); setLoading(false); });
    return () => unsub();
  }, []);

  // ── Thread listener ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected?.threadId) { setThread([]); return; }
    // No orderBy — sort client-side to avoid subcollection index requirement
    let first = true;
    const unsub = onSnapshot(
      collection(db, 'contact_messages', selected.threadId, 'messages'),
      snap => {
        const msgs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const tb = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return ta - tb;
          });
        if (!first) {
          const last = msgs[msgs.length - 1];
          if (last?.sender === 'user') playAdminNotifSound();
        }
        first = false;
        setThread(msgs);
        setTimeout(() => threadRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      err => console.error('[MessagesPanel] thread error:', err.message)
    );
    return () => unsub();
  }, [selected?.threadId]);



  // ── Open message / seed thread ────────────────────────────────────────────
  const openMessage = async msg => {
    const threadId = msg.threadId || msg.id;
    const newStatus = msg.status === 'new' || !msg.status ? 'read' : msg.status;
    setSelected({ ...msg, threadId, status: newStatus });
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: newStatus, threadId } : m));
    setReplyDraft(''); setSendErr('');

    // Always ensure threadId is persisted on the doc
    if (msg.status === 'new' || !msg.status || !msg.threadId) {
      await setDoc(doc(db, 'contact_messages', msg.id),
        { status: newStatus, threadId, updatedAt: serverTimestamp() }, { merge: true });
    }

    // Seed the subcollection with the original message if it's empty
    // This handles both legacy messages (no threadId) and new ones where seeding failed
    if (msg.message) {
      try {
        const subSnap = await getDocs(collection(db, 'contact_messages', threadId, 'messages'));
        if (subSnap.empty) {
          await setDoc(doc(db, 'contact_messages', threadId, 'messages', 'msg_0'), {
            text: msg.message,
            sender: 'user',
            senderName: msg.name || 'User',
            senderEmail: msg.email || '',
            createdAt: msg.createdAt || serverTimestamp(),
          });
        }
      } catch {}
    }
  };

  // ── Reply to existing conversation ────────────────────────────────────────
  const sendReply = async () => {
    if (!selected || !replyDraft.trim()) return;
    setSending(true); setSendErr('');
    const threadId = selected.threadId || selected.id;
    try {
      await addDoc(collection(db, 'contact_messages', threadId, 'messages'), {
        text: replyDraft.trim(), sender: 'admin',
        senderName: user?.name || 'Admin', senderEmail: user?.email,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'contact_messages', selected.id), {
        status: 'replied', threadId,
        lastMsg: replyDraft.trim().slice(0, 80),
        lastMsgAt: serverTimestamp(), lastSender: 'admin',
        userRead: false,
        lastAdminReply: replyDraft.trim().slice(0, 80),
        repliedAt: serverTimestamp(),
      }, { merge: true });
      setMessages(prev => prev.map(m => m.id === selected.id ? { ...m, status: 'replied' } : m));
      setReplyDraft('');
      showToast?.('✅ Reply sent');
    } catch (e) {
      setSendErr('Failed: ' + e.message);
      showToast?.('❌ ' + e.message);
    }
    setSending(false);
  };

  // ── Compose new message TO a user ─────────────────────────────────────────
  const sendCompose = async () => {
    if (!toEmail || !compSubject.trim() || !compBody.trim()) {
      setCompErr('Please select a user and fill in subject + message.'); return;
    }
    setComposing(true); setCompErr('');
    const targetUser = users.find(u => u.email?.toLowerCase() === toEmail);
    const convId = 'admin_msg_' + toEmail.replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    try {
      await setDoc(doc(db, 'contact_messages', convId), {
        name:       targetUser?.name || toEmail,
        email:      toEmail,
        userId:     targetUser?.id || '',
        subject:    compSubject.trim(),
        message:    compBody.trim(),
        type:       'direct',
        status:     'replied',
        threadId:   convId,
        createdAt:  serverTimestamp(),
        lastMsg:    compBody.trim().slice(0, 80),
        lastMsgAt:  serverTimestamp(),
        lastSender: 'admin',
        userRead:   false,
        fromAdmin:  true,
        adminEmail: user?.email,
        adminName:  user?.name || 'Admin',
      });
      await addDoc(collection(db, 'contact_messages', convId, 'messages'), {
        text: compBody.trim(), sender: 'admin',
        senderName: user?.name || 'Admin', senderEmail: user?.email,
        createdAt: serverTimestamp(),
      });
      setComposeOpen(false);
      setToEmail(''); setToSearch(''); setCompSubject(''); setCompBody('');
      showToast?.('✅ Message sent to ' + (targetUser?.name || toEmail));
    } catch (e) {
      setCompErr('Send failed: ' + e.message);
    }
    setComposing(false);
  };

  const markStatus = async (id, status) => {
    await setDoc(doc(db, 'contact_messages', id),
      { status, updatedAt: serverTimestamp() }, { merge: true });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    if (selected?.id === id) setSelected(s => ({ ...s, status }));
    showToast?.('✅ Marked as ' + status);
  };

  const deleteMsg = async id => {
    if (!window.confirm('Delete this message?')) return;
    // also delete subcollection messages
    try {
      const subSnap = await getDocs(collection(db, 'contact_messages', id, 'messages'));
      const batch = writeBatch(db);
      subSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'contact_messages', id));
      await batch.commit();
    } catch {
      await deleteDoc(doc(db, 'contact_messages', id)).catch(() => {});
    }
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selected?.id === id) setSelected(null);
    showToast?.('🗑 Deleted');
  };

  // ── Bulk delete selected messages (list) ────────────────────────────────────
  const deleteBulkMessages = async () => {
    if (listSelected.size === 0) return;
    if (!window.confirm(`Delete ${listSelected.size} conversation${listSelected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setListDeleting(true);
    for (const id of listSelected) {
      try {
        const subSnap = await getDocs(collection(db, 'contact_messages', id, 'messages'));
        const batch = writeBatch(db);
        subSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, 'contact_messages', id));
        await batch.commit();
      } catch {}
    }
    setMessages(prev => prev.filter(m => !listSelected.has(m.id)));
    if (listSelected.has(selected?.id)) setSelected(null);
    setListSelected(new Set());
    setListDeleting(false);
    showToast?.(`🗑 Deleted ${listSelected.size} conversation${listSelected.size > 1 ? 's' : ''}`);
  };

  const toggleListSelect = (id) => {
    setListSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectAllList = () => {
    setListSelected(new Set(filtered.map(m => m.id)));
  };

  // ── Thread message delete (admin) ────────────────────────────────────────────
  const deleteThreadMessage = async (msgId) => {
    if (!selected?.threadId) return;
    try {
      await deleteDoc(doc(db, 'contact_messages', selected.threadId, 'messages', msgId));
      setThreadSelected(s => { const n = new Set(s); n.delete(msgId); return n; });
    } catch {}
  };

  const deleteSelectedThreadMsgs = async () => {
    if (!selected?.threadId || threadSelected.size === 0) return;
    if (!window.confirm(`Delete ${threadSelected.size} message${threadSelected.size > 1 ? 's' : ''}?`)) return;
    setThreadDeleting(true);
    const batch = writeBatch(db);
    threadSelected.forEach(id => batch.delete(doc(db, 'contact_messages', selected.threadId, 'messages', id)));
    await batch.commit().catch(() => {});
    setThreadSelected(new Set());
    setThreadSelectMode(false);
    setThreadDeleting(false);
    showToast?.('🗑 Messages deleted');
  };

  const clearThreadMessages = async () => {
    if (!selected?.threadId) return;
    if (!window.confirm('Clear ALL messages in this conversation? This cannot be undone.')) return;
    setThreadDeleting(true);
    const subSnap = await getDocs(collection(db, 'contact_messages', selected.threadId, 'messages')).catch(() => ({ docs:[] }));
    const batch = writeBatch(db);
    subSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(() => {});
    setThreadSelectMode(false);
    setThreadSelected(new Set());
    setThreadDeleting(false);
    showToast?.('🗑 Conversation cleared');
  };

  const toggleThreadSelect = (id) => {
    setThreadSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const notifs   = messages.filter(m => m.type === 'notification');
  const regular  = messages.filter(m => m.type !== 'notification' && m.type !== 'live_chat');
  const base     = tab === 'notifications' ? notifs : regular;
  const filtered = base.filter(m => {
    const matchF = filter === 'all' || m.status === filter;
    const q = search.toLowerCase();
    const matchS = !q ||
      (m.name||'').toLowerCase().includes(q) ||
      (m.email||'').toLowerCase().includes(q) ||
      (m.subject||'').toLowerCase().includes(q) ||
      (m.message||'').toLowerCase().includes(q);
    return matchF && matchS;
  });
  const counts = {
    all: base.length,
    new: base.filter(m => m.status==='new'||!m.status).length,
    read: base.filter(m => m.status==='read').length,
    replied: base.filter(m => m.status==='replied').length,
    spam: base.filter(m => m.status==='spam').length,
  };
  const newCount = messages.filter(m => (m.status==='new'||!m.status) && m.type !== 'live_chat' && m.type !== 'notification').length;

  // Users available to compose to (exclude only yourself)
  const regularUsers = users.filter(u =>
    u.email?.toLowerCase() !== user?.email?.toLowerCase()
  );
  const filteredUsers = regularUsers.filter(u =>
    !toSearch ||
    u.name?.toLowerCase().includes(toSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(toSearch.toLowerCase())
  );


  return (
    <div className="adm-messages-shell">
      {composeOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:560, padding:28, display:'flex', flexDirection:'column', gap:16, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ margin:0, fontSize:'1.1rem', color:'var(--gold)' }}>✉️ New Message to User</h3>
              <button className="adm-close-btn" onClick={() => { setComposeOpen(false); setCompErr(''); }}>✕</button>
            </div>
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:6 }}>To — Select User</label>
              <input className="field" value={toSearch} onChange={e => { setToSearch(e.target.value); setToEmail(''); }} placeholder="Search by name or email…" />
              {toSearch && filteredUsers.length > 0 && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginTop:4, maxHeight:180, overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.3)' }}>
                  {filteredUsers.map(u => (
                    <div key={u.email} onClick={() => { setToEmail(u.email.toLowerCase()); setToSearch(u.name + ' — ' + u.email); }}
                      style={{ padding:'11px 14px', cursor:'pointer', fontSize:'0.9rem', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.04)', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(201,168,76,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(201,168,76,0.15)', color:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.85rem', flexShrink:0 }}>
                        {(u.name||u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight:600 }}>{u.name}</div>
                        <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{u.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {toEmail && <div style={{ marginTop:6, fontSize:'0.8rem', color:'var(--ok)', fontWeight:600 }}>✓ Sending to: {toEmail}</div>}
            </div>
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:6 }}>Subject</label>
              <input className="field" value={compSubject} onChange={e => setCompSubject(e.target.value)} placeholder="Subject…" />
            </div>
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:6 }}>Message</label>
              <textarea className="field" rows={5} value={compBody} onChange={e => setCompBody(e.target.value)} placeholder="Type your message…" style={{ resize:'vertical', fontSize:'0.95rem', lineHeight:1.65 }} />
            </div>
            {compErr && <div style={{ fontSize:'0.84rem', color:'#e74c3c', background:'rgba(231,76,60,0.08)', padding:'10px 14px', borderRadius:'var(--r-sm)', border:'1px solid rgba(231,76,60,0.25)' }}>⚠️ {compErr}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setComposeOpen(false); setCompErr(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={sendCompose} disabled={composing || !toEmail || !compSubject.trim() || !compBody.trim()}>
                {composing ? '⏳ Sending…' : '📤 Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="adm-messages-topbar">
        <div>
          <h1 style={{ fontSize:'1.5rem', margin:0, marginBottom:3 }}>Messages &amp; Notifications</h1>
          <span style={{ fontSize:'0.85rem', color:'var(--muted)' }}>
            {messages.length} total · {newCount > 0 ? <strong style={{ color:'#e8832a' }}>{newCount} new</strong> : 'all read'}
            {orderNotifs.filter(o => o.status === 'unread').length > 0 && (
              <> · <strong style={{ color:'#e8832a' }}>🛒 {orderNotifs.filter(o => o.status === 'unread').length} order{orderNotifs.filter(o => o.status === 'unread').length > 1 ? 's' : ''}</strong></>
            )}
          </span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* Bulk controls — appear automatically when any checkbox is ticked */}
          {listSelected.size > 0 && (
            <>
              <span style={{ fontSize:'0.82rem', color:'var(--muted)' }}>{listSelected.size} selected</span>
              <button className="btn btn-ghost btn-sm" onClick={selectAllList} style={{ fontSize:'0.78rem' }}>
                Select All ({filtered.length})
              </button>
              <button
                disabled={listDeleting || listSelected.size === 0}
                onClick={deleteBulkMessages}
                style={{ padding:'6px 14px', background:'rgba(231,76,60,0.15)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.35)', borderRadius:'var(--r-sm)', cursor:'pointer', fontSize:'0.82rem', fontFamily:'inherit', opacity:listSelected.size===0?0.4:1 }}>
                {listDeleting ? '⏳ Deleting…' : `🗑 Delete (${listSelected.size})`}
              </button>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setListSelected(new Set())}
                style={{ fontSize:'0.78rem' }}>
                Clear
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={() => { setComposeOpen(true); setCompErr(''); setToSearch(''); setToEmail(''); setCompSubject(''); setCompBody(''); }}>
            ✉️ New Message
          </button>
          <input className="field" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ width:180 }} />
        </div>
      </div>

      {/* ── Order notifications banner ── */}
      <OrderNotificationBanner orders={orderNotifs} onDismiss={dismissAllOrders} />

      {/* ── Tabs + Filters ── */}
      <div className="adm-messages-filters">
        {[
          ['messages',      '💬 Messages',     regular.length],
          ['notifications', '🔔 Notifications', notifs.length],
        ].map(([k, label, count]) => (
          <button key={k} className={'adm-filter-btn' + (tab === k ? ' active' : '')} onClick={() => { setTab(k); setSelected(null); }}>
            {label}
            {count > 0 && (
              <span style={{
                marginLeft: 4,
                background: 'rgba(255,255,255,0.12)',
                borderRadius: 10, padding: '1px 6px', fontSize: '0.7rem',
              }}>{count}</span>
            )}
          </button>
        ))}
        <span style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 6px' }} />
        {['all', 'new', 'read', 'replied', 'spam'].map(f => (
          <button key={f} className={'adm-filter-btn' + (filter === f ? ' active' : '')}
            onClick={() => { setFilter(f); setSelected(null); }}
            style={{ textTransform: 'capitalize', fontSize: '0.78rem' }}>
            {f}{counts[f] > 0 && <span style={{ marginLeft: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '0 5px', fontSize: '0.66rem' }}>{counts[f]}</span>}
          </button>
        ))}
      </div>
      {/* ── Main grid: list + thread ── */}
      <div className="adm-messages-grid adm-messages-grid--split">

        {/* ── Message list ── */}
        <div className="adm-msg-list">
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:'0.9rem' }}>Loading messages…</div>
          ) : filtered.length === 0 ? (
            <div className="adm-empty" style={{ padding:'40px 20px', textAlign:'center' }}>
              <div style={{ fontSize:'3rem', marginBottom:12 }}>📬</div>
              <p style={{ fontSize:'0.9rem', color:'var(--muted)' }}>No messages yet</p>
            </div>
          ) : filtered.map(m => {
            const st = m.status || 'new';
            const sc = m.type==='notification' ? SC.notification : (SC[st] || SC.new);
            const isActive = selected?.id === m.id;
            const isListSelected = listSelected.has(m.id);
            return (
              <div key={m.id} style={{ position:'relative' }}>
                <div
                  onClick={() => listSelectMode ? toggleListSelect(m.id) : openMessage(m)}
                  style={{
                    padding:'14px 16px',
                    background: isActive ? 'rgba(201,168,76,0.09)' : isListSelected ? 'rgba(201,168,76,0.06)' : 'var(--card)',
                    border: isListSelected ? '1px solid rgba(201,168,76,0.45)' : isActive ? '1px solid rgba(201,168,76,0.45)' : '1px solid var(--border)',
                    borderRadius:'var(--r-sm)', cursor:'pointer', transition:'all .15s',
                    borderLeft:`3px solid ${isListSelected?'var(--gold)':st==='new'?'#e8832a':isActive?'var(--gold)':'transparent'}`,
                  }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:7 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {/* ── Native checkbox always visible ── */}
                      <input
                        type="checkbox"
                        checked={isListSelected}
                        onChange={() => toggleListSelect(m.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width:16, height:16, flexShrink:0, cursor:'pointer', accentColor:'var(--gold)' }}
                      />
                      <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(201,168,76,0.15)', color:'var(--gold)', fontWeight:700, fontSize:'0.88rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {(m.name||'?')[0].toUpperCase()}
                      </div>
                      <div>
                        <strong style={{ fontSize:'0.92rem', display:'block' }}>{m.name||'Anonymous'}</strong>
                        <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{m.email||'—'}</span>
                      </div>
                    </div>
                    <span style={{ fontSize:'0.65rem', padding:'3px 8px', borderRadius:10, background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, fontWeight:700, textTransform:'uppercase', flexShrink:0 }}>
                      {m.type==='notification' ? '🔔' : st}
                    </span>
                  </div>
                  <div style={{ fontSize:'0.88rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3 }}>{m.subject||'No subject'}</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>
                    {m.lastAdminReply ? '↩ '+m.lastAdminReply : (m.message||'').slice(0,70)}
                  </div>
                  <div style={{ fontSize:'0.7rem', color:'var(--muted)' }}>{fmtDate(m.createdAt)}</div>
                </div>
                {/* quick delete button */}
                <button
                  onClick={e => { e.stopPropagation(); deleteMsg(m.id); }}
                  title="Delete"
                  style={{ position:'absolute', top:10, right:10, background:'none', border:'none', color:'rgba(255,255,255,0.18)', cursor:'pointer', padding:'3px 5px', fontSize:'0.78rem', borderRadius:4, zIndex:1 }}
                  onMouseEnter={e => e.currentTarget.style.color='rgba(231,76,60,0.85)'}
                  onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.18)'}
                >🗑</button>
              </div>
            );
          })}
        </div>

        {/* ── Thread panel ── */}
        {selected ? (
          <div className="adm-msg-thread">

            {/* Header */}
            <div className="adm-msg-thread-topbar">
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:'1.05rem', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {selected.subject||'No subject'}
                </div>
                <div style={{ fontSize:'0.82rem', color:'var(--muted)', display:'flex', alignItems:'center', gap:6 }}>
                  {selected.fromAdmin
                    ? <><span>To:</span><strong style={{ color:'var(--text)' }}>{selected.name}</strong><span style={{ color:'#4a9eff' }}>{selected.email}</span></>
                    : <><span>From:</span><strong style={{ color:'var(--text)' }}>{selected.name}</strong>
                        {selected.email && <a href={`mailto:${selected.email}`} style={{ color:'var(--gold)', textDecoration:'none' }}>{selected.email}</a>}
                      </>
                  }
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap', alignItems:'center', justifyContent:'flex-end' }}>
                {!threadSelectMode ? (
                  <>
                    {thread.length > 0 && (
                      <button
                        onClick={() => { setThreadSelectMode(true); setThreadSelected(new Set()); }}
                        style={{ fontSize:'0.74rem', padding:'4px 8px', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit' }}>
                        ☑ Select
                      </button>
                    )}
                    {thread.length > 0 && (
                      <button
                        onClick={clearThreadMessages}
                        disabled={threadDeleting}
                        style={{ fontSize:'0.74rem', padding:'4px 8px', background:'rgba(231,76,60,0.1)', border:'1px solid rgba(231,76,60,0.3)', color:'#e74c3c', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit' }}>
                        🗑 Clear All
                      </button>
                    )}
                    <button className="adm-act-btn adm-act-del" onClick={() => deleteMsg(selected.id)}>🗑 Del Conv</button>
                    <button className="adm-close-btn" onClick={() => setSelected(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize:'0.74rem', color:'var(--muted)' }}>{threadSelected.size} selected</span>
                    <button
                      disabled={threadDeleting || threadSelected.size === 0}
                      onClick={deleteSelectedThreadMsgs}
                      style={{ fontSize:'0.74rem', padding:'4px 10px', background:'rgba(231,76,60,0.12)', border:'1px solid rgba(231,76,60,0.3)', color:'#e74c3c', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit', opacity:threadSelected.size===0?0.4:1 }}>
                      {threadDeleting ? '⏳' : `🗑 Delete (${threadSelected.size})`}
                    </button>
                    <button
                      onClick={() => { setThreadSelectMode(false); setThreadSelected(new Set()); }}
                      style={{ fontSize:'0.74rem', padding:'4px 8px', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'inherit' }}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Action bar */}
            <div className="adm-msg-thread-actions">
              {['new','read','replied','spam'].map(s => (
                <button key={s} className={'adm-filter-btn'+(selected.status===s?' active':'')}
                  style={{ fontSize:'0.74rem', padding:'4px 10px', textTransform:'capitalize' }}
                  onClick={() => markStatus(selected.id, s)}>{s}</button>
              ))}
              {selected.email && (
                <a href={`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent('Hi '+selected.name+', ')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft:'auto', fontSize:'0.78rem', padding:'5px 12px', background:'rgba(37,211,102,0.12)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', borderRadius:20, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
                  💬 WhatsApp
                </a>
              )}
            </div>

            {/* THE CHAT BODY — fills all remaining space */}
            <div className="adm-msg-thread-body">
              {/* Show original message if no thread yet */}
              {thread.length === 0 && selected.message && (
                <div style={{ display:'flex', gap:10, alignSelf:'flex-start', maxWidth:'80%' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(74,158,255,0.15)', color:'#4a9eff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', flexShrink:0, alignSelf:'flex-end' }}>👤</div>
                  <div>
                    <div style={{ fontSize:'0.74rem', color:'var(--muted)', marginBottom:6 }}>{selected.name} · {fmtDate(selected.createdAt)}</div>
                    <div style={{ background:'rgba(74,158,255,0.09)', border:'1px solid rgba(74,158,255,0.2)', borderRadius:'4px 16px 16px 16px', padding:'14px 18px', fontSize:'1rem', lineHeight:1.75, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                      {selected.message}
                    </div>
                  </div>
                </div>
              )}

              {thread.map(t => {
                const isAdmin = t.sender === 'admin';
                const isTSelected = threadSelected.has(t.id);
                return (
                  <div key={t.id}
                    style={{ display:'flex', gap:10, alignSelf:isAdmin?'flex-end':'flex-start', maxWidth:'80%', flexDirection:isAdmin?'row-reverse':'row', cursor: threadSelectMode ? 'pointer' : 'default' }}
                    onClick={() => threadSelectMode && toggleThreadSelect(t.id)}
                  >
                    <div style={{ width:36, height:36, borderRadius:'50%', background:isAdmin?'rgba(201,168,76,0.18)':'rgba(74,158,255,0.15)', color:isAdmin?'var(--gold)':'#4a9eff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:isAdmin?'0.9rem':'1.1rem', fontWeight:700, flexShrink:0, alignSelf:'flex-end' }}>
                      {isAdmin ? (t.senderName||'A')[0].toUpperCase() : '👤'}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:isAdmin?'flex-end':'flex-start' }}>
                      <div style={{ fontSize:'0.73rem', color:'var(--muted)', padding:'0 4px', display:'flex', alignItems:'center', gap:6, flexDirection:isAdmin?'row-reverse':'row' }}>
                        <span>{isAdmin ? '🛡️ Admin' : t.senderName} · {fmtDate(t.createdAt)}</span>
                        {/* select checkbox */}
                        {threadSelectMode && (
                          <div style={{
                            width:16, height:16, borderRadius:4, flexShrink:0,
                            border:`2px solid ${isTSelected?'var(--gold)':'rgba(255,255,255,0.25)'}`,
                            background: isTSelected ? 'var(--gold)' : 'transparent',
                            display:'flex', alignItems:'center', justifyContent:'center',
                          }}>
                            {isTSelected && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        )}
                      </div>
                      <div style={{ position:'relative', display:'flex', alignItems:'flex-end', gap:6, flexDirection:isAdmin?'row-reverse':'row' }}>
                        <div style={{
                          background: isTSelected ? 'rgba(231,76,60,0.18)' : isAdmin ? 'rgba(201,168,76,0.14)' : 'rgba(74,158,255,0.09)',
                          border: isTSelected ? '2px solid rgba(231,76,60,0.4)' : isAdmin ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(74,158,255,0.2)',
                          borderRadius: isAdmin ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                          padding:'14px 18px', fontSize:'1rem', lineHeight:1.75,
                          whiteSpace:'pre-wrap', wordBreak:'break-word',
                          transition:'background 0.1s, border 0.1s',
                        }}>
                          {t.text}
                        </div>
                        {/* delete button (non-select mode) */}
                        {!threadSelectMode && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteThreadMessage(t.id); }}
                            title="Delete message"
                            style={{ background:'none', border:'none', color:'rgba(255,255,255,0.18)', cursor:'pointer', padding:'2px 4px', fontSize:'0.72rem', lineHeight:1, flexShrink:0, alignSelf:'center' }}
                            onMouseEnter={e => e.currentTarget.style.color='rgba(231,76,60,0.85)'}
                            onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.18)'}
                          >🗑</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={threadRef} />
            </div>

            {/* Reply box */}
            <div className="adm-msg-thread-reply">
              {sendErr && <div style={{ fontSize:'0.84rem', color:'#e74c3c', background:'rgba(231,76,60,0.08)', padding:'8px 14px', borderRadius:'var(--r-sm)', border:'1px solid rgba(231,76,60,0.25)', marginBottom:10 }}>⚠️ {sendErr}</div>}
              <textarea className="field" rows={3} value={replyDraft}
                onChange={e => setReplyDraft(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) sendReply(); }}
                placeholder="Type your reply… (Ctrl+Enter to send)"
                style={{ resize:'none', width:'100%', marginBottom:10, fontSize:'0.97rem', lineHeight:1.6 }} />
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center' }}>
                <span style={{ fontSize:'0.72rem', color:'var(--muted)', marginRight:'auto' }}>Ctrl+Enter to send</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setReplyDraft('')}>Clear</button>
                <button className="btn btn-primary" onClick={sendReply} disabled={sending || !replyDraft.trim()} style={{ minWidth:120 }}>
                  {sending ? '⏳ Sending…' : '↩ Send Reply'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="adm-msg-thread-empty">
            <div style={{ fontSize:'3rem', marginBottom:12 }}>💬</div>
            <p style={{ fontSize:'0.95rem', fontWeight:600, marginBottom:6 }}>Select a message</p>
            <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Click any conversation on the left to read and reply</p>
          </div>
        )}
      </div>
    </div>
  );
}

