/**
 * cloudTts.js — Google Cloud Text-to-Speech helper
 *
 * Online  → fetches audio from Google Cloud TTS (Jenny Neural, en-US-Neural2-F)
 * Offline → signals caller to fall back to Web Speech API with device voice
 *
 * Audio is cached in memory per chapter so seeking/replaying costs zero API calls.
 */

const API_KEY = import.meta.env.VITE_GOOGLE_TTS_KEY || '';
const TTS_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${API_KEY}`;

/** Jenny Neural — consistent female voice across all devices when online */
const JENNY_VOICE = {
  languageCode: 'en-US',
  name: 'en-US-Neural2-F',        // Jenny — highest quality female neural
};

/** Rate/pitch matched to the previous Web Speech defaults */
const AUDIO_CONFIG = {
  audioEncoding: 'MP3',
  speakingRate: 0.95,             // slight slow-down for readability
  pitch: 0.0,                     // 0 = natural pitch
  volumeGainDb: 0.0,
};

/** In-memory cache: chapterKey → base64 MP3 data URL */
const _cache = new Map();

/** True when the browser has network access */
export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Synthesise text via Google Cloud TTS.
 * Returns a data URL (audio/mp3) ready to feed into an <audio> element.
 * Throws on API error.
 */
export async function synthesize(text, cacheKey = '') {
  if (!text?.trim()) throw new Error('No text to synthesize');
  if (!API_KEY) throw new Error('VITE_GOOGLE_TTS_KEY not set');

  // Return cached result when available
  if (cacheKey && _cache.has(cacheKey)) {
    return _cache.get(cacheKey);
  }

  const body = JSON.stringify({
    input: { text },
    voice: JENNY_VOICE,
    audioConfig: AUDIO_CONFIG,
  });

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.status);
    throw new Error(`Google TTS error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const audioContent = json.audioContent; // base64 MP3
  if (!audioContent) throw new Error('Google TTS returned empty audio');

  const dataUrl = `data:audio/mp3;base64,${audioContent}`;
  if (cacheKey) _cache.set(cacheKey, dataUrl);
  return dataUrl;
}

/** Pre-warm the cache for a chapter in the background (fire-and-forget) */
export function prefetch(text, cacheKey) {
  if (!isOnline() || !cacheKey || _cache.has(cacheKey)) return;
  synthesize(text, cacheKey).catch(() => {/* silent — will retry on play */});
}

/** Clear the in-memory cache (e.g. on book change) */
export function clearCache() {
  _cache.clear();
}
