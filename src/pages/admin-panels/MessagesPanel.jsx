import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc,
         serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

const WA = '254748255466';
const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
};
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

  const threadRef  = useRef(null);
  const prevIds    = useRef(new Set());
  const mounted    = useRef(false);

  // ── Messages listener ─────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'contact_messages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // ── Thread listener ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected?.threadId) { setThread([]); return; }
    const q = query(
      collection(db, 'contact_messages', selected.threadId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    let first = true;
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first) {
        const last = msgs[msgs.length - 1];
        if (last?.sender === 'user') playAdminNotifSound();
      }
      first = false;
      setThread(msgs);
      setTimeout(() => threadRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, () => {});
    return () => unsub();
  }, [selected?.threadId]);

  // ── Open message / seed thread ────────────────────────────────────────────
  const openMessage = async msg => {
    const threadId = msg.threadId || msg.id;
    setSelected({ ...msg, threadId, status: msg.status === 'new' ? 'read' : msg.status });
    setReplyDraft(''); setSendErr('');
    if (msg.status === 'new' || !msg.status) {
      await setDoc(doc(db, 'contact_messages', msg.id),
        { status: 'read', threadId, updatedAt: serverTimestamp() }, { merge: true });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read', threadId } : m));
      if (!msg.threadId) {
        await setDoc(doc(db, 'contact_messages', threadId, 'messages', 'msg_0'), {
          text: msg.message || '', sender: 'user',
          senderName: msg.name || 'User', senderEmail: msg.email,
          createdAt: msg.createdAt || serverTimestamp(),
        }).catch(() => {});
      }
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
    await deleteDoc(doc(db, 'contact_messages', id)).catch(() => {});
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selected?.id === id) setSelected(null);
    showToast?.('🗑 Deleted');
  };

  const notifs   = messages.filter(m => m.type === 'notification');
  const regular  = messages.filter(m => m.type !== 'notification');
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
  const newCount = messages.filter(m => m.status==='new'||!m.status).length;

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
    <div className="adm-page" style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 70px)', overflow:'hidden' }}>

      {/* ── Compose modal ── */}
      {composeOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:520, padding:24, display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ margin:0, fontSize:'1rem' }}>✉️ New Message to User</h3>
              <button className="adm-close-btn" onClick={() => { setComposeOpen(false); setCompErr(''); }}>✕</button>
            </div>

            {/* User search + dropdown */}
            <div>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, display:'block', marginBottom:6 }}>To — Select User</label>
              <input className="field" value={toSearch} onChange={e => { setToSearch(e.target.value); setToEmail(''); }}
                placeholder="Search by name or email…" style={{ marginBottom: toSearch && filteredUsers.length ? 0 : 0 }} />
              {toSearch && filteredUsers.length > 0 && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginTop:4, maxHeight:180, overflowY:'auto' }}>
                  {filteredUsers.map(u => (
                    <div key={u.email} onClick={() => { setToEmail(u.email.toLowerCase()); setToSearch(u.name + ' — ' + u.email); }}
                      style={{ padding:'10px 14px', cursor:'pointer', fontSize:'0.82rem', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(201,168,76,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(201,168,76,0.15)', color:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.75rem', flexShrink:0 }}>
                        {(u.name||u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight:600 }}>{u.name}</div>
                        <div style={{ fontSize:'0.7rem', color:'var(--muted)' }}>{u.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {toEmail && (
                <div style={{ marginTop:6, fontSize:'0.75rem', color:'var(--ok)', fontWeight:600 }}>
                  ✓ Sending to: {toEmail}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, display:'block', marginBottom:6 }}>Subject</label>
              <input className="field" value={compSubject} onChange={e => setCompSubject(e.target.value)} placeholder="Subject…" />
            </div>
            <div>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, display:'block', marginBottom:6 }}>Message</label>
              <textarea className="field" rows={5} value={compBody} onChange={e => setCompBody(e.target.value)}
                placeholder="Type your message…" style={{ resize:'vertical' }} />
            </div>
            {compErr && <div style={{ fontSize:'0.8rem', color:'#e74c3c', background:'rgba(231,76,60,0.08)', padding:'8px 12px', borderRadius:'var(--r-sm)', border:'1px solid rgba(231,76,60,0.25)' }}>⚠️ {compErr}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setComposeOpen(false); setCompErr(''); }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={sendCompose}
                disabled={composing || !toEmail || !compSubject.trim() || !compBody.trim()}>
                {composing ? '⏳ Sending…' : '📤 Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="adm-page-head" style={{ flexShrink:0 }}>
        <div>
          <h1>Messages &amp; Notifications</h1>
          <span className="adm-page-sub">
            {messages.length} total · {newCount > 0
              ? <strong style={{ color:'#e8832a' }}>{newCount} new</strong>
              : 'all read'}
          </span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="btn btn-primary btn-sm" onClick={() => { setComposeOpen(true); setCompErr(''); setToSearch(''); setToEmail(''); setCompSubject(''); setCompBody(''); }}>
            ✉️ Message a User
          </button>
          <input className="field" placeholder="Search…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ width:200 }} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexShrink:0 }}>
        <button className={'adm-filter-btn'+(tab==='messages'?' active':'')} onClick={() => setTab('messages')}>
          💬 Messages <span style={{ marginLeft:4, background:'rgba(255,255,255,0.1)', borderRadius:10, padding:'0 5px', fontSize:'0.7rem' }}>{regular.length}</span>
        </button>
        <button className={'adm-filter-btn'+(tab==='notifications'?' active':'')} onClick={() => setTab('notifications')}>
          🔔 Book Notifications <span style={{ marginLeft:4, background:'rgba(201,168,76,0.2)', color:'var(--gold)', borderRadius:10, padding:'0 5px', fontSize:'0.7rem' }}>{notifs.length}</span>
        </button>
      </div>

      {/* ── Status filters ── */}
      <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', flexShrink:0 }}>
        {['all','new','read','replied','spam'].map(f => (
          <button key={f} className={'adm-filter-btn'+(filter===f?' active':'')} onClick={() => setFilter(f)}
            style={{ textTransform:'capitalize', display:'flex', alignItems:'center', gap:5 }}>
            {f} {counts[f]>0 && <span style={{ background:'rgba(255,255,255,0.1)', borderRadius:10, padding:'0 5px', fontSize:'0.68rem' }}>{counts[f]}</span>}
          </button>
        ))}
      </div>

      {/* ── Grid: list + thread ── */}
      <div style={{ display:'grid', gridTemplateColumns:selected?'340px 1fr':'1fr', gap:16, flex:1, overflow:'hidden', minHeight:0 }}>

        {/* Message list */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, overflowY:'auto', paddingRight:4 }}>
          {loading
            ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
            : filtered.length === 0
              ? <div className="adm-empty">
                  <div style={{ fontSize:'2.5rem', marginBottom:10 }}>📬</div>
                  <p>{tab==='notifications' ? 'No book notification requests yet.' : 'No messages yet.'}</p>
                </div>
              : filtered.map(m => {
                  const st = m.status || 'new';
                  const sc = m.type==='notification' ? SC.notification : (SC[st] || SC.new);
                  const isActive = selected?.id === m.id;
                  return (
                    <div key={m.id} onClick={() => openMessage(m)}
                      style={{ padding:'12px 14px', background:isActive?'rgba(201,168,76,0.07)':'var(--card)', border:isActive?'1px solid rgba(201,168,76,0.4)':'1px solid var(--border)', borderRadius:'var(--r-sm)', cursor:'pointer', transition:'all .15s', borderLeft:`3px solid ${st==='new'?'#e8832a':isActive?'var(--gold)':'transparent'}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(201,168,76,0.15)', color:'var(--gold)', fontWeight:700, fontSize:'0.72rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {(m.name||'?')[0].toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ fontSize:'0.82rem' }}>{m.name||'Anonymous'}</strong>
                            <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{m.email||'—'}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                          <span style={{ fontSize:'0.62rem', padding:'2px 7px', borderRadius:10, background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, fontWeight:700, textTransform:'uppercase' }}>
                            {m.type==='notification' ? '🔔' : st}
                          </span>
                          {m.fromAdmin && <span style={{ fontSize:'0.6rem', color:'#4a9eff' }}>📤 sent by admin</span>}
                        </div>
                      </div>
                      <div style={{ fontSize:'0.8rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{m.subject||'No subject'}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {m.lastAdminReply ? '↩ '+m.lastAdminReply : (m.message||'').slice(0,60)}
                      </div>
                      <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginTop:4 }}>{fmtDate(m.createdAt)}</div>
                    </div>
                  );
                })
          }
        </div>

        {/* Thread + reply */}
        {selected && (
          <div style={{ display:'flex', flexDirection:'column', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>

            {/* Thread header */}
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:'0.92rem', marginBottom:3 }}>{selected.subject||'No subject'}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>
                  {selected.fromAdmin
                    ? <>To: <strong style={{ color:'var(--text)' }}>{selected.name}</strong> · <span style={{ color:'#4a9eff' }}>{selected.email}</span></>
                    : <>From: <strong style={{ color:'var(--text)' }}>{selected.name}</strong>
                        {selected.email && <> · <a href={`mailto:${selected.email}`} style={{ color:'var(--gold)' }}>{selected.email}</a></>}
                      </>
                  }
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="adm-act-btn adm-act-del" onClick={() => deleteMsg(selected.id)}>🗑</button>
                <button className="adm-close-btn" onClick={() => setSelected(null)}>✕</button>
              </div>
            </div>

            {/* Status actions */}
            <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', gap:6, flexShrink:0 }}>
              {['new','read','replied','spam'].map(s => (
                <button key={s} className={'adm-filter-btn'+(selected.status===s?' active':'')}
                  style={{ fontSize:'0.7rem', textTransform:'capitalize' }}
                  onClick={() => markStatus(selected.id, s)}>{s}</button>
              ))}
              {selected.email && (
                <a href={`https://wa.me/${WA}?text=${encodeURIComponent('Hi '+selected.name+', ')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft:'auto', fontSize:'0.72rem', padding:'3px 10px', background:'rgba(37,211,102,0.1)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', borderRadius:20, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                  💬 WhatsApp
                </a>
              )}
            </div>

            {/* Thread messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:10 }}>
              {/* Original message (only show if thread doesn't yet have msg_0) */}
              {thread.length === 0 && (
                <div style={{ alignSelf:'flex-start', maxWidth:'80%' }}>
                  <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginBottom:4 }}>{selected.name} · {fmtDate(selected.createdAt)}</div>
                  <div style={{ background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:'4px 14px 14px 14px', padding:'10px 14px', fontSize:'0.85rem', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                    {selected.message}
                  </div>
                </div>
              )}
              {thread.map(t => (
                <div key={t.id} style={{ alignSelf:t.sender==='admin'?'flex-end':'flex-start', maxWidth:'80%' }}>
                  <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginBottom:4, textAlign:t.sender==='admin'?'right':'left' }}>
                    {t.sender==='admin' ? 'You (Admin)' : t.senderName} · {fmtDate(t.createdAt)}
                  </div>
                  <div style={{ background:t.sender==='admin'?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.05)', border:t.sender==='admin'?'1px solid rgba(201,168,76,0.3)':'1px solid var(--border)', borderRadius:t.sender==='admin'?'14px 4px 14px 14px':'4px 14px 14px 14px', padding:'10px 14px', fontSize:'0.85rem', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                    {t.text}
                  </div>
                </div>
              ))}
              <div ref={threadRef} />
            </div>

            {/* Reply box */}
            <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
              {sendErr && (
                <div style={{ fontSize:'0.78rem', color:'#e74c3c', background:'rgba(231,76,60,0.08)', padding:'7px 12px', borderRadius:'var(--r-sm)', border:'1px solid rgba(231,76,60,0.25)', marginBottom:8 }}>
                  ⚠️ {sendErr}
                </div>
              )}
              <textarea className="field" rows={3} value={replyDraft}
                onChange={e => setReplyDraft(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) sendReply(); }}
                placeholder="Type your reply… (Ctrl+Enter to send)"
                style={{ resize:'none', width:'100%', marginBottom:8, fontSize:'0.85rem' }} />
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setReplyDraft('')}>Clear</button>
                <button className="btn btn-primary btn-sm" onClick={sendReply}
                  disabled={sending || !replyDraft.trim()}>
                  {sending ? '⏳ Sending…' : '↩ Send Reply'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
