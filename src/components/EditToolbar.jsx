import { useEditMode } from '../context/EditModeContext';
import { useApp } from '../context/AppContext';
import { useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useState, useEffect } from 'react';

/* Map routes to Firestore doc keys */
const ROUTE_TO_KEY = {
  '/':          'home_content',
  '/about':     'about_content',
  '/founder':   'founder_content',
  '/contact':   'contact_content',
  '/library':   'library_content',
  '/cart':      'cart_content',
  '/login':     'login_content',
  '/register':  'register_content',
  '/faq':       'faq_content',
  '/terms':     'terms_content',
  '/privacy':   'privacy_content',
  '/wishlist':  'wishlist_content',
};

const ROUTE_LABELS = {
  '/':          '🏠 Home',
  '/about':     'ℹ️ About',
  '/founder':   '👤 Founder',
  '/contact':   '📞 Contact',
  '/library':   '📚 Library',
  '/cart':      '🛒 Cart',
  '/login':     '🔑 Sign In',
  '/register':  '📝 Register',
  '/faq':       '❓ FAQ',
  '/terms':     '📄 Terms',
  '/privacy':   '🔒 Privacy',
  '/wishlist':  '🔖 Wishlist',
};

export default function EditToolbar() {
  const { user } = useApp();
  const ctx = useEditMode();
  const { pathname } = useLocation();
  const [customPageInfo, setCustomPageInfo] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // Check if the current path is a custom page
  useEffect(() => {
    if (!isAdmin) return;
    if (ROUTE_TO_KEY[pathname]) { setCustomPageInfo(null); return; }

    getDoc(doc(db, 'site_data', 'custom_pages')).then(snap => {
      if (!snap.exists()) return;
      const pages = snap.data().pages || [];
      const match = pages.find(p => p.path === pathname);
      setCustomPageInfo(match || null);
    }).catch(() => {});
  }, [pathname, isAdmin]);

  if (!isAdmin) return null;
  if (pathname.startsWith('/admin') || pathname.startsWith('/read')) return null;

  // Determine the page key — built-in or custom
  const builtInKey = ROUTE_TO_KEY[pathname];
  const pageKey    = builtInKey || customPageInfo?.key || null;
  const pageLabel  = ROUTE_LABELS[pathname] || customPageInfo?.label || null;

  const { editMode, dirty, saving, toast, enterEdit, exitEdit, saveAll } = ctx;

  const handleEdit = async () => {
    if (!pageKey) return;
    let fsData = {};
    try {
      const snap = await getDoc(doc(db, 'site_data', pageKey));
      if (snap.exists()) fsData = snap.data();
    } catch {}
    enterEdit(pageKey, fsData);
  };

  const handleExit = () => {
    if (dirty && !window.confirm('You have unsaved changes. Exit edit mode?')) return;
    exitEdit();
  };

  const toolbarStyle = {
    position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
    zIndex: 9990, display: 'flex', alignItems: 'center', gap: 6,
    background: editMode ? 'rgba(8,8,18,0.98)' : 'rgba(8,8,18,0.9)',
    border: `1px solid ${editMode ? 'rgba(201,168,76,0.55)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 50, padding: '6px 12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
    backdropFilter: 'blur(14px)',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    maxWidth: 'calc(100vw - 32px)',
  };

  return (
    <>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: toast.startsWith('✅') ? '#1a7a3a' : '#8b1a1a',
          color: '#fff', padding: '10px 24px', borderRadius: 8,
          fontWeight: 600, fontSize: '0.88rem', zIndex: 99999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', pointerEvents: 'none',
          letterSpacing: 0.2,
        }}>
          {toast}
        </div>
      )}

      {/* Edit mode banner at top */}
      {editMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9989,
          background: 'rgba(201,168,76,0.12)', borderBottom: '2px solid rgba(201,168,76,0.5)',
          padding: '7px 16px', textAlign: 'center', pointerEvents: 'none',
          fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold, #c9a84c)',
          backdropFilter: 'blur(6px)', letterSpacing: 0.5,
        }}>
          ✏️ EDIT MODE — Click any highlighted text to edit · Save when done
        </div>
      )}

      {/* Floating toolbar */}
      <div style={toolbarStyle}>
        {!editMode ? (
          <>
            {pageKey ? (
              <button onClick={handleEdit} style={btn('var(--gold,#c9a84c)', '#000')}>
                ✏️ Edit {pageLabel || 'Page'}
              </button>
            ) : (
              <span style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.75rem', padding:'0 6px' }}>
                No editable content here
              </span>
            )}
            <a href="/admin" style={btn('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.6)')}>
              ⚙️ Admin
            </a>
          </>
        ) : (
          <>
            <span style={{ color:'rgba(201,168,76,0.85)', fontSize:'0.72rem', fontWeight:700, paddingLeft:4 }}>
              ✏️ {pageLabel || 'Page'}
            </span>
            {dirty && (
              <span style={{ background:'rgba(231,76,60,0.18)', color:'#e06c5a', fontSize:'0.68rem', padding:'2px 8px', borderRadius:10, border:'1px solid rgba(231,76,60,0.3)', flexShrink:0 }}>
                Unsaved
              </span>
            )}
            <button onClick={saveAll} disabled={saving || !dirty}
              style={btn(dirty ? 'var(--gold,#c9a84c)' : 'rgba(255,255,255,0.08)', dirty ? '#000' : 'rgba(255,255,255,0.25)')}>
              {saving ? '⏳ Saving…' : '💾 Save & Publish'}
            </button>
            <button onClick={handleExit} style={btn('rgba(231,76,60,0.12)', '#e06c5a')}>
              ✕ Exit
            </button>
          </>
        )}
      </div>
    </>
  );
}

function btn(bg, color) {
  return {
    background: bg, color, border: 'none', borderRadius: 50,
    padding: '6px 15px', cursor: 'pointer', fontWeight: 600,
    fontSize: '0.77rem', fontFamily: 'inherit', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
    transition: 'opacity 0.15s',
  };
}
