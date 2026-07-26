/**
 * Universal .ehbook import control — works in every modern browser via <input type="file">.
 */
import { useRef, useState } from 'react';
import { importEhbookPack, ehbookSupported } from '../utils/ehbookPack';
import { saveBookOffline } from '../hooks/useOfflineBook';

export default function EhbookImportZone({
  userEmail,
  onImported,
  compact = false,
  className = '',
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tone, setTone] = useState('ok');

  if (!ehbookSupported()) {
    return (
      <p className={`ehbook-import__note ${className}`}>
        This browser can’t import secure book packs. Try Chrome, Edge, Firefox, or Safari.
      </p>
    );
  }

  const handleFile = async (file) => {
    if (!file || !userEmail) return;
    setBusy(true);
    setMsg('');
    try {
      const pack = await importEhbookPack(file, userEmail);
      const result = await saveBookOffline(
        userEmail,
        pack.bookId,
        {
          id: pack.bookId,
          title: pack.title,
          author: pack.author,
          cover: pack.cover,
          slug: pack.slug,
        },
        pack.chapters
      );
      if (!result?.ok) {
        throw new Error(
          result?.reason === 'quota'
            ? 'Storage full — remove an offline book, then import again.'
            : 'Import unlocked the pack but saving failed. Try again.'
        );
      }
      setTone('ok');
      setMsg(`Imported “${pack.title}” · ${pack.chapterCount} chapters — ready to read offline.`);
      onImported?.(pack);
    } catch (e) {
      setTone('err');
      setMsg(e?.message || 'Import failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      setTimeout(() => setMsg(''), 6000);
    }
  };

  return (
    <div className={`ehbook-import ${compact ? 'ehbook-import--compact' : ''} ${className}`}>
      {!compact && (
        <div className="ehbook-import__copy">
          <strong>Keep-forever packs</strong>
          <p>
            Download a <code>.ehbook</code> file to your phone or computer. It survives clearing
            browser data — import it anytime while signed in to the same account.
          </p>
        </div>
      )}
      <div className="ehbook-import__actions">
        <input
          ref={inputRef}
          type="file"
          accept=".ehbook,application/json,application/octet-stream"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm ehbook-import__btn"
          disabled={busy || !userEmail}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Importing…' : 'Import .ehbook'}
        </button>
        {compact && (
          <span className="ehbook-import__hint">Restores a pack after browser clean</span>
        )}
      </div>
      {msg && (
        <p className={`ehbook-import__msg${tone === 'err' ? ' ehbook-import__msg--err' : ''}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
