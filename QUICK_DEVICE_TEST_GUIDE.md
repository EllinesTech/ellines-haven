# Quick Cross-Device Testing Guide
**For**: Testers validating fixes on real devices  
**Time**: ~15 minutes per device  
**Devices**: Mobile (iPhone/Android), Tablet, Desktop

---

## Pre-Test Checklist

- [ ] Clear browser cache (settings → clear browsing data)
- [ ] Clear app cache if PWA installed
- [ ] Use incognito/private mode if possible (cleaner cache)
- [ ] Have network tab open (Chrome DevTools → Network)
- [ ] Test both portrait and landscape (rotate device)

---

## Test 1: Layout Integrity (No Overlapping Content)

### Steps
1. **Go to Home page** (`/`)
2. Check:
   - [ ] Hero section is **below** navbar (no overlap)
   - [ ] Hero text is fully visible
   - [ ] No content is hidden by navbar
3. **Go to Library** (`/library`)
   - [ ] Search bar is below navbar
   - [ ] Type-bar tabs are sticky below search
   - [ ] Content doesn't overlap navbar
4. **Go to MyLibrary** (`/mylibrary` if logged in)
   - [ ] Hero section has proper spacing
   - [ ] Avatar and stats are visible

### Expected Behavior
- ✓ All content starts **below** the navbar
- ✓ No text is cut off by the navbar
- ✓ Scrolling reveals content smoothly

### If it fails
- Take screenshot
- Note: device, browser, viewport width
- Check DevTools → compute `window.scrollY` vs navbar height

---

## Test 2: Refresh Button Reliability (CRITICAL)

### Steps
1. **Go to Reader** (`/read/any-book`)
2. **Trigger a network error** (simulate by):
   - Open DevTools → Network
   - Check "Throttling" → set to "Offline"
   - Wait 3 seconds
   - Click **Refresh** button (should appear in error banner)
3. **On refresh click**:
   - [ ] Page reloads completely
   - [ ] Console doesn't show errors
   - [ ] No stuck loading state

### Expected Behavior (iOS Safari focus)
- ✓ Page reloads within **2 seconds** of clicking Refresh
- ✓ Works even if caches are slow
- ✓ Fallback to `window.location.reload()` if needed

### If it fails
- Take screenshot of error state
- Note: browser, iOS version (if Safari)
- Check DevTools Console → any errors?

---

## Test 3: Sticky Elements Positioning

### Steps
1. **Library page** — scroll down:
   - [ ] Type-bar (tabs) stays sticky below navbar
   - [ ] Sidebar stays sticky below type-bar
   - [ ] Both scroll with page, not overlapping

2. **Cart page** — scroll down:
   - [ ] Summary box (right side) stays visible
   - [ ] Doesn't overlap items on mobile

3. **Reader** (landscape):
   - [ ] Navigation bar stays visible
   - [ ] Content scrolls beneath it

### Expected Behavior
- ✓ Sticky elements align at correct heights
- ✓ No gaps or overlaps between sticky items
- ✓ Content scrolls smoothly

### Measurement
- Open DevTools → Inspector
- Click on sticky element (e.g., `.lib-type-bar`)
- Check `top` style → should be `var(--navbar-h, 90px)` or similar

---

## Test 4: Touch Targets & Mobile Buttons

### Steps
1. **Tap buttons** on mobile/tablet:
   - [ ] "View Book" on book cards (should be easy to hit)
   - [ ] Cart icon (not too small)
   - [ ] Hamburger menu (easy to tap)

2. **Test on smallest device** (320px screen):
   - [ ] All buttons still visible
   - [ ] Footer contact chips don't overflow
   - [ ] Text is readable

### Expected Behavior
- ✓ All tappable areas are **at least 44px × 44px**
- ✓ No misclicks when tapping buttons
- ✓ Buttons don't overlap

### Debug
- DevTools → Device Emulation → select "iPhone SE" (375px)
- Zoom to 100% (Ctrl/Cmd + 0)
- Tap each button element
- Check computed size in inspector

---

## Test 5: Landscape Mode Navigation (Reader)

### Steps
1. **Go to Reader** (`/read/any-book`)
2. **Rotate device to landscape**
3. Check navigation bar:
   - [ ] Shows book title or back button
   - [ ] Shows font size or mode controls
   - [ ] **Doesn't hide** essential controls
   - [ ] Navigation row 2 collapses (not duplicated)

4. **Rotate back to portrait**:
   - [ ] Navigation expands again
   - [ ] No layout shift

### Expected Behavior
- ✓ Landscape nav fits on one row
- ✓ All critical controls visible
- ✓ Content area maximized

