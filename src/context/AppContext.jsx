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
};

export function AppProvider({ children }) {

  const [user,     setUserState]     = useState(() => {
    const u = load('eh_user', null);
    if (u && (u.id === 'u1' || u.id === 'a1')) { localStorage.removeItem('eh_user'); return null; }
    return u;
  });
  const [cart,     setCartState]     = useState(() => load('eh_cart', []));
  const [books,    setBooksState]    = useState(() => mergeBooks(load('eh_books', null)));
  const [settings, setSettingsState] = useState(() => load('eh_settings', DEFAULT_SETTINGS));
  const [library,  setLibState]      = useState([]);
  const [orders,   setOrdersState]   = useState([]);

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

  // Real-time listener for admin-created users — syncs to localStorage on every device
  useEffect(() => {
    const unsub = onSnapshot(USERS_DOC(), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      // Sync registered users to localStorage so Login.jsx can find them
      if (data.registered) {
        localStorage.setItem('eh_registered_users', JSON.stringify(data.registered));
      }
      if (data.pwOverrides) {
        // Merge with any local overrides (don't clobber local password resets)
        const local = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
        const merged = { ...local, ...data.pwOverrides };
        localStorage.setItem('eh_pw_overrides', JSON.stringify(merged));
      }
      if (data.roleOverrides) {
        localStorage.setItem('eh_role_overrides', JSON.stringify(data.roleOverrides));
      }
    }, () => {});
    return () => unsub();
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

  // ── Setters ──────────────────────────────────────────────────────────────────
  const setCart     = v => { setCartState(v);     save('eh_cart', v); };
  const setSettings = v => { setSettingsState(v); save('eh_settings', v); };

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
    if (!v) setLibState([]);
  };

  const updateSettings = patch => setSettings(prev => ({ ...prev, ...patch }));

  // ── Load books from Firestore on mount ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [booksSnap, coversSnap] = await Promise.all([getDoc(BOOKS_DOC()), getDoc(COVERS_DOC())]);
        if (!booksSnap.exists()) return;
        const fsBooks = booksSnap.data().books || [];
        if (!fsBooks.length) return;

        const coversMap   = coversSnap.exists() ? (coversSnap.data().covers || {}) : {};
        const chaptersMap = {};

        await Promise.all(fsBooks.map(async b => {
          try {
            const snap = await getDoc(CHAPTER_DOC(b.id));
            if (snap.exists() && snap.data().chapters?.length > 0) chaptersMap[b.id] = snap.data().chapters;
          } catch {}
        }));

        const local = load('eh_books', []);
        // Always keep local chapters (they may have just been saved)
        local.forEach(b => { if (b.chapters?.length > 0) chaptersMap[b.id] = b.chapters; });

        // Reapply covers + chapters onto Firestore books
        const withAll = reapplyLargeFields(fsBooks, coversMap, chaptersMap);

        // Firestore is authoritative for covers — only keep local cover if Firestore
        // has NO cover for this book (i.e. it was never uploaded to Firestore)
        const localMap = new Map((local || []).map(b => [b.id, b]));
        const finalBooks = withAll.map(b => {
          const loc = localMap.get(b.id);
          if (!loc) return b;
          // Only fall back to local cover if Firestore has no cover at all
          if (!b.cover && loc.cover?.startsWith('data:')) {
            return { ...b, cover: loc.cover, coverType: loc.coverType };
          }
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
    if (!user?.email) { setLibState([]); return; }
    const ref   = doc(db, 'libraries', libDocId(user.email));
    const unsub = onSnapshot(ref, snap => { setLibState(snap.exists() ? (snap.data().books || []) : []); });
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
    try { await setDoc(doc(db,'orders',order.id), { ...order, createdAt: serverTimestamp() }); }
    catch (e) {
      console.error('Firestore placeOrder failed:', e);
      save('eh_orders', [order, ...load('eh_orders', [])]);
    }
    return order;
  };

  const unlockBooksForBuyer = async (userEmail, booksToUnlock) => {
    const ref = doc(db, 'libraries', libDocId(userEmail));
    try {
      const snap     = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().books || []) : [];
      const map      = new Map(existing.map(b => [b.id, b]));
      booksToUnlock.forEach(b => map.set(b.id, { ...b, downloadUnlocked: true }));
      await setDoc(ref, { email: userEmail.toLowerCase(), books: Array.from(map.values()) }, { merge: true });
    } catch (e) { console.error('unlockBooksForBuyer failed:', e); }
  };

  const confirmOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'Pending') return;
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
      library, addToLibrary, isOwned, canDownload,
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
