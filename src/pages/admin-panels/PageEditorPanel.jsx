import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';

/* ── Built-in pages — always present ── */
const BUILT_IN_PAGES = [
  { key: 'home_content',     label: 'Home',     path: '/',         icon: '🏠', desc: 'Hero, taglines, sections, CTA',            builtin: true },
  { key: 'about_content',    label: 'About Us', path: '/about',    icon: 'ℹ️',  desc: 'Story, mission, values, stats',            builtin: true },
  { key: 'founder_content',  label: 'Founder',  path: '/founder',  icon: '👤', desc: 'Bio, skills, timeline, quotes',            builtin: true },
  { key: 'contact_content',  label: 'Contact',  path: '/contact',  icon: '📞', desc: 'Page title, details, form text',           builtin: true },
  { key: 'library_content',  label: 'Library',  path: '/library',  icon: '📚', desc: 'Hero, search placeholder, empty state',    builtin: true },
  { key: 'cart_content',     label: 'Cart',     path: '/cart',     icon: '🛒', desc: 'Cart heading, empty state, checkout text', builtin: true },
  { key: 'login_content',    label: 'Sign In',  path: '/login',    icon: '🔑', desc: 'Heading, button, links',                   builtin: true },
  { key: 'register_content', label: 'Register', path: '/register', icon: '📝', desc: 'Heading, button, closed message',          builtin: true },
  { key: 'faq_content',      label: 'FAQ',      path: '/faq',      icon: '❓', desc: 'FAQ page subtitle text',                   builtin: true },
  { key: 'terms_content',    label: 'Terms',    path: '/terms',    icon: '📄', desc: 'Terms of service intro text',              builtin: true },
  { key: 'privacy_content',  label: 'Privacy',  path: '/privacy',  icon: '🔒', desc: 'Privacy policy intro text',               builtin: true },
];

const ICONS = ['📄','🌟','📰','🎯','🎨','🎭','💡','🔖','📣','🏆','🎪','🌈','🛍️','🎵','📸','🌍','🏅','💬','📖','🔗'];

