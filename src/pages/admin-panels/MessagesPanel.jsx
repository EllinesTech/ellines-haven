import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

const WA = '254748255466';

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}

const STATUS_COLORS = {
  new:     { bg:'rgba(232,131,42,0.12)',  color:'#e8832a',  border:'rgba(232,131,42,0.3)'  },
  read:    { bg:'rgba(74,158,255,0.1)',   color:'#4a9eff',  border:'rgba(74,158,255,0.25)' },
  replied: { bg:'rgba(46,204,113,0.1)',   color:'var(--ok)',border:'rgba(46,204,113,0.25)' },
  spam:    { bg:'rgba(100,116,139,0.1)',  color:'#64748b',  border:'rgba(100,116,139,0.25)'},
};

export default function MessagesPanel({ showToast }) {
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all');
  const [selected,  setSelected]  = useState(null);
  const [replyDraft,setReplyDraft]= useState('');
  const [search,    setSearch]    = useState('');

  // Real-time listener
  useEffect(() => {
    setLoading(true);
    let unsub;
    try {
      const q = query(collection(db, 'contact_messages'), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(q, snap => {
        const msgs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        setMessages(msgs);
        setLoading(false);
      }, () => setLoading(false));
    } catch {
      setLoading(false);
    }
    return () => unsub?.();
  }, []);

  const markStatus = async (id, status) => {
    try {
      await setDoc(doc(db, 'contact_messages', id), { status, updatedAt: serverTimestamp() }, { merge: true });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
      if (selected?.id === id) setSelected(s => ({ ...s, status }));
      showToast?.('✅ Marked as ' + status);
    } catch (e) { showToast?.('❌ ' + e.message); }
  };

  const deleteMsg = async (id) => {
    if (!window.confirm('Delete this message permanently?')) return;
    try {
      await deleteDoc(doc(db, 'contact_messages', id));
      setMessages(prev => prev.filter(m => m.id !== id));
      if (selected?.id === id) setSelected(null);
      showToast?.('Message deleted');
    } catch (e) { showToast?.('❌ ' + e.message); }
  };

  const openMessage = async (msg) => {
    setSelected(msg);
    setReplyDraft('');
    if (msg.status === 'new') await markStatus(msg.id, 'read');
  };

  const sendReply = () => {
    if (!selected || !replyDraft.trim()) return;
    const text = encodeURIComponent(
      `Hi ${selected.name || 'there'},\n\nThank you for reaching out to Ellines Haven.\n\n${replyDraft.trim()}\n\n— Ellines Haven Team`
    );
    // Reply via email if available, else WhatsApp
    if (selected.email) {
      window.open(`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject || 'Your message')}&body=${text}`);
    } else {
      window.open(`https://wa.me/${WA}?text=${text}`, '_blank');
    }
    markStatus(selected.id, 'replied');
    setReplyDraft('');
    showToast?.('✅ Reply sent via ' + (selected.email ? 'email' : 'WhatsApp'));
  };

  const filtered = messages.filter(m => {
    const matchFilter = filter === 'all' || m.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || (m.name||'').toLowerCase().includes(q) || (m.email||'').toLowerCase().includes(q) || (m.subject||'').toLowerCase().includes(q) || (m.message||'').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const counts = {
    all:     messages.length,
    new:     messages.filter(m => m.status === 'new' || !m.status).length,
    read:    messages.filter(m => m.status === 'read').length,
    replied: messages.filter(m => m.status === 'replied').length,
    spam:    messages.filter(m => m.status === 'spam').length,
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Customer Messages</h1>
          <span className="adm-page-sub">{messages.length} total messages from the contact form</span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input className="field" placeholder="Search messages…" value={search} onChange={e => setSearch(e.target.value)} style={{ width:220 }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
        {['all','new','read','replied','spam'].map(f => (
          <button key={f} className={'adm-filter-btn' + (filter===f?' active':'')} onClick={() => setFilter(f)}
            style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ textTransform:'capitalize' }}>{f}</span>
            {counts[f] > 0 && (
              <span style={{ background: f==='new'?'rgba(232,131,42,0.2)':'rgba(255,255,255,0.08)', borderRadius:10, padding:'0 6px', fontSize:'0.7rem', fontWeight:700 }}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="adm-empty">
          <div style={{ fontSize:'3rem', marginBottom:12 }}>📬</div>
          <p>No messages yet. Contact form submissions will appear here.</p>
          <div className="adm-info-note" style={{ marginTop:16, maxWidth:480, margin:'16px auto 0' }}>
            Messages are saved to Firestore when users submit the contact form. Make sure the contact form writes to the <code>contact_messages</code> collection.
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 1.4fr' : '1fr', gap:20 }}>

          {/* Message list */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.length === 0 ? (
              <div className="adm-empty"><p>No messages match this filter.</p></div>
            ) : filtered.map(m => {
              const st = m.status || 'new';
              const sc = STATUS_COLORS[st] || STATUS_COLORS.new;
              const isActive = selected?.id === m.id;
              return (
                <div key={m.id}
                  onClick={() => openMessage(m)}
                  style={{
                    padding:'14px 16px', background: isActive ? 'rgba(201,168,76,0.06)' : 'var(--card)',
                    border: isActive ? '1px solid rgba(201,168,76,0.35)' : '1px solid var(--border)',
                    borderRadius:'var(--r-sm)', cursor:'pointer', transition:'all .18s',
                    borderLeft: st==='new' ? '3px solid #e8832a' : isActive ? '3px solid var(--gold)' : '3px solid transparent',
                  }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(201,168,76,0.12)', color:'var(--gold)', fontWeight:700, fontSize:'0.78rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {(m.name||'?')[0].toUpperCase()}
                      </div>
                      <div>
                        <strong style={{ fontSize:'0.84rem' }}>{m.name || 'Anonymous'}</strong>
                        <span style={{ display:'block', fontSize:'0.7rem', color:'var(--muted)' }}>{m.email || '—'}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:'0.65rem', padding:'2px 8px', borderRadius:10, background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, fontWeight:700, textTransform:'uppercase' }}>
                        {st}
                      </span>
                      <span style={{ fontSize:'0.7rem', color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtDate(m.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:'0.82rem', fontWeight:600, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {m.subject || 'No subject'}
                  </div>
                  <div style={{ fontSize:'0.76rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {m.message || '—'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Message detail + reply */}
          {selected && (
            <div className="card" style={{ padding:24, display:'flex', flexDirection:'column', gap:16, position:'sticky', top:100, maxHeight:'80vh', overflowY:'auto' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                <div>
                  <h3 style={{ fontSize:'1rem', marginBottom:4 }}>{selected.subject || 'No subject'}</h3>
                  <div style={{ fontSize:'0.78rem', color:'var(--muted)' }}>
                    From: <strong style={{ color:'var(--text)' }}>{selected.name}</strong>
                    {selected.email && <> · <a href={`mailto:${selected.email}`} style={{ color:'var(--gold)' }}>{selected.email}</a></>}
                    {selected.phone && <> · {selected.phone}</>}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:'var(--muted)', marginTop:3 }}>{fmtDate(selected.createdAt)}</div>
                </div>
                <button className="adm-close-btn" onClick={() => setSelected(null)}>✕</button>
              </div>

              {/* Message body */}
              <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--dim)', borderRadius:'var(--r-sm)', padding:'14px 16px', fontSize:'0.88rem', lineHeight:1.8, color:'var(--text)', whiteSpace:'pre-wrap', flex:1 }}>
                {selected.message}
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {['new','read','replied','spam'].map(s => (
                  <button key={s} className={'adm-filter-btn' + (selected.status===s?' active':'')}
                    style={{ fontSize:'0.72rem', textTransform:'capitalize' }}
                    onClick={() => markStatus(selected.id, s)}>
                    {s}
                  </button>
                ))}
                <button className="adm-act-btn adm-act-del" style={{ marginLeft:'auto' }} onClick={() => deleteMsg(selected.id)}>Delete</button>
              </div>

              {/* Reply composer */}
              <div>
                <label style={{ fontSize:'0.78rem', color:'var(--muted)', display:'block', marginBottom:8 }}>
                  Reply to {selected.name}
                </label>
                <textarea
                  className="field"
                  rows={5}
                  value={replyDraft}
                  onChange={e => setReplyDraft(e.target.value)}
                  placeholder="Type your reply…"
                  style={{ resize:'vertical', width:'100%', marginBottom:10 }}
                />
                <div style={{ display:'flex', gap:8 }}>
                  {selected.email && (
                    <button className="btn btn-primary btn-sm" disabled={!replyDraft.trim()} onClick={sendReply}>
                      📧 Reply via Email
                    </button>
                  )}
                  <a href={`https://wa.me/${WA}?text=${encodeURIComponent(replyDraft || `Hi ${selected.name}, thank you for reaching out to Ellines Haven.`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="btn btn-sm"
                    style={{ background:'rgba(37,211,102,0.1)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', display:'flex', alignItems:'center', gap:6 }}>
                    💬 WhatsApp
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
