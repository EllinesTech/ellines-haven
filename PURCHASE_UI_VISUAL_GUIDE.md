# Purchase UI Visual Guide

## Book Status Badges & Purchase States

### 1. **Complete** ✅
**Status Badge**: ✅ Complete (optional on card)

```
┌────────────────────────────────┐
│  [Book Cover Image]            │
│  ★★★★★ 4.8                    │
│  GENRE                         │
│  Book Title                    │
│  by Author                     │
│                                │
│  Quote about the book...       │
│                                │
│  KSh 250                 │ Read │  (if owned)
│                    │ Add to Cart │  (logged in/out)
└────────────────────────────────┘
```

**Purchase Buttons**:
- **Owned**: "Read" → links to reader
- **Not Owned (any login state)**: "Add to Cart"
- **In Cart**: "In Cart" → links to cart
- **WhatsApp**: Green WhatsApp button (always available)

---

### 2. **Free Preview** 👀
**Status Badge**: 👀 FREE PREVIEW

```
┌────────────────────────────────┐
│  [Book Cover Image]            │
│  ★★★★★ 4.8  │ 8-10 hrs        │
│  GENRE                         │
│  Book Title                    │
│  by Author                     │
│                                │
│  Quote about the book...       │
│                                │
│ ╔════════════════════════════╗│
│ │ 👀 Read first chapter for  ││
│ │ free — get the full book   ││
│ │ to continue                ││
│ ╚════════════════════════════╝│
│                                │
│  KSh 150                 │ Add to Cart │
│                    │    [WhatsApp]    │
└────────────────────────────────┘
```

**Purchase Buttons**:
- **Not Owned (any state)**: "Add to Cart"
- Blue banner: "👀 Read first chapter free — get full book to continue"

---

### 3. **Premium** ⭐
**Status Badge**: ⭐ PREMIUM

```
┌────────────────────────────────┐
│  [Book Cover]     ⭐ PREMIUM    │
│  ★★★★★ 4.8  │ 7 hrs          │
│  GENRE                         │
│  Book Title                    │
│  by Author                     │
│                                │
│  Quote about book...           │
│                                │
│  KSh 350                 │ Add to Cart │
│           (gold styling)       │
│                    │    [WhatsApp]    │
└────────────────────────────────┘
```

**Purchase Buttons**:
- "Add to Cart" with gold background (rgba(201,168,76,0.25))
- **Not Logged In**: Still shows button (adds to cart, redirects at checkout)

---

### 4. **Coming Soon** 🔜
**Status Badge**: 🔜 COMING SOON (shows as overlay)

#### NOT LOGGED IN:
```
┌────────────────────────────────┐
│  [Book Cover]                  │
│  ╔════════════════════════════╗│
│  ║      🔜 COMING SOON        ║│
│  ║                            ║│
│  ║       [ Preview → ]        ║│
│  ╚════════════════════════════╝│
│                                │
│                                │
│  [Overlay blocking purchase]   │
│                                │
│                                │
│ 🔜 Not available yet    │      │
│                    ┌─────────────────┐
│                    │ 🔐 Coming Soon  │
│                    │                 │
│                    │ Login or        │
│                    │ register to get │
│                    │ notified when   │
│                    │ this book       │
│                    │ becomes avail.  │
│                    │                 │
│                    │ [Login or Register]
│                    │                 │
│                    │ 100% secure     │
│                    │ Quick setup     │
│                    └─────────────────┘
└────────────────────────────────┘
```

#### LOGGED IN:
```
┌────────────────────────────────┐
│  [Book Cover]                  │
│  ╔════════════════════════════╗│
│  ║      🔜 COMING SOON        ║│
│  ║                            ║│
│  ║       [ Preview → ]        ║│
│  ╚════════════════════════════╝│
│                                │
│                                │
│  [Overlay blocking purchase]   │
│                                │
│                                │
│ 🔜 Not available yet    │ 🔔 Notify Me │
│                    (gold button)    │
└────────────────────────────────┘
```

---

### 5. **Ongoing** 📖
**Status Badge**: 📖 ONGOING

#### ≤ 2 Chapters Released:
```
┌────────────────────────────────┐
│  [Book Cover]                  │
│  ★★★★★ 5.0  │ Ongoing        │
│  GENRE                         │
│  Book Title                    │
│  by Author                     │
│                                │
│  Quote about book...           │
│                                │
│  KSh 250                 │ 🔔 Notify │
│                    │ When Complete  │
│                    │    [WhatsApp]    │
└────────────────────────────────┘
```

