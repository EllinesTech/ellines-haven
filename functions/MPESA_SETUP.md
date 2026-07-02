# M-Pesa Daraja Setup Guide

## 1. Get Daraja API Credentials

1. Go to https://developer.safaricom.co.ke
2. Create an account and log in
3. Go to **My Apps** → Create a new app
4. Enable **Lipa Na M-Pesa Online** (STK Push)
5. Copy your **Consumer Key** and **Consumer Secret**
6. Get your **Shortcode** and **Passkey** from the M-Pesa portal
   - For sandbox: shortcode = `174379`, passkey is provided on the test page
   - For production: use your actual business shortcode

## 2. Set Firebase Secrets

Run these commands in the `ellines-haven/` root folder:

```bash
firebase functions:secrets:set MPESA_CONSUMER_KEY
firebase functions:secrets:set MPESA_CONSUMER_SECRET
firebase functions:secrets:set MPESA_SHORTCODE
firebase functions:secrets:set MPESA_PASSKEY
firebase functions:secrets:set MPESA_CALLBACK_URL
firebase functions:secrets:set MPESA_ENV
```

When prompted, enter the values:
- `MPESA_CONSUMER_KEY`    → your Daraja consumer key
- `MPESA_CONSUMER_SECRET` → your Daraja consumer secret
- `MPESA_SHORTCODE`       → your till/paybill number (e.g. `174379` for sandbox)
- `MPESA_PASSKEY`         → your Lipa Na M-Pesa passkey
- `MPESA_CALLBACK_URL`    → `https://us-central1-ellines-haven-web.cloudfunctions.net/mpesaCallback`
- `MPESA_ENV`             → `production` (or `sandbox` for testing)

## 3. Install Functions Dependencies

```bash
cd functions
npm install
cd ..
```

## 4. Deploy Functions

```bash
firebase deploy --only functions
```

## 5. Register Callback URL with Safaricom

In the Daraja portal, register your callback URL:
```
https://us-central1-ellines-haven-web.cloudfunctions.net/mpesaCallback
```

This URL must be HTTPS and publicly accessible — Firebase Functions are already HTTPS.

## 6. Test (Sandbox)

Use sandbox credentials and test phone number `254708374149` with PIN `1234`.

## How it Works

1. Customer enters phone number on checkout
2. Frontend calls `stkPush` Cloud Function
3. Function requests M-Pesa STK push via Daraja API
4. Customer's phone shows payment prompt → they enter PIN
5. Safaricom calls `mpesaCallback` function with result
6. If success: function marks order `Completed` + writes books to user's Firestore library
7. Frontend's real-time Firestore listener detects the status change → redirects to library instantly

## Transaction Types

The current setup uses `CustomerPayBillOnline` (Paybill). If you use a **Till number**
(Buy Goods), change `TransactionType` in `functions/index.js` to `CustomerBuyGoodsOnline`.
