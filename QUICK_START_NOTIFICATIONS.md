# Quick Start Guide - Admin Notifications

## For Admins

### Viewing Notifications

**Option 1: Navbar Bell**
1. Look for the bell icon (📊) in the navbar (top right)
2. Unread count shows as red badge
3. Click to see recent notifications
4. Click any notification to mark as read

**Option 2: Activity Feed**
1. Go to Admin Panel (`/admin`)
2. Click "Activity Feed" (second item in menu)
3. View all notifications with filters and search

### Managing Preferences

1. Click bell icon → Click ⚙️ (Settings)
2. Or Activity Feed → Click "⚙️ Settings" button
3. Toggle options:
   - 🔊 Sound Alerts (on/off)
   - 💻 Desktop Notifications (on/off)
   - Per-category muting (check/uncheck)
4. Click "💾 Save Preferences"

### Muting Categories

**Mute all notifications:**
- Settings → "Mute All" button

**Mute specific categories:**
- Settings → Uncheck categories you don't want to see

**Unmute:**
- Settings → Check categories you want to see
- Or "Enable All" button to unmute everything

### Keyboard & Quick Actions

- **Mark as Read**: Click on notification
- **Mark All Read**: "✓ All" or "✓ Mark all read" button
- **Search**: Type in search box (searches title, message, user)
- **Filter**: Select category from dropdown

---

## For Developers

### Quick Integration

**1. Import the tracker:**
```javascript
import { trackActivity, NOTIFICATION_CATEGORIES } from '../utils/adminActivityTracker';
```

**2. Add tracking (example):**
```javascript
await trackActivity({
  category: NOTIFICATION_CATEGORIES.BOOK_PURCHASE,
  title: 'Book Purchased',
  message: `${userName} purchased "${bookTitle}"`,
  userEmail: user.email,
  userName: user.name,
  metadata: { bookId: book.id, price: book.price },
  priority: 'normal',
});
```

**3. Always wrap in try-catch:**
```javascript
try {
  await trackActivity({ /* ... */ });
} catch (error) {
  console.error('[Activity Tracking]', error);
  // Don't throw - let main operation continue
}
```

### Available Categories

```javascript
NOTIFICATION_CATEGORIES.USER_LOGIN          // 🔐
NOTIFICATION_CATEGORIES.USER_REGISTRATION   // 👤
NOTIFICATION_CATEGORIES.VISITOR             // 👁️
NOTIFICATION_CATEGORIES.PAYMENT             // 💳
NOTIFICATION_CATEGORIES.BOOK_PURCHASE       // 📚
NOTIFICATION_CATEGORIES.BOOK_DOWNLOAD       // ⬇️
NOTIFICATION_CATEGORIES.CONTACT_MESSAGE     // ✉️
NOTIFICATION_CATEGORIES.REVIEW_SUBMITTED    // ⭐
NOTIFICATION_CATEGORIES.NEWSLETTER_SIGNUP   // 📧
NOTIFICATION_CATEGORIES.WISHLIST_ADD        // ❤️
NOTIFICATION_CATEGORIES.CART_CHECKOUT       // 🛒
NOTIFICATION_CATEGORIES.ACCOUNT_DELETION    // 🗑️
NOTIFICATION_CATEGORIES.PASSWORD_RESET      // 🔑
NOTIFICATION_CATEGORIES.PROFILE_UPDATE      // ✏️
NOTIFICATION_CATEGORIES.SYSTEM              // ⚙️
```

### Priority Levels

- **`'low'`**: Routine activities (logins, views, wishlist)
- **`'normal'`**: Important actions (purchases, registrations, messages)
- **`'high'`**: Critical events (payment failures, deletions, security)

### Where to Add Tracking

| Event | File | Function |
|-------|------|----------|
| Book Purchase | Payment handler | After payment confirmed |
| Book Download | Download handler | When download starts |
| Review Submit | Review form | After review saved |
| Newsletter Signup | Newsletter form | After signup saved |
| Wishlist Add | Wishlist handler | When item added |
| Cart Checkout | Checkout page | When checkout initiated |
| Password Reset | Reset handler | After reset completed |
| Profile Update | Profile save | After profile saved |

---

## Common Tasks

### Test Notifications

1. **Trigger an event** (login, register, contact)
2. **Check the bell** (should show unread count)
3. **Click bell** (should see notification)
4. **Click notification** (should mark as read)

### Enable Desktop Notifications

1. Click bell → Settings
2. Enable "Desktop Notifications"
3. Browser will ask for permission
4. Click "Allow"
5. New notifications will show as browser popups

### Debug Issues

**Notifications not showing?**
- Check Firestore rules allow admin_notifications
- Verify user has admin/superadmin role
- Check console for errors
- Verify category not muted

**Sound not playing?**
- Check sound enabled in settings
- Check browser auto-play policy
- Try user interaction first

**Desktop notifications not working?**
- Check browser permission granted
- Check setting enabled
- Check browser notification settings

---

## File Locations

### Core Files
- **Tracker**: `src/utils/adminActivityTracker.js`
- **Bell Component**: `src/components/AdminNotificationsBell.jsx`
- **Activity Panel**: `src/pages/admin-panels/ActivityPanel.jsx`

### Documentation
- **Full Guide**: `ADMIN_NOTIFICATIONS.md`
- **Code Examples**: `TRACKING_EXAMPLES.md`
- **Implementation**: `IMPLEMENTATION_SUMMARY.md`
- **This Guide**: `QUICK_START_NOTIFICATIONS.md`

---

## Support

For issues or questions:
1. Check documentation files (above)
2. Check browser console for errors
3. Verify Firestore permissions
4. Test with different browsers
5. Contact development team

---

## Checklist

### For Admins
- [ ] Access notification bell in navbar
- [ ] View Activity Feed in admin panel
- [ ] Configure preferences (sound, desktop, categories)
- [ ] Test mark as read
- [ ] Test filtering and search

### For Developers
- [ ] Import tracking utility
- [ ] Add tracking to feature
- [ ] Test notification appears
- [ ] Verify metadata is useful
- [ ] Wrap in try-catch

---

**Need more details?** See `ADMIN_NOTIFICATIONS.md` for complete documentation.

**Need code examples?** See `TRACKING_EXAMPLES.md` for integration patterns.
