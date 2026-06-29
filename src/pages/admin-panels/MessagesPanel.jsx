import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc,
         serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

const WA = '254748255466';
const fmtDate = ts => { if(!ts) return '—'; try{ const d=ts?.toDate?ts.toDate():new Date(ts); return d.toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch{ return '—'; } };
const STATUS_COLORS = {
  new:      {bg:'rgba(232,131,42,0.12)',color:'#e8832a',border:'rgba(232,131,42,0.3)'},
  read:     {bg:'rgba(74,158,255,0.1)', color:'#4a9eff',border:'rgba(74,158,255,0.25)'},
  replied:  {bg:'rgba(46,204,113,0.1)', color:'var(--ok)',border:'rgba(46,204,113,0.25)'},
  spam:     {bg:'rgba(100,116,139,0.1)',color:'#64748b',border:'rgba(100,116,139,0.25)'},
  notification:{bg:'rgba(201,168,76,0.1)',color:'var(--gold)',border:'rgba(201,168,76,0.25)'},
};

// ── Admin notification sound (slightly different tone to distinguish) ─────────
function playAdminNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g  = ctx.createGain();
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.type = 'sine'; o1.frequency.setValueAtTime(660, ctx.currentTime);
    o2.type = 'sine'; o2.frequency.setValueAtTime(880, ctx.currentTime + 0.14);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.2);
    o2.start(ctx.currentTime + 0.14); o2.stop(ctx.currentTime + 0.6);
  } catch {}
}

