# 📘 Admin User Manual - Complete Feature Guide

**Date:** July 11, 2026  
**Version:** 1.0  
**For:** Admin & Super Admin Users

---

## Table of Contents

1. [Online Users Tracking](#-online-users-tracking)
2. [Receipt/Order Editing](#-receiptsorder-editing)
3. [Super Admin User Control](#-super-admin-user-control)
4. [Site Visitor Tracking](#-site-visitor-tracking)
5. [Common Tasks](#-common-tasks)
6. [Troubleshooting](#-troubleshooting)

---

## 🟢 Online Users Tracking

### What is it?
A real-time dashboard showing everyone currently on your site, their IP addresses, and what they're doing.

### How to access
1. Go to Admin Dashboard
2. Click the **🟢 Online Tab**
3. You'll see a live list of users currently browsing

### What information is shown

**For each online user, you see:**

| Info | Example | What it means |
|------|---------|--------------|
| **Status** | 🟢 ONLINE | They're viewing the site right now (updated every 30s) |
| **Name** | John Doe | Their account name |
| **Email** | john@example.com | Their email address |
| **IP Address** | 197.232.45.123 | Their internet connection address |
| **Location** | Nairobi, Kenya 🇰🇪 | City and country (from their IP) |
| **Current Page** | /library/book/123 | What page they're viewing |
| **Device** | 📱 Mobile or 💻 Desktop | What device type |
| **Last Seen** | 2m ago | How long since their last activity |

### Statistics Dashboard

At the top, you see 4 quick stats:

- **🟢 Online Now:** How many users are currently active
- **👥 Total Tracked:** All users who have ever logged in and been tracked
- **🌐 Unique IPs:** How many different IP addresses we've seen
- **🗺️ Countries:** How many different countries users are from

### Features

#### Search & Filter
- **Search box** at the top searches by:
  - User name
  - Email
  - IP address
  - Page they're on
  - City or country
  
Example: Type "197" to find all users from that IP range

#### Online/All Toggle
- **🟢 Online** — Shows only currently active users
- **👥 All Presence** — Shows all tracked users (including offline)

#### Force Offline
- Click **"Force Offline"** button next to a user
- They will be logged out the next time they take an action
- Useful for security or when someone needs to be kicked out

#### Click on a user for details
- Click any user in the table
- See expanded details including:
  - Full IP address
  - GPS coordinates
  - Timezone
  - ISP provider
  - Session ID
- Click **🗺️ View on Map** to see their exact location on OpenStreetMap

#### Recent Login Sessions
- Bottom of the page shows recent login history
- See when users logged in, from which IP, on which device

### Example Scenarios

**Scenario 1: Suspicious Activity**
1. See unusual user in Online list
2. Click to view details
3. Check their IP and location
4. If suspicious, click "Force Offline"
5. Check their activity history

**Scenario 2: Monitor Traffic**
1. Check "🟢 Online Now" count
2. See peak usage times
3. Identify bot traffic (multiple logins from same IP)
4. Block if needed

**Scenario 3: Verify User Location**
1. User claims to be from USA but ordered book
2. Open Online Users
3. Search for their name/email
4. See their IP shows they're actually from Kenya
5. Fraud detected! 🚨

---

## 🧾 Receipts/Order Editing

### What is it?
A panel where you can view and edit ANY order/receipt from ANY customer. You have complete control over receipts.

### How to access
1. Go to Admin Dashboard
2. Click the **🧾 All Orders Tab**
3. You'll see all receipts from all customers

### What can you edit?

**You can modify:**
- ✏️ Customer name
- ✏️ Customer email
- ✏️ Order total amount (KSh)
- ✏️ Payment method (Cash, M-Pesa, Paystack, PayPal)
- ✏️ Transaction reference (for verification)
- ✏️ Transaction code (SMS code, receipt number, etc.)
- ✏️ Promo code used
- ✏️ Discount amount applied
- ✏️ Admin notes (internal comments about the order)
- ✏️ Order status (Pending → Completed → Rejected/Cancelled)

### Order Status Options

| Status | Meaning |
|--------|---------|
| **Pending** | Order received but not confirmed |
| **Completed** | Order confirmed, books unlocked ✅ |
| **Rejected** | Customer canceled, refund issued ❌ |
| **Cancelled** | Admin cancelled for some reason 🚫 |

**Important:** When you mark an order as **Completed**, the books are automatically unlocked for the customer.

### Features

#### View All Orders
- See every order ever placed
- Shows: Customer, date, amount, method, status
- Orders sorted by newest first

#### Edit an Order
1. Find the order in the list
2. Click **Edit** button
3. Modify any fields you need
4. Click **Save Order**
5. Success message appears ✅

#### Print Receipt
1. Find an order
2. Click **Print** button
3. Professional receipt prints (or opens PDF)
4. Customer can take this as proof

#### Export to CSV
- Click **Export to CSV** button
- Downloads spreadsheet with all orders
- Use for accounting, reporting, or analysis

#### Search & Filter
- Search by customer name
- Filter by status (Pending, Completed, etc.)
- Filter by payment method
- Filter by date range

#### Statistics Dashboard
At the top:
- **Total Revenue:** Sum of all orders
- **Pending Orders:** Orders awaiting completion
- **Completed Orders:** Successfully delivered
- **Rejected Orders:** Refunded or cancelled

### Example Scenarios

**Scenario 1: Customer calls - wrong amount charged**
1. Customer says they were charged KSh 500 instead of KSh 450
2. Open All Orders
3. Search for their order
4. Click Edit
5. Change "Order Total" from 500 to 450
6. Click Save
7. Apologize and explain the fix
8. Send them proof (Print Receipt)

**Scenario 2: Manual M-Pesa payment**
1. Customer sent M-Pesa but system didn't auto-verify
2. They give you the M-Pesa reference: "K2NL3"
3. Open All Orders
4. Find their order (might be in Pending status)
5. Click Edit
6. Change status to **Completed**
7. Add M-Pesa reference: "K2NL3"
8. Click Save
9. **IMPORTANT:** Books are now automatically unlocked! ✅

**Scenario 3: Customer requests refund**
1. Customer wants refund for a book
2. Open All Orders
3. Find their order
4. Click Edit
5. Change status to **Rejected**
6. Add note: "Customer requested refund - issued M-Pesa on 11 Jul"
7. Click Save
8. Process the refund separately in M-Pesa/PayPal/etc.

**Scenario 4: Promo code tracking**
1. You want to see which customers used promo codes
2. Open All Orders
3. Look for "Promo Code" column
4. Filter or search
5. See which promos are popular
6. Analyze sales impact

---

## 👑 Super Admin User Control

### What is it?
As a Super Admin, you have COMPLETE control over everything about users, including their orders and receipts.

### How to access
1. Go to Admin Dashboard
2. Click **👑 God Mode** tab
3. Search for a user
4. Click to select them
5. You'll see all their data and options

### What can Super Admin do?

#### User Account Control
- ✏️ Edit user name, email, phone
- 🔑 Reset their password
- 🎭 Change their role (user → admin → superadmin)
- 🗑️ Delete user account
- 🔍 View all their personal information

#### NEW: Orders & Receipts Section
1. Select a user in God Mode
2. Scroll down to **"Orders & Receipts"** section
3. See ALL orders placed by that user
4. Click **Edit** on any order
5. Modify it exactly like in AdminOrdersPanel:
   - Change amount
   - Change payment method
   - Change status
   - Books automatically unlock on Completed

#### User's Library
- See all books the user has purchased and unlocked
- See which books are still locked (require payment)

#### User Activity
- See user's account creation date
- See last login time
- See all sessions and IP addresses
- Monitor their activity

### Example Scenarios

**Scenario 1: User wants name changed**
1. User emails: "My name is Mary but I registered as M"
2. Go to God Mode
3. Search for their email
4. Click Edit in "Account Details"
5. Change name from "M" to "Mary"
6. Save
7. Their receipt, profile, and library all reflect the change

**Scenario 2: Payment issue - customer overpaid**
1. Customer paid KSh 1500 instead of KSh 1200
2. In God Mode, find the customer
3. Go to "Orders & Receipts" section
4. Find their order
5. Click Edit
6. Change amount from 1500 to 1200
7. Save
8. Apologize and refund KSh 300
9. Tell them receipt is updated

**Scenario 3: Unlock book for specific user**
1. Customer says book didn't unlock after payment
2. In God Mode, find the customer
3. Go to "Orders & Receipts"
4. Find the order for that book
5. Click Edit
6. Change status from "Pending" to "Completed"
7. Save
8. **Books automatically unlock** ✅
9. Customer can now read

**Scenario 4: Promote trusted user to admin**
1. Trusted user wants to help manage the site
2. In God Mode, select their account
3. Click Edit
4. Change Role from "user" to "admin"
5. Save
6. They now have access to Admin Dashboard

**Scenario 5: Investigate suspicious account**
1. Multiple charges from suspicious account
2. In God Mode, find the account
3. View Orders & Receipts
4. See all their orders
5. Check payment methods and patterns
6. Click View on Map to see their IP location
7. If fraud, mark orders as "Rejected"
8. Delete the account

---

## 📊 Site Visitor Tracking

### What is it?
A dashboard showing all visitors to your site (not just logged-in users), their IP addresses, and where they're from.

### How to access
1. Go to Admin Dashboard
2. Click **📊 Visitors Tab**
3. See all visitors to your site

### What information is shown

For each visitor:
- **IP Address** - Their internet connection
- **Country** - 🇰🇪 Where they're from
- **City** - Which city
- **ISP** - Their internet provider (e.g., Safaricom)
- **Device Type** - Mobile or Desktop
- **Pages Viewed** - Which pages they visited
- **Visit Time** - When they visited
- **GPS Coordinates** - Exact location (optional)

### How it's different from "Online Users"

| | Online Users | Visitors |
|---|---|---|
| **Who** | Only logged-in users | Everyone (logged in or not) |
| **Real-time** | Yes, updated every 30s | No, static history |
| **What they're doing** | Current page, last action | Pages they viewed |
| **IP shown** | Yes, real IP | Yes, real IP |
| **Purpose** | Monitor active users | Understand traffic sources |

### Example Scenarios

**Scenario 1: Track traffic sources**
1. Open Visitors tab
2. See visitors from different countries
3. Identify which countries are your market
4. Plan marketing accordingly

**Scenario 2: Detect bots**
1. See multiple visits from same IP in 1 second
2. Suspicious - likely bot traffic
3. Note the IP
4. Consider blocking it

**Scenario 3: Understand user journey**
1. See a visitor from USA
2. Check which pages they visited
3. /books → /book/123 → /cart
4. They almost bought but didn't
5. Could add retargeting ads

---

## ⚙️ Common Tasks

### Task 1: Unlock a book for a customer
**Time: 2 minutes**
1. Admin → 🧾 All Orders
2. Search for customer
3. Find their order
4. Click Edit
5. Change status to "Completed"
6. Save
7. ✅ Books automatically unlocked

### Task 2: Verify customer IP address
**Time: 1 minute**
1. Admin → 🟢 Online Users
2. Search for customer name
3. See their IP address and location
4. Click "View on Map" to see exact location
5. Verify if they're from the country they claim

### Task 3: Check total revenue this month
**Time: 30 seconds**
1. Admin → 🧾 All Orders
2. See "Total Revenue" at top
3. Shows sum of all Completed orders

### Task 4: Export sales data
**Time: 1 minute**
1. Admin → 🧾 All Orders
2. Click "Export to CSV"
3. Opens in Excel
4. Use for accounting or reporting

### Task 5: Kick out a user
**Time: 1 minute**
1. Admin → 🟢 Online Users
2. Find user
3. Click "Force Offline"
4. User logged out on next action
5. Can log back in if they want

### Task 6: Change customer name
**Time: 2 minutes**
1. Super Admin → 👑 God Mode
2. Search for customer
3. Click Edit
4. Change name field
5. Save
6. All records updated

### Task 7: Investigate fraud
**Time: 5 minutes**
1. Admin → 📊 Visitors (see where they came from)
2. Admin → 🟢 Online Users (see current IP)
3. Super Admin → 👑 God Mode (see all their orders)
4. Look for patterns
5. Decide action (refund, block, delete)

---

## 🔧 Troubleshooting

### Problem: I don't see the Online Users or All Orders tabs

**Solution:**
- Make sure you're logged in as Admin or Super Admin
- Refresh the page
- Check your role in God Mode
- If still not visible, your account might not have admin privileges

### Problem: Can't force a user offline

**Solution:**
- Make sure they're actually online (🟢 status)
- They might have already logged out
- Try again after 30 seconds (presence updates every 30s)
- Check browser console (F12) for errors

### Problem: Order shows old data after I edited it

**Solution:**
- The page might not have refreshed
- Press F5 or Cmd+R to refresh
- Wait 5 seconds for real-time update to come through
- Check that your save was successful (should see ✅ toast)

### Problem: Customer location shows wrong country

**Solution:**
- They might be using a VPN
- VPNs often show the country where the VPN server is
- Their actual IP shows in the raw data
- If suspicious, ask them to verify manually

### Problem: Printing receipt doesn't work

**Solution:**
- Make sure pop-ups are allowed
- Try again with pop-ups enabled
- Try Chrome instead of Safari (better print support)
- Receipt should open in new tab

### Problem: Export to CSV downloads but opens as strange file

**Solution:**
- The file is a CSV (spreadsheet file)
- Open it with Excel, Google Sheets, or any spreadsheet app
- On Mac, might open in Numbers instead
- Right-click → Open With → Choose Excel

### Problem: I see a user but they're not in the list

**Solution:**
- They might be offline (not 🟢 status)
- Toggle to "👥 All Presence" to see offline users
- They might have just logged out
- Try searching by email

---

## 🎓 Key Concepts

### What is a "Session"?
A session is one time a user logs in. If they log out and log back in, that's a new session. We track each session with an IP address and device type.

### What is "Presence"?
Presence means a user is currently browsing the site. We send a "heartbeat" every 30 seconds. If no heartbeat for 90 seconds, they're offline.

### What is "IP Address"?
An IP address is like a phone number for the internet. Each device has one. It reveals:
- Approximate location (city/country)
- Internet provider (ISP)
- Whether they're using VPN

### What is "Geo-location"?
Geo-location is the geographic location extracted from an IP address. It includes city, country, ISP, and sometimes GPS coordinates.

---

## 📞 Support

If you encounter issues:

1. **Check this manual** — Answers 90% of questions
2. **Clear cache** — Ctrl+Shift+Delete (browser cache)
3. **Hard refresh** — Ctrl+Shift+R (reload page)
4. **Check browser console** — F12 to open, check for errors
5. **Contact developer** — If still not working

---

## 🎯 Quick Reference

| Task | Tab | Icon | Steps |
|------|-----|------|-------|
| See online users | Online | 🟢 | Click Online tab |
| Edit receipt | All Orders | 🧾 | Find order → Edit |
| Control user | God Mode | 👑 | Search user → Edit |
| View visitors | Visitors | 📊 | Click Visitors tab |
| Force logout | Online | 🟢 | Find user → Force Offline |
| Check IP address | Online | 🟢 | Click user → View on Map |

---

## ✨ Tips & Tricks

### Tip 1: Use search wisely
- Search by first 3 digits of IP to find all users from same ISP
- Search by country name to find users from specific country
- Search by page URL to see who's viewing specific books

### Tip 2: Check unusual patterns
- Multiple users from same IP = shared network (internet cafe, office)
- Timezone mismatches = might be VPN or fraud
- Bot behavior = multiple actions per second

### Tip 3: Regular monitoring
- Check Online Users every morning
- Check yesterday's Visitors for insights
- Review revenue trends in All Orders

### Tip 4: Archive stale data
- Click "🗑 Clear Stale" to remove very old presence records
- Keeps database fast and clean
- Only removes records older than 7 days

---

**Version:** 1.0  
**Last Updated:** July 11, 2026  
**Status:** ✅ Complete

**Happy administrating! 👑**

