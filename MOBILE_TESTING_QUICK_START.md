# 📱 Mobile Testing Quick Start Guide

## How to Test Mobile Features

### 1. Using Chrome DevTools (Desktop)

**Open any book's Reader page:**
```
1. Go to: http://localhost:5173/book/marriage-is-a-scam/reader
2. Press: F12 (or Cmd+Option+I on Mac)
3. Press: Ctrl+Shift+M (Device Toolbar)
```

**Test different devices:**
- Click the device dropdown (top-left of DevTools)
- Select from: iPhone SE, iPhone 12, Pixel 5, Galaxy A51, iPad, etc.
- Try rotating (Ctrl+Shift+M again)

### 2. Voice Selection on Mobile

**Steps:**
```
1. Open Reader in mobile view
2. Scroll down to Audio Player
3. Click the gear icon (⚙️) in top-right of audio player
4. Observe "Voice filter" buttons: ♀ Female | ♂ Male | 👥 All
5. Click a filter to see available voices
6. Click on a voice to select it
7. Press Play button (▶️) to hear the voice
```

**What to Check:**
- ✅ Dropdown doesn't get cut off at bottom of screen
- ✅ Voice list is scrollable (if many voices)
- ✅ Each voice item is at least 44px tall (easy to tap)
- ✅ Selected voice shows with highlight
- ✅ Voice changes immediately when selected

### 3. Speed Control on Mobile

**Steps:**
```
1. In Audio Player, look at speed pills (0.75×, 1×, 1.25×, etc.)
2. On phone (≤480px): Should show 4 pills per row
3. On small phone (≤360px): Should show 3 pills per row
4. Tap any pill to change speed
5. Observe the "Speed × 1.5×" label updates
```

**What to Check:**
- ✅ All pills are visible without horizontal scrolling
- ✅ Each pill is 38-44px tall (easy to tap)
- ✅ Active pill has blue background
- ✅ Speed applies to audio playback

### 4. Text Reading on Mobile

**Steps:**
```
1. Switch from Listen mode to Text mode (if available)
2. Observe the text layout
3. Try different screen sizes
```

**What to Check for each device:**
| Device | Should See |
|--------|-----------|
| ≤360px | Small text (0.95rem), indent visible, readable |
| 361-480px | Medium text (1rem), better spacing |
| 481-768px | Comfortable reading (1rem + justified) |
| 769px+ | Wide column (750px max), premium spacing |

### 5. Button & Control Sizes

**Accessibility Check:**
```
Using DevTools Inspector (F12):
1. Right-click on any button
2. Select "Inspect"
3. Look at width/height in Styles panel
4. Verify minimum 44×44px

Examples:
- Play button: 52-56px ✅
- Rewind/Stop/Skip: 40-44px ✅
- Speed pills: 38-44px ✅
- Voice dropdown: 46-48px ✅
```

### 6. Real Device Testing

**If you have a real phone:**
```
1. Connect to same WiFi as computer
2. Run: npm run dev
3. Get your computer IP: ipconfig (Windows) or ifconfig (Mac)
4. On phone, open: http://YOUR_IP:5173/book/marriage-is-a-scam/reader
5. Test voice selection, speed control, text reading
```

---

## Screen Size Guide (What to Test)

### Small Phones
```
Devices: iPhone SE (375×667), iPhone 11 (414×896)
Test at: 375px wide
Features to check:
  ✅ Voice dropdown centered (not cut off)
  ✅ All buttons tappable
  ✅ No horizontal scroll
  ✅ Speed pills wrap properly
  ✅ Text readable without zoom
```

### Very Small Phones
```
Devices: Old phones with 320px, 360px width
Test at: 360px wide
Features to check:
  ✅ Minimal padding maintained
  ✅ 3 speed pills per row
  ✅ Audio player stacked vertically
  ✅ Text still readable
```

### Medium Phones
```
Devices: Google Pixel 5 (432×915), Galaxy S21 (360×800)
Test at: 480px wide
Features to check:
  ✅ 4 speed pills per row
  ✅ Voice dropdown centered and scrollable
  ✅ Audio player fully accessible
  ✅ Text comfortably readable
```

### Large Phones
```
Devices: iPhone 14 Pro Max (430×932), Galaxy S22 Ultra (440×906)
Test at: 768px wide
Features to check:
  ✅ All controls visible
  ✅ Voice settings panel expanded
  ✅ Text properly justified (if in text mode)
```

