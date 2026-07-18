import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, getDocs, query, collection, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * PRE-ORDER PANEL
 * 
 * Manage pre-orders for coming-soon books:
 * - Enable/disable pre-orders per book
 * - Pre-order pricing and discounts
 * - Auto-delivery when book releases
 * - Pre-order analytics
 */

export default function PreOrderPanel({ showToast, books, isSuper }) {
  const [preOrders, setPreOrders] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [tab, setTab] = useState('manage');

  const comingSoonBooks = books.filter((b) => b.status === 'coming-soon');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'site_data', 'preorder_config'));
        if (snap.exists()) {
          setPreOrders(snap.data().books || {});
        }
        // Initialize default config for all coming-soon books
        const config = snap.exists() ? snap.data().books || {} : {};
        comingSoonBooks.forEach((b) => {
          if (!config[b.id]) {
            config[b.id] = {
              enabled: false,
              discount: 10,
              maxPreOrders: null,
              currentPreOrders: 0,
            };
          }
        });
        setPreOrders(config);
      } catch (e) {
        showToast?.('Failed to load pre-order config');
      }
      setLoading(false);
    };
    load();
  }, [showToast, comingSoonBooks.length]);

  const updateBookPreOrder = async (bookId, config) => {
    setSaving((s) => ({ ...s, [bookId]: true }));
    try {
      const current = preOrders;
      current[bookId] = config;
      await setDoc(
        doc(db, 'site_data', 'preorder_config'),
        { books: current, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setPreOrders(current);
      showToast?.('✅ Pre-order settings updated');
    } catch (e) {
      showToast?.('❌ Save failed: ' + e.message);
    }
    setSaving((s) => ({ ...s, [bookId]: false }));
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏰</div>
        <p>Loading pre-order config…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>⏰ Pre-Order Management</h1>
          <span className="adm-page-sub">
            Allow readers to pre-order coming-soon books and auto-deliver on release.
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
        <button
          onClick={() => setTab('manage')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: tab === 'manage' ? 'rgba(201,168,76,0.2)' : 'transparent',
            color: tab === 'manage' ? 'var(--gold)' : 'var(--muted)',
            cursor: 'pointer',
            borderBottom: tab === 'manage' ? '2px solid var(--gold)' : 'none',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          📋 Manage Pre-Orders
        </button>
        <button
          onClick={() => setTab('analytics')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: tab === 'analytics' ? 'rgba(201,168,76,0.2)' : 'transparent',
            color: tab === 'analytics' ? 'var(--gold)' : 'var(--muted)',
            cursor: 'pointer',
            borderBottom: tab === 'analytics' ? '2px solid var(--gold)' : 'none',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          📊 Analytics
        </button>
      </div>

      {tab === 'manage' && (
        <>
          {comingSoonBooks.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
              <p>No coming-soon books. Create books with status "coming-soon" to enable pre-orders.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {comingSoonBooks.map((book) => {
                const config = preOrders[book.id] || {
                  enabled: false,
                  discount: 10,
                  maxPreOrders: null,
                  currentPreOrders: 0,
                };

                return (
                  <div
                    key={book.id}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 'var(--r)',
                      padding: 20,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
                      {/* Book Info */}
                      <div>
                        <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 4 }}>{book.title}</strong>
                        <small style={{ color: 'var(--muted)' }}>KSh {book.price}</small>
                      </div>

                      {/* Pre-Order Config */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 12, alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) =>
                              updateBookPreOrder(book.id, { ...config, enabled: e.target.checked })
                            }
                            style={{ width: 18, height: 18 }}
                          />
                          <span style={{ fontSize: '0.82rem' }}>Enable</span>
                        </label>

                        {config.enabled && (
                          <>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                                Discount (%)
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={config.discount}
                                onChange={(e) =>
                                  updateBookPreOrder(book.id, {
                                    ...config,
                                    discount: parseInt(e.target.value),
                                  })
                                }
                                className="field"
                                style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                                Max Pre-Orders
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={config.maxPreOrders || ''}
                                onChange={(e) =>
                                  updateBookPreOrder(book.id, {
                                    ...config,
                                    maxPreOrders: e.target.value ? parseInt(e.target.value) : null,
                                  })
                                }
                                placeholder="Unlimited"
                                className="field"
                                style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                              />
                            </div>

                            <div style={{ textAlign: 'center' }}>
                              <strong style={{ fontSize: '0.9rem', color: 'var(--gold)' }}>
                                {config.currentPreOrders}
                              </strong>
                              <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.75rem' }}>
                                pre-orders
                              </small>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {config.enabled && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 10,
                          background: 'rgba(46,204,113,0.05)',
                          border: '1px solid rgba(46,204,113,0.2)',
                          borderRadius: 'var(--r-sm)',
                          fontSize: '0.78rem',
                          color: '#2ecc71',
                        }}
                      >
                        ✓ Pre-orders enabled • {config.discount}% discount • Auto-delivery on release
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'analytics' && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>📊 Pre-Order Analytics</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📦</div>
              <strong style={{ display: 'block', marginBottom: 4 }}>
                {Object.values(preOrders).reduce((sum, b) => sum + (b.currentPreOrders || 0), 0)}
              </strong>
              <small style={{ color: 'var(--muted)' }}>Total Pre-Orders</small>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎯</div>
              <strong style={{ display: 'block', marginBottom: 4 }}>
                {Object.values(preOrders).filter((b) => b.enabled).length}
              </strong>
              <small style={{ color: 'var(--muted)' }}>Books with Pre-Orders</small>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>💰</div>
              <strong style={{ display: 'block', marginBottom: 4 }}>
                KSh {
                  Object.entries(preOrders)
                    .filter(([, b]) => b.enabled)
                    .reduce((sum, [id]) => {
                      const book = books.find((b) => b.id === id);
                      const preOrderConfig = preOrders[id];
                      const discountedPrice = book.price * (1 - preOrderConfig.discount / 100);
                      return sum + discountedPrice * preOrderConfig.currentPreOrders;
                    }, 0)
                    .toFixed(0)
                }
              </strong>
              <small style={{ color: 'var(--muted)' }}>Revenue from Pre-Orders</small>
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            💡 Pre-order revenue is held in escrow and released to your account when the book is published.
          </p>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 40, color: 'var(--muted)', fontSize: '0.82rem' }}>
        💡 Pre-orders help generate buzz before release. When a book is marked as complete, pre-order customers get automatic access.
      </div>
    </div>
  );
}
