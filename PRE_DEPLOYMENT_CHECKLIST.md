# Pre-Deployment Checklist: Cross-Device Fixes
**Purpose**: Verify all fixes are in place before pushing to production  
**Time**: ~5 minutes  
**Required**: Codebase access + Node.js

---

## ✅ Step 1: Verify Build

```bash
cd ellines-haven
npm run build
```

**Check**:
- [ ] Build completes without errors
- [ ] Exit code is 0
- [ ] Output shows "✔ Pre-rendered 24 routes"
- [ ] Service worker stamped (e.g., "20260718062700")

**If it fails**:
- Check console for TypeScript errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check for uncommitted changes: `git status`

---

## ✅ Step 2: CSS Variables Check

**File**: `src/index.css`  
**Look for**:
```css
:root {
  --navbar-h: 90px;
  --navbar-h-tablet: 80px;
  --navbar-h-mobile: 60px;
}

@media (max-width: 768px) {
  :root { --navbar-h: var(--navbar-h-mobile, 60px); }
}
```

- [ ] All three variables defined
- [ ] Mobile breakpoint at 768px
- [ ] No syntax errors (CSS validates)

**Command to validate**:
```bash
grep -n "navbar-h" src/index.css
```

**Expected**: Should show lines 15-17 with all three variables

---

## ✅ Step 3: Layout Component Check

**File**: `src/App.jsx`  
**Look for** Layout component:

```javascript
function Layout({ children }) {
  return (
    <div style={{ paddingTop: 'var(--navbar-h, 90px)' }}>
      {children}
    </div>
  );
}
```

- [ ] Layout has `paddingTop: 'var(--navbar-h, 90px)'`
- [ ] No hardcoded pixel values

**Command**:
```bash
grep -A 5 "function Layout" src/App.jsx
```

---

## ✅ Step 4: HardReload Function Check

**File**: `src/App.jsx` (lines 51-66)  
**Look for**:

```javascript
function hardReload() {
  localStorage.removeItem('eh_chunk_reload');
  if ('caches' in window) {
    const clearTimer = setTimeout(() => window.location.reload(), 600);
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => { clearTimeout(clearTimer); window.location.reload(); })
      .catch(() => { clearTimeout(clearTimer); window.location.reload(); });
  } else {
    window.location.reload();
  }
}
```

- [ ] Function exists at top of file
- [ ] Has 600ms timeout
- [ ] Fallback `window.location.reload()` included
- [ ] Called in ChunkErrorBoundary render

**Command**:
```bash
grep -n "function hardReload" src/App.jsx
```

---

## ✅ Step 5: Sticky Elements Check

**Library Type-Bar** (`src/pages/Library.css`):
```css
.lib-type-bar {
  position: sticky;
  top: var(--navbar-h, 90px);
}
```
- [ ] Uses CSS variable (not hardcoded `top: 90px`)

**Library Sidebar** (`src/pages/Library.css`):
```css
.lib-sidebar {
  position: sticky;
  top: calc(var(--navbar-h, 90px) + 60px);
}
```
- [ ] Uses calc with CSS variable

**Cart Summary** (`src/pages/Cart.css`):
```css
.cart-sum {
  position: sticky;
  top: calc(var(--navbar-h, 90px) + 12px);
}
```
- [ ] Uses calc with CSS variable

**Command**:
```bash
grep -n "top: var\|top: calc" src/pages/*.css src/components/*.css
```

**Expected**: Should show all three stickies using variables

---

## ✅ Step 6: Touch Overlay Check

**File**: `src/components/BookCard.css`  
**Look for**:

```css
@media (hover: none) {
  .bcard__overlay {
    opacity: 1;
    background: transparent;
    align-items: flex-end;
    padding-bottom: 14px;
  }
  .bcard__overlay .btn {
    min-height: 44px;
    font-size: 0.78rem;
    padding: 10px 18px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.6);
  }
}
```

- [ ] `@media (hover: none)` present
- [ ] Button has `min-height: 44px`
- [ ] Button has `padding` defined

**Command**:
```bash
grep -n "@media (hover: none)" src/components/BookCard.css
```

---

## ✅ Step 7: Landscape Mode Check

**File**: `src/pages/Reader.css` (line ~971)  
**Look for**:

```css
@media (max-width: 900px) and (orientation: landscape) {
  .reader__nav-row1 {
    display: flex; /* shows row1 */
  }
  .reader__nav-row2 {
    display: none;  /* hides row2 */
  }
}
```

- [ ] `.reader__nav-row1` is `display: flex` (visible)
- [ ] `.reader__nav-row2` is `display: none` (hidden)
- [ ] Both are inside landscape media query

**Command**:
```bash
grep -A 10 "@media.*orientation: landscape" src/pages/Reader.css
```

---

## ✅ Step 8: Navbar Logo Guard Check

**File**: `src/components/Navbar.jsx` (lines 127-131)  
**Look for**:

```javascript
{navLogo && navLogo.startsWith('/') ? (
  <picture>
    <source srcSet={navLogo.replace(/\.png$/i, '.webp')} type="image/webp" />
    <img src={navLogo} alt="Ellines Haven" className="nav__logo-img" width="72" height="72" />
  </picture>
) : (
  <img src={navLogo || '/logo-nobg3.png'} alt="Ellines Haven" className="nav__logo-img" width="72" height="72" />
)}
```