#### > 2 Chapters Released (Purchasable):
```
┌────────────────────────────────┐
│  [Book Cover]                  │
│  ★★★★★ 5.0  │ 📖 3 / 18      │
│  GENRE                         │
│  Book Title                    │
│  by Author                     │
│                                │
│  Quote about book...           │
│                                │
│  KSh 250            │ Add to Cart │
│                    │    [WhatsApp]    │
└────────────────────────────────┘
```

---

### 6. **Limited Edition** ⏳
**Status Badge**: ⏳ LIMITED

```
┌────────────────────────────────┐
│  [Book Cover]     ⏳ LIMITED   │
│  ★★★★★ 4.9  │ 6 hrs          │
│  GENRE                         │
│  Book Title                    │
│  by Author                     │
│                                │
│  Quote about book...           │
│                                │
│  KSh 200                 │ 🔔 Notify │
│                    │        Me       │
│                    │    [WhatsApp]    │
└────────────────────────────────┘
```

---

### 7. **Draft** 📝 (Not Shown Publicly)
**Status Badge**: 📝 DRAFT (hidden from public)

```
[Not displayed in library/catalog]
[Only visible to author/admin]
```

---

## Purchase Flow Diagrams

### Flow 1: Add to Cart Without Login → Checkout
```
User (NOT LOGGED IN)
    │
    ├─→ Clicks "Add to Cart" on Complete/Premium/Free Preview book
    │
    ├─→ Book added to cart (AppContext)
    │
    ├─→ Navigates to /cart
    │
    ├─→ Reviews cart items
    │
    ├─→ Selects payment method (M-Pesa, Card, PayPal)
    │
    ├─→ Clicks "Pay Now" / "Checkout"
    │
    └─→ **Cart.jsx**: `if (!user) navigate('/login')`
        │
        ├─→ Redirected to /login?returnTo=/cart
        │
        ├─→ User logs in / registers
        │
        └─→ Redirected back to /cart with items preserved
            │
            └─→ Proceeds with payment
```

### Flow 2: Coming Soon - Get Notified (Not Logged In)
```
User (NOT LOGGED IN)
    │
    ├─→ Views Coming Soon book
    │
    ├─→ Sees professional login card instead of "Notify Me" button
    │
    ├─→ Clicks "Login or Register"
    │
    ├─→ Redirected to /login?returnTo=/book/...
    │
    ├─→ User logs in / registers
    │
    └─→ Redirected back to book detail page
        │
        └─→ Now sees "🔔 Notify Me" button
            │
            └─→ Clicks to enable notification
```

### Flow 3: Coming Soon - Get Notified (Logged In)
```
User (LOGGED IN)
    │
    ├─→ Views Coming Soon book
    │
    ├─→ Sees "🔔 Notify Me" button
    │
    ├─→ Clicks button
    │
    ├─→ Request saved to contact_messages collection
    │
    ├─→ Button changes to "🔔 Notifying you" (persists in localStorage)
    │
    └─→ Admin receives notification
        │
        └─→ When book releases, user gets email notification
```

---

## Button Styling Reference

### Standard Primary Button
```css
.btn.btn-primary {
  background: var(--primary-color);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
}
```

### Premium Button (Gold)
```css
.btn.btn-primary-premium {
  background: rgba(201,168,76,0.25);
  border-color: rgba(201,168,76,0.6);
  color: var(--gold);
}
```

### Ghost Button
```css
.btn.btn-ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
  color: var(--text);
}
```

### WhatsApp Button
```css
.btn.bcard__wa-btn {
  background: #25d366;
  color: #fff;
  padding: 6px 8px;
  border-radius: 4px;
}
```

---

## Color Palette

| Element | Color | Usage |
|---------|-------|-------|
| Gold Accent | #c9a84c | Premium badges, special pricing |
| Orange Accent | #e8832a | Coming Soon status |
| Orange Dark | #ffb366 | Coming Soon login card |
| Purple Accent | #a855f7 | Free Preview badge |
| Blue Accent | #4a9eff | Ongoing status |
| Green Accent | #2ecc71 | Complete status |
| Red Accent | #e74c3c | Limited status |
| WhatsApp Green | #25d366 | WhatsApp button |

---

## Responsive Breakpoints

**Desktop** (> 768px):
- Card width: auto (grid responsive)
- Button size: standard (btn-sm)
- Footer buttons: side-by-side

**Mobile** (≤ 768px):
- Card width: 100% - padding
- Button size: slightly larger touch targets
- Footer buttons: stack or compress based on space
- Login card: full-width modal-like appearance

