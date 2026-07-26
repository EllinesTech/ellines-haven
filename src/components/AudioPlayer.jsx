/**
 * AudioPlayer — floating Listen dock (Web Speech API).
 *
 * Branded aliases map to the best installed neural system voices:
 * - "Ellinea Voice" → Jenny-like neural female (prefer localService)
 * - "Ellines Narrator" → Guy/Davis/Brian-like neural male
 * Synthesis still uses OS/browser speechSynthesis voices — not a custom TTS binary.
 */
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const AUDIO_PREFS_KEY = 'eh_audio_prefs';
/** Persisted marker: branded Ellinea alias (resolved to a real system voice). */
const ELLINEA_PREF = '__ellinea__';
/** Persisted marker: branded male narrator alias. */
const NARRATOR_PREF = '__ellines_narrator__';
/** Slightly slower than 1.0 softens robotic cadence on neural voices. */
const DEFAULT_RATE = 0.95;
const DEFAULT_PITCH = 1.0;
const GALLERY_LIMIT = 5;

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
  const n = v.name || '';
  if (/microsoft.*(jenny|aria|guy|davis|emma|brian|ana|andrew|ryan|sonia|libby|mia|neerja|ravi|clara|liam|natasha|olivia|james|luna|neural)/i.test(n)) return true;
  if (/microsoft.*(online\s*)?\(?natural\)?/i.test(n)) return true;
  if (/^google /i.test(n)) return true;
  if (/\b(neural|natural|enhanced|premium|wavenet|studio)\b/i.test(n)) return true;
  // Safari / macOS / iOS premium English voices
  if (/^(ava|allison|samantha|karen|moira|tessa|fiona|victoria|nicky|susan|daniel|oliver|alex|fred|tom|reed|aaron|bruce)/i.test(n) && isEnglishVoice(v)) return true;
  if (/samsung/i.test(n) && /female|male|neural|enhanced/i.test(n)) return true;
  if (v.voiceURI && /x-nob|x-sfg|x-iob|x-tpf|x-iom/i.test(v.voiceURI)) return true;
  return false;
}

/** Classic Desktop / eSpeak / Mark / Zira — demote aggressively; hide from main picker. */
function isRoboticDesktop(v) {
  if (!v) return false;
  const n = v.name || '';
  if (/espeak|festival|\brobot\b|pico\s*tts|\bflite\b/i.test(n)) return true;
  if (/\bDesktop\b/i.test(n) && /microsoft/i.test(n)) return true;
  if (/^Microsoft (David|Zira|Mark|Hazel|Susan)\b/i.test(n) && !/\b(natural|neural)\b/i.test(n)) return true;
  if (/microsoft.*(david|zira|mark|hazel|susan)/i.test(n) && !/\b(natural|neural)\b/i.test(n) && !isNeuralVoice(v)) return true;
  return false;
}

const FEMALE_NAME_RE = /\b(jenny|aria|emma|sonia|libby|mia|ana|neerja|zira|hazel|susan|karen|samantha|victoria|fiona|moira|tessa|veena|raveena|heera|manjari|lekha|kalpana|asha|ava|allison|nicky|joana|mariana|luciana|isabel|paola|soledad|monica|angelica|ximena|paulina|lucia)\b/i;
const MALE_NAME_RE = /\b(guy|davis|brian|andrew|ryan|mark|david|daniel|alex|james|george|reed|fred|tom|aaron|bruce|rishi|luca|diego|jorge|pablo|miguel|ivan|enrique|carlos|juan|william|liam|thomas|oliver|harry|arthur|richard|christopher|eric|steffan|geraint|gordon|wayne)\b/i;

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

/**
 * Quality ranking (lower = better):
 * neural + localService > neural > English local > other English > reject robotic.
 */
function voiceQualityScore(v) {
  if (!v) return 999;
  if (isRoboticDesktop(v)) return 900;
  let score = 55;
  if (isEnglishVoice(v)) score -= 18;
  if (isNeuralVoice(v)) {
    score -= 22;
    if (v.localService) score -= 14; // neural + local wins
  } else if (v.localService) {
    score -= 6;
  }
  // Known premium personas get a small boost
  if (/microsoft\s+(jenny|aria|emma|guy|davis|brian|andrew|ryan|sonia|libby|mia|ana)\b/i.test(v.name || '')) score -= 6;
  if (/^google (uk english (female|male)|us english)/i.test(v.name || '')) score -= 4;
  if (/online\s*\(?natural\)?|\(natural\)/i.test(v.name || '')) score -= 2;
  if (!isNeuralVoice(v)) score += 18;
  return score;
}

