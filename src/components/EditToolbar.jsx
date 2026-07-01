import { useEditMode } from '../context/EditModeContext';
import { useApp } from '../context/AppContext';
import { useLocation, useNavigate } from 'react-router-dom';

/* Map routes to Firestore doc keys */
const ROUTE_TO_KEY = {
  '/':         'home_content',
  '/about':    'about_content',
  '/founder':  'founder_content',
  '/contact':  'contact_content',
  '/library':  'library_content',
  '/cart':     'cart_content',
  '/login':    'login_content',
  '/register': 'register_content',
};

const ROUTE_LABELS = {
  '/':         '🏠 Home',
  '/about':    'ℹ️ About',
  '/founder':  '👤 Founder',
  '/contact':  '📞 Contact',
  '/library':  '📚 Library',
  '/cart':     '🛒 Cart',
  '/login':    '🔑 Sign In',
  '/register': '📝 Register',
};

export default function EditToolbar() {
  const { user } = useApp();
  const ctx = useEditMode();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  if (!isAdmin) return null;

  // Don't show on admin panel itself
  if (pathname.startsWith('/admin')) return null;

  const pageKey = ROUTE_TO_KEY[pathname];
  const { editMode, dirty, saving, toast, enterEdit, exitEdit, saveAll, pageData } = ctx;

  const handleEdit = () => {
    if (!pageKey) return;
    enterEdit(pageKey, {}); // pages load their own data from Firestore
  };

  const handleSave = async () => {
    await saveAll();
  };

  const handleExit = () => {
    if (dirty && !window.confirm('You have unsaved changes. Exit anyway?')) return;
    exitEdit();
  };

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: toast.startsWith('✅') ? 'rgba(46,204,113,0.95)' : 'rgba(231,76,60,0.95)',
          color: '#fff', padding: '10px 24px', borderRadius: 8,
          fontWeight: 600, fontSize: '0.88rem', zIndex: 99999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9990, display: 'flex', alignItems: 'center', gap: 8,
        background: editMode ? 'rgba(10,10,20,0.97)' : 'rgba(10,10,20,0.92)',
        border: editMode ? '1px solid rgba(201,168,76,0.6)' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 50, padding: '7px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}>
        {!editMode ? (
          <>
            {pageKey ? (
              <button onClick={handleEdit} style={btnStyle('var(--gold, #c9a84c)', '#000')}>
                ✏️ Edit {ROUTE_LABELS[pathname] || 'Page'}
              </button>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', padding: '0 8px' }}>
                No editable content on this page
              </span>
            )}
            <a href="/admin" style={btnStyle('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.7)', true)}>
              ⚙️ Admin
            </a>
          </>
        ) : (
          <>
            <span style={{ color: 'rgba(201,168,76,0.8)', fontSize: '0.74rem', fontWeight: 600, paddingLeft: 4 }}>
              ✏️ EDITING — click any highlighted text
            </span>
            {dirty && (
              <span style={{ background: 'rgba(231,76,60,0.2)', color: '#e74c3c', fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(231,76,60,0.3)' }}>
                Unsaved
              </span>
            )}
            <button onClick={handleSave} disabled={saving || !dirty}
              style={btnStyle(dirty ? 'var(--gold, #c9a84c)' : 'rgba(255,255,255,0.1)', dirty ? '#000' : 'rgba(255,255,255,0.3)')}>
              {saving ? '⏳ Saving…' : '💾 Save & Publish'}
            </button>
            <button onClick={handleExit} style={btnStyle('rgba(231,76,60,0.15)', '#e74c3c')}>
              ✕ Exit Edit
            </button>
          </>
        )}
      </div>

      {/* Edit mode dim overlay hint */}
      {editMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          background: 'rgba(201,168,76,0.04)',
          borderBottom: '3px solid rgba(201,168,76,0.4)',
          zIndex: 9989, pointerEvents: 'none',
          padding: '6px 16px', textAlign: 'center',
          fontSize: '0.75rem', fontWeight: 600,
          color: 'var(--gold, #c9a84c)',
          backdropFilter: 'blur(4px)',
        }}>
          EDIT MODE — Click any dashed text to edit it. Save when done.
        </div>
      )}
    </>
  );
}

function btnStyle(bg, color, isLink = false) {
  return {
    background: bg, color, border: 'none', borderRadius: 50,
    padding: '6px 16px', cursor: 'pointer', fontWeight: 600,
    fontSize: '0.78rem', fontFamily: 'inherit', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    transition: 'opacity 0.15s', opacity: 1,
  };
}
