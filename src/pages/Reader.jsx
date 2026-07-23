﻿import { useParams, Link, useLocation } from 'react-router-dom';

import React, { useEffect, useState, useRef, useCallback } from 'react';

import { useApp } from '../context/AppContext';

import LanguageSwitcher from '../components/LanguageSwitcher';

import { useReadingProgress } from '../hooks/useReadingProgress';

import { doc, getDocFromCache, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase';

import { findBookBySlugOrId, bookPath, readPath } from '../utils/slugify';

import {

  isBookSavedOffline,

  getOfflineBook,

  saveBookOffline,

  removeOfflineBook,

} from '../hooks/useOfflineBook';

import { getFallbackChapters } from '../data/bookChapters';

import './Reader.css';



/* ---------------------------------------------

   Audio Book Player — Web Speech API

   Reads chapter text aloud with voice settings

--------------------------------------------- */



// SVG icons — render correctly on every device/browser (no emoji font needed)

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



function AudioPlayer({ chapters, currentChapter, onChapterChange }) {
  const synth = window.speechSynthesis;

  const [playing,     setPlaying]     = useState(false);
  const [voices,      setVoices]      = useState([]);
  const [voicesReady, setVoicesReady] = useState(false);
  const [voiceIdx,    setVoiceIdx]    = useState(0);
  const [rate,        setRate]        = useState(1.0);
  const [pitch,       setPitch]       = useState(1.0);
  const [showCfg,     setShowCfg]     = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [elapsed,     setElapsed]     = useState(0);
  const [total,       setTotal]       = useState(0);
  const [filter,      setFilter]      = useState('all');
  const [voiceDdOpen, setVoiceDdOpen] = useState(false);

  const uttRef          = useRef(null);
  const charRef         = useRef(0);    // char offset into full text
  const timerRef        = useRef(null);
  const keepAliveRef    = useRef(null); // Chrome keep-alive interval
  const startedAt       = useRef(0);
  const pausedAt        = useRef(0);
  const selectedNameRef = useRef('');   // persist chosen voice name across filter changes

  const chapterText = chapters[currentChapter]?.text || '';

  // -- Neural / quality badge helpers ----------------------------------------
  function isNeuralVoice(v) {
    // Microsoft neural (Windows / Edge / Chrome on desktop + Android WebView)
    if (/microsoft.*(jenny|aria|guy|davis|emma|brian|ana|andrew|ryan|sonia|libby|mia|neerja|ravi|clara|liam|natasha|olivia|james|luna)/i.test(v.name)) return true;
    // Google voices (Android Chrome / Chrome OS) are high-quality neural
    if (/^google /i.test(v.name)) return true;
    // iOS / macOS Siri-quality enhanced voices
    if (/^(ava|allison|samantha|karen|moira|tessa|fiona|victoria|nicky|frederica|joana|mariana|luciana|isabel|paola|soledad|monica|jorge|juan|pablo|diego|enrique|carlos|ximena|angelica)/i.test(v.name) && v.lang?.startsWith('en')) return true;
    // Samsung built-in neural
    if (/samsung/i.test(v.name) && /female|male|neural|enhanced/i.test(v.name)) return true;
    // Android voiceURI hints
    if (v.voiceURI && /x-nob|x-sfg|x-iob|x-tpf|x-iom/i.test(v.voiceURI)) return true;
    return false;
  }

  function isGoogleNeural(v) {
    return /^google /i.test(v.name);
  }

  // -- Best-voice auto-selector ----------------------------------------------
  function pickBestIdx(voiceList) {
    // Priority: Microsoft Neural > Google > iOS enhanced > local en-US > en-GB > any English > first
    const PRIORITY = [
      'Microsoft Jenny', 'Microsoft Aria',  'Microsoft Emma',   'Microsoft Sonia',
      'Microsoft Libby', 'Microsoft Mia',   'Microsoft Ana',    'Microsoft Neerja',
      'Microsoft Guy',   'Microsoft Davis', 'Microsoft Brian',  'Microsoft Andrew',
      'Microsoft Ryan',
      'Google UK English Female', 'Google US English', 'Google UK English Male',
      'Ava', 'Allison', 'Samantha', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Victoria',
      'Samsung English Female', 'Samsung English Male',
    ];
    for (const name of PRIORITY) {
      const idx = voiceList.findIndex(x => x.name.startsWith(name));
      if (idx >= 0) return idx;
    }
    let idx = voiceList.findIndex(x => x.lang === 'en-US' && x.localService);
    if (idx >= 0) return idx;
    idx = voiceList.findIndex(x => x.lang === 'en-GB');
    if (idx >= 0) return idx;
    idx = voiceList.findIndex(x => x.lang?.startsWith('en'));
    if (idx >= 0) return idx;
    return 0;
  }

  // -- Voice loading ---------------------------------------------------------
  // Chrome returns empty array on first call; onvoiceschanged fires once then stops.
  // We poll with exponential back-off (50ms → 1s) for up to ~8 attempts to
  // guarantee voices are available across Chrome, Firefox, Safari, Edge, and Android.
  useEffect(() => {
    let cancelled = false;
    let pollHandle = null;
    let attempt = 0;

    const applyVoices = (v) => {
      if (cancelled || !v.length) return;
      setVoices(v);
      setVoicesReady(true);
      // Try to keep the previously chosen voice by name when voices reload
      if (selectedNameRef.current) {
        const idx = v.findIndex(x => x.name === selectedNameRef.current);
        if (idx >= 0) { setVoiceIdx(idx); return; }
      }
      const best = pickBestIdx(v);
      setVoiceIdx(best);
      selectedNameRef.current = v[best]?.name || '';
    };

    const tryLoad = () => {
      const v = synth.getVoices();
      if (v.length) { applyVoices(v); return; }
      attempt++;
      if (attempt <= 8) {
        // 50 → 100 → 200 → 400 → 800 → 1000 → 1000 → 1000 ms
        pollHandle = setTimeout(tryLoad, Math.min(50 * Math.pow(2, attempt - 1), 1000));
      }
    };

    // onvoiceschanged is the canonical signal — polling is a safety net
    synth.onvoiceschanged = () => {
      const v = synth.getVoices();
      if (v.length) { clearTimeout(pollHandle); applyVoices(v); }
    };

    tryLoad();

    return () => {
      cancelled = true;
      clearTimeout(pollHandle);
      synth.onvoiceschanged = null;
    };
  }, []); // eslint-disable-line

  // -- Chrome keep-alive -----------------------------------------------------
  // Chromium-based browsers silently cancel speech after ~15 s.
  // Pause+resume every 10 s while speaking prevents the cutoff.
  // NOTE: Skip this on iOS/Safari — pause+resume breaks speech there.
  const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/i.test(navigator.userAgent);
  useEffect(() => {
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
  }, [playing]); // eslint-disable-line

  // -- Close voice dropdown on outside click ---------------------------------
  useEffect(() => {
    if (!voiceDdOpen) return;
    
    const handleClickOutside = (e) => {
      // Close dropdown if click is outside of it
      const ddElement = document.querySelector('.audio-custom-dd');
      if (ddElement && !ddElement.contains(e.target)) {
        setVoiceDdOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [voiceDdOpen]); // eslint-disable-line

  // -- Reset on chapter change -----------------------------------------------
  useEffect(() => {
    stopSpeech();
    charRef.current = 0;
    setProgress(0);
    setElapsed(0);
    // Count exact words in the chapter (title + subtitle + body)
    const ch = chapters[currentChapter] || {};
    const fullText = [(ch.title || ''), (ch.subtitle || ''), (chapterText || '')].join(' ');
    const words = fullText.split(/\s+/).filter(Boolean).length;
    // Use the current playback rate for the estimate
    const wpm = Math.round(180 * (rate || 1.0));
    setTotal(Math.round((words / wpm) * 60));
  }, [currentChapter, chapterText]); // eslint-disable-line

  // Cleanup on unmount
  useEffect(() => () => { stopSpeech(); clearInterval(keepAliveRef.current); }, []); // eslint-disable-line

  function stopSpeech() {
    synth.cancel();
    clearInterval(timerRef.current);
    clearInterval(keepAliveRef.current);
    setPlaying(false);
    pausedAt.current = 0;
  }

  function getSelectedVoice() {
    const filtered = filteredVoices();
    // Prefer the previously selected voice by name (survives filter changes)
    if (selectedNameRef.current) {
      const byName = filtered.find(v => v.name === selectedNameRef.current);
      if (byName) return byName;
    }
    return filtered[voiceIdx] || voices[0] || null;
  }

  function filteredVoices() {
    if (!voices.length) return [];
    if (filter === 'all') return voices;
    return voices.filter(v => {
      const n   = v.name.toLowerCase();
      const uri = (v.voiceURI || '').toLowerCase();

      if (filter === 'female') {
        if (n.includes('female') || n.includes('woman') || n.includes('femme')) return true;
        if (/\b(jenny|aria|emma|sonia|libby|mia|ana|neerja|zira|hazel|susan|karen|samantha|victoria|fiona|moira|tessa|veena|raveena|heera|manjari|lekha|kalpana|asha|ava|allison|joana|mariana|luciana|isabel|paola|soledad|monica|angelica|ximena|paulina|lucia|almudena|marta|zosia|ewa|ioana|laila|fatima|tamar|leila|hessa|linh|naayf|yan|meijia|tingting|sinji|milena|yelena|irina|katya|anna|vicki|alice|amelie|julie|aurelie|petra|katrin|hanna|lotte|claire|ellen|nora|carmit|sara|yuna|kyoko|otoya)\b/.test(n)) return true;
        if (/^(ava|allison|victoria|fiona|karen|moira|tessa|samantha|nicky|frederica)/i.test(v.name) && v.lang?.startsWith('en')) return true;
        if (/google uk english female/i.test(v.name)) return true;
        if (/samsung.*female/i.test(v.name)) return true;
        if (/female/i.test(uri)) return true;
        return false;
      }

      if (filter === 'male') {
        if ((n.includes('male') && !n.includes('female')) || n.includes('man') || n.includes('homme')) return true;
        if (/\b(guy|davis|brian|andrew|ryan|mark|david|daniel|alex|james|george|reed|fred|rishi|luca|diego|jorge|pablo|miguel|ivan|enrique|carlos|juan|william|liam|thomas|oliver|harry|arthur)\b/.test(n)) return true;
        if (/^(daniel|oliver|arthur|thomas|fred|junior|alex)/i.test(v.name) && v.lang?.startsWith('en')) return true;
        if (/google uk english male/i.test(v.name)) return true;
        if (/samsung.*male/i.test(v.name)) return true;
        if (/male/i.test(uri) && !/female/i.test(uri)) return true;
        return false;
      }

      return true;
    });
  }
  function speak(fromChar = 0) {

    synth.cancel();

    clearInterval(timerRef.current);



    const text = chapterText.slice(fromChar);

    if (!text.trim()) return;



    const utt = new SpeechSynthesisUtterance(text);

    // CRITICAL FIX: Always get fresh voices from browser, don't rely on stale state
    let selectedVoice = null;
    const currentVoices = synth.getVoices();
    
    if (currentVoices.length > 0) {
      // Voices available - use the best one
      selectedVoice = currentVoices[voiceIdx] || currentVoices[0];
    } else {
      // No voices yet - this is unusual but keep trying
      const retryVoices = synth.getVoices();
      if (retryVoices.length > 0) {
        selectedVoice = retryVoices[0];
      }
    }
    
    // Set voice - if null, browser will use default system voice
    utt.voice = selectedVoice;

    utt.rate   = rate;

    utt.pitch  = pitch;

    utt.lang   = utt.voice?.lang || 'en-US';
    utt.volume = 1.0;  // Ensure volume is maximum



    // onboundary fires word-position events — not supported on iOS Safari.
    // On iOS progress bar stays at 0 but audio still plays (graceful degradation).
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



    utt.onerror = (e) => {
      // 'interrupted' errors are normal when synth.cancel() is called — ignore them
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      clearInterval(timerRef.current);
      setPlaying(false);
    };



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

    // Load voices on user gesture (required on mobile)
    const currentVoices = synth.getVoices();
    if (currentVoices.length > 0 && !voicesReady) {
      setVoices(currentVoices);
      setVoicesReady(true);
      const best = pickBestIdx(currentVoices);
      setVoiceIdx(best);
      selectedNameRef.current = currentVoices[best]?.name || '';
    }

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

      {/* Top row: chapter info (left) + gear button (right) */}

      <div className="audio-player__header">

        <div className="audio-player__info">

          <span className="audio-player__icon"><IcoHeadphones /></span>

          <div>

            <strong className="audio-player__title">{chapters[currentChapter]?.title || 'Listening…'}</strong>

            <span className="audio-player__sub">Ch {currentChapter + 1} of {chapters.length}</span>

          </div>

        </div>

        <button className={'audio-btn audio-btn--gear' + (showCfg ? ' on' : '')} onClick={() => setShowCfg(s => !s)} title={`Voice settings${voices.length ? ` (${voices.length} voices)` : ''}`}><IcoGear /></button>

      </div>



      {/* Centre: controls + progress */}

      <div className="audio-player__centre">

        <div className="audio-player__controls">

          <button className="audio-btn" title="Rewind 15s" onClick={handleRewind}><IcoRewind /></button>

          <button className="audio-btn audio-btn--play" title={playing ? 'Pause' : 'Play'} onClick={handlePlay}>

            {playing ? <IcoPause /> : <IcoPlay />}

          </button>

          <button className="audio-btn" title="Stop" onClick={handleStop}><IcoStop /></button>

          <button className="audio-btn" title="Next chapter" onClick={handleSkip} disabled={currentChapter >= chapters.length - 1}><IcoSkip /></button>

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



      {/* Speed pills row — always visible */}

      <div className="audio-player__right">

        <div className="audio-speed-pills">

          {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (

            <button

              key={r}

              className={'audio-speed-pill' + (rate === r ? ' on' : '')}

              onClick={() => { setRate(r); if (playing) { speak(charRef.current); } }}

              title={`${r}× speed`}

            >

              {r === 1.0 ? '1×' : `${r}×`}

            </button>

          ))}

        </div>

      </div>

      {/* Mobile voice loading hint */}

      {!voicesReady && voices.length === 0 && (

        <div style={{ fontSize: '0.7rem', color: 'rgba(232,224,240,0.5)', padding: '0 8px', textAlign: 'center', marginTop: '2px' }}>

          Loading voices… Tap play to start listening.

        </div>

      )}



      {/* Settings panel */}

      {showCfg && (

        <div className="audio-settings">

          <div className="audio-settings__row">

            <label>Voice filter</label>

            <div className="audio-filter-group">

              {['all','female','male'].map(f => (

                <button key={f} className={'audio-filter-btn' + (filter === f ? ' on' : '')}

                  onClick={() => {
                    setFilter(f);
                    // Try to keep the previously selected voice if available in new filter
                    if (!selectedNameRef.current) setVoiceIdx(0);
                  }}>

                  {f === 'female' ? '♀ Female' : f === 'male' ? '♂ Male' : '👥 All'}

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

                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setVoiceDdOpen(o => !o);
                  } else if (e.key === 'Escape') {
                    setVoiceDdOpen(false);
                  } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !voiceDdOpen) {
                    e.preventDefault();
                    setVoiceDdOpen(true);
                  }
                }}

                type="button"

                aria-expanded={voiceDdOpen}

                aria-label="Select voice"

              >

                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>

                  <span style={{ flex: 1 }}>

                    {dispVoices[safeIdx]?.name || 'Select voice'}

                    {dispVoices[safeIdx] && isGoogleNeural(dispVoices[safeIdx]) && (

                      <span className="audio-neural-badge audio-neural-badge--google">🔵 Neural</span>

                    )}

                    {dispVoices[safeIdx] && !isGoogleNeural(dispVoices[safeIdx]) && isNeuralVoice(dispVoices[safeIdx]) && (

                      <span className="audio-neural-badge">✨ Neural</span>

                    )}

                    {' '}<small style={{ opacity: 0.5, fontSize:'0.65rem' }}>{dispVoices[safeIdx]?.lang}</small>

                  </span>

                  <span style={{ fontSize: '0.85rem', color: 'rgba(74,158,255,0.6)', flexShrink: 0, fontWeight: 700 }}>✓ Active</span>

                </span>

                <span className={'audio-custom-dd__arrow' + (voiceDdOpen ? ' open' : '')}>▾</span>

              </button>

              {voiceDdOpen && (

                <div className="audio-custom-dd__list">

                  {dispVoices.length === 0 && (

                    <div className="audio-custom-dd__empty">No voices found for this filter</div>

                  )}

                  {dispVoices.map((v, i) => (

                    <button

                      key={i}

                      type="button"

                      className={'audio-custom-dd__item' + (selectedNameRef.current === v.name ? ' on' : '')}

                      onClick={(e) => {
                        e.preventDefault();
                        selectedNameRef.current = v.name || '';
                        // Find the voice in the full voices array to set correct voiceIdx
                        const fullIdx = voices.findIndex(voice => voice.name === v.name);
                        if (fullIdx >= 0) setVoiceIdx(fullIdx);
                        setVoiceDdOpen(false);
                        if (playing) speak(charRef.current);
                      }}

                    >

                      <span className="audio-custom-dd__name">

                        {v.name}

                        {isGoogleNeural(v) && (

                          <span className="audio-neural-badge audio-neural-badge--google">🔵 Neural</span>

                        )}

                        {!isGoogleNeural(v) && isNeuralVoice(v) && (

                          <span className="audio-neural-badge">✨ Neural</span>

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

            <label>Speed × {rate}×</label>

            <div className="audio-speed-pills">

              {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(r => (

                <button

                  key={r}

                  className={'audio-speed-pill' + (rate === r ? ' on' : '')}

                  onClick={() => { setRate(r); if (playing) speak(charRef.current); }}

                >

                  {r}×

                </button>

              ))}

            </div>

          </div>

          <div className="audio-settings__row">

            <label>Pitch × {pitch.toFixed(1)}</label>

            <input type="range" min="0.5" max="2" step="0.1" value={pitch}

              className="audio-slider"

              onChange={e => { setPitch(parseFloat(e.target.value)); if (playing) speak(charRef.current); }} />

          </div>

          <p className="audio-settings__note">

            Available voices depend on your device and browser. Chrome / Edge on Windows or Android give the most choices. On iPhone/iPad use Safari for the best iOS voices. Voices marked ✨ or 🔵 are high-quality neural voices.

          </p>

        </div>

      )}

    </div>

  );

}



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



  // -- Chapters: serve from IndexedDB cache instantly, then live-update ------

  // Phase 1: getDocFromCache ? zero network latency, renders immediately

  // Phase 2: onSnapshot ? picks up admin edits in real-time, no page refresh needed

  const [liveChapters, setLiveChapters] = useState(null);

  useEffect(() => {

    if (!book?.id) return;

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

  }, [book?.id]); // eslint-disable-line



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

    // Chapter 0 is always free for free-preview books (no login needed)

    if (book?.status === 'free-preview' && chapterNum === 0) return true;

    // Explicit freeFirstChapter flag (ongoing series etc.)

    if (book?.freeFirstChapter && chapterNum === 0) return true;

    return false;

  }, [book?.status, book?.freeFirstChapter, checkOwned]);



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



  /* -- Gates -- */

  if (!book) {
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
        <Link to="/library" className="btn btn-primary">Back to Library</Link>
      </div>
    );
  }



  // Free-preview ch0 is always accessible without login

  const isFreePreviewCh0 = (book?.status === 'free-preview' || book?.freeFirstChapter) && chapter === 0;



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



  if (!checkOwned() && !isFreePreviewCh0) {

    // Still waiting for Firestore library snapshot

    if (user && !libLoaded) return (

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



  if (user && myPerms && myPerms.canReadOnline === false) return (

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

  // Chapters: prefer live Firestore ? offline cache ? fallback static content

  const chapters   = liveChapters || offlineChapters || getFallbackChapters(book);



  // -- Save for offline handler ----------------------------------------------

  const handleSaveOffline = async () => {

    if (!user?.email || !book?.id) return;

    setOfflineSaving(true);

    setOfflineSaveMsg('');

    const ok = saveBookOffline(user.email, book.id, book, chapters);

    setOfflineSaving(false);

    if (ok) {

      setOfflineSaved(true);

      setOfflineChapters(chapters);

      setOfflineSaveMsg('✅ Saved for offline reading');

    } else {

      setOfflineSaveMsg('❌ Could not save — storage may be full');

    }

    setTimeout(() => setOfflineSaveMsg(''), 3500);

  };



  const handleRemoveOffline = () => {

    if (!user?.email || !book?.id) return;

    removeOfflineBook(user.email, book.id);

    setOfflineSaved(false);

    setOfflineChapters(null);

    setOfflineSaveMsg('🗑️ Removed from offline library');

    setTimeout(() => setOfflineSaveMsg(''), 3000);

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



  const viewMode   = hasPdf ? mode : (mode === 'listen' ? 'listen' : 'text');



  // resize listener for mobile nav detection (declared above with state)

  useEffect(() => {

    const fn = () => setIsMobileNav(window.innerWidth < 769);

    window.addEventListener('resize', fn);

    return () => window.removeEventListener('resize', fn);

  }, []);



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

              {/* Offline save button */}

              {!isOffline && (siteControls?.offlineEnabled !== false) && chapters?.length > 0 && (

                offlineSaved ? (

                  <button

                    className="reader__font-btn"

                    style={{padding:'3px 9px',fontSize:'0.7rem',background:'rgba(46,204,113,0.12)',border:'1px solid rgba(46,204,113,0.3)',borderRadius:'var(--r-sm)',color:'#2ecc71',whiteSpace:'nowrap'}}

                    title="Remove from offline library"

                    onClick={handleRemoveOffline}

                  >✅ Offline</button>

                ) : (

                  <button

                    className="reader__font-btn"

                    style={{padding:'3px 9px',fontSize:'0.7rem',background:'rgba(201,168,76,0.12)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:'var(--r-sm)',color:'var(--gold)',whiteSpace:'nowrap'}}

                    title="Save book for offline reading"

                    onClick={handleSaveOffline}

                    disabled={offlineSaving}

                  >{offlineSaving ? '⏳' : '⬇️ Save'}</button>

                )

              )}



              {/* Mode toggle */}

              <div className="reader__mode-toggle">

                <button className={'reader__mode-btn' + (viewMode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>📖 Read</button>

                <button className={'reader__mode-btn reader__mode-btn--listen' + (mode === 'listen' ? ' on' : '')} onClick={() => setMode('listen')}>🎧 Listen</button>

              </div>



              {/* Zoom / font size */}

              {(viewMode === 'text' || viewMode === 'listen') && (

                <div className="reader__zoom-group">

                  <button className="reader__font-btn" onClick={() => setFontSize(s => Math.max(13, s - 1))}>A-</button>

                  <span className="reader__zoom-label">{fontSize}px</span>

                  <button className="reader__font-btn" onClick={() => setFontSize(s => Math.min(26, s + 1))}>A+</button>

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

              {!isOffline && (siteControls?.offlineEnabled !== false) && chapters?.length > 0 && (

                offlineSaved ? (

                  <button

                    className="reader__font-btn"

                    style={{padding:'4px 12px',fontSize:'0.78rem',background:'rgba(46,204,113,0.12)',border:'1px solid rgba(46,204,113,0.3)',borderRadius:'var(--r-sm)',color:'#2ecc71'}}

                    title="Remove from offline library"

                    onClick={handleRemoveOffline}

                  >✅ Saved Offline</button>

                ) : (

                  <button

                    className="reader__font-btn"

                    style={{padding:'4px 12px',fontSize:'0.78rem',background:'rgba(201,168,76,0.12)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:'var(--r-sm)',color:'var(--gold)'}}

                    title="Save book for offline reading (stored in your browser)"

                    onClick={handleSaveOffline}

                    disabled={offlineSaving}

                  >{offlineSaving ? '⏳ Saving…' : '⬇️ Save Offline'}</button>

                )

              )}

              {offlineSaveMsg && (

                <span style={{fontSize:'0.75rem',color:'var(--muted)',flexShrink:0}}>{offlineSaveMsg}</span>

              )}

              {/* Mode toggle — PDF + Text + Listen */}

              <div className="reader__mode-toggle">

                <button className={'reader__mode-btn' + (viewMode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>📖 Read</button>

                <button className={'reader__mode-btn reader__mode-btn--listen' + (mode === 'listen' ? ' on' : '')} onClick={() => setMode('listen')}>🎧 Listen</button>

              </div>

              {(viewMode === 'text' || viewMode === 'listen') && (

                <div className="reader__zoom-group">

                  <button className="reader__font-btn" onClick={() => setFontSize(s => Math.max(13, s - 1))} title="Smaller text">A-</button>

                  <span className="reader__zoom-label">{fontSize}px</span>

                  <button className="reader__font-btn" onClick={() => setFontSize(s => Math.min(26, s + 1))} title="Larger text">A+</button>

                </div>

              )}

            </div>

          </>

        )}

      </div>



      {/* -- Offline reading banner -- */}

      {isOffline && offlineSaved && (

        <div style={{

          display: 'flex', alignItems: 'center', gap: 10,

          padding: '8px 18px',

          background: 'rgba(46,204,113,0.10)',

          borderBottom: '1px solid rgba(46,204,113,0.2)',

          fontSize: '0.82rem', color: '#2ecc71',

        }}>

          <span>✅</span>

          <span>Reading from offline cache — no internet required.</span>

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

          <span>⚠️</span>

          <span>You are offline. This book was not saved for offline reading. Connect to the internet to continue.</span>

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



            <div className="reader__text" style={{ fontSize: fontSize + 'px' }}>

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

                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>

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


