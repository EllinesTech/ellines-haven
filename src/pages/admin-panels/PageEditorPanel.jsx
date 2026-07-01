import { useNavigate } from 'react-router-dom';

const PAGES = [
  { key: 'home_content',     label: 'Home',     path: '/',         icon: '🏠', desc: 'Hero, taglines, sections, CTA' },
  { key: 'about_content',    label: 'About Us', path: '/about',    icon: 'ℹ️', desc: 'Story, mission, values, stats' },
  { key: 'founder_content',  label: 'Founder',  path: '/founder',  icon: '👤', desc: 'Bio, skills, timeline, quotes' },
  { key: 'contact_content',  label: 'Contact',  path: '/contact',  icon: '📞', desc: 'Page title, details, form text' },
  { key: 'library_content',  label: 'Library',  path: '/library',  icon: '📚', desc: 'Hero, search placeholder, empty state' },
  { key: 'cart_content',     label: 'Cart',     path: '/cart',     icon: '🛒', desc: 'Cart, checkout, payment text' },
  { key: 'login_content',    label: 'Sign In',  path: '/login',    icon: '🔑', desc: 'Heading, button, links' },
  { key: 'register_content', label: 'Register', path: '/register', icon: '📝', desc: 'Heading, button, closed message' },
];

export default function PageEditorPanel({ showToast }) {
  const navigate = useNavigate();

  const openEdit = (page) => {
    navigate(page.path);
    // Small delay so route transition completes, then EditToolbar is visible
    setTimeout(() => {
      // The EditToolbar floating button will be visible on the page
      // Admin clicks "✏️ Edit [Page]" to activate inline edit mode
    }, 100);
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Page Editor</h1>
          <span className="adm-page-sub">
            Click a page to open it — then use the <strong style={{ color: 'var(--gold)' }}>✏️ Edit Page</strong> button
            at the bottom of the screen to activate inline editing.
          </span>
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 'var(--r-sm)', padding: '14px 18px', marginBottom: 24, fontSize: '0.84rem', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--gold)', display: 'block', marginBottom: 6 }}>💡 How to edit a page</strong>
        <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
          <li>Click <strong style={{ color: 'var(--text)' }}>Open Page</strong> below — the live page opens in your browser</li>
          <li>Click the <strong style={{ color: 'var(--gold)' }}>✏️ Edit [Page]</strong> button floating at the bottom of that page</li>
          <li>Click any <strong style={{ color: 'var(--text)' }}>dashed text</strong> to edit it inline — changes preview live</li>
          <li>Click <strong style={{ color: 'var(--gold)' }}>💾 Save & Publish</strong> — pushed to Firestore instantly</li>
        </ol>
      </div>

      {/* Page cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {PAGES.map(page => (
          <div key={page.key} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: '2rem', lineHeight: 1 }}>{page.icon}</div>
              <div>
                <strong style={{ display: 'block', fontSize: '1rem' }}>{page.label}</strong>
                <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{page.desc}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => openEdit(page)}
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
              >
                ✏️ Open & Edit
              </button>
              <a
                href={page.path}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ flexShrink: 0 }}
              >
                ↗ Preview
              </a>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, padding: '14px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dim)', borderRadius: 'var(--r-sm)', fontSize: '0.8rem', color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>About & Founder pages</strong>
        These pages have even deeper editing — every paragraph, stat, and list item is directly clickable when you're logged in as super admin. Just navigate to the page and click any text.
      </div>
    </div>
  );
}
