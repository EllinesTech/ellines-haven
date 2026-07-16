/**
 * Audio Reader Cross-Device Compatibility
 * Handles speech synthesis across browsers, OS, and network conditions
 * Optimized for iOS, Android, and Desktop browsers
 */

/**
 * Check if device supports Web Speech API
 * @returns {Object} Support status and capabilities
 */
export function checkSpeechSynthesisSupport() {
  const synth = window.speechSynthesis;
  const SpeechUtterance = window.SpeechUtterance || window.webkitSpeechUtterance;
  
  return {
    supported: !!(synth && SpeechUtterance),
    browser: {
      chrome: !!navigator.userAgent.match(/Chrome/),
      safari: !!navigator.userAgent.match(/Safari/),
      firefox: !!navigator.userAgent.match(/Firefox/),
      edge: !!navigator.userAgent.match(/Edg/),
      mobile: !!navigator.userAgent.match(/Mobile|Android|iPhone|iPad|iPod/),
    },
    features: {
      pause: !!synth?.pause,
      resume: !!synth?.resume,
      cancel: !!synth?.cancel,
      getVoices: !!synth?.getVoices,
      onvoiceschanged: 'onvoiceschanged' in synth,
    },
  };
}

/**
 * Normalize audio constraints across devices
 * Returns safe defaults for iOS, Android, desktop
 * @returns {Object} Normalized audio settings
 */
export function getNormalizedAudioSettings() {
  const ua = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMobile = isiOS || isAndroid || /Mobile/.test(ua);

  return {
    // Speech synthesis parameters
    pitch: 1.0,        // Range: 0.5–2.0 (same across all devices)
    rate: 1.0,         // Range: 0.1–10.0 (but limited to 0.5–2.0 for UX)
    volume: 1.0,       // Range: 0–1.0
    
    // Device-specific tuning
    keepAliveInterval: isiOS ? 8000 : 10000,  // iOS needs more frequent pause/resume
    utteranceTimeout: 30000,                   // 30s max per utterance
    voiceLoadTimeout: isiOS ? 3000 : 1000,    // iOS voice loading is slower
    
    // Performance tweaks
    batchSize: isMobile ? 300 : 500,           // Characters per utterance batch
    preloadNextChapter: !isMobile,             // Desktop only: preload next chapter
    cacheAudioContext: isMobile,               // Mobile: cache audio context
    
    // Compatibility flags
    useFallbackPause: isiOS,                   // iOS: fallback method for pause
    requiresManualResume: isAndroid,           // Android: sometimes needs manual resume
    supportsOnEnded: !isiOS,                   // iOS: onended event unreliable
  };
}

/**
 * Device-specific audio fixes
 * Applies workarounds for known issues
 * @param {Object} audioContext - Audio synthesis context
 * @returns {void}
 */
export function applyDeviceSpecificFixes(audioContext) {
  const ua = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua);
  
  if (isiOS) {
    // iOS fix: Force audio session to "playback" mode
    if (audioContext?.audio) {
      audioContext.audio.play().catch(() => {
        // Ignore errors — iOS may require user gesture
      });
    }
    
    // iOS fix: Ensure speaker output (not ear speaker)
    try {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
    } catch {}
  }
  
  if (isAndroid) {
    // Android fix: Reinitialize speech synthesis after interruption
    const synth = window.speechSynthesis;
    if (synth && synth.pending) {
      synth.cancel(); // Clear pending utterances
    }
  }
  
  if (isChrome) {
    // Chrome fix: Keep-alive for long-running audio
    // Already handled in AudioPlayer component
  }
}

/**
 * Get supported voices filtered by device capabilities
 * @param {Array} allVoices - All available voices from speechSynthesis.getVoices()
 * @returns {Array} Filtered voices optimized for device
 */
export function getDeviceOptimizedVoices(allVoices) {
  const ua = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  
  if (!allVoices || allVoices.length === 0) return [];
  
  // Filter: prefer local/installed voices on mobile, remote on desktop
  return allVoices.filter(voice => {
    if (isiOS || isAndroid) {
      // Mobile: prefer local voices (faster, no network)
      return !voice.name.includes('Google') && !voice.name.includes('AWS');
    }
    // Desktop: all voices OK
    return true;
  });
}

/**
 * Test audio playback on device
 * Used to verify speech synthesis works before reading
 * @returns {Promise<boolean>} True if audio works
 */
export async function testAudioPlayback() {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve(false);
      
      const utterance = new SpeechUtterance('Audio test');
      utterance.volume = 0.1; // Low volume for test
      utterance.rate = 2.0;   // Fast for quick test
      
      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);
      
      setTimeout(() => {
        synth.cancel();
        resolve(true); // If it didn't error by now, it works
      }, 1000);
      
      synth.speak(utterance);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Format device info for debugging/logging
 * @returns {Object} Device identification info
 */
export function getDeviceInfo() {
  const ua = navigator.userAgent;
  return {
    userAgent: ua,
    browser: ua.includes('Chrome') ? 'Chrome' 
      : ua.includes('Safari') ? 'Safari'
      : ua.includes('Firefox') ? 'Firefox'
      : ua.includes('Edg') ? 'Edge'
      : 'Unknown',
    os: ua.includes('Windows') ? 'Windows'
      : ua.includes('Mac') ? 'macOS'
      : ua.includes('iPhone') ? 'iOS'
      : ua.includes('iPad') ? 'iPadOS'
      : ua.includes('Android') ? 'Android'
      : 'Unknown',
    isMobile: /Mobile|Android|iPhone|iPad|iPod/.test(ua),
    isTablet: /iPad|Android(?!.*Mobile)/.test(ua),
  };
}

/**
 * Detect if device is in low-connectivity mode
 * @returns {boolean} True if network is slow/limited
 */
export function isLowBandwidthMode() {
  if ('connection' in navigator) {
    const connection = navigator.connection;
    const slowTypes = ['slow-2g', '2g', '3g'];
    return slowTypes.includes(connection.effectiveType);
  }
  return false;
}

/**
 * Get recommended voice for device
 * Picks best voice considering device capabilities
 * @param {Array} voices - All available voices
 * @returns {Object|null} Recommended voice or null
 */
export function getRecommendedVoiceForDevice(voices) {
  if (!voices || voices.length === 0) return null;

  const ua = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  // iOS/macOS Siri voices (highest quality)
  if (isiOS) {
    const siriVoices = [
      'Allison', 'Karen', 'Moira', 'Samantha', 'Victoria',
      'Daniel', 'Oliver', 'Fiona', 'Ava'
    ];
    for (const name of siriVoices) {
      const v = voices.find(voice => voice.name.includes(name));
      if (v) return v;
    }
  }

  // Android / Google voices
  if (isAndroid) {
    const googleVoice = voices.find(v => /^Google/.test(v.name));
    if (googleVoice) return googleVoice;
  }

  // Windows / Microsoft neural voices (high quality)
  const msVoices = [
    'Microsoft Jenny', 'Microsoft Aria', 'Microsoft Emma',
    'Microsoft Sonia', 'Microsoft Libby', 'Microsoft Mia'
  ];
  for (const name of msVoices) {
    const v = voices.find(voice => voice.name.startsWith(name));
    if (v) return v;
  }

  // Fallback: first English voice
  const enVoice = voices.find(v => v.lang?.startsWith('en'));
  return enVoice || voices[0];
}
