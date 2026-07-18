/**
 * FreeBookPanel — Free Registration Book Settings
 * ─────────────────────────────────────────────────
 * Lets admins and superadmins configure which book is
 * automatically granted to every new user on registration.
 *
 * Config is stored in Firestore: site_data/user_permissions
 * under the field `siteControls.freeBook` (reuses the same
 * siteControls / saveSiteControls mechanism already in place).
 */

import { useState, useEffect } from 'react';
import { doc, getDoc, getDocs, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

const libDocId = e => (e || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

export default function FreeBookPanel({ showToast, books = [], isSuper }) {
  const { siteControls, saveSiteControls } = useApp();

  // ── Local state mirrored from siteControls ────────────────────────────────
  const [enabled,      setEnabled]      = useState(false);
  const [selectedId,   setSelectedId]   = useState('');
  const [saving,       setSaving]       = useState(false);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const [grantedCount, setGrantedCount] = useState(null); // # users who have the free book
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Hydrate from siteControls on mount / change ───────────────────────────
  useEffect(() => {
    const fb = siteControls?.freeBook || {};
    setEnabled(!!fb.enabled);
    setSelectedId(fb.bookId || '');
  }, [siteControls]);

  const selectedBook = books.find(b => b.id === selectedId);

  // ── Save to Firestore via saveSiteControls ────────────────────────────────
  const handleSave = async () => {
    if (enabled && !selectedId) {
      showToast('⚠️ Please select a book first');
      return;
    }
    setSaving(true);
    try {
      const updated = {
        ...siteControls,
        freeBook: {
          enabled,
          bookId:    selectedId || '',
          bookTitle: selectedBook?.title || '',
          updatedAt: new Date().toISOString(),
        },
      };
      await saveSiteControls(updated);
      showToast(enabled
        ? `✅ Free book enabled: "${selectedBook?.title}"`
        : '✅ Free book registration gift disabled'
      );
    } catch (e) {
      console.error('[FreeBookPanel] save failed:', e);
      showToast('❌ Save failed — check console');
    } finally {
      setSaving(false);
    }
  };

  // ── Count how many users already have the selected book ───────────────────
  const loadStats = async () => {
    if (!selectedId) return;
    setStatsLoading(true);
    setGrantedCount(null);
    try {
      const snap = await getDocs(collection(db, 'libraries'));
      let count = 0;
      snap.forEach(d => {
        const bks = d.data().books || [];
        if (bks.some(b => b.id === selectedId && b.unlockedBy === 'registration_gift')) count++;
      });
      setGrantedCount(count);
    } catch (e) {
      console.warn('[FreeBookPanel] stats failed:', e.message);
      setGrantedCount('—');
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId) loadStats(); // auto-load stats when book selection changes
    else setGrantedCount(null);
  }, [selectedId]); // eslint-disable-line

  // ── Grant the free book retroactively to ALL existing users ──────────────
  const [backfilling, setBackfilling] = useState(false);
  const backfillAll = async () => {
    if (!selectedBook) return;
    if (!window.confirm(
      `Grant "${selectedBook.title}" to ALL existing users who don't already have it?\n\nThis cannot be undone.`
    )) return;

    setBackfilling(true);
    try {
      // Load all known users from Firestore
      const usersSnap = await getDocs(collection(db, 'users'));
      let done = 0, skipped = 0;

      for (const userDoc of usersSnap.docs) {
        const email = userDoc.data().email;
        if (!email) { skipped++; continue; }
        const libRef  = doc(db, 'libraries', libDocId(email));
        const libSnap = await getDoc(libRef);
        const existing = libSnap.exists() ? (libSnap.data().books || []) : [];
        if (existing.some(b => b.id === selectedId)) { skipped++; continue; }

        await setDoc(libRef, {
          email: email.toLowerCase(),
          books: [
            ...existing,
            {
              ...selectedBook,
              downloadUnlocked: true,
              unlockedAt:  new Date().toISOString(),
              unlockedBy:  'registration_gift_backfill',
            },
          ],
        }, { merge: true });
        done++;
      }

      showToast(`✅ Granted to ${done} user${done !== 1 ? 's' : ''} (${skipped} already had it or skipped)`);
      await loadStats(); // refresh count
    } catch (e) {
      console.error('[FreeBookPanel] backfill failed:', e);
      showToast('❌ Backfill failed — check console');
    } finally {
      setBackfilling(false);
    }
  };

  // ── Revoke the free book from ALL users (superadmin only) ────────────────
  const [revoking, setRevoking] = useState(false);
  const revokeAll = async () => {
    if (!isSuper) return;
    if (!selectedBook) return;
    if (!window.confirm(
      `REMOVE "${selectedBook.title}" from ALL users where it was added as a registration gift?\n\nThis will only remove books granted via registration gift — purchased copies are safe.`
    )) return;

    setRevoking(true);
    try {
      const snap = await getDocs(collection(db, 'libraries'));
      let done = 0;
      for (const d of snap.docs) {
        const bks = d.data().books || [];
        const filtered = bks.filter(
          b => !(b.id === selectedId &&
            (b.unlockedBy === 'registration_gift' || b.unlockedBy === 'registration_gift_backfill'))
        );
        if (filtered.length !== bks.length) {
          await setDoc(doc(db, 'libraries', d.id), { books: filtered }, { merge: true });
          done++;
        }
      }
      showToast(`✅ Revoked from ${done} user${done !== 1 ? 's' : ''}`);
      await loadStats();
    } catch (e) {
      console.error('[FreeBookPanel] revoke failed:', e);
      showToast('❌ Revoke failed — check console');
    } finally {
      setRevoking(false);
    }
  };

  const isDirty = (() => {
    const fb = siteControls?.freeBook || {};
    return (enabled !== !!fb.enabled) || (selectedId !== (fb.bookId || ''));
  })();

  return (
    <div className="adm-page">
      {/* ── Header ── */}
      <div className="adm-page-head">
        <div>
          <h1>🎁 Free Registration Book</h1>
          <span className="adm-page-sub">
            Choose one book that every new user receives automatically when they create an account
          </span>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div style={{
        background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.25)',
        borderRadius: 'var(--r-sm)', padding: '12px 18px', marginBottom: 24, fontSize: '0.84rem',
      }}>
        ⚡ <strong style={{ color: 'var(--gold)' }}>How it works:</strong>&nbsp;
        When a new user registers, the selected book is instantly added to their library with
        full read &amp; download access — no payment needed. You can change or disable this at any time.
      </div>

      {/* ── Main settings card ── */}
      <div className="card" style={{ padding: '24px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: '1rem' }}>Registration Gift Settings</h3>

        {/* Enable / Disable toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderRadius: 'var(--r-sm)', marginBottom: 20,
          border: enabled ? '1px solid rgba(46,204,113,0.35)' : '1px solid var(--border)',
          background: enabled ? 'rgba(46,204,113,0.05)' : 'rgba(255,255,255,0.02)',
        }}>
          <div>
            <strong style={{ fontSize: '0.92rem', display: 'block', marginBottom: 3 }}>
              Free Book on Registration
            </strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              {enabled
                ? '🟢 Active — new registrants will receive the selected book automatically'
                : '⚪ Off — no free book is granted on registration'}
            </span>
          </div>
          <button
            onClick={() => setEnabled(e => !e)}
            style={{
              flexShrink: 0, minWidth: 68, padding: '9px 18px',
              borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s',
              background: enabled ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.06)',
              color:       enabled ? '#2ecc71' : 'var(--muted)',
            }}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Book selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: '0.83rem', color: 'var(--muted)', marginBottom: 8 }}>
            Select the free book
          </label>
          <select
            className="field"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            disabled={!enabled}
            style={{ opacity: enabled ? 1 : 0.45 }}
          >
            <option value="">— choose a book —</option>
            {[...books]
              .sort((a, b) => a.title.localeCompare(b.title))
              .map(b => (
                <option key={b.id} value={b.id}>
                  {b.title}{b.price ? ` (KSh ${b.price})` : ''}
                </option>
              ))}
          </select>
        </div>

        {/* Selected book preview */}
        {selectedBook && (
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            padding: '14px 16px', borderRadius: 'var(--r-sm)',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            marginBottom: 20,
          }}>
            {selectedBook.cover && (
              <img
                src={selectedBook.cover}
                alt={selectedBook.title}
                style={{
                  width: 56, height: 80, objectFit: 'cover',
                  borderRadius: 6, flexShrink: 0, border: '1px solid var(--border)',
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: '0.95rem', display: 'block', marginBottom: 4 }}>
                {selectedBook.title}
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                {selectedBook.author} · {selectedBook.genre}
                {selectedBook.price ? ` · KSh ${selectedBook.price} (valued)` : ''}
              </span>
              {grantedCount !== null && (
                <span style={{
                  display: 'inline-block', fontSize: '0.73rem', padding: '2px 8px',
                  borderRadius: 10, background: 'rgba(201,168,76,0.12)',
                  color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.3)',
                }}>
                  {statsLoading ? '…' : `🎁 Granted to ${grantedCount} user${grantedCount !== 1 ? 's' : ''} via registration gift`}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Save button */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !isDirty}
            style={{
              opacity: (!isDirty || saving) ? 0.55 : 1,
              cursor:  (!isDirty || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : isDirty ? '💾 Save Changes' : '✓ Saved'}
          </button>
          {isDirty && (
            <span style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* ── Bulk actions (superadmin / admin) ── */}
      <div className="card" style={{ padding: '24px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Bulk Actions</h3>
        <p style={{ margin: '0 0 18px', fontSize: '0.8rem', color: 'var(--muted)' }}>
          Apply the free book retroactively to existing users, or revoke it.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* Grant to all existing users */}
          <button
            className="btn btn-primary btn-sm"
            onClick={backfillAll}
            disabled={!selectedBook || backfilling || revoking}
            style={{
              background: 'rgba(46,204,113,0.15)', color: '#2ecc71',
              border: '1px solid rgba(46,204,113,0.35)',
            }}
          >
            {backfilling ? '⏳ Granting…' : '➕ Grant to all existing users'}
          </button>

          {/* Revoke — superadmin only */}
          {isSuper && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={revokeAll}
              disabled={!selectedBook || revoking || backfilling}
              style={{
                background: 'rgba(231,76,60,0.08)', color: '#e74c3c',
                border: '1px solid rgba(231,76,60,0.3)',
              }}
            >
              {revoking ? '⏳ Revoking…' : '🗑 Revoke gift from all users'}
            </button>
          )}
        </div>

        {!selectedBook && (
          <p style={{ marginTop: 10, fontSize: '0.77rem', color: 'var(--muted)' }}>
            Select a book above to enable bulk actions.
          </p>
        )}
      </div>

      {/* ── Current config summary ── */}
      <div className="card" style={{ padding: '18px 24px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--muted)' }}>Current Live Config</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'Status',    value: siteControls?.freeBook?.enabled ? '🟢 Active' : '⚪ Disabled' },
            { label: 'Book',      value: siteControls?.freeBook?.bookTitle || '—' },
            { label: 'Book ID',   value: siteControls?.freeBook?.bookId    || '—' },
            { label: 'Last updated', value: siteControls?.freeBook?.updatedAt
                ? new Date(siteControls.freeBook.updatedAt).toLocaleString()
                : '—' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 12, fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--muted)', minWidth: 100 }}>{row.label}:</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
