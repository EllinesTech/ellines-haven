import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * AUTHOR BLOG PANEL
 * 
 * Allows admin to create and manage author blog posts:
 * - Create, edit, delete blog posts
 * - Featured posts (appear on home page)
 * - Auto-publish scheduling
 * - Public/draft status
 * - Author bio/notes
 */

const DEFAULTS = {
  authorBio: 'IT entrepreneur, software engineer, AI developer, and author based in Kenya.',
  authorWeb: 'https://ellinestech.co.ke',
  authorTwitter: '',
  authorInstagram: '',
};

function DateInput({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
        style={{ fontSize: '0.85rem' }}
      />
    </div>
  );
}

function BlogPostEditor({ post, onSave, onCancel }) {
  const [data, setData] = useState(
    post || {
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      featured: false,
      published: false,
      publishedAt: new Date().toISOString().slice(0, 16),
      createdAt: new Date().toISOString().slice(0, 16),
      tags: '',
      author: 'Elijah Mwangi M',
    }
  );

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  const handleTitleChange = (title) => {
    setData((d) => ({ ...d, title, slug: generateSlug(title) }));
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--r)', padding: 20, marginBottom: 20 }}>
      <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>
        {post ? '✏️ Edit Post' : '✍️ New Blog Post'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            Post Title *
          </label>
          <input
            className="field"
            value={data.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g., The Inspiration Behind Marriage Is a Scam"
            style={{ fontSize: '0.85rem', marginBottom: 12 }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            URL Slug
          </label>
          <input
            className="field"
            value={data.slug}
            onChange={(e) => setData((d) => ({ ...d, slug: e.target.value }))}
            placeholder="auto-generated"
            style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Excerpt (short summary shown in lists)
        </label>
        <textarea
          className="field"
          value={data.excerpt}
          onChange={(e) => setData((d) => ({ ...d, excerpt: e.target.value }))}
          placeholder="Brief description of the post..."
          rows={2}
          style={{ fontSize: '0.85rem', resize: 'vertical' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Post Content (Markdown supported)
        </label>
        <textarea
          className="field"
          value={data.content}
          onChange={(e) => setData((d) => ({ ...d, content: e.target.value }))}
          placeholder="Write your blog post here..."
          rows={8}
          style={{ fontSize: '0.85rem', resize: 'vertical', fontFamily: 'monospace' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <DateInput
          label="Created Date"
          value={data.createdAt}
          onChange={(v) => setData((d) => ({ ...d, createdAt: v }))}
        />
        <DateInput
          label="Published Date"
          value={data.publishedAt}
          onChange={(v) => setData((d) => ({ ...d, publishedAt: v }))}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Tags (comma-separated)
        </label>
        <input
          className="field"
          value={data.tags}
          onChange={(e) => setData((d) => ({ ...d, tags: e.target.value }))}
          placeholder="e.g., writing, fiction, Kenya, relationships"
          style={{ fontSize: '0.85rem' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r-sm)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
          <input
            type="checkbox"
            checked={data.published}
            onChange={(e) => setData((d) => ({ ...d, published: e.target.checked }))}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: '0.82rem' }}>Published (visible to public)</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
          <input
            type="checkbox"
            checked={data.featured}
            onChange={(e) => setData((d) => ({ ...d, featured: e.target.checked }))}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: '0.82rem' }}>Featured (show on home page)</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onSave(data)}>
          {post ? '💾 Update Post' : '📝 Create Post'}
        </button>
      </div>
    </div>
  );
}

export default function AuthorBlogPanel({ showToast, isSuper }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Load author info
        const settingsDoc = await getDoc(doc(db, 'site_data', 'author_settings'));
        if (settingsDoc.exists()) {
          setSettings((s) => ({ ...s, ...settingsDoc.data() }));
        }

        // Load blog posts
        const postsSnap = await getDocs(
          query(collection(db, 'author_blog'), orderBy('createdAt', 'desc'))
        );
        setPosts(postsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        showToast?.('❌ Failed to load blog data: ' + e.message);
      }
      setLoading(false);
    };
    load();
  }, [showToast]);

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, 'site_data', 'author_settings'), settings, { merge: true });
      showToast?.('✅ Author settings saved');
      setDirty(false);
    } catch (e) {
      showToast?.('❌ Save failed: ' + e.message);
    }
  };

  const savePost = async (postData) => {
    try {
      const postId = editing?.id || postData.slug + '_' + Date.now();
      await setDoc(doc(db, 'author_blog', postId), {
        ...postData,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast?.('✅ Blog post saved');
      setEditing(null);
      setCreating(false);
      // Reload posts
      const postsSnap = await getDocs(
        query(collection(db, 'author_blog'), orderBy('createdAt', 'desc'))
      );
      setPosts(postsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      showToast?.('❌ Failed to save post: ' + e.message);
    }
  };

  const deletePost = async (postId) => {
    if (!window.confirm('Delete this blog post? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'author_blog', postId));
      showToast?.('✅ Blog post deleted');
      setPosts((p) => p.filter((x) => x.id !== postId));
    } catch (e) {
      showToast?.('❌ Delete failed: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>📝</div>
        <p>Loading author blog…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📝 Author Blog & Updates</h1>
          <span className="adm-page-sub">
            Share stories, announcements, and updates with your readers. Posts sync to the public blog page.
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New Blog Post
        </button>
      </div>

      {/* Author Bio Settings */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>👤 Author Bio & Links</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Author Bio
            </label>
            <textarea
              className="field"
              value={settings.authorBio}
              onChange={(e) => {
                setSettings((s) => ({ ...s, authorBio: e.target.value }));
                setDirty(true);
              }}
              rows={3}
              style={{ fontSize: '0.85rem', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Website
              </label>
              <input
                className="field"
                value={settings.authorWeb}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, authorWeb: e.target.value }));
                  setDirty(true);
                }}
                placeholder="https://..."
                style={{ fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Twitter/X
              </label>
              <input
                className="field"
                value={settings.authorTwitter}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, authorTwitter: e.target.value }));
                  setDirty(true);
                }}
                placeholder="@handle"
                style={{ fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>
        {dirty && (
          <button className="btn btn-primary btn-sm" onClick={saveSettings}>
            💾 Save Author Settings
          </button>
        )}
      </div>

      {/* Create Post */}
      {creating && (
        <BlogPostEditor
          post={null}
          onSave={savePost}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Edit Post */}
      {editing && (
        <BlogPostEditor
          post={editing}
          onSave={savePost}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Posts List */}
      <h3 style={{ marginBottom: 16, fontSize: '0.95rem' }}>📚 Blog Posts ({posts.length})</h3>
      {posts.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          <p>No blog posts yet. Create one to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map((post) => (
            <div
              key={post.id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 'var(--r-sm)',
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: '0.9rem' }}>{post.title}</strong>
                  {post.featured && <span style={{ fontSize: '0.7rem', background: 'var(--gold)', color: '#000', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>FEATURED</span>}
                  {post.published ? (
                    <span style={{ fontSize: '0.7rem', background: '#2ecc71', color: '#000', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>PUBLISHED</span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', color: 'var(--muted)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>DRAFT</span>
                  )}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                  {post.excerpt || post.content.slice(0, 100) + '...'}
                </p>
                <small style={{ color: 'rgba(201,168,76,0.6)' }}>
                  Published: {new Date(post.publishedAt || post.createdAt).toLocaleDateString()} • {post.tags && `Tags: ${post.tags}`}
                </small>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setEditing(post)}
                >
                  ✏️ Edit
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ color: '#e74c3c', borderColor: 'rgba(231,76,60,0.3)' }}
                  onClick={() => deletePost(post.id)}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 40, color: 'var(--muted)', fontSize: '0.82rem' }}>
        💡 Blog posts automatically appear on the public blog page. Featured posts show on the home page.
      </div>
    </div>
  );
}
