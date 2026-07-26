/**
 * AudioPlayer — floating, draggable Web Speech listen dock for the Reader.
 * Minimize / maximize / close; does not push page content.
 */
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const AUDIO_PREFS_KEY = 'eh_audio_prefs';

function loadAudioPrefs() {
  try {
    return JSON.parse(localStorage.getItem(AUDIO_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAudioPrefs(partial) {
  try {
    const next = { ...loadAudioPrefs(), ...partial };
    localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

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
const IcoGear = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.47.47 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.37 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
);

function isEnglishVoice(v) {
  return /^en([-_]|$)/i.test(v?.lang || '');
}

function isNeuralVoice(v) {
  if (!v) return false;
  if (/microsoft.*(jenny|aria|guy|davis|emma|brian|ana|andrew|ryan|sonia|libby|mia|neerja|ravi|clara|liam|natasha|olivia|james|luna|neural)/i.test(v.name)) return true;
  if (/^google /i.test(v.name)) return true;
  if (/\b(neural|natural|enhanced|premium|wavenet|studio)\b/i.test(v.name)) return true;
  if (/^(ava|allison|samantha|karen|moira|tessa|fiona|victoria|nicky|frederica|joana|mariana|luciana|isabel|paola|soledad|monica|jorge|juan|pablo|diego|enrique|carlos|ximena|angelica)/i.test(v.name) && isEnglishVoice(v)) return true;
  if (/samsung/i.test(v.name) && /female|male|neural|enhanced/i.test(v.name)) return true;
  if (v.voiceURI && /x-nob|x-sfg|x-iob|x-tpf|x-iom/i.test(v.voiceURI)) return true;
  return false;
}

function isGoogleNeural(v) {
  return !!v && /^google /i.test(v.name);
}

function isRoboticDesktop(v) {
  if (!v) return false;
  // Prefer demoting classic Microsoft Desktop / eSpeak voices
  if (/microsoft.*(desktop|david|zira|mark|hazel|susan)/i.test(v.name) && !isNeuralVoice(v)) return true;
  if (/espeak|festival|robot/i.test(v.name)) return true;
  return false;
}

const FEMALE_NAME_RE = /\b(jenny|aria|emma|sonia|libby|mia|ana|neerja|zira|hazel|susan|karen|samantha|victoria|fiona|moira|tessa|veena|raveena|heera|manjari|lekha|kalpana|asha|ava|allison|joana|mariana|luciana|isabel|paola|soledad|monica|angelica|ximena|paulina|lucia|almudena|marta|zosia|ewa|ioana|laila|fatima|tamar|leila|hessa|linh|naayf|yan|meijia|tingting|sinji|milena|yelena|irina|katya|anna|vicki|alice|amelie|julie|aurelie|petra|katrin|hanna|lotte|claire|ellen|nora|carmit|sara|yuna|kyoko|caroline|catherine|denise|hortense|elise|marie|linda|heami|nanami|ayumi|haruka|seo-hyeon|sun-hi)\b/i;
const MALE_NAME_RE = /\b(guy|davis|brian|andrew|ryan|mark|david|daniel|alex|james|george|reed|fred|rishi|luca|diego|jorge|pablo|miguel|ivan|enrique|carlos|juan|william|liam|thomas|oliver|harry|arthur|richard|christopher|eric|steffan|geraint|gordon|wayne)\b/i;

function isFemaleVoice(v) {
  if (!v) return false;
  const n = (v.name || '').toLowerCase();
  const uri = (v.voiceURI || '').toLowerCase();
  if (/\bfemale\b|\bwoman\b|\bfemme\b/.test(n) || /\bfemale\b/.test(uri)) return true;
  if (/\bmale\b/.test(n) && !/\bfemale\b/.test(n)) return false;
  if (FEMALE_NAME_RE.test(n)) return true;
  if (/^google uk english female/i.test(v.name) || /samsung.*female/i.test(v.name)) return true;
  return false;
}

function isMaleVoice(v) {
  if (!v) return false;
  const n = (v.name || '').toLowerCase();
  const uri = (v.voiceURI || '').toLowerCase();
  // Never use includes('man') — it false-matches German, Romanian, etc.
  if (/\bfemale\b|\bwoman\b|\bfemme\b/.test(n) || /\bfemale\b/.test(uri)) return false;
  if (/\bmale\b/.test(n) || /\bhomme\b/.test(n) || (/\bmale\b/.test(uri) && !/\bfemale\b/.test(uri))) return true;
  if (MALE_NAME_RE.test(n)) return true;
  if (/^google uk english male/i.test(v.name) || /samsung.*male/i.test(v.name)) return true;
  return false;
}

function voiceQualityScore(v) {
  // Prefer English for this English-language library
  if (isEnglishVoice(v) && isNeuralVoice(v)) return 0;
  if (isEnglishVoice(v) && v.localService) return 1;
  if (isEnglishVoice(v)) return 2;
  if (isNeuralVoice(v)) return 3;
  if (isRoboticDesktop(v)) return 5;
  return 4;
}

function sortVoicesNeuralFirst(list) {
  return [...list].sort((a, b) => {
    const qa = voiceQualityScore(a);
    const qb = voiceQualityScore(b);
    if (qa !== qb) return qa - qb;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function pickBestVoice(voiceList) {
  if (!voiceList.length) return null;
  const english = voiceList.filter(isEnglishVoice);
  const pool = english.length ? english : voiceList;
  const PRIORITY = [
    'Microsoft Jenny', 'Microsoft Aria', 'Microsoft Emma', 'Microsoft Sonia',
    'Microsoft Libby', 'Microsoft Mia', 'Microsoft Ana', 'Microsoft Neerja',
    'Microsoft Guy', 'Microsoft Davis', 'Microsoft Brian', 'Microsoft Andrew',
    'Microsoft Ryan',
    'Google UK English Female', 'Google US English', 'Google UK English Male',
    'Ava', 'Allison', 'Samantha', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Victoria',
    'Samsung English Female', 'Samsung English Male',
  ];
  for (const name of PRIORITY) {
    const v = pool.find(x => x.name.startsWith(name));
    if (v) return v;
  }
  return sortVoicesNeuralFirst(pool)[0] || pool[0];
}

function defaultPanelPos(size = 'normal') {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  const w = size === 'min' ? 300 : size === 'max' ? Math.min(440, window.innerWidth - 24) : 360;
  const h = size === 'min' ? 64 : size === 'max' ? 420 : 200;
  return {
    x: Math.max(12, window.innerWidth - w - 20),
    y: Math.max(12, window.innerHeight - h - 96),
  };
}

function clampPos(pos, size = 'normal') {
  if (typeof window === 'undefined' || !pos) return pos;
  const w = size === 'min' ? 300 : size === 'max' ? Math.min(440, window.innerWidth - 24) : 360;
  const h = size === 'min' ? 64 : size === 'max' ? Math.min(520, window.innerHeight - 24) : 220;
  return {
    x: Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - Math.min(h, 120) - 8)),
  };
}

export default function AudioPlayer({
  chapters,
  currentChapter,
  onChapterChange,
  canAccessChapter,
  onChapterBlocked,
  onClose,
}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const saved = loadAudioPrefs();
  const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/i.test(navigator.userAgent);

  const tryAdvanceChapter = (next) => {
    if (typeof canAccessChapter === 'function' && !canAccessChapter(next)) {
      onChapterBlocked?.(next);
      return false;
    }
    onChapterChange(next);
    return true;
  };

  const [playing, setPlaying] = useState(false);
  const [voices, setVoices] = useState([]);
  const [voicesReady, setVoicesReady] = useState(false);
  const [rate, setRate] = useState(() => (typeof saved.rate === 'number' ? saved.rate : 1.0));
  const [pitch, setPitch] = useState(() => (typeof saved.pitch === 'number' ? saved.pitch : 1.0));
  const [panelSize, setPanelSize] = useState(() => (
    ['min', 'normal', 'max'].includes(saved.panelSize) ? saved.panelSize : 'normal'
  ));
  const [pos, setPos] = useState(() => {
    if (saved.panelPos?.x != null && saved.panelPos?.y != null) {
      return clampPos(saved.panelPos, saved.panelSize || 'normal');
    }
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  // Books are English — default the picker to English voices so users aren't stuck on fr-CA etc.
  const [langScope, setLangScope] = useState('en');
  const [voiceDdOpen, setVoiceDdOpen] = useState(false);
  const [selectedName, setSelectedName] = useState(() => saved.voiceName || '');

  const uttRef = useRef(null);
  const charRef = useRef(0);
  const timerRef = useRef(null);
  const keepAliveRef = useRef(null);
  const startedAt = useRef(0);
  const pausedAt = useRef(0);
  const selectedNameRef = useRef(saved.voiceName || '');
  const rateRef = useRef(rate);
  const pitchRef = useRef(pitch);
  const playingRef = useRef(false);
  const boundarySeenRef = useRef(false);
  const speakFromRef = useRef(0);
  const ddWrapRef = useRef(null);
  const panelRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  const panelSizeRef = useRef(panelSize);

  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { panelSizeRef.current = panelSize; }, [panelSize]);

  // Place dock once on mount if no saved position
  useEffect(() => {
    if (pos) return undefined;
    const next = defaultDockPos(panelSize);
    setPos(next);
    posRef.current = next;
    return undefined;
  }, [pos, panelSize]);

  // Keep dock on-screen when viewport changes
  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPos(p || defaultDockPos(panelSizeRef.current), panelSizeRef.current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function persistPanel(nextSize, nextPos) {
    const size = nextSize ?? panelSizeRef.current;
    const p = nextPos ?? posRef.current;
    saveAudioPrefs({ panelSize: size, panelPos: p });
  }

  function setPanelSizeAndPersist(size) {
    setPanelSize(size);
    panelSizeRef.current = size;
    setVoiceDdOpen(false);
    setPos((p) => {
      const next = clampPos(p || defaultDockPos(size), size);
      posRef.current = next;
      persistPanel(size, next);
      return next;
    });
  }

  function onDragPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest?.('button, a, input, select, textarea, [role="listbox"], [role="option"]')) return;
    const current = posRef.current || defaultDockPos(panelSizeRef.current);
    dragOffset.current = { x: e.clientX - current.x, y: e.clientY - current.y };
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onDragPointerMove(e) {
    if (!draggingRef.current) return;
    const next = clampPos({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    }, panelSizeRef.current);
    posRef.current = next;
    setPos(next);
  }

  function onDragPointerUp(e) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    persistPanel(panelSizeRef.current, posRef.current);
  }

  function handleClose() {
    if (synth) synth.cancel();
    clearInterval(timerRef.current);
    clearInterval(keepAliveRef.current);
    setPlaying(false);
    playingRef.current = false;
    onClose?.();
  }

  const chapterText = chapters[currentChapter]?.text || '';

  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { pitchRef.current = pitch; }, [pitch]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  function persistVoiceSettings(next = {}) {
    const voiceName = next.voiceName !== undefined ? next.voiceName : selectedNameRef.current;
    const nextRate = next.rate !== undefined ? next.rate : rateRef.current;
    const nextPitch = next.pitch !== undefined ? next.pitch : pitchRef.current;
    saveAudioPrefs({ voiceName, rate: nextRate, pitch: nextPitch });
  }

  function applyVoices(raw) {
    if (!raw?.length) return;
    const sorted = sortVoicesNeuralFirst(raw);
    setVoices(sorted);
    setVoicesReady(true);

    if (selectedNameRef.current) {
      const found = sorted.find(x => x.name === selectedNameRef.current);
      // Keep a saved English voice; migrate away from non-English picks (e.g. fr-CA Caroline)
      // so Listen mode defaults to voices that match the library language.
      if (found && isEnglishVoice(found)) {
        setSelectedName(found.name);
        return;
      }
    }
    const best = pickBestVoice(sorted);
    if (best) {
      selectedNameRef.current = best.name;
      setSelectedName(best.name);
      persistVoiceSettings({ voiceName: best.name });
    }
  }

  // Voice loading
  useEffect(() => {
    if (!synth) return undefined;
    let cancelled = false;
    let pollHandle = null;
    let attempt = 0;

    const tryLoad = () => {
      if (cancelled) return;
      const v = synth.getVoices();
      if (v.length) {
        applyVoices(v);
        return;
      }
      attempt += 1;
      if (attempt <= 8) {
        pollHandle = setTimeout(tryLoad, Math.min(50 * Math.pow(2, attempt - 1), 1000));
      }
    };

    const onVoices = () => {
      const v = synth.getVoices();
      if (v.length) {
        clearTimeout(pollHandle);
        applyVoices(v);
      }
    };

    synth.addEventListener?.('voiceschanged', onVoices);
    synth.onvoiceschanged = onVoices;
    tryLoad();

    return () => {
      cancelled = true;
      clearTimeout(pollHandle);
      synth.removeEventListener?.('voiceschanged', onVoices);
      synth.onvoiceschanged = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chrome keep-alive — skip iOS (pause/resume breaks speech there)
  useEffect(() => {
    if (!synth) return undefined;
    if (playing && !isIOS) {
      keepAliveRef.current = setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      }, 10000);
    } else {
      clearInterval(keepAliveRef.current);
    }
    return () => clearInterval(keepAliveRef.current);
  }, [playing, isIOS, synth]);

  // Close voice dropdown on outside click / touch
  useEffect(() => {
    if (!voiceDdOpen) return undefined;

    const handleOutside = (e) => {
      const el = ddWrapRef.current;
      if (el && !el.contains(e.target)) setVoiceDdOpen(false);
    };

    document.addEventListener('pointerdown', handleOutside, true);
    document.addEventListener('touchend', handleOutside, true);
    document.addEventListener('mousedown', handleOutside, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutside, true);
      document.removeEventListener('touchend', handleOutside, true);
      document.removeEventListener('mousedown', handleOutside, true);
    };
  }, [voiceDdOpen]);

  // Reset on chapter change
  useEffect(() => {
    stopSpeech();
    charRef.current = 0;
    setProgress(0);
    setElapsed(0);
    const ch = chapters[currentChapter] || {};
    const fullText = [(ch.title || ''), (ch.subtitle || ''), (chapterText || '')].join(' ');
    const words = fullText.split(/\s+/).filter(Boolean).length;
    const wpm = Math.round(180 * (rate || 1.0));
    setTotal(Math.round((words / wpm) * 60));
  }, [currentChapter, chapterText]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (synth) synth.cancel();
    clearInterval(timerRef.current);
    clearInterval(keepAliveRef.current);
  }, [synth]);

  function stopSpeech() {
    if (synth) synth.cancel();
    clearInterval(timerRef.current);
    clearInterval(keepAliveRef.current);
    setPlaying(false);
    playingRef.current = false;
    pausedAt.current = 0;
    boundarySeenRef.current = false;
  }

  function filteredVoices() {
    if (!voices.length) return [];
    let list = voices;
    if (langScope === 'en') list = list.filter(isEnglishVoice);
    if (filter === 'neural') return list.filter(isNeuralVoice);
    if (filter === 'female') return list.filter(isFemaleVoice);
    if (filter === 'male') return list.filter(isMaleVoice);
    return list;
  }

  function getSelectedVoice() {
    const live = synth?.getVoices?.() || voices;
    if (selectedNameRef.current) {
      const byName = live.find(v => v.name === selectedNameRef.current)
        || voices.find(v => v.name === selectedNameRef.current);
      if (byName) return byName;
    }
    const filtered = filteredVoices();
    return filtered[0] || voices[0] || live[0] || null;
  }

  function startElapsedTimer() {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt.current) / 1000);
      setElapsed(secs);

      // iOS / browsers without onboundary: estimate progress from elapsed time
      if (!boundarySeenRef.current && chapterText.length > 0 && playingRef.current) {
        const remaining = chapterText.slice(speakFromRef.current);
        const words = remaining.split(/\s+/).filter(Boolean).length || 1;
        const wpm = Math.max(60, Math.round(180 * (rateRef.current || 1)));
        const estTotalSec = (words / wpm) * 60;
        const spokenSec = Math.max(0, (Date.now() - startedAt.current) / 1000);
        const frac = Math.min(0.99, spokenSec / Math.max(1, estTotalSec));
        const approxChar = speakFromRef.current + Math.round(frac * remaining.length);
        charRef.current = approxChar;
        setProgress(Math.min(99, Math.round((approxChar / chapterText.length) * 100)));
      }
    }, 250);
  }

  function speak(fromChar = 0) {
    if (!synth) return;
    synth.cancel();
    clearInterval(timerRef.current);

    const text = chapterText.slice(fromChar);
    if (!text.trim()) return;

    const utt = new SpeechSynthesisUtterance(text);
    const selectedVoice = getSelectedVoice();
    if (selectedVoice) {
      utt.voice = selectedVoice;
      utt.lang = selectedVoice.lang || 'en-US';
    } else {
      utt.lang = 'en-US';
    }
    utt.rate = rateRef.current;
    utt.pitch = pitchRef.current;
    utt.volume = 1.0;

    boundarySeenRef.current = false;
    speakFromRef.current = fromChar;
    charRef.current = fromChar;

    utt.onboundary = (e) => {
      if (e.name === 'word') {
        boundarySeenRef.current = true;
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
      if (currentChapter < chapters.length - 1) {
        tryAdvanceChapter(currentChapter + 1);
      }
    };

    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      clearInterval(timerRef.current);
      setPlaying(false);
      playingRef.current = false;
    };

    uttRef.current = utt;
    synth.speak(utt);
    setPlaying(true);
    playingRef.current = true;
    startedAt.current = Date.now() - pausedAt.current * 1000;
    startElapsedTimer();
  }

  const handlePlay = () => {
    if (!synth) return;

    const currentVoices = synth.getVoices();
    if (currentVoices.length > 0 && !voicesReady) {
      applyVoices(currentVoices);
    }

    if (playing) {
      // iOS: pause() is unreliable — cancel and resume later from char offset
      if (isIOS) {
        pausedAt.current = elapsed;
        synth.cancel();
        clearInterval(timerRef.current);
        setPlaying(false);
        playingRef.current = false;
      } else {
        synth.pause();
        clearInterval(timerRef.current);
        pausedAt.current = elapsed;
        setPlaying(false);
        playingRef.current = false;
      }
      return;
    }

    // Resume
    if (isIOS) {
      // Always re-speak from last known char on iOS
      pausedAt.current = 0;
      speak(charRef.current);
      return;
    }

    if (synth.paused) {
      synth.resume();
      startedAt.current = Date.now() - pausedAt.current * 1000;
      setPlaying(true);
      playingRef.current = true;
      startElapsedTimer();
    } else {
      speak(charRef.current);
    }
  };

  const handleStop = () => {
    stopSpeech();
    charRef.current = 0;
    setProgress(0);
    setElapsed(0);
    pausedAt.current = 0;
  };

  const seekToChar = (newChar) => {
    charRef.current = newChar;
    setProgress(Math.round((newChar / Math.max(1, chapterText.length)) * 100));
    pausedAt.current = 0;
    if (playing) speak(newChar);
  };

  const handleRewind = () => {
    const words = Math.round((15 * (180 * rate)) / 60);
    const textBefore = chapterText.slice(0, charRef.current);
    const wordArr = textBefore.split(/\s+/);
    const newWords = wordArr.slice(0, Math.max(0, wordArr.length - words));
    seekToChar(newWords.join(' ').length);
  };

  const handleSkip = () => {
    if (currentChapter < chapters.length - 1) tryAdvanceChapter(currentChapter + 1);
  };

  const fmtTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const updateRate = (r) => {
    setRate(r);
    rateRef.current = r;
    persistVoiceSettings({ rate: r });
    if (playing) speak(charRef.current);
  };

  const updatePitch = (p) => {
    setPitch(p);
    pitchRef.current = p;
    persistVoiceSettings({ pitch: p });
    if (playing) speak(charRef.current);
  };

  const selectVoice = (v) => {
    selectedNameRef.current = v.name || '';
    setSelectedName(v.name || '');
    persistVoiceSettings({ voiceName: v.name || '' });
    setVoiceDdOpen(false);
    if (playing) speak(charRef.current);
  };

  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const dispVoices = filteredVoices();
  const activeVoice = getSelectedVoice();
  const englishCount = voices.filter(isEnglishVoice).length;
  const showSettings = panelSize === 'max';
  const dockPos = pos || defaultDockPos(panelSize);

  const progressBlock = (
    <div className="audio-player__progress-row">
      <span className="audio-player__time">{fmtTime(elapsed)}</span>
      <div
        className="audio-player__track"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seekToChar(Math.round(pct * chapterText.length));
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const touch = e.changedTouches[0];
          const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
          seekToChar(Math.round(pct * chapterText.length));
        }}
      >
        <div className="audio-player__fill" style={{ width: `${progress}%` }} />
        <div className="audio-player__thumb" style={{ left: `${progress}%` }} />
      </div>
      <span className="audio-player__time">{fmtTime(total)}</span>
    </div>
  );

  const windowControls = (
    <div className="audio-float__win">
      <button
        type="button"
        className="audio-float__win-btn"
        title="Minimize"
        aria-label="Minimize player"
        onClick={() => setPanelSizeAndPersist('min')}
      >
        <span aria-hidden="true">─</span>
      </button>
      <button
        type="button"
        className="audio-float__win-btn"
        title={panelSize === 'max' ? 'Restore' : 'Maximize'}
        aria-label={panelSize === 'max' ? 'Restore player' : 'Maximize player'}
        onClick={() => setPanelSizeAndPersist(panelSize === 'max' ? 'normal' : 'max')}
      >
        <span aria-hidden="true">{panelSize === 'max' ? '❐' : '□'}</span>
      </button>
      <button
        type="button"
        className="audio-float__win-btn audio-float__win-btn--close"
        title="Close listen player"
        aria-label="Close listen player"
        onClick={handleClose}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );

  const panel = !available ? (
    <div
      className="audio-player audio-float audio-float--normal audio-player--unsupported"
      style={{ left: dockPos.x, top: dockPos.y }}
      role="dialog"
      aria-label="Listen player"
    >
      <div className="audio-float__chrome">
        <span className="audio-float__drag-hint">Listen</span>
        {windowControls}
      </div>
      <p className="audio-float__unsupported-msg">
        Text-to-speech is not supported in this browser. Try Chrome, Edge, or Safari.
      </p>
    </div>
  ) : (
    <div
      ref={panelRef}
      className={[
        'audio-player',
        'audio-float',
        `audio-float--${panelSize}`,
        dragging ? 'audio-float--dragging' : '',
        playing ? 'audio-float--playing' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: dockPos.x, top: dockPos.y }}
      role="dialog"
      aria-label="Listen player"
      aria-modal="false"
    >
      <div
        className="audio-float__chrome"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
      >
        <div className="audio-float__drag">
          <span className="audio-float__grip" aria-hidden="true">⋮⋮</span>
          <span className="audio-player__icon"><IcoHeadphones /></span>
          <div className="audio-float__titles">
            <strong className="audio-player__title">
              {chapters[currentChapter]?.title || 'Listening…'}
            </strong>
            {panelSize !== 'min' && (
              <span className="audio-player__sub">
                Ch {currentChapter + 1} of {chapters.length}
                {playing ? ' · Playing' : ''}
              </span>
            )}
          </div>
        </div>
        {windowControls}
      </div>

      {panelSize === 'min' ? (
        <div className="audio-float__mini">
          <button
            className="audio-btn audio-btn--play"
            title={playing ? 'Pause' : 'Play'}
            onClick={handlePlay}
            type="button"
          >
            {playing ? <IcoPause /> : <IcoPlay />}
          </button>
          <div className="audio-float__mini-main">
            <span className="audio-float__mini-meta">
              {fmtTime(elapsed)} / {fmtTime(total)} · {rate}×
            </span>
            {progressBlock}
          </div>
          <button
            type="button"
            className="audio-float__expand"
            title="Expand player"
            onClick={() => setPanelSizeAndPersist('normal')}
          >
            Expand
          </button>
        </div>
      ) : (
        <>
          <div className="audio-player__centre">
            <div className="audio-player__controls">
              <button className="audio-btn" title="Rewind 15s" onClick={handleRewind} type="button"><IcoRewind /></button>
              <button className="audio-btn audio-btn--play" title={playing ? 'Pause' : 'Play'} onClick={handlePlay} type="button">
                {playing ? <IcoPause /> : <IcoPlay />}
              </button>
              <button className="audio-btn" title="Stop" onClick={handleStop} type="button"><IcoStop /></button>
              <button
                className="audio-btn"
                title="Next chapter"
                onClick={handleSkip}
                disabled={currentChapter >= chapters.length - 1}
                type="button"
              >
                <IcoSkip />
              </button>
              <button
                className={'audio-btn audio-btn--gear' + (showSettings ? ' on' : '')}
                onClick={() => setPanelSizeAndPersist(showSettings ? 'normal' : 'max')}
                title={`Voice settings${voices.length ? ` (${voices.length} voices)` : ''}`}
                type="button"
              >
                <IcoGear />
              </button>
            </div>
            {progressBlock}
            <div className="audio-float__speed-row">
              {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
                <button
                  key={r}
                  type="button"
                  className={'audio-speed-pill' + (rate === r ? ' on' : '')}
                  onClick={() => updateRate(r)}
                  title={`${r}× speed`}
                >
                  {r === 1.0 ? '1×' : `${r}×`}
                </button>
              ))}
            </div>
          </div>

          {!voicesReady && voices.length === 0 && (
            <div className="audio-player__hint">Loading voices… Tap play to start.</div>
          )}

          {showSettings && (
            <div className="audio-settings">
              <div className="audio-settings__row">
                <label>Language</label>
                <div className="audio-filter-group">
                  {[
                    { id: 'en', label: `English (${englishCount})` },
                    { id: 'all', label: `All (${voices.length})` },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={'audio-filter-btn' + (langScope === f.id ? ' on' : '')}
                      onClick={() => { setLangScope(f.id); setVoiceDdOpen(true); }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="audio-settings__row">
                <label>Filter</label>
                <div className="audio-filter-group">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'neural', label: 'Neural' },
                    { id: 'female', label: 'Female' },
                    { id: 'male', label: 'Male' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={'audio-filter-btn' + (filter === f.id ? ' on' : '')}
                      onClick={() => { setFilter(f.id); setVoiceDdOpen(true); }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="audio-settings__row">
                <label>Voice ({dispVoices.length})</label>
                <div className="audio-custom-dd" ref={ddWrapRef}>
                  <button
                    className="audio-custom-dd__trigger"
                    type="button"
                    aria-expanded={voiceDdOpen}
                    aria-label={`Select voice — ${dispVoices.length} available`}
                    onClick={() => setVoiceDdOpen(o => !o)}
                  >
                    <span className="audio-custom-dd__trigger-text">
                      {activeVoice?.name || selectedName || 'Select voice'}
                      {activeVoice && isNeuralVoice(activeVoice) && (
                        <span className={'audio-neural-badge' + (isGoogleNeural(activeVoice) ? ' audio-neural-badge--google' : '')}>
                          {' '}Neural
                        </span>
                      )}
                      <small>{activeVoice?.lang}</small>
                    </span>
                    <span className="audio-active-tag">Active</span>
                    <span className={'audio-custom-dd__arrow' + (voiceDdOpen ? ' open' : '')}>▾</span>
                  </button>

                  {voiceDdOpen && (
                    <div className="audio-custom-dd__list" role="listbox">
                      {dispVoices.length === 0 && (
                        <div className="audio-custom-dd__empty">
                          {langScope === 'en'
                            ? 'No English voices for this filter. Try All languages.'
                            : 'No voices found for this filter'}
                        </div>
                      )}
                      {dispVoices.map((v) => (
                        <button
                          key={v.voiceURI || v.name}
                          type="button"
                          role="option"
                          aria-selected={selectedNameRef.current === v.name}
                          className={'audio-custom-dd__item' + (selectedNameRef.current === v.name ? ' on' : '')}
                          onClick={(e) => {
                            e.preventDefault();
                            selectVoice(v);
                          }}
                        >
                          <span className="audio-custom-dd__name">
                            {v.name}
                            {isNeuralVoice(v) && (
                              <span className={'audio-neural-badge' + (isGoogleNeural(v) ? ' audio-neural-badge--google' : '')}>
                                {' '}Neural
                              </span>
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
                <label>Speed {rate}×</label>
                <div className="audio-speed-pills">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={'audio-speed-pill' + (rate === r ? ' on' : '')}
                      onClick={() => updateRate(r)}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="audio-settings__row">
                <label>Pitch {pitch.toFixed(1)}</label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={pitch}
                  className="audio-slider"
                  onChange={(e) => updatePitch(parseFloat(e.target.value))}
                />
              </div>

              <p className="audio-settings__note">
                {voices.length ? `${englishCount} English / ${voices.length} total · ` : ''}
                Drag the header to move. Minimize to keep reading. Close returns to Read mode.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(panel, document.body);
}
