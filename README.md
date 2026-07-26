# Ellines Haven

Kenya's premier digital literary platform — a home for original African literature.

## About

Ellines Haven is a full-stack React web application for discovering, purchasing, and reading original African stories by **Elijah Mwangi M**. Built by [Ellines Tech](https://tech.ellines.co.ke/).

## Tech Stack

- **Frontend:** React + Vite
- **Database:** Firebase Firestore (real-time)
- **Auth:** Custom auth + Firestore
- **Hosting:** Cloudflare Pages — [haven.ellines.co.ke](https://haven.ellines.co.ke) (not Vercel)
- **Functions:** Firebase Cloud Functions (payments, OTP, Resend email)
- **Payments:** M-Pesa, Paystack, PayPal

## Features

- 📚 Digital book library with online reader & PDF download
- 🛒 Cart & payment flow (M-Pesa, Airtel, Card)
- 👤 User profiles with avatar upload
- 🤖 EllineaAI — built-in AI assistant
- 🛡️ Full admin dashboard with God Mode
- ✏️ Live page editor (Firestore-backed)
- 🎨 Design Studio — live theme editor
- 🔌 Integrations hub (Google Analytics, Mailchimp, OpenAI, etc.)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy (Cloudflare Pages)

```bash
npm run build
npm run deploy:pages   # requires CLOUDFLARE_API_TOKEN + account login
```

Or push to `main` — `.github/workflows/deploy-pages.yml` builds and deploys via Wrangler.

Build settings (if using dashboard Git connect): **Build command** `npm run build`, **Output** `dist`.

## Environment

See [`.env.example`](.env.example). Frontend `VITE_*` vars go on Cloudflare Pages; Resend / notify inboxes are Firebase Functions params (same names as Ellines Tech).

---

© Ellines Haven · [tech.ellines.co.ke](https://tech.ellines.co.ke/)
