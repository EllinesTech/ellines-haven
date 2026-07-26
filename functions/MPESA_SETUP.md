# Payment Setup Guide — Ellines Haven

---

## Part 1 — M-Pesa (Safaricom Daraja)

### 1. Get Daraja API Credentials

1. Go to https://developer.safaricom.co.ke
2. Create an account and log in
3. Go to **My Apps** → Create a new app
4. Enable **Lipa Na M-Pesa Online** (STK Push)
5. Copy your **Consumer Key** and **Consumer Secret**
6. Get your **Shortcode** and **Passkey** from the M-Pesa portal
   - Sandbox: shortcode = `174379`, passkey from the test page
   - Production: use your actual business shortcode

### 2. Set Firebase Secrets

Run these in the `ellines-haven/` root folder:

```bash
firebase functions:secrets:set MPESA_CONSUMER_KEY
firebase functions:secrets:set MPESA_CONSUMER_SECRET
firebase functions:secrets:set MPESA_SHORTCODE
firebase functions:secrets:set MPESA_PASSKEY
firebase functions:secrets:set MPESA_CALLBACK_URL
firebase functions:secrets:set MPESA_ENV
```

Values:
| Secret | Value |
|---|---|
| `MPESA_CONSUMER_KEY` | Your Daraja consumer key |
| `MPESA_CONSUMER_SECRET` | Your Daraja consumer secret |
| `MPESA_SHORTCODE` | Till/paybill number (`174379` for sandbox) |
| `MPESA_PASSKEY` | Lipa Na M-Pesa passkey |
| `MPESA_CALLBACK_URL` | `https://us-central1-ellines-haven-web.cloudfunctions.net/mpesaCallback` |
| `MPESA_ENV` | `production` or `sandbox` |

### 3. Register Callback URL with Safaricom

In the Daraja portal, register:
```
https://us-central1-ellines-haven-web.cloudfunctions.net/mpesaCallback
```

### 4. Transaction Type

Currently uses `CustomerPayBillOnline` (Paybill).  
For a **Till number**, change `TransactionType` in `functions/index.js` to `CustomerBuyGoodsOnline`.

### How M-Pesa Flow Works

1. Customer enters phone at checkout
2. Frontend calls `stkPush` Cloud Function
3. Daraja API sends STK push to customer's phone
4. Customer enters PIN → Safaricom calls `mpesaCallback`
5. Callback: order marked `Completed`, books written to user's library
6. Frontend Firestore listener detects change → books unlock instantly

---

## Part 2 — Paystack

Paystack is **already live** on the site using the shared Ellines group keys (same as tech.ellines.co.ke / ellines.co.ke).

Public key (frontend / Cloudflare / `.env.production`):
`pk_live_081be2d1bdd05a16be4cc91b1267553a6444b463`

### What's wired:
- Frontend: `js.paystack.co/v1/inline.js` popup for M-Pesa, Visa, Mastercard, bank
- Backend: `verifyPaystackPayment` callable — confirms payment + unlocks books after checkout
- Shared group webhook (hub): receives Paystack `charge.success` for the whole Ellines account
- Optional backup: Haven still has a `paystackWebhook` Cloud Function if you ever add a second endpoint

### To set the webhook secret (must match the hub live secret):

```bash
firebase functions:secrets:set PAYSTACK_SECRET
```

Enter the same Paystack **Secret Key** (`sk_live_…`) used by tech.ellines.co.ke / ellines.co.ke.

### Register webhook URL in Paystack Dashboard (Live):

Use the **shared hub webhook** (same as tech.ellines.co.ke):

```
https://ellines.co.ke/api/paystack/webhook
```

Events to subscribe: `charge.success`

Set this in: [Paystack Dashboard](https://dashboard.paystack.com) → Settings → API Keys & Webhooks → Live → Webhook URL.

Do **not** point the main account webhook at the old Haven-only URL  
(`…cloudfunctions.net/paystackWebhook`) when using the shared group account.

---

## Part 3 — PayPal

PayPal is integrated via two Cloud Functions: `createPayPalOrder` and `capturePayPalOrder`.  
Payments are processed in **USD** (the KES equivalent is shown to the customer).

### 1. Create a PayPal Developer App

1. Go to https://developer.paypal.com
2. Sign in and go to **My Apps & Credentials**
3. Switch to **Live** tab (or Sandbox for testing)
4. Click **Create App** → give it a name → copy **Client ID** and **Secret**

### 2. Set Firebase Secrets

```bash
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_CLIENT_SECRET
firebase functions:secrets:set PAYPAL_MODE
```

Values:
| Secret | Value |
|---|---|
| `PAYPAL_CLIENT_ID` | Your PayPal App Client ID |
| `PAYPAL_CLIENT_SECRET` | Your PayPal App Client Secret |
| `PAYPAL_MODE` | `live` or `sandbox` |

### 3. Add Client ID to Site Settings

In the Admin Panel → Settings, add your **PayPal Client ID** to `paypalClientId`.  
This is used by the frontend to load the PayPal SDK with your app.

### How PayPal Flow Works

1. Customer selects PayPal at checkout
2. Frontend calls `createPayPalOrder` Cloud Function → returns a PayPal Order ID
3. PayPal JS SDK opens the secure PayPal checkout (popup or redirect)
4. Customer approves → frontend calls `capturePayPalOrder` Cloud Function
5. Cloud Function captures the payment via PayPal API
6. Order marked `Completed`, books written to customer's library

### KES → USD Conversion

The current conversion rate used is `1 KES = 0.0077 USD` (hardcoded).  
For production, replace this with a live exchange rate API call in `Cart.jsx` (`submitPayPal`).

---

## Part 4 — Deploy & Verify

### Install dependencies

```bash
cd functions
npm install
cd ..
```

### Deploy all Cloud Functions

```bash
firebase deploy --only functions
```

### Verify deployed functions

```bash
firebase functions:list
```

You should see:
- `stkPush` — M-Pesa STK push
- `mpesaCallback` — M-Pesa webhook
- `queryPaymentStatus` — STK push status query
- `paystackWebhook` — Paystack webhook
- `verifyPaystackPayment` — Paystack double-check
- `createPayPalOrder` — PayPal order creation
- `capturePayPalOrder` — PayPal order capture

---

## Part 5 — Testing

### M-Pesa Sandbox

```
Test phone: 254708374149
PIN: 1234
```

### Paystack Test Cards

```
Card: 4084 0840 8408 4081
Expiry: any future
CVV: 408
```

### PayPal Sandbox

Use a PayPal sandbox buyer account from https://developer.paypal.com/dashboard/accounts.  
Set `PAYPAL_MODE` = `sandbox` and use sandbox `Client ID` / `Secret`.
