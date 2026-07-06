# Activity Tracking Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER DEVICES                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
│  │   Desktop App    │   │   Mobile App     │   │   Tablet App     │   │
│  │  (Chrome/Safari) │   │  (Chrome Mobile) │   │  (Safari/Chrome) │   │
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘   │
│           │                      │                      │               │
│           │ User clicks "Sign In"│                      │               │
│           └──────────┬───────────┴──────────┬───────────┘               │
│                      │                      │                           │
│                      ▼                      ▼                           │
│              ┌─────────────────────────────────────┐                    │
│              │  Firebase Authentication (Client)   │                    │
│              │  1. Validate email/password         │                    │
│              │  2. Set user context                │                    │
│              │  3. Redirect to dashboard           │                    │
│              └──────────┬──────────────────────────┘                    │
│                         │                                               │
│                         │ Login successful                              │
│                         ▼                                               │
│              ┌─────────────────────────────────────┐                    │
│              │ Reliable Activity Logger            │                    │
│              │ (NEW: reliableActivityLogger.js)    │                    │
│              │                                     │                    │
│              │ 1. Get device type (Mobile/Desktop) │                    │
│              │ 2. Get browser fingerprint          │                    │
│              │ 3. Prepare activity payload         │                    │
│              └──────────┬──────────────────────────┘                    │
│                         │                                               │
│                         │ Call Cloud Function                           │
│                         │ (HTTPS)                                       │
└─────────────────────────┼───────────────────────────────────────────────┘
                          │
                          │ https://us-central1-ellines-haven-web.
                          │        cloudfunctions.net/logUserLoginServer
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       GOOGLE CLOUD (Server)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               Cloud Function: logUserLoginServer                 │  │
│  │                                                                   │  │
│  │  receive request {userEmail, userName, metadata}                │  │
│  │      ↓                                                           │  │
│  │  1. Extract real IP from request headers                        │  │
│  │     ├─ x-forwarded-for                                         │  │
│  │     ├─ x-real-ip                                               │  │
│  │     ├─ cf-connecting-ip (Cloudflare)                           │  │
│  │     └─ fallback to socket address                              │  │
│  │      ↓                                                           │  │
│  │  2. Create activity record                                      │  │
│  │     ├─ activityId = "act_" + timestamp + random                │  │
│  │     ├─ category = "user_login"                                 │  │
│  │     ├─ title = "User Login"                                    │  │
│  │     ├─ message = "${userName} logged in"                       │  │
│  │     ├─ clientIp = extracted IP                                 │  │
│  │     ├─ device = from metadata                                  │  │
│  │     ├─ userAgent = from request                                │  │
│  │     └─ createdAt = server timestamp                            │  │
│  │      ↓                                                           │  │
│  │  3. Write to TWO Firestore collections:                        │  │
│  │     ├─ admin_notifications/{activityId}                        │  │
│  │     │  (for admin dashboard, real-time)                        │  │
│  │     │                                                           │  │
│  │     └─ activity_logs/{logId}                                   │  │
│  │        (for audit trail, historical)                           │  │
│  │      ↓                                                           │  │
│  │  4. Create session record                                       │  │
│  │     ├─ sessionId = "session_" + emailHash + timestamp          │  │
│  │     ├─ userEmail = normalized email                            │  │
│  │     ├─ ip = clientIp                                           │  │
│  │     ├─ device = device type                                    │  │
│  │     ├─ userAgent = browser UA                                  │  │
│  │     ├─ loginTime = now                                         │  │
│  │     └─ expiresAt = 30 days                                     │  │
│  │      ↓                                                           │  │
│  │  5. Write to user_sessions/{sessionId}                         │  │
│  │     (for cross-device tracking)                                │  │
│  │      ↓                                                           │  │
│  │  return { success: true, activityId, sessionId }               │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Firestore Collections                          │  │
│  │                                                                   │  │
│  │  admin_notifications/{id}                                        │  │
│  │  ├─ category: "user_login"                                      │  │
│  │  ├─ userEmail: "john@example.com"                               │  │
│  │  ├─ device: "Mobile" | "Desktop" | "Tablet"                    │  │
│  │  ├─ clientIp: "203.0.113.45"                                    │  │
│  │  ├─ createdAt: Timestamp                                        │  │
│  │  ├─ read: false                                                 │  │
│  │  └─ readBy: [admin email who read it]                          │  │
│  │                                                                   │  │
│  │  user_sessions/{sessionId}                                       │  │
│  │  ├─ userEmail: "john@example.com"                               │  │
│  │  ├─ device: "Mobile"                                            │  │
│  │  ├─ ip: "203.0.113.45"                                          │  │
│  │  ├─ userAgent: "Mozilla/5.0..."                                 │  │
│  │  ├─ loginTime: Timestamp                                        │  │
│  │  └─ expiresAt: Timestamp (30 days)                              │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                          │
                          │ Return result
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Activity Logger)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │        Response Handler: { success, activityId }                 │  │
│  │                                                                   │  │
│  │  if (success)                                                     │  │
│  │    ✅ Activity logged on server                                   │  │
│  │    Return success to user                                         │  │
│  │                                                                   │  │
│  │  if (error)                                                       │  │
│  │    ❌ Network/function error                                      │  │
│  │    └─ Queue activity to localStorage                            │  │
│  │       ├─ Save to: ellines_activity_queue                        │  │
│  │       ├─ Add: queuedAt, attempts: 0                             │  │
│  │       └─ Schedule retry in 3 seconds                            │  │
│  │    Return success (to user - good UX)                           │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │           Retry Logic (flushActivityQueue)                        │  │
│  │                                                                   │  │
│  │  Triggered:                                                       │  │
│  │  ├─ App initialization (initializeActivityLogger)               │  │
│  │  ├─ Every 3 seconds (setTimeout)                                │  │
│  │  ├─ Before page unload                                          │  │
│  │  └─ After network restored (manual trigger)                     │  │
│  │                                                                   │  │
│  │  For each queued activity:                                       │  │
│  │  ├─ Check attempts < 3                                          │  │
│  │  ├─ Call Cloud Function again                                   │  │
│  │  ├─ If success: remove from queue                               │  │
│  │  ├─ If fail: increment attempts, keep in queue                  │  │
│  │  └─ If attempts = 3: log warning, give up                       │  │
│  │                                                                   │  │
│  │  localStorage (persistent across page reloads)                   │  │
│  │  {                                                                │  │
│  │    "ellines_activity_queue": [                                   │  │
│  │      {                                                            │  │
│  │        type: "login",                                            │  │
│  │        userEmail: "john@example.com",                            │  │
│  │        device: "Mobile",                                         │  │
│  │        userAgent: "Mozilla/5.0...",                              │  │
│  │        timestamp: "2026-07-06T14:30:00Z",                        │  │
│  │        queuedAt: "2026-07-06T14:30:01Z",                         │  │
│  │        attempts: 2                                               │  │
│  │      }                                                            │  │
│  │    ]                                                              │  │
│  │  }                                                                │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                          │
                          │ After sync successful
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       ADMIN DASHBOARD                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Activity Panel (Real-time)                           │  │
│  │                                                                   │  │
│  │  Listens to: collection(db, 'admin_notifications')               │  │
│  │  Query:  orderBy('createdAt', 'desc'), limit(500)               │  │
│  │  Updates: Real-time via onSnapshot                              │  │
│  │                                                                   │  │
│  │  Displays:                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │ 🔐 User Login                       5:42 PM             │    │  │
│  │  │    john@example.com logged in                           │    │  │
│  │  │    Mobile • 203.0.113.45 • Nairobi, Kenya              │    │  │
│  │  │                                                          │    │  │
│  │  │ 🔐 User Login                       4:15 PM             │    │  │
│  │  │    john@example.com logged in                           │    │  │
│  │  │    Desktop • 192.0.2.78 • Nairobi, Kenya               │    │  │
│  │  │                                                          │    │  │
│  │  │ 👤 User Registration                 3:00 PM             │    │  │
│  │  │    jane@example.com created account                     │    │  │
│  │  │    Desktop • 198.51.100.5                               │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │        User Login History (Click user to see all devices)         │  │
│  │                                                                   │  │
│  │  john@example.com                                                 │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │ Sessions (5 total)                                      │    │  │
│  │  │                                                          │    │  │
│  │  │ 🔐 Mobile   - 203.0.113.45 - Nairobi, KE - 5:42 PM    │    │  │
│  │  │ 🔐 Desktop  - 192.0.2.78    - Nairobi, KE - 4:15 PM    │    │  │
│  │  │ 🔐 Tablet   - 198.51.100.5  - Nairobi, KE - 2:10 PM    │    │  │
│  │  │ 🔐 Desktop  - 192.0.2.100   - Nairobi, KE - 1:30 PM    │    │  │
│  │  │ 🔐 Mobile   - 203.0.113.50  - Nairobi, KE - 12:00 PM   │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
Login Page          → Cloud Function        → Firestore      → Admin Dashboard
──────────────────────────────────────────────────────────────────────────────

