import { useParams, Link, useLocation } from 'react-router-dom';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { findBookBySlugOrId, bookPath } from '../utils/slugify';
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

  // Load available voices — auto-select best neural English voice
  useEffect(() => {
    const load = () => {
      const v = synth.getVoices();
      if (!v.length) return;
      setVoices(v);

      // Priority: Microsoft Neural voices > Google voices > any en-US > fallback
      const NEURAL_PRIORITY = [
        // Microsoft neural (Edge/Chrome Windows — genuinely human quality)
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
              title={`${r}× speed`}
            >
              {r === 1.0 ? '1×' : `${r}×`}
            </button>
          ))}
        </div>
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
            <div className="audio-custom-dd" style={{ flex: 1 }}>
              <button
                className="audio-custom-dd__trigger"
                onClick={() => setVoiceDdOpen(o => !o)}
                type="button"
              >
                <span>
                  {dispVoices[safeIdx]?.name || 'Select voice'}
                  {dispVoices[safeIdx] && /microsoft.*(jenny|aria|guy|davis|emma|brian|ana|andrew|ryan|sonia|libby|mia|neerja|ravi)/i.test(dispVoices[safeIdx].name) && (
                    <span className="audio-neural-badge">✨ Neural</span>
                  )}
                  {dispVoices[safeIdx] && /google/i.test(dispVoices[safeIdx].name) && (
                    <span className="audio-neural-badge audio-neural-badge--google">🔵 Neural</span>
                  )}
                  {' '}<small style={{ opacity: 0.5, fontSize:'0.65rem' }}>{dispVoices[safeIdx]?.lang}</small>
                </span>
                <span className={'audio-custom-dd__arrow' + (voiceDdOpen ? ' open' : '')}>▾</span>
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
                          <span className="audio-neural-badge">✨ Neural</span>
                        )}
                        {/google/i.test(v.name) && (
                          <span className="audio-neural-badge audio-neural-badge--google">🔵 Neural</span>
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
            <label>Speed — {rate}×</label>
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
    // PART ONE — BEFORE LOVE
    { part:'PART ONE — BEFORE LOVE', title:'Chapter 1: A Young Man With Big Dreams', subtitle:'Karen, Nairobi — 2013', text:`The alarm rang at exactly five-thirty in the morning.\n\nBrian opened his eyes and stared at the ceiling for a few seconds before sitting up.\n\nOutside, Nairobi was slowly waking up.\n\nThe roads would soon fill with matatus. Shops would open. The city would remember that it had things to do and people to swallow.\n\nBrian had been awake for twenty minutes before the alarm rang. He usually was. There was too much in his head to sleep past five — plans, calculations, the restless mathematics of a young man who believed, with a certainty that bordered on arrogance, that he was going somewhere.\n\nHe was twenty-two. He had a small room in Karen, a laptop he had saved for over eighteen months, and an idea that kept him awake more reliably than any alarm clock.`},
    { title:'Chapter 2: The Talent Show', subtitle:'University of Nairobi — 2013', text:`The auditorium smelled of fresh paint and anxiety.\n\nBrian had not intended to perform. He had come to watch a friend, to fill a seat, to be somewhere other than his room. But somewhere between the third act and the intermission, someone pulled out of the lineup and the MC was walking the rows looking for a replacement.\n\nEveryone pretended to look at their phones.\n\nBrian did not know why he raised his hand. Later he would say it was instinct. His mother would say it was God. His friends would say it was stupidity.\n\nWhatever it was, it changed everything.`},
    { title:'Chapter 3: The Girl in the Audience', subtitle:'', text:`He almost missed her.\n\nShe was sitting in the fourth row, slightly left of centre, and she was not doing what everyone else was doing. She was not scrolling through her phone. She was not whispering to the person beside her. She was watching the stage with the kind of attention that felt, from where Brian stood, almost personal.\n\nHe had been performing for four minutes. He had forgotten the audience existed.\n\nThen he saw her, and suddenly the audience was very real.`},
    { title:'Chapter 4: Paths Begin to Cross', subtitle:'', text:`They did not speak that night.\n\nBrian looked for her after the show — not in a dramatic, searching way, but in the way you look for something you're not sure you should want. A casual glance toward the fourth row. A slow walk past the corridor where he'd last seen her.\n\nShe was gone.\n\nHe told himself it didn't matter. He had an early morning, a deadline, two unread chapters of a textbook he'd been avoiding for a week. He did not have time to think about a girl he hadn't spoken to.\n\nHe thought about her anyway.`},
    { title:'Chapter 5: More Than Acquaintances', subtitle:'', text:`The second time they met, she remembered him.\n\nThat surprised him more than it should have. It was a library encounter — the kind that sounds arranged in the retelling but feels entirely accidental in the moment. He was looking for a book. She was returning one. They reached the same shelf from opposite ends.\n\nShe looked up. "You performed at the talent show."\n\nNot a question. A statement. The way someone says a thing they've been holding.\n\n"I did," Brian said.\n\n"You were nervous," she said. "But you stayed anyway."\n\nHe didn't know what to do with that observation, so he held out his hand. "Brian."\n\n"Diana," she said, and shook it.`},
    { title:'Chapter 6: The End of College', subtitle:'', text:`Graduation came the way endings always do — faster than you expect, and with a finality you hadn't quite prepared for.\n\nBrian stood in the crowd in his gown, holding his degree, and thought about what came next. He had plans. He had always had plans. But plans made inside a university felt different outside of one.\n\nDiana was somewhere in the crowd. He knew this. They had said something like a goodbye the week before — not a real one, more of a see-you-later wrapped in uncertainty.\n\nHe hadn't asked for her number. She hadn't offered it.\n\nThey were twenty-three years old and neither of them knew what they were to each other yet.`},
    // PART TWO — FINDING EACH OTHER AGAIN
    { part:'PART TWO — FINDING EACH OTHER AGAIN', title:'Chapter 7: Years Later', subtitle:'Nairobi — 2019', text:`Six years is enough time to become someone different.\n\nBrian had done exactly that. The young man who raised his hand at a talent show because he didn't know better had become, by 2019, a man with a business that employed eleven people, a car he'd bought with his own money, and a reputation in certain circles as someone who delivered.\n\nHe still woke up at five. Some things don't change.\n\nThe city had changed, though. Nairobi was always changing — more buildings, more traffic, more ambition competing for the same roads. He had learned to move through it differently. Faster. With less of the wide-eyed energy he'd had at twenty-two and more of something quieter, more purposeful.\n\nHe was not unhappy.\n\nBut some mornings, in the space between waking and rising, he felt the particular absence of something he couldn't name.`},
    { title:'Chapter 8: A Familiar Voice', subtitle:'', text:`He heard her before he saw her.\n\nHe was at a networking event he'd almost skipped — one of those evening gatherings in a hotel conference room where everyone stands with a drink and talks about their work as though work is a personality. Brian went because a client had asked him to come and he owed the client a favour.\n\nHe was considering leaving when he heard the laugh.\n\nHe turned around.\n\nDiana was standing ten feet away, talking to two men in suits, holding a glass of water and laughing at something one of them had said. She looked — he searched for the right word — settled. Like a person who had found the shape of their life and fit into it comfortably.\n\nShe looked up and saw him at the exact same moment.\n\nNeither of them moved for a full second.`},
    { title:'Chapter 9: The Road to Nyeri', subtitle:'', text:`She was based in Nyeri now. She told him this over coffee two days after the event, in a quiet place in Westlands where neither of them had to pretend the meeting was accidental.\n\n"Bank manager," she said. "I know. I didn't see it coming either."\n\n"It suits you," he said.\n\nShe raised an eyebrow. "You don't know what suits me."\n\n"I knew you for two years," he said. "I remember enough."\n\nShe was quiet for a moment. Then: "What do you remember?"\n\nHe thought about the library. The shelf. The way she'd said, you were nervous but you stayed anyway, like it was the most important thing about him.\n\n"That you pay attention," he said. "Most people don't.""`},
    { title:'Chapter 10: Weekend Visits', subtitle:'', text:`It started with one visit.\n\nBrian drove to Nyeri on a Saturday in March — telling himself it was a casual thing, a drive, a chance to see the Mount Kenya region he'd never taken time to explore properly.\n\nHe was lying to himself and he knew it.\n\nDiana showed him the town with the ease of someone who had made peace with a place. They walked through Nyeri town, ate at a local place she recommended, drove past the church she passed every morning on the way to work.\n\n"You've settled here," he said.\n\n"I stopped running," she said. "There's a difference."`},
    { title:'Chapter 11: What the Heart Wants', subtitle:'', text:`He drove back to Nairobi that evening and sat in his apartment for a long time without turning on the lights.\n\nHe had been telling himself a story for six years — that he was focused, building, that relationships were for later, for when the work was done. It was a useful story. It had kept him moving.\n\nBut Diana had looked at him over lunch with that same quality of attention he remembered from the library, and the story had developed a crack.\n\nHe called her that night.\n\nShe picked up on the second ring.\n\n"You drove four hours to have lunch," she said, before he could speak. "I'm just saying."\n\n"I know," he said.\n\n"Okay," she said.\n\nNeither of them said anything for a moment. Then both of them laughed, and something settled between them — something that had been unresolved for six years — and finally came to rest.`},
    { title:'Chapter 12: A Promise of Forever', subtitle:'', text:`He proposed on a Sunday.\n\nNot in a restaurant. Not with a setup. He had thought about those things — the Instagram version of the moment — and then he had thought about Diana, who had no patience for performance, and he had done something different.\n\nHe had driven to Nyeri and they had gone for a walk in the late afternoon, through a field at the edge of town where the light came sideways through the trees. He had a ring in his pocket. He had been carrying it for three weeks.\n\nHe stopped walking.\n\nShe turned to look at him.\n\n"I've been thinking about the future," he said.\n\n"You're always thinking," she said.\n\n"I want you in it," he said. "All of it. Officially."\n\nHe took out the ring.\n\nShe looked at it for a moment. Then she looked at him.\n\n"You're not going to kneel?" she said.\n\n"Do you want me to?"\n\n"No," she said. "I hate that." She took the ring. "Yes. Obviously yes."`},
    // PART THREE — BUILDING THE DREAM
    { part:'PART THREE — BUILDING THE DREAM', title:'Chapter 13: The White Wedding', subtitle:'', text:`The wedding was everything both families wanted and nothing either of them had planned.\n\nThis is the nature of weddings.\n\nBrian had thought — and said out loud, more than once — that he wanted something small. Immediate family. A simple ceremony. Diana had agreed with this in theory and then watched the guest list grow from forty to ninety to a hundred and forty as mothers made phone calls and aunts offered catering connections and cousins materialised from counties Brian had never visited.\n\nHe did not fight it. He had learned, in the months of engagement, that some battles are not about winning.\n\nThe day itself was a Saturday in April. Clear sky. The kind of light that makes photographers look talented. Diana walked in wearing something that made Brian forget, briefly, how to breathe.\n\nHe told her this later.\n\n"I know," she said. "I saw your face."`},
    { title:'Chapter 14: A House Full of Hope', subtitle:'', text:`They moved into the house in Karen four months after the wedding.\n\nIt was not the house Brian had imagined at twenty-two — that one had been grander, vaguer, the kind of house that exists only in ambition. This one was real. Three bedrooms, a garden that needed work, a kitchen Diana immediately started redesigning in her head.\n\n"We'll paint the gate," she said on the first day, walking around the compound. "And the garden — I want fruit trees."\n\n"Whatever you want," Brian said.\n\nShe turned to look at him. "You always say that."\n\n"I always mean it," he said.\n\nShe smiled at him — the full one, not the polite one — and he thought: this is it. This is the life.\n\nHe believed it completely. There was no reason not to.`},
    { title:'Chapter 15: The Two Queens', subtitle:'', text:`Their first daughter arrived fourteen months after the wedding.\n\nThey named her Amara.\n\nBrian held her in the hospital corridor and felt something rearrange itself permanently inside him. He had been warned about this feeling — by his father, by friends who had children, by the general cultural understanding that fatherhood changes a man. He had listened to all of these warnings politely and understood none of them.\n\nNow he understood.\n\nDiana watched him from the bed, exhausted and luminous, and said: "Put her down before you drop her."\n\n"I'm not going to drop her."\n\n"You're shaking."\n\n"I'm not shaking. I'm emotional. There's a difference."\n\nThe second daughter, Zoe, arrived two years later. By then Brian knew how to hold a baby without shaking. He still cried, though. He had stopped being embarrassed about that.`},
    { title:'Chapter 16: Success Has a Price', subtitle:'', text:`The business grew.\n\nThis is the part of the story that sounds like a good thing, and mostly it was. More clients. Bigger contracts. A second office. Staff meetings that required a conference table rather than a kitchen table.\n\nBrian was proud of it. He had built this from a laptop and an idea, and watching it expand felt like proof of something — that the five a.m. mornings had been worth it, that the years of discipline had compounded into something real.\n\nThe price of it was time.\n\nHe began coming home later. First by an hour. Then two. Then there were nights in Nairobi when the drive to Nyeri — Diana had kept her position, they had agreed on this — was simply not practical.\n\nHe called every night.\n\nThis was not the same as being there.`},
    // PART FOUR — THE CRACKS
    { part:'PART FOUR — THE CRACKS', title:'Chapter 17: Coming Home Late', subtitle:'', text:`Diana noticed the change before she had words for it.\n\nIt was not dramatic. That was what made it difficult to name. There was no single moment, no clear boundary between before and after. There was only a gradual shift — a slow adjustment of the temperature in the marriage, so incremental that by the time she felt cold she could not remember when she had stopped feeling warm.\n\nBrian worked. He had always worked. But there was a quality to his absence now that felt different from ambition. It felt like preference.\n\nShe did not say this to him. She filed it away in the part of her mind where she kept things that required more evidence before she would allow herself to act on them.\n\nShe kept waiting for the evidence to stop accumulating.`},
    { title:'Chapter 18: Questions Without Answers', subtitle:'', text:`She started asking questions she hadn't needed to ask before.\n\nWhere are you? When will you be home? Who was that call from?\n\nBrian answered them. He always answered them. But there was a fraction of a pause before each answer that Diana had learned to read — not as guilt, necessarily, but as something that required management. Like he was deciding not what to say, but how much.\n\nShe was a bank manager. She had spent fifteen years reading the gap between what people said and what their numbers showed. She was very good at it.\n\nShe brought it up one Sunday morning over breakfast.\n\n"Something has changed," she said.\n\n"Nothing has changed," he said.\n\n"Brian."\n\n"Diana. I'm building something. You know this."\n\nShe did know this. That was the problem. The thing he was building had become a reason for everything, and she could not argue with it without sounding like she was arguing against success.`},
    { title:'Chapter 19: The Distance Between Us', subtitle:'', text:`Distance is not always geography.\n\nDiana knew this intellectually. She had read enough, counselled enough friends, been observant enough throughout her life to understand that the miles between Nyeri and Nairobi were not the real issue.\n\nThe real issue was that she and Brian were having different experiences of the same marriage.\n\nHis experience: a man working hard, providing, building a future for his family. A man who loved his wife and daughters completely and would give anything for them.\n\nHer experience: a woman waiting. A woman who had made a life — a full one, she was not helpless — but who had constructed it largely without the person it was supposed to include.\n\nBoth experiences were true. That was the part that made it hard.`},
    { title:'Chapter 20: Money and Secrets', subtitle:'', text:`The money was the next thing.\n\nNot that it disappeared dramatically — nothing in this marriage happened dramatically. But Diana was good with numbers, and numbers do not lie the way people do, and the numbers were telling her a story she didn't like.\n\nHousehold account withdrawals she couldn't account for. Amounts that were not large enough to be immediately alarming but too regular to be accidental.\n\nShe brought it up carefully. She had been a bank manager long enough to know that people who feel accused stop talking.\n\n"I've been looking at the household account," she said. "There are some withdrawals I don't recognise."\n\n"I'll explain them," Brian said.\n\nHe did explain them. Plausibly. Completely.\n\nShe believed the explanation. She also marked it in her mind — the way she marked things — and kept watching.`},
    // PART FIVE — THE FALL
    { part:'PART FIVE — THE FALL', title:'Chapter 21: The Other Man', subtitle:'', text:`His name came up by accident.\n\nDiana had not been looking for anything. This is the thing about discoveries in a marriage — they rarely arrive because you were searching. They arrive because the world, apparently, has a sense of irony.\n\nShe was at a function in Nyeri. A colleague's birthday. Someone mentioned a name — casually, in the context of a story about a mutual contact — and the name landed differently than it should have.\n\nShe kept her face still. She was very good at this.\n\nLater that night, in her car, she sat for twenty minutes before starting the engine. She went through what she knew. What she had noticed. What she had filed away and told herself was insufficient evidence.\n\nIt was sufficient now.`},
    { title:'Chapter 22: Truth Has a Way of Appearing', subtitle:'', text:`She did not confront Brian immediately.\n\nThis is not because she was afraid. Diana had never been particularly afraid of confrontation — she had just learned, over years, to choose the moment carefully. A confrontation without enough information is just an argument. A confrontation with the right information is a reckoning.\n\nShe spent two weeks gathering the right information.\n\nShe did not hire anyone. She did not go through his phone — that felt, to her, like a line she was not ready to cross. She used what she already knew, what she had already observed, and she put it together the way she would put together a financial audit — methodically, without emotion, following the evidence where it led.\n\nWhere it led was somewhere she had half-known it would go.`},
    { title:'Chapter 23: The Day Everything Changed', subtitle:'', text:`She called him on a Tuesday.\n\nNot to fight. Not to accuse. She called him and said: "I need you to come home this weekend. Not next weekend. This one. Friday night."\n\nHe heard something in her voice.\n\n"Is everything okay? The girls—"\n\n"The girls are fine. I need to talk to you. Come home."\n\nHe came.\n\nThey sat in the living room of the Karen house — the house they had chosen together, the house where their daughters had taken their first steps — and Diana placed what she had found on the table between them. Not dramatically. Not as a weapon. As information.\n\n"Tell me if I'm wrong," she said.\n\nHe looked at what was on the table.\n\nHe did not tell her she was wrong.`},
    // PART SIX — AFTER THE STORM
    { part:'PART SIX — AFTER THE STORM', title:'Chapter 24: Missed Calls', subtitle:'', text:`The days that followed the Tuesday conversation were the quietest Brian had ever known.\n\nNot peaceful quiet. The other kind — the kind where sound still exists but nothing in it means anything.\n\nHe moved through his days. He went to the office. He answered emails. He sat in meetings and said the right things at the right times. From the outside, he was functional.\n\nInside, he was somewhere else entirely.\n\nHis phone showed seventeen missed calls over the course of four days. None of them were from Diana.\n\nThis was new. In eight years of marriage — through every argument, every silence, every cold Sunday morning — she had always answered. Even when she was angry. Even when the conversation was difficult. She answered because she believed that not answering was a kind of abandonment.\n\nSeventeen missed calls.\n\nHe understood, finally, that he had built the distance he was now standing in.`},
  ],
  '2': [
    { title:'Chapter 1 — The Weight', subtitle:'Nairobi, an Ordinary Wednesday', text:`Pain is not dramatic. That is the first lie they tell you.\n\nIn films, pain arrives with music — low strings, a single piano note, rain against a window. In real life, it arrives in the middle of an ordinary Tuesday. While you are making tea. While you are answering an email.\n\nKamau's Tuesday was a Wednesday, actually. The ninth of August. He had been up since five, the way he always was, because the body remembers its own rhythms even when everything else forgets them.\n\nHe had made the tea. He had opened the curtains. He had sat down at the table with the intention of working.\n\nThen the phone rang.`},
  ],
  '11': [
    { title:'Day 1 — The Call', subtitle:'Nairobi · A Tuesday Morning', text:`Nineteen days. That is all it took.\n\nKe did not know, on the morning of the first day, that everything was about to change. He was standing at the window of his apartment, watching the early Nairobi traffic crawl below, coffee cup in hand, the same Tuesday routine he had maintained for three years.\n\nThen his phone rang.\n\nHe did not recognise the number. He almost did not answer. Later, he would think about that — how close he came to letting it ring out, to going on with his ordinary Tuesday, to never knowing.\n\nBut he answered.`},
    { title:'Day 3 — The Decision', subtitle:'The Point of No Return', text:`By the third day, Ke understood that there was no going back.\n\nThe choice that had been placed before him was not the kind you could unmake. It was the kind that sat in your chest and rearranged things — quietly, permanently, without asking permission.\n\nHe had not slept. He had walked the city instead. Seven hours through streets he had known his whole life, seeing them differently, as if the news had changed the light.\n\nNairobi had never looked so much like itself. Raw and complicated and full of a beauty that only showed up when you were paying the kind of attention that came with loss.`},
    { title:'Day 7 — The Truth', subtitle:'What the Letter Said', text:`On the seventh day, the truth arrived in the form of a letter.\n\nNot a message. Not an email. An actual letter, handwritten, slid under his door at some point between midnight and six in the morning.\n\nKe read it three times. The first time for facts. The second time for meaning. The third time because he could not believe what the first two times had told him.\n\nSomeone had known. Someone had always known. And they had chosen, for seven years, to say nothing.\n\nThe question was no longer what had happened. The question was why.`},
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

  // ── Always fetch the latest chapters from Firestore so admin edits are
  //    immediately visible to readers without waiting for cache expiry ────────
  const [liveChapters, setLiveChapters] = useState(null);
  useEffect(() => {
    if (!book?.id) return;
    getDoc(doc(db, 'book_chapters', String(book.id)))
      .then(snap => {
        if (snap.exists() && snap.data().chapters?.length > 0) {
          setLiveChapters(snap.data().chapters);
        }
      })
      .catch(() => {}); // silently fall back to context chapters
  }, [book?.id]); // eslint-disable-line

  // ── Reading progress ──────────────────────────────────────────────────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  // Ownership check — uses Firestore-backed library state from AppContext
  const checkOwned = useCallback(() => {
    if (!user) return false;
    return isOwned(book?.id ?? id);
  }, [user, isOwned, book?.id, id]);

  // Get the owned book entry (includes driveUrl set at unlock time)
  const getOwnedBook = useCallback(() => {
    if (!user) return null;
    return library.find(x => x.id === (book?.id ?? id)) || null;
  }, [user, library, book?.id, id]);

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
        <Link to={bookPath(book)} className="btn btn-primary">Buy — KSh {book.price}</Link>
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
  const ownedEntry = library.find(x => x.id === (book?.id ?? id));
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
        🔒 Licensed to &bull;<strong>{user.name}</strong> &bull; {user.email} — Personal use only. Sharing or redistribution is prohibited.
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
                  <React.Fragment key={i}>
                    {ch.part && (
                      <div className="reader__ch-part-divider">{ch.part}</div>
                    )}
                    <button className={'reader__ch-btn' + (i === chapter ? ' on' : '')}
                      onClick={() => { setChapter(i); window.scrollTo(0, 0); }}>
                      {ch.title}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
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
              🔒 Licensed to &bull; <strong>{user.name}</strong> &bull; {user.email}
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

            {/* End-of-chapter marker — auto-generates from chapter data, admin-editable */}
            <div className="reader__end">
              <p>{chapters[chapter]?.endMessage || `— End of Chapter ${chapter + 1} —`}</p>
              {chapter < chapters.length - 1 && (
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Continue to Chapter {chapter + 2} →
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
                  <React.Fragment key={i}>
                    {ch.part && (
                      <div className="reader__ch-part-divider">{ch.part}</div>
                    )}
                    <button className={'reader__ch-btn' + (i === chapter ? ' on' : '')}
                      onClick={() => { setChapter(i); window.scrollTo(0, 0); }}>
                      {ch.title}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

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
              🔒 Licensed to &bull; <strong>{user.name}</strong> &bull; {user.email}
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

            {/* End-of-chapter marker for listen mode */}
            <div className="reader__end">
              <p>{chapters[chapter]?.endMessage || `— End of Chapter ${chapter + 1} —`}</p>
              {chapter < chapters.length - 1 && (
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
                  onClick={() => { setChapter(c => c + 1); window.scrollTo(0, 0); }}>
                  Continue to Chapter {chapter + 2} →
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
    </div>
  );
}
