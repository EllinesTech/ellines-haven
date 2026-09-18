/**
 * AudioPlayer — floating Listen dock
 *
 * Online  → Google Cloud TTS, "Ellinea" (en-US-Neural2-F / Jenny Neural)
 *           Consistent voice on every device, every browser.
 * Offline → Web Speech API with the best available device voice automatically.
 *           No voice selection UI — just press Play and it works.
 *
 * Transport: Rewind 15s · Play/Pause · Stop · Next chapter
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { synthesize, isOnline, prefetch } from '../utils/cloudTts';
import { getRecommendedVoiceForDevice } from '../utils/audioCompatibility';

// ─── Prefs ────────────────────────────────────────────────────────────────────
const PREFS_KEY = 'eh_audio_prefs';
const DEFAULT_RATE = 0.95;

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
}
function savePrefs(patch) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); } catch { /* noop */ }
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IcoHeadphones = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M12 3C7.03 3 3 7.03 3 12v4a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H5.07A7 7 0 0 1 12 5a7 7 0 0 1 6.93 6H18a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-4c0-4.97-4.03-9-9-9z"/>
  </svg>
);
const IcoRewind = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
  </svg>
);
const IcoPlay = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z"/>
  </svg>
);
const IcoPause = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
  </svg>
);
const IcoStop = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M6 6h12v12H6z"/>
  </svg>
);
const IcoSkip = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M6 18l8.5-6L6 6v12zm2-8.14 5.08 2.14L8 14.14V9.86zM16 6h2v12h-2z"/>
  </svg>
);

// ─── Dock positioning helpers ─────────────────────────────────────────────────
function defaultDockPos(size = 'normal') {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  const w = size === 'min' ? 300 : 340;
  const h = size === 'min' ? 72 : 260;
  return {
    x: Math.max(12, window.innerWidth - w - 20),
    y: Math.max(12, window.innerHeight - h - 96),
  };
}
function clampPos(pos, size = 'normal') {
  if (typeof window === 'undefined' || !pos) return pos;
  const w = size === 'min' ? 300 : 340;
  const h = size === 'min' ? 72 : 260;
  return {
    x: Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - Math.min(h, 120) - 8)),
  };
}