export default function PageEditorPanel({ showToast }) {
  const navigate = useNavigate();
  const [customPages, setCustomPages]   = useState([]);
  const [loading,     setLoading]       = useState(true);
  const [showAdd,     setShowAdd]       = useState(false);
  const [editingPage, setEditingPage]   = useState(null);
  const [deleting,    setDeleting]      = useState(null);
  const [saving,      setSaving]        = useState(false);

  const [form, setForm] = useState({
    label: '', path: '', icon: '📄', desc: '', content: '',
  });

  /* ── Load custom pages from Firestore ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'site_data', 'custom_pages'));
        if (snap.exists()) {
          setCustomPages(snap.data().pages || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveCustomPages = async (pages) => {
    await setDoc(doc(db, 'site_data', 'custom_pages'), {
      pages,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setCustomPages(pages);
  };

  const handleAdd = async () => {
    if (!form.label.trim() || !form.path.trim()) {
      showToast?.('❌ Label and path are required');
      return;
    }
    const pathClean = form.path.startsWith('/') ? form.path : '/' + form.path;
    const key = 'custom_' + pathClean.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_content';

    // Check for duplicate path
    const allPaths = [...BUILT_IN_PAGES.map(p => p.path), ...customPages.map(p => p.path)];
    if (allPaths.includes(pathClean)) {
      showToast?.('❌ A page with that path already exists');
      return;
    }

    setSaving(true);
    try {
      // Save initial content to Firestore
      if (form.content.trim()) {
        await setDoc(doc(db, 'site_data', key), {
          body: form.content,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      const newPage = {
        key,
        label: form.label.trim(),
        path:  pathClean,
        icon:  form.icon,
        desc:  form.desc.trim() || 'Custom page',
        createdAt: Date.now(),
      };
      const updated = [...customPages, newPage];
      await saveCustomPages(updated);
      setForm({ label: '', path: '', icon: '📄', desc: '', content: '' });
      setShowAdd(false);
      showToast?.('✅ Page created — use ✏️ Edit to add content');
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSaving(false);
  };

  const handleEditMeta = async () => {
    if (!editingPage || !form.label.trim()) {
      showToast?.('❌ Label is required');
      return;
    }
    setSaving(true);
    try {
      const updated = customPages.map(p =>
        p.key === editingPage.key
          ? { ...p, label: form.label.trim(), icon: form.icon, desc: form.desc.trim() }
          : p
      );
      await saveCustomPages(updated);
      setEditingPage(null);
      setForm({ label: '', path: '', icon: '📄', desc: '', content: '' });
      showToast?.('✅ Page updated');
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (page) => {
    setSaving(true);
    try {
      // Remove page content from Firestore
      await deleteDoc(doc(db, 'site_data', page.key)).catch(() => {});
      const updated = customPages.filter(p => p.key !== page.key);
      await saveCustomPages(updated);
      setDeleting(null);
      showToast?.('🗑 Page deleted');
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSaving(false);
  };

  const openEdit = (page) => {
    navigate(page.path);
    setTimeout(() => {}, 100);
  };

  const startEditMeta = (page) => {
    setEditingPage(page);
    setForm({ label: page.label, path: page.path, icon: page.icon, desc: page.desc, content: '' });
    setShowAdd(false);
  };

  const allPages = [...BUILT_IN_PAGES, ...customPages];

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Page Editor</h1>
          <span className="adm-page-sub">
            Edit any page — inline editing for built-in pages, full content management for custom pages.
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setEditingPage(null); setForm({ label:'', path:'', icon:'📄', desc:'', content:'' }); }}>
          + Add New Page
        </button>
      </div>

      {/* ── How it works ── */}
      <div style={{ background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:'var(--r-sm)', padding:'14px 18px', marginBottom:24, fontSize:'0.84rem', lineHeight:1.7 }}>
        <strong style={{ color:'var(--gold)', display:'block', marginBottom:6 }}>💡 How to edit a page</strong>
        <ol style={{ margin:0, paddingLeft:18, color:'var(--muted)' }}>
          <li>Click <strong style={{ color:'var(--text)' }}>Open &amp; Edit</strong> — the live page opens in your browser</li>
          <li>Click the <strong style={{ color:'var(--gold)' }}>✏️ Edit [Page]</strong> button floating at the bottom</li>
          <li>Click any <strong style={{ color:'var(--text)' }}>dashed text</strong> to edit inline — changes preview live</li>
          <li>Click <strong style={{ color:'var(--gold)' }}>💾 Save &amp; Publish</strong> — pushed to Firestore instantly</li>
        </ol>
      </div>

      {/* ── Add / Edit Page Modal ── */}
      {(showAdd || editingPage) && (
        <div className="card" style={{ padding:24, marginBottom:24, border:'1px solid rgba(201,168,76,0.3)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h3 style={{ fontSize:'0.95rem', color:'var(--gold)' }}>
              {editingPage ? `✏️ Edit Page: ${editingPage.label}` : '➕ Add New Page'}
            </h3>
            <button className="adm-close-btn" onClick={() => { setShowAdd(false); setEditingPage(null); }}>✕</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="adm-field-group">
              <label>Page Label *</label>
              <input className="field" value={form.label} onChange={e => setForm(f=>({...f,label:e.target.value}))} placeholder="e.g. Blog, Events, Gallery" />
            </div>
            {!editingPage && (
              <div className="adm-field-group">
                <label>URL Path *</label>
                <input className="field" value={form.path} onChange={e => setForm(f=>({...f,path:e.target.value}))} placeholder="/blog" />
                <small style={{ color:'var(--muted)', fontSize:'0.72rem' }}>Must start with / — e.g. /blog, /events</small>
              </div>
            )}
            <div className="adm-field-group">
              <label>Icon</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {ICONS.map(ic => (
                  <button key={ic} onClick={() => setForm(f=>({...f,icon:ic}))}
                    style={{ width:32, height:32, border:`1px solid ${form.icon===ic?'var(--gold)':'var(--dim)'}`, borderRadius:'var(--r-sm)', background: form.icon===ic?'rgba(201,168,76,0.1)':'transparent', cursor:'pointer', fontSize:'1rem' }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="adm-field-group">
              <label>Description</label>
              <input className="field" value={form.desc} onChange={e => setForm(f=>({...f,desc:e.target.value}))} placeholder="Short description for admin panel" />
            </div>
            {!editingPage && (
              <div className="adm-field-group" style={{ gridColumn:'1/-1' }}>
                <label>Initial Content (optional — edit inline on the live page)</label>
                <textarea className="field" rows={4} value={form.content} onChange={e => setForm(f=>({...f,content:e.target.value}))}
                  placeholder="You can add content here or use the inline editor on the live page…"
                  style={{ resize:'vertical', fontFamily:'inherit' }} />
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn btn-primary btn-sm" onClick={editingPage ? handleEditMeta : handleAdd} disabled={saving}>
              {saving ? '⏳ Saving…' : editingPage ? '💾 Save Changes' : '+ Create Page'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setEditingPage(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleting && (
        <div className="adm-overlay">
          <div className="adm-confirm card">
            <h3 style={{ color:'var(--err)', marginBottom:10 }}>Delete Page?</h3>
            <p style={{ fontSize:'0.84rem', color:'var(--muted)', marginBottom:16 }}>
              Delete <strong style={{ color:'var(--text)' }}>{deleting.label}</strong>? This will remove the page and all its content from Firestore. This cannot be undone.
            </p>
            <div className="adm-confirm-btns">
              <button className="btn btn-primary btn-sm" style={{ background:'var(--err)' }} onClick={() => handleDelete(deleting)} disabled={saving}>
                {saving ? '⏳' : 'Delete'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section: Built-in Pages ── */}
      <div style={{ marginBottom:8 }}>
        <div style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:12 }}>
          Built-in Pages ({BUILT_IN_PAGES.length})
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
          {BUILT_IN_PAGES.map(page => (
            <div key={page.key} className="card" style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:'1.8rem', lineHeight:1 }}>{page.icon}</div>
                <div>
                  <strong style={{ display:'block', fontSize:'0.92rem' }}>{page.label}</strong>
                  <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{page.path}</span>
                </div>
              </div>
              <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{page.desc}</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => openEdit(page)} className="btn btn-primary btn-sm" style={{ flex:1, fontSize:'0.75rem' }}>
                  ✏️ Open &amp; Edit
                </button>
                <a href={page.path} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize:'0.75rem' }}>
                  ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section: Custom Pages ── */}
      <div style={{ marginTop:28 }}>
        <div style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:12 }}>
          Custom Pages ({customPages.length})
        </div>
        {loading ? (
          <div style={{ color:'var(--muted)', fontSize:'0.82rem', padding:'12px 0' }}>Loading custom pages…</div>
        ) : customPages.length === 0 ? (
          <div className="card" style={{ padding:28, textAlign:'center' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:10 }}>📄</div>
            <p style={{ color:'var(--muted)', fontSize:'0.84rem', marginBottom:16 }}>No custom pages yet. Add one to expand your site.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add First Page</button>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
            {customPages.map(page => (
              <div key={page.key} className="card" style={{ padding:18, display:'flex', flexDirection:'column', gap:10, border:'1px solid rgba(201,168,76,0.15)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:'1.8rem', lineHeight:1 }}>{page.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <strong style={{ display:'block', fontSize:'0.92rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{page.label}</strong>
                    <span style={{ fontSize:'0.72rem', color:'var(--muted)', fontFamily:'monospace' }}>{page.path}</span>
                  </div>
                  <span style={{ fontSize:'0.62rem', background:'rgba(201,168,76,0.12)', color:'var(--gold)', padding:'2px 6px', borderRadius:4, border:'1px solid rgba(201,168,76,0.2)', flexShrink:0 }}>Custom</span>
                </div>
                <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{page.desc}</div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => openEdit(page)} className="btn btn-primary btn-sm" style={{ flex:1, fontSize:'0.73rem' }}>
                    ✏️ Edit Content
                  </button>
                  <button onClick={() => startEditMeta(page)} className="btn btn-ghost btn-sm" style={{ fontSize:'0.73rem' }}>
                    ⚙️
                  </button>
                  <a href={page.path} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize:'0.73rem' }}>
                    ↗
                  </a>
                  <button
                    onClick={() => setDeleting(page)}
                    style={{ padding:'5px 8px', background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.2)', borderRadius:'var(--r-sm)', color:'#e74c3c', cursor:'pointer', fontSize:'0.73rem' }}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop:28, padding:'14px 18px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--dim)', borderRadius:'var(--r-sm)', fontSize:'0.8rem', color:'var(--muted)' }}>
        <strong style={{ color:'var(--text)', display:'block', marginBottom:4 }}>About &amp; Founder pages</strong>
        These pages have deep editing — every paragraph, stat, and list item is directly clickable when you're signed in as super admin. Navigate to the page and click any text to edit.
      </div>
    </div>
  );
}
