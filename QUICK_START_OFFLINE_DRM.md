# 🚀 Quick Start: Offline Reading & DRM Controls

---

## 👥 For Users: Offline Reading

### How to Save a Book for Offline

1. **Open a book** you own in the Reader
2. **Top navbar** — click the **"📥 Save Offline"** button
3. **Confirmation** — chapter text is now saved to your device
4. **Badge appears** — "📵 Saved Offline" badge shows on your MyLibrary card

### How to Read Offline

1. **Turn off internet** (or go to airplane mode)
2. **Open MyLibrary**
3. **Click the book** with "📵 Saved Offline" badge
4. **Reader loads cached chapters** automatically
5. **Read freely** without internet

### Important Notes

- ✅ Data is saved **only on your device** (browser storage)
- ✅ Cannot be shared or transferred to other devices
- ✅ Persists until you click "Remove from Offline" on the card
- ❌ Not a file download — no way to export or share
- ❌ If you clear browser cache/storage, offline data is deleted

---

## 🛡️ For Admins: DRM Controls

### Where to Access

**Admin Dashboard** → **🛡️ Content Protection** (new panel)

### The 9 DRM Toggles

#### 🔒 Copy & Access Controls (default: ON)
- **🖱️ Disable Right-Click** — blocks browser context menu
- **📋 Disable Copy & Paste** — blocks Ctrl+C, cutting, dragging
- **🖊️ Disable Text Selection** — text cannot be highlighted
- **⌨️ Block Copy Keyboard Shortcuts** — blocks Ctrl+C/A/S/P/U and F12
- **🖨️ Disable Printing** — blocks Ctrl+P, shows DRM notice instead

#### 🛠️ DevTools (default: ON)
- **🛠️ Block DevTools (F12)** — prevents F12, Ctrl+Shift+I, Ctrl+Shift+J

#### 🎨 Visual Protection (defaults vary)
- **💧 Force Watermark** — always show user ID watermark (default: ON)
- **📸 Screenshot Deterrent** — adds watermark grid overlay (default: OFF)

#### 📥 User Features (default: ON)
- **📥 Allow Offline Reading** — users can save books for offline
  - ON = users see "Save Offline" button
  - OFF = button hidden, no new offline saves allowed
  - Existing cached data remains

### How Changes Work

✅ **Instant effect** — changes apply immediately to all users  
✅ **Real-time sync** — powered by Firestore `onSnapshot`  
✅ **No reload needed** — users see changes without refreshing

### Example Use Case

**Scenario:** You're releasing a new book and want maximum protection.

1. Go to **Content Protection** panel
2. Enable all 9 toggles (except maybe Screenshot Overlay if you want screenshots deterred but readable)
3. Check **Protection Score** → should be 80-100%
4. **Done!** All users immediately see blocked right-click, copy, etc.

**Later:** Book released successfully, you want to relax protection
1. Toggle OFF: "Disable Right-Click" and "Disable Copy & Paste"
2. Keep: F12 block, printing block, watermarks
3. Users can now right-click and copy (still can't print or inspect)

---

## 📊 Live Chapter Count

### How It Works

- **Admin uploads chapters** → chapter count updates on book detail **automatically**
- **No refresh needed** — powered by Firestore real-time sync
- **Always accurate** — shows exactly what's in Firestore, not static metadata

### Example

**Book Detail Page shows:**
```
Chapters Out: 3
Total Planned: 12
```

**Admin adds a new chapter** (via Chapter Editor)
→ Save chapter to Firestore

**Reader refreshes BookDetail**
→ Automatically shows:
```
Chapters Out: 4  ← Updated instantly!
Total Planned: 12
```

### Behind the Scenes

BookDetail component:
```javascript
// Subscribes to Firestore for real-time updates
onSnapshot(doc(db, 'book_chapters', bookId), snapshot => {
  const chapters = snapshot.data()?.chapters || [];
  setLiveChapters(chapters); // Triggers re-render
  // Display: chapters.length
});
```

---

## 🎯 Best Practices

### For DRM Protection

1. **Start strong** — enable most/all toggles on release
2. **Use with watermarks** — embed user ID in pages
3. **Combine with legal terms** — terms + DRM > DRM alone
4. **Monitor abuse** — check watermarks in leaked copies
5. **Relax later** — as book ages, reduce restrictions if desired

### For Offline Reading

1. **Enable by default** — gives users reading convenience
2. **Disable only if** — you need to prevent all offline access
3. **Communicate** — users should know about offline feature
4. **Reassure** — "data stays on your device, never shared"

### For Chapter Management

1. **Use live count** — don't manually update chapter count metadata
2. **Upload all chapters** — Firestore collection drives the count
3. **Test sync** — verify BookDetail updates when you add/remove chapters
4. **Monitor** — watch Firestore `book_chapters/{bookId}` collection

---

## ❓ FAQ

**Q: Can users share their offline downloads?**  
A: No — it's not a file. Data is stored in browser storage only. No way to export or share.

**Q: What if I turn OFF offline reading?**  
A: New users can't save, but existing offline data remains until they clear cache. No way to force-delete remote offline data.

**Q: Can users bypass the DRM?**  
A: Determined technical users can always find workarounds (browser dev tools, network intercept, etc.). Use DRM as a deterrent + watermarks + legal terms.

**Q: Does DRM work on all browsers?**  
A: Mostly yes. Some restrictions depend on browser APIs (e.g., print blocking is strongest in modern browsers). Test across Chrome, Firefox, Safari.

**Q: How much data can users store offline?**  
A: Depends on browser, typically 5-10MB per site. For text-only chapters, usually 50-200+ books before hitting limit.

**Q: Does offline reading work on mobile apps?**  
A: Only web (iOS Safari, Android Chrome). Native apps would need separate offline implementation.

**Q: If I delete a chapter from Firestore, does offline data update?**  
A: No — offline cache is static snapshot. Won't update. Users must re-save the book to get new version. Consider this when deleting chapters.

---

## 🔧 Troubleshooting

### "Save Offline" button not appearing
- Check if **📥 Allow Offline Reading** is enabled in Content Protection panel
- Check if user is logged in
- Check browser storage isn't full

### Chapter count not updating on BookDetail
- Refresh the page
- Check Firestore `book_chapters/{bookId}` collection exists
- Check `onSnapshot` is firing (DevTools console)

### DRM blocking not working
- Hard-refresh page (Ctrl+Shift+R) to clear cache
- Check Firestore `site_data/perms/siteControls` has the toggle enabled
- Check browser console for errors
- Try different browser (in case of browser-specific API issues)

### Offline book not loading
- Check browser storage (might be full)
- Verify "Save Offline" completed without errors
- Go to browser settings → Storage → see saved data
- Clear cache and re-save if corrupted

---

## 📞 Support

For issues, check:
1. Browser console for errors
2. Firestore collections (`book_chapters`, `site_data/perms`)
3. Browser storage (DevTools → Storage → Local Storage)
4. Network tab (Firestore requests)

---

**Last Updated:** July 8, 2026  
**Version:** 1.0.0
