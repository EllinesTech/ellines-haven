import { useParams, Link, useLocation } from 'react-router-dom';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { doc, getDocFromCache, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { findBookBySlugOrId, bookPath } from '../utils/slugify';
import {
  isBookSavedOffline,
  getOfflineBook,
  saveBookOffline,
  removeOfflineBook,
} from '../hooks/useOfflineBook';
import { getFallbackChapters } from '../data/bookChapters';
import './Reader.css';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Audio Book Player â€” Web Speech API
   Reads chapter text aloud with voice settings
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function AudioPlayer({ chapters, currentChapter, onChapterChange }) {
  const synth = window.speechSynthesis;

  const [playing,   setPlaying]   = useState(false);
  const [voices,    setVoices]    = useState([]);
  const [voiceIdx,  setVoiceIdx]  = useState(0);
  const [rate,      setRate]      = useState(1.0);
  const [pitch,     setPitch]     = useState(1.0);
  const [showCfg,   setShowCfg]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [elapsed,   setElapsed]   = useState(0);
  const [total,     setTotal]     = useState(0);
  const [filter,    setFilter]    = useState('all');
  const [voiceDdOpen, setVoiceDdOpen] = useState(false);

  const uttRef     = useRef(null);
  const charRef    = useRef(0);   // char offset into full text
  const timerRef   = useRef(null);
  const startedAt  = useRef(0);
  const pausedAt   = useRef(0);

  const chapterText = chapters[currentChapter]?.text || '';

  // Load available voices â€” auto-select best neural English voice
  useEffect(() => {
    const load = () => {
      const v = synth.getVoices();
      if (!v.length) return;
      setVoices(v);

      // Priority: Microsoft Neural voices > Google voices > any en-US > fallback
      const NEURAL_PRIORITY = [
        // Microsoft neural (Edge/Chrome Windows â€” genuinely human quality)
        'Microsoft Jenny', 'Microsoft Aria', 'Microsoft Guy', 'Microsoft Davis',
        'Microsoft Emma', 'Microsoft Brian', 'Microsoft Ana', 'Microsoft Andrew',
        // Google neural
        'Google UK English Female', 'Google UK English Male',
        'Google US English',
      ];
      let bestIdx = 0;
      for (const name of NEURAL_PRIORITY) {
        const idx = v.findIndex(x => x.name.startsWith(name));
        if (idx >= 0) { bestIdx = idx; break; }
      }
      // Fallback: first en-US or en-GB voice
      if (bestIdx === 0) {
        const enIdx = v.findIndex(x => x.lang?.startsWith('en'));
        if (enIdx >= 0) bestIdx = enIdx;
      }
      setVoiceIdx(bestIdx);
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
      if (filter === 'male')   return n.includes('male') || /david|mark|daniel|alex|james|george|reed|fred|rishi|luca|diego|jorge|pablo|miguel|ivan|andrÃ©s|enrique/.test(n);
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
      ðŸ”‡ Text-to-speech is not supported in this browser. Try Chrome or Edge.
    </div>
  );

  const dispVoices = filteredVoices();
  const safeIdx    = Math.min(voiceIdx, Math.max(0, dispVoices.length - 1));

  return (
    <div className="audio-player">
      {/* Left: chapter info */}
      <div className="audio-player__info">
        <span className="audio-player__icon">ðŸŽ§</span>
        <div>
          <strong className="audio-player__title">{chapters[currentChapter]?.title || 'Listeningâ€¦'}</strong>
          <span className="audio-player__sub">Ch {currentChapter + 1} of {chapters.length}</span>
        </div>
      </div>

      {/* Centre: controls + progress */}
      <div className="audio-player__centre">
        <div className="audio-player__controls">
          <button className="audio-btn" title="Rewind 15s" onClick={handleRewind}>â®</button>
          <button className="audio-btn audio-btn--play" title={playing ? 'Pause' : 'Play'} onClick={handlePlay}>
            {playing ? 'â¸' : 'â–¶'}
          </button>
          <button className="audio-btn" title="Stop" onClick={handleStop}>â¹</button>
          <button className="audio-btn" title="Next chapter" onClick={handleSkip} disabled={currentChapter >= chapters.length - 1}>â­</button>
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
          }} onTouchEnd={e => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const touch = e.changedTouches[0];
            const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
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

      {/* Right: speed pills + settings gear */}
      <div className="audio-player__right">
        <div className="audio-speed-pills">
          {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
            <button
              key={r}
              className={'audio-speed-pill' + (rate === r ? ' on' : '')}
              onClick={() => { setRate(r); if (playing) { speak(charRef.current); } }}
              title={`${r}Ã— speed`}
            >
              {r === 1.0 ? '1Ã—' : `${r}Ã—`}
            </button>
          ))}
        </div>
        <button className={'audio-btn audio-btn--gear' + (showCfg ? ' on' : '')} onClick={() => setShowCfg(s => !s)} title="Voice settings">âš™ï¸</button>
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
                  {f === 'female' ? 'â™€ Female' : f === 'male' ? 'â™‚ Male' : 'ðŸŒ All'}
                </button>
              ))}
            </div>
          </div>
          <div className="audio-settings__row">
            <label>Voice</label>
            <div className="audio-custom-dd" style={{ flex: 1 }}>
              <button
                className="audio-custom-dd__trigger"
                onClick={() => setVoiceDdOpen(o => !o)}
                type="button"
              >
                <span>
                  {dispVoices[safeIdx]?.name || 'Select voice'}
                  {dispVoices[safeIdx] && /microsoft.*(jenny|aria|guy|davis|emma|brian|ana|andrew|ryan|sonia|libby|mia|neerja|ravi)/i.test(dispVoices[safeIdx].name) && (
                    <span className="audio-neural-badge">âœ¨ Neural</span>
                  )}
                  {dispVoices[safeIdx] && /google/i.test(dispVoices[safeIdx].name) && (
                    <span className="audio-neural-badge audio-neural-badge--google">ðŸ”µ Neural</span>
                  )}
                  {' '}<small style={{ opacity: 0.5, fontSize:'0.65rem' }}>{dispVoices[safeIdx]?.lang}</small>
                </span>
                <span className={'audio-custom-dd__arrow' + (voiceDdOpen ? ' open' : '')}>â–¾</span>
              </button>
              {voiceDdOpen && (
                <div className="audio-custom-dd__list">
                  {dispVoices.length === 0 && (
                    <div className="audio-custom-dd__empty">No voices found</div>
                  )}
                  {dispVoices.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      className={'audio-custom-dd__item' + (i === safeIdx ? ' on' : '')}
                      onClick={() => {
                        setVoiceIdx(i);
                        setVoiceDdOpen(false);
                        if (playing) speak(charRef.current);
                      }}
                    >
                      <span className="audio-custom-dd__name">
                        {v.name}
                        {/microsoft.*(jenny|aria|guy|davis|emma|brian|ana|andrew|ryan|sonia|libby|mia|neerja|ravi)/i.test(v.name) && (
                          <span className="audio-neural-badge">âœ¨ Neural</span>
                        )}
                        {/google/i.test(v.name) && (
                          <span className="audio-neural-badge audio-neural-badge--google">ðŸ”µ Neural</span>
                        )}
                      </span>
                      <span className="audio-custom-dd__lang">{v.lang}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="audio-settings__row">
            <label>Speed â€” {rate}Ã—</label>
            <div className="audio-speed-pills">
              {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(r => (
                <button
                  key={r}
                  className={'audio-speed-pill' + (rate === r ? ' on' : '')}
                  onClick={() => { setRate(r); if (playing) speak(charRef.current); }}
                >
                  {r}Ã—
                </button>
              ))}
            </div>
          </div>
          <div className="audio-settings__row">
            <label>Pitch â€” {pitch.toFixed(1)}</label>
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Google Drive URL converter
   Accepts any of these formats from the admin:
     https://drive.google.com/file/d/FILE_ID/view
     https://drive.google.com/file/d/FILE_ID/view?usp=sharing
     https://drive.google.com/open?id=FILE_ID
     https://drive.google.com/uc?export=download&id=FILE_ID
   Returns the embed URL:
     https://drive.google.com/file/d/FILE_ID/preview
   which renders the PDF inline â€” no download button visible,
   no raw URL exposed to the user.
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Main Reader Component
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function Reader() {
  const { id } = useParams();
  const location = useLocation();
  const { books, user, isOwned, library, myPerms, libLoaded, siteControls } = useApp();
  const book = findBookBySlugOrId(books, id);
  const readerRef = useRef(null);

  // Support deep-linking to a specific chapter from BookDetail TOC
  const initialChapter = location.state?.chapter ?? 0;

  const [chapter,   setChapter]   = useState(initialChapter);
  const [fontSize,  setFontSize]  = useState(17);
  const [zoom,      setZoom]      = useState(100);
  const [mode,      setMode]      = useState('pdf');
  const [drmBlock,  setDrmBlock]  = useState(false);
  const [resumeBanner, setResumeBanner] = useState(false);

  // â”€â”€ Offline reading state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [isOffline,       setIsOffline]       = useState(!navigator.onLine);
  const [offlineSaved,    setOfflineSaved]     = useState(false);
  const [offlineSaving,   setOfflineSaving]    = useState(false);
  const [offlineSaveMsg,  setOfflineSaveMsg]   = useState('');
  const [offlineChapters, setOfflineChapters]  = useState(null);

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

  // On mount, check if this book is already saved offline and load cached chapters
  useEffect(() => {
    if (!user?.email || !book?.id) return;
    const saved = isBookSavedOffline(user.email, book.id);
    setOfflineSaved(saved);
    if (saved) {
      const cached = getOfflineBook(user.email, book.id);
      if (cached?.chapters?.length) setOfflineChapters(cached.chapters);
    }
  }, [user?.email, book?.id]); // eslint-disable-line

  // â”€â”€ Chapters: serve from IndexedDB cache instantly, then live-update â”€â”€â”€â”€â”€â”€
  // Phase 1: getDocFromCache â†’ zero network latency, renders immediately
  // Phase 2: onSnapshot â†’ picks up admin edits in real-time, no page refresh needed
  const [liveChapters, setLiveChapters] = useState(null);
  useEffect(() => {
    if (!book?.id) return;
    const ref = doc(db, 'book_chapters', String(book.id));

    // Serve from IndexedDB cache first (instant â€” no network)
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
  }, [book?.id]); // eslint-disable-line

  // â”€â”€ Reading progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { getProgress, saveProgress } = useReadingProgress(user?.email, book?.id);

  // Support deep-linking to a specific chapter â€” switch to text mode automatically
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

  // Ownership check â€” uses Firestore-backed library state from AppContext
  const checkOwned = useCallback(() => {
    if (!user) return false;
    return isOwned(book?.id ?? id);
  }, [user, isOwned, book?.id, id]);

  // Get the owned book entry (includes driveUrl set at unlock time)
  const getOwnedBook = useCallback(() => {
    if (!user) return null;
    return library.find(x => x.id === (book?.id ?? id)) || null;
  }, [user, library, book?.id, id]);

  /* â”€â”€ DRM: block right-click, copy, print on the reader element â”€â”€ */
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

  /* â”€â”€ DRM: block print â”€â”€ */
  useEffect(() => {
    if ((siteControls || {}).disablePrint === false) return; // admin disabled this protection
    const before = () => { setDrmBlock(true); };
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, [siteControls]);

  /* â”€â”€ Gates â”€â”€ */
  if (!book) return (
    <div className="reader-error">
      <div className="reader-error__icon">ðŸ“š</div>
      <h2>Book not found</h2>
      <Link to="/library" className="btn btn-primary">Back to Library</Link>
    </div>
  );

  if (!user) return (
    <div className="reader-error">
      <div className="reader-error__icon">ðŸ”’</div>
      <h2>Sign in to read</h2>
      <p>You need to be logged in to access this book.</p>
      <Link to="/login" className="btn btn-primary">Sign In</Link>
    </div>
  );

  if (!checkOwned()) {
    // Still waiting for Firestore library snapshot â€” show loading briefly.
    // Only block if we genuinely don't have any library data yet.
    // If library is empty AND libLoaded is false, wait up to 4 s (AppContext timeout handles that).
    if (!libLoaded) return (
      <div className="reader-error">
        <div style={{ fontSize:'2rem', marginBottom:16 }}>â³</div>
        <p style={{ color:'var(--muted)' }}>Verifying accessâ€¦</p>
      </div>
    );
    return (
      <div className="reader-error">
        <div className="reader-error__icon">ðŸ›’</div>
        <h2>Purchase required</h2>
        <p>Buy this book to unlock reading and download access.</p>
        <Link to={bookPath(book)} className="btn btn-primary">Buy â€” KSh {book.price}</Link>
      </div>
    );
  }

  if (user && myPerms && myPerms.canReadOnline === false) return (
    <div className="reader-error">
      <div className="reader-error__icon">ðŸ”’</div>
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
        <div className="reader-error__icon">âš ï¸</div>
        <h2>Book Deactivated</h2>
        <p style={{ maxWidth:400, textAlign:'center' }}>{reason}</p>
        <Link to="/my-library" className="btn btn-primary">My Library</Link>
      </div>
    );
  }

  if (drmBlock) return (
    <div className="reader-error">
      <div className="reader-error__icon">â›”</div>
      <h2>Printing not allowed</h2>
      <p>This content is protected. Printing and sharing are not permitted.</p>
      <button className="btn btn-ghost btn-sm" onClick={() => setDrmBlock(false)}>Continue Reading</button>
    </div>
  );

  const ownedBook = getOwnedBook();

  // Per-book admin deactivation check
  if (ownedBook?.readDeactivated === true) return (
    <div className="reader-error">
      <div className="reader-error__icon">â›”</div>
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
  // Chapters: prefer live Firestore â†’ offline cache â†’ fallback static content
  const chapters   = liveChapters || offlineChapters || getFallbackChapters(book);

  // â”€â”€ Save for offline handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSaveOffline = async () => {
    if (!user?.email || !book?.id) return;
    setOfflineSaving(true);
    setOfflineSaveMsg('');
    const ok = saveBookOffline(user.email, book.id, book, chapters);
    setOfflineSaving(false);
    if (ok) {
      setOfflineSaved(true);
      setOfflineChapters(chapters);
      setOfflineSaveMsg('âœ… Saved for offline reading');
    } else {
      setOfflineSaveMsg('âŒ Could not save â€” storage may be full');
    }
    setTimeout(() => setOfflineSaveMsg(''), 3500);
  };

  const handleRemoveOffline = () => {
    if (!user?.email || !book?.id) return;
    removeOfflineBook(user.email, book.id);
    setOfflineSaved(false);
    setOfflineChapters(null);
    setOfflineSaveMsg('ðŸ—‘ Removed from offline library');
    setTimeout(() => setOfflineSaveMsg(''), 3000);
  };

  // Download URL â€” uses Google Drive's export endpoint for direct PDF download
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

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      className={`reader reader--drm${(siteControls?.screenshotOverlay) ? ' reader--screenshot-overlay' : ''}${(siteControls?.disableSelect === false) ? ' reader--select-enabled' : ''}`}
      ref={readerRef}
    >

      {/* â”€â”€ Sidebar overlay (mobile) â”€â”€ */}
      {sidebarOpen && (
        <div className="reader__sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          LEFT SIDEBAR â€” book info + TOC
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <aside className={'reader__sidebar' + (sidebarOpen ? ' open' : '')}>
        {/* Close button (mobile) */}
        <button className="reader__sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">âœ•</button>

        {/* Book cover */}
        {book.cover && (
          <div className="reader__sidebar-cover">
            <picture>
              <source srcSet={book.cover.replace(/\.png$/i, '.webp')} type="image/webp" />
              <img src={book.cover} alt={book.title} loading="lazy" decoding="async" />
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
                  onClick={() => { setChapter(i); window.scrollTo(0, 0); if (window.innerWidth < 768) setSidebarOpen(false); }}
                >
                  {ch.title}
                </button>
              </React.Fragment>
            ));
          })()}
        </nav>
      </aside>

      {/* â”€â”€ Main content wrapper (shifts right when sidebar open on desktop) â”€â”€ */}
      <div className={'reader__main' + (sidebarOpen ? ' sidebar-open' : '')}>

      {/* â”€â”€ Top navigation bar â”€â”€ */}
      <div className="reader__nav">
        {/* Sidebar toggle */}
        <button className="reader__sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle chapters">
          <span /><span /><span />
        </button>

        <Link to="/my-library" className="reader__back">â† My Library</Link>

        <div className="reader__info">
          <strong>{book.title}</strong>
          <span>by {book.author}</span>
        </div>

        <div className="reader__nav-right">
          {/* â”€â”€ Offline indicator â”€â”€ */}
          {isOffline && (
            <span className="reader__offline-badge" title="You are offline â€” reading from local cache">
              ðŸ“µ Offline
            </span>
          )}

          {/* â”€â”€ Offline save / remove button â€” only when admin allows it â”€â”€ */}
          {!isOffline && (siteControls?.offlineEnabled !== false) && chapters?.length > 0 && (
            offlineSaved ? (
              <button
                className="reader__font-btn"
                style={{padding:'4px 12px',fontSize:'0.78rem',background:'rgba(46,204,113,0.12)',border:'1px solid rgba(46,204,113,0.3)',borderRadius:'var(--r-sm)',color:'#2ecc71'}}
                title="Remove from offline library"
                onClick={handleRemoveOffline}
              >
                âœ… Saved Offline
              </button>
            ) : (
              <button
                className="reader__font-btn"
                style={{padding:'4px 12px',fontSize:'0.78rem',background:'rgba(201,168,76,0.12)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:'var(--r-sm)',color:'var(--gold)'}}
                title="Save book for offline reading (stored in your browser)"
                onClick={handleSaveOffline}
                disabled={offlineSaving}
              >
                {offlineSaving ? 'â³ Savingâ€¦' : 'ðŸ“¥ Save Offline'}
              </button>
            )
          )}

          {/* Offline save feedback message */}
          {offlineSaveMsg && (
            <span style={{fontSize:'0.75rem',color:'var(--muted)',flexShrink:0}}>{offlineSaveMsg}</span>
          )}
          {/* Mode toggle â€” PDF + Text + Listen */}
          <div className="reader__mode-toggle">
            {hasPdf && (
              <button className={'reader__mode-btn' + (viewMode === 'pdf'  ? ' on' : '')} onClick={() => setMode('pdf')}>
                ðŸ“„ PDF
              </button>
            )}
            <button className={'reader__mode-btn' + (viewMode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>
              ðŸ“– Read
            </button>
            <button className={'reader__mode-btn reader__mode-btn--listen' + (mode === 'listen' ? ' on' : '')} onClick={() => setMode('listen')}>
              ðŸŽ§ Listen
            </button>
          </div>

          {/* Zoom controls â€” PDF mode */}
          {viewMode === 'pdf' && hasPdf && (
            <div className="reader__zoom-group">
              <button className="reader__font-btn" onClick={() => setZoom(z => Math.max(50, z - 10))} title="Zoom out">âˆ’</button>
              <span className="reader__zoom-label">{zoom}%</span>
              <button className="reader__font-btn" onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in">+</button>
              <button className="reader__font-btn" onClick={() => setZoom(100)} title="Reset zoom" style={{fontSize:'0.7rem'}}>â†º</button>
            </div>
          )}

          {/* Font size â€” text/listen mode */}
          {(viewMode === 'text' || viewMode === 'listen') && (
            <div className="reader__zoom-group">
              <button className="reader__font-btn" onClick={() => setFontSize(s => Math.max(13, s - 1))} title="Smaller text">Aâˆ’</button>
              <span className="reader__zoom-label">{fontSize}px</span>
              <button className="reader__font-btn" onClick={() => setFontSize(s => Math.min(26, s + 1))} title="Larger text">A+</button>
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ Offline reading banner â”€â”€ */}
      {isOffline && offlineSaved && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 18px',
          background: 'rgba(46,204,113,0.10)',
          borderBottom: '1px solid rgba(46,204,113,0.2)',
          fontSize: '0.82rem', color: '#2ecc71',
        }}>
          <span>ðŸ“µ</span>
          <span>Reading from offline cache â€” no internet required.</span>
        </div>
      )}
      {isOffline && !offlineSaved && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 18px',
          background: 'rgba(231,76,60,0.10)',
          borderBottom: '1px solid rgba(231,76,60,0.2)',
          fontSize: '0.82rem', color: '#e74c3c',
        }}>
          <span>âš ï¸</span>
          <span>You are offline. This book was not saved for offline reading. Connect to the internet to continue.</span>
        </div>
      )}

      {/* â”€â”€ Resume reading banner â”€â”€ */}
      {resumeBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 18px',
          background: 'rgba(201,168,76,0.12)',
          borderBottom: '1px solid rgba(201,168,76,0.25)',
          fontSize: '0.85rem', flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--gold)' }}>ðŸ“– You were reading this book. Resume where you left off?</span>
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

      {/* â”€â”€ Watermark strip â”€â”€ */}
      <div className="reader__watermark">
        ðŸ”’ Licensed to &bull;<strong>{user.name}</strong> &bull; {user.email} â€” Personal use only. Sharing or redistribution is prohibited.
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          PDF EMBED MODE
          Google Drive renders the PDF
          inside an iframe on our page.
          User sees the book, not the URL.
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {viewMode === 'pdf' && hasPdf && (
        <div className="reader__pdf-wrap">

          {/* Invisible overlay blocks right-click on the iframe */}
          <div className="reader__pdf-shield" onContextMenu={e => e.preventDefault()} />

          {/* Ghost watermark tiles visible over the PDF */}
          <div className="reader__pdf-wm" aria-hidden="true">
            {Array.from({ length: 30 }).map((_, i) => (
              <span key={i}>{user.name} Â· {user.email} Â· Ellines Haven</span>
            ))}
          </div>

          {/* The actual PDF viewer â€” Google Drive embed, toolbar hidden */}
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
            Â© {new Date().getFullYear()} Ellines Haven Â· This copy is licensed to {user.name} Â· Redistribution is prohibited
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          TEXT / CHAPTER MODE
          Fallback when no PDF, or user
          switches to text view.
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {viewMode === 'text' && (
        <div className="reader__body">
          <div className="reader__page reader__page--drm">

            {/* Ghost watermark tiled in background */}
            <div className="reader__ghost-wm" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i}>{user.name} Â· Ellines Haven Â· {user.email}</span>
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

            <div className="reader__text" style={{ fontSize: fontSize + 'px' }}>
              {(chapters[chapter]?.text || '').split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {/* Inline licence watermark */}
            <p className="reader__inline-mark" aria-hidden="true">
              ðŸ”’ Licensed to &bull; <strong>{user.name}</strong> &bull; {user.email}
            </p>

            {/* Chapter navigation */}
            <div className="reader__page-nav">
              {chapter > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setChapter(c => c - 1); window.scrollTo(0, 0); }}>
                  â† Previous
                </button>
              )}
              {chapter < chapters.length - 1 && (
                <button className="btn btn-primary btn-sm" style={{ marginLeft:'auto' }}
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Next â†’
                </button>
              )}
            </div>

            {/* End-of-chapter marker â€” auto-generates from chapter data, admin-editable */}
            <div className="reader__end">
              <p>{chapters[chapter]?.endMessage || `â€” End of Chapter ${chapter + 1} â€”`}</p>
              {chapter < chapters.length - 1 && (
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Continue to Chapter {chapter + 2} â†’
                </button>
              )}
              {chapter === chapters.length - 1 && !hasPdf && (
                <p style={{ marginTop: 8, fontSize: '.82rem', color: 'var(--muted)' }}>
                  Full PDF will be available here once uploaded by the author.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          LISTEN MODE
          Text-to-speech audio player
          + text display for follow-along
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {viewMode === 'listen' && (
        <div className="reader__body">
          <div className="reader__page reader__page--drm">

            {/* Ghost watermark */}
            <div className="reader__ghost-wm" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i}>{user.name} Â· Ellines Haven Â· {user.email}</span>
              ))}
            </div>

            {/* Audio player */}
            <AudioPlayer
              chapters={chapters}
              currentChapter={chapter}
              onChapterChange={ch => { setChapter(ch); window.scrollTo(0, 0); }}
            />

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
            <div className="reader__text reader__text--listen" style={{ fontSize: fontSize + 'px' }}>
              {(chapters[chapter]?.text || '').split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <p className="reader__inline-mark" aria-hidden="true">
              ðŸ”’ Licensed to &bull; <strong>{user.name}</strong> &bull; {user.email}
            </p>

            <div className="reader__page-nav">
              {chapter > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setChapter(c => c - 1); window.scrollTo(0, 0); }}>
                  â† Previous
                </button>
              )}
              {chapter < chapters.length - 1 && (
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Next â†’
                </button>
              )}
            </div>

            {/* End-of-chapter marker for listen mode */}
            <div className="reader__end">
              <p>{chapters[chapter]?.endMessage || `â€” End of Chapter ${chapter + 1} â€”`}</p>
              {chapter < chapters.length - 1 && (
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Continue to Chapter {chapter + 2} â†’
                </button>
              )}
              {chapter === chapters.length - 1 && !hasPdf && (
                <p style={{ marginTop: 8, fontSize: '.82rem', color: 'var(--muted)' }}>
                  Full PDF will be available here once uploaded by the author.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      </div>{/* end reader__main */}
    </div>
  );
}
