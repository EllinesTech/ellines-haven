import { useParams, Link } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import './Reader.css';

/* ─────────────────────────────────────────────
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
───────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   Fallback chapter content (shown when no
   Google Drive PDF has been uploaded yet)
───────────────────────────────────────────── */
const FALLBACK_CONTENT = {
  '1': [
    { title:'Chapter 1 — The Agreement', text:`The lobola negotiations had gone on for three days. By the end of the third evening, when the men shook hands across the low table in the sitting room, everyone agreed it had been handled well.\n\nExcept Zawadi.\n\nShe stood in the kitchen doorway and watched her father pour a second round of muratina, and she thought about the word "handled." Like she was a transaction. Like her whole life was a column of figures that balanced to someone's satisfaction.\n\n"You should be proud," her aunt told her later, helping to clear the cups. "A man who negotiates like that loves you properly."\n\nZawadi smiled. She had learned that smile many years ago — the one that kept the peace, the one that closed conversations, the one that looked like agreement from the outside while everything inside continued at its own pace.`},
    { title:'Chapter 2 — Six Months In', text:`Marriage, Zawadi discovered, was a series of small negotiations no one had prepared her for.\n\nNot the big ones — who paid which bill, whose family came for Christmas, whether to have children now or later. Those she had anticipated. She had answers ready, positions prepared, compromises pre-calculated.\n\nIt was the small ones that undid her.\n\nWho slept on which side of the bed. Whether the lights stayed on or off when they talked late. How long a silence could last before it became an argument.\n\nSix months in, she was still learning the grammar of this new country she lived in. The country called marriage.`},
  ],
  '2': [
    { title:'Chapter 1 — The Weight', text:`Pain is not dramatic. That is the first lie they tell you.\n\nIn films, pain arrives with music — low strings, a single piano note, rain against a window. In real life, it arrives in the middle of an ordinary Tuesday. While you are making tea. While you are answering an email.\n\nKamau's Tuesday was a Wednesday, actually. The ninth of August. He had been up since five, the way he always was, because the body remembers its own rhythms even when everything else forgets them.\n\nHe had made the tea. He had opened the curtains. He had sat down at the table with the intention of working.\n\nThen the phone rang.`},
  ],
  '11': [
    { title:'Day 1 — The Call', text:`Nineteen days. That is all it took.\n\nKe did not know, on the morning of the first day, that everything was about to change. He was standing at the window of his apartment, watching the early Nairobi traffic crawl below, coffee cup in hand, the same Tuesday routine he had maintained for three years.\n\nThen his phone rang.\n\nHe did not recognise the number. He almost did not answer. Later, he would think about that — how close he came to letting it ring out, to going on with his ordinary Tuesday, to never knowing.\n\nBut he answered.`},
    { title:'Day 3 — The Decision', text:`By the third day, Ke understood that there was no going back.\n\nThe choice that had been placed before him was not the kind you could unmake. It was the kind that sat in your chest and rearranged things — quietly, permanently, without asking permission.\n\nHe had not slept. He had walked the city instead. Seven hours through streets he had known his whole life, seeing them differently, as if the news had changed the light.\n\nNairobi had never looked so much like itself. Raw and complicated and full of a beauty that only showed up when you were paying the kind of attention that came with loss.`},
    { title:'Day 7 — The Truth', text:`On the seventh day, the truth arrived in the form of a letter.\n\nNot a message. Not an email. An actual letter, handwritten, slid under his door at some point between midnight and six in the morning.\n\nKe read it three times. The first time for facts. The second time for meaning. The third time because he could not believe what the first two times had told him.\n\nSomeone had known. Someone had always known. And they had chosen, for seven years, to say nothing.\n\nThe question was no longer what had happened. The question was why.`},
  ],
};

function getFallbackChapters(book) {
  // 1. Use chapters stored on the book by admin (highest priority)
  if (book?.chapters && book.chapters.length > 0) {
    return book.chapters;
  }
  // 2. Hardcoded sample chapters for specific books
  if (FALLBACK_CONTENT[book?.id]) {
    return FALLBACK_CONTENT[book.id];
  }
  // 3. Generic placeholder
  return [
    { title:'Chapter 1', text:`This is a work by Elijah Mwangi M, published exclusively through Ellines Haven.\n\nThank you for purchasing this book. The full content will be available to read here or download as a PDF once uploaded by the author.\n\nIf you have any questions, contact us via WhatsApp: 0748 255 466.`}
  ];
}