// ─── Offline Web Speech helpers ───────────────────────────────────────────────
function getBestOfflineVoice() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth) return null;
  const all = synth.getVoices();
  if (!all.length) return null;
  // Use audioCompatibility utility to pick the best device voice
  return getRecommendedVoiceForDevice(all) || all.find(v => /^en/i.test(v.lang)) || all[0];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AudioPlayer({
  chapters,
  currentChapter,
  onChapterChange,
  canAccessChapter,
  onChapterBlocked,
  onClose,
}) {
  const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/i.test(navigator.userAgent);
  const prefs = loadPrefs();

  // ── state ──
  const [playing, setPlaying]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [progress, setProgress]     = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const [total, setTotal]           = useState(0);
  const [rate, setRate]             = useState(() => typeof prefs.rate === 'number' ? prefs.rate : DEFAULT_RATE);
  const [online, setOnline]         = useState(() => isOnline());
  const [error, setError]           = useState('');
  const [panelSize, setPanelSize]   = useState(() => (['min','normal'].includes(prefs.panelSize) ? prefs.panelSize : 'normal'));
  const [pos, setPos]               = useState(() => {
    if (prefs.panelPos?.x != null) return clampPos(prefs.panelPos, prefs.panelSize || 'normal');
    return null;
  });
  const [dragging, setDragging]     = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  // ── refs ──
  const audioRef      = useRef(null);   // <Audio> element for cloud TTS
  const uttRef        = useRef(null);   // SpeechSynthesisUtterance for offline
  const charRef       = useRef(0);      // character position within chapter text
  const timerRef      = useRef(null);
  const keepAliveRef  = useRef(null);
  const startedAt     = useRef(0);
  const pausedAt      = useRef(0);
  const playingRef    = useRef(false);
  const rateRef       = useRef(rate);
  const panelRef      = useRef(null);
  const panelSizeRef  = useRef(panelSize);
  const posRef        = useRef(pos);
  const draggingRef   = useRef(false);
  const dragOffset    = useRef({ x: 0, y: 0 });

  const chapterText = chapters[currentChapter]?.text || '';
  const chapterKey  = `ch_${currentChapter}`;

  // ── sync refs ──
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { panelSizeRef.current = panelSize; }, [panelSize]);
  useEffect(() => { setPortalReady(true); }, []);

  // ── online/offline listener ──
  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── initial dock position ──
  useEffect(() => {
    if (pos) return;
    const next = defaultDockPos(panelSize);
    setPos(next);
    posRef.current = next;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── resize clamp ──
  useEffect(() => {
    const fn = () => setPos(p => clampPos(p || defaultDockPos(panelSizeRef.current), panelSizeRef.current));
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  // ── stop + reset on chapter change ──
  useEffect(() => {
    stopAll();
    charRef.current = 0;
    setProgress(0);
    setElapsed(0);
    pausedAt.current = 0;
    // Estimate total duration for progress bar
    const ch = chapters[currentChapter] || {};
    const words = [(ch.title||''), (ch.subtitle||''), (chapterText||'')]
      .join(' ').split(/\s+/).filter(Boolean).length;
    const wpm = Math.round(180 * rateRef.current);
    setTotal(Math.round((words / wpm) * 60));
    // Prefetch next chapter in background when online
    if (online && currentChapter + 1 < chapters.length) {
      const next = chapters[currentChapter + 1];
      if (next?.text) prefetch(next.text, `ch_${currentChapter + 1}`);
    }
  }, [currentChapter, chapterText]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── cleanup on unmount ──
  useEffect(() => () => {
    stopAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── keep-alive for Web Speech on desktop (not iOS) ──
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth || isIOS || !playing || online) return;
    keepAliveRef.current = setInterval(() => {
      if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
    }, 10000);
    return () => clearInterval(keepAliveRef.current);
  }, [playing, online, isIOS]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function stopAll() {
    // Stop cloud audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    // Stop Web Speech
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (synth) synth.cancel();
    if (uttRef.current) uttRef.current = null;
    // Stop timers
    clearInterval(timerRef.current);
    clearInterval(keepAliveRef.current);
    setPlaying(false);
    playingRef.current = false;
  }

  function startElapsedTimer() {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt.current) / 1000);
      setElapsed(secs);
      // Estimate char position for progress bar (no boundary events in cloud TTS)
      if (chapterText.length > 0 && playingRef.current) {
        const elapsed_ = Math.max(0, (Date.now() - startedAt.current) / 1000);
        const estTotal = total || 1;
        const frac = Math.min(0.99, elapsed_ / estTotal);
        const approxChar = Math.round(frac * chapterText.length);
        charRef.current = approxChar;
        setProgress(Math.min(99, Math.round(frac * 100)));
      }
    }, 250);
  }

  /** Advance to next chapter if allowed */
  function tryAdvance() {
    const next = currentChapter + 1;
    if (next >= chapters.length) return;
    if (typeof canAccessChapter === 'function' && !canAccessChapter(next)) {
      onChapterBlocked?.(next);
      return;
    }
    onChapterChange(next);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cloud TTS playback (online)
  // ─────────────────────────────────────────────────────────────────────────────

  async function playCloud(fromChar = 0) {
    setError('');
    setLoading(true);
    try {
      const text = chapterText.slice(fromChar);
      if (!text.trim()) { setLoading(false); return; }

      const dataUrl = await synthesize(text, fromChar === 0 ? chapterKey : '');
      setLoading(false);

      const audio = new Audio(dataUrl);
      audio.playbackRate = rateRef.current;
      audioRef.current = audio;

      audio.onplay = () => {
        setPlaying(true);
        playingRef.current = true;
        startedAt.current = Date.now() - pausedAt.current * 1000;
        startElapsedTimer();
      };
      audio.onpause = () => {
        clearInterval(timerRef.current);
        pausedAt.current = elapsed;
      };
      audio.onended = () => {
        clearInterval(timerRef.current);
        setPlaying(false);
        playingRef.current = false;
        setProgress(100);
        charRef.current = 0;
        pausedAt.current = 0;
        tryAdvance();
      };
      audio.onerror = () => {
        clearInterval(timerRef.current);
        setPlaying(false);
        playingRef.current = false;
        setError('Could not play audio. Check your connection and try again.');
      };

      await audio.play();
    } catch (e) {
      setLoading(false);
      setPlaying(false);
      playingRef.current = false;
      if (e.name === 'NotAllowedError') {
        setError('Tap Play again — browser requires a direct tap to start audio.');
      } else {
        setError(`Playback error: ${e.message || 'unknown'}. Try again.`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Web Speech fallback (offline)
  // ─────────────────────────────────────────────────────────────────────────────

  function playOffline(fromChar = 0) {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) { setError('Text-to-speech is not available in this browser.'); return; }

    const text = chapterText.slice(fromChar);
    if (!text.trim()) return;

    const Ctor = window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance;
    if (!Ctor) { setError('Speech synthesis not supported in this browser.'); return; }

    const utt = new Ctor(text);
    // Pick best local device voice automatically
    const voice = getBestOfflineVoice();
    if (voice) { utt.voice = voice; utt.lang = voice.lang || 'en-US'; }
    else { utt.lang = 'en-US'; }
    utt.rate = rateRef.current;
    utt.pitch = 1.0;
    utt.volume = 1.0;

    utt.onboundary = (e) => {
      if (e.name === 'word') {
        charRef.current = fromChar + e.charIndex;
        const pct = Math.min(100, Math.round(((fromChar + e.charIndex) / Math.max(1, chapterText.length)) * 100));
        setProgress(pct);
      }
    };
    utt.onend = () => {
      clearInterval(timerRef.current);
      setPlaying(false);
      playingRef.current = false;
      setProgress(100);
      charRef.current = 0;
      pausedAt.current = 0;
      tryAdvance();
    };
    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      clearInterval(timerRef.current);
      setPlaying(false);
      playingRef.current = false;
      if (e.error === 'not-allowed') {
        setError('Tap Play again — browser requires a direct tap to start audio on mobile.');
      } else if (e.error === 'synthesis-failed' || e.error === 'synthesis-unavailable') {
        setError('Voice synthesis failed. Reload the page and try again.');
      } else if (e.error === 'audio-busy') {
        setError('Audio is busy. Pause other audio on this device, then tap Play again.');
      } else {
        setError(`Voice error: ${e.error || 'unknown'}. Tap Play to retry.`);
      }
    };

    uttRef.current = utt;

    // iOS: cancel() is async — wait two frames before speaking
    const doSpeak = () => {
      synth.cancel();
      if (isIOS) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          synth.speak(utt);
          setPlaying(true);
          playingRef.current = true;
          startedAt.current = Date.now() - pausedAt.current * 1000;
          startElapsedTimer();
        }));
      } else {
        synth.speak(utt);
        setPlaying(true);
        playingRef.current = true;
        startedAt.current = Date.now() - pausedAt.current * 1000;
        startElapsedTimer();
      }
    };
    doSpeak();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Transport handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    setError('');

    if (playing) {
      // ── Pause ──
      if (online) {
        audioRef.current?.pause();
        // onpause handler updates state
      } else {
        const synth = window.speechSynthesis;
        if (isIOS) {
          // iOS doesn't support pause — stop and remember position
          pausedAt.current = elapsed;
          synth?.cancel();
          clearInterval(timerRef.current);
          setPlaying(false);
          playingRef.current = false;
        } else {
          synth?.pause();
          clearInterval(timerRef.current);
          pausedAt.current = elapsed;
          setPlaying(false);
          playingRef.current = false;
        }
      }
      return;
    }

    // ── Play / Resume ──
    if (online) {
      if (audioRef.current && audioRef.current.src && audioRef.current.paused) {
        // Resume paused cloud audio
        audioRef.current.play().catch(() => playCloud(charRef.current));
      } else {
        playCloud(charRef.current);
      }
    } else {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
      if (!isIOS && synth?.paused) {
        synth.resume();
        startedAt.current = Date.now() - pausedAt.current * 1000;
        setPlaying(true);
        playingRef.current = true;
        startElapsedTimer();
      } else {
        playOffline(charRef.current);
      }
    }
  }, [playing, online, elapsed, isIOS]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = useCallback(() => {
    stopAll();
    charRef.current = 0;
    setProgress(0);
    setElapsed(0);
    pausedAt.current = 0;
    setError('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRewind = useCallback(() => {
    const words = Math.round((15 * 180 * rateRef.current) / 60);
    const before = chapterText.slice(0, charRef.current).split(/\s+/);
    const trimmed = before.slice(0, Math.max(0, before.length - words)).join(' ');
    const newChar = trimmed.length;
    charRef.current = newChar;
    setProgress(Math.round((newChar / Math.max(1, chapterText.length)) * 100));
    pausedAt.current = 0;
    if (playingRef.current) {
      stopAll();
      if (online) playCloud(newChar);
      else playOffline(newChar);
    }
  }, [chapterText, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = useCallback(() => {
    const next = currentChapter + 1;
    if (next >= chapters.length) return;
    if (typeof canAccessChapter === 'function' && !canAccessChapter(next)) {
      onChapterBlocked?.(next);
      return;
    }
    onChapterChange(next);
  }, [currentChapter, chapters.length, canAccessChapter, onChapterBlocked, onChapterChange]);

  const handleClose = useCallback(() => {
    stopAll();
    onClose?.();
  }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRate = (r) => {
    setRate(r);
    rateRef.current = r;
    savePrefs({ rate: r });
    if (audioRef.current) audioRef.current.playbackRate = r;
    if (playingRef.current && !online) {
      stopAll();
      playOffline(charRef.current);
    }
  };

  const seekTo = (pct) => {
    const newChar = Math.round(pct * chapterText.length);
    charRef.current = newChar;
    setProgress(Math.round(pct * 100));
    pausedAt.current = 0;
    if (playingRef.current) {
      stopAll();
      if (online) playCloud(newChar);
      else playOffline(newChar);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Drag
  // ─────────────────────────────────────────────────────────────────────────────

  function clientPt(e) {
    if (e.touches?.[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function onDragStart(e) {
    if (e.type === 'mousedown' && e.button !== 0) return;
    if (e.target.closest?.('button,a,input,select')) return;
    const pt = clientPt(e);
    const cur = posRef.current || defaultDockPos(panelSizeRef.current);
    dragOffset.current = { x: pt.x - cur.x, y: pt.y - cur.y };
    draggingRef.current = true;
    setDragging(true);
    if (e.cancelable) e.preventDefault();
  }

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const pt = clientPt(e);
      const next = clampPos({ x: pt.x - dragOffset.current.x, y: pt.y - dragOffset.current.y }, panelSizeRef.current);
      posRef.current = next;
      setPos(next);
      if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      savePrefs({ panelPos: posRef.current, panelSize: panelSizeRef.current });
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('mousemove',   onMove, { passive: false });
    window.addEventListener('touchmove',   onMove, { passive: false });
    window.addEventListener('pointerup',   onUp);
    window.addEventListener('mouseup',     onUp);
    window.addEventListener('touchend',    onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove',   onMove);
      window.removeEventListener('touchmove',   onMove);
      window.removeEventListener('pointerup',   onUp);
      window.removeEventListener('mouseup',     onUp);
      window.removeEventListener('touchend',    onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const fmtTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const dockPos = pos || defaultDockPos(panelSize);
  const available = typeof window !== 'undefined'
    && (online || (window.speechSynthesis && (window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance)));

  // ─── Window controls (minimize / close) ──────────────────────────────────────
  const windowControls = (
    <div className="listen-dock__win">
      <button
        type="button" className="listen-dock__win-btn"
        title={panelSize === 'min' ? 'Expand' : 'Minimize'}
        aria-label={panelSize === 'min' ? 'Expand player' : 'Minimize player'}
        onClick={() => {
          const next = panelSize === 'min' ? 'normal' : 'min';
          setPanelSize(next);
          panelSizeRef.current = next;
          setPos(p => {
            const clamped = clampPos(p || defaultDockPos(next), next);
            posRef.current = clamped;
            savePrefs({ panelSize: next, panelPos: clamped });
            return clamped;
          });
        }}
      >
        <span aria-hidden="true">{panelSize === 'min' ? '□' : '─'}</span>
      </button>
      <button
        type="button"
        className="listen-dock__win-btn listen-dock__win-btn--close"
        title="Close listen player" aria-label="Close listen player"
        onClick={handleClose}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );

  // ─── Progress bar ─────────────────────────────────────────────────────────────
  const progressBar = (
    <div className="listen-dock__progress">
      <span className="listen-dock__time">{fmtTime(elapsed)}</span>
      <div
        className="listen-dock__track"
        role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        }}
        onTouchEnd={e => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const touch = e.changedTouches[0];
          seekTo(Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)));
        }}
      >
        <div className="listen-dock__fill" style={{ width: `${progress}%` }} />
        <div className="listen-dock__thumb" style={{ left: `${progress}%` }} />
      </div>
      <span className="listen-dock__time">{fmtTime(total)}</span>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Panel
  // ─────────────────────────────────────────────────────────────────────────────
  const panel = !available ? (
    <div className="listen-dock listen-dock--normal" style={{ left: dockPos.x, top: dockPos.y }} role="dialog" aria-label="Listen player">
      <div className="listen-dock__chrome"><span className="listen-dock__brand">Listen</span>{windowControls}</div>
      <p className="listen-dock__unsupported">
        Text-to-speech is not available in this browser. Try Chrome, Edge, Safari, or Firefox — then tap Play.
      </p>
    </div>
  ) : (
    <div
      ref={panelRef}
      className={['listen-dock', `listen-dock--${panelSize}`, dragging ? 'listen-dock--dragging' : '', playing ? 'listen-dock--playing' : ''].filter(Boolean).join(' ')}
      style={{ left: dockPos.x, top: dockPos.y }}
      role="dialog" aria-label="Listen player" aria-modal="false"
    >
      {/* ── Chrome / drag handle ── */}
      <div className="listen-dock__chrome" onPointerDown={onDragStart} onMouseDown={onDragStart} onTouchStart={onDragStart}>
        <div className="listen-dock__drag">
          <span className="listen-dock__grip" aria-hidden="true">⋮⋮</span>
          <span className="listen-dock__icon"><IcoHeadphones /></span>
          <div className="listen-dock__titles">
            <strong className="listen-dock__title">{chapters[currentChapter]?.title || 'Listening…'}</strong>
            {panelSize !== 'min' && (
              <span className="listen-dock__sub">
                Ch {currentChapter + 1} of {chapters.length}
                {loading ? ' · Loading…' : playing ? ' · Playing' : ''}
                {' · '}<span className={online ? 'listen-dock__badge' : 'listen-dock__badge listen-dock__badge--local'}>
                  {online ? 'Ellinea' : 'Offline'}
                </span>
              </span>
            )}
          </div>
        </div>
        {windowControls}
      </div>

      {/* ── Mini mode ── */}
      {panelSize === 'min' ? (
        <div className="listen-dock__mini">
          <button className="listen-dock__btn listen-dock__btn--play" title={playing ? 'Pause' : 'Play'} onClick={handlePlay} type="button" disabled={loading}>
            {loading ? '…' : playing ? <IcoPause /> : <IcoPlay />}
          </button>
          <div className="listen-dock__mini-main">
            <span className="listen-dock__mini-meta">{fmtTime(elapsed)} / {fmtTime(total)} · {rate}×</span>
            {progressBar}
          </div>
        </div>
      ) : (
        /* ── Normal mode ── */
        <div className="listen-dock__body">

          {/* Transport */}
          <div className="listen-dock__transport">
            <button className="listen-dock__btn" title="Rewind 15s" onClick={handleRewind} type="button" disabled={loading}><IcoRewind /></button>
            <button className="listen-dock__btn listen-dock__btn--play" title={playing ? 'Pause' : 'Play'} onClick={handlePlay} type="button" disabled={loading}>
              {loading ? <span style={{ fontSize: '0.75rem', letterSpacing: 1 }}>●●●</span> : playing ? <IcoPause /> : <IcoPlay />}
            </button>
            <button className="listen-dock__btn" title="Stop" onClick={handleStop} type="button"><IcoStop /></button>
            <button className="listen-dock__btn" title="Next chapter" onClick={handleSkip} type="button" disabled={currentChapter >= chapters.length - 1}><IcoSkip /></button>
          </div>

          {progressBar}

          {/* Error banner */}
          {error && (
            <div role="alert" style={{ margin:'6px 0 2px', padding:'7px 10px', background:'rgba(220,53,69,0.15)', border:'1px solid rgba(220,53,69,0.45)', borderRadius:6, color:'#ff8a8a', fontSize:'0.82rem', lineHeight:1.4, display:'flex', gap:6, alignItems:'flex-start' }}>
              <span aria-hidden="true" style={{ flexShrink:0 }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Speed pills */}
          <div className="listen-dock__speeds" role="group" aria-label="Playback speed">
            {[0.75, 0.95, 1.0, 1.25, 1.5].map(r => (
              <button key={r} type="button" className={'listen-dock__speed' + (rate === r ? ' on' : '')} onClick={() => updateRate(r)}>
                {r === 0.95 ? '0.95×' : r === 1.0 ? '1×' : `${r}×`}
              </button>
            ))}
          </div>

        </div>
      )}
    </div>
  );

  if (!portalReady || typeof document === 'undefined' || !document.body) return null;
  return createPortal(panel, document.body);
}
