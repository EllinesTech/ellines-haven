import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  doc, getDoc, setDoc, addDoc, onSnapshot,
  collection, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import './EllineaAI.css';

const AI_NAME = 'Ellinea';
const AI_TAGLINE = 'Your Ellines Haven Assistant';

/* ── Context-aware responses (no API key needed — works offline too) ── */
const SITE_CONTEXT = {
  '/':         'home page — featuring new releases, featured books, and the author spotlight.',
  '/library':  'library page — browse all books by genre, search, filter.',
  '/about':    'about page — story of Ellines Haven, mission, values, and the Ellines Group.',
  '/founder':  'founder page — biography of Elijah Mwangi M, his journey, works, and expertise.',
  '/contact':  'contact page — reach the team via WhatsApp, email, or contact form.',
  '/cart':     'cart page — review selected books before purchase.',
  '/login':    'sign-in page — log into your account.',
  '/register': 'register page — create a free account.',
  '/my-library':'my library page — your purchased and unlocked books.',
  '/profile':  'profile page — manage your account details.',
  '/admin':    'admin dashboard — site management.',
};

const QUICK_REPLIES = [
  { label: '📚 Browse books',    value: 'Show me the books available' },
  { label: '💳 How to pay',      value: 'How do I pay for a book?' },
  { label: '📖 My library',      value: 'How do I access my library?' },
  { label: '✍️ About author',    value: 'Tell me about the author' },
  { label: '💬 Talk to a human', value: 'I want to talk to a human agent' },
];

/* ══════════════════════════════════════════════════════════════════════════
   ELLINEA SMART ENGINE — conversation-aware, multi-intent, book-knowledgeable
   ══════════════════════════════════════════════════════════════════════════ */

// Score how well a message matches a topic (0-100)
function score(m, patterns) {
  let s = 0;
  for (const p of patterns) {
    if (typeof p === 'string' && m.includes(p)) s += 10;
    else if (p instanceof RegExp && p.test(m)) s += 15;
  }
  return Math.min(s, 100);
}

// Fuzzy search books by any query word against title, genre, description, excerpt
function searchBooks(query, books) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return books
    .map(b => {
      const hay = `${b.title} ${b.genre} ${b.description || ''} ${b.excerpt || ''}`.toLowerCase();
      const hits = words.filter(w => hay.includes(w)).length;
      return { book: b, hits };
    })
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map(x => x.book);
}

// Format a single book as a rich card-style text
function bookCard(b, showDetails = false) {
  const status = {
    complete: '✅ Complete', ongoing: '📖 Ongoing', premium: '⭐ Premium',
    'free-preview': '👀 Free Preview', 'coming-soon': '🔜 Coming Soon',
    limited: '⏳ Limited', draft: '📝 Draft',
  }[b.status] || '';
  const canBuy = ['complete','premium','free-preview','ongoing'].includes(b.status);
  const lines = [
    `**${b.title}** — ${b.genre} · ${canBuy ? `KSh ${b.price}` : status}`,
  ];
  if (showDetails) {
    if (b.excerpt) lines.push(`_"${b.excerpt}"_`);
    if (b.pages > 0) lines.push(`${b.pages} pages · ${b.readTime || ''}`);
    if (b.rating > 0) lines.push(`⭐ ${b.rating}/5 · ${b.reviews} reviews`);
    if (b.status === 'ongoing' && b.chaptersReleased) lines.push(`📖 ${b.chaptersReleased} of ${b.totalChapters || '?'} chapters released`);
    if (b.expectedDate) lines.push(`📅 Expected: ${b.expectedDate}`);
    if (b.inspired && b.inspiredNote) lines.push(`✍️ _${b.inspiredNote}_`);
    if (canBuy) lines.push(`View at __/book/${b.id}__`);
  }
  return lines.join('\n');
}

