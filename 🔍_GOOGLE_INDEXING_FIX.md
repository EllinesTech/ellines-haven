# 🔍 Google Visibility — Ellines Haven

**Domain:** https://haven.ellines.co.ke  
**Manage Google as:** `ellines.haven@gmail.com` (do **not** put this Gmail on the public site)  
**Public contact:** haven@ellines.co.ke / info@ellines.co.ke  

---

## ✅ In-repo (code) status

- Sitemap: `/sitemap.xml` → https://haven.ellines.co.ke/sitemap.xml  
- Robots: allows crawlers; disallows `/login`, `/register`, `/my-library`, `/admin`, etc.  
- GSC HTML file: `public/google17caeb8194dadb8a.html`  
- Pretty-URL fix: `pages-functions/_middleware.js` serves that file at **200** (no 308)  
- Meta-tag slot: commented in `index.html` — paste token if you prefer HTML-tag verification  
- LocalBusiness schema: Nairobi locality only (no fake street); hours Mon–Sat 08:00–20:00 (matches Contact)  
- Sitelinks schema: public pages only (no login/register/my-library)

---

## 📋 Manual steps — Google Search Console

Log in as **ellines.haven@gmail.com**, then:

1. Open https://search.google.com/search-console  
2. **Add property** → choose **URL prefix** → enter `https://haven.ellines.co.ke`  
3. **Verify ownership** — preferred order:
   - **HTML file** (already on site): Google fetches  
     `https://haven.ellines.co.ke/google17caeb8194dadb8a.html`  
     After the latest deploy, that URL must return **200** (not 308) with body starting  
     `google-site-verification: google17caeb8194dadb8a.html`  
   - **HTML tag** (backup): GSC shows a meta tag → uncomment the slot in `index.html`, paste the `content=` value, redeploy, then Verify  
   - **DNS TXT** (optional): add the TXT record at your DNS host for `ellines.co.ke`  
4. After verified → left nav **Sitemaps** → submit:  
   `https://haven.ellines.co.ke/sitemap.xml`  
5. **URL Inspection** → request indexing for:
   - `https://haven.ellines.co.ke/`
   - `https://haven.ellines.co.ke/library`
   - `https://haven.ellines.co.ke/founder`
   - `https://haven.ellines.co.ke/about`
   - `https://haven.ellines.co.ke/contact`
   - Key book URLs from the sitemap (e.g. Marriage Is a Scam, Pain)
6. Check progress: Google search `site:haven.ellines.co.ke` (often 24–72 hours)

---

## 🗺️ Google Business Profile — skip for now?

**Skip GBP / Maps** unless you have a **real public street address** customers can visit.  
The site only states “Nairobi, Kenya” — no street. Creating a Maps listing without a real address risks rejection or a misleading pin.  
Focus on **Search Console + organic Search** until you have a verifiable premises.

---

## 🔧 What Was Wrong Before (cache / indexing)

Your site **was NOT appearing in Google** partly because of a critical cache header issue (`no-store` on HTML blocked indexing).  
`public/_headers` now allows public caching with revalidation so Googlebot can index.

---

## 📊 What Gets Indexed

✅ **Core public pages:** `/`, `/library`, `/about`, `/founder`, `/contact`, `/faq`, `/terms`, `/privacy`  
❌ **Not for sitelinks / not in sitemap:** `/login`, `/register`, `/my-library` (robots Disallow)

✅ Book pages listed in `public/sitemap.xml`  
✅ Pre-rendered HTML, JSON-LD, Open Graph, sitemap, robots

---

## 🔎 Quick checks

```bash
curl.exe -sI https://haven.ellines.co.ke/google17caeb8194dadb8a.html
# Expect: HTTP/1.1 200  (not 308)

curl.exe -s https://haven.ellines.co.ke/google17caeb8194dadb8a.html
# Expect: google-site-verification: google17caeb8194dadb8a.html

curl.exe -sI https://haven.ellines.co.ke/sitemap.xml
curl.exe -sI https://haven.ellines.co.ke/robots.txt
```

**Deploy (from repo root):** `npm run deploy:pages`  
(Requires Wrangler logged in to the Cloudflare account that owns `ellines-haven`.)

---

**Manage account:** ellines.haven@gmail.com  
**Public emails only:** haven@ellines.co.ke / info@ellines.co.ke  
