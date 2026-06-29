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

  // Books — list or search
  if (/book|novel|read|story|fiction|title|what.*have|browse|catalogue|collection/.test(m)) {
    const available = books.filter(b => b.active !== false && b.status !== 'draft');
    const featured  = available.filter(b => b.featured).slice(0, 3);
    const list      = (featured.length ? featured : available.slice(0, 4)).map(b => `• **${b.title}** — ${b.genre} · KSh ${b.price}`).join('\n');
    return `We have ${available.length} original African stories! Here are some highlights:\n\n${list}\n\nBrowse the full library at __/library__ — filter by genre, price, or search by title. 📚`;
  }

  // Specific book search
  if (/marriage|pain|nairobi|savanna|mombasa|sunsets|ghost|acacia|chapter|thunder/.test(m)) {
    const found = books.filter(b => b.title?.toLowerCase().includes(m.split(' ').find(w => w.length > 4) || '') || b.genre?.toLowerCase().includes(m));
    if (found.length) {
      return `I found: **${found[0].title}** — ${found[0].genre} · KSh ${found[0].price}\n\n${found[0].excerpt || found[0].description || ''}\n\nView it at __/book/${found[0].id}__ 📚`;
    }
  }

  // Payment
  if (/pay|mpesa|m-pesa|airtel|card|visa|price|cost|ksh|buy|purchase|how much|checkout|checkout/.test(m)) {
    return `We accept:\n• 📱 **M-Pesa** (STK push to your phone)\n• 🔴 **Airtel Money**\n• 💳 **Visa / Mastercard**\n\nAfter payment clears, your book unlocks **instantly** — no waiting! Books start from **KSh 120**. Go to your cart at __/cart__ to complete a purchase. 💳`;
  }

  // Library / access
  if (/library|my book|download|read online|access|unlock|own|purchased|bought/.test(m)) {
    return `Your purchased books live in **My Library** at __/my-library__. You can:\n• 📱 Read online directly in the browser\n• ⬇️ Download the PDF for offline reading\n\nYour library is yours **forever** — no subscriptions, no expiry dates. Once you buy, you keep it. 📖`;
  }

  // Author / founder
  if (/author|elijah|mwangi|founder|wrote|writer|who wrote|created by/.test(m)) {
    return `All books on Ellines Haven are written by **Elijah Mwangi M** — a Kenyan software engineer, AI developer, and published author.\n\nEvery story is drawn from real life across East Africa. He also founded **Ellines Tech** and **Ellines Rattan Furniture**.\n\n👤 Read his full story at __/founder__`;
  }

  // About platform
  if (/about|who|what is|ellines|platform|company|haven/.test(m)) {
    return `**Ellines Haven** is Kenya's premier digital literary platform — a sanctuary for original African stories. 🌍\n\n• Founded by Elijah Mwangi M\n• Part of the Ellines Group\n• All stories are authentic, honest, and Kenyan\n• Pay with M-Pesa, buy online, read instantly\n\nLearn more at __/about__`;
  }

  // Contact / support
  if (/contact|help|support|problem|issue|reach|whatsapp|phone|email/.test(m)) {
    return `Need help? Here's how to reach us:\n\n• 💬 **WhatsApp:** 0748 255 466 _(fastest — we reply within the hour)_\n• 📧 **Email:** ellines.haven@gmail.com\n• 📞 **Phone:** 0748 255 466 or 0728 807 213\n• 📍 **Location:** Nairobi, Kenya\n\nOr visit our __/contact__ page. 🤝`;
  }

  // Account / login / register
  if (/account|login|sign in|sign up|register|password|forgot|create.*account/.test(m)) {
    if (/forgot|reset|change.*password/.test(m)) {
      return `To reset your password, go to __/login__ and click **"Forgot password?"**. You'll receive a 6-digit code to create a new password. 🔑`;
    }
    if (/register|sign up|create/.test(m)) {
      return `Creating an account is **free**! Visit __/register__ to get started. With an account you can:\n• 📚 Save your purchased books\n• 🛒 Track your orders\n• ⬇️ Download books you've bought\n\nIt takes under a minute. 😊`;
    }
    return `To sign in, visit __/login__. New here? Create a free account at __/register__.\n\nForgot your password? Click "Forgot password?" on the sign-in page. 🔑`;
  }

  // Admin
  if (/admin|dashboard|manage|panel/.test(m)) {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      return `Welcome, **${name}**! As ${user.role === 'superadmin' ? '⚡ Super Admin' : '🛡️ Admin'} you have full access to the dashboard.\n\nHead to __/admin__ to manage books, orders, users, design, integrations, and more. 🚀`;
    }
    return `The admin panel is for authorised staff only. If you need admin access, contact support at ellines.haven@gmail.com. 🔒`;
  }

  // Genre / recommendation
  if (/recommend|suggest|what should|best|popular|drama|romance|mystery|history|thriller/.test(m)) {
    const genreMap = { drama: 'Drama', romance: 'Romance', mystery: 'Mystery', history: 'Historical', historical: 'Historical' };
    const matchedGenre = Object.keys(genreMap).find(k => m.includes(k));
    const genreBooks = matchedGenre ? books.filter(b => b.genre?.toLowerCase().includes(genreMap[matchedGenre].toLowerCase())).slice(0, 3) : books.filter(b => b.featured).slice(0, 3);
    const list = genreBooks.map(b => `• **${b.title}** · KSh ${b.price}`).join('\n');
    return `Here are my picks for you${matchedGenre ? ` (${genreMap[matchedGenre]})` : ''}:\n\n${list || 'Browse our full collection at __/library__.'}\n\nFilter by genre at __/library__ to find exactly what you're looking for! 🌟`;
  }

  // Price / affordability
  if (/cheap|affordable|expensive|discount|promo|offer|free/.test(m)) {
    return `Books on Ellines Haven start from just **KSh 120**. We keep prices fair and local — because great literature should be accessible to everyone.\n\nCheck the library for current prices: __/library__ 💰`;
  }

  // Swahili
  if (/asante|sawa|karibu|ndiyo|hapana|pole|wewe|mimi|vitabu/.test(m)) {
    return `Karibu sana! 😊 Naweza kukusaidia na chochote kuhusu Ellines Haven — vitabu, malipo, akaunti, au maswali mengine. Niambie unachohitaji!`;
  }

  // Thank you
  if (/thank|thanks|thx|asante/.test(m)) {
    return `You're welcome, ${name}! 😊 Happy reading — if you need anything else, I'm right here. ✦`;
  }

  // Fallback
  return `I'm **Ellinea**, your Ellines Haven assistant. I didn't quite catch that, but I can help with:\n\n• 📚 Finding or recommending books\n• 💳 Payment methods (M-Pesa, Airtel, Card)\n• 📖 Accessing your library\n• 🔑 Account and password help\n• ✍️ Info about author Elijah Mwangi M\n\nWhat would you like to know? 😊`;
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
        const systemPrompt = `You are ${AI_NAME}, a friendly and knowledgeable assistant for Ellines Haven — Kenya's premier digital literary platform. You help readers discover books, handle payments, manage their accounts, and learn about the platform and its founder Elijah Mwangi M. The user is currently on: ${ctx.page}. Keep responses concise, warm, and helpful. Use simple markdown for formatting. Always refer to books, payment methods (M-Pesa, Airtel Money, Visa/MC), and the author Elijah Mwangi M where relevant.`;
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
