# Series-Style Chapter Purchase — Quick Reference Guide

**Status:** ✅ LIVE & DEPLOYED | **Last Updated:** July 14, 2026

---

## What's New?

Ongoing books with 2+ chapters released now display:
- **Chapter count badge** on book cards: `📖 5 ch / 8`
- **Series purchase UI** on detail pages with "Buy All" or "Buy Individual Chapters"
- **New admin panel** (Series Manager) to manage all aspects
- **Smart notifications** that update for ongoing books

---

## For Readers

### Buying Chapters

1. **See ongoing book?** Look for `📖 X ch / Y` badge on the card
2. **Click "Buy Chapters"** → Goes to series purchase panel
3. **Not logged in?** Click any buy button → Redirected to login (no restriction message!)
4. **Choose purchase type:**
   - **Buy All:** Get all released chapters + future chapters as they release
   - **Buy Individual:** Pick and choose chapters you want

### Notifications

- **Before purchase:** "🔔 Notify When Complete" (ongoing) or "🔔 Notify Me" (other)
- **After subscribing:** "You're on the list! We'll notify you when all chapters are complete."
- **When complete:** Admin sends notification blast to all subscribers

### In Cart

- Chapters show with number badge (e.g., "CH. 05")
- Shows parent book name and chapter title
- Priced individually or as part of bundle

---

## For Admins

### Access Series Manager

1. Go to **Admin Dashboard**
2. Click **"Series Manager"** tab (📖 icon in nav)

### Configure a Series

1. **Filter** by "Ongoing" books
2. **Edit per-book settings:**
   - Status (ongoing → complete, etc.)
   - Chapters Released (how many out now)
   - Total Planned (how many total)
   - Full Book Price (price for buying all)

### Control Purchases

- **Toggle:** "Allow Individual Chapter Purchases"
  - **ON:** Readers see both "Buy All" and "Buy Individual" tabs
  - **OFF:** Readers only see "Buy All"
  
- **Set Price:**
  - Override: Set a specific per-chapter price
  - Auto: Calculates as (fullPrice ÷ totalChapters), rounded to nearest 5

### Release Chapters

1. Expand **TOC** section in Series Manager
2. See all chapters from book's table of contents
3. Toggle each as "Released ✓" or "Coming Soon 🔒"
4. Use **"Release All"** or **"Lock All"** buttons for bulk actions
5. Chapter count updates automatically

### Notify Subscribers

1. When new chapter is ready, click **"Queue Notification Blast"**
2. Sends message to all readers who subscribed
3. Tracked in **Messages Panel** for history

---

## Database Fields

### Book Document (Required for Detection)
```javascript
{
  status: "ongoing",        // MUST be 'ongoing'
  tableOfContents: [...],   // OR auto-counted from this
  OR chaptersReleased: N    // OR use explicit count
}
```

### Book Document (Admin Controls - Optional)
```javascript
{
  allowIndividualPurchase: true/false,    // Enable individual chapter sales
  chapterPriceOverride: 100,              // Per-chapter price (auto-calc if 0)
  totalChapters: 12,                      // Total planned
}
```

### Subcollection: `book_series/{bookId}`
```javascript
{
  chaptersReleased: 5,
  totalChapters: 12,
  allowIndividualPurchase: true,
  chapterPriceOverride: 100,
  lastUpdated: Timestamp,
}
```

---

## Feature Checklist

### Reader Features
- [x] Chapter badge on book cards for ongoing books with 2+ chapters
- [x] Series purchase panel with "Buy All" and "Buy Individual Chapters" tabs
- [x] Login redirect when purchasing (no "Purchasing Restricted" message)
- [x] Chapters shown in cart with chapter number, title, and parent book name
- [x] "Notify When All Chapters Ready" button for ongoing books
- [x] Confirmation message after subscribing

### Admin Features
- [x] Series Manager tab with book filtering
- [x] Per-book configuration (status, chapters, price)
- [x] Chapter Purchase Settings (toggle individual sales, set per-chapter price)
- [x] TOC Chapter Release Control (toggle each chapter, Release All/Lock All buttons)
- [x] New Chapter Notification (queue blast to subscribers)
- [x] Auto-save to Firestore
- [x] Instant UI updates (no page refresh needed)

---

## Common Tasks

### "I want to publish Chapter 3"
1. Go to Series Manager
2. Find the book in the list
3. Expand TOC section
4. Toggle "Chapter 3" to "Released ✓"
5. Notice "Chapters Released" count updated automatically
6. (Optional) Click "Queue Notification Blast" to notify subscribers

### "I want to disable individual chapter sales"
1. Go to Series Manager
2. Find the book
3. Uncheck "Allow Individual Chapter Purchases"
4. Now readers only see "Buy All" tab
5. Changes saved automatically

### "Per-chapter price is too complicated — use auto-calc"
1. Go to Series Manager
2. Find the book
3. Leave "Per-Chapter Price Override" **blank** (or set to 0)
4. Price auto-calculates: (fullPrice ÷ totalChapters), rounded up to 5

### "I want to notify readers about new chapter"
1. After releasing chapter in TOC
2. Click "Queue Notification Blast"
3. Notification sent to all subscribers
4. Check **Messages Panel** for confirmation/history

---

## File Changes Summary

| File | Change | Impact |
|------|--------|--------|
| `BookCard.jsx` | Added chapter badge & logic | Readers see chapter counts |
| `BookDetail.jsx` | Added OngoingSeriesPurchase component | Series purchase UI |
| `Cart.jsx` | Added chapter item rendering | Chapters show properly in cart |
| `AppContext.jsx` | Added isChapterOwned() & ownedChapters() | Context helpers for chapter ownership |
| `Admin.jsx` | Registered SeriesPanel | Series Manager tab in admin |
| `SeriesPanel.jsx` | **NEW FILE** | Full admin control panel |

---

## Troubleshooting

### Readers Don't See Series Purchase UI
- **Check:** Is book.status = "ongoing"?
- **Check:** Are there 2+ chapters released?
- **Check:** Is book.tableOfContents populated or chaptersReleased > 0?

### "Buy All" Button Shows "Sign In to Buy"
- **Expected behavior** for non-logged-in users
- User redirected to login on click

### Chapters Not Showing in TOC Section
- **Check:** Is tableOfContents field populated in book doc?
- **Check:** Make sure chapter titles aren't prefixed with "PART", "ACT", "BOOK", "SECTION", or "VOLUME"

### Per-Chapter Price Looks Wrong
- **Check:** Is chapterPriceOverride set? If yes, that price is used
- **If not set:** Auto-calculated as (price ÷ totalChapters), rounded to nearest 5

### Notification Not Sending
- **Check:** Did you click "Queue Notification Blast"?
- **Check:** Are there subscribers (notifications doc should exist)?
- **View history** in Messages Panel

---

## Support

For questions or issues, check:
1. SERIES_PURCHASE_IMPLEMENTATION_STATUS.md (detailed documentation)
2. SERIES_FEATURE_VERIFICATION.md (verification checklist)
3. This file (quick reference)

---

**Last Verified:** July 14, 2026, 16:28 UTC  
**Build Status:** ✅ SUCCESS  
**Deployment:** ✅ LIVE

