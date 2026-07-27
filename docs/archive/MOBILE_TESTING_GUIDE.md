# Mobile Audio Reader Testing Guide

## Overview
This guide covers testing the Ellines Haven audio reader across all mobile devices, ensuring voice selection, audio playback, and layout work perfectly on phones and tablets.

---

## 1. AUDIO PLAYBACK TESTING

### 1.1 Voice Selection & Audio Works Across Devices

#### Test Devices
- ✅ **iPhone (iOS 15+)** — Siri voices (Allison, Karen, Moira, Samantha)
- ✅ **iPad (iPadOS 15+)** — Same Siri voices, larger screen
- ✅ **Android Phone (Chrome)** — Google voices, Microsoft neural
- ✅ **Android Tablet (Chrome)** — Larger screen, faster processor
- ✅ **Windows Phone (Edge)** — Microsoft neural voices
- ✅ **Desktop (Chrome/Safari/Firefox)** — All voices available

#### Test Steps

**Voice Selection (Male/Female)**
1. Navigate to **Read** → Select any chapter
2. Tap the **Listen** button (headphones icon)
3. Tap the **⚙️ Settings** (gear) icon in audio player
4. See three filter buttons: **♀ Female** | **♂ Male** | **👥 All**
5. Tap **♀ Female** → Voice list filters to female voices only
6. Tap **♂ Male** → Voice list filters to male voices only
7. Tap **👥 All** → Shows all available voices
8. **Expected**: Dropdown opens above audio player (not below) on mobile

**Voice Playback Test**
1. With audio player visible, tap **Play** (▶️ button)
2. **iPhone/iPad**: Should hear crisp Siri voice (Allison or Samantha)
3. **Android**: Should hear Google Neural or Microsoft voice
4. **Desktop**: Should hear selected voice clearly
5. Tap **Pause** (⏸️) — Audio should pause immediately
6. Tap **Play** again — Audio resumes from pause point
7. **Expected**: No lag, natural speech, proper pausing/resuming

---

## 2. MOBILE LAYOUT TESTING

### 2.1 Audio Player Layout - Small Phone (<480px)

**Expected Layout (Vertical Stack)**
```
┌─────────────────────────────────────┐
│  🎧 Chapter 1 Title                 │ (Header: icon + title)
├─────────────────────────────────────┤
│     ⏮️  ⏸️  ▶️  ⏭️                      │ (Transport controls centered)
├─────────────────────────────────────┤
│  0:00 ▓▓▓▓░░░░░░ 2:45               │ (Progress bar)
├─────────────────────────────────────┤
│  1.0× 1.25× 1.5× 2.0×               │ (Speed pills wrapped)
├─────────────────────────────────────┤
│  Filter: ♀ ♂ 👥                     │ (Filter buttons)
├─────────────────────────────────────┤
│ Voice: [Dropdown ▼]                 │ (Voice selection)
├─────────────────────────────────────┤
│ Rate: [Slider ----●----]            │ (Speed slider)
│ Pitch: [Slider ----●----]           │ (Pitch slider)
└─────────────────────────────────────┘
```

**Test on Phone Screen Sizes**
- **480px–768px** (tablet): One-row controls, all buttons visible
- **400px–480px** (standard phone): Two-row layout, wrapped buttons
- **<400px** (small phone): Compact, audio title truncated with ellipsis

### 2.2 Text Reader - Small Phone (<400px)

**Expected Layout**
- Navigation bar: 104px (2 rows, no overlap)
- Page padding: 18px (tight but readable)
- Drop cap: 2rem (not oversized)
- Font size: 0.95rem (mobile-optimized)
- Watermark: "Ellines Haven" faded below nav

**Test Steps**
1. Open Reader → Select chapter
2. View in **Text** mode
3. Scroll through multiple paragraphs
4. **Expected**: First letter is slightly larger (drop cap), text justified
5. Check on landscape mode — nav should collapse to single row
6. Tap buttons — Should all be touch-friendly (≥44px height)

### 2.3 BookDetail Page - Mobile

