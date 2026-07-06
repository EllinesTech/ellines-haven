import { useParams, Link, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './Reader.css';

/* ─────────────────────────────────────────────
   Audio Book Player — Web Speech API
   Reads chapter text aloud with voice settings
───────────────────────────────────────────── */
function AudioPlayer({ chapters, currentChapter, onChapterChange }) {
  const synth = window.speechSynthesis;

  const [playing,   setPlaying]   = useState(false);
  const [voices,    setVoices]    = useState([]);
  const [voiceIdx,  setVoiceIdx]  = useState(0);
  const [rate,      setRate]      = useState(1.0);
  const [pitch,     setPitch]     = useState(1.0);
  const [showCfg,   setShowCfg]   = useState(false);
  const [progress,  setProgress]  = useState(0);   // 0-100
  const [elapsed,   setElapsed]   = useState(0);   // seconds
  const [total,     setTotal]     = useState(0);
  const [filter,    setFilter]    = useState('all'); // all | female | male | other

  const uttRef     = useRef(null);
  const charRef    = useRef(0);   // char offset into full text
  const timerRef   = useRef(null);
  const startedAt  = useRef(0);
  const pausedAt   = useRef(0);

  const chapterText = chapters[currentChapter]?.text || '';

  // Load available voices
  useEffect(() => {
    const load = () => {
      const v = synth.getVoices();
      if (v.length) setVoices(v);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []); // eslint-disable-line

  // Stop speech when chapter changes
  useEffect(() => {
    stopSpeech();
    charRef.current = 0;
    setProgress(0);
    setElapsed(0);
    // estimate total reading time: avg 180 words/min at rate 1.0
    const words = (chapterText || '').split(/\s+/).filter(Boolean).length;
    setTotal(Math.round((words / 180) * 60));
  }, [currentChapter, chapterText]); // eslint-disable-line

  // Cleanup on unmount
  useEffect(() => () => stopSpeech(), []); // eslint-disable-line

  function stopSpeech() {
    synth.cancel();
    clearInterval(timerRef.current);
    setPlaying(false);
    pausedAt.current = 0;
  }

  function getSelectedVoice() {
    const filtered = filteredVoices();
    return filtered[voiceIdx] || voices[0] || null;
  }

  function filteredVoices() {
    if (!voices.length) return [];
    if (filter === 'all') return voices;
    return voices.filter(v => {
      const n = v.name.toLowerCase();
      if (filter === 'female') return n.includes('female') || n.includes('woman') || /zira|hazel|susan|karen|samantha|victoria|fiona|moira|tessa|veena|neerja|heera|raveena|manjari|lekha|kalpana|asha|zuzana|paulina|lucia|almudena|marta|zosia|ewa|ioana|afrikaans|hessa|leila|naayf|laila|fatima|tamar|joana|mariana|linh/.test(n);
      if (filter === 'male')   return n.includes('male') || /david|mark|daniel|alex|james|george|reed|fred|rishi|luca|diego|jorge|pablo|miguel|ivan|andrés|enrique/.test(n);
      return true;
    });
  }

  function speak(fromChar = 0) {
    synth.cancel();
    clearInterval(timerRef.current);

    const text = chapterText.slice(fromChar);
    if (!text.trim()) return;

    const utt = new SpeechSynthesisUtterance(text);
    utt.voice  = getSelectedVoice();
    utt.rate   = rate;
    utt.pitch  = pitch;
    utt.lang   = utt.voice?.lang || 'en-US';

    utt.onboundary = e => {
      if (e.name === 'word') {
        charRef.current = fromChar + e.charIndex;
        const pct = Math.min(100, Math.round(((fromChar + e.charIndex) / chapterText.length) * 100));
        setProgress(pct);
      }
    };

    utt.onend = () => {
      clearInterval(timerRef.current);
      setPlaying(false);
      setProgress(100);
      charRef.current = 0;
      // Auto-advance to next chapter
      if (currentChapter < chapters.length - 1) {
        onChapterChange(currentChapter + 1);
      }
    };

    utt.onerror = () => { clearInterval(timerRef.current); setPlaying(false); };

    uttRef.current = utt;
    synth.speak(utt);
    setPlaying(true);
    startedAt.current = Date.now() - pausedAt.current * 1000;

    // Update elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
    }, 1000);
  }

  const handlePlay = () => {
    if (playing) {
      synth.pause();
      clearInterval(timerRef.current);
      pausedAt.current = elapsed;
      setPlaying(false);
    } else {
      if (synth.paused) {
        synth.resume();
        startedAt.current = Date.now() - pausedAt.current * 1000;
        timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
        setPlaying(true);
      } else {
        speak(charRef.current);
      }
    }
  };

  const handleStop = () => {
    stopSpeech();
    charRef.current = 0;
    setProgress(0);
    setElapsed(0);
    pausedAt.current = 0;
  };

  const handleRewind = () => {
    // Rewind ~15 seconds worth of text (approx 45 words at rate 1.0)
    const words = Math.round(15 * (180 * rate) / 60);
    const textBefore = chapterText.slice(0, charRef.current);
    const wordArr = textBefore.split(/\s+/);
    const newWords = wordArr.slice(0, Math.max(0, wordArr.length - words));
    const newChar = newWords.join(' ').length;
    charRef.current = newChar;
    pausedAt.current = 0;
    if (playing) speak(newChar);
    else setProgress(Math.round((newChar / chapterText.length) * 100));
  };

  const handleSkip = () => {
    if (currentChapter < chapters.length - 1) {
      onChapterChange(currentChapter + 1);
    }
  };

  const fmtTime = s => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2,'0')}`;
  };

  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  if (!available) return (
    <div className="audio-player audio-player--unsupported">
      🔇 Text-to-speech is not supported in this browser. Try Chrome or Edge.
    </div>
  );

  const dispVoices = filteredVoices();
  const safeIdx    = Math.min(voiceIdx, Math.max(0, dispVoices.length - 1));

  return (
    <div className="audio-player">
      {/* Left: chapter info */}
      <div className="audio-player__info">
        <span className="audio-player__icon">🎧</span>
        <div>
          <strong className="audio-player__title">{chapters[currentChapter]?.title || 'Listening…'}</strong>
          <span className="audio-player__sub">Ch {currentChapter + 1} of {chapters.length}</span>
        </div>
      </div>

      {/* Centre: controls + progress */}
      <div className="audio-player__centre">
        <div className="audio-player__controls">
          <button className="audio-btn" title="Rewind 15s" onClick={handleRewind}>⏮</button>
          <button className="audio-btn audio-btn--play" title={playing ? 'Pause' : 'Play'} onClick={handlePlay}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="audio-btn" title="Stop" onClick={handleStop}>⏹</button>
          <button className="audio-btn" title="Next chapter" onClick={handleSkip} disabled={currentChapter >= chapters.length - 1}>⏭</button>
        </div>
        <div className="audio-player__progress-row">
          <span className="audio-player__time">{fmtTime(elapsed)}</span>
          <div className="audio-player__track" onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const newChar = Math.round(pct * chapterText.length);
            charRef.current = newChar;
            setProgress(Math.round(pct * 100));
            pausedAt.current = 0;
            if (playing) speak(newChar);
          }}>
            <div className="audio-player__fill" style={{ width: `${progress}%` }} />
            <div className="audio-player__thumb" style={{ left: `${progress}%` }} />
          </div>
          <span className="audio-player__time">{fmtTime(total)}</span>
        </div>
      </div>

      {/* Right: speed + settings gear */}
      <div className="audio-player__right">
        <select
          className="audio-select"
          value={rate}
          onChange={e => { setRate(parseFloat(e.target.value)); if (playing) { speak(charRef.current); } }}
          title="Playback speed"
        >
          {[0.5,0.75,1.0,1.25,1.5,1.75,2.0].map(r => (
            <option key={r} value={r}>{r}×</option>
          ))}
        </select>
        <button className={'audio-btn audio-btn--gear' + (showCfg ? ' on' : '')} onClick={() => setShowCfg(s => !s)} title="Voice settings">⚙️</button>
      </div>

      {/* Settings panel */}
      {showCfg && (
        <div className="audio-settings">
          <div className="audio-settings__row">
            <label>Voice filter</label>
            <div className="audio-filter-group">
              {['all','female','male'].map(f => (
                <button key={f} className={'audio-filter-btn' + (filter === f ? ' on' : '')}
                  onClick={() => { setFilter(f); setVoiceIdx(0); }}>
                  {f === 'female' ? '♀ Female' : f === 'male' ? '♂ Male' : '🌐 All'}
                </button>
              ))}
            </div>
          </div>
          <div className="audio-settings__row">
            <label>Voice</label>
            <select className="audio-select audio-select--wide"
              value={safeIdx}
              onChange={e => { setVoiceIdx(parseInt(e.target.value)); if (playing) speak(charRef.current); }}>
              {dispVoices.map((v, i) => (
                <option key={i} value={i}>{v.name} ({v.lang})</option>
              ))}
              {dispVoices.length === 0 && <option value={0}>No voices available</option>}
            </select>
          </div>
          <div className="audio-settings__row">
            <label>Speed — {rate}×</label>
            <input type="range" min="0.5" max="2" step="0.25" value={rate}
              className="audio-slider"
              onChange={e => { setRate(parseFloat(e.target.value)); if (playing) speak(charRef.current); }} />
          </div>
          <div className="audio-settings__row">
            <label>Pitch — {pitch.toFixed(1)}</label>
            <input type="range" min="0.5" max="2" step="0.1" value={pitch}
              className="audio-slider"
              onChange={e => { setPitch(parseFloat(e.target.value)); if (playing) speak(charRef.current); }} />
          </div>
          <p className="audio-settings__note">
            Available voices depend on your device and browser. Chrome / Edge on Windows or Android give the most choices.
          </p>
        </div>
      )}
    </div>
  );
}

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
  const location = useLocation();
  const { books, user, isOwned, library, myPerms, libLoaded } = useApp();
  const book = books.find(b => b.id === id);
  const readerRef = useRef(null);

  // Support deep-linking to a specific chapter from BookDetail TOC
  const initialChapter = location.state?.chapter ?? 0;

  const [chapter,   setChapter]   = useState(initialChapter);
  const [fontSize,  setFontSize]  = useState(17);
  const [zoom,      setZoom]      = useState(100);
  const [mode,      setMode]      = useState('pdf');
  const [drmBlock,  setDrmBlock]  = useState(false);
  const [resumeBanner, setResumeBanner] = useState(false);

  // ── Always fetch the latest chapters from Firestore so admin edits are
  //    immediately visible to readers without waiting for cache expiry ────────
  const [liveChapters, setLiveChapters] = useState(null);
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'book_chapters', String(id)))
      .then(snap => {
        if (snap.exists() && snap.data().chapters?.length > 0) {
          setLiveChapters(snap.data().chapters);
        }
      })
      .catch(() => {}); // silently fall back to context chapters
  }, [id]);

  // ── Reading progress ──────────────────────────────────────────────────────
  const { getProgress, saveProgress } = useReadingProgress(user?.email, id);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

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
  const chapters   = liveChapters || getFallbackChapters(book);

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

  const viewMode   = hasPdf ? mode : (mode === 'listen' ? 'listen' : 'text');

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
          {/* Mode toggle — PDF + Text + Listen */}
          <div className="reader__mode-toggle">
            {hasPdf && (
              <button className={'reader__mode-btn' + (viewMode === 'pdf'  ? ' on' : '')} onClick={() => setMode('pdf')}>
                📄 PDF
              </button>
            )}
            <button className={'reader__mode-btn' + (viewMode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>
              📖 Read
            </button>
            <button className={'reader__mode-btn reader__mode-btn--listen' + (mode === 'listen' ? ' on' : '')} onClick={() => setMode('listen')}>
              🎧 Listen
            </button>
          </div>

          {/* Zoom controls — PDF mode */}
          {viewMode === 'pdf' && hasPdf && (
            <div className="reader__zoom-group">
              <button className="reader__font-btn" onClick={() => setZoom(z => Math.max(50, z - 10))} title="Zoom out">−</button>
              <span className="reader__zoom-label">{zoom}%</span>
              <button className="reader__font-btn" onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in">+</button>
              <button className="reader__font-btn" onClick={() => setZoom(100)} title="Reset zoom" style={{fontSize:'0.7rem'}}>↺</button>
            </div>
          )}

          {/* Font size — text/listen mode */}
          {(viewMode === 'text' || viewMode === 'listen') && (
            <div className="reader__zoom-group">
              <button className="reader__font-btn" onClick={() => setFontSize(s => Math.max(13, s - 1))} title="Smaller text">A−</button>
              <span className="reader__zoom-label">{fontSize}px</span>
              <button className="reader__font-btn" onClick={() => setFontSize(s => Math.min(26, s + 1))} title="Larger text">A+</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Resume reading banner ── */}
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
                <div className="reader__ch-tabs-label">📖 Chapters</div>
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

      {/* ══════════════════════════════
          LISTEN MODE
          Text-to-speech audio player
          + text display for follow-along
      ══════════════════════════════ */}
      {viewMode === 'listen' && (
        <div className="reader__body">
          <div className="reader__page reader__page--drm">

            {/* Ghost watermark */}
            <div className="reader__ghost-wm" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i}>{user.name} · Ellines Haven · {user.email}</span>
              ))}
            </div>

            <h1 className="reader__title">{book.title}</h1>
            <p className="reader__by">by {book.author} · Ellines Haven</p>
            <div className="reader__divider" />

            {/* Audio player */}
            <AudioPlayer
              chapters={chapters}
              currentChapter={chapter}
              onChapterChange={ch => { setChapter(ch); window.scrollTo(0, 0); }}
            />

            {/* Chapter tabs */}
            {chapters.length > 1 && (
              <div className="reader__ch-tabs" style={{ marginTop: 24 }}>
                <div className="reader__ch-tabs-label">📖 Chapters</div>
                {chapters.map((ch, i) => (
                  <button key={i} className={'reader__ch-btn' + (i === chapter ? ' on' : '')}
                    onClick={() => { setChapter(i); window.scrollTo(0, 0); }}>
                    {ch.title}
                  </button>
                ))}
              </div>
            )}

            <h2 className="reader__chapter">{chapters[chapter]?.title}</h2>

            {/* Follow-along text */}
            <div className="reader__text reader__text--listen" style={{ fontSize: fontSize + 'px' }}>
              {(chapters[chapter]?.text || '').split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <p className="reader__inline-mark" aria-hidden="true">
              © Ellines Haven · Licensed to {user.name} · {user.email} · {new Date().toLocaleDateString('en-KE')}
            </p>

            <div className="reader__page-nav">
              {chapter > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setChapter(c => c - 1); window.scrollTo(0, 0); }}>
                  ← Previous
                </button>
              )}
              {chapter < chapters.length - 1 && (
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