Desktop:
  User Login          logUserLoginServer    admin_notifications/
  (john@ex.com)    →  Extract: IP, Device  ├─ Device: Desktop   → Activity Feed
  Device: Desktop  →  Create: Activity      ├─ IP: 203.0.113.45
  IP: 203.0.113.45 →  Create: Session      ├─ userEmail: john
                      Write to 2 collections
                                            user_sessions/    
Mobile:                                     ├─ Device: Desktop
  User Login          logUserLoginServer    ├─ IP: 203.0.113.45  → User History
  (john@ex.com)    →  Extract: IP, Device  ├─ loginTime: now
  Device: Mobile   →  Create: Activity      └─ expiresAt: 30d
  IP: 192.0.2.78   →  Create: Session
                      Write to 2 collections

                                            New entries:
                                            ├─ Device: Mobile     → Activity Feed
                                            ├─ IP: 192.0.2.78        +
                                            └─ Both linked to         Linked
                                               john@ex.com        History
```

## Error Handling Flow

```
Activity Logging
    ↓
Call logUserLoginServer
    ├─ SUCCESS ✅
    │   └─ Return { success: true }
    │       └─ Admin sees activity immediately
    │
    └─ FAIL ❌
        └─ Network error / Function down
            └─ Catch error
                └─ Queue to localStorage
                    ├─ Add to ellines_activity_queue
                    ├─ Set attempts: 0
                    └─ Set queuedAt: now
                        └─ Schedule retry
                            ├─ Attempt 1 (3 sec)  ❌ still offline
                            ├─ Attempt 2 (retry) ✅ online!
                            │   └─ Resend to Cloud Function
                            │       └─ Success ✅
                            │           └─ Remove from queue
                            │               └─ Admin sees activity
                            │
                            └─ (if still failing after 3 attempts)
                                └─ Log warning
                                └─ Keep in queue indefinitely
                                └─ Retry again on next app load
