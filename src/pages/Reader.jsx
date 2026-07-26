import { useParams, Link, useLocation } from 'react-router-dom';

import React, { useEffect, useState, useRef, useCallback } from 'react';

import { useApp } from '../context/AppContext';

import LanguageSwitcher from '../components/LanguageSwitcher';

import { useReadingProgress } from '../hooks/useReadingProgress';

import { doc, getDocFromCache, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase';

import { findBookBySlugOrId, bookPath, readPath } from '../utils/slugify';

import {

  findOfflineBook,

  saveBookOffline,

  removeOfflineBook,

  formatOfflineSize,

} from '../hooks/useOfflineBook';

import { downloadEhbookPack, ehbookSupported } from '../utils/ehbookPack';

import { getFallbackChapters } from '../data/bookChapters';

import AudioPlayer from '../components/AudioPlayer';
import { ErrorBoundary } from '../components/ErrorDisplay';
import EhbookImportZone from '../components/EhbookImportZone';

import {
  READING_FONTS,
  getReadingFontStack,
  getReaderDisplayPreferences,
  saveReaderDisplayPreferences,
  getUserReadingPreferences,
  updateUserReadingPreference,
} from '../utils/readingTime';

import './Reader.css';



/* ---------------------------------------------

   Google Drive URL converter

   Accepts any of these formats from the admin:

     https://drive.google.com/file/d/FILE_ID/view

     https://drive.google.com/file/d/FILE_ID/view?usp=sharing

     https://drive.google.com/open?id=FILE_ID

     https://drive.google.com/uc?export=download&id=FILE_ID

   Returns the embed URL:

     https://drive.google.com/file/d/FILE_ID/preview

   which renders the PDF inline — no download button visible,

   no raw URL exposed to the user.

--------------------------------------------- */

function toDriveEmbed(url) {

  if (!url) return null;

  try {

    // Already an embed URL

    if (url.includes('/preview')) return url.split('?')[0];



    // Extract file ID from /file/d/<ID>/

    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

    if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;



    // Extract from open?id= or uc?id=

    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (idMatch) return `https://drive.google.com/file/d/${idMatch[1]}/preview`;

  } catch {}

  return null;

}



/* ---------------------------------------------

   Main Reader Component

--------------------------------------------- */

export default function Reader() {

  const { id } = useParams();

  const location = useLocation();

  const { books, user, isOwned, isChapterOwned, library, myPerms, libLoaded, siteControls } = useApp();

  const catalogBook = findBookBySlugOrId(books, id);

  const readerRef = useRef(null);



  // Support deep-linking to a specific chapter from BookDetail TOC

  const initialChapter = location.state?.chapter ?? 0;



  const [chapter,   setChapter]   = useState(initialChapter);

  const [fontSize,  setFontSize]  = useState(() => {
    const d = getReaderDisplayPreferences();
    if (typeof d.fontSizePx === 'number') return d.fontSizePx;
    return 17;
  });

  const [fontFamilyId, setFontFamilyId] = useState(() => {
    const d = getReaderDisplayPreferences();
    return d.fontFamily || 'georgia';
  });

  const [lineHeightPref, setLineHeightPref] = useState(() => {
    const d = getReaderDisplayPreferences();
    return typeof d.lineHeight === 'number' ? d.lineHeight : 1.92;
  });

  const [zoom,      setZoom]      = useState(100);

  const [mode,      setMode]      = useState('pdf');

  const [drmBlock,  setDrmBlock]  = useState(false);

  const [resumeBanner, setResumeBanner] = useState(false);

  // These MUST be here (before any early return) — React requires all hooks

  // to be called unconditionally on every render (Rules of Hooks)

  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 900 : true);

  const [isMobileNav, setIsMobileNav] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 769 : false);

  // Gate modal — shown when guest tries to access chapter 2+

  const [chapterGate, setChapterGate] = useState(false);



  // -- Offline reading state -------------------------------------------------

  const [isOffline,       setIsOffline]       = useState(!navigator.onLine);

  const [offlineSaved,    setOfflineSaved]     = useState(false);

  const [offlineSaving,   setOfflineSaving]    = useState(false);

  const [ehbookBusy,      setEhbookBusy]       = useState(false);

  const [offlineSaveMsg,  setOfflineSaveMsg]   = useState('');

  const [offlineMsgTone,  setOfflineMsgTone]   = useState('ok'); // ok | err

  const [offlineChapters, setOfflineChapters]  = useState(null);

  const [offlineReady,    setOfflineReady]     = useState(false);

  const [offlineMeta,     setOfflineMeta]      = useState(null);



  // Listen for network changes

  useEffect(() => {

    const goOffline = () => setIsOffline(true);

    const goOnline  = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);

    window.addEventListener('online',  goOnline);

    return () => {

      window.removeEventListener('offline', goOffline);

      window.removeEventListener('online',  goOnline);

    };

  }, []);



  
  // Load reading display preferences (device + logged-in user)
  useEffect(() => {
    const device = getReaderDisplayPreferences();
    const userPrefs = user?.email ? getUserReadingPreferences(user.email) : null;
    const fontFamily = userPrefs?.fontFamily || device.fontFamily || 'georgia';
    const lineHeight = userPrefs?.lineHeight || device.lineHeight || 1.92;
    setFontFamilyId(fontFamily);
    setLineHeightPref(typeof lineHeight === 'number' ? lineHeight : 1.92);
    if (typeof device.fontSizePx === 'number') setFontSize(device.fontSizePx);
    else if (userPrefs?.fontSize) {
      const n = parseFloat(userPrefs.fontSize);
      if (!isNaN(n) && String(userPrefs.fontSize).includes('rem')) {
        setFontSize(Math.round(n * 17));
      }
    }
  }, [user?.email]);

  const persistDisplay = (partial) => {
    saveReaderDisplayPreferences(partial);
  };

  const changeFontSize = (next) => {
    setFontSize(next);
    persistDisplay({ fontSizePx: next });
  };

  const changeFontFamily = (id) => {
    setFontFamilyId(id);
    persistDisplay({ fontFamily: id });
    if (user?.email) updateUserReadingPreference(user.email, 'fontFamily', id);
  };

  // Load offline copy by URL id/slug — works even when catalog hasn't loaded yet
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.email || !id) {
        setOfflineReady(true);
        setOfflineSaved(false);
        setOfflineChapters(null);
        setOfflineMeta(null);
        return;
      }
      setOfflineReady(false);
      try {
        // Prefer catalog id when available; also resolve by slug from IndexedDB
        const cached =
          (catalogBook?.id ? await findOfflineBook(user.email, catalogBook.id) : null) ||
          (await findOfflineBook(user.email, id));
        if (cancelled) return;
        const ok = Array.isArray(cached?.chapters) && cached.chapters.length > 0;
        setOfflineSaved(ok);
        setOfflineChapters(ok ? cached.chapters : null);
        setOfflineMeta(ok ? cached : null);
      } catch {
        if (!cancelled) {
          setOfflineSaved(false);
          setOfflineChapters(null);
          setOfflineMeta(null);
        }
      } finally {
        if (!cancelled) setOfflineReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email, id, catalogBook?.id]);

  // Synthesize a minimal book from offline meta when the catalogue isn't available
  // (hard refresh / reopen while offline). Prefer live catalogue when present.
  const book = catalogBook || (offlineMeta?.bookId ? {
    id: offlineMeta.bookId,
    title: offlineMeta.title || 'Saved book',
    author: offlineMeta.author || '',
    cover: offlineMeta.cover || '',
    slug: offlineMeta.slug || '',
    _fromOfflineCache: true,
  } : null);

  // PDF / Drive won't load offline — keep readers in text (or listen) from cache
  useEffect(() => {
    if (isOffline && offlineSaved) {
      setMode((m) => (m === 'listen' ? 'listen' : 'text'));
    }
  }, [isOffline, offlineSaved]);



  // -- Chapters: serve from IndexedDB cache instantly, then live-update ------

  // Phase 1: getDocFromCache ? zero network latency, renders immediately

  // Phase 2: onSnapshot ? picks up admin edits in real-time, no page refresh needed

  const [liveChapters, setLiveChapters] = useState(null);

  useEffect(() => {

    if (!book?.id || book?._fromOfflineCache) return;

    const ref = doc(db, 'book_chapters', String(book.id));



    // Serve from IndexedDB cache first (instant — no network)

    getDocFromCache(ref)

      .then(snap => {

        if (snap.exists() && snap.data().chapters?.length > 0) {

          setLiveChapters(snap.data().chapters);

        }

      })

      .catch(() => {}); // cache miss is normal on first visit



    // Then subscribe for live updates (admin edits show immediately)

    const unsub = onSnapshot(ref, snap => {

      if (snap.exists() && snap.data().chapters?.length > 0) {

        setLiveChapters(snap.data().chapters);

      }

    }, () => {}); // silently fall back to getFallbackChapters on error



    return () => unsub();

  }, [book?.id, book?._fromOfflineCache]); // eslint-disable-line



  // -- Reading progress ------------------------------------------------------

  const { getProgress, saveProgress } = useReadingProgress(user?.email, book?.id);



  // Support deep-linking to a specific chapter — switch to text mode automatically

  useEffect(() => {

    if (location.state?.chapter !== undefined) {

      setMode('text');

    }

  // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []);



  // On mount, check for saved progress and offer to resume

  useEffect(() => {

    const saved = getProgress();

    if (saved && saved.chapter > 0) {

      setResumeBanner(true);

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [id]);



  const handleResume = () => {

    const saved = getProgress();

    if (saved) {

      setChapter(saved.chapter || 0);

      setMode('text');

    }

    setResumeBanner(false);

  };



  // Save progress when chapter changes (text mode)

  useEffect(() => {

    if (chapter > 0) saveProgress(chapter, 0);

    // ── Track chapter analytics ──────────────────────────────────────────
    if (user?.email && book?.id) {
      import('../utils/chapterAnalytics')
        .then(({ trackChapterRead }) => trackChapterRead(user.email, book.id, book.title, chapter))
        .catch(() => {});
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [chapter]);



  // Ownership check — uses Firestore-backed library state from AppContext

  const checkOwned = useCallback(() => {

    if (!user) return false;

    const owned = isOwned(book?.id ?? id);
    
    // Additional validation: ensure the owned book entry has unlock metadata
    if (owned) {
      const entry = library.find(x => x.id === (book?.id ?? id));
      // Warn if book is marked owned but lacks proper unlock data
      if (!entry?.downloadUnlocked && !entry?.unlockedAt) {
        console.warn('[Reader] Book marked owned but missing unlock metadata:', book?.id || id, entry);
      }
    }
    
    return owned;

  }, [user, isOwned, book?.id, id, library]);



  // Check if a specific chapter can be accessed (owned, free-preview ch0, or freeFirstChapter)

  const canAccessChapter = useCallback((chapterNum) => {

    if (checkOwned()) return true; // owns the full book

    // Chapter purchases are 1-based in the library
    if (book?.id && isChapterOwned?.(book.id, chapterNum + 1)) return true;

    // Chapter 0 is always free for free-preview books (no login needed)

    if (book?.status === 'free-preview' && chapterNum === 0) return true;

    // Explicit freeFirstChapter flag (ongoing series etc.)

    if (book?.freeFirstChapter && chapterNum === 0) return true;

    return false;

  }, [book?.status, book?.freeFirstChapter, book?.id, checkOwned, isChapterOwned]);



  // Get the owned book entry (includes driveUrl set at unlock time)

  const getOwnedBook = useCallback(() => {

    if (!user) return null;

    return library.find(x => x.id === (book?.id ?? id)) || null;

  }, [user, library, book?.id, id]);



  /* -- DRM: block right-click, copy, print on the reader element -- */

  useEffect(() => {

    const el = readerRef.current;

    if (!el || !user) return;



    const sc = siteControls || {};

    // Default all protections ON unless admin has explicitly disabled them

    const blockRC  = sc.disableRightClick          !== false;

    const blockCopy = sc.disableCopy               !== false;

    const blockKeys = sc.disableKeyboardShortcuts  !== false;



    const block = e => e.preventDefault();

    const blockKey = e => {

      if (!blockKeys) return;

      if (e.ctrlKey && ['c','a','s','p','u'].includes(e.key.toLowerCase())) e.preventDefault();

      if (e.key === 'F12' && sc.disableInspect !== false) e.preventDefault();

      if (e.ctrlKey && e.shiftKey && ['i','j'].includes(e.key.toLowerCase()) && sc.disableInspect !== false) e.preventDefault();

    };



    if (blockRC)   el.addEventListener('contextmenu', block);

    if (blockCopy) { el.addEventListener('copy', block); el.addEventListener('cut', block); el.addEventListener('dragstart', block); }

    document.addEventListener('keydown', blockKey);



    return () => {

      el.removeEventListener('contextmenu', block);

      el.removeEventListener('copy',        block);

      el.removeEventListener('cut',         block);

      el.removeEventListener('dragstart',   block);

      document.removeEventListener('keydown', blockKey);

    };

  }, [user?.id, siteControls]); // eslint-disable-line



  /* -- DRM: block print -- */

  useEffect(() => {

    if ((siteControls || {}).disablePrint === false) return; // admin disabled this protection

    const before = () => { setDrmBlock(true); };

    window.addEventListener('beforeprint', before);

    return () => window.removeEventListener('beforeprint', before);

  }, [siteControls]);



  // resize listener — must stay above early returns (Rules of Hooks)
  useEffect(() => {
    const fn = () => setIsMobileNav(window.innerWidth < 769);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  /* -- Gates -- */

  if (!book) {
    // Still resolving offline IndexedDB (refresh / reopen without catalogue)
    if (user && !offlineReady) {
      return (
        <div className="reader-error">
          <div style={{ fontSize:'2rem', marginBottom:16 }}>⏳</div>
          <p style={{ color:'var(--muted)' }}>Opening saved book…</p>
        </div>
      );
    }
    // Safety net: if id looks like a chapter ID (e.g. "9_ch_1"), redirect to the parent book
    const chapterIdMatch = id && typeof id === 'string' ? id.match(/^(.+)_ch_(\d+)$/) : null;
    if (chapterIdMatch) {
      const parentBookId = chapterIdMatch[1];
      const chapterNum   = parseInt(chapterIdMatch[2]);
      const parentBook   = findBookBySlugOrId(books, parentBookId);
      if (parentBook) {
        return (
          <div className="reader-error">
            <div className="reader-error__icon">📖</div>
            <h2>Opening chapter…</h2>
            <Link
              to={readPath(parentBook)}
              state={{ chapter: chapterNum - 1 }}
              className="btn btn-primary"
            >
              Open {parentBook.title} — Chapter {chapterNum}
            </Link>
          </div>
        );
      }
    }
    return (
      <div className="reader-error">
        <div className="reader-error__icon">📚</div>
        <h2>Book not found</h2>
        <p style={{ color:'var(--muted)', maxWidth:360, textAlign:'center' }}>
          {isOffline
            ? 'This title isn’t saved on this device. Reconnect and tap Save offline while reading.'
            : 'We couldn’t find this book. It may have been removed from the catalogue.'}
        </p>
        <Link to="/my-library" className="btn btn-primary">My Library</Link>
      </div>
    );
  }



  // Free first chapter is always accessible — guests AND logged-in users
  const isFreePreviewCh0 = (book?.status === 'free-preview' || book?.freeFirstChapter === true) && chapter === 0;

  if (!user && !isFreePreviewCh0) return (

    <div className="reader-error">

      <div className="reader-error__icon">🔐</div>

      <h2>Sign in to read</h2>

      <p>You need to be logged in to access this book.</p>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center', marginTop:12 }}>

        <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`} className="btn btn-primary">Sign In</Link>

        <Link to={`/register?returnTo=${encodeURIComponent(window.location.pathname)}`} className="btn btn-outline">Create Account</Link>

      </div>

    </div>

  );



  // Offline copy on this device is enough to keep reading after refresh / no network
  const hasOfflineAccess = offlineSaved && Array.isArray(offlineChapters) && offlineChapters.length > 0;

  if (!checkOwned() && !isFreePreviewCh0 && !canAccessChapter(chapter) && !hasOfflineAccess) {

    // Still waiting for library snapshot or offline cache lookup
    if (user && (!libLoaded || !offlineReady)) return (

      <div className="reader-error">

        <div style={{ fontSize:'2rem', marginBottom:16 }}>⏳</div>

        <p style={{ color:'var(--muted)' }}>Verifying access…</p>

      </div>

    );

    return (

      <div className="reader-error">

        <div className="reader-error__icon">🛒</div>

        <h2>Purchase required</h2>

        <p>Buy this book to unlock reading and download access.</p>

        <Link to={bookPath(book)} className="btn btn-primary">Buy — KSh {book.price}</Link>

      </div>

    );

  }



  // Free sample chapters stay readable even if online reading is restricted.
  // A copy already saved on this device remains readable (device-local cache).
  if (user && myPerms && myPerms.canReadOnline === false && !isFreePreviewCh0 && !hasOfflineAccess) return (

    <div className="reader-error">

      <div className="reader-error__icon">🚫</div>

      <h2>Reading Restricted</h2>

      <p>You don't have permission to read books online. Contact support.</p>

      <Link to="/my-library" className="btn btn-primary">My Library</Link>

    </div>

  );



  // Per-book deactivation check

  const ownedEntry = library.find(x => x.id === (book?.id ?? id));

  if (ownedEntry?.active === false || ownedEntry?.readDeactivated === true) {

    const reason = ownedEntry?.deactivationReason || 'Access to this book has been restricted by the administrator.';

    return (

      <div className="reader-error">

        <div className="reader-error__icon">🔒</div>

        <h2>Book Deactivated</h2>

        <p style={{ maxWidth:400, textAlign:'center' }}>{reason}</p>

        <Link to="/my-library" className="btn btn-primary">My Library</Link>

      </div>

    );

  }



  if (drmBlock) return (

    <div className="reader-error">

      <div className="reader-error__icon">🖨️</div>

      <h2>Printing not allowed</h2>

      <p>This content is protected. Printing and sharing are not permitted.</p>

      <button className="btn btn-ghost btn-sm" onClick={() => setDrmBlock(false)}>Continue Reading</button>

    </div>

  );



  const ownedBook = getOwnedBook();



  // Per-book admin deactivation check

  if (ownedBook?.readDeactivated === true) return (

    <div className="reader-error">

      <div className="reader-error__icon">🔒</div>

      <h2>Reading Access Restricted</h2>

      <p style={{ color:'var(--muted)', maxWidth:400, textAlign:'center' }}>

        Online reading for this book has been restricted on your account.

        {ownedBook.deactivationReason && <><br/><span style={{ fontStyle:'italic', marginTop:8, display:'block' }}>Reason: {ownedBook.deactivationReason}</span></>}

      </p>

      <Link to="/my-library" className="btn btn-primary" style={{ marginTop:8 }}>My Library</Link>

    </div>

  );

  const rawUrl     = ownedBook?.driveUrl || book.driveUrl || '';

  const embedUrl   = toDriveEmbed(rawUrl);

  const hasPdf     = !!embedUrl;

  // Chapters: prefer device cache when offline or when live hasn't arrived yet after refresh
  const chapters = (isOffline || book?._fromOfflineCache)
    ? (offlineChapters || liveChapters || getFallbackChapters(book))
    : (liveChapters || offlineChapters || getFallbackChapters(book));



  // -- Save for offline handler ----------------------------------------------

  const handleSaveOffline = async () => {

    if (!user?.email || !book?.id) return;

    if (!chapters?.length) {
      setOfflineMsgTone('err');
      setOfflineSaveMsg('Nothing to save yet — wait for chapters to load');
      setTimeout(() => setOfflineSaveMsg(''), 4000);
      return;
    }

    setOfflineSaving(true);

    setOfflineSaveMsg('');

    const result = await saveBookOffline(user.email, book.id, book, chapters);

    setOfflineSaving(false);

    if (result?.ok) {

      setOfflineSaved(true);

      setOfflineChapters(chapters);

      setOfflineMeta({
        bookId: book.id,
        title: book.title,
        chapterCount: result.count,
        approxBytes: result.approxBytes,
        savedAt: Date.now(),
      });

      setOfflineMsgTone('ok');

      setOfflineSaveMsg(
        `Saved on this device${result.count ? ` · ${result.count} chapters` : ''}${
          result.approxBytes ? ` · ${formatOfflineSize(result.approxBytes)}` : ''
        }`
      );

    } else {

      setOfflineMsgTone('err');

      setOfflineSaveMsg(
        result?.reason === 'quota'
          ? 'Storage full — remove an offline book in My Library, then try again'
          : 'Could not save offline. Please try again.'
      );

    }

    setTimeout(() => setOfflineSaveMsg(''), 5000);

  };



  const handleRemoveOffline = async () => {

    if (!user?.email || !book?.id) return;

    await removeOfflineBook(user.email, book.id);

    setOfflineSaved(false);

    setOfflineChapters(null);

    setOfflineMeta(null);

    setOfflineMsgTone('ok');

    setOfflineSaveMsg('Removed from this device');

    setTimeout(() => setOfflineSaveMsg(''), 3000);

  };

  /** Download encrypted .ehbook to device Files/Downloads — survives browser data clear */
  const handleDownloadEhbook = async () => {
    if (!user?.email || !book?.id) return;
    if (!ehbookSupported()) {
      setOfflineMsgTone('err');
      setOfflineSaveMsg('This browser can’t create keep-forever packs');
      setTimeout(() => setOfflineSaveMsg(''), 4000);
      return;
    }
    if (!chapters?.length) {
      setOfflineMsgTone('err');
      setOfflineSaveMsg('Wait for chapters to load, then try again');
      setTimeout(() => setOfflineSaveMsg(''), 4000);
      return;
    }
    setEhbookBusy(true);
    try {
      // Also refresh the quick offline cache
      await saveBookOffline(user.email, book.id, book, chapters);
      setOfflineSaved(true);
      setOfflineChapters(chapters);
      const result = await downloadEhbookPack(user.email, book, chapters, user.name || '');
      setOfflineMsgTone('ok');
      setOfflineSaveMsg(
        `Downloaded ${result.filename} · personal license only — won’t open if shared`
      );
    } catch (e) {
      setOfflineMsgTone('err');
      setOfflineSaveMsg(e?.message || 'Could not download pack');
    } finally {
      setEhbookBusy(false);
      setTimeout(() => setOfflineSaveMsg(''), 7000);
    }
  };



  // Download URL — uses Google Drive's export endpoint for direct PDF download

  const downloadUrl = rawUrl ? (() => {

    try {

      const fileMatch = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

      if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;

      const idMatch = rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

      if (idMatch) return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;

    } catch {}

    return null;

  })() : null;



  // Offline + saved: never force PDF/Drive (network). Listen still allowed.
  const viewMode = (isOffline && offlineSaved)
    ? (mode === 'listen' ? 'listen' : 'text')
    : (hasPdf ? mode : (mode === 'listen' ? 'listen' : 'text'));



  return (

    <div

      className={`reader reader--drm${(siteControls?.screenshotOverlay) ? ' reader--screenshot-overlay' : ''}${(siteControls?.disableSelect === false) ? ' reader--select-enabled' : ''}`}

      ref={readerRef}

    >



      {/* ── Chapter gate modal — shown when guest tries chapter 2+ ── */}

      {chapterGate && (

        <div

          style={{

            position:'fixed', inset:0, zIndex:9999,

            background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)',

            display:'flex', alignItems:'center', justifyContent:'center',

            padding:20,

          }}

          onClick={() => setChapterGate(false)}

        >

          <div

            style={{

              background:'var(--surface, #13132a)',

              border:'1px solid rgba(201,168,76,0.35)',

              borderRadius:16, padding:'32px 28px', maxWidth:420, width:'100%',

              textAlign:'center', boxShadow:'0 24px 80px rgba(0,0,0,0.7)',

            }}

            onClick={e => e.stopPropagation()}

          >

            {/* Lock icon */}

            <div style={{ fontSize:'3rem', marginBottom:12 }}>🔒</div>

            <h2 style={{ margin:'0 0 8px', fontSize:'1.25rem', color:'var(--text,#f0ece2)' }}>

              You've finished the free preview

            </h2>

            <p style={{ margin:'0 0 20px', fontSize:'0.9rem', color:'var(--muted,#8b8aa0)', lineHeight:1.6 }}>

              You've read the free first chapter of <strong style={{ color:'var(--gold,#c9a84c)' }}>{book?.title}</strong>.

              {' '}To continue reading, create a free account or log in and purchase the full book.

            </p>



            {/* Book price callout */}

            <div style={{

              display:'inline-flex', alignItems:'baseline', gap:4,

              background:'rgba(201,168,76,0.1)', border:'1px solid rgba(201,168,76,0.3)',

              borderRadius:8, padding:'8px 20px', marginBottom:20,

            }}>

              <small style={{ color:'var(--muted,#8b8aa0)', fontSize:'0.8rem' }}>KSh</small>

              <strong style={{ color:'var(--gold,#c9a84c)', fontSize:'1.5rem' }}>{book?.price}</strong>

              <small style={{ color:'var(--muted,#8b8aa0)', fontSize:'0.8rem' }}>full book</small>

            </div>



            {/* CTAs */}

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>

              <Link

                to={`/register?returnTo=${encodeURIComponent(bookPath(book))}`}

                className="btn btn-primary"

                style={{ width:'100%', padding:'12px', fontSize:'0.95rem', fontWeight:700 }}

              >

                Create Free Account & Buy

              </Link>

              <Link

                to={`/login?returnTo=${encodeURIComponent(bookPath(book))}`}

                className="btn btn-outline"

                style={{ width:'100%', padding:'12px', fontSize:'0.95rem' }}

              >

                Sign In

              </Link>

            </div>



            <p style={{ fontSize:'0.72rem', color:'var(--muted,#8b8aa0)', margin:0, opacity:0.7 }}>

              Free account · Instant access after payment · M-Pesa, Card, PayPal

            </p>

            <button

              onClick={() => setChapterGate(false)}

              style={{ background:'none', border:'none', color:'var(--muted,#8b8aa0)', fontSize:'0.75rem', marginTop:14, cursor:'pointer', textDecoration:'underline', padding:0 }}

            >

              Go back to free chapter

            </button>

          </div>

        </div>

      )}



      {/* -- Sidebar overlay (mobile) -- */}

      {sidebarOpen && (

        <div className="reader__sidebar-overlay" onClick={() => setSidebarOpen(false)} />

      )}



      {/* ------------------------------

          LEFT SIDEBAR — book info + TOC

      ------------------------------ */}

      <aside className={'reader__sidebar' + (sidebarOpen ? ' open' : '')}>

        {/* Close button (mobile) */}

        <button className="reader__sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>



        {/* Book cover */}

        {book.cover && (
          <div className="reader__sidebar-cover">
            <picture>
              {/\.png(\?|$)/i.test(book.cover) && (
                <source srcSet={book.cover.replace(/\.png(\?[^#]*)?/i, '.webp$1')} type="image/webp" />
              )}
              <img
                src={book.cover}
                alt={book.title}
                loading="lazy"
                decoding="async"
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  if (w > h) e.currentTarget.style.objectPosition = 'right center';
                }}
              />
            </picture>
          </div>
        )}



        {/* Title + author */}

        <div className="reader__sidebar-meta">

          <strong className="reader__sidebar-title">{book.title}</strong>

          <span className="reader__sidebar-author">{book.author}</span>

        </div>



        <div className="reader__sidebar-divider" />



        {/* Chapter list */}

        <nav className="reader__sidebar-nav">

          <div className="reader__sidebar-nav-label">{book.title.toLowerCase()}</div>

          {(() => {

            const ROMANS = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

            // Pre-compute roman numeral for each chapter index so render is pure

            let partCount = 0;

            const partNums = chapters.map(ch => {

              if (ch.part) { partCount++; return ROMANS[partCount] || String(partCount); }

              return null;

            });

            return chapters.map((ch, i) => (

              <React.Fragment key={i}>

                {ch.part && (

                  <div className="reader__sidebar-part">

                    <span className="reader__sidebar-part-num">{partNums[i]}</span>

                    <span className="reader__sidebar-part-text">{ch.part}</span>

                  </div>

                )}

                <button

                  className={'reader__sidebar-ch' + (i === chapter ? ' on' : '')}

                  onClick={() => {

                    if (!canAccessChapter(i)) {

                      setChapterGate(true);

                      return;

                    }

                    setChapter(i); window.scrollTo(0, 0); if (window.innerWidth < 768) setSidebarOpen(false);

                  }}

                >

                  {ch.title}

                </button>

              </React.Fragment>

            ));

          })()}

        </nav>

      </aside>



      {/* -- Main content wrapper (shifts right when sidebar open on desktop) -- */}

      <div className={'reader__main' + (sidebarOpen ? ' sidebar-open' : '')}>



      {/* -- Top navigation bar -- */}

      <div className={`reader__nav${isMobileNav ? ' reader__nav--wrap' : ''}`}>



        {isMobileNav ? (

          /* ---- MOBILE: Two-row layout ---- */

          <>

            {/* Row 1: toggle | back | title | offline badge */}

            <div className="reader__nav-row1">

              <button className="reader__sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle chapters">

                <span /><span /><span />

              </button>

              <Link to="/my-library" className="reader__back">← Library</Link>

              <div className="reader__info">

                <strong>{book.title}</strong>

              </div>

              {isOffline && (

                <span className="reader__offline-badge" title="You are offline — reading from local cache">📵</span>

              )}

            </div>



            {/* Row 2: offline save | mode toggle | font/zoom controls */}

            <div className="reader__nav-row2">

              {/* Offline save — keep status visible after refresh; allow remove while offline */}

              {(siteControls?.offlineEnabled !== false) && (offlineSaved || (!isOffline && chapters?.length > 0)) && (

                <>
                {offlineSaved ? (

                  <button

                    className="reader__offline-btn reader__offline-btn--saved"

                    title={offlineMeta?.savedAt
                      ? `Saved on this device · ${new Date(offlineMeta.savedAt).toLocaleDateString('en-KE')}`
                      : 'Saved on this device — tap to remove'}

                    onClick={handleRemoveOffline}

                  >Saved · Remove</button>

                ) : (

                  <button

                    className="reader__offline-btn"

                    title="Save chapters on this device so you can keep reading after refresh or without internet"

                    onClick={handleSaveOffline}

                    disabled={offlineSaving}

                    aria-busy={offlineSaving}

                  >{offlineSaving ? 'Saving…' : 'Save offline'}</button>

                )}
                {!isOffline && chapters?.length > 0 && (
                  <button
                    className="reader__offline-btn reader__offline-btn--pack"
                    title="Download an encrypted .ehbook file to your device — survives clearing browser data"
                    onClick={handleDownloadEhbook}
                    disabled={ehbookBusy}
                    aria-busy={ehbookBusy}
                  >{ehbookBusy ? 'Packing…' : 'Keep forever'}</button>
                )}
                </>

              )}



              {/* Mode toggle */}

              <div className="reader__mode-toggle">

                <button className={'reader__mode-btn' + (viewMode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>📖 Read</button>

                <button className={'reader__mode-btn reader__mode-btn--listen' + (mode === 'listen' ? ' on' : '')} onClick={() => setMode('listen')}>🎧 Listen</button>

              </div>



              {/* Zoom / font size */}

              {(viewMode === 'text' || viewMode === 'listen') && (

                <div className="reader__zoom-group">

                  <button className="reader__font-btn" onClick={() => changeFontSize(Math.max(13, fontSize - 1))}>A-</button>

                  <span className="reader__zoom-label">{fontSize}px</span>

                  <button className="reader__font-btn" onClick={() => changeFontSize(Math.min(26, fontSize + 1))}>A+</button>
                  <select
                    className="reader__font-select"
                    value={fontFamilyId}
                    onChange={(e) => changeFontFamily(e.target.value)}
                    title="Reading font"
                    aria-label="Reading font"
                  >
                    {READING_FONTS.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>


                </div>

              )}

            </div>

          </>

        ) : (

          /* ---- DESKTOP/TABLET: Single-row layout ---- */

          <>

            <button className="reader__sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle chapters">

              <span /><span /><span />

            </button>

            <Link to="/my-library" className="reader__back">← My Library</Link>

            <div className="reader__info">

              <strong>{book.title}</strong>

              <span>by {book.author}</span>

            </div>

            <div className="reader__nav-right">

              {isOffline && (

                <span className="reader__offline-badge" title="You are offline — reading from local cache">

                  📵 Offline

                </span>

              )}

              {(siteControls?.offlineEnabled !== false) && (offlineSaved || (!isOffline && chapters?.length > 0)) && (

                <>
                {offlineSaved ? (

                  <button

                    className="reader__offline-btn reader__offline-btn--saved"

                    title={offlineMeta?.savedAt
                      ? `Saved on this device · ${new Date(offlineMeta.savedAt).toLocaleDateString('en-KE')} — tap to remove`
                      : 'Saved on this device — tap to remove'}

                    onClick={handleRemoveOffline}

                  >Saved · Remove</button>

                ) : (

                  <button

                    className="reader__offline-btn"

                    title="Save chapters on this device so you can keep reading after refresh or without internet"

                    onClick={handleSaveOffline}

                    disabled={offlineSaving}

                    aria-busy={offlineSaving}

                  >{offlineSaving ? 'Saving…' : 'Save offline'}</button>

                )}
                {!isOffline && chapters?.length > 0 && (
                  <button
                    className="reader__offline-btn reader__offline-btn--pack"
                    title="Download an encrypted .ehbook file to your device — survives clearing browser data"
                    onClick={handleDownloadEhbook}
                    disabled={ehbookBusy}
                    aria-busy={ehbookBusy}
                  >{ehbookBusy ? 'Packing…' : 'Keep forever'}</button>
                )}
                </>

              )}

              {offlineSaveMsg && (

                <span
                  className={`reader__offline-toast${offlineMsgTone === 'err' ? ' reader__offline-toast--err' : ''}`}
                  role="status"
                >{offlineSaveMsg}</span>

              )}

              {/* Mode toggle — PDF + Text + Listen */}

              <div className="reader__mode-toggle">

                <button className={'reader__mode-btn' + (viewMode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>📖 Read</button>

                <button className={'reader__mode-btn reader__mode-btn--listen' + (mode === 'listen' ? ' on' : '')} onClick={() => setMode('listen')}>🎧 Listen</button>

              </div>

              {(viewMode === 'text' || viewMode === 'listen') && (

                <div className="reader__zoom-group">

                  <button className="reader__font-btn" onClick={() => changeFontSize(Math.max(13, fontSize - 1))} title="Smaller text">A-</button>

                  <span className="reader__zoom-label">{fontSize}px</span>

                  <button className="reader__font-btn" onClick={() => changeFontSize(Math.min(26, fontSize + 1))} title="Larger text">A+</button>
                  <select
                    className="reader__font-select"
                    value={fontFamilyId}
                    onChange={(e) => changeFontFamily(e.target.value)}
                    title="Reading font"
                    aria-label="Reading font"
                  >
                    {READING_FONTS.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>


                </div>

              )}

            </div>

          </>

        )}

      </div>



      {/* -- Offline reading banner -- */}

      {isOffline && offlineSaved && (

        <div className="reader__offline-banner reader__offline-banner--ok" role="status">

          <span aria-hidden="true">✓</span>

          <span>Reading from this device — no internet needed. Your place is kept after refresh.</span>

        </div>

      )}

      {isOffline && !offlineSaved && offlineReady && (

        <div className="reader__offline-banner reader__offline-banner--warn" role="status">

          <span aria-hidden="true">!</span>

          <span>
            You’re offline and this book isn’t on this device.
            If you have a <strong>.ehbook</strong> file, go to My Library → Downloaded and import it.
            Otherwise reconnect and tap <strong>Keep forever</strong>.
          </span>

        </div>

      )}

      {!isOffline && (siteControls?.offlineEnabled !== false) && user?.email && (
        <div className="reader__ehbook-bar">
          <EhbookImportZone
            userEmail={user.email}
            compact
            onImported={async (pack) => {
              if (String(pack.bookId) === String(book.id)) {
                setOfflineSaved(true);
                setOfflineChapters(pack.chapters);
                setOfflineMeta({
                  bookId: pack.bookId,
                  title: pack.title,
                  chapterCount: pack.chapterCount,
                  savedAt: Date.now(),
                });
                setOfflineMsgTone('ok');
                setOfflineSaveMsg(`Imported “${pack.title}” — ready offline`);
                setTimeout(() => setOfflineSaveMsg(''), 5000);
              }
            }}
          />
        </div>
      )}



      {/* -- Resume reading banner -- */}

      {resumeBanner && (

        <div style={{

          display: 'flex', alignItems: 'center', gap: 12,

          padding: '10px 18px',

          background: 'rgba(201,168,76,0.12)',

          borderBottom: '1px solid rgba(201,168,76,0.25)',

          fontSize: '0.85rem', flexWrap: 'wrap',

        }}>

          <span style={{ color: 'var(--gold)' }}>📖 You were reading this book. Resume where you left off?</span>

          <button

            className="btn btn-primary btn-sm"

            style={{ padding: '4px 14px', fontSize: '0.78rem' }}

            onClick={handleResume}

          >

            Resume

          </button>

          <button

            className="btn btn-ghost btn-sm"

            style={{ padding: '4px 10px', fontSize: '0.78rem' }}

            onClick={() => setResumeBanner(false)}

          >

            Start from beginning

          </button>

        </div>

      )}



      {/* -- Watermark strip -- */}

      {user && (<div className="reader__watermark">
        &bull;<strong>{user?.name || "Guest"}</strong> &bull; {user?.email || ""} &mdash; Personal use only. Sharing or redistribution is prohibited.
      </div>)}



      {/* ------------------------------

          PDF EMBED MODE

          Google Drive renders the PDF

          inside an iframe on our page.

          User sees the book, not the URL.

      ------------------------------ */}



      {/* ------------------------------

          TEXT / CHAPTER MODE

          Fallback when no PDF, or user

          switches to text view.

      ------------------------------ */}

      {viewMode === 'text' && (

        <div className="reader__body">

          <div className="reader__page reader__page--drm">



            {/* Ghost watermark tiled in background */}

            <div className="reader__ghost-wm" aria-hidden="true">

              {Array.from({ length: 24 }).map((_, i) => (

                <span key={i}>{user?.name || "Guest"} — Ellines Haven — {user?.email || ""}</span>

              ))}

            </div>



            {chapters[chapter]?.part && (

              <div className="reader__part">

                <span className="reader__part-label">{chapters[chapter].part}</span>

              </div>

            )}

            <h2 className="reader__chapter">{chapters[chapter]?.title}</h2>

            {chapters[chapter]?.subtitle && (

              <p className="reader__chapter-sub">{chapters[chapter].subtitle}</p>

            )}



            <div className="reader__text" style={{ fontSize: fontSize + 'px', fontFamily: getReadingFontStack(fontFamilyId), lineHeight: lineHeightPref }}>

              {(() => {

                const align = chapters[chapter]?.textAlign || 'justify';

                const isNonJustify = align !== 'justify';

                const nonJustifyStyle = { textAlign: align, hyphens: 'none', textIndent: 0 };



                // Split on blank lines (paragraph breaks). Single \n = soft wrap, stay in same para.

                const rawParas = (chapters[chapter]?.text || '')

                  .split(/\n{2,}/)

                  .map(p => p.replace(/\n/g, ' ').trim())

                  .filter(p => p.length > 0);



                return rawParas.map((p, i) => {

                  // Scene break lines — render as a centred ornament

                  if (/^(\*{1,3}|…{1,3}|-{3,}|#{1,3}|\u2605|\u00b7{1,3})$/.test(p)) {

                    return (

                      <p key={i} style={{ textAlign: 'center', textIndent: 0, margin: '1.4em 0', color: '#c9a84c', letterSpacing: '0.3em', fontSize: '0.85em' }}>

                        · · ·

                      </p>

                    );

                  }

                  return (

                    <p key={i} style={isNonJustify ? nonJustifyStyle : undefined}>{p}</p>

                  );

                });

              })()}

            </div>



            {/* Inline licence watermark */}

            <p className="reader__inline-mark" aria-hidden="true">

              &bull; <strong>{user?.name || "Guest"}</strong> &bull; {user?.email || ""}

            </p>



            {/* Chapter navigation */}

            <div className="reader__page-nav">

              {chapter > 0 && (

                <button className="btn btn-ghost btn-sm" onClick={() => { setChapter(c => c - 1); window.scrollTo(0, 0); }}>

                  ← Previous

                </button>

              )}

              {chapter < chapters.length - 1 && (

                <button className="btn btn-primary btn-sm" style={{ marginLeft:'auto' }}

                  onClick={() => {

                    const nextCh = chapter + 1;

                    if (!canAccessChapter(nextCh)) {

                      setChapterGate(true);

                      return;

                    }

                    setChapter(nextCh); window.scrollTo(0, 0);

                  }}>

                  Next →

                </button>

              )}

            </div>



            {/* End-of-chapter marker — auto-generates from chapter data, admin-editable */}

            <div className="reader__end">

              <p>{chapters[chapter]?.endMessage || `— End of Chapter ${chapter + 1} —`}</p>

              {chapter < chapters.length - 1 && (

                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}

                  onClick={() => {

                    const nextCh = chapter + 1;

                    if (!canAccessChapter(nextCh)) {

                      setChapterGate(true);

                      return;

                    }

                    setChapter(nextCh); window.scrollTo(0, 0);

                  }}>

                  Continue to Chapter {chapter + 2} →

                </button>

              )}

            </div>

          </div>

        </div>

      )}



      {/* ------------------------------

          LISTEN MODE

          Text-to-speech audio player

          + text display for follow-along

      ------------------------------ */}

      {viewMode === 'listen' && (

        <div className="reader__body">

          <div className="reader__page reader__page--drm">



            {/* Ghost watermark */}

            <div className="reader__ghost-wm" aria-hidden="true">

              {Array.from({ length: 24 }).map((_, i) => (

                <span key={i}>{user?.name || "Guest"} — Ellines Haven — {user?.email || ""}</span>

              ))}

            </div>



            {/* Floating listen dock — isolated so a player bug never blanks the chapter */}
            <ErrorBoundary
              fallback={(
                <div className="listen-dock listen-dock--normal" style={{ right: 16, bottom: 96, left: 'auto', top: 'auto' }}>
                  <div className="listen-dock__chrome">
                    <span className="listen-dock__brand">Listen</span>
                  </div>
                  <p className="listen-dock__unsupported">Listen player failed to load in this browser.</p>
                  <div style={{ padding: '0 16px 14px' }}>
                    <button type="button" className="btn btn-primary" onClick={() => setMode('text')}>Back to Read</button>
                  </div>
                </div>
              )}
            >
              <AudioPlayer
                chapters={chapters}
                currentChapter={chapter}
                canAccessChapter={canAccessChapter}
                onChapterBlocked={() => setChapterGate(true)}
                onChapterChange={ch => { setChapter(ch); window.scrollTo(0, 0); }}
                onClose={() => setMode('text')}
              />
            </ErrorBoundary>



            {chapters[chapter]?.part && (

              <div className="reader__part">

                <span className="reader__part-label">{chapters[chapter].part}</span>

              </div>

            )}

            <h2 className="reader__chapter">{chapters[chapter]?.title}</h2>

            {chapters[chapter]?.subtitle && (

              <p className="reader__chapter-sub">{chapters[chapter].subtitle}</p>

            )}



            {/* Follow-along text */}

            <div className="reader__text reader__text--listen" style={{ fontSize: fontSize + 'px', fontFamily: getReadingFontStack(fontFamilyId), lineHeight: lineHeightPref }}>

              {(() => {

                const align = chapters[chapter]?.textAlign || 'justify';

                const isNonJustify = align !== 'justify';

                const nonJustifyStyle = { textAlign: align, hyphens: 'none', textIndent: 0 };



                const rawParas = (chapters[chapter]?.text || '')

                  .split(/\n{2,}/)

                  .map(p => p.replace(/\n/g, ' ').trim())

                  .filter(p => p.length > 0);



                return rawParas.map((p, i) => {

                  if (/^(\*{1,3}|…{1,3}|-{3,}|#{1,3}|\u2605|\u00b7{1,3})$/.test(p)) {

                    return (

                      <p key={i} style={{ textAlign: 'center', textIndent: 0, margin: '1.4em 0', color: '#c9a84c', letterSpacing: '0.3em', fontSize: '0.85em' }}>

                        · · ·

                      </p>

                    );

                  }

                  return (

                    <p key={i} style={isNonJustify ? nonJustifyStyle : undefined}>{p}</p>

                  );

                });

              })()}

            </div>



            <p className="reader__inline-mark" aria-hidden="true">

              &bull; <strong>{user?.name || "Guest"}</strong> &bull; {user?.email || ""}

            </p>



            <div className="reader__page-nav">

              {chapter > 0 && (

                <button className="btn btn-ghost btn-sm" onClick={() => { setChapter(c => c - 1); window.scrollTo(0, 0); }}>

                  ← Previous

                </button>

              )}

              {chapter < chapters.length - 1 && (

                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}

                  onClick={() => {

                    const nextCh = chapter + 1;

                    if (!canAccessChapter(nextCh)) {

                      setChapterGate(true);

                      return;

                    }

                    setChapter(nextCh); window.scrollTo(0, 0);

                  }}>

                  Next →

                </button>

              )}

            </div>



            {/* End-of-chapter marker for listen mode */}

            <div className="reader__end">

              <p>{chapters[chapter]?.endMessage || `— End of Chapter ${chapter + 1} —`}</p>

              {chapter < chapters.length - 1 && (

                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}

                  onClick={() => {

                    const nextCh = chapter + 1;

                    if (!canAccessChapter(nextCh)) {

                      setChapterGate(true);

                      return;

                    }

                    setChapter(nextCh); window.scrollTo(0, 0);

                  }}>

                  Continue to Chapter {chapter + 2} →

                </button>

              )}

            </div>

          </div>

        </div>

      )}

      </div>{/* end reader__main */}

    </div>

  );

}


