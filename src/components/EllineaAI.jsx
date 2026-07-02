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
  { label: '📚 Browse books', value: 'Show me the books available' },
  { label: '💳 How to pay',   value: 'How do I pay for a book?' },
  { label: '📖 My library',   value: 'How do I access my library?' },
  { label: '✍️ About author', value: 'Tell me about the author' },
  { label: '🆘 Get help',     value: 'I need help with my account' },
];

/* ── Smart offline AI (rule-based with personality) ── */
function offlineReply(msg, ctx) {
  const m = msg.toLowerCase().trim();
  const books = ctx.books || [];
  const user  = ctx.user;
  const name  = user ? user.name.split(' ')[0] : 'there';

  // Greetings
  if (/^(hi+|hello|hey|habari|sasa|mambo|niaje|sup|howdy|good\s?(morning|afternoon|evening))/.test(m)) {
    return `Hello ${name}! 👋 I'm **Ellinea**, your Ellines Haven assistant — here to help with books, payments, your account, and anything about the platform. What can I do for you today?`;
  }

  // Who are you / what can you do
  if (/who are you|what (are|can) you|your name|what do you do|help me|what is ellinea/.test(m)) {
    return `I'm **Ellinea** — the AI assistant for Ellines Haven! 🌟\n\nI can help you:\n• 📚 Find and recommend books\n• 💳 Explain payment methods (M-Pesa, Airtel, Card)\n• 📖 Access your library\n• 🔑 Manage your account\n• ✍️ Learn about author Elijah Mwangi M\n• 🏢 Understand Ellines Haven\n\nJust ask me anything!`;
  }

  // Order status / tracking
  if (/order|payment.*status|did.*pay|confirm.*payment|my.*order|track.*order|order.*confirm/.test(m)) {
    return `To check your order status:\n\n1. Go to __/profile__ → **Orders** tab\n2. Or check __/my-library__ — if your book appears there, the order was confirmed ✅\n\nIf you paid but your book isn't showing, please contact us:\n• 💬 **WhatsApp:** 0748 255 466 _(fastest — we respond within the hour)_\n• 📧 **Email:** ellines.haven@gmail.com\n\nAlways include your M-Pesa confirmation message when contacting us. 📱`;
  }

  // M-Pesa instructions
  if (/how.*pay|mpesa.*how|pay.*mpesa|steps.*pay|send.*money|lipa.*namba|m-pesa.*number|paybill|till number/.test(m)) {
    return `Here's how to pay with **M-Pesa**:\n\n1. Add the book to your cart at __/library__\n2. Proceed to checkout\n3. You'll get an STK Push directly to your phone\n4. Enter your M-Pesa PIN to confirm\n5. Your book unlocks **instantly** after payment ✅\n\nM-Pesa number: **0748 255 466** · Registered to: **Ellines Haven**\n\nNeed help? WhatsApp us: 0748 255 466 💬`;
  }

  // Books — list or search
  if (/book|novel|read|story|fiction|title|what.*have|browse|catalogue|collection/.test(m)) {
    const available = books.filter(b => b.active !== false && b.status !== 'draft');
    const featured  = available.filter(b => b.featured).slice(0, 3);
    const list      = (featured.length ? featured : available.slice(0, 4)).map(b => `• **${b.title}** — ${b.genre} · KSh ${b.price}`).join('\n');
    return `We have ${available.length} original African stories! Here are some highlights:\n\n${list}\n\nBrowse the full library at __/library__ — filter by genre, price, or search by title. 📚`;
  }

  // Specific book search by title keywords
  const bookKeywords = ['marriage','pain','nairobi','savanna','mombasa','sunsets','ghost','acacia','chapter','thunder','19 days','nineteen days','chasing'];
  if (bookKeywords.some(k => m.includes(k))) {
    const word = bookKeywords.find(k => m.includes(k)) || '';
    const found = books.filter(b =>
      b.title?.toLowerCase().includes(word) ||
      b.genre?.toLowerCase().includes(word) ||
      b.description?.toLowerCase().includes(word)
    );
    if (found.length) {
      return `I found: **${found[0].title}** — ${found[0].genre} · KSh ${found[0].price}\n\n${found[0].excerpt || found[0].description || ''}\n\nView it at __/book/${found[0].id}__ 📚`;
    }
  }

  // Payment / price
  if (/pay|mpesa|m-pesa|airtel|card|visa|price|cost|ksh|buy|purchase|how much|checkout/.test(m)) {
    return `We accept:\n• 📱 **M-Pesa** (STK push — fastest, most popular)\n• 🔴 **Airtel Money**\n• 💳 **Visa / Mastercard**\n\nAfter payment clears, your book unlocks **instantly**. Books start from **KSh 120**.\n\nGo to your cart at __/cart__ to complete a purchase. 💳`;
  }

  // Library / access / download
  if (/library|my book|download|read online|access|unlock|own|purchased|bought|pdf/.test(m)) {
    return `Your purchased books live in **My Library** at __/my-library__. You can:\n• 📱 Read online directly in the browser\n• ⬇️ Download the PDF for offline reading\n\nYour library is yours **forever** — no subscriptions, no expiry dates. Once you buy, you keep it. 📖`;
  }

  // Author / founder info
  if (/author|elijah|mwangi|founder|wrote|writer|who wrote|created by|biography|bio/.test(m)) {
    return `All books on Ellines Haven are written by **Elijah Mwangi M** — a Kenyan software engineer, AI developer, entrepreneur, and published author.\n\nHe founded:\n• ✍️ **Ellines Haven** — digital literary platform\n• 💻 **Ellines Tech** — technology services\n• 🪑 **Ellines Rattan Furniture** — handcrafted furniture\n\nEvery story draws from real life across East Africa.\n\n👤 Read his full story at __/founder__`;
  }

  // About platform / company
  if (/about|who.*ellines|what is ellines|platform|company|haven|ellines group/.test(m)) {
    return `**Ellines Haven** is Kenya's premier digital literary platform — a sanctuary for original African stories. 🌍\n\n• Founded by Elijah Mwangi M\n• Part of the **Ellines Group** (Tech, Furniture, Haven)\n• Authentic, honest, Kenya-rooted stories\n• Pay with M-Pesa, buy online, read instantly\n• No subscriptions — buy once, own forever\n\nLearn more at __/about__`;
  }

  // Contact / support / help
  if (/contact|help|support|problem|issue|reach|whatsapp|phone|email|customer|service/.test(m)) {
    return `Need help? Here's how to reach us:\n\n• 💬 **WhatsApp:** 0748 255 466 _(fastest — we reply within the hour)_\n• 📧 **Email:** ellines.haven@gmail.com\n• 📞 **Phone:** 0748 255 466 · 0728 807 213\n• 📍 **Location:** Nairobi, Kenya\n• 🕐 **Hours:** Mon–Sat, 8am–8pm EAT\n\nOr visit our __/contact__ page. 🤝`;
  }

  // Account / login / register
  if (/account|login|sign in|sign up|register|password|forgot|create.*account|new account/.test(m)) {
    if (/forgot|reset|change.*password|lost.*password/.test(m)) {
      return `To reset your password:\n\n1. Go to __/login__\n2. Click **"Forgot password?"**\n3. Enter your email — you'll receive a 6-digit code\n4. Enter the code and set a new password ✅\n\nStill stuck? WhatsApp us at 0748 255 466 and we'll reset it for you manually. 🔑`;
    }
    if (/register|sign up|create/.test(m)) {
      return `Creating an account is **free** and takes under a minute!\n\nVisit __/register__ to get started. With an account you can:\n• 📚 Save your purchased books forever\n• 🛒 Track your orders\n• ⬇️ Download books you've bought\n• 💬 Message the team directly\n\nAlready have one? Sign in at __/login__ 😊`;
    }
    if (/delete.*account|close.*account|remove.*account/.test(m)) {
      return `To delete your account, go to __/profile__ → **Account Settings** → Request Deletion.\n\nThere's a 30-day grace period before the account is permanently removed — you can restore it any time during that window.\n\nNeed help? WhatsApp 0748 255 466. 🔑`;
    }
    return `To sign in, visit __/login__. New here? Create a free account at __/register__.\n\nForgot your password? Click **"Forgot password?"** on the sign-in page. 🔑`;
  }

  // Admin access
  if (/admin|dashboard|manage|panel|god mode/.test(m)) {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      return `Welcome, **${name}**! As ${user.role === 'superadmin' ? '⚡ Super Admin' : '🛡️ Admin'} you have full access to the dashboard.\n\nHead to __/admin__ to manage books, orders, users, design, integrations, messages, and more. 🚀`;
    }
    return `The admin panel is for authorised staff only. If you need admin access, contact us at ellines.haven@gmail.com. 🔒`;
  }

  // Genre / recommendation
  if (/recommend|suggest|what should|best|popular|drama|romance|mystery|history|thriller|fiction|good book/.test(m)) {
    const genreMap = { drama:'Drama', romance:'Romance', mystery:'Mystery', history:'Historical', historical:'Historical', thriller:'Thriller', fiction:'Fiction' };
    const matchedGenre = Object.keys(genreMap).find(k => m.includes(k));
    const genreBooks = matchedGenre
      ? books.filter(b => b.genre?.toLowerCase().includes(genreMap[matchedGenre].toLowerCase())).slice(0, 3)
      : books.filter(b => b.featured).slice(0, 3);
    if (genreBooks.length) {
      const list = genreBooks.map(b => `• **${b.title}** · KSh ${b.price}`).join('\n');
      return `Here are my picks for you${matchedGenre ? ` (${genreMap[matchedGenre]})` : ''}:\n\n${list}\n\nFilter by genre at __/library__ to find exactly what you're looking for! 🌟`;
    }
    return `Browse our full collection at __/library__ — you can filter by genre, price range, and more. We have ${books.filter(b=>b.active!==false).length} titles available. 📚`;
  }

  // Pricing / affordability
  if (/cheap|affordable|expensive|discount|promo|offer|free|price range|how much.*books/.test(m)) {
    const prices = books.filter(b=>b.price>0).map(b=>b.price).sort((a,b)=>a-b);
    const min = prices[0] || 120, max = prices[prices.length-1] || 500;
    return `Books on Ellines Haven range from **KSh ${min}** to **KSh ${max}**. We keep prices fair and local — great literature should be accessible to everyone.\n\nBrowse current prices at __/library__ 💰`;
  }

  // Reading / how to read
  if (/how.*read|can i read|read online|read on phone|mobile|device|tablet|kindle/.test(m)) {
    return `You can read your books:\n• 📱 **On any device** — phone, tablet, laptop, desktop\n• 🌐 **Online in your browser** — just go to __/my-library__\n• ⬇️ **Download PDF** — read offline anywhere, anytime\n\nNo special app needed — just your browser. Works on Android, iPhone, and everything else. 📖`;
  }

  // Refund / return policy
  if (/refund|return|money back|cancel.*order|cancel.*payment/.test(m)) {
    return `Because books are digital products that are instantly accessible after payment, we generally don't offer refunds once a book has been unlocked.\n\nHowever, if there was a payment error or you were charged but didn't receive your book, please contact us immediately:\n• 💬 **WhatsApp:** 0748 255 466\n• 📧 **Email:** ellines.haven@gmail.com\n\nWe always do our best to make things right. 🤝`;
  }

  // Delivery / shipping (since it's digital)
  if (/deliver|ship|physical|print|hard copy|paperback/.test(m)) {
    return `Ellines Haven is a **digital-only platform** — all books are delivered instantly online after payment. There's no physical shipping.\n\nOnce you pay, your book is available immediately in __/my-library__ for reading or PDF download. ⚡`;
  }

  // Languages
  if (/language|english|swahili|kiswahili|translate|translation/.test(m)) {
    return `Currently, all books on Ellines Haven are written in **English**. The stories are set in East Africa with authentic Kenyan voices, culture, and context.\n\nWe're exploring Swahili editions in the future — stay tuned! 📚\n\nKwa maswali kwa Kiswahili: unaweza kuwasiliana nasi kupitia WhatsApp: 0748 255 466`;
  }

  // Swahili responses
  if (/asante|sawa|karibu|ndiyo|hapana|pole|wewe|mimi|vitabu|ninahitaji|tafadhali|samahani/.test(m)) {
    return `Karibu sana! 😊 Naweza kukusaidia na:\n• 📚 Vitabu vilivyopo\n• 💳 Jinsi ya kulipa (M-Pesa, Airtel)\n• 📖 Kufikia maktaba yako\n• 🔑 Akaunti yako\n\nNiambie unachohitaji! Pia unaweza kuwasiliana nasi kwa WhatsApp: **0748 255 466**`;
  }

  // Thank you
  if (/thank|thanks|thx|asante|great.*help|helpful/.test(m)) {
    return `You're welcome, ${name}! 😊 Happy reading — if you ever need anything else, I'm right here. ✦`;
  }

  // Privacy / data
  if (/privacy|data|personal.*info|what.*you.*store|gdpr|my.*data/.test(m)) {
    return `Ellines Haven takes your privacy seriously. We collect:\n• Your name and email (for your account)\n• Purchase records (so you can access your books)\n• Messages you send us\n\nWe don't sell your data to third parties. Read our full policy at __/privacy__. 🔒`;
  }

  // Terms / conditions
  if (/terms|conditions|policy|rules|legal|agreement/.test(m)) {
    return `You can find our full terms and conditions at __/terms__ and our privacy policy at __/privacy__.\n\nThe main points:\n• Purchased books are for personal use only\n• No sharing or redistribution of downloaded books\n• We reserve the right to suspend accounts that violate our terms\n\nQuestions? Email ellines.haven@gmail.com 📄`;
  }

  // Technical issues / errors
  if (/error|bug|not working|broken|problem|issue|crash|loading|slow|can't access|stuck/.test(m)) {
    return `Sorry to hear you're having trouble! Here's what to try:\n\n1. **Refresh** the page (Ctrl+R / Cmd+R)\n2. **Clear your browser cache** and try again\n3. **Try a different browser** (Chrome works best)\n4. Check your **internet connection**\n\nIf the problem persists, contact us right away:\n• 💬 **WhatsApp:** 0748 255 466 _(fastest response)_\n• 📧 **Email:** ellines.haven@gmail.com\n\nDescribe the issue and which page it's on. 🔧`;
  }

  // Fallback with richer suggestions
  return `I'm **Ellinea**, your Ellines Haven assistant. I didn't quite catch that, but I can help with:\n\n• 📚 **Books** — find, search, browse by genre\n• 💳 **Payments** — M-Pesa, Airtel, Card instructions\n• 📖 **Your library** — access, download, read online\n• 🔑 **Account** — login, register, password reset\n• ✍️ **Author** — about Elijah Mwangi M\n• 📞 **Contact** — WhatsApp 0748 255 466\n\nWhat would you like to know? 😊`;
}

/* ── OpenAI API call (if key configured) ── */
async function callOpenAI(messages, apiKey, model = 'gpt-4o-mini') {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.7 }),
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
