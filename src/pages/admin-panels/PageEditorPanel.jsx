import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const PAGES = [
  { key: 'home_content',     label: 'Home',      path: '/',         icon: '🏠' },
  { key: 'about_content',    label: 'About Us',  path: '/about',    icon: 'ℹ️' },
  { key: 'founder_content',  label: 'Founder',   path: '/founder',  icon: '👤' },
  { key: 'contact_content',  label: 'Contact',   path: '/contact',  icon: '📞' },
  { key: 'library_content',  label: 'Library',   path: '/library',  icon: '📚' },
  { key: 'cart_content',     label: 'Cart',       path: '/cart',     icon: '🛒' },
  { key: 'login_content',    label: 'Sign In',   path: '/login',    icon: '🔑' },
  { key: 'register_content', label: 'Register',  path: '/register', icon: '📝' },
];

export default function PageEditorPanel({ showToast }) {
  const [activePage, setActivePage] = useState(PAGES[0]);
  const [pageData,   setPageData]   = useState({});
  const [loaded,     setLoaded]     = useState({});
  const [editKey,    setEditKey]    = useState(null);
  const [editVal,    setEditVal]    = useState('');
  const [newKey,     setNewKey]     = useState('');
  const [saving,     setSaving]     = useState(false);
  const [sideOpen,   setSideOpen]   = useState(true);
  const [iframeKey,  setIframeKey]  = useState(0);
  const [iframeErr,  setIframeErr]  = useState(false);
  const [editArrIdx, setEditArrIdx] = useState(null); // { key, idx }
  const [editArrVal, setEditArrVal] = useState('');
  const iframeRef = useRef(null);

  const current = pageData[activePage.key] || {};
  const keys = Object.keys(current).filter(k => k !== 'updatedAt' && k !== '_exists');
  const isNew = loaded[activePage.key] && pageData[activePage.key] === null;

  useEffect(() => {
    if (loaded[activePage.key]) return;
    getDoc(doc(db, 'site_data', activePage.key)).then(snap => {
      setPageData(prev => ({ ...prev, [activePage.key]: snap.exists() ? snap.data() : null }));
      setLoaded(prev => ({ ...prev, [activePage.key]: true }));
    }).catch(() => setLoaded(prev => ({ ...prev, [activePage.key]: true })));
  }, [activePage.key]); // eslint-disable-line

  const commit = (k, v) => {
    setPageData(prev => ({ ...prev, [activePage.key]: { ...(prev[activePage.key] || {}), [k]: v } }));
    setEditKey(null);
  };

  const removeBlock = k => {
    const copy = { ...current }; delete copy[k];
    setPageData(prev => ({ ...prev, [activePage.key]: copy }));
    if (editKey === k) setEditKey(null);
  };

  const addBlock = () => {
    const k = newKey.trim().replace(/\s+/g, '_');
    if (!k) return;
    setPageData(prev => ({ ...prev, [activePage.key]: { ...(prev[activePage.key] || {}), [k]: '' } }));
    setNewKey(''); setEditKey(k); setEditVal('');
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', activePage.key), { ...current, updatedAt: serverTimestamp() }, { merge: true });
      showToast?.('✅ ' + activePage.label + ' saved — changes live!');
      setIframeKey(k => k + 1); // refresh iframe
    } catch (e) { showToast?.('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  const origin = window.location.origin;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Page Editor</h2>
        <span style={{ fontSize: '0.72rem', background: 'rgba(201,168,76,0.15)', color: 'var(--gold)', padding: '2px 8px', borderRadius: 4 }}>Live Preview</span>

        {/* Page tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, marginLeft: 8 }}>
          {PAGES.map(p => (
            <button key={p.key}
              onClick={() => { setActivePage(p); setEditKey(null); setIframeErr(false); }}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
                background: activePage.key === p.key ? 'var(--gold)' : 'rgba(255,255,255,0.07)',
                color: activePage.key === p.key ? '#000' : 'var(--muted)',
                transition: 'all 0.15s',
              }}>
              {p.icon} {p.label}
              {loaded[p.key] && pageData[p.key] === null && (
                <span style={{ marginLeft: 4, fontSize: '0.6rem', background: 'rgba(201,168,76,0.3)', color: 'var(--gold)', borderRadius: 3, padding: '1px 4px' }}>new</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <button onClick={() => setIframeKey(k => k + 1)}
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
            ↺ Refresh
          </button>
          <button onClick={() => setSideOpen(o => !o)}
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
            {sideOpen ? '⟩ Hide Panel' : '⟨ Show Panel'}
          </button>
          <button onClick={saveAll} disabled={saving}
            style={{ background: 'var(--gold)', border: 'none', color: '#000', borderRadius: 6, padding: '7px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? '⏳…' : '💾 Save & Publish'}
          </button>
        </div>
      </div>

      {/* ── Main area: iframe + sidebar ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Live page iframe */}
        <div style={{ flex: 1, position: 'relative', background: '#111', overflow: 'hidden' }}>
          {iframeErr ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:14, padding:24, textAlign:'center' }}>
              <div style={{ fontSize:'2.5rem' }}>🔗</div>
              <p style={{ color:'var(--muted)', fontSize:'0.88rem', lineHeight:1.6, maxWidth:340 }}>
                The live preview can't load in an iframe on this browser or environment.<br />
                Open the page directly to see it.
              </p>
              <a href={origin + activePage.path} target="_blank" rel="noopener noreferrer"
                style={{ background:'var(--gold)', color:'#000', borderRadius:7, padding:'8px 20px', fontWeight:700, fontSize:'0.85rem', textDecoration:'none' }}>
                ↗ Open {activePage.label} in New Tab
              </a>
            </div>
          ) : (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={origin + activePage.path}
              title={activePage.label + ' preview'}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onError={() => setIframeErr(true)}
            />
          )}
          {/* overlay label */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.7)', color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, pointerEvents: 'none', letterSpacing: 1 }}>
            LIVE PREVIEW — {activePage.label.toUpperCase()}
          </div>
        </div>

        {/* Edit sidebar */}
        {sideOpen && (
          <div style={{ width: 360, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Sidebar header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                {activePage.icon} {activePage.label}
                {isNew && <span style={{ fontSize: '0.65rem', background: 'rgba(201,168,76,0.2)', color: 'var(--gold)', borderRadius: 4, padding: '2px 6px' }}>No content yet</span>}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                Edit text blocks below. Click Save & Publish — changes appear on the page instantly.
              </p>
            </div>

            {/* Add new block */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 6 }}>
              <input value={newKey} onChange={e => setNewKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBlock()}
                placeholder="new_field_name" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 5, padding: '5px 8px', color: 'var(--text)', fontSize: '0.78rem', fontFamily: 'monospace', outline: 'none' }} />
              <button onClick={addBlock} style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: 'var(--gold)', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>+ Add</button>
            </div>

            {/* Content blocks */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!loaded[activePage.key] && (
                <p style={{ color: 'var(--muted)', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>Loading…</p>
              )}
              {loaded[activePage.key] && keys.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
                  <p style={{ color: 'var(--muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                    No content blocks for this page yet.<br />Add a field above to start editing.
                  </p>
                </div>
              )}
              {keys.map(k => {
                const v = current[k];
                const isArr = Array.isArray(v);
                const isEditing = editKey === k;
                return (
                  <div key={k} style={{ background: 'var(--card)', border: `1px solid ${isEditing ? 'rgba(201,168,76,0.5)' : 'var(--border)'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                    {/* Block header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)' }}>
                      <code style={{ fontSize: '0.72rem', color: 'var(--gold)', letterSpacing: 0.3 }}>{k}</code>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!isArr && (
                          <button onClick={() => { setEditKey(isEditing ? null : k); setEditVal(String(v ?? '')); }}
                            style={{ background: isEditing ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)', border: 'none', color: isEditing ? 'var(--gold)' : 'var(--muted)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit' }}>
                            {isEditing ? '▲ Close' : '✏️ Edit'}
                          </button>
                        )}
                        <button onClick={() => removeBlock(k)}
                          style={{ background: 'rgba(231,76,60,0.1)', border: 'none', color: '#e74c3c', borderRadius: 4, padding: '3px 7px', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit' }}>✕</button>
                      </div>
                    </div>
                    {/* Block body */}
                    <div style={{ padding: '8px 10px' }}>
                      {isArr ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {v.map((item, idx) => {
                            const isEditingItem = editArrIdx?.key === k && editArrIdx?.idx === idx;
                            return (
                              <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: `1px solid ${isEditingItem ? 'rgba(201,168,76,0.5)' : 'var(--border)'}`, overflow: 'hidden' }}>
                                {isEditingItem ? (
                                  <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <textarea value={editArrVal} onChange={e => setEditArrVal(e.target.value)}
                                      rows={2} autoFocus
                                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 4, color: 'var(--text)', padding: '5px 8px', fontSize: '0.8rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                    <div style={{ display: 'flex', gap: 5 }}>
                                      <button onClick={() => {
                                        const arr = [...v]; arr[idx] = editArrVal;
                                        setPageData(prev => ({ ...prev, [activePage.key]: { ...(prev[activePage.key] || {}), [k]: arr } }));
                                        setEditArrIdx(null);
                                      }} style={{ background: 'var(--gold)', border: 'none', color: '#000', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'inherit' }}>✓ Save</button>
                                      <button onClick={() => setEditArrIdx(null)}
                                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit' }}>Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '5px 8px' }}>
                                    <span style={{ color: 'var(--gold)', minWidth: 16, fontSize: '0.7rem', marginTop: 2, flexShrink: 0 }}>{idx + 1}.</span>
                                    <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text)', wordBreak: 'break-word', lineHeight: 1.5 }}>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
                                    <button onClick={() => { setEditArrIdx({ key: k, idx }); setEditArrVal(typeof item === 'string' ? item : JSON.stringify(item)); }}
                                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.7rem', padding: '1px 4px', flexShrink: 0, fontFamily: 'inherit' }}>✏️</button>
                                    <button onClick={() => {
                                      const arr = v.filter((_, i) => i !== idx);
                                      setPageData(prev => ({ ...prev, [activePage.key]: { ...(prev[activePage.key] || {}), [k]: arr } }));
                                    }} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.7rem', padding: '1px 4px', flexShrink: 0, fontFamily: 'inherit' }}>✕</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <button onClick={() => {
                            const arr = [...v, ''];
                            setPageData(prev => ({ ...prev, [activePage.key]: { ...(prev[activePage.key] || {}), [k]: arr } }));
                            setEditArrIdx({ key: k, idx: arr.length - 1 });
                            setEditArrVal('');
                          }} style={{ alignSelf: 'flex-start', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--gold)', borderRadius: 4, padding: '3px 9px', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit' }}>+ Add item</button>
                        </div>
                      ) : isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <textarea value={editVal} onChange={e => setEditVal(e.target.value)}
                            rows={4} autoFocus
                            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 5, color: 'var(--text)', padding: '7px 9px', fontSize: '0.82rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => commit(k, editVal)}
                              style={{ background: 'var(--gold)', border: 'none', color: '#000', borderRadius: 5, padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>✓ Done</button>
                            <button onClick={() => setEditKey(null)}
                              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: v ? 1 : 0.4 }}>
                          {v ? String(v).slice(0, 160) + (String(v).length > 160 ? '…' : '') : 'empty'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sidebar save */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={saveAll} disabled={saving} style={{ width: '100%', background: 'var(--gold)', border: 'none', color: '#000', borderRadius: 7, padding: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
                {saving ? '⏳ Saving…' : '💾 Save & Publish Changes'}
              </button>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted)', textAlign: 'center', margin: '6px 0 0', lineHeight: 1.4 }}>
                Saved to Firestore — appears live instantly
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