### Tablets
```
Devices: iPad Air (768×1024), Galaxy Tab S7 (800×1280)
Test at: 769px and up
Features to check:
  ✅ Sidebar visible on left
  ✅ Main content area expanded
  ✅ Audio player horizontal layout
```

### Landscape Mode
```
Any device rotated sideways
Test at: (width > 900px) and (orientation: landscape)
Features to check:
  ✅ Compact header (48px)
  ✅ Content still visible
  ✅ Audio player buttons accessible
  ✅ No horizontal overflow
```

---

## Common Issues & Fixes

### Issue: Voice dropdown appears behind other content
**Fix:** Already handled! Dropdown uses `position: fixed` and `z-index: 10001`

### Issue: Speed pills overlap
**Fix:** Already handled! Pills use flex wrapping with proper calculation:
- Small phones: `flex: 0 1 calc(25% - 5px)` (4 per row)
- Very small: `flex: 0 1 calc(33% - 5px)` (3 per row)

### Issue: Text is cut off on small phones
**Fix:** Already handled! Padding reduced to 6-8px, text set to `text-align: left`

### Issue: Audio buttons too small to tap
**Fix:** Already handled! All buttons now 44-56px minimum
- Transport buttons: 42-44px
- Play button: 50-56px
- Gear/filter buttons: 40-44px

### Issue: Notched phone shows content behind notch
**Fix:** Already handled! Using CSS `env(safe-area-inset-*)`
```css
padding-left: max(12px, env(safe-area-inset-left));
padding-right: max(12px, env(safe-area-inset-right));
```

---

## Performance Testing

### Lighthouse (Chrome DevTools)

```
1. Open DevTools (F12)
2. Go to "Lighthouse" tab
3. Click "Analyze page load"
4. Check mobile scores

Target Scores:
  Performance: 85+
  Accessibility: 90+
  Best Practices: 90+
  SEO: 90+
```

### Responsive Design Testing

```
1. Press F12 to open DevTools
2. Press Ctrl+Shift+M for device toolbar
3. Test at these widths:
   - 320px (very small)
   - 360px (small phone)
   - 480px (medium phone)
   - 768px (tablet)
   - 900px (large tablet)
   - 1024px+ (desktop)
```

---

## Voice Selection Testing Matrix

### Test Cases

| Filter | Expected Result | Tested |
|--------|-----------------|--------|
| All | Show 30+ voices | [ ] |
| Female (♀) | Show 15+ female voices | [ ] |
| Male (♂) | Show 10+ male voices | [ ] |
| Select voice | Play with that voice | [ ] |
| Change filter | List updates, but selected voice persists if available | [ ] |
| Neural badge | High-quality voices marked ✨ or 🔵 | [ ] |
| Dropdown scroll | List scrollable if >6 items | [ ] |

### Speed & Pitch Testing

| Control | Expected Result | Tested |
|---------|-----------------|--------|
| 0.75× pill | Slow playback | [ ] |
| 1.0× pill | Normal speed | [ ] |
| 2.0× pill | 2× speed | [ ] |
| Pitch slider | Changes voice tone | [ ] |
| Pitch + Speed combo | Both apply together | [ ] |

---

## Final Checklist Before Deployment

- [ ] Tested on ≤360px (very small phone)
- [ ] Tested on 360-480px (small phone)
- [ ] Tested on 480-768px (medium phone)
- [ ] Tested on 768px+ (tablet)
- [ ] Tested voice selection on mobile
- [ ] Tested speed control
- [ ] Tested text reading mode
- [ ] Tested landscape orientation
- [ ] Verified no horizontal scrolling
- [ ] Verified all buttons tappable (≥44px)
- [ ] Verified voice dropdown not clipped
- [ ] Verified text readable
- [ ] Tested on 3+ real devices if possible
- [ ] Checked Lighthouse scores

---

## Need Help?

If something doesn't work:

1. **Check DevTools** - Press F12, look for console errors
2. **Clear Cache** - Ctrl+Shift+Delete (Chrome)
3. **Hard Refresh** - Ctrl+Shift+R (Chrome)
4. **Check Mobile Viewport** - Ctrl+Shift+M to toggle device mode
5. **Try Different Device** - DevTools has many pre-configured devices

---

**Happy Testing! 🚀**

For detailed information, see: `MOBILE_OPTIMIZATION_COMPLETE.md`