### Known Issue (if any)
- Landscape on iPad may show desktop layout (768px+ width)
  - This is correct behavior (desktop layout takes priority)

---

## Test 6: Navbar Responsiveness

### Steps (Desktop DevTools Device Emulation)
1. Open Chrome DevTools → Device Emulation
2. Test widths:
   - [ ] 320px (iPhone SE) — logo shrunk, burger menu visible
   - [ ] 375px (iPhone 12) — brand text visible, compact
   - [ ] 768px (iPad portrait) — more space, full nav links visible
   - [ ] 1024px (iPad landscape) — full desktop nav
   - [ ] 1280px (desktop) — all elements visible

3. Check:
   - [ ] No horizontal scroll at any width
   - [ ] Logo and text don't overflow
   - [ ] Burger menu appears/disappears at 768px cutoff

### Expected Behavior
- ✓ Navbar always fits viewport
- ✓ No overflow or scroll at any width
- ✓ Logo scales proportionally

---

## Test 7: CSS Variables Verification (Dev Only)

### Steps (Chrome DevTools Console)
1. Open DevTools → Console
2. Run:
   ```javascript
   const style = getComputedStyle(document.documentElement);
   console.log('--navbar-h:', style.getPropertyValue('--navbar-h'));
   console.log('--navbar-h-mobile:', style.getPropertyValue('--navbar-h-mobile'));
   ```
3. Check:
   - [ ] `--navbar-h` returns `90px` (desktop)
   - [ ] On mobile (DevTools emulation), should return `60px`

### Expected Values
- Desktop (1280px+): `90px`
- Tablet (768px): `80px` or `60px` (depends on breakpoint)
- Mobile (<768px): `60px`

---

## Test 8: Cart Promo Code (Functional)

### Steps (if you have test promo codes)
1. **Go to Cart** (`/cart`)
2. Add books to cart
3. Enter promo code:
   - [ ] No console errors
   - [ ] Discount applies correctly
   - [ ] Summary updates
4. Remove promo:
   - [ ] Total reverts to original

### Expected Behavior
- ✓ Promo state doesn't cause errors
- ✓ Discount calculates correctly
- ✓ No state-related bugs

---

## Test 9: Service Worker & Hard Reload

### Steps (Advanced)
1. Open DevTools → Application → Service Workers
2. Check:
   - [ ] Service worker is registered
   - [ ] Status shows "activated and running"
3. **Simulate offline**:
   - [ ] Set Network to "Offline"
   - [ ] Page should load cached version
4. **Force cache clear** (trigger ChunkErrorBoundary):
   - [ ] Console should show cache clearing
   - [ ] Page reloads cleanly

---

## Reporting Results

### Template
```
Device: [e.g., iPhone 14 Pro, Pixel 6]
OS: [iOS 17.2 / Android 14]
Browser: [Safari / Chrome]
Viewport: [e.g., 390×844]

Test 1 (Layout): [✓ PASS / ✗ FAIL]
Test 2 (Refresh): [✓ PASS / ✗ FAIL]
Test 3 (Sticky): [✓ PASS / ✗ FAIL]
Test 4 (Touch): [✓ PASS / ✗ FAIL]
Test 5 (Landscape): [✓ PASS / ✗ FAIL]

Notes:
[Any specific observations or issues]

Screenshot: [Attach if failed]
```

---

## Common Issues & Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Hero overlaps navbar | Layout padding not applied | Check `src/App.jsx` Layout component |
| Refresh button doesn't work | Cache API unavailable or slow | Check fallback timeout (600ms) |
| Sticky elements misaligned | CSS variable not defined | Check `:root` in `src/index.css` |
| Buttons too small to tap | Touch target < 44px | Check `@media (hover: none)` in CSS |
| Horizontal scroll on mobile | Overflow not contained | Check `.nav__inner` max-width |
| Landscape mode breaks | Row visibility not toggled | Check `@media (orientation: landscape)` |

---

## Quick Reference: File Locations

- **CSS Variables**: `src/index.css` (lines 15-17)
- **Layout Padding**: `src/App.jsx` (lines ~575-580)
- **Refresh Function**: `src/App.jsx` (lines 51-66)
- **Navbar Height**: `src/components/Navbar.css` (line 26)
- **Sticky Type-Bar**: `src/pages/Library.css` (line 74)
- **Sticky Sidebar**: `src/pages/Library.css` (line 180)
- **Touch Overlay**: `src/components/BookCard.css` (line 74)
- **Landscape Nav**: `src/pages/Reader.css` (line 971)

---

**Total Time**: ~15 min per device  
**Ideal**: Test on 3+ real devices (iPhone, Android, iPad)  
**Critical Focus**: Refresh button (Test 2) + Layout (Test 1)
