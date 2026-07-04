import { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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

export default function EllineaAI() {
  const { user, books } = useApp();
  const location = useLocation();
  const [open,     setOpen]     = useState(false);
  const [msgs,     setMsgs]     = useState([
    { role: 'assistant', text: `Hi! I'm **${AI_NAME}**, your Ellines Haven assistant. Ask me anything about books, payments, your account, or the platform! 📚` }
  ]);
  const [input,    setInput]    = useState('');
  const [typing,   setTyping]   = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const [unread,   setUnread]   = useState(0);
  const bottomRef = useRef(null);

  // Load OpenAI config from Firestore
  useEffect(() => {
    getDoc(doc(db, 'site_data', 'integrations')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.openai?.apiKey) setAiConfig(d.openai);
      }
    }).catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, open]);

  // Track unread when closed
  useEffect(() => {
    if (!open) setUnread(u => u + 0); // reset on open
  }, [open]);

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

    // Special signal: open live chat widget
    if (reply === '__OPEN_LIVE_CHAT__') {
      setMsgs(prev => [...prev, {
        role: 'assistant',
        text: `Sure! Connecting you to a live agent now. 💬\n\nOur team is available **Mon–Sat, 8am–8pm EAT**. Type your message and we'll reply as soon as possible.`,
      }]);
      setTimeout(() => {
        setOpen(false);
        window.dispatchEvent(new CustomEvent('ellines-open-livechat'));
      }, 1200);
      return;
    }

    setMsgs(prev => [...prev, { role: 'assistant', text: reply }]);
    if (!open) setUnread(u => u + 1);
  };

  const clearChat = () => setMsgs([{ role: 'assistant', text: `Hi again! I'm **${AI_NAME}**, ready to help. What can I do for you? 😊` }]);

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

  // Don't show on admin page
  if (location.pathname === '/admin') return null;

  return (
    <>
      {/* ── Floating toggle button ── */}
      <button className="ellinea-fab" onClick={() => { setOpen(o => !o); setUnread(0); }} aria-label="EllineaAI">
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
        {!open && unread > 0 && <span className="ellinea-fab-badge">{unread}</span>}
        {!open && <span className="ellinea-fab-label">{AI_NAME}</span>}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div className="ellinea-window">
          {/* Header */}
          <div className="ellinea-header">
            <div className="ellinea-avatar">✦</div>
            <div>
              <div className="ellinea-name">{AI_NAME}</div>
              <div className="ellinea-status">
                <span className="ellinea-dot" />
                {aiConfig?.apiKey ? 'GPT-powered · Online' : 'Always available'}
              </div>
            </div>
            <div className="ellinea-header-actions">
              <button onClick={clearChat} title="Clear chat">🗑️</button>
              <button onClick={() => setOpen(false)} title="Close">✕</button>
            </div>
          </div>

          {/* Messages */}
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

          {/* Quick replies */}
          {msgs.length <= 2 && (
            <div className="ellinea-quickreplies">
              {QUICK_REPLIES.map((q, i) => (
                <button key={i} className="ellinea-qr" onClick={() => send(q.value)}>{q.label}</button>
              ))}
            </div>
          )}

          {/* Input */}
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
            Powered by <strong>Ellinea</strong> · Ellines Haven AI
            {!aiConfig?.apiKey && <span style={{color:'rgba(255,255,255,0.35)'}}> · Connect OpenAI for GPT</span>}
          </div>
        </div>
      )}
    </>
  );
}
