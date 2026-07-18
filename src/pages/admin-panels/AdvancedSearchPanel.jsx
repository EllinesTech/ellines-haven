import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * ADVANCED SEARCH PANEL
 * 
 * Configure advanced search functionality:
 * - Full-text search (chapter-level)
 * - Advanced filters (price range, reading time, rating, etc.)
 * - Search analytics (trending searches, popular queries)
 */

export default function AdvancedSearchPanel({ showToast, books }) {
  const [config, setConfig] = useState({
    enableFullText: true,
    enableAdvancedFilters: true,
    enableSearchAnalytics: true,
    advancedFilters: {
      priceRange: true,
      readingTime: true,
      rating: true,
      status: true,
      language: false,
      reviewCount: true,
    },
    maxSearchResults: 100,
    searchDebounceMs: 300,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchStats, setSearchStats] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const doc1 = await getDoc(doc(db, 'site_data', 'search_config'));
        if (doc1.exists()) {
          setConfig((c) => ({ ...c, ...doc1.data() }));
        }
      } catch (e) {
        showToast?.('Failed to load search config');
      }
      setLoading(false);
    };
    load();
  }, [showToast]);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', 'search_config'), {
        ...config,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast?.('✅ Search config saved');
    } catch (e) {
      showToast?.('❌ Save failed: ' + e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔍</div>
        <p>Loading search settings…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>🔍 Advanced Search Configuration</h1>
          <span className="adm-page-sub">
            Customize search features, filters, and analytics for your book library.
          </span>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </button>
      </div>

      {/* Core Search Features */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>✨ Core Features</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.enableFullText}
              onChange={(e) => setConfig((c) => ({ ...c, enableFullText: e.target.checked }))}
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>Full-Text Search</strong>
              <small style={{ color: 'var(--muted)' }}>Search within book content, chapters, and metadata</small>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.enableAdvancedFilters}
              onChange={(e) => setConfig((c) => ({ ...c, enableAdvancedFilters: e.target.checked }))}
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>Advanced Filters</strong>
              <small style={{ color: 'var(--muted)' }}>Price range, reading time, ratings, status filters</small>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px' }}>
            <input
              type="checkbox"
              checked={config.enableSearchAnalytics}
              onChange={(e) => setConfig((c) => ({ ...c, enableSearchAnalytics: e.target.checked }))}
              style={{ width: 18, height: 18 }}
            />
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>Search Analytics</strong>
              <small style={{ color: 'var(--muted)' }}>Track trending searches and popular queries</small>
            </div>
          </label>
        </div>
      </div>

      {/* Advanced Filters */}
      {config.enableAdvancedFilters && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>🎛️ Available Filters</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {Object.entries(config.advancedFilters).map(([key, enabled]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r-sm)' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      advancedFilters: { ...c.advancedFilters, [key]: e.target.checked },
                    }))
                  }
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Search Performance */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>⚡ Performance</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Max Search Results
            </label>
            <select
              className="field"
              value={config.maxSearchResults}
              onChange={(e) => setConfig((c) => ({ ...c, maxSearchResults: parseInt(e.target.value) }))}
            >
              {[10, 25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} results
                </option>
              ))}
            </select>
            <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Limit search result count for performance</small>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Search Debounce (ms)
            </label>
            <select
              className="field"
              value={config.searchDebounceMs}
              onChange={(e) => setConfig((c) => ({ ...c, searchDebounceMs: parseInt(e.target.value) }))}
            >
              {[100, 200, 300, 500].map((n) => (
                <option key={n} value={n}>
                  {n}ms delay
                </option>
              ))}
            </select>
            <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Delay before search executes (reduce server load)</small>
          </div>
        </div>
      </div>

      {/* Search Statistics */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>📊 Search Statistics</h3>
        {config.enableSearchAnalytics ? (
          <div style={{ padding: '20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--r-sm)', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 12 }}>
              🔍 Search analytics are being tracked. Popular queries appear here.
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              Check back after users start searching to see trending queries and optimization opportunities.
            </p>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            Enable search analytics above to start tracking user searches.
          </p>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 40, color: 'var(--muted)', fontSize: '0.82rem' }}>
        💡 Advanced search helps readers discover books more efficiently. Full-text search indexes all book content for deep discovery.
      </div>
    </div>
  );
}
