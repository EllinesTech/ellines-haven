/**
 * AudioPlayer — floating Listen dock (Web Speech API).
 *
 * "Ellinea Voice" is a display alias for the best Jenny-like English neural
 * system voice available on the device (Microsoft Jenny / Aria / Emma, or
 * Google neural female). Synthesis still uses that installed OS/browser voice;
 * this is not a proprietary offline TTS engine.
 */
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const AUDIO_PREFS_KEY = 'eh_audio_prefs';
/** Persisted marker: user wants the branded Ellinea alias (resolved to a real system voice). */
const ELLINEA_PREF = '__ellinea__';

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

function isRoboticDesktop(v) {
  if (!v) return false;
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
  if (/\bfemale\b|\bwoman\b|\bfemme\b/.test(n) || /\bfemale\b/.test(uri)) return false;
  if (/\bmale\b/.test(n) || /\bhomme\b/.test(n) || (/\bmale\b/.test(uri) && !/\bfemale\b/.test(uri))) return true;
  if (MALE_NAME_RE.test(n)) return true;
  if (/^google uk english male/i.test(v.name) || /samsung.*male/i.test(v.name)) return true;
  return false;
}

function englishPool(voiceList) {
  const english = voiceList.filter(isEnglishVoice);
  return english.length ? english : voiceList;
}

/** Prefer local (offline-capable) neural English voices. */
function voiceQualityScore(v) {
  if (!v) return 99;
  let score = 40;
  if (isEnglishVoice(v)) score -= 20;
  if (isNeuralVoice(v)) score -= 15;
  if (v.localService) score -= 10;
  if (isRoboticDesktop(v)) score += 25;
  return score;
}

