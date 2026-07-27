# Admin Notification System

## Overview
The admin notification system tracks user activities and site events in real-time, notifying admins and super admins of important actions happening on the Ellines Haven platform.

## Features

### 1. Real-time Activity Tracking
- User login and registration
- Site visits
- Book purchases and downloads
- Contact messages
- Reviews submitted
- Newsletter signups
- Cart checkouts
- Password resets
- Profile updates
- And more...

### 2. Admin Notification Bell
- Located in the navbar (visible to admin and super admin only)
- Shows unread notification count badge
- Dropdown panel with recent notifications
- Sound alerts for new notifications (configurable)
- Desktop notifications (with permission)
- Mute/unmute functionality

### 3. Activity Feed Panel
Full admin panel tab (`/admin` → Activity Feed) with:
- Comprehensive activity list
- Category filtering (15+ categories)
- Search functionality
- Unread/read filtering
- Notification settings management
- Bulk mark as read
- Delete notifications (super admin only)
- Real-time updates via Firestore

### 4. Notification Categories
- 🔐 **User Login** - Track when users sign in
- 👤 **User Registration** - New account creations
- 👁️ **Site Visit** - Visitor tracking (from Cloud Function)
- 💳 **Payment** - Payment transactions
- 📚 **Book Purchase** - Book purchases
- ⬇️ **Book Download** - Download events
- ✉️ **Contact Message** - Contact form submissions
- ⭐ **Review** - Book reviews
- 📧 **Newsletter** - Newsletter signups
- ❤️ **Wishlist** - Wishlist additions
- 🛒 **Cart Checkout** - Checkout events
- 🗑️ **Account Deletion** - Account deletion requests
- 🔑 **Password Reset** - Password reset events
- ✏️ **Profile Update** - Profile modifications
- ⚙️ **System** - System-level events

### 5. Notification Preferences
Each admin can customize:
- **Sound Alerts**: Enable/disable notification sounds
- **Desktop Notifications**: Enable/disable browser notifications
- **Category Muting**: Mute specific categories individually
- **Mute All/Unmute All**: Quick controls for all categories

Settings are stored per admin in Firestore (`admin_preferences` collection).

## Implementation

### Files Created

1. **src/utils/adminActivityTracker.js**
   - Core tracking utility
   - Notification categories and labels
   - Activity tracking functions
   - Preference management
   - Mark read/unread functionality

2. **src/components/AdminNotificationsBell.jsx**
   - Navbar notification bell component
   - Dropdown panel with recent notifications
   - Sound and desktop notification support
   - Settings modal
   - Real-time updates

3. **src/pages/admin-panels/ActivityPanel.jsx**
   - Full admin panel for activity management
   - Advanced filtering and search
   - Bulk operations
   - Detailed notification view
   - Category statistics

### Files Modified
1. **src/pages/Login.jsx**
   - Added activity tracking for user logins
   - Tracks user email and name

2. **src/pages/Register.jsx**
   - Added activity tracking for new registrations
   - Notifies admins of new users

3. **src/pages/Contact.jsx**
   - Added activity tracking for contact messages
   - Includes subject and message preview

4. **src/components/Navbar.jsx**
   - Added AdminNotificationsBell component
   - Displays for admin and super admin only

5. **src/pages/Admin.jsx**
   - Added "Activity Feed" tab to navigation
   - Lazy loads ActivityPanel component

6. **firestore.rules**
   - Added rules for admin_notifications
   - Added rules for admin_preferences
   - Added rules for activity_logs

## Usage

### Tracking Activity
To track an activity from any component:

```javascript
import { trackActivity, NOTIFICATION_CATEGORIES } from '../utils/adminActivityTracker';

await trackActivity({
  category: NOTIFICATION_CATEGORIES.BOOK_PURCHASE,
  title: 'Book Purchased',
  message: `User bought "${bookTitle}"`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    bookId: book.id,
    price: book.price,
    // any other relevant data
  },
  priority: 'normal', // 'low', 'normal', 'high'
});
```

