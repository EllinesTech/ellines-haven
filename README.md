# Ellines Haven

Kenya's premier digital literary platform — a home for original African literature.

## About

Ellines Haven is a full-stack React web application for discovering, purchasing, and reading original African stories by **Elijah Mwangi M**. Built by [Ellines Tech](https://ellinestech.co.ke).

## Tech Stack

- **Frontend:** React 18 + Vite
- **Database:** Firebase Firestore (real-time)
- **Auth:** Custom auth with localStorage + Firestore
- **Hosting:** Cloudflare Pages (development) — production domain TBD
- **Payments:** M-Pesa, Airtel Money, Visa/MC

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

## Environment

Firebase config is embedded in `src/firebase.js`. For production, move credentials to environment variables.

---

© 2025 Ellines Haven · [ellinestech.co.ke](https://ellinestech.co.ke)