**Expected Layout**
- Cover image: Responsive (full width, 2:3 aspect ratio)
- Title: Scales with screen (clamp font-size)
- Metadata: Stacks vertically on <480px
  - Pages: Auto-calculated from word count
  - Words: Shown with asterisk (*) if estimated
  - Read Time: Calculated from word count
- Purchase buttons: Full-width on <480px
- Action buttons: Stack vertically, each 100% width

**Test Steps**
1. Navigate to any book detail page
2. On small phone:
   - Title should fit without wrapping awkwardly
   - Cover image fills width
   - Metadata boxes stack: Pages | Words | Read Time
   - Purchase button spans full width
3. Scroll down to related books
4. **Expected**: 2-column grid on phones, responsive sizing

---

## 3. VOICE DETECTION TESTS

### 3.1 OS-Specific Voice Priority

**iOS (iPhone/iPad)**
```
Priority: Allison → Karen → Moira → Samantha → Victoria
Expected: Native Siri voice (highest quality)
```

**Android (Chrome)**
```
Priority: Google Neural → Microsoft Aria → Libby
Expected: Google voice if available, else Microsoft
```

**Windows (Edge/Chrome)**
```
Priority: Microsoft Jenny → Aria → Emma → Sonia
Expected: Microsoft neural voice
```

**macOS (Safari)**
```
Priority: Victoria → Samantha → Moira → Karen
Expected: macOS Siri voice
```

**Test Steps (Each Device)**
1. Open Reader → Listen mode
2. Tap ⚙️ Settings
3. Open voice dropdown
4. **Check**: Does the first voice in dropdown match the priority list?
5. Tap Play → **Confirm**: Voice sounds natural and is gender-appropriate
6. Change filter (♀ / ♂) → **Check**: Dropdown updates correctly

---

## 4. NETWORK TESTS (Low Bandwidth)

### 4.1 Audio Fallback on Slow Networks