function sortVoicesNeuralFirst(list) {
  return [...list].sort((a, b) => {
    const qa = voiceQualityScore(a);
    const qb = voiceQualityScore(b);
    if (qa !== qb) return qa - qb;
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
  'Tom',
  'Fred',
  'Aaron',
  'Oliver',
  'Arthur',
  'James',
  'Samsung English Male',
];

/** Friendly chip labels for the premium gallery (real voice kept under the hood). */
const FRIENDLY_LABELS = [
  { re: /\bjenny\b/i, label: 'Jenny Soft' },
  { re: /\baria\b/i, label: 'Aria Soft' },
  { re: /\bemma\b/i, label: 'Emma Clear' },
  { re: /\bsonia\b/i, label: 'Sonia Bright' },
  { re: /\blibby\b/i, label: 'Libby Calm' },
  { re: /\bmia\b/i, label: 'Mia Light' },
  { re: /\bana\b/i, label: 'Ana Warm' },
  { re: /\bguy\b/i, label: 'Guy Warm' },
  { re: /\bdavis\b/i, label: 'Davis Deep' },
  { re: /\bbrian\b/i, label: 'Brian Steady' },
  { re: /\bandrew\b/i, label: 'Andrew Clear' },
  { re: /\bryan\b/i, label: 'Ryan Smooth' },
  { re: /google uk english female/i, label: 'UK Female' },
  { re: /google uk english male/i, label: 'UK Male' },
  { re: /google us english/i, label: 'US Neural' },
  { re: /\bsamantha\b/i, label: 'Samantha' },
  { re: /\bava\b/i, label: 'Ava Soft' },
  { re: /\ballison\b/i, label: 'Allison' },
  { re: /\bkaren\b/i, label: 'Karen' },
  { re: /\bmoira\b/i, label: 'Moira' },
  { re: /\btessa\b/i, label: 'Tessa' },
  { re: /\bfiona\b/i, label: 'Fiona' },
  { re: /\bvictoria\b/i, label: 'Victoria' },
  { re: /\bdaniel\b/i, label: 'Daniel' },
  { re: /\balex\b/i, label: 'Alex' },
  { re: /\boliver\b/i, label: 'Oliver' },
  { re: /\bfred\b/i, label: 'Fred' },
  { re: /\btom\b/i, label: 'Tom' },
  { re: /samsung.*female/i, label: 'Samsung ♀' },
  { re: /samsung.*male/i, label: 'Samsung ♂' },
];

function shortSystemName(name) {
  if (!name) return '';
  return name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s*\(Natural\)|\s*Online\s*\(Natural\)|\s*-\s*English\s*\(.*\)$/i, '')
    .trim() || name;
}

function friendlyVoiceLabel(v) {
  if (!v) return '';
  const name = v.name || '';
  for (const { re, label } of FRIENDLY_LABELS) {
    if (re.test(name)) return label;
  }
  return shortSystemName(name);
}

/** Collapse Online/Natural variants of the same persona into one gallery slot. */
function voicePersonaKey(v) {
  const n = (v.name || '').toLowerCase();
  if (/google uk english female/.test(n)) return 'google-uk-f';
  if (/google uk english male/.test(n)) return 'google-uk-m';
  if (/google us english/.test(n)) return 'google-us';
  const ms = n.match(/microsoft\s+([a-z]+)/);
  if (ms) return `ms-${ms[1]}`;
  const short = shortSystemName(v.name).toLowerCase().split(/[\s(-]/)[0];
  return short || n;
}

function dedupeByPersona(list) {
  const seen = new Set();
  const out = [];
  for (const v of sortVoicesNeuralFirst(list)) {
    const key = voicePersonaKey(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function premiumNeuralPool(voiceList) {
  return englishPool(voiceList).filter(v => isNeuralVoice(v) && !isRoboticDesktop(v));
}

/** Up to 5 female + 5 male high-quality neural English voices for the dock gallery. */
function curatePremiumGallery(voiceList, limit = GALLERY_LIMIT) {
  const pool = premiumNeuralPool(voiceList);
  const females = dedupeByPersona(pool.filter(isFemaleVoice)).slice(0, limit);
  const males = dedupeByPersona(pool.filter(isMaleVoice)).slice(0, limit);
  return { females, males };
}

function pickEllineaVoice(voiceList) {
  if (!voiceList.length) return null;
  const pool = englishPool(voiceList);
  const neuralFemale = pool.filter(v => isNeuralVoice(v) && !isRoboticDesktop(v) && isFemaleVoice(v));
  const neuralAny = pool.filter(v => isNeuralVoice(v) && !isRoboticDesktop(v));
  return (
    findByPriority(neuralFemale, ELLINEA_PRIORITY)
    || findByPriority(neuralAny, ELLINEA_PRIORITY)
    || sortVoicesNeuralFirst(neuralFemale)[0]
    || sortVoicesNeuralFirst(neuralAny)[0]
    || sortVoicesNeuralFirst(pool.filter(v => !isRoboticDesktop(v)))[0]
    || null
  );
}

function pickNarratorVoice(voiceList) {
  if (!voiceList.length) return null;
  const pool = englishPool(voiceList);
  const neuralMale = pool.filter(v => isNeuralVoice(v) && !isRoboticDesktop(v) && isMaleVoice(v));
  return (
    findByPriority(neuralMale, MALE_PRIORITY)
    || sortVoicesNeuralFirst(neuralMale)[0]
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
    const neural = list.filter(v => isNeuralVoice(v) && !isRoboticDesktop(v));
    if (neural.length) {
      const hit = findByPriority(neural, priority);
      if (hit) return hit;
      return sortVoicesNeuralFirst(neural)[0];
    }
    const natural = list.filter(v => !isRoboticDesktop(v));
    if (natural.length) {
      const hit = findByPriority(natural, priority);
      if (hit) return hit;
      return sortVoicesNeuralFirst(natural)[0];
    }
    return null; // never auto-pick robotic
  };
  return tryPick(gendered)
    || (gender === 'male' ? pickNarratorVoice(pool) : pickEllineaVoice(pool))
    || pickEllineaVoice(pool);
}

function detectVoiceGender(v) {
  if (!v) return null;
  if (isFemaleVoice(v)) return 'female';
  if (isMaleVoice(v)) return 'male';
  return null;
}

function isBrandedPref(name) {
  return name === ELLINEA_PREF || name === NARRATOR_PREF;
}

function defaultDockPos(size = 'normal') {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  const w = size === 'min' ? 300 : size === 'max' ? Math.min(400, window.innerWidth - 24) : 340;
  const h = size === 'min' ? 72 : size === 'max' ? 520 : 360;
  return {
    x: Math.max(12, window.innerWidth - w - 20),
    y: Math.max(12, window.innerHeight - h - 96),
  };
}

function clampPos(pos, size = 'normal') {
  if (typeof window === 'undefined' || !pos) return pos;
  const w = size === 'min' ? 300 : size === 'max' ? Math.min(400, window.innerWidth - 24) : 340;
  const h = size === 'min' ? 72 : size === 'max' ? Math.min(600, window.innerHeight - 24) : 380;
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
  const [rate, setRate] = useState(() => (typeof saved.rate === 'number' ? saved.rate : DEFAULT_RATE));
  const [pitch, setPitch] = useState(() => (typeof saved.pitch === 'number' ? saved.pitch : DEFAULT_PITCH));
  const [panelSize, setPanelSize] = useState(() => (
    ['min', 'normal', 'max'].includes(saved.panelSize) ? saved.panelSize : 'normal'
  ));
  const [showCfg, setShowCfg] = useState(false);
  const [showMoreVoices, setShowMoreVoices] = useState(false);
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
  /** Real system voice name, or branded pref markers. */
  const [selectedName, setSelectedName] = useState(() => saved.voiceName || ELLINEA_PREF);
  const [portalReady, setPortalReady] = useState(false);
  const [ellineaMappedName, setEllineaMappedName] = useState('');
  const [narratorMappedName, setNarratorMappedName] = useState('');

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
    const narrator = pickNarratorVoice(sorted);
    if (narrator) setNarratorMappedName(narrator.name);

    const pref = selectedNameRef.current;
    if (pref === ELLINEA_PREF || !pref) {
      selectedNameRef.current = ELLINEA_PREF;
      setSelectedName(ELLINEA_PREF);
      persistVoiceSettings({ voiceName: ELLINEA_PREF });
      return;
    }
    if (pref === NARRATOR_PREF) {
      selectedNameRef.current = NARRATOR_PREF;
      setSelectedName(NARRATOR_PREF);
      persistVoiceSettings({ voiceName: NARRATOR_PREF });
      return;
    }

    const found = sorted.find(x => x.name === pref);
    if (found && isEnglishVoice(found) && !isRoboticDesktop(found)) {
      setSelectedName(found.name);
      return;
    }

    // Saved voice missing, robotic, or non-English — fall back to Ellinea
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

  function resolveSelectedVoice() {
    const live = synth?.getVoices?.() || voices;
    const pool = live.length ? live : voices;
    if (selectedNameRef.current === ELLINEA_PREF) {
      return pickEllineaVoice(pool) || pool.find(v => isEnglishVoice(v) && !isRoboticDesktop(v)) || null;
    }
    if (selectedNameRef.current === NARRATOR_PREF) {
      return pickNarratorVoice(pool) || pickBestVoiceByGender(pool, 'male') || pickEllineaVoice(pool);
    }
    if (selectedNameRef.current) {
      const byName = pool.find(v => v.name === selectedNameRef.current)
        || voices.find(v => v.name === selectedNameRef.current);
      if (byName && !isRoboticDesktop(byName)) return byName;
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

  const selectVoice = (v, { branded = null } = {}) => {
    if (!v && !branded) return;
    if (branded === ELLINEA_PREF) {
      selectedNameRef.current = ELLINEA_PREF;
      setSelectedName(ELLINEA_PREF);
      persistVoiceSettings({ voiceName: ELLINEA_PREF });
    } else if (branded === NARRATOR_PREF) {
      selectedNameRef.current = NARRATOR_PREF;
      setSelectedName(NARRATOR_PREF);
      persistVoiceSettings({ voiceName: NARRATOR_PREF });
    } else {
      selectedNameRef.current = v.name || '';
      setSelectedName(v.name || '');
      persistVoiceSettings({ voiceName: v.name || '' });
    }
    if (playing) speak(charRef.current);
  };

  const selectEllinea = () => {
    const v = pickEllineaVoice(voices);
    if (v) setEllineaMappedName(v.name);
    selectVoice(v, { branded: ELLINEA_PREF });
  };

  const selectNarrator = () => {
    const v = pickNarratorVoice(voices);
    if (v) setNarratorMappedName(v.name);
    selectVoice(v, { branded: NARRATOR_PREF });
  };

  const selectGender = (gender) => {
    const best = pickBestVoiceByGender(voices, gender);
    if (!best) return;
    // Prefer branded defaults when they resolve to the same top pick
    if (gender === 'female') {
      const ellinea = pickEllineaVoice(voices);
      if (ellinea && ellinea.name === best.name) {
        selectEllinea();
        return;
      }
    }
    if (gender === 'male') {
      const narrator = pickNarratorVoice(voices);
      if (narrator && narrator.name === best.name) {
        selectNarrator();
        return;
      }
    }
    selectVoice(best);
  };

  const UtteranceCtor = typeof window !== 'undefined'
    ? (window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance)
    : null;
  const available = !!(typeof window !== 'undefined' && window.speechSynthesis && UtteranceCtor);
  const gallery = curatePremiumGallery(voices);
  const premiumNames = new Set([
    ...gallery.females.map(v => v.name),
    ...gallery.males.map(v => v.name),
    ellineaMappedName,
    narratorMappedName,
  ].filter(Boolean));
  const moreVoices = englishPool(voices)
    .filter(v => !isRoboticDesktop(v) && !premiumNames.has(v.name))
    .sort((a, b) => voiceQualityScore(a) - voiceQualityScore(b));
  const activeVoice = resolveSelectedVoice();
  const usingEllinea = selectedName === ELLINEA_PREF;
  const usingNarrator = selectedName === NARRATOR_PREF;
  const activeGender = detectVoiceGender(activeVoice);
  const englishNeuralFemale = gallery.females.length;
  const englishNeuralMale = gallery.males.length;
  const dockPos = pos || defaultDockPos(panelSize);
  const showInstallTip = voicesReady && (englishNeuralFemale < GALLERY_LIMIT || englishNeuralMale < GALLERY_LIMIT);

  const isGalleryVoiceOn = (v) => {
    if (!v) return false;
    if (usingEllinea && v.name === ellineaMappedName) return true;
    if (usingNarrator && v.name === narratorMappedName) return true;
    return !isBrandedPref(selectedName) && selectedName === v.name;
  };

  const displayVoiceLabel = usingEllinea
    ? 'Ellinea Voice'
    : usingNarrator
      ? 'Ellines Narrator'
      : friendlyVoiceLabel(activeVoice) || shortSystemName(activeVoice?.name || selectedName) || 'Select voice';

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
              className={'listen-dock__pill' + (!usingEllinea && !usingNarrator && activeGender === 'female' ? ' on' : '')}
              onClick={() => selectGender('female')}
              title="Best English female neural voice"
              aria-pressed={!usingEllinea && !usingNarrator && activeGender === 'female'}
            >
              Female
            </button>
            <button
              type="button"
              className={'listen-dock__pill' + (!usingEllinea && !usingNarrator && activeGender === 'male' ? ' on' : '')}
              onClick={() => selectGender('male')}
              title="Best English male neural voice"
              aria-pressed={!usingEllinea && !usingNarrator && activeGender === 'male'}
            >
              Male
            </button>
            <button
              type="button"
              className={'listen-dock__pill listen-dock__pill--ellinea' + (usingEllinea ? ' on' : '')}
              onClick={selectEllinea}
              title="Ellinea Voice — Jenny-like neural default"
              aria-pressed={usingEllinea}
            >
              Ellinea
            </button>
            <button
              type="button"
              className={'listen-dock__pill listen-dock__pill--narrator' + (usingNarrator ? ' on' : '')}
              onClick={selectNarrator}
              title="Ellines Narrator — Guy-like neural male default"
              aria-pressed={usingNarrator}
              disabled={!narratorMappedName && !gallery.males.length}
            >
              Narrator
            </button>
          </div>

          <div
            className="listen-dock__active"
            title={
              usingEllinea
                ? (ellineaMappedName || activeVoice?.name || '')
                : usingNarrator
                  ? (narratorMappedName || activeVoice?.name || '')
                  : (activeVoice?.name || '')
            }
          >
            <span className="listen-dock__active-label">{displayVoiceLabel}</span>
            {activeVoice && isNeuralVoice(activeVoice) && (
              <span className="listen-dock__badge">Neural</span>
            )}
            {activeVoice?.localService && (
              <span className="listen-dock__badge listen-dock__badge--local">Offline</span>
            )}
          </div>

          <div className="listen-dock__gallery" aria-label="Premium neural voices">
            <div className="listen-dock__gallery-block">
              <span className="listen-dock__gallery-label">Female</span>
              <div className="listen-dock__gallery-chips" role="listbox" aria-label="Female neural voices">
                <button
                  type="button"
                  role="option"
                  aria-selected={usingEllinea}
                  className={'listen-dock__gchip listen-dock__gchip--brand' + (usingEllinea ? ' on' : '')}
                  onClick={selectEllinea}
                  title={ellineaMappedName ? `Uses ${ellineaMappedName}` : 'Jenny-like neural'}
                >
                  Ellinea Voice
                </button>
                {gallery.females
                  .filter(v => v.name !== ellineaMappedName)
                  .map((v) => (
                    <button
                      key={v.voiceURI || v.name}
                      type="button"
                      role="option"
                      aria-selected={isGalleryVoiceOn(v)}
                      className={'listen-dock__gchip' + (isGalleryVoiceOn(v) ? ' on' : '')}
                      onClick={() => selectVoice(v)}
                      title={v.name}
                    >
                      {friendlyVoiceLabel(v)}
                    </button>
                  ))}
                {voicesReady && gallery.females.length === 0 && (
                  <span className="listen-dock__gallery-empty">No neural female voices found</span>
                )}
              </div>
            </div>

            <div className="listen-dock__gallery-block">
              <span className="listen-dock__gallery-label">Male</span>
              <div className="listen-dock__gallery-chips" role="listbox" aria-label="Male neural voices">
                <button
                  type="button"
                  role="option"
                  aria-selected={usingNarrator}
                  className={'listen-dock__gchip listen-dock__gchip--brand' + (usingNarrator ? ' on' : '')}
                  onClick={selectNarrator}
                  title={narratorMappedName ? `Uses ${narratorMappedName}` : 'Guy-like neural'}
                  disabled={!narratorMappedName && !gallery.males.length}
                >
                  Ellines Narrator
                </button>
                {gallery.males
                  .filter(v => v.name !== narratorMappedName)
                  .map((v) => (
                    <button
                      key={v.voiceURI || v.name}
                      type="button"
                      role="option"
                      aria-selected={isGalleryVoiceOn(v)}
                      className={'listen-dock__gchip' + (isGalleryVoiceOn(v) ? ' on' : '')}
                      onClick={() => selectVoice(v)}
                      title={v.name}
                    >
                      {friendlyVoiceLabel(v)}
                    </button>
                  ))}
                {voicesReady && gallery.males.length === 0 && (
                  <span className="listen-dock__gallery-empty">No neural male voices found</span>
                )}
              </div>
            </div>

            {showInstallTip && (
              <p className="listen-dock__tip">
                Tip: Install more neural voices in Windows Settings → Time &amp; language → Speech,
                or use Chrome / Edge / Safari for richer voices.
              </p>
            )}
          </div>

          <div className="listen-dock__speeds" role="group" aria-label="Playback speed">
            {[0.75, 0.95, 1.0, 1.25, 1.5].map(r => (
              <button
                key={r}
                type="button"
                className={'listen-dock__speed' + (rate === r ? ' on' : '')}
                onClick={() => updateRate(r)}
              >
                {r === 0.95 ? '0.95×' : r === 1.0 ? '1×' : `${r}×`}
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
                  {englishNeuralFemale}♀ · {englishNeuralMale}♂ premium
                </span>
              </div>

              <div className="listen-dock__row">
                <span className="listen-dock__row-label">Speed {rate}×</span>
                <div className="listen-dock__chips">
                  {[0.5, 0.75, 0.95, 1.0, 1.25, 1.5, 1.75, 2.0].map(r => (
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

              <div className="listen-dock__voice-list" role="listbox" aria-label="Premium neural voices">
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
                <button
                  type="button"
                  role="option"
                  aria-selected={usingNarrator}
                  className={'listen-dock__voice' + (usingNarrator ? ' on' : '')}
                  onClick={selectNarrator}
                  disabled={!narratorMappedName && !gallery.males.length}
                >
                  <span className="listen-dock__voice-name">
                    Ellines Narrator
                    <span className="listen-dock__badge listen-dock__badge--gold">Male</span>
                  </span>
                  <span className="listen-dock__voice-meta">
                    {narratorMappedName ? shortSystemName(narratorMappedName) : 'Guy-like neural'}
                  </span>
                </button>
                {[...gallery.females, ...gallery.males]
                  .filter(v => v.name !== ellineaMappedName && v.name !== narratorMappedName)
                  .map((v) => {
                    const isOn = isGalleryVoiceOn(v);
                    return (
                      <button
                        key={v.voiceURI || v.name}
                        type="button"
                        role="option"
                        aria-selected={isOn}
                        className={'listen-dock__voice' + (isOn ? ' on' : '')}
                        onClick={() => selectVoice(v)}
                      >
                        <span className="listen-dock__voice-name">
                          {friendlyVoiceLabel(v)}
                          <span className="listen-dock__badge">Neural</span>
                          {v.localService && <span className="listen-dock__badge listen-dock__badge--local">Offline</span>}
                        </span>
                        <span className="listen-dock__voice-meta">{shortSystemName(v.name)}</span>
                      </button>
                    );
                  })}
              </div>

              <button
                type="button"
                className="listen-dock__more-toggle"
                onClick={() => setShowMoreVoices((o) => !o)}
                aria-expanded={showMoreVoices}
              >
                {showMoreVoices ? 'Hide more voices' : `More voices${moreVoices.length ? ` (${moreVoices.length})` : ''}`}
              </button>

              {showMoreVoices && (
                <div className="listen-dock__voice-list listen-dock__voice-list--more" role="listbox" aria-label="Additional voices">
                  {moreVoices.length === 0 && (
                    <div className="listen-dock__voice-empty">
                      No extra non-robotic English voices on this device.
                    </div>
                  )}
                  {moreVoices.map((v) => {
                    const isOn = !isBrandedPref(selectedName) && selectedName === v.name;
                    return (
                      <button
                        key={v.voiceURI || v.name}
                        type="button"
                        role="option"
                        aria-selected={isOn}
                        className={'listen-dock__voice' + (isOn ? ' on' : '')}
                        onClick={() => selectVoice(v)}
                      >
                        <span className="listen-dock__voice-name">
                          {v.name}
                          {isNeuralVoice(v) && <span className="listen-dock__badge">Neural</span>}
                        </span>
                        <span className="listen-dock__voice-meta">{v.lang}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="listen-dock__note">
                Ellinea Voice → {ellineaMappedName || 'best Jenny-like neural female'}.
                {' '}Ellines Narrator → {narratorMappedName || 'best Guy-like neural male'}.
                Robotic Desktop / eSpeak voices are hidden. Offline when the mapped system voice is local.
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
