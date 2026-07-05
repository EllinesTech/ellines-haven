import { createContext, useContext, useState, useEffect } from 'react';
import { BOOKS as INITIAL_BOOKS } from '../data/books';
import {
  doc, getDoc, setDoc, updateDoc,
  collection, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const Ctx = createContext(null);

// ── localStorage helpers ─────────────────────────────────────────────────────
const load = (key, fb) => {
  try {
    const v = localStorage.getItem(key);
    if (!v || v === 'undefined' || v === 'null') return fb;
    return JSON.parse(v) ?? fb;
  } catch { return fb; }
};
const save = (key, val) => {
  if (val === undefined) return;
  localStorage.setItem(key, JSON.stringify(val));
};

// Merge local cache with INITIAL_BOOKS — cached version wins for matching ids
const mergeBooks = (cached) => {
  if (!cached || !cached.length) return INITIAL_BOOKS;
  const out = [...cached];
  INITIAL_BOOKS.forEach(b => { if (!out.find(x => x.id === b.id)) out.push(b); });
  return out;
};

// ── Firestore doc refs ───────────────────────────────────────────────────────
const libDocId    = (email) => (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
const BOOKS_DOC   = () => doc(db, 'site_data', 'books_catalogue');
const COVERS_DOC  = () => doc(db, 'site_data', 'book_covers_map');
const CHAPTER_DOC = (bookId) => doc(db, 'book_chapters', String(bookId));
const PERMS_DOC   = () => doc(db, 'site_data', 'user_permissions');
const USERS_DOC   = () => doc(db, 'site_data', 'registered_users');

// ── Strip large fields before Firestore write ────────────────────────────────
function stripLargeFields(books) {
  const coversMap = {}, chaptersMap = {};
  const stripped = books.map(b => {
    const out = { ...b };
    if (out.cover?.startsWith('data:')) { coversMap[b.id] = out.cover; out.cover = `__cover__:${b.id}`; }
    if (out.chapters?.length > 0)       { chaptersMap[b.id] = out.chapters; out.chapters = []; }
    return out;
  });
  return { stripped, coversMap, chaptersMap };
}

function reapplyLargeFields(books, coversMap, chaptersMap) {
  return books.map(b => {
    let out = { ...b };
    if (out.cover?.startsWith('__cover__:')) out.cover = coversMap[out.cover.replace('__cover__:', '')] || out.cover;
    if (chaptersMap[b.id]?.length > 0)      out.chapters = chaptersMap[b.id];
    return out;
  });
}

// ── Default user permissions ──────────────────────────────────────────────────
export const DEFAULT_PERMS = {
  canBrowse: true,
  canPurchase: true,
  canReview: true,
  canDownload: true,
  canReadOnline: true,
  canAccessMyLibrary: true,
  canViewBookDetails: true,
  canPlaceOrders: true,
  canContactSupport: true,
  canShareBooks: false, // off by default
};

const DEFAULT_SETTINGS = {
  siteName:'Ellines Haven', tagline:'Home For The Story Soul',
  email:'ellines.haven@gmail.com', phone:'0748 255 466', location:'Nairobi, Kenya',
  authorName:'Elijah Mwangi M',
  authorBio:'IT entrepreneur, software engineer, AI developer, and author based in Kenya.',
  authorWeb:'https://ellinestech.co.ke', authorTwitter:'',
  mpesaPhone:'0748255466', mpesaTill:'', mpesaName:'Ellines Haven',
  airtelNum:'', stripeEnabled:false, stripeKey:'', currency:'KES',
  payMethods:['mpesa','airtel','card'],
  paypalClientId:'', paypalEnabled:false,
  flutterwaveKey:'', flutterwaveEnabled:false,
};

export function AppProvider({ children }) {

  const [user,     setUserState]     = useState(() => {
    const u = load('eh_user', null);
    if (u && (u.id === 'u1' || u.id === 'a1')) { localStorage.removeItem('eh_user'); return null; }
    return u;
  });
  const [cart,     setCartState]     = useState(() => {
    // Per-user cart key: if user is already loaded, use their cart; else use guest cart
    const u = load('eh_user', null);
    const cartKey = (u && u.email && !(u.id === 'u1' || u.id === 'a1'))
      ? `eh_cart_${u.email.toLowerCase().replace(/[^a-z0-9]/g,'_')}`
      : 'eh_cart_guest';
    return load(cartKey, []);
  });
  const [books,    setBooksState]    = useState(() => mergeBooks(load('eh_books', null)));
  const [settings, setSettingsState] = useState(() => load('eh_settings', DEFAULT_SETTINGS));
  const [library,  setLibState]      = useState([]);
  const [orders,   setOrdersState]   = useState([]);
  const [libLoaded, setLibLoaded]    = useState(false);

  // ── Wishlist — per-user, stored in localStorage ───────────────────────────
  const wishlistKey = user ? `eh_wishlist_${user.email.toLowerCase().replace(/[^a-z0-9]/g,'_')}` : null;
  const [wishlist, setWishlistState] = useState(() => load(wishlistKey || 'eh_wishlist_guest', []));

  // ── Permissions + Suspension — stored in Firestore so they can't be bypassed ─
  const [userPerms,    setUserPermsState]    = useState(() => {
    try { return JSON.parse(localStorage.getItem('eh_user_perms') || '{}'); } catch { return {}; }
  });
  const [suspendedList, setSuspendedList]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('eh_suspended_fs') || '[]'); } catch { return []; }
  });
  const [siteControls, setSiteControlsState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eh_site_controls') || '{}'); } catch { return {}; }
  });

  // Real-time listener for permissions + suspension + site controls + registered users
  useEffect(() => {
    const unsub = onSnapshot(PERMS_DOC(), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const perms      = data.perms      || {};
      const suspended  = data.suspended  || [];
      const controls   = data.siteControls || {};
      setUserPermsState(perms);
      setSuspendedList(suspended);
      setSiteControlsState(controls);
      localStorage.setItem('eh_user_perms',    JSON.stringify(perms));
      localStorage.setItem('eh_suspended_fs',  JSON.stringify(suspended));
      // Also keep legacy key in sync so Login.jsx picks it up
      localStorage.setItem('eh_suspended_users', JSON.stringify(suspended));
      localStorage.setItem('eh_site_controls', JSON.stringify(controls));
    }, () => {});
    return () => unsub();
  }, []); // eslint-disable-line

  // One-time fetch for admin-created users — syncs to localStorage (no persistent listener needed)
  useEffect(() => {
    getDoc(USERS_DOC()).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.registered) {
        localStorage.setItem('eh_registered_users', JSON.stringify(data.registered));
      }
      if (data.pwOverrides) {
        const local = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
        localStorage.setItem('eh_pw_overrides', JSON.stringify({ ...local, ...data.pwOverrides }));
      }
      if (data.roleOverrides) {
        localStorage.setItem('eh_role_overrides', JSON.stringify(data.roleOverrides));
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  // Auto-logout suspended users in real time — fires as soon as admin suspends
  useEffect(() => {
    if (!user) return;
    const emailKey = user.email.toLowerCase();
    if (suspendedList.includes(emailKey)) {
      // Force logout immediately
      setUserState(null);
      localStorage.removeItem('eh_user');
      setLibState([]);
    }
  }, [suspendedList, user?.email]); // eslint-disable-line

  const getUserPerms = (email) => ({
    ...DEFAULT_PERMS,
    ...(userPerms[(email || '').toLowerCase()] || {}),
  });

  const isUserSuspended = (email) => suspendedList.includes((email || '').toLowerCase());

  const myPerms = user ? getUserPerms(user.email) : DEFAULT_PERMS;

  // Write permissions + suspension to Firestore
  const saveUserPerms = async (updated) => {
    setUserPermsState(updated);
    localStorage.setItem('eh_user_perms', JSON.stringify(updated));
    try {
      await setDoc(PERMS_DOC(), { perms: updated, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.warn('[Perms] write failed:', e.message); }
  };

  const setSuspended = async (email, suspended) => {
    const key  = email.toLowerCase();
    const next = suspended
      ? [...new Set([...suspendedList, key])]
      : suspendedList.filter(e => e !== key);
    setSuspendedList(next);
    localStorage.setItem('eh_suspended_fs', JSON.stringify(next));
    // Also keep legacy localStorage for Login.jsx check
    localStorage.setItem('eh_suspended_users', JSON.stringify(next));
    try {
      await setDoc(PERMS_DOC(), { suspended: next, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.warn('[Suspend] write failed:', e.message); }
  };

  const saveSiteControls = async (controls) => {
    setSiteControlsState(controls);
    localStorage.setItem('eh_site_controls', JSON.stringify(controls));
    try {
      await setDoc(PERMS_DOC(), { siteControls: controls, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.warn('[SiteControls] write failed:', e.message); }
  };

  const setPermField = async (email, field, val) => {
    const key     = email.toLowerCase();
    const current = userPerms[key] || {};
    const updated = { ...userPerms, [key]: { ...DEFAULT_PERMS, ...current, [field]: val } };
    await saveUserPerms(updated);
  };

  // ── Cart key helpers ─────────────────────────────────────────────────────
  const cartKey = (email) => email
    ? `eh_cart_${email.toLowerCase().replace(/[^a-z0-9]/g,'_')}`
    : 'eh_cart_guest';

  const setCart = (vOrFn) => {
    setCartState(prev => {
      const next = typeof vOrFn === 'function' ? vOrFn(prev) : vOrFn;
      // Save under the current user's key (or guest if not logged in)
      const key = cartKey(user?.email || null);
      save(key, next);
      // Also keep legacy key in sync so old bookmarks still work
      save('eh_cart', next);
      return next;
    });
  };

  // ── Setters ──────────────────────────────────────────────────────────────────
  const setSettings = v => {
    setSettingsState(v);
    save('eh_settings', v);
    // Also persist to Firestore so settings survive across devices and deployments
    setDoc(doc(db, 'site_data', 'site_settings'), { ...v, updatedAt: serverTimestamp() }, { merge: true })
      .catch(e => console.warn('[Settings] Firestore write failed:', e.message));
  };

  const setBooks = (vOrFn) => {
    // Support both direct value and functional updater (like React setState)
    setBooksState(prev => {
      const v = typeof vOrFn === 'function' ? vOrFn(prev) : vOrFn;

      // localStorage has a ~5MB limit — catch QuotaExceededError
      try {
        save('eh_books', v);
        save('eh_books_savedAt', Date.now());
      } catch (e) {
        console.warn('[Books] localStorage quota exceeded, saving stripped version');
        const { stripped } = stripLargeFields(v);
        try { save('eh_books', stripped); save('eh_books_savedAt', Date.now()); } catch {}
      }

      const { stripped, coversMap, chaptersMap } = stripLargeFields(v);
      setDoc(BOOKS_DOC(), { books: stripped, updatedAt: serverTimestamp() })
        .then(() => console.log('[Books] catalogue saved to Firestore ✓'))
        .catch(e => console.warn('[Books] catalogue write failed:', e.message));
      if (Object.keys(coversMap).length > 0)
        setDoc(COVERS_DOC(), { covers: coversMap, updatedAt: serverTimestamp() })
          .then(() => console.log('[Books] covers saved to Firestore ✓'))
          .catch(e => console.warn('[Books] covers write failed:', e.message));
      Object.entries(chaptersMap).forEach(([bookId, chapters]) =>
        setDoc(CHAPTER_DOC(bookId), { bookId, chapters, updatedAt: serverTimestamp() })
          .then(() => console.log(`[Books] chapters saved for book ${bookId} ✓`))
          .catch(e => console.warn(`[Books] chapters write failed for ${bookId}:`, e.message))
      );

      return v;
    });
  };

  const setUser = v => {
    setUserState(v);
    if (v) save('eh_user', v); else localStorage.removeItem('eh_user');
    if (!v) {
      setLibState([]);
      setWishlistState([]);
    }
  };

  // ── Wishlist helpers ──────────────────────────────────────────────────────
  const toggleWishlist = (book) => {
    if (!user) { window.location.href = '/login'; return; }
    const key = `eh_wishlist_${user.email.toLowerCase().replace(/[^a-z0-9]/g,'_')}`;
    const already = wishlist.some(b => b.id === book.id);
    const next = already
      ? wishlist.filter(b => b.id !== book.id)
      : [
          ...wishlist,
          {
            // Snapshot all fields so new books with any extra properties are preserved
            ...book,
            // Overwrite large/mutable fields with safe lightweight copies
            chapters: undefined,  // don't store full chapter content in wishlist
            addedAt: Date.now(),
          },
        ];
    setWishlistState(next);
    save(key, next);
  };
  const isWishlisted = (id) => wishlist.some(b => b.id === id);

  // Re-load wishlist when user changes
  useEffect(() => {
    if (!user?.email) { setWishlistState([]); return; }
    const key = `eh_wishlist_${user.email.toLowerCase().replace(/[^a-z0-9]/g,'_')}`;
    setWishlistState(load(key, []));
  }, [user?.email]); // eslint-disable-line

  // ── Reload cart when user changes (login / logout) ────────────────────────
  // On login: merge any guest cart items into the user's saved cart
  // On logout: clear in-memory cart (guest cart is separate and untouched)
  useEffect(() => {
    if (!user?.email) {
      // Logged out — load guest cart
      setCartState(load('eh_cart_guest', []));
      return;
    }
    const uKey    = cartKey(user.email);
    const uCart   = load(uKey, []);
    const gCart   = load('eh_cart_guest', []);
    if (gCart.length > 0) {
      // Merge guest items into user cart (no duplicates)
      const merged = [...uCart];
      gCart.forEach(g => { if (!merged.find(x => x.id === g.id)) merged.push(g); });
      setCartState(merged);
      save(uKey, merged);
      save('eh_cart', merged);
      // Clear guest cart after merge
      save('eh_cart_guest', []);
    } else {
      setCartState(uCart);
    }
  }, [user?.email]); // eslint-disable-line

  const updateSettings = patch => setSettings(prev => ({ ...prev, ...patch }));

  // ── Load settings from Firestore on mount (wins over localStorage) ─────────
  useEffect(() => {
    getDoc(doc(db, 'site_data', 'site_settings')).then(snap => {
      if (!snap.exists()) return;
      const fsSettings = snap.data();
      delete fsSettings.updatedAt;
      setSettingsState(prev => ({ ...prev, ...fsSettings }));
      save('eh_settings', { ...load('eh_settings', DEFAULT_SETTINGS), ...fsSettings });
    }).catch(() => {});
  }, []); // eslint-disable-line

  // ── Load books from Firestore on mount ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const local        = load('eh_books', []);
        const savedAt      = load('eh_books_savedAt', 0);
        const cacheAge     = Date.now() - savedAt;
        const CACHE_TTL    = 5 * 60 * 1000; // 5 minutes — use local cache if fresh

        const [booksSnap, coversSnap] = await Promise.all([getDoc(BOOKS_DOC()), getDoc(COVERS_DOC())]);
        if (!booksSnap.exists()) return;
        const fsBooks = booksSnap.data().books || [];
        if (!fsBooks.length) return;

        const coversMap = coversSnap.exists() ? (coversSnap.data().covers || {}) : {};

        // ── Chapter loading: use local cache if fresh, skip Firestore reads ──
        const chaptersMap = {};
        // Always pull local chapters first (fastest — no network)
        local.forEach(b => { if (b.chapters?.length > 0) chaptersMap[b.id] = b.chapters; });

        // Only fetch chapters from Firestore for books that don't have them locally
        // AND only if cache is stale — avoids 15 reads on every page load
        const booksNeedingChapters = cacheAge > CACHE_TTL
          ? fsBooks.filter(b => !chaptersMap[b.id])
          : []; // Use cached chapters when cache is fresh

        if (booksNeedingChapters.length > 0) {
          await Promise.all(booksNeedingChapters.map(async b => {
            try {
              const snap = await getDoc(CHAPTER_DOC(b.id));
              if (snap.exists() && snap.data().chapters?.length > 0) chaptersMap[b.id] = snap.data().chapters;
            } catch {}
          }));
        }

        const withAll  = reapplyLargeFields(fsBooks, coversMap, chaptersMap);
        const localMap = new Map((local || []).map(b => [b.id, b]));
        const finalBooks = withAll.map(b => {
          const loc = localMap.get(b.id);
          if (!loc) return b;
          if (!b.cover && loc.cover?.startsWith('data:')) return { ...b, cover: loc.cover, coverType: loc.coverType };
          return b;
        });

        const merged = mergeWithFirestore(local, finalBooks);
        setBooksState(merged);
        save('eh_books', merged);
        save('eh_books_savedAt', Date.now());
      } catch (e) { console.warn('[Books] Firestore load failed:', e.message); }
    })();
  }, []); // eslint-disable-line

  // ── Library from Firestore (real-time) ───────────────────────────────────
  useEffect(() => {
    if (!user?.email) { setLibState([]); setLibLoaded(false); return; }
    const ref   = doc(db, 'libraries', libDocId(user.email));
    const unsub = onSnapshot(ref, snap => {
      setLibState(snap.exists() ? (snap.data().books || []) : []);
      setLibLoaded(true);
    });
    return () => unsub();
  }, [user?.email]);

  // ── Cart ──────────────────────────────────────────────────────────────────
  const addToCart      = b => {
    if (user && !myPerms.canPurchase) return;
    setCart(p => p.find(x => x.id === b.id) ? p : [...p, b]);
  };
  const removeFromCart = id => setCart(p => p.filter(b => b.id !== id));
  const clearCart      = () => setCart([]);

  // ── Library ───────────────────────────────────────────────────────────────
  const addToLibrary = b => {
    if (!user?.email) return;
    const updated = library.find(x => x.id === b.id) ? library : [...library, { ...b, downloadUnlocked: true }];
    const ref     = doc(db, 'libraries', libDocId(user.email));
    setDoc(ref, { email: user.email.toLowerCase(), books: updated }, { merge: true });
    setLibState(updated);
  };
  const isOwned     = id => library.some(b => b.id === id);
  const canDownload = id => {
    if (user && !myPerms.canDownload) return false;
    return library.some(b => b.id === id && b.downloadUnlocked);
  };

  // ── Books admin ───────────────────────────────────────────────────────────
  const saveBook   = b  => {
    // Clear local cache so Firestore is re-fetched fresh on next load
    localStorage.removeItem('eh_books');
    setBooks(p => { const i = p.findIndex(x => x.id === b.id); return i >= 0 ? p.map(x => x.id === b.id ? b : x) : [...p, b]; });
  };
  const deleteBook = id => {
    localStorage.removeItem('eh_books');
    setBooks(p => p.filter(b => b.id !== id));
  };
  const resetBooks = () => setBooks(INITIAL_BOOKS);

  // ── Orders ────────────────────────────────────────────────────────────────
  const syncOrders = () => {};

  const placeOrder = async (items, method, ref, phone) => {
    const order = {
      id: 'ORD-' + Date.now(), userId: user?.id || null, userName: user?.name || 'Guest',
      userEmail: user?.email?.toLowerCase() || null,
      items: items.map(b => ({ id:b.id, title:b.title, price:b.price })),
      total: items.reduce((s,b) => s + b.price, 0),
      method, ref: ref || '', phone: phone || '',
      status: 'Pending', date: new Date().toISOString().slice(0,10), createdAt: Date.now(),
    };
    // Always write to Firestore — localStorage fallback causes orders to be invisible to buyer
    await setDoc(doc(db,'orders',order.id), { ...order, createdAt: serverTimestamp() });

    // ── Notify admin: write to admin_notifications so the panel lights up ──
    try {
      const itemList = order.items.map(i => i.title).join(', ');
      const waText = encodeURIComponent(
        `🛒 NEW ORDER from ${order.userName} (${order.userEmail || 'guest'})\n` +
        `Books: ${itemList}\n` +
        `Total: KSh ${order.total}\n` +
        `Method: ${method}\n` +
        `Order ID: ${order.id}`
      );
      await setDoc(doc(db, 'admin_notifications', order.id), {
        type: 'new_order',
        orderId: order.id,
        userName: order.userName,
        userEmail: order.userEmail,
        items: order.items,
        total: order.total,
        method,
        status: 'unread',
        waLink: `https://wa.me/254748255466?text=${waText}`,
        createdAt: serverTimestamp(),
      });
    } catch (e) { console.warn('[placeOrder] admin notification failed:', e.message); }

    return order;
  };

  const unlockBooksForBuyer = async (userEmail, booksToUnlock) => {
    if (!userEmail) { console.error('unlockBooksForBuyer: no userEmail provided'); return; }
    const ref = doc(db, 'libraries', libDocId(userEmail));
    try {
      const snap     = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().books || []) : [];
      const map      = new Map(existing.map(b => [b.id, b]));
      booksToUnlock.forEach(b => map.set(b.id, { ...b, downloadUnlocked: true }));
      await setDoc(ref, { email: userEmail.toLowerCase(), books: Array.from(map.values()) }, { merge: true });
    } catch (e) { console.error('unlockBooksForBuyer failed:', e); throw e; }
  };

  const confirmOrder = async (orderId) => {
    // Read directly from Firestore — don't rely on possibly-stale `orders` state
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try {
        const snap = await getDoc(doc(db, 'orders', orderId));
        if (snap.exists()) order = { id: snap.id, ...snap.data() };
      } catch {}
    }
    if (!order || order.status !== 'Pending') return;
    if (!order.userEmail) { console.error('confirmOrder: order has no userEmail'); return; }
    const resolved = (order.items || []).map(item => ({ ...(books.find(b => b.id === item.id) || item), downloadUnlocked: true }));
    await unlockBooksForBuyer(order.userEmail, resolved);
    try { await updateDoc(doc(db,'orders',orderId), { status:'Completed', confirmedAt: serverTimestamp() }); }
    catch (e) { console.error('confirmOrder failed:', e); }
  };

  const rejectOrder = async (orderId) => {
    try { await updateDoc(doc(db,'orders',orderId), { status:'Rejected' }); }
    catch (e) { console.error('rejectOrder failed:', e); }
  };

  const manualUnlock = async (targetEmail, bookId) => {
    const book = books.find(b => b.id === bookId);
    if (book) await unlockBooksForBuyer(targetEmail, [book]);
  };

  // Admin: update a specific book entry in a user's library
  const updateUserLibraryBook = async (userEmail, bookId, patch) => {
    const ref = doc(db, 'libraries', libDocId(userEmail));
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const existing = snap.data().books || [];
      const updated  = existing.map(b => b.id === bookId ? { ...b, ...patch } : b);
      await setDoc(ref, { books: updated }, { merge: true });
    } catch (e) { console.error('updateUserLibraryBook failed:', e); }
  };

  // Admin: remove a book from a user's library entirely
  const removeFromUserLibrary = async (userEmail, bookId) => {
    const ref = doc(db, 'libraries', libDocId(userEmail));
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const updated = (snap.data().books || []).filter(b => b.id !== bookId);
      await setDoc(ref, { books: updated }, { merge: true });
    } catch (e) { console.error('removeFromUserLibrary failed:', e); }
  };

  const logout = () => setUser(null);

  return (
    <Ctx.Provider value={{
      user, setUser, logout,
      cart, addToCart, removeFromCart, clearCart,
      library, addToLibrary, isOwned, canDownload, libLoaded,
      books, saveBook, deleteBook, resetBooks,
      orders, setOrdersState, placeOrder, confirmOrder, rejectOrder,
      syncOrders, manualUnlock, unlockBooksForBuyer,
      updateUserLibraryBook, removeFromUserLibrary,
      settings, updateSettings,
      // Permissions API
      userPerms, getUserPerms, setPermField, saveUserPerms, myPerms,
      // Suspension (Firestore-backed, real-time)
      suspendedList, isUserSuspended, setSuspended,
      // Site controls
      siteControls, saveSiteControls,
      // Wishlist
      wishlist, toggleWishlist, isWishlisted,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);

// Firestore is authoritative over INITIAL_BOOKS — local additions are preserved
// Local edits (cover, chapters, etc.) are NEVER overwritten by INITIAL_BOOKS
// INITIAL_BOOKS provides defaults for any fields the Firestore doc doesn't explicitly have
function mergeWithFirestore(local, fsBooks) {
  const fsMap    = new Map(fsBooks.map(b => [b.id, b]));
  const localMap = new Map((local || []).map(b => [b.id, b]));
  const INITIAL_MAP = new Map(INITIAL_BOOKS.map(b => [b.id, b]));

  const out = fsBooks.map(fsBook => {
    const defaults = INITIAL_MAP.get(fsBook.id) || {};
    const merged = { ...defaults };
    Object.keys(fsBook).forEach(k => {
      // For boolean fields, explicitly false is valid — never override with defaults
      if (fsBook[k] !== undefined && fsBook[k] !== null) {
        merged[k] = fsBook[k];
      } else if (typeof fsBook[k] === 'boolean') {
        // Explicit false must be kept
        merged[k] = fsBook[k];
      } else if (merged[k] === undefined) {
        merged[k] = defaults[k];
      }
    });
    return merged;
  });

  // Add local-only books not in Firestore
  local.forEach(b => { if (!fsMap.has(b.id)) out.push(b); });
  // Add INITIAL_BOOKS only if genuinely absent from both
  INITIAL_BOOKS.forEach(b => { if (!fsMap.has(b.id) && !localMap.has(b.id)) out.push(b); });

  return out;
}