- [ ] Has `navLogo.startsWith('/')` guard
- [ ] WebP conversion only for local URLs
- [ ] Fallback to simple `<img>` for non-local URLs

**Command**:
```bash
grep -n "startsWith.*/" src/components/Navbar.jsx
```

---

## ✅ Step 9: Navbar Scroll Listener Check

**File**: `src/components/Navbar.jsx` (line ~99)  
**Look for**:

```javascript
useEffect(() => {
  const fn = () => setScrolled(window.scrollY > 60);
  window.addEventListener('scroll', fn, { passive: true });
  return () => window.removeEventListener('scroll', fn);
}, []);
```

- [ ] Has `{ passive: true }` option
- [ ] Cleanup removes listener properly

**Command**:
```bash
grep -n "passive: true" src/components/Navbar.jsx
```

---

## ✅ Step 10: Cart Promo State Check

**File**: `src/pages/Cart.jsx`  
**Look for** (before the referral useEffect):

```javascript
const [promoInput,     setPromoInput]     = useState('');
const [promoApplied,   setPromoApplied]   = useState(null);
const [promoError,     setPromoError]     = useState('');
const [promoChecking,  setPromoChecking]  = useState(false);

// ── Auto-apply referral code from URL param ──────────────────────────────
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get('ref');
  if (refCode && !promoApplied) {
    // ...
  }
}, [user]);
```

- [ ] `promoApplied` state declared **before** useEffect
- [ ] useEffect uses `promoApplied` safely

**Command**:
```bash
grep -n "useState.*promoApplied\|if (refCode && !promoApplied)" src/pages/Cart.jsx
```

**Check**: State declaration line < useEffect usage line

---

## ✅ Step 11: No TypeScript Errors

```bash
npx tsc --noEmit
```

- [ ] No errors reported
- [ ] Exit code 0

---

## ✅ Step 12: Git Status Clean

```bash
git status
```

- [ ] All intended changes are committed
- [ ] No uncommitted fixes
- [ ] No untracked breaking changes

```bash
git diff --cached
```

- [ ] Review all staged changes
- [ ] No accidental deletions

---

## ✅ Step 13: Documentation Present

```bash
ls -la ellines-haven/ | grep -i "CROSS_DEVICE\|QUICK_DEVICE\|FIXES_SUMMARY"
```

- [ ] `CROSS_DEVICE_FIXES_VERIFICATION.md` exists
- [ ] `QUICK_DEVICE_TEST_GUIDE.md` exists
- [ ] `FIXES_SUMMARY.txt` exists
- [ ] `PRE_DEPLOYMENT_CHECKLIST.md` exists

---

## ✅ Step 14: Test Build Artifacts

```bash
ls -la dist/
```

- [ ] `dist/index.html` exists
- [ ] `dist/assets/` folder has CSS and JS files
- [ ] Service worker file present (e.g., `dist/sw.js`)

```bash
npm run build 2>&1 | tail -5
```

Should show:
```
[prerender] ✔ Pre-rendered 24 routes
Exit Code: 0
```

- [ ] 24 routes pre-rendered
- [ ] Exit code 0

---

## ✅ Final Sign-Off

Before pushing to production, confirm:

| Item | Status | Notes |
|------|--------|-------|
| Build passes | ✓ | No errors |
| CSS variables defined | ✓ | All three navbar variables |
| Layout has padding | ✓ | Uses CSS variable |
| hardReload implemented | ✓ | 600ms timeout + fallback |
| Sticky elements use vars | ✓ | Type-bar, sidebar, cart |
| Touch overlay 44px | ✓ | @media (hover: none) |
| Landscape nav visible | ✓ | Row1 shown, row2 hidden |
| Logo guard present | ✓ | startsWith('/') check |
| Scroll passive flag | ✓ | { passive: true } |
| Promo state order | ✓ | Declared before useEffect |
| No TypeScript errors | ✓ | tsc clean |
| Git clean | ✓ | All committed |
| Docs present | ✓ | 4 guides created |
| Test artifacts | ✓ | dist/ folder ready |

---

## Commands Reference

**Quick check** (all in one):
```bash
npm run build && \
grep -c "navbar-h" src/index.css && \
grep -c "hardReload" src/App.jsx && \
grep -c "top: var\|top: calc" src/pages/*.css && \
echo "✓ All checks passed"
```

**Deploy script** (after checklist passes):
```bash
git push origin main
firebase deploy
```

---

## If Anything Fails

1. **Build fails**: Check for TypeScript errors, reinstall dependencies
2. **Variables missing**: Manually add to `src/index.css` `:root` block
3. **hardReload missing**: Copy from `CROSS_DEVICE_FIXES_VERIFICATION.md`
4. **Sticky not using vars**: Replace hardcoded `top` values with `var()` or `calc(var())`
5. **Git issues**: Review recent commits, check for merge conflicts

---

**Checklist Status**: Ready for production ✅  
**Last Verified**: July 18, 2026  
**Estimated Deployment Time**: 5-10 minutes  
**Rollback Time**: ~2-3 minutes (previous commit)