function sortVoicesNeuralFirst(list) {
  return [...list].sort((a, b) => {
    const qa = voiceQualityScore(a);
    const qb = voiceQualityScore(b);
    if (qa !== qb) return qa - qb;
    // Local neural before online of same quality
    if (!!a.localService !== !!b.localService) return a.localService ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function findByPriority(pool, names) {
  for (const name of names) {
    const local = pool.find(x => x.name.startsWith(name) && x.localService);
    if (local) return local;
    const any = pool.find(x => x.name.startsWith(name));
    if (any) return any;
  }
  return null;
}

/** Jenny-like branded default — maps to a real installed neural voice. */
const ELLINEA_PRIORITY = [
  'Microsoft Jenny',
  'Microsoft Aria',
  'Microsoft Emma',
  'Microsoft Sonia',
  'Microsoft Libby',
  'Microsoft Mia',
  'Microsoft Ana',
  'Google UK English Female',
  'Google US English',
  'Ava',
  'Allison',
  'Samantha',
  'Karen',
  'Moira',
  'Tessa',
  'Fiona',
  'Victoria',
  'Samsung English Female',
];

const FEMALE_PRIORITY = [
  ...ELLINEA_PRIORITY,
  'Microsoft Neerja',
];

const MALE_PRIORITY = [
  'Microsoft Guy',
  'Microsoft Davis',
  'Microsoft Brian',
  'Microsoft Andrew',
  'Microsoft Ryan',
  'Google UK English Male',
  'Daniel',
  'Alex',
  'Fred',
  'James',
  'Oliver',
  'Arthur',
  'Samsung English Male',
];

function pickEllineaVoice(voiceList) {
  if (!voiceList.length) return null;
  const pool = englishPool(voiceList);
  const neuralFemale = pool.filter(v => isNeuralVoice(v) && !isRoboticDesktop(v) && isFemaleVoice(v));
  const neuralAny = pool.filter(v => isNeuralVoice(v) && !isRoboticDesktop(v));
  return (
    findByPriority(neuralFemale.length ? neuralFemale : pool, ELLINEA_PRIORITY)
    || findByPriority(neuralAny.length ? neuralAny : pool, ELLINEA_PRIORITY)
    || sortVoicesNeuralFirst(neuralFemale)[0]
    || sortVoicesNeuralFirst(neuralAny)[0]
    || sortVoicesNeuralFirst(pool)[0]
    || null
  );
}

function pickBestVoiceByGender(voiceList, gender) {
  if (!voiceList.length) return null;
  const pool = englishPool(voiceList);
  const match = gender === 'male' ? isMaleVoice : isFemaleVoice;
  const gendered = pool.filter(match);
  const priority = gender === 'male' ? MALE_PRIORITY : FEMALE_PRIORITY;
  const tryPick = (list) => {
    if (!list.length) return null;
    const hit = findByPriority(list, priority);
    if (hit) return hit;
    const neural = list.filter(v => isNeuralVoice(v) && !isRoboticDesktop(v));
    if (neural.length) return sortVoicesNeuralFirst(neural)[0];
    const natural = list.filter(v => !isRoboticDesktop(v));
    if (natural.length) return sortVoicesNeuralFirst(natural)[0];
    return sortVoicesNeuralFirst(list)[0];
  };
  return tryPick(gendered) || pickEllineaVoice(pool);
}

function detectVoiceGender(v) {
  if (!v) return null;
  if (isFemaleVoice(v)) return 'female';
  if (isMaleVoice(v)) return 'male';
  return null;
}

function defaultDockPos(size = 'normal') {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  const w = size === 'min' ? 300 : size === 'max' ? Math.min(400, window.innerWidth - 24) : 340;
  const h = size === 'min' ? 72 : size === 'max' ? 480 : 300;
  return {
    x: Math.max(12, window.innerWidth - w - 20),
    y: Math.max(12, window.innerHeight - h - 96),
  };
}

function clampPos(pos, size = 'normal') {
  if (typeof window === 'undefined' || !pos) return pos;
  const w = size === 'min' ? 300 : size === 'max' ? Math.min(400, window.innerWidth - 24) : 340;
  const h = size === 'min' ? 72 : size === 'max' ? Math.min(560, window.innerHeight - 24) : 320;
  return {
    x: Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - Math.min(h, 120) - 8)),
  };
}

function shortSystemName(name) {
  if (!name) return '';
  return name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s*\(Natural\)|\s*Online\s*\(Natural\)|\s*-\s*English\s*\(.*\)$/i, '')
    .trim() || name;
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
  const [showCfg, setShowCfg] = useState(false);
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
  const [filter, setFilter] = useState('neural');
  const [langScope, setLangScope] = useState('en');
  /** Real system voice name, or ELLINEA_PREF for branded default. */
  const [selectedName, setSelectedName] = useState(() => saved.voiceName || ELLINEA_PREF);
  const [portalReady, setPortalReady] = useState(false);
  const [ellineaMappedName, setEllineaMappedName] = useState('');

  const uttRef = useRef(null);
  const charRef = useRef(0);
  const timerRef = useRef(null);
  const keepAliveRef = useRef(null);
  const startedAt = useRef(0);
  const pausedAt = useRef(0);
  const selectedNameRef = useRef(saved.voiceName || ELLINEA_PREF);
  const rateRef = useRef(rate);
  const pitchRef = useRef(pitch);
  const playingRef = useRef(false);
  const boundarySeenRef = useRef(false);
  const speakFromRef = useRef(0);
  const panelRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  const panelSizeRef = useRef(panelSize);

  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { panelSizeRef.current = panelSize; }, [panelSize]);
  useEffect(() => { setPortalReady(true); }, []);

  useEffect(() => {
    if (pos) return undefined;
    const next = defaultDockPos(panelSize);
    setPos(next);
    posRef.current = next;
    return undefined;
  }, [pos, panelSize]);

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
    if (size === 'min') setShowCfg(false);
    setPos((p) => {
      const next = clampPos(p || defaultDockPos(size), size);
      posRef.current = next;
      persistPanel(size, next);
      return next;
    });
  }

  function clientPoint(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches[0]) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function onDragStart(e) {
    if (e.type === 'mousedown' && e.button !== 0) return;
    if (e.target.closest?.('button, a, input, select, textarea, [role="listbox"], [role="option"]')) return;
    const pt = clientPoint(e);
    const current = posRef.current || defaultDockPos(panelSizeRef.current);
    dragOffset.current = { x: pt.x - current.x, y: pt.y - current.y };
    draggingRef.current = true;
    setDragging(true);
    if (e.cancelable) e.preventDefault();
  }

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (e) => {
      if (!draggingRef.current) return;
      const pt = clientPoint(e);
      const next = clampPos({
        x: pt.x - dragOffset.current.x,
        y: pt.y - dragOffset.current.y,
      }, panelSizeRef.current);
      posRef.current = next;
      setPos(next);
      if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();
    };

    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      persistPanel(panelSizeRef.current, posRef.current);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
    };
  }, [dragging]);

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

    const ellinea = pickEllineaVoice(sorted);
    if (ellinea) setEllineaMappedName(ellinea.name);

    const pref = selectedNameRef.current;
    if (pref === ELLINEA_PREF || !pref) {
      selectedNameRef.current = ELLINEA_PREF;
      setSelectedName(ELLINEA_PREF);
      persistVoiceSettings({ voiceName: ELLINEA_PREF });
      return;
    }

    const found = sorted.find(x => x.name === pref);
    if (found && isEnglishVoice(found)) {
      setSelectedName(found.name);
      return;
    }

    // Saved voice missing or non-English — fall back to Ellinea
    selectedNameRef.current = ELLINEA_PREF;
    setSelectedName(ELLINEA_PREF);
    persistVoiceSettings({ voiceName: ELLINEA_PREF });
  }

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
    if (filter === 'female') return list.filter(v => isFemaleVoice(v) && isNeuralVoice(v));
    if (filter === 'male') return list.filter(v => isMaleVoice(v) && isNeuralVoice(v));
    return list;
  }

  function resolveSelectedVoice() {
    const live = synth?.getVoices?.() || voices;
    const pool = live.length ? live : voices;
    if (selectedNameRef.current === ELLINEA_PREF) {
      return pickEllineaVoice(pool) || pool.find(isEnglishVoice) || pool[0] || null;
    }
    if (selectedNameRef.current) {
      const byName = pool.find(v => v.name === selectedNameRef.current)
        || voices.find(v => v.name === selectedNameRef.current);
      if (byName) return byName;
    }
    return pickEllineaVoice(pool);
  }

  function startElapsedTimer() {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt.current) / 1000);
      setElapsed(secs);

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

    const Ctor = window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance;
    if (!Ctor) return;
    const utt = new Ctor(text);
    const selectedVoice = resolveSelectedVoice();
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

    if (isIOS) {
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

  const selectVoice = (v, { asEllinea = false } = {}) => {
    if (!v && !asEllinea) return;
    if (asEllinea) {
      selectedNameRef.current = ELLINEA_PREF;
      setSelectedName(ELLINEA_PREF);
      persistVoiceSettings({ voiceName: ELLINEA_PREF });
      setFilter('neural');
    } else {
      selectedNameRef.current = v.name || '';
      setSelectedName(v.name || '');
      persistVoiceSettings({ voiceName: v.name || '' });
      const g = detectVoiceGender(v);
      if (g) setFilter(g);
    }
    if (playing) speak(charRef.current);
  };

  const selectGender = (gender) => {
    setFilter(gender);
    setLangScope('en');
    const best = pickBestVoiceByGender(voices, gender);
    if (best) selectVoice(best);
  };

  const selectEllinea = () => {
    setLangScope('en');
    setFilter('neural');
    const v = pickEllineaVoice(voices);
    if (v) setEllineaMappedName(v.name);
    selectVoice(v, { asEllinea: true });
  };

  const UtteranceCtor = typeof window !== 'undefined'
    ? (window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance)
    : null;
  const available = !!(typeof window !== 'undefined' && window.speechSynthesis && UtteranceCtor);
  const dispVoices = filteredVoices();
  const activeVoice = resolveSelectedVoice();
  const usingEllinea = selectedName === ELLINEA_PREF;
  const activeGender = detectVoiceGender(activeVoice);
  const englishNeuralFemale = voices.filter(v => isEnglishVoice(v) && isNeuralVoice(v) && isFemaleVoice(v)).length;
  const englishNeuralMale = voices.filter(v => isEnglishVoice(v) && isNeuralVoice(v) && isMaleVoice(v)).length;
  const englishCount = voices.filter(isEnglishVoice).length;
  const dockPos = pos || defaultDockPos(panelSize);

  const displayVoiceLabel = usingEllinea
    ? 'Ellinea Voice'
    : shortSystemName(activeVoice?.name || selectedName) || 'Select voice';

  const progressBlock = (
    <div className="listen-dock__progress">
      <span className="listen-dock__time">{fmtTime(elapsed)}</span>
      <div
        className="listen-dock__track"
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
        <div className="listen-dock__fill" style={{ width: `${progress}%` }} />
        <div className="listen-dock__thumb" style={{ left: `${progress}%` }} />
      </div>
      <span className="listen-dock__time">{fmtTime(total)}</span>
    </div>
  );

  const windowControls = (
    <div className="listen-dock__win">
      <button
        type="button"
        className="listen-dock__win-btn"
        title="Minimize"
        aria-label="Minimize player"
        onClick={() => setPanelSizeAndPersist('min')}
      >
        <span aria-hidden="true">─</span>
      </button>
      <button
        type="button"
        className="listen-dock__win-btn"
        title={panelSize === 'max' ? 'Restore' : 'Maximize'}
        aria-label={panelSize === 'max' ? 'Restore player' : 'Maximize player'}
        onClick={() => setPanelSizeAndPersist(panelSize === 'max' ? 'normal' : 'max')}
      >
        <span aria-hidden="true">{panelSize === 'max' ? '❐' : '□'}</span>
      </button>
      <button
        type="button"
        className="listen-dock__win-btn listen-dock__win-btn--close"
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
      className="listen-dock listen-dock--normal"
      style={{ left: dockPos.x, top: dockPos.y }}
      role="dialog"
      aria-label="Listen player"
    >
      <div className="listen-dock__chrome">
        <span className="listen-dock__brand">Listen</span>
        {windowControls}
      </div>
      <p className="listen-dock__unsupported">
        Text-to-speech is not available in this browser. Try Chrome, Edge, Firefox, Safari, or Brave — then tap Play after the page loads.
      </p>
    </div>
  ) : (
    <div
      ref={panelRef}
      className={[
        'listen-dock',
        `listen-dock--${panelSize}`,
        showCfg ? 'listen-dock--cfg' : '',
        dragging ? 'listen-dock--dragging' : '',
        playing ? 'listen-dock--playing' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: dockPos.x, top: dockPos.y }}
      role="dialog"
      aria-label="Listen player"
      aria-modal="false"
    >
      <div
        className="listen-dock__chrome"
        onPointerDown={onDragStart}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
      >
        <div className="listen-dock__drag">
          <span className="listen-dock__grip" aria-hidden="true">⋮⋮</span>
          <span className="listen-dock__icon"><IcoHeadphones /></span>
          <div className="listen-dock__titles">
            <strong className="listen-dock__title">
              {chapters[currentChapter]?.title || 'Listening…'}
            </strong>
            {panelSize !== 'min' && (
              <span className="listen-dock__sub">
                Ch {currentChapter + 1} of {chapters.length}
                {playing ? ' · Playing' : ''}
              </span>
            )}
          </div>
        </div>
        {windowControls}
      </div>

      {panelSize === 'min' ? (
        <div className="listen-dock__mini">
          <button
            className="listen-dock__btn listen-dock__btn--play"
            title={playing ? 'Pause' : 'Play'}
            onClick={handlePlay}
            type="button"
          >
            {playing ? <IcoPause /> : <IcoPlay />}
          </button>
          <div className="listen-dock__mini-main">
            <span className="listen-dock__mini-meta">
              {fmtTime(elapsed)} / {fmtTime(total)} · {rate}×
            </span>
            {progressBlock}
          </div>
          <button
            type="button"
            className="listen-dock__expand"
            title="Expand player"
            onClick={() => setPanelSizeAndPersist('normal')}
          >
            Expand
          </button>
        </div>
      ) : (
        <div className="listen-dock__body">
          <div className="listen-dock__transport">
            <button className="listen-dock__btn" title="Rewind 15s" onClick={handleRewind} type="button"><IcoRewind /></button>
            <button className="listen-dock__btn listen-dock__btn--play" title={playing ? 'Pause' : 'Play'} onClick={handlePlay} type="button">
              {playing ? <IcoPause /> : <IcoPlay />}
            </button>
            <button className="listen-dock__btn" title="Stop" onClick={handleStop} type="button"><IcoStop /></button>
            <button
              className="listen-dock__btn"
              title="Next chapter"
              onClick={handleSkip}
              disabled={currentChapter >= chapters.length - 1}
              type="button"
            >
              <IcoSkip />
            </button>
            <button
              className={'listen-dock__btn listen-dock__btn--gear' + (showCfg ? ' on' : '')}
              onClick={() => {
                setShowCfg((o) => !o);
                if (panelSize === 'min') setPanelSizeAndPersist('normal');
              }}
              title="Voice & advanced settings"
              type="button"
              aria-expanded={showCfg}
            >
              <IcoGear />
            </button>
          </div>

          {progressBlock}

          <div className="listen-dock__gender" role="group" aria-label="Voice presets">
            <button
              type="button"
              className={'listen-dock__pill' + (!usingEllinea && activeGender === 'female' ? ' on' : '')}
              onClick={() => selectGender('female')}
              title="Best English female neural voice"
              aria-pressed={!usingEllinea && activeGender === 'female'}
            >
              Female
            </button>
            <button
              type="button"
              className={'listen-dock__pill' + (!usingEllinea && activeGender === 'male' ? ' on' : '')}
              onClick={() => selectGender('male')}
              title="Best English male neural voice"
              aria-pressed={!usingEllinea && activeGender === 'male'}
            >
              Male
            </button>
            <button
              type="button"
              className={'listen-dock__pill listen-dock__pill--ellinea' + (usingEllinea ? ' on' : '')}
              onClick={selectEllinea}
              title="Ellinea Voice — Jenny-like neural default (device system voice)"
              aria-pressed={usingEllinea}
            >
              Ellinea
            </button>
          </div>

          <div className="listen-dock__active" title={usingEllinea ? (ellineaMappedName || activeVoice?.name || '') : (activeVoice?.name || '')}>
            <span className="listen-dock__active-label">{displayVoiceLabel}</span>
            {activeVoice && isNeuralVoice(activeVoice) && (
              <span className="listen-dock__badge">Neural</span>
            )}
            {activeVoice?.localService && (
              <span className="listen-dock__badge listen-dock__badge--local">Offline</span>
            )}
          </div>

          <div className="listen-dock__speeds" role="group" aria-label="Playback speed">
            {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
              <button
                key={r}
                type="button"
                className={'listen-dock__speed' + (rate === r ? ' on' : '')}
                onClick={() => updateRate(r)}
              >
                {r === 1.0 ? '1×' : `${r}×`}
              </button>
            ))}
          </div>

          {!voicesReady && voices.length === 0 && (
            <div className="listen-dock__hint">Loading voices… Tap play to start.</div>
          )}

          {showCfg && (
            <div className="listen-dock__panel">
              <div className="listen-dock__panel-head">
                <span>Voice settings</span>
                <span className="listen-dock__panel-count">
                  {englishNeuralFemale}♀ · {englishNeuralMale}♂ neural
                </span>
              </div>

              <div className="listen-dock__row">
                <span className="listen-dock__row-label">Language</span>
                <div className="listen-dock__chips">
                  <button
                    type="button"
                    className={'listen-dock__chip' + (langScope === 'en' ? ' on' : '')}
                    onClick={() => setLangScope('en')}
                  >
                    English ({englishCount})
                  </button>
                  <button
                    type="button"
                    className={'listen-dock__chip' + (langScope === 'all' ? ' on' : '')}
                    onClick={() => setLangScope('all')}
                  >
                    All ({voices.length})
                  </button>
                </div>
              </div>

              <div className="listen-dock__row">
                <span className="listen-dock__row-label">List</span>
                <div className="listen-dock__chips">
                  {[
                    { id: 'neural', label: 'Neural' },
                    { id: 'female', label: 'Female' },
                    { id: 'male', label: 'Male' },
                    { id: 'all', label: 'All' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={'listen-dock__chip' + (filter === f.id ? ' on' : '')}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="listen-dock__row">
                <span className="listen-dock__row-label">Speed {rate}×</span>
                <div className="listen-dock__chips">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={'listen-dock__chip' + (rate === r ? ' on' : '')}
                      onClick={() => updateRate(r)}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="listen-dock__row listen-dock__row--pitch">
                <span className="listen-dock__row-label">Pitch {pitch.toFixed(1)}</span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={pitch}
                  className="listen-dock__slider"
                  onChange={(e) => updatePitch(parseFloat(e.target.value))}
                />
              </div>

              <div className="listen-dock__voice-list" role="listbox" aria-label="Available voices">
                <button
                  type="button"
                  role="option"
                  aria-selected={usingEllinea}
                  className={'listen-dock__voice' + (usingEllinea ? ' on' : '')}
                  onClick={selectEllinea}
                >
                  <span className="listen-dock__voice-name">
                    Ellinea Voice
                    <span className="listen-dock__badge listen-dock__badge--gold">Default</span>
                  </span>
                  <span className="listen-dock__voice-meta">
                    {ellineaMappedName ? shortSystemName(ellineaMappedName) : 'Jenny-like neural'}
                  </span>
                </button>
                {dispVoices.length === 0 && (
                  <div className="listen-dock__voice-empty">
                    No voices for this filter. Try Neural or All.
                  </div>
                )}
                {dispVoices.map((v) => {
                  const isOn = !usingEllinea && selectedName === v.name;
                  const isEllineaMap = usingEllinea && v.name === ellineaMappedName;
                  return (
                    <button
                      key={v.voiceURI || v.name}
                      type="button"
                      role="option"
                      aria-selected={isOn}
                      className={'listen-dock__voice' + (isOn || isEllineaMap ? ' on' : '')}
                      onClick={() => selectVoice(v)}
                    >
                      <span className="listen-dock__voice-name">
                        {v.name}
                        {isNeuralVoice(v) && <span className="listen-dock__badge">Neural</span>}
                        {v.localService && <span className="listen-dock__badge listen-dock__badge--local">Offline</span>}
                      </span>
                      <span className="listen-dock__voice-meta">{v.lang}</span>
                    </button>
                  );
                })}
              </div>

              <p className="listen-dock__note">
                Ellinea Voice uses your device’s best Jenny-like neural voice
                {ellineaMappedName ? ` (currently ${ellineaMappedName})` : ''}.
                Not a proprietary TTS pack — offline when that system voice is installed locally.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!portalReady || typeof document === 'undefined' || !document.body) return null;
  return createPortal(panel, document.body);
}