```

## Security & Firestore Rules

```
Before (Vulnerable):
  admin_notifications/{d}  → allow read, write: if true;
  (Anyone could write fake activities)

After (Secure):
  admin_notifications/{d}  
  ├─ allow read: if admin || superadmin
  ├─ allow create: if false  (Cloud Functions only!)
  ├─ allow update: if false
  └─ allow delete: if superadmin

  user_sessions/{d}
  ├─ allow read: if admin || superadmin
  ├─ allow create: if false  (Cloud Functions only!)
  ├─ allow update: if false
  └─ allow delete: if false
```

## Collection Schema

### admin_notifications
```javascript
{
  id: "act_1720254000000_abc123",
  category: "user_login",
  title: "User Login",
  message: "John Doe logged in",
  icon: "🔐",
  userEmail: "john@example.com",
  userName: "John Doe",
  clientIp: "203.0.113.45",
  device: "Mobile",
  userAgent: "Mozilla/5.0...",
  metadata: {
    loginTime: "2026-07-06T14:30:00Z",
    timestamp: "2026-07-06T14:30:00Z",
  },
  priority: "low",
  read: false,
  readBy: ["admin@example.com"],  // which admins have read this
  createdAt: Timestamp,
  createdAtMs: 1720254000000,
}
```

### user_sessions
```javascript
{
  userEmail: "john@example.com",
  sessionId: "session_john_example_com_1720254000000",
  loginTime: Timestamp,
  ip: "203.0.113.45",
  device: "Mobile",
  userAgent: "Mozilla/5.0...",
  expiresAt: Timestamp (30 days from now),
}
```

---

This architecture ensures:
✅ Reliable tracking (server-side)
✅ Cross-device correlation (session records)
✅ Automatic retry (localStorage queue)
✅ Secure (Cloud Functions only)
✅ Real-time admin visibility (Firestore snapshots)