/* ── Smart offline AI ── */
function offlineReply(msg, ctx) {
  const m    = msg.toLowerCase().trim();
  const raw  = msg.trim(); // preserve original case for display
  const books = (ctx.books || []);
  const user  = ctx.user;
  const name  = user ? user.name.split(' ')[0] : 'there';
  const history = ctx.history || [];  // recent messages for context

  // ── Pull context from conversation history ──────────────────────────────
  const prevTopics = history.slice(-4).map(h => h.text?.toLowerCase() || '').join(' ');
  const talkingAboutBook = searchBooks(prevTopics, books)[0];

  // ── INTENT SCORES ────────────────────────────────────────────────────────
  const intents = {
    greeting:     score(m, [/^(hi+|hello|hey|habari|sasa|mambo|niaje|howdy|good\s?(morning|afternoon|evening|day)|what'?s up|hola)/]),
    identity:     score(m, [/who are you/, /what (are|can) you/, /your name/, /what do you do/, /are you (a|an|real)/, /what is ellinea/, /are you ai/, /are you human/]),
    bookSearch:   score(m, ['book','novel','read','story','stories','fiction','title','have you','browse','catalogue','collection','what.*written','any books','show me']),
    specificBook: score(m, searchBooks(m, books).length > 0 ? [/.*/] : []),
    payment:      score(m, ['pay','mpesa','m-pesa','airtel','card','visa','mastercard','buy','purchase','checkout','ksh','price','cost','how much','money','stk','pin','payment']),
    mpesaSteps:   score(m, [/how.*pay/, /steps.*pay/, /how.*mpesa/, /pay.*how/, /send.*money/, /lipa/, /paybill/, /till/]),
    library:      score(m, ['my library','my books','download','read online','access my','unlock','purchased','bought','my purchases','pdf','offline read']),
    orderStatus:  score(m, [/my order/, /order status/, /did.*pay/, /payment.*confirm/, /confirm.*payment/, /book.*showing/, /not.*received/, /track.*order/]),
    account:      score(m, ['account','login','sign in','sign up','register','password','forgot','create account','log in','log out','logout','sign out']),
    author:       score(m, ['author','elijah','mwangi','founder','who wrote','who made','who created','writer','biography','bio','about elijah','about the author']),
    about:        score(m, [/about ellines/, /what is ellines/, /who.*ellines/, 'ellines haven','platform','company','ellines group','your platform']),
    recommend:    score(m, ['recommend','suggest','what should i read','best book','good book','popular','what do you suggest','pick for me','choose for me','something good']),
    genre:        score(m, ['drama','romance','mystery','historical','history','fantasy','sci-fi','adventure','short stories','thriller','fiction','horror']),
    price:        score(m, ['cheap','affordable','expensive','how much','price range','discount','offer','free book','free read','budget','costs']),
    reading:      score(m, [/how.*read/, /can i read/, /read on/, /what device/, 'mobile','phone','tablet','laptop','kindle','ipad','android','iphone']),
    refund:       score(m, ['refund','return','money back','cancel','wrong book','charged twice','double charge','overpaid']),
    contact:      score(m, ['contact','support','help me','reach you','whatsapp','email','phone number','customer care','speak to','talk to','human']),
    tech:         score(m, ['error','not working','broken','loading','slow','bug','crash','blank','white screen','page not loading','stuck','problem','issue']),
    privacy:      score(m, ['privacy','my data','personal info','data policy','gdpr','what you store','delete my data']),
    terms:        score(m, ['terms','conditions','policy','rules','legal','agreement','copyright','allowed to','can i share']),
    language:     score(m, ['language','english','swahili','kiswahili','translate','french','arabic','other language']),
    physical:     score(m, ['physical','print','hard copy','paperback','ship','deliver','courier','postal']),
    swahili:      score(m, [/^(habari|sasa|mambo|niaje|asante|karibu|tafadhali|samahani|ndiyo|hapana|pole|vitabu|ninahitaji|naweza|je,)/]),
    thanks:       score(m, [/^(thank|thanks|thx|asante|great|awesome|perfect|you.re amazing|helpful|nice one)/]),
    compare:      score(m, [/compare|vs\b|or\b.*book|which is better|difference between|which one/]),
    ongoing:      score(m, ['ongoing','chapters','released','chapter','when is next','next chapter','update','new chapter','incomplete']),
    comingSoon:   score(m, ['coming soon','upcoming','new book','next book','release date','when.*coming','not yet out','future book']),
    multiple:     score(m, [/and|also|plus|as well|another|both/]),
  };

  // ── Find top intent ──────────────────────────────────────────────────────
  const top = Object.entries(intents).sort((a,b)=>b[1]-a[1])[0];
  const topIntent = top[1] > 0 ? top[0] : null;

  // ── TALK TO HUMAN — checked first, before any book/intent matching ────────
  if (/talk(ing)? to (a |the )?(human|person|agent|support|someone|real|staff)|live chat|speak (to|with)|chat (with|to) (us|someone|agent|human|person|support)|connect me|get help from|i (need|want) (a |to )?(human|person|agent|support|talk)|customer (service|support|care)|real (person|agent|human)|transfer me|hand(off| me over)|escalate/i.test(m)) {
    return `__OPEN_LIVE_CHAT__`;
  }

  // ── SWAHILI first (before anything else) ─────────────────────────────────
  if (intents.swahili > 0) {
    return `Karibu sana! 😊 Naweza kukusaidia na:\n• 📚 Vitabu vilivyopo (${books.filter(b=>b.active!==false&&b.status!=='draft').length} vitabu)\n• 💳 Jinsi ya kulipa (M-Pesa, Airtel, Kadi)\n• 📖 Kufikia maktaba yako\n• 🔑 Akaunti yako\n\nNiambie unachohitaji! Pia unaweza kuwasiliana nasi kwa WhatsApp: **0748 255 466**`;
  }

  // ── THANKS ───────────────────────────────────────────────────────────────
  if (intents.thanks > 0 && intents.bookSearch < 10) {
    const closings = [
      `You're welcome, ${name}! 😊 Happy reading — I'm always here if you need anything. ✦`,
      `Glad I could help, ${name}! Enjoy your book. Let me know if there's anything else. ✦`,
      `Anytime, ${name}! If you ever need a recommendation or have more questions, just ask. 📚`,
    ];
    return closings[Math.floor(Math.random() * closings.length)];
  }

  // ── GREETING ─────────────────────────────────────────────────────────────
  if (intents.greeting > 0 && m.length < 30) {
    const available = books.filter(b => b.active !== false && b.status !== 'draft').length;
    return `Hello ${name}! 👋 I'm **Ellinea**, your Ellines Haven assistant.\n\nI can help you find books, sort out payments, access your library, and anything else about the platform. We have **${available} original African stories** ready to read.\n\nWhat are you looking for? 😊`;
  }

  // ── WHO AM I ─────────────────────────────────────────────────────────────
  if (intents.identity > 0) {
    const isAI = /are you (ai|human|real|robot|bot)/.test(m);
    if (isAI) return `I'm an AI assistant built specifically for Ellines Haven — not a generic chatbot. I know every book on the platform, every payment method, and how everything works.\n\nSo yes, I'm AI — but I actually know what I'm talking about here! 😄 Ask me anything about the platform.`;
    return `I'm **Ellinea** — the AI assistant for Ellines Haven! 🌟\n\nHere's what I can do:\n• 📚 Find and recommend books (I know all ${books.length} of them)\n• 💳 Walk you through M-Pesa, Airtel, or card payment step by step\n• 📖 Help you access or download books from your library\n• 🔑 Account help — register, login, reset password\n• ✍️ Tell you about Elijah Mwangi M and the platform\n• 🔧 Troubleshoot any issues you're having\n\nJust ask — I understand natural language, not just keywords. 😊`;
  }

  // ── COMPARE TWO BOOKS ─────────────────────────────────────────────────────
  if (intents.compare > 0 && intents.specificBook > 0) {
    const found = searchBooks(m, books.filter(b => b.active !== false));
    if (found.length >= 2) {
      const [a, b2] = found;
      const canBuyA = ['complete','premium','free-preview','ongoing'].includes(a.status);
      const canBuyB = ['complete','premium','free-preview','ongoing'].includes(b2.status);
      return `Here's a quick comparison:\n\n**${a.title}** (${a.genre})\n• ${canBuyA ? `KSh ${a.price}` : a.status} · ${a.pages > 0 ? `${a.pages} pages` : a.readTime || ''} · ⭐ ${a.rating}\n• _"${a.excerpt}"_\n\n**${b2.title}** (${b2.genre})\n• ${canBuyB ? `KSh ${b2.price}` : b2.status} · ${b2.pages > 0 ? `${b2.pages} pages` : b2.readTime || ''} · ⭐ ${b2.rating}\n• _"${b2.excerpt}"_\n\nBoth are by Elijah Mwangi M. Which sounds more your style? I can tell you more about either one. 📚`;
    }
  }

  // ── M-Pesa steps ──────────────────────────────────────────────────────────
  if (intents.mpesaSteps > 0) {
    return `Here's how to pay with **M-Pesa**:\n\n1. Go to __/library__ and add your book to cart\n2. Click **Checkout** → choose M-Pesa\n3. You'll get an **STK Push** on your phone immediately\n4. Enter your **M-Pesa PIN** to confirm\n5. Your book unlocks **instantly** ✅\n\nM-Pesa number: **0748 255 466** · Name: **Ellines Haven**\n\nStuck? WhatsApp us: 0748 255 466 💬`;
  }

  // ── ORDER STATUS ──────────────────────────────────────────────────────────
  if (intents.orderStatus > 0) {
    return `To check your order:\n\n1. Go to __/profile__ → **Orders** tab\n2. Or check __/my-library__ — if your book is there, it's confirmed ✅\n\nPaid but book isn't showing? Contact us **right away**:\n• 💬 **WhatsApp:** 0748 255 466 _(fastest)_\n• 📧 **Email:** ellines.haven@gmail.com\n\nHave your M-Pesa confirmation code ready — we fix payment issues same day. 📱`;
  }

  // ── SPECIFIC BOOK LOOKUP ──────────────────────────────────────────────────
  const foundBooks = searchBooks(m, books.filter(b => b.active !== false));
  if (foundBooks.length > 0 && intents.specificBook > 0) {
    const bk = foundBooks[0];
    const canBuy = ['complete','premium','free-preview','ongoing'].includes(bk.status);
    const others = foundBooks.slice(1,3);
    let resp = bookCard(bk, true);
    if (others.length) resp += `\n\n_You might also like:_\n` + others.map(o => `• **${o.title}** (${o.genre}) · ${['complete','premium','free-preview','ongoing'].includes(o.status) ? 'KSh '+o.price : o.status}`).join('\n');
    return resp;
  }

  // ── LIBRARY / ACCESS ──────────────────────────────────────────────────────
  if (intents.library > 0) {
    return `Your purchased books are in **My Library** at __/my-library__.\n\nFrom there:\n• 🌐 **Read online** — no download needed, works on any browser\n• ⬇️ **Download PDF** — read offline on any device\n• 📱 Works on phone, tablet, laptop, desktop\n\nYours forever — no subscriptions, no expiry. Buy once, keep it. 📖`;
  }

  // ── AUTHOR ────────────────────────────────────────────────────────────────
  if (intents.author > 0) {
    const written = books.filter(b => b.active !== false && b.status !== 'draft').length;
    return `**Elijah Mwangi M** is a Kenyan software engineer, AI developer, entrepreneur, and published author.\n\nHe has written **${written} original stories** on Ellines Haven — every one drawn from real life across East Africa. He doesn't write fiction for the sake of it; he writes what he's lived, seen, and heard.\n\nHe also founded:\n• 💻 **Ellines Tech** — software & AI development\n• 🪑 **Ellines Rattan Furniture** — handcrafted furniture\n\n👤 Full biography at __/founder__`;
  }

  // ── ABOUT PLATFORM ────────────────────────────────────────────────────────
  if (intents.about > 0) {
    const total = books.filter(b => b.active !== false && b.status !== 'draft').length;
    return `**Ellines Haven** is Kenya's premier digital literary platform — a home for original African stories. 🌍\n\n• **${total} titles** available — Drama, Romance, Mystery, Historical, Fantasy & more\n• Founded by Elijah Mwangi M\n• Part of the **Ellines Group** (Tech · Furniture · Haven)\n• Pay with M-Pesa, Airtel, or card — read instantly\n• Buy once, own forever — no subscriptions\n\nLearn more at __/about__`;
  }

  // ── CONTACT / SUPPORT ─────────────────────────────────────────────────────
  if (intents.contact > 0) {
    return `Here's how to reach us:\n\n• 💬 **WhatsApp:** 0748 255 466 _(fastest — we reply within the hour)_\n• 📧 **Email:** ellines.haven@gmail.com\n• 📞 **Phone:** 0748 255 466 · 0728 807 213\n• 📍 **Location:** Nairobi, Kenya\n• 🕐 **Hours:** Mon–Sat, 8am–8pm EAT\n\nFor order issues, always include your M-Pesa confirmation code. Visit __/contact__ for more options. 🤝`;
  }

  // ── ACCOUNT ───────────────────────────────────────────────────────────────
  if (intents.account > 0) {
    if (/forgot|reset|lost.*password|change.*password/.test(m)) {
      return `To reset your password:\n\n1. Go to __/login__\n2. Click **"Forgot password?"**\n3. Enter your email — you'll get a 6-digit code\n4. Enter the code → set a new password ✅\n\nStill stuck? WhatsApp **0748 255 466** — we'll reset it for you manually. 🔑`;
    }
    if (/delete|close|remove.*account/.test(m)) {
      return `To delete your account:\n\n1. Go to __/profile__ → **Account Settings**\n2. Click **Request Deletion**\n\nThere's a **30-day grace period** — you can restore it any time in that window. After 30 days it's gone permanently.\n\nWant to restore? WhatsApp 0748 255 466. 🔑`;
    }
    if (/register|sign up|create|new account/.test(m)) {
      return `Registration is **free** — takes under a minute!\n\nGo to __/register__. With an account you can:\n• 📚 Access all your purchased books forever\n• 🛒 Track your orders\n• ⬇️ Download PDFs\n• 💬 Message the team directly\n\nAlready have one? Sign in at __/login__ 😊`;
    }
    if (/sign out|log out|logout/.test(m)) {
      return `To sign out, go to __/profile__ and scroll to the bottom — you'll see the **Sign Out** button.\n\nOr just close the browser — your session stays secure either way. 🔑`;
    }
    return `To sign in, go to __/login__. New here? Create a free account at __/register__.\n\nForgot your password? Click **"Forgot password?"** on the sign-in page — it's instant. 🔑`;
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  if (/admin|dashboard|manage|panel|god mode/.test(m)) {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      return `Welcome back, **${name}**! As ${user.role === 'superadmin' ? '⚡ Super Admin' : '🛡️ Admin'} you have full site access.\n\nHead to __/admin__ to manage books, orders, users, messages, design, and more. 🚀`;
    }
    return `The admin panel is for authorised staff only. Contact us at ellines.haven@gmail.com if you need access. 🔒`;
  }

  // ── GENRE / RECOMMENDATION ────────────────────────────────────────────────
  if (intents.recommend > 0 || intents.genre > 0) {
    const genreMap = { drama:'Drama', romance:'Romance', mystery:'Mystery', history:'Historical', historical:'Historical', fantasy:'Fantasy', 'sci-fi':'Sci-Fi', adventure:'Adventure', 'short stories':'Short Stories' };
    const matchedGenre = Object.keys(genreMap).find(k => m.includes(k));
    const available = books.filter(b => b.active !== false && ['complete','premium','free-preview','ongoing'].includes(b.status));
    const pool = matchedGenre
      ? available.filter(b => b.genre?.toLowerCase().includes(genreMap[matchedGenre].toLowerCase()))
      : available.filter(b => b.featured || b.rating >= 4.7);
    const picks = pool.slice(0, 3);
    if (picks.length) {
      const list = picks.map(b => `• **${b.title}** — ${b.genre} · KSh ${b.price} · ⭐ ${b.rating}\n  _"${b.excerpt || ''}"_`).join('\n');
      return `Here are my picks${matchedGenre ? ` for **${genreMap[matchedGenre]}**` : ''}:\n\n${list}\n\nSee everything at __/library__ — filter by genre and price. 🌟`;
    }
    return `Browse our full collection at __/library__ — ${available.length} titles available, filter by genre, price, or rating. 📚`;
  }

  // ── PAYMENT (general) ─────────────────────────────────────────────────────
  if (intents.payment > 0) {
    const prices = books.filter(b=>b.price>0).map(b=>b.price).sort((a,b)=>a-b);
    const min = prices[0] || 120;
    return `We accept:\n• 📱 **M-Pesa** — STK push to your phone, enter PIN, done ✅\n• 🔴 **Airtel Money**\n• 💳 **Visa / Mastercard**\n\nPayment is instant — your book unlocks the moment it clears. Books start from **KSh ${min}**.\n\nGo to __/cart__ to checkout, or __/library__ to browse first. 💳`;
  }

  // ── PRICE RANGE ───────────────────────────────────────────────────────────
  if (intents.price > 0) {
    const prices = books.filter(b=>b.price>0).map(b=>b.price).sort((a,b)=>a-b);
    const min = prices[0] || 120, max = prices[prices.length-1] || 500;
    const cheapest = books.find(b => b.price === min);
    return `Books range from **KSh ${min}** to **KSh ${max}**.\n\nCheapest: **${cheapest?.title}** at KSh ${min}.\n\nWe keep prices fair — great literature shouldn't cost a fortune. Browse at __/library__ 💰`;
  }

  // ── READING ON DEVICE ─────────────────────────────────────────────────────
  if (intents.reading > 0) {
    return `You can read your books on:\n• 📱 **Android & iPhone** — in your browser, no app needed\n• 💻 **Laptop & Desktop** — any browser works\n• 📟 **Tablet / iPad** — perfect for reading\n\n**Two ways to read:**\n1. Online at __/my-library__ — tap a book, read immediately\n2. Download PDF — read offline, anywhere, anytime\n\nChrome or Safari work best. 📖`;
  }

  // ── ONGOING BOOKS ─────────────────────────────────────────────────────────
  if (intents.ongoing > 0) {
    const ongoing = books.filter(b => b.status === 'ongoing' && b.active !== false);
    if (ongoing.length) {
      const list = ongoing.map(b => `• **${b.title}** — ${b.chaptersReleased || '?'} of ${b.totalChapters || '?'} chapters · KSh ${b.price}`).join('\n');
      return `Currently being released in chapters:\n\n${list}\n\nBuy now and you get every chapter as it drops — no extra charge. New chapters are released regularly. 📖`;
    }
    return `Check __/library__ for the latest — filter by "Ongoing" to see what's currently being released. 📚`;
  }

  // ── COMING SOON ───────────────────────────────────────────────────────────
  if (intents.comingSoon > 0) {
    const soon = books.filter(b => b.status === 'coming-soon' && b.active !== false);
    if (soon.length) {
      const list = soon.map(b => `• **${b.title}** (${b.genre})${b.expectedDate ? ' · ' + b.expectedDate : ''}\n  _"${b.excerpt || ''}"_`).join('\n');
      return `Coming soon from Elijah Mwangi M:\n\n${list}\n\nFollow us on WhatsApp **0748 255 466** to get notified the moment these launch! 📅`;
    }
    return `Stay tuned — Elijah always has something in the works. WhatsApp **0748 255 466** to be added to our release alerts. 📅`;
  }

  // ── REFUND ────────────────────────────────────────────────────────────────
  if (intents.refund > 0) {
    return `Books are digital — once unlocked, they're instantly accessible, so we generally can't refund them.\n\n**Exceptions** (we'll always help):\n• You were charged but the book never unlocked\n• You were charged twice\n• Wrong amount deducted\n\nContact us immediately in those cases:\n• 💬 **WhatsApp:** 0748 255 466 _(fastest)_\n• 📧 **Email:** ellines.haven@gmail.com\n\nBring your M-Pesa confirmation. We sort it out the same day. 🤝`;
  }

  // ── PHYSICAL / PRINT ──────────────────────────────────────────────────────
  if (intents.physical > 0) {
    return `Ellines Haven is **digital only** — all books are online. No physical copies or delivery.\n\nOnce you buy, your book is in __/my-library__ immediately — read online or download as PDF. ⚡`;
  }

  // ── LANGUAGE ──────────────────────────────────────────────────────────────
  if (intents.language > 0) {
    return `All books are currently written in **English** — authentic Kenyan voices and East African settings throughout.\n\nSwahili editions are something Elijah is considering for the future.\n\nKwa maswali kwa Kiswahili, piga WhatsApp: **0748 255 466** 📚`;
  }

  // ── TECH ISSUES ───────────────────────────────────────────────────────────
  if (intents.tech > 0) {
    return `Let's troubleshoot:\n\n1. **Hard refresh** — Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)\n2. **Clear cache** — browser settings → clear browsing data\n3. **Try Chrome** — it works best with the platform\n4. **Check your internet** — switch to mobile data to test\n5. **Try incognito/private mode** — rules out extension conflicts\n\nStill broken? WhatsApp **0748 255 466** with:\n• Which page is broken\n• What browser you're using\n• A screenshot if possible 🔧`;
  }

  // ── PRIVACY / TERMS ───────────────────────────────────────────────────────
  if (intents.privacy > 0) {
    return `We collect: your name, email, purchase records, and messages you send us. That's it.\n\nWe **never** sell your data. Full policy at __/privacy__. 🔒`;
  }
  if (intents.terms > 0) {
    return `Key points from our terms:\n• Books are for **personal use only** — no sharing or redistribution\n• Downloaded PDFs cannot be uploaded or resold\n• Accounts that violate terms may be suspended\n\nFull terms at __/terms__ — questions? Email ellines.haven@gmail.com 📄`;
  }

  // ── BOOK LIST (general browse) ────────────────────────────────────────────
  if (intents.bookSearch > 0) {
    const available = books.filter(b => b.active !== false && b.status !== 'draft');
    const featured  = available.filter(b => b.featured).slice(0, 4);
    const list = (featured.length ? featured : available.slice(0, 4))
      .map(b => `• **${b.title}** — ${b.genre} · KSh ${b.price} · ⭐ ${b.rating}`)
      .join('\n');
    return `We have **${available.length} original African stories**. Here are some highlights:\n\n${list}\n\nBrowse everything at __/library__ — filter by genre, price, or search by title. 📚`;
  }

  // ── SMART FALLBACK — try to find a book anyway ────────────────────────────
  if (m.length > 3) {
    const fallbackBooks = searchBooks(m, books.filter(b => b.active !== false));
    if (fallbackBooks.length) {
      return `I'm not sure what you meant, but I found some books that might be relevant:\n\n` +
        fallbackBooks.slice(0,3).map(b => `• **${b.title}** — ${b.genre} · KSh ${b.price}`).join('\n') +
        `\n\nOr ask me something more specific — I know all ${books.length} books by title, genre, and story. 😊`;
    }
  }

  // ── FINAL FALLBACK ────────────────────────────────────────────────────────
  return `I'm **Ellinea**, your Ellines Haven assistant. I can help with:\n\n• 📚 **Books** — search, browse, compare, recommend\n• 💳 **Payments** — M-Pesa steps, Airtel, card\n• 📖 **Your library** — access, download, read on any device\n• 🔑 **Account** — login, register, password reset\n• ✍️ **Author** — about Elijah Mwangi M\n• 📞 **Contact** — WhatsApp 0748 255 466\n\nTry asking something like: _"What drama books do you have?"_ or _"How do I pay with M-Pesa?"_ 😊`;
}

/* ── OpenAI API call (if key configured) ── */
async function callOpenAI(messages, apiKey, model = 'gpt-4o-mini') {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages, max_tokens: 600, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error('OpenAI API error ' + res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/* ── Live-chat helpers ── */
const fmtLcTime = ts => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};
function playPing() {
  try {
    const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx2.createOscillator(), g = ctx2.createGain();
    o.connect(g); g.connect(ctx2.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx2.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.4);
    o.start(ctx2.currentTime); o.stop(ctx2.currentTime + 0.4);
  } catch {}
}

export default function EllineaAI() {
  const { user, books } = useApp();
  const location = useLocation();

  // ── Chat settings from Firestore — defer until widget is opened ─────────
  const [chatSettings, setChatSettings] = useState(null);
  const chatSettingsLoadedRef = useRef(false);
  useEffect(() => {
    if (!open || chatSettingsLoadedRef.current) return;
    chatSettingsLoadedRef.current = true;
    const unsub = onSnapshot(doc(db, 'site_data', 'chat_settings'), snap => {
      if (snap.exists()) setChatSettings(snap.data());
    }, () => {});
    return () => unsub();
  }, [open]);

  // Derived settings with fallbacks
  const widgetEnabled  = chatSettings ? chatSettings.widgetEnabled  !== false : true;
  const aiTabEnabled   = chatSettings ? chatSettings.aiTabEnabled   !== false : true;
  const liveTabEnabled = chatSettings ? chatSettings.liveTabEnabled !== false : true;
  const waTabEnabled   = chatSettings ? chatSettings.waTabEnabled   !== false : true;
  const aiDisplayName  = chatSettings?.aiName      || AI_NAME;
  const aiTagline      = chatSettings?.aiTagline   || AI_TAGLINE;
  const aiWelcome      = chatSettings?.aiWelcomeMessage ||
    `Hi! I'm **${aiDisplayName}**, your Ellines Haven assistant. Ask me anything about books, payments, your account, or the platform! 📚\n\nWant to talk to a human? Click the **💬 Live Agent** tab above.`;
  const quickReplies   = chatSettings?.quickReplies || QUICK_REPLIES;
  const waNumbers      = chatSettings?.waNumbers    || [
    { num: '254748255466', label: '0748 255 466', role: 'Primary support' },
    { num: '254728807213', label: '0728 807 213', role: 'Alternate' },
  ];
  const waEmail        = chatSettings?.waEmail         || 'ellines.haven@gmail.com';
  const waSupportHours = chatSettings?.waSupportHours  || 'Mon–Sat\n8am–8pm EAT';
  const waResponseTime = chatSettings?.waResponseTime  || 'Usually under\n1 hour';
  const liveOnlineMsg  = chatSettings?.liveOnlineMessage  || 'Agent online';
  const liveOfflineMsg = chatSettings?.liveOfflineMessage || 'Leave a message — reply within 24 hrs';

  // ── AI tab state ──────────────────────────────────────────────────────────
  const [open,     setOpen]     = useState(false);
  const [tab,      setTab]      = useState('ai'); // 'ai' | 'live' | 'wa'
  // msgs initialized with a static fallback; updated once when aiWelcome loads from Firestore
  const [msgs,        setMsgs]     = useState([
    { role: 'assistant', text: `Hi! I'm **Ellinea**, your Ellines Haven assistant. Ask me anything about books, payments, your account, or the platform! 📚\n\nWant to talk to a human? Click the 💬 Live Agent tab.` }
  ]);
  const welcomeSetRef  = useRef(false);
  const [input,    setInput]    = useState('');
  const [typing,   setTyping]   = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const [unread,   setUnread]   = useState(0);
  const bottomRef  = useRef(null);

  // Update welcome message ONCE when Firestore settings arrive and it differs from default
  useEffect(() => {
    if (welcomeSetRef.current) return;
    if (!chatSettings?.aiWelcomeMessage) return;
    welcomeSetRef.current = true;
    setMsgs([{ role: 'assistant', text: chatSettings.aiWelcomeMessage }]);
  }, [chatSettings?.aiWelcomeMessage]); // eslint-disable-line

  // ── Live-chat tab state ───────────────────────────────────────────────────
  const [chatId,        setChatId]        = useState(null);
  const [chatMessages,  setChatMessages]  = useState([]);
  const [chatDraft,     setChatDraft]     = useState('');
  const [chatSending,   setChatSending]   = useState(false);
  const [agentOnline,   setAgentOnline]   = useState(false);
  const [liveUnread,    setLiveUnread]    = useState(0);
  const chatBottomRef   = useRef(null);
  const prevLcCount     = useRef(0);
  const chatInputRef    = useRef(null);

  // Load OpenAI config from Firestore — defer until widget opens
  const aiConfigLoadedRef = useRef(false);
  useEffect(() => {
    if (!open || aiConfigLoadedRef.current) return;
    aiConfigLoadedRef.current = true;
    getDoc(doc(db, 'site_data', 'integrations')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.openai?.apiKey) setAiConfig(d.openai);
      }
    }).catch(() => {});
  }, [open]);

  // Auto-scroll AI tab
  useEffect(() => {
    if (open && tab === 'ai') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, open, tab]);

  // ── Live-chat: restore session ───────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('eh_live_chat_id');
    if (stored) setChatId(stored);
  }, []);

  // ── Live-chat: listen for external open event (from AI or nav) ───────────
  useEffect(() => {
    const handler = () => { setOpen(true); setTab('live'); setLiveUnread(0); };
    window.addEventListener('ellines-open-livechat', handler);
    return () => window.removeEventListener('ellines-open-livechat', handler);
  }, []);

  // ── Live-chat: agent online status — only listen once widget opens ────────
  const agentStatusLoadedRef = useRef(false);
  useEffect(() => {
    if (!open || agentStatusLoadedRef.current) return;
    agentStatusLoadedRef.current = true;
    const unsub = onSnapshot(doc(db, 'site_data', 'agent_status'), snap => {
      setAgentOnline(snap.exists() ? !!snap.data()?.online : false);
    }, () => {});
    return () => unsub();
  }, [open]);

  // ── Live-chat: messages listener ─────────────────────────────────────────
  useEffect(() => {
    if (!chatId) return;
    // No orderBy — sort client-side to avoid subcollection index requirement
    const unsub = onSnapshot(
      collection(db, 'contact_messages', chatId, 'messages'),
      snap => {
        const lcMsgs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const tb = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return ta - tb;
          });
        const newAdminMsgs = lcMsgs.filter(m => m.sender === 'admin').length;
        if (!(open && tab === 'live') && newAdminMsgs > prevLcCount.current) {
          const added = newAdminMsgs - prevLcCount.current;
          setLiveUnread(u => u + added);
          if (lcMsgs.length > prevLcCount.current) playPing();
        }
        prevLcCount.current = newAdminMsgs;
        setChatMessages(lcMsgs);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      () => {}
    );
    return () => unsub();
  }, [chatId, open, tab]);

  // ── Live-chat: clear unread when tab is active ────────────────────────────
  useEffect(() => {
    if (open && tab === 'live') setLiveUnread(0);
  }, [open, tab]);

  // ── Live-chat: auto-start session when switching to live tab ─────────────
  useEffect(() => {
    if (!open || tab !== 'live') return;
    const stored = localStorage.getItem('eh_live_chat_id');
    if (stored || chatId) return;
    (async () => {
      const email = user?.email || 'guest@unknown.com';
      const name  = user?.name  || 'Guest';
      const newId = 'chat_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now();
      await setDoc(doc(db, 'contact_messages', newId), {
        name, email: email.toLowerCase(), userId: user?.id || '',
        subject: 'Live Chat', message: '', type: 'live_chat', status: 'new',
        threadId: newId, createdAt: serverTimestamp(), lastMsg: '',
        lastMsgAt: serverTimestamp(), lastSender: 'user', userRead: true, agentOnline: false,
      });
      setChatId(newId);
      localStorage.setItem('eh_live_chat_id', newId);
      await addDoc(collection(db, 'contact_messages', newId, 'messages'), {
        text: `👋 Hi ${name}! You're now connected. An agent will be with you shortly.`,
        sender: 'system', senderName: 'Ellines Haven', createdAt: serverTimestamp(),
      });
    })();
  }, [open, tab]); // eslint-disable-line

  const ctx = {
    page: SITE_CONTEXT[location.pathname] || location.pathname,
    books: books || [],
    user,
    history: msgs.filter(m => m.role === 'user').slice(-4),
  };

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', text: msg }]);
    setTyping(true);

    let reply = '';
    try {
      if (aiConfig?.apiKey) {
        // Build system prompt with site context
        const bookList = (ctx.books || []).filter(b => b.active !== false && b.status !== 'draft')
          .map(b => `"${b.title}" (${b.genre}, KSh ${b.price})`).join(', ');
        const systemPrompt = `You are ${AI_NAME}, a warm, knowledgeable, and helpful AI assistant for Ellines Haven — Kenya's premier digital literary platform founded by Elijah Mwangi M. You help readers discover books, handle M-Pesa/Airtel/card payments, manage accounts, and learn about the platform.

Current page: ${ctx.page}
Available books: ${bookList || 'Check /library for full catalogue'}
User: ${ctx.user ? ctx.user.name + ' (' + (ctx.user.role || 'user') + ')' : 'Guest'}

Key facts:
- Payment: M-Pesa STK push to 0748255466, Airtel Money, Visa/Mastercard. Books unlock instantly after payment.
- Books range KSh 120–500. No subscriptions — buy once, own forever.
- Support: WhatsApp 0748 255 466 (fastest), Email ellines.haven@gmail.com, Mon–Sat 8am–8pm EAT
- My Library at /my-library for purchased books (read online or download PDF)
- Register free at /register, sign in at /login, forgot password via "Forgot password?" link
- Author: Elijah Mwangi M — Kenyan software engineer, AI developer, author

Rules:
- Keep responses concise, warm, and practical. Max 150 words unless a complex question needs more.
- Use simple markdown for formatting (**bold**, bullet points with •).
- Use __/route__ for internal links (e.g., __/library__, __/login__).
- If you don't know something specific about Ellines Haven, say so and direct to WhatsApp support.
- Never make up book titles or prices — only mention books from the list above.
- Be conversational and friendly, like a knowledgeable friend — not a corporate bot.`;
        const history = msgs.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
        reply = await callOpenAI([{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: msg }], aiConfig.apiKey, aiConfig.model);
      } else {
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
        reply = offlineReply(msg, ctx);
      }
    } catch (e) {
      reply = `Sorry, I hit a snag: ${e.message}. Try again or contact support at ellines.haven@gmail.com 😊`;
    }

    setTyping(false);

    // Special signal: switch to live-agent tab
    if (reply === '__OPEN_LIVE_CHAT__') {
      setMsgs(prev => [...prev, {
        role: 'assistant',
        text: `Sure! Switching you to the **💬 Live Agent** tab now.\n\nOur team is available **Mon–Sat, 8am–8pm EAT**. Type your message and we'll reply as soon as possible.`,
      }]);
      setTimeout(() => setTab('live'), 900);
      return;
    }

    setMsgs(prev => [...prev, { role: 'assistant', text: reply }]);
    if (!open) setUnread(u => u + 1);
  };

  const clearChat = () => setMsgs([{ role: 'assistant', text: `Hi again! I'm **${aiDisplayName}**, ready to help. What can I do for you? 😊\n\nWant a human? Click the **💬 Live Agent** tab.` }]);

  // ── Live-chat send ────────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatDraft.trim() || chatSending) return;
    setChatSending(true);
    let id = chatId;
    if (!id) {
      const email = user?.email || 'guest@unknown.com';
      const name  = user?.name  || 'Guest';
      id = 'chat_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now();
      await setDoc(doc(db, 'contact_messages', id), {
        name, email: email.toLowerCase(), userId: user?.id || '',
        subject: 'Live Chat', message: chatDraft.trim().slice(0, 100), type: 'live_chat',
        status: 'new', threadId: id, createdAt: serverTimestamp(),
        lastMsg: chatDraft.trim().slice(0, 80), lastMsgAt: serverTimestamp(),
        lastSender: 'user', userRead: true,
      });
      setChatId(id);
      localStorage.setItem('eh_live_chat_id', id);
    }
    await addDoc(collection(db, 'contact_messages', id, 'messages'), {
      text: chatDraft.trim(), sender: 'user',
      senderName: user?.name || 'Guest', senderEmail: (user?.email || '').toLowerCase(),
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'contact_messages', id), {
      lastMsg: chatDraft.trim().slice(0, 80), lastMsgAt: serverTimestamp(),
      lastSender: 'user', userRead: true, status: 'new',
    }, { merge: true });
    setChatDraft('');
    setChatSending(false);
    chatInputRef.current?.focus();
  };

  const resetLiveChat = () => {
    localStorage.removeItem('eh_live_chat_id');
    setChatId(null);
    setChatMessages([]);
    setChatDraft('');
    prevLcCount.current = 0;
  };

  const renderText = (text) => {
    // Convert **bold**, __/route__ internal links, plain URLs, and newlines
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(\/[^_]+)__/g, '<a href="$1" class="ellinea-link" data-navlink="true">$1</a>')
      .replace(/\[(.*?)\]\((\/[^)]+)\)/g, '<a href="$2" class="ellinea-link" data-navlink="true">$1</a>')
      .replace(/\[(.*?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="ellinea-link">$1</a>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  /* Handle clicks on internal links inside bubble */
  const handleBubbleClick = (e) => {
    const a = e.target.closest('a[data-navlink]');
    if (a) {
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href) {
        setOpen(false);
        window.location.href = href; // simple navigation — avoids router context issues
      }
    }
  };

  // Don't show on admin page, and respect admin widget toggle
  if (location.pathname === '/admin') return null;
  // Only hide widget if settings have loaded AND explicitly disabled
  if (chatSettings !== null && widgetEnabled === false) return null;

  const totalUnread = unread + liveUnread;

  return (
    <>
      {/* ── Single FAB ── */}
      <button
        className="ellinea-fab"
        onClick={() => { setOpen(o => !o); setUnread(0); if (tab === 'live') setLiveUnread(0); }}
        aria-label="Chat with Ellines Haven"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
        {!open && totalUnread > 0 && <span className="ellinea-fab-badge">{totalUnread > 9 ? '9+' : totalUnread}</span>}
        {!open && <span className="ellinea-fab-label">{aiDisplayName}</span>}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div className="ellinea-window">
          {/* Tab bar — Ellinea AI | Live Agent | WhatsApp */}
          <div className="ellinea-tabs">
            {aiTabEnabled && (
              <button
                className={'ellinea-tab' + (tab === 'ai' ? ' ellinea-tab--active' : '')}
                onClick={() => { setTab('ai'); setUnread(0); }}
              >
                ✦ {aiDisplayName}
                {unread > 0 && tab !== 'ai' && <span className="ellinea-tab-badge">{unread}</span>}
              </button>
            )}
            {liveTabEnabled && (
              <button
                className={'ellinea-tab' + (tab === 'live' ? ' ellinea-tab--active ellinea-tab--live' : '')}
                onClick={() => { setTab('live'); setLiveUnread(0); }}
              >
                💬 Live Agent
                {liveUnread > 0 && tab !== 'live' && <span className="ellinea-tab-badge">{liveUnread}</span>}
                <span className={'ellinea-agent-dot' + (agentOnline ? ' ellinea-agent-dot--on' : '')} title={agentOnline ? liveOnlineMsg : liveOfflineMsg} />
              </button>
            )}
            {waTabEnabled && (
              <button
                className={'ellinea-tab ellinea-tab--wa' + (tab === 'wa' ? ' ellinea-tab--active ellinea-tab--wa-active' : '')}
                onClick={() => setTab('wa')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
            )}
          </div>

          {/* ── AI TAB ── */}
          {tab === 'ai' && aiTabEnabled && (
            <>
              <div className="ellinea-header">
                <div className="ellinea-avatar">✦</div>
                <div>
                  <div className="ellinea-name">{aiDisplayName}</div>
                  <div className="ellinea-status">
                    <span className="ellinea-dot" />
                    {aiConfig?.apiKey ? 'GPT-powered · Online' : aiTagline}
                  </div>
                </div>
                <div className="ellinea-header-actions">
                  <button onClick={clearChat} title="Clear chat">🗑️</button>
                  <button onClick={() => setOpen(false)} title="Close">✕</button>
                </div>
              </div>
              <div className="ellinea-messages" onClick={handleBubbleClick}>
                {msgs.map((m, i) => (
                  <div key={i} className={`ellinea-msg ellinea-msg--${m.role}`}>
                    {m.role === 'assistant' && <div className="ellinea-msg-avatar">✦</div>}
                    <div className="ellinea-msg-bubble" dangerouslySetInnerHTML={{ __html: renderText(m.text) }} />
                  </div>
                ))}
                {typing && (
                  <div className="ellinea-msg ellinea-msg--assistant">
                    <div className="ellinea-msg-avatar">✦</div>
                    <div className="ellinea-typing"><span/><span/><span/></div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              {msgs.length <= 2 && quickReplies.length > 0 && (
                <div className="ellinea-quickreplies">
                  {quickReplies.map((q, i) => (
                    <button key={i} className="ellinea-qr" onClick={() => send(q.value)}>{q.label}</button>
                  ))}
                </div>
              )}
              <div className="ellinea-input-row">
                <input
                  className="ellinea-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask me anything…"
                  disabled={typing}
                />
                <button className="ellinea-send" onClick={() => send()} disabled={typing || !input.trim()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div className="ellinea-footer">
                Powered by <strong>{aiDisplayName}</strong> · Ellines Haven AI
              </div>
            </>
          )}

          {/* ── LIVE AGENT TAB ── */}
          {tab === 'live' && liveTabEnabled && (
            <>
              <div className="ellinea-lc-header">
                <div style={{ width:34, height:34, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>💬</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, color:'#fff', fontSize:'0.9rem' }}>Ellines Haven Support</div>
                  <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.75)', display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background: agentOnline ? '#2ecc71' : 'rgba(255,255,255,0.35)', flexShrink:0, display:'inline-block' }}/>
                    {agentOnline ? liveOnlineMsg : liveOfflineMsg}
                  </div>
                </div>
                <button onClick={resetLiveChat} title="New chat" style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:'0.68rem', fontFamily:'inherit' }}>New</button>
                <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:'1.1rem', padding:'0 2px', lineHeight:1 }}>✕</button>
              </div>
              <div className="ellinea-lc-messages">
                {chatMessages.length === 0 && (
                  <div style={{ textAlign:'center', padding:'24px 12px', color:'rgba(255,255,255,0.45)', fontSize:'0.8rem' }}>
                    <div style={{ fontSize:'1.8rem', marginBottom:8 }}>👋</div>
                    <p style={{ marginBottom:6 }}>Hi{user?.name ? ` ${user.name.split(' ')[0]}` : ''}! How can we help you today?</p>
                    <p style={{ fontSize:'0.7rem' }}>Type a message below — an agent will reply shortly.</p>
                  </div>
                )}
                {chatMessages.map(msg => {
                  const isUser   = msg.sender === 'user';
                  const isSystem = msg.sender === 'system';
                  if (isSystem) return (
                    <div key={msg.id} style={{ textAlign:'center', fontSize:'0.7rem', color:'rgba(255,255,255,0.4)', padding:'3px 8px', background:'rgba(255,255,255,0.04)', borderRadius:20, margin:'0 auto', maxWidth:'80%' }}>{msg.text}</div>
                  );
                  return (
                    <div key={msg.id} style={{ display:'flex', flexDirection:'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth:'80%', padding:'8px 12px', borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isUser ? 'linear-gradient(135deg,#6c63ff,#4a9eff)' : 'rgba(255,255,255,0.08)', color:'#fff', fontSize:'0.85rem', lineHeight:1.5, wordBreak:'break-word', whiteSpace:'pre-wrap' }}>{msg.text}</div>
                      <span style={{ fontSize:'0.63rem', color:'rgba(255,255,255,0.35)', marginTop:2, paddingInline:4 }}>{isUser ? 'You' : '🛡️ Agent'} · {fmtLcTime(msg.createdAt)}</span>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', padding:'8px 10px', display:'flex', gap:7, flexShrink:0, background:'rgba(0,0,0,0.15)' }}>
                <textarea ref={chatInputRef} rows={1} value={chatDraft} onChange={e => setChatDraft(e.target.value)} onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();} }} placeholder="Type a message…" style={{ flex:1, resize:'none', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, color:'#fff', padding:'7px 11px', fontSize:'0.85rem', fontFamily:'inherit', outline:'none', maxHeight:70, overflowY:'auto' }} />
                <button onClick={sendChat} disabled={chatSending||!chatDraft.trim()} style={{ flexShrink:0, width:36, height:36, borderRadius:'50%', background:chatDraft.trim()?'linear-gradient(135deg,#6c63ff,#4a9eff)':'rgba(255,255,255,0.08)', border:'none', color:'#fff', cursor:chatDraft.trim()?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s', alignSelf:'flex-end' }} aria-label="Send">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div style={{ textAlign:'center', fontSize:'0.6rem', color:'rgba(255,255,255,0.25)', padding:'4px 8px 6px', flexShrink:0, background:'rgba(0,0,0,0.1)' }}>Ellines Haven · Mon–Sat 8am–8pm EAT</div>
            </>
          )}
          {/* ── WHATSAPP TAB ── */}
          {tab === 'wa' && waTabEnabled && (
            <>
              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, #128C7E, #25D366)',
                padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem', lineHeight: 1.2 }}>Ellines Haven</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.85)', display:'flex', alignItems:'center', gap: 5 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:'#fff', opacity:0.9, flexShrink:0, display:'inline-block' }}/>
                    WhatsApp Support
                  </div>
                </div>
                <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:'1.1rem', padding:'0 2px', lineHeight:1 }}>✕</button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display:'flex', flexDirection:'column', gap: 14 }}>
                {/* Greeting bubble */}
                <div style={{ display:'flex', gap: 10, alignItems:'flex-start' }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#128C7E,#25D366)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:'4px 14px 14px 14px', padding:'10px 14px', fontSize:'0.85rem', lineHeight:1.6, color:'#f0ece2', maxWidth:'85%' }}>
                    Hi{user?.name ? ` ${user.name.split(' ')[0]}` : ''}! 👋 Chat with us on WhatsApp for the <strong style={{ color:'#25D366' }}>fastest support</strong>. We typically reply within minutes.
                  </div>
                </div>

                {/* Info cards */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, margin:'4px 0' }}>
                  {[
                    { icon:'🕐', label:'Hours',    value: waSupportHours },
                    { icon:'⚡', label:'Response', value: waResponseTime },
                    { icon:'💳', label:'Help with', value:'Payments &\norders' },
                    { icon:'📚', label:'Books',    value:'All titles &\ndownloads' },
                  ].map(c => (
                    <div key={c.label} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:'1.2rem', marginBottom:4 }}>{c.icon}</div>
                      <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.45)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>{c.label}</div>
                      <div style={{ fontSize:'0.76rem', color:'#f0ece2', lineHeight:1.4, whiteSpace:'pre-line' }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* Phone numbers */}
                <div style={{ background:'rgba(37,211,102,0.06)', border:'1px solid rgba(37,211,102,0.2)', borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.5)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Contact Numbers</div>
                  {waNumbers.map((p, idx) => (
                    <a key={idx} href={`https://wa.me/${p.num}`} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.3)', borderRadius:10, textDecoration:'none', marginBottom: idx < waNumbers.length - 1 ? 8 : 0, transition:'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(37,211,102,0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(37,211,102,0.1)'}
                    >
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'#25D366', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize:'0.88rem', fontWeight:700, color:'#25D366' }}>{p.label}</div>
                        <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.5)' }}>{p.role}</div>
                      </div>
                      <div style={{ marginLeft:'auto', fontSize:'0.75rem', color:'rgba(37,211,102,0.8)' }}>Chat →</div>
                    </a>
                  ))}
                </div>

                {/* Email */}
                <a href={`mailto:${waEmail}`}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', background:'rgba(74,158,255,0.08)', border:'1px solid rgba(74,158,255,0.2)', borderRadius:10, textDecoration:'none', transition:'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(74,158,255,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(74,158,255,0.08)'}
                >
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(74,158,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>📧</div>
                  <div>
                    <div style={{ fontSize:'0.82rem', fontWeight:600, color:'#7eb6ff' }}>{waEmail}</div>
                    <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.45)' }}>Email support — reply within 24 hrs</div>
                  </div>
                </a>
              </div>

              {/* Footer */}
              <div style={{ textAlign:'center', fontSize:'0.62rem', color:'rgba(255,255,255,0.25)', padding:'6px 8px 8px', flexShrink:0, background:'rgba(0,0,0,0.15)' }}>
                Ellines Haven · Nairobi, Kenya
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
