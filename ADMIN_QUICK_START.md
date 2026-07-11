# 🚀 Admin System - Quick Start Guide

## Accessing Admin Features

### 1. **Online Users** 🟢
**Go to**: Admin → Online Users (tab)

**What you can do**:
- See who's online **right now** (🟢 green indicator)
- View their IP address & location (city, country, ISP)
- See what page they're on
- Force logout any user instantly
- Click to expand details: Full geo data, timezone, map link

**Use case**: Monitor active users, detect suspicious activity, force logout abusive users

---

### 2. **All Receipts** 🧾
**Go to**: Admin → All Receipts (tab)

**What you can do**:
- **View all orders**: Search by ID, email, book title, payment ref
- **Filter by status**: Completed, Pending, Rejected, Cancelled
- **Sort by**: Newest, oldest, amount high/low
- **Edit any receipt**:
  - Customer name
  - Customer email
  - Total amount (KSh)
  - Payment method
  - Payment reference/code
  - Promo code used
  - Discount applied
  - Admin notes (internal)
- **Mark as Completed**: Auto-unlocks books for customer
- **Print receipt**: Formatted printable document
- **Export to CSV**: Bulk export all orders

**Use case**: Correct payment issues, edit typos, add notes, unlock books, generate reports

---

### 3. **God Mode** 👑 (Super Admin only)
**Go to**: Admin → God Mode (tab)

**What you can do**:
- **Search for any user**
- **View user profile**: Name, email, role, join date
- **View user's library**: All books they own, unlock/lock individual books
- **View user's orders**: Complete purchase history
- **Edit user orders**: Same as All Receipts panel
- **Mark orders Completed**: Auto-unlocks books
- **View user activity**: Recent actions & browsing
- **Force logout user**: Clear their auth instantly

**Use case**: Full user account management, resolve customer issues, investigate accounts

---

### 4. **Site Visitors** 🌍
**Go to**: Admin → Site Visitors (tab)

**What you see**:
- All visitors to your site (tracked automatically)
- IP addresses with geo locations
- Countries & cities represented
- Device types (Desktop/Mobile)
- Page they visited
- Referrer source

**Use case**: Analytics, traffic sources, geographic reach, device breakdown

---

## 📊 Admin Dashboard Stats

Quick view of key metrics:

- **🟢 Online Now**: Active users right now
- **👥 Total Tracked**: All presence records
- **🌐 Unique IPs**: Different visitors
- **🗺️ Countries**: Geographic reach
- **🛒 Total Orders**: All orders in system
- **✅ Completed**: Revenue-generating orders
- **⏳ Pending**: Awaiting confirmation
- **💰 Total Revenue**: KSh from completed orders

---

## 🎯 Common Tasks

### Task: A customer says they didn't receive their book
1. Go to **All Receipts** 🧾
2. Search for their email
3. Find their order
4. Check if status is "Completed"
5. If Pending: Click Edit → Set status to "Completed" → Save
6. Books auto-unlock in their library immediately

### Task: Fix a typo in a customer's name on receipt
1. Go to **All Receipts** 🧾
2. Find the order
3. Click **Edit**
4. Change "Customer Name" field
5. Click **Save Changes**
6. Receipt now shows correct name

### Task: See who's actively using the site
1. Go to **Online Users** 🟢
2. See 🟢 green badges = online right now
3. Click any user to see full details
4. Check their current page & IP location

### Task: Log out a spammy user
1. Go to **Online Users** 🟢
2. Find the user
3. Click **Force Offline** button
4. User is instantly redirected to login
5. Can't access site until logs in again

### Task: View all orders from a specific user
1. Go to **All Receipts** 🧾
2. Search by their email
3. All their orders appear
4. Click each to see details

### Task: Award a discount that wasn't applied
1. Go to **All Receipts** 🧾
2. Find the order
3. Click **Edit**
4. Set "Promo Code" = code they used
5. Set "Discount Amount (KSh)" = discount value
6. Reduce "Total" by discount amount
7. Click **Save Changes**
8. Customer's receipt shows the discount

### Task: Export all orders for accounting
1. Go to **All Receipts** 🧾
2. Filter as needed (by status, date, etc.)
3. Click **📊 Export CSV**
4. Opens Excel/spreadsheet with all data
5. Use for accounting, reporting, analysis

---

## ⏱️ How Often Data Updates

- **Online Users**: Updated every 30 seconds (real-time heartbeat)
- **Receipts**: Updated instantly when order changes
- **Site Visitors**: Recorded when visitor loads page
- **Admin Dashboard**: Auto-refreshes (you can set interval)

---

## 🔐 Security Notes

- **Only Super Admin** can use God Mode
- **Admin & Super Admin** can see online users & edit receipts
- **Force Logout**: Only works on currently online users
- **IP Data**: Captured securely from real client IP (not spoofable)
- **All edits**: Logged with timestamp & "lastEditedBy" admin name

---

## ❓ FAQ

**Q: Can I see deleted users?**  
A: No, deleted users are removed from presence tracking. You can view archived orders in the Trash/Archives collections.

**Q: How long do we keep online user history?**  
A: Stale records (inactive > 7 days) can be cleared manually from Online Users panel. Active users stay tracked.

**Q: Can customers see admin notes?**  
A: No, admin notes are internal only - customers never see them.

**Q: What if a user doesn't appear in Online Users?**  
A: They either logged out, haven't visited recently (>90 seconds), or their heartbeat failed. Refresh the page.

**Q: Can I print a receipt after editing it?**  
A: Yes! After saving changes, click the **🖨 Print** button to generate updated receipt.

**Q: What fields can't be edited in receipts?**  
A: Book titles/prices are read-only (they're linked to the order). You can only edit customer info & payment details.

---

## 📞 Troubleshooting

**Online users not showing?**
- Refresh the page
- Make sure users are actually logged in
- Check if their heartbeat has enough time (30s interval)

**Receipt edits not saving?**
- Check you have Admin role
- Verify internet connection
- Try refreshing the page

**IP location showing as blank?**
- Geo API might be rate-limited (45 req/min)
- Try again in a moment
- Fallback shows just the IP address

**Can't force logout a user?**
- They might already be offline
- Try refreshing the Online Users page
- Check if they're actually in the list

---

## 🎓 Best Practices

✅ **DO**:
- Regularly check Online Users for activity
- Add admin notes explaining unusual orders
- Export orders monthly for accounting
- Print receipts for high-value orders
- Monitor geo distribution for insights

❌ **DON'T**:
- Edit customer emails unless correcting typos
- Change totals without documenting in admin note
- Force logout legitimate users repeatedly
- Share admin access with non-admins

---

**Quick Link**: Bookmark `/admin` for instant access!

For detailed technical info, see: [ADMIN_SYSTEM_COMPLETE.md](./ADMIN_SYSTEM_COMPLETE.md)