**Mobile 3G/4G Test**
1. Open DevTools → Network tab
2. Throttle to "Slow 4G"
3. Start audio playback
4. **Expected**: Audio should still work (uses device's local synthesis)
5. Switch to "Offline" mode
6. **Expected**: Player shows "Speech Synthesis not supported" (graceful fallback)

### 4.2 Chapter Preloading

- **Desktop**: Next chapter text preloaded (faster transitions)
- **Mobile**: Next chapter NOT preloaded (saves bandwidth)
- **Test**: Change chapters multiple times quickly
- **Expected**: No lag, smooth transitions on all devices

---

## 5. CROSS-BROWSER TESTING

### 5.1 Mobile Browsers

| Browser | Device | Voice Support | Test Status |
|---------|--------|---|---|
| Chrome | Android | ✅ Google/Microsoft | Testing |
| Safari | iPhone | ✅ Siri voices | Testing |
| Firefox | Android | ✅ Native OS voices | Testing |
| Edge | Windows Mobile | ✅ Microsoft voices | Testing |
| Samsung Internet | Samsung | ✅ Samsung voices | Testing |

**Test Each Browser**
1. Install browser on device
2. Navigate to app
3. Go to Reader → Listen
4. **Check**: Voice list populates within 2 seconds
5. **Check**: All transport buttons work (▶️ ⏸️ ⏭️ ⏮️)
6. **Check**: Settings panel opens
7. **Check**: Voice filter works (♀ / ♂)
8. **Check**: Play audio → Sound quality is natural

---

## 6. ACCESSIBILITY TESTING

### 6.1 Touch Targets
- All buttons: ≥44px (min touch target)
- Voice dropdown: ≥40px height
- Progress bar: 14px padding (easy to tap)
- Test: Tap each button with thumb (easy reach)

### 6.2 Text Readability
- Line height: 1.8–1.92 (good on mobile)
- Font size: 0.95rem–1rem on phones (legible)
- Drop cap: Visible but not oversized
- Test: Read 2–3 paragraphs on each device
- **Expected**: Comfortable reading without pinch-zoom

### 6.3 Color Contrast
- Audio player: Blue (#4a9eff) on dark (#1a1228) ✅ Good contrast
- Text: Dark brown (#2c2218) on light (#fdf8f0) ✅ High contrast
- Test: Read all text on device without zoom
- **Expected**: All text easily readable

---

## 7. PERFORMANCE TESTS

### 7.1 Load Times

**Expected**
- BookDetail page: <2 seconds (mobile 4G)
- Reader page: <3 seconds (with chapter text)
- Voice list: <1 second (after opening settings)
- Audio playback start: <500ms after play button tap

**Test Steps**
1. Open Chrome DevTools → Network tab
2. Throttle to "Fast 3G"
3. Load each page
4. **Check**: Page is interactive before 3 seconds
5. **Check**: Audio plays without lag

### 7.2 Memory Usage
- Audio player + full chapter: <50MB (mobile)
- Voice synthesis: Active only while playing
- Test: Keep app open for 30 minutes
- **Expected**: No memory leaks, smooth playback throughout

---

## 8. DEVICE-SPECIFIC WORKAROUNDS

### 8.1 iOS Fixes
- Audio session forced to "playback" mode ✅
- Speaker output (not ear speaker) ✅
- Safe-area insets handled (notched iPhones) ✅
- onended event handling for pause/resume ✅

### 8.2 Android Fixes
- Speech synthesis reinitialized after interruption ✅
- Manual resume after pause on some devices ✅
- Local voices prioritized (faster) ✅

### 8.3 Chrome Fixes
- Keep-alive every 10 seconds (prevents 15s cutoff) ✅
- Pause/resume loop working ✅

---

## 9. TESTING CHECKLIST

### Before Production
- [ ] Test on iPhone 12/13/14 (iOS 16+)
- [ ] Test on iPhone SE (small screen)
- [ ] Test on iPad (large screen)
- [ ] Test on Samsung Galaxy S21/S22 (Android)
- [ ] Test on Pixel 6/7 (Android)
- [ ] Test on older Android (API 30+)
- [ ] Test Chrome, Safari, Firefox, Edge
- [ ] Test voice selection on each device
- [ ] Test audio playback start/pause/resume
- [ ] Test mobile layout at 320px, 380px, 480px
- [ ] Test landscape orientation
- [ ] Test slow 4G network
- [ ] Test accessibility (touch targets, contrast)
- [ ] Verify page auto-calculation works online
- [ ] Verify word count is accurate

### Issues to Watch For
1. Voice dropdown closes unexpectedly on iOS
2. Audio cuts off after 15 seconds on Chrome (keep-alive not working)
3. Female filter not showing all female voices
4. Progress bar doesn't respond to tap on mobile
5. Settings panel overflow on 320px screens
6. Drop cap oversized on small phones

---

## 10. REPORTING ISSUES

If you find an issue during testing, please include:

**Format**
```
Device: [iPhone 13 / Galaxy S21 / etc.]
OS: [iOS 16 / Android 12 / etc.]
Browser: [Safari / Chrome / etc.]
App Version: [Current version]

Issue: [What doesn't work]
Steps to Reproduce:
1. ...
2. ...
3. ...

Expected: [What should happen]
Actual: [What actually happens]

Screenshots/Video: [Attach if possible]
```

---

## 11. SUCCESS CRITERIA

✅ **Audio Reader Works Across All Devices**
- Voice selection works on iOS, Android, Windows, macOS
- Play/pause/resume functions correctly
- Voice filter (male/female) works on all devices
- Audio quality is natural and clear

✅ **Mobile Layout Optimized**
- No horizontal scrolling (except landscape)
- Audio player displays correctly at all breakpoints
- Text is readable without zoom
- Touch targets are ≥44px

✅ **Pages Auto-Calculated**
- BookDetail shows resolved page count
- Pages calculated from word count (250 words/page standard)
- Falls back to stored pages if no word count
- Works on online and offline books

✅ **Performance is Excellent**
- Page loads in <3 seconds on 4G
- Audio plays without lag
- App is responsive with no stuttering
- Memory usage stays under 50MB

---

## Questions?

For support or to report issues, contact the development team.
Last Updated: July 2026