/* ─────────────────────────────────────────────
   Main Reader Component
───────────────────────────────────────────── */
export default function Reader() {
  const { id } = useParams();
  const { books, user, isOwned, library, myPerms, libLoaded } = useApp();
  const book = books.find(b => b.id === id);
  const readerRef = useRef(null);

  const [chapter,   setChapter]   = useState(0);
  const [fontSize,  setFontSize]  = useState(17);
  const [zoom,      setZoom]      = useState(100);
  const [mode,      setMode]      = useState('pdf');
  const [drmBlock,  setDrmBlock]  = useState(false);

  // Ownership check — uses Firestore-backed library state from AppContext
  const checkOwned = useCallback(() => {
    if (!user) return false;
    return isOwned(id);
  }, [user, isOwned, id]);

  // Get the owned book entry (includes driveUrl set at unlock time)
  const getOwnedBook = useCallback(() => {
    if (!user) return null;
    return library.find(x => x.id === id) || null;
  }, [user, library, id]);

  /* ── DRM: block right-click, copy, print on the reader element ── */
  useEffect(() => {
    const el = readerRef.current;
    if (!el || !user) return;
    const block = e => e.preventDefault();
    const blockKey = e => {
      if (e.ctrlKey && ['c','a','s','p','u'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
      if (e.ctrlKey && e.shiftKey && ['i','j'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    el.addEventListener('contextmenu', block);
    el.addEventListener('copy',        block);
    el.addEventListener('cut',         block);
    el.addEventListener('dragstart',   block);
    document.addEventListener('keydown', blockKey);
    return () => {
      el.removeEventListener('contextmenu', block);
      el.removeEventListener('copy',        block);
      el.removeEventListener('cut',         block);
      el.removeEventListener('dragstart',   block);
      document.removeEventListener('keydown', blockKey);
    };
  }, [user?.id]);

  /* ── DRM: block print ── */
  useEffect(() => {
    const before = () => { setDrmBlock(true); };
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, []);

  /* ── Gates ── */
  if (!book) return (
    <div className="reader-error">
      <div className="reader-error__icon">📚</div>
      <h2>Book not found</h2>
      <Link to="/library" className="btn btn-primary">Back to Library</Link>
    </div>
  );

  if (!user) return (
    <div className="reader-error">
      <div className="reader-error__icon">🔒</div>
      <h2>Sign in to read</h2>
      <p>You need to be logged in to access this book.</p>
      <Link to="/login" className="btn btn-primary">Sign In</Link>
    </div>
  );

  if (!checkOwned()) {
    // Still waiting for Firestore library snapshot — show loading briefly
    if (!libLoaded) return (
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
        <Link to={`/book/${book.id}`} className="btn btn-primary">Buy — KSh {book.price}</Link>
      </div>
    );
  }

  if (user && myPerms && myPerms.canReadOnline === false) return (
    <div className="reader-error">
      <div className="reader-error__icon">🔒</div>
      <h2>Reading Restricted</h2>
      <p>You don't have permission to read books online. Contact support.</p>
      <Link to="/my-library" className="btn btn-primary">My Library</Link>
    </div>
  );

  // Per-book deactivation check
  const ownedEntry = library.find(x => x.id === id);
  if (ownedEntry?.active === false || ownedEntry?.readDeactivated === true) {
    const reason = ownedEntry?.deactivationReason || 'Access to this book has been restricted by the administrator.';
    return (
      <div className="reader-error">
        <div className="reader-error__icon">⚠️</div>
        <h2>Book Deactivated</h2>
        <p style={{ maxWidth:400, textAlign:'center' }}>{reason}</p>
        <Link to="/my-library" className="btn btn-primary">My Library</Link>
      </div>
    );
  }

  if (drmBlock) return (
    <div className="reader-error">
      <div className="reader-error__icon">⛔</div>
      <h2>Printing not allowed</h2>
      <p>This content is protected. Printing and sharing are not permitted.</p>
      <button className="btn btn-ghost btn-sm" onClick={() => setDrmBlock(false)}>Continue Reading</button>
    </div>
  );

  const ownedBook = getOwnedBook();

  // Per-book admin deactivation check
  if (ownedBook?.readDeactivated === true) return (
    <div className="reader-error">
      <div className="reader-error__icon">⛔</div>
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
  const chapters   = getFallbackChapters(book);

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

  const viewMode   = hasPdf ? mode : 'text';

  return (
    <div className="reader reader--drm" ref={readerRef}>

      {/* ── Top navigation bar ── */}
      <div className="reader__nav">
        <Link to="/my-library" className="reader__back">← My Library</Link>

        <div className="reader__info">
          <strong>{book.title}</strong>
          <span>by {book.author}</span>
        </div>

        <div className="reader__nav-right">
          {/* Download button — only shows when PDF is available */}
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="reader__font-btn"
              style={{padding:'4px 12px',fontSize:'0.78rem',background:'rgba(201,168,76,0.12)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:'var(--r-sm)',color:'var(--gold)',textDecoration:'none'}}
              title="Download PDF"
            >
              Download PDF
            </a>
          )}
          {/* Mode toggle — only show if PDF exists */}
          {hasPdf && (
            <div className="reader__mode-toggle">
              <button className={'reader__mode-btn' + (viewMode === 'pdf'  ? ' on' : '')} onClick={() => setMode('pdf')}>
                📄 PDF View
              </button>
              <button className={'reader__mode-btn' + (viewMode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>
                📖 Text View
              </button>
            </div>
          )}

          {/* Zoom controls — PDF mode */}
          {viewMode === 'pdf' && hasPdf && (
            <div className="reader__zoom-group">
              <button className="reader__font-btn" onClick={() => setZoom(z => Math.max(50, z - 10))} title="Zoom out">−</button>
              <span className="reader__zoom-label">{zoom}%</span>
              <button className="reader__font-btn" onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in">+</button>
              <button className="reader__font-btn" onClick={() => setZoom(100)} title="Reset zoom" style={{fontSize:'0.7rem'}}>↺</button>
            </div>
          )}

          {/* Font size — text mode */}
          {viewMode === 'text' && (
            <div className="reader__zoom-group">
              <button className="reader__font-btn" onClick={() => setFontSize(s => Math.max(13, s - 1))} title="Smaller text">A−</button>
              <span className="reader__zoom-label">{fontSize}px</span>
              <button className="reader__font-btn" onClick={() => setFontSize(s => Math.min(26, s + 1))} title="Larger text">A+</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Watermark strip ── */}
      <div className="reader__watermark">
        🔒 Licensed to <strong>{user.name}</strong> ({user.email}) — Personal use only. Sharing or redistribution is prohibited.
      </div>

      {/* ══════════════════════════════
          PDF EMBED MODE
          Google Drive renders the PDF
          inside an iframe on our page.
          User sees the book, not the URL.
      ══════════════════════════════ */}
      {viewMode === 'pdf' && hasPdf && (
        <div className="reader__pdf-wrap">

          {/* Invisible overlay blocks right-click on the iframe */}
          <div className="reader__pdf-shield" onContextMenu={e => e.preventDefault()} />

          {/* Ghost watermark tiles visible over the PDF */}
          <div className="reader__pdf-wm" aria-hidden="true">
            {Array.from({ length: 30 }).map((_, i) => (
              <span key={i}>{user.name} · {user.email} · Ellines Haven</span>
            ))}
          </div>

          {/* The actual PDF viewer — Google Drive embed, toolbar hidden */}
          <div
            className="reader__pdf-zoom-wrap"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              width: `${10000 / zoom}%`,
              marginLeft: `${(100 - 10000 / zoom) / 2}%`,
            }}
          >
            <iframe
              src={embedUrl + '?embedded=true#toolbar=0&navpanes=0&scrollbar=1'}
              className="reader__pdf-frame"
              title={book.title}
              allow="autoplay"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>

          {/* Bottom licence note */}
          <div className="reader__pdf-footer">
            © {new Date().getFullYear()} Ellines Haven · This copy is licensed to {user.name} · Redistribution is prohibited
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          TEXT / CHAPTER MODE
          Fallback when no PDF, or user
          switches to text view.
      ══════════════════════════════ */}
      {viewMode === 'text' && (
        <div className="reader__body">
          <div className="reader__page reader__page--drm">

            {/* Ghost watermark tiled in background */}
            <div className="reader__ghost-wm" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i}>{user.name} · Ellines Haven · {user.email}</span>
              ))}
            </div>

            <h1 className="reader__title">{book.title}</h1>
            <p className="reader__by">by {book.author} · Ellines Haven</p>
            <div className="reader__divider" />

            {/* Chapter tabs */}
            {chapters.length > 1 && (
              <div className="reader__ch-tabs">
                {chapters.map((ch, i) => (
                  <button key={i} className={'reader__ch-btn' + (i === chapter ? ' on' : '')}
                    onClick={() => { setChapter(i); window.scrollTo(0, 0); }}>
                    {ch.title}
                  </button>
                ))}
              </div>
            )}

            <h2 className="reader__chapter">{chapters[chapter]?.title}</h2>

            <div className="reader__text" style={{ fontSize: fontSize + 'px' }}>
              {(chapters[chapter]?.text || '').split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {/* Inline licence watermark */}
            <p className="reader__inline-mark" aria-hidden="true">
              © Ellines Haven · Licensed to {user.name} · {user.email} · {new Date().toLocaleDateString('en-KE')}
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
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Next →
                </button>
              )}
            </div>

            {chapter === chapters.length - 1 && !hasPdf && (
              <div className="reader__end">
                <p>— End of Preview —</p>
                <p style={{ marginTop:8, fontSize:'.82rem', color:'var(--muted)' }}>
                  Full PDF will be available here once uploaded by the author.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