### Admin Notification Preferences
Admins can manage preferences via:
1. Bell icon dropdown → Settings button
2. Admin Panel → Activity Feed → Settings button

Preferences include:
- Sound alerts on/off
- Desktop notifications on/off
- Per-category muting

### Notification Management
- **Mark as Read**: Click on unread notification
- **Mark All Read**: Button in dropdown or Activity Feed
- **Delete**: Super admin only, available in Activity Feed
- **Filter**: By category, unread status, or search query

## Firestore Collections

### admin_notifications
Stores all activity notifications:
```javascript
{
  id: 'notif_1234567890_abc123',
  category: 'user_login',
  title: 'User Login',
  message: 'John Doe logged in',
  icon: '🔐',
  userEmail: 'john@example.com',
  userName: 'John Doe',
  metadata: { loginTime: '...', userAgent: '...' },
  priority: 'low',
  read: false,
  readBy: [], // Array of admin emails who read this
  createdAt: Timestamp,
  deleted: false // Super admin can soft-delete
}
```

### admin_preferences
Stores per-admin notification preferences:
```javascript
{
  email: 'admin@ellines-haven.com',
  mutedCategories: ['visitor', 'user_login'],
  soundEnabled: true,
  desktopEnabled: true,
  autoMarkRead: false,
  updatedAt: Timestamp
}
```

### activity_logs
Historical activity log (separate from notifications):
```javascript
{
  id: 'log_1234567890_xyz789',
  category: 'user_registration',
  action: 'New User Registration',
  details: 'Jane Smith created an account',
  userEmail: 'jane@example.com',
  userName: 'Jane Smith',
  metadata: { /* additional data */ },
  timestamp: Timestamp
}
```

## Future Enhancements

### Planned Features
1. **Email Digest**: Daily/weekly email summary of activity
2. **Slack Integration**: Push notifications to Slack channels
3. **Activity Analytics**: Charts and graphs of activity trends
4. **Export**: Export activity logs to CSV/Excel
5. **Advanced Filters**: Date range, multiple categories, user-specific
6. **Notification Templates**: Customizable notification messages
7. **Activity Rules**: Automated actions based on activity patterns
8. **Real-time Dashboard**: Live activity feed on dashboard

### Integration Points
Add tracking to these areas:
- Book downloads (when download tracking is implemented)
- Payment success/failure events
- Wishlist additions
- Review submissions
- Newsletter signups
- User profile updates
- Password resets
- Account suspensions/deletions
- Book unlocks
- Refund requests

## Testing

### Test Activity Tracking
1. Register a new user → Check Activity Feed for registration notification
2. Login with existing user → Check Activity Feed for login notification
3. Submit contact form → Check Activity Feed for contact message
4. Check notification bell → Should show unread count
5. Click bell → Should show recent notifications
6. Click notification → Should mark as read
7. Open Settings → Mute a category → Verify that category doesn't show

### Test Preferences
1. Disable sound → New notification shouldn't play sound
2. Enable desktop notifications → New notification should show browser notification
3. Mute category → Notifications in that category shouldn't appear
4. Preferences should persist across page refresh

## Troubleshooting

### Notifications Not Appearing
1. Check Firestore rules allow read/write to admin_notifications
2. Verify user has admin or superadmin role
3. Check browser console for errors
4. Verify category is not muted in preferences

### Sound Not Playing
1. Check browser auto-play policy
2. Verify sound is enabled in preferences
3. Check browser console for AudioContext errors

### Desktop Notifications Not Showing
1. Check browser notification permission
2. Verify desktop notifications enabled in preferences
3. Check browser notification settings

## Security Notes
- Only admin and superadmin roles can see notifications
- Notifications contain user data (emails, names) - ensure proper access control
- Firestore rules should restrict admin collections when Firebase Auth is implemented
- Consider implementing rate limiting for activity tracking to prevent spam

## Performance Considerations
- Firestore queries are limited to 500 notifications (configurable)
- Real-time listeners are automatically unsubscribed on component unmount
- Notifications are soft-deleted (not physically removed) to maintain history
- Consider archiving old notifications (>90 days) to separate collection
