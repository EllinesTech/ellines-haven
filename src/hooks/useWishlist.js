import { useState, useEffect, useCallback, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { silentError } from '../utils/errorHandler';

/**
 * Custom hook for wishlist management
 * Add/remove books from wishlist, track price drops, notify on sales
 */
export function useWishlist() {
  const appCtx = useContext(AppContext);
  const userEmail = appCtx?.user?.email;
  
  const [wishlist, setWishlist] = useState([]);
  const [priceDrops, setPriceDrops] = useState({});
  const [loading, setLoading] = useState(true);
  const [unsub, setUnsub] = useState(null);

  // Load wishlist for current user
  useEffect(() => {
    if (!userEmail) {
      setWishlist([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Subscribe to real-time wishlist updates
      const q = query(
        collection(db, 'wishlists'),
        where('userEmail', '==', userEmail.toLowerCase())
      );

      const unsubscribe = onSnapshot(q, snap => {
        const items = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setWishlist(items);
        setLoading(false);
      }, err => {
        silentError(err, '[useWishlist] Failed to load wishlist');
        setLoading(false);
      });

      setUnsub(() => unsubscribe);
      return () => unsubscribe();
    } catch (err) {
      silentError(err, '[useWishlist] Failed to setup wishlist listener');
      setLoading(false);
    }
  }, [userEmail]);

  // Check if book is in wishlist
  const isInWishlist = useCallback((bookId) => {
    return wishlist.some(item => item.bookId === bookId);
  }, [wishlist]);

  // Get wishlist item details
  const getWishlistItem = useCallback((bookId) => {
    return wishlist.find(item => item.bookId === bookId);
  }, [wishlist]);

  // Add to wishlist
  const addToWishlist = useCallback(async (bookId, bookData) => {
    if (!userEmail) {
      return { success: false, error: 'Must be logged in' };
    }

    try {
      const wishlistId = `${bookId}_${userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await setDoc(doc(db, 'wishlists', wishlistId), {
        bookId,
        userEmail: userEmail.toLowerCase(),
        bookTitle: bookData?.title || 'Unknown',
        bookAuthor: bookData?.author || '',
        bookCover: bookData?.cover || '',
        originalPrice: bookData?.price || 0,
        currentPrice: bookData?.price || 0,
        addedAt: serverTimestamp(),
        notifyOnSale: true,
        salePriceThreshold: (bookData?.price || 0) * 0.8, // Notify if 20% cheaper
      });

      return { success: true };
    } catch (err) {
      console.error('[useWishlist] Failed to add to wishlist:', err);
      return { success: false, error: err.message };
    }
  }, [userEmail]);

  // Remove from wishlist
  const removeFromWishlist = useCallback(async (bookId) => {
    if (!userEmail) return { success: false };

    try {
      const wishlistId = `${bookId}_${userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await deleteDoc(doc(db, 'wishlists', wishlistId));
      return { success: true };
    } catch (err) {
      console.error('[useWishlist] Failed to remove from wishlist:', err);
      return { success: false, error: err.message };
    }
  }, [userEmail]);

  // Toggle wishlist
  const toggleWishlist = useCallback(async (bookId, bookData) => {
    if (isInWishlist(bookId)) {
      return removeFromWishlist(bookId);
    } else {
      return addToWishlist(bookId, bookData);
    }
  }, [isInWishlist, removeFromWishlist, addToWishlist]);

  // Get average price drop percentage across wishlist
  const getAverageSavings = useCallback(() => {
    if (wishlist.length === 0) return 0;
    const totalSavings = wishlist.reduce((sum, item) => {
      const original = item.originalPrice || 0;
      const current = item.currentPrice || 0;
      return sum + ((original - current) / original || 0);
    }, 0);
    return Math.round((totalSavings / wishlist.length) * 100);
  }, [wishlist]);

  // Get items on sale (price dropped)
  const getItemsOnSale = useCallback(() => {
    return wishlist.filter(item => 
      (item.currentPrice || 0) < (item.originalPrice || 0)
    );
  }, [wishlist]);

  // Export wishlist (for sharing or backup)
  const exportWishlist = useCallback(() => {
    return {
      exportDate: new Date().toISOString(),
      userEmail,
      items: wishlist.map(({ id, ...item }) => item),
      totalItems: wishlist.length,
      itemsOnSale: getItemsOnSale().length,
      averageSavings: getAverageSavings(),
    };
  }, [wishlist, userEmail, getItemsOnSale, getAverageSavings]);

  return {
    wishlist,
    loading,
    isInWishlist,
    getWishlistItem,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    getItemsOnSale,
    getAverageSavings,
    exportWishlist,
    count: wishlist.length,
  };
}