export default function MessagesPanel({ showToast }) {
  const { user } = useApp();
  const [messages,   setMessages]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('all');
  const [selected,   setSelected]   = useState(null);
  const [thread,     setThread]     = useState([]);
  const [replyDraft, setReplyDraft] = useState('');
  const [sending,    setSending]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [tab,        setTab]        = useState('messages');
  const threadRef   = useRef(null);
  const prevMsgIds  = useRef(new Set());   // track known message ids
  const mountedRef  = useRef(false);

  // ── Real-time messages listener + sound on new message ──
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'contact_messages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (mountedRef.current) {
        // Play sound if any new message id appeared that isn't from admin
        const hasNew = fresh.some(m =>
          !prevMsgIds.current.has(m.id) &&
          (m.status === 'new' || !m.status) &&
          m.lastSender !== 'admin'
        );
        if (hasNew) playAdminNotifSound();
      }

      prevMsgIds.current = new Set(fresh.map(m => m.id));
      mountedRef.current = true;
      setMessages(fresh);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // ── Thread listener for selected conversation ──
  useEffect(() => {
    if (!selected?.id) { setThread([]); return; }
    // Use threadId if set, otherwise fall back to the message id itself
    const threadId = selected.threadId || selected.id;
    const q = query(
      collection(db, 'contact_messages', threadId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    let initialLoad = true;
    const unsub = onSnapshot(q, snap => {
      let msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // If subcollection is empty, synthesise the original message so thread isn't blank
      if (msgs.length === 0 && selected.message) {
        msgs = [{ id:'msg_0', text:selected.message, sender:'user', senderName:selected.name||'User', senderEmail:selected.email, createdAt:selected.createdAt }];
      }
      if (!initialLoad) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.sender === 'user') playAdminNotifSound();
      }
      initialLoad = false;
      setThread(msgs);
      setTimeout(() => threadRef.current?.scrollIntoView({ behavior:'smooth' }), 100);
    }, () => {
      if (selected.message) {
        setThread([{ id:'msg_0', text:selected.message, sender:'user', senderName:selected.name||'User', senderEmail:selected.email, createdAt:selected.createdAt }]);
      }
    });
    return () => unsub();
  }, [selected?.id]);

  const openMessage = async msg => {
    const threadId = msg.threadId || msg.id;
    const updated = { ...msg, threadId, status: msg.status === 'new' ? 'read' : msg.status };
    setSelected(updated);
    setReplyDraft('');
    if (msg.status === 'new' || !msg.status) {
      await setDoc(doc(db, 'contact_messages', msg.id), { status: 'read', threadId, updatedAt: serverTimestamp() }, { merge: true });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read', threadId } : m));
      // Seed thread subcollection with the original message if thread is brand new
      if (!msg.threadId) {
        await setDoc(doc(db, 'contact_messages', threadId, 'messages', 'msg_0'), {
          text: msg.message || '', sender: 'user', senderName: msg.name || 'User',
          senderEmail: msg.email, createdAt: msg.createdAt || serverTimestamp(),
        });
      }
    }
  };

  const sendReply = async () => {
    if (!selected || !replyDraft.trim()) return;
    setSending(true);
    const threadId = selected.threadId || selected.id;
    try {
      // Write to contact_messages/{threadId}/messages — same path UserMessages reads
      await addDoc(collection(db, 'contact_messages', threadId, 'messages'), {
        text: replyDraft.trim(), sender: 'admin', senderName: user?.name || 'Admin',
        senderEmail: user?.email, createdAt: serverTimestamp(),
      });
      // Update parent doc so user sees the new reply + unread badge
      await setDoc(doc(db, 'contact_messages', selected.id), {
        status:         'replied',
        threadId,
        lastMsg:        replyDraft.trim().slice(0, 80),
        lastMsgAt:      serverTimestamp(),
        lastSender:     'admin',
        userRead:       false,   // triggers unread badge on user side
        lastAdminReply: replyDraft.trim().slice(0, 80),
        repliedAt:      serverTimestamp(),
      }, { merge: true });
      setMessages(prev => prev.map(m => m.id === selected.id ? { ...m, status: 'replied' } : m));
      setReplyDraft('');
      showToast?.('✅ Reply sent');
    } catch(e) { showToast?.('❌ ' + e.message); }
    setSending(false);
  };

  const markStatus = async (id, status) => {
    await setDoc(doc(db, 'contact_messages', id), { status, updatedAt: serverTimestamp() }, { merge: true });
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

  const notifs = messages.filter(m => m.type === 'notification');
  const regular = messages.filter(m => m.type !== 'notification');

  const base = tab === 'notifications' ? notifs : regular;
  const filtered = base.filter(m => {
    const matchF = filter === 'all' || m.status === filter;
    const q = search.toLowerCase();
    const matchS = !q || (m.name||'').toLowerCase().includes(q) || (m.email||'').toLowerCase().includes(q) || (m.subject||'').toLowerCase().includes(q) || (m.message||'').toLowerCase().includes(q);
    return matchF && matchS;
  });

  const counts = {
    all:     base.length,
    new:     base.filter(m=>m.status==='new'||!m.status).length,
    read:    base.filter(m=>m.status==='read').length,
    replied: base.filter(m=>m.status==='replied').length,
    spam:    base.filter(m=>m.status==='spam').length,
  };

  const newCount = messages.filter(m=>m.status==='new'||!m.status).length;

  return (
    <div className="adm-page" style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 70px)', overflow:'hidden' }}>
      <div className="adm-page-head" style={{ flexShrink:0 }}>
        <div>
          <h1>Messages & Notifications</h1>
          <span className="adm-page-sub">{messages.length} total · {newCount > 0 ? <strong style={{color:'#e8832a'}}>{newCount} new</strong> : 'all read'}</span>
        </div>
        <input className="field" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:200}} />
      </div>

      {/* Type tabs */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexShrink:0}}>
        <button className={'adm-filter-btn'+(tab==='messages'?' active':'')} onClick={()=>setTab('messages')}>
          💬 Messages <span style={{marginLeft:4,background:'rgba(255,255,255,0.1)',borderRadius:10,padding:'0 5px',fontSize:'0.7rem'}}>{regular.length}</span>
        </button>
        <button className={'adm-filter-btn'+(tab==='notifications'?' active':'')} onClick={()=>setTab('notifications')}>
          🔔 Book Notifications <span style={{marginLeft:4,background:'rgba(201,168,76,0.2)',color:'var(--gold)',borderRadius:10,padding:'0 5px',fontSize:'0.7rem'}}>{notifs.length}</span>
        </button>
      </div>

      {/* Status filters */}
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',flexShrink:0}}>
        {['all','new','read','replied','spam'].map(f=>(
          <button key={f} className={'adm-filter-btn'+(filter===f?' active':'')} onClick={()=>setFilter(f)} style={{textTransform:'capitalize',display:'flex',alignItems:'center',gap:5}}>
            {f} {counts[f]>0&&<span style={{background:'rgba(255,255,255,0.1)',borderRadius:10,padding:'0 5px',fontSize:'0.68rem'}}>{counts[f]}</span>}
          </button>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:selected?'340px 1fr':'1fr',gap:16,flex:1,overflow:'hidden',minHeight:0}}>

        {/* Message list */}
        <div style={{display:'flex',flexDirection:'column',gap:6,overflowY:'auto',paddingRight:4}}>
          {loading ? <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Loading…</div>
          : filtered.length===0 ? (
            <div className="adm-empty">
              <div style={{fontSize:'2.5rem',marginBottom:10}}>📬</div>
              <p>{tab==='notifications'?'No book notification requests yet.':'No messages yet.'}</p>
            </div>
          ) : filtered.map(m => {
            const st = m.status || 'new';
            const sc = m.type==='notification' ? STATUS_COLORS.notification : (STATUS_COLORS[st] || STATUS_COLORS.new);
            const isActive = selected?.id === m.id;
            return (
              <div key={m.id} onClick={()=>openMessage(m)}
                style={{padding:'12px 14px',background:isActive?'rgba(201,168,76,0.07)':'var(--card)',border:isActive?'1px solid rgba(201,168,76,0.4)':'1px solid var(--border)',borderRadius:'var(--r-sm)',cursor:'pointer',transition:'all .15s',borderLeft:`3px solid ${st==='new'?'#e8832a':isActive?'var(--gold)':'transparent'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:'rgba(201,168,76,0.15)',color:'var(--gold)',fontWeight:700,fontSize:'0.72rem',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {(m.name||'?')[0].toUpperCase()}
                    </div>
                    <div>
                      <strong style={{fontSize:'0.82rem'}}>{m.name||'Anonymous'}</strong>
                      <div style={{fontSize:'0.68rem',color:'var(--muted)'}}>{m.email||'—'}</div>
                    </div>
                  </div>
                  <span style={{fontSize:'0.62rem',padding:'2px 7px',borderRadius:10,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,fontWeight:700,textTransform:'uppercase',flexShrink:0}}>
                    {m.type==='notification'?'🔔':st}
                  </span>
                </div>
                <div style={{fontSize:'0.8rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2}}>{m.subject||'No subject'}</div>
                <div style={{fontSize:'0.72rem',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.lastAdminReply ? '↩ '+m.lastAdminReply : (m.message||'').slice(0,60)}</div>
                <div style={{fontSize:'0.68rem',color:'var(--muted)',marginTop:4}}>{fmtDate(m.createdAt)}</div>
              </div>
            );
          })}
        </div>

        {/* Conversation thread + reply */}
        {selected && (
          <div style={{display:'flex',flexDirection:'column',background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r)',overflow:'hidden'}}>
            {/* Thread header */}
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexShrink:0}}>
              <div>
                <div style={{fontWeight:700,fontSize:'0.92rem',marginBottom:3}}>{selected.subject||'No subject'}</div>
                <div style={{fontSize:'0.75rem',color:'var(--muted)'}}>
                  From: <strong style={{color:'var(--text)'}}>{selected.name}</strong>
                  {selected.email && <> · <a href={`mailto:${selected.email}`} style={{color:'var(--gold)'}}>{selected.email}</a></>}
                  {selected.phone && <> · {selected.phone}</>}
                </div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <button className="adm-act-btn adm-act-del" onClick={()=>deleteMsg(selected.id)}>🗑</button>
                <button className="adm-close-btn" onClick={()=>setSelected(null)}>✕</button>
              </div>
            </div>

            {/* Status actions */}
            <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',gap:6,flexShrink:0}}>
              {['new','read','replied','spam'].map(s=>(
                <button key={s} className={'adm-filter-btn'+(selected.status===s?' active':'')}
                  style={{fontSize:'0.7rem',textTransform:'capitalize'}} onClick={()=>markStatus(selected.id,s)}>{s}</button>
              ))}
              {selected.email && (
                <a href={`https://wa.me/${WA}?text=${encodeURIComponent('Hi '+selected.name+', thank you for reaching out to Ellines Haven. ')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{marginLeft:'auto',fontSize:'0.72rem',padding:'3px 10px',background:'rgba(37,211,102,0.1)',color:'#25D366',border:'1px solid rgba(37,211,102,0.3)',borderRadius:20,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
                  💬 WhatsApp
                </a>
              )}
            </div>

            {/* Thread messages */}
            <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:10}}>
              {/* Original message */}
              <div style={{alignSelf:'flex-start',maxWidth:'80%'}}>
                <div style={{fontSize:'0.68rem',color:'var(--muted)',marginBottom:4}}>{selected.name} · {fmtDate(selected.createdAt)}</div>
                <div style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:'4px 14px 14px 14px',padding:'10px 14px',fontSize:'0.85rem',lineHeight:1.7,color:'var(--text)',whiteSpace:'pre-wrap'}}>
                  {selected.message}
                </div>
              </div>
              {/* Thread replies */}
              {thread.filter(t=>t.sender!=='user'||t.text!==selected.message).map(t=>(
                <div key={t.id} style={{alignSelf:t.sender==='admin'?'flex-end':'flex-start',maxWidth:'80%'}}>
                  <div style={{fontSize:'0.68rem',color:'var(--muted)',marginBottom:4,textAlign:t.sender==='admin'?'right':'left'}}>
                    {t.sender==='admin'?'You (Admin)':t.senderName} · {fmtDate(t.createdAt)}
                  </div>
                  <div style={{background:t.sender==='admin'?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.05)',border:t.sender==='admin'?'1px solid rgba(201,168,76,0.3)':'1px solid var(--border)',borderRadius:t.sender==='admin'?'14px 4px 14px 14px':'4px 14px 14px 14px',padding:'10px 14px',fontSize:'0.85rem',lineHeight:1.7,color:'var(--text)',whiteSpace:'pre-wrap'}}>
                    {t.text}
                  </div>
                </div>
              ))}
              <div ref={threadRef} />
            </div>

            {/* Reply box */}
            <div style={{padding:'12px 14px',borderTop:'1px solid var(--border)',flexShrink:0}}>
              <textarea className="field" rows={3} value={replyDraft} onChange={e=>setReplyDraft(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))sendReply();}}
                placeholder="Type your reply… (Ctrl+Enter to send)" style={{resize:'none',width:'100%',marginBottom:8,fontSize:'0.85rem'}} />
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setReplyDraft('')}>Clear</button>
                <button className="btn btn-primary btn-sm" onClick={sendReply} disabled={sending||!replyDraft.trim()}>
                  {sending?'⏳ Sending…':'↩ Send Reply'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
