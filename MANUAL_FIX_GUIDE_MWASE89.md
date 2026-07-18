# Manual Fix Guide: mwase89@gmail.com Book Unlock

**Issue**: User purchased a book but it shows as "not available" in My Library

**Status**: ✅ Cloud fixes deployed. Manual admin action needed to unlock existing stuck orders.

---

## QUICK FIX (Admin Action Required)

### Step 1: Open Admin GodModePanel
1. Go to: https://haven.ellines.co.ke/admin
2. Login with admin credentials
3. Navigate to **Power Tools** → **God Mode Panel**

### Step 2: Find the User
1. In the top search box, type: `mwase89@gmail.com`
2. Click on the user to select
3. You should see their profile, orders, and library

### Step 3: Identify Stuck Orders
1. Scroll down to **📋 Orders** section
2. Look for orders with status `Completed` but the book doesn't appear in their **📚 Library** section
3. These are "stuck" orders where payment succeeded but books weren't unlocked

### Step 4: Manual Unlock
1. Scroll down to **📚 Library** section
2. In the "Add book..." dropdown, select the book that was purchased but not unlocked
3. Click **+ Unlock** button
4. You should see message: ✅ Book unlocked

### Step 5: Verify
1. Refresh the page
2. The book should now appear in their Library with a green checkmark
3. User can now access the book in My Library → Reader

---

## VERIFY IN PRODUCTION

### As Admin:
1. Refresh GodModePanel
2. Search: mwase89@gmail.com
3. Check that unlocked books show in their Library with `downloadUnlocked: true`

### As User (mwase89@gmail.com):
1. Login to account
2. Go to My Library
3. Previously "not available" books should now be readable
4. Click on book and open in Reader
5. Can read chapters without error

---

## IF MANUAL UNLOCK FAILS

**Error**: "Book unlock failed"

**Troubleshooting**:
1. Check that book exists in catalog:
   - Go to Admin → Library Management → search book title
   - Verify book status is not "draft" or "coming-soon"

2. Check user email is correct:
   - Confirm it's `mwase89@gmail.com` (lowercase)
   - Check no spaces or typos

3. Check order exists:
   - In user profile, verify order shows in Orders section
   - Order status should be `Completed` or `Pending`

4. If still fails:
   - Open browser console (F12)
   - Look for error messages
   - Screenshot and report to dev team

---

## DATABASE VERIFICATION

**For technical team**: Verify unlock in Firestore

### Check 1: Order Document
Path: `orders/{orderId}`
Should have:
```
{
  status: "Completed",
  userEmail: "mwase89@gmail.com",
  items: [{id: "...", title: "...", price: ...}],
  total: 299.99,
  paystackRef: "...",
  confirmedAt: <timestamp>,
  ...
}
```

### Check 2: Library Document
Path: `libraries/mwase89_at_gmail_com`
Should have:
```
{
  email: "mwase89@gmail.com",
  books: [
    {
      id: "book-id",
      title: "Book Title",
      price: 299.99,
      downloadUnlocked: true,
      unlockedAt: "2026-07-18T...",
      unlockedBy: "manual_unlock" or "paystack_auto"
    }
  ]
}
```

### If Library Document Missing:
1. Create it manually in Firebase Console
2. Or use Cloud Function: `unlockBooksForUser(email, items)`
3. Or use GodModePanel "+ Unlock" button

---

## PREVENT FUTURE ISSUES

**Implemented Fixes** (now deployed):

1. **Post-Unlock Verification**
   - Cloud functions now verify books were written to `libraries` collection
   - Failures logged to `unlock_failures` collection
   - Admin notified of any unlock failures

2. **Enhanced Reader Validation**
   - Reader now checks for `downloadUnlocked` metadata
   - Warns in console if book is owned but lacks unlock data
   - Better error messages for stuck unlocks

3. **Email Reset Codes**
   - sendPasswordResetOtp cloud function added
   - Users can now recover accounts with password reset
   - 6-digit OTP sent via email

---

## TESTING: Full Purchase Flow

**As Test User**:
1. Create account: test@gmail.com
2. Browse books
3. Add book to cart
4. Proceed to checkout
5. Complete payment (test card or Paystack test mode)
6. ✅ Should be redirected to success page
7. ✅ Go to My Library
8. ✅ Book should be visible with green checkmark
9. ✅ Can open Reader and read book

**If book doesn't appear**:
1. Wait 5-10 seconds (Firestore sync delay)
2. Refresh page
3. If still not visible, check admin panel for unlock_failures
4. Use manual unlock procedure above

---

## COMMUNICATION TO USER

**Email Template** (when unlock is complete):

---

Subject: ✅ Your Book is Ready to Read

Hi [User Name],

Good news! Your book purchase has been processed and is now ready to read.

**What You Purchased:**
- Book Title: [title]
- Price: KSh [amount]
- Order ID: [order-id]

**How to Access:**
1. Go to https://haven.ellines.co.ke
2. Login to your account
3. Click "My Library"
4. Click on the book to open the reader
5. Enjoy reading!

If you have any issues accessing your book, please reply to this email or contact us at:
- Email: ellines.haven@gmail.com
- WhatsApp: 0748 255 466

Thank you for supporting Ellines Haven!

— The Ellines Haven Team

---

---

## STATUS

✅ Fixes deployed to production
✅ Cloud functions verified (0 errors, 171 modules)
✅ GodModePanel ready for manual unlocks
✅ Firestore unlock_failures collection created for monitoring

**Next Action**: Admin performs manual unlock for mwase89@gmail.com, then tests full purchase flow to confirm all systems working.
