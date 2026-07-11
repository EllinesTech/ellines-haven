import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, setDoc, doc, updateDoc, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { silentError } from '../utils/errorHandler';

/**
 * Custom hook for managing book ratings and reviews
 * Handles rating submission, retrieval, and display
 */
export function useBookRatings(bookId, userEmail) {
  const [ratings, setRatings] = useState([]);
  const [userRating, setUserRating] = useState(null);
  const [averageRating, setAverageRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [loading, setLoading] = useState(true);

  // Load ratings for a book
  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    (async () => {
      try {
        // Get all ratings for this book
        const q = query(
          collection(db, 'book_ratings'),
          where('bookId', '==', bookId)
        );
        const snap = await getDocs(q);
        
        const allRatings = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        setRatings(allRatings);

        // Calculate average and find user's rating
        if (allRatings.length > 0) {
          const avg = allRatings.reduce((sum, r) => sum + (r.rating || 0), 0) / allRatings.length;
          setAverageRating(Math.round(avg * 10) / 10);
          setTotalRatings(allRatings.length);
        }

        // Find user's rating if logged in
        if (userEmail) {
          const userRatingDoc = allRatings.find(
            r => r.userEmail?.toLowerCase() === userEmail.toLowerCase()
          );
          if (userRatingDoc) {
            setUserRating(userRatingDoc);
          }
        }
      } catch (err) {
        silentError(err, '[useBookRatings] Failed to load ratings');
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId, userEmail]);

  // Submit or update rating
  const submitRating = useCallback(async (rating, review) => {
    if (!bookId || !userEmail) {
      return { success: false, error: 'Missing book ID or user email' };
    }

    try {
      const ratingId = `${bookId}_${userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const ratingData = {
        bookId,
        userEmail: userEmail.toLowerCase(),
        rating: Math.min(5, Math.max(1, rating)), // Clamp 1-5
        review: review?.trim() || '',
        submittedAt: userRating ? userRating.submittedAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        helpful: 0,
        unhelpful: 0,
      };

      if (userRating) {
        // Update existing rating
        await updateDoc(doc(db, 'book_ratings', ratingId), ratingData);
      } else {
        // Create new rating
        await setDoc(doc(db, 'book_ratings', ratingId), ratingData);
      }

      // Refresh ratings
      setUserRating({ id: ratingId, ...ratingData });
      
      return { success: true };
    } catch (err) {
      console.error('[useBookRatings] Failed to submit rating:', err);
      return { success: false, error: err.message };
    }
  }, [bookId, userEmail, userRating]);

  // Delete rating
  const deleteRating = useCallback(async () => {
    if (!userRating) return { success: false };

    try {
      await deleteDoc(doc(db, 'book_ratings', userRating.id));
      setUserRating(null);
      setRatings(prev => prev.filter(r => r.id !== userRating.id));
      
      return { success: true };
    } catch (err) {
      console.error('[useBookRatings] Failed to delete rating:', err);
      return { success: false, error: err.message };
    }
  }, [userRating]);

  // Mark review as helpful
  const markHelpful = useCallback(async (ratingId) => {
    try {
      const ratingRef = doc(db, 'book_ratings', ratingId);
      const snap = await getDoc(ratingRef);
      if (snap.exists()) {
        await updateDoc(ratingRef, {
          helpful: (snap.data().helpful || 0) + 1,
        });
        setRatings(prev =>
          prev.map(r =>
            r.id === ratingId ? { ...r, helpful: (r.helpful || 0) + 1 } : r
          )
        );
      }
    } catch (err) {
      silentError(err, '[useBookRatings] Failed to mark helpful');
    }
  }, []);

  // Get distribution (e.g., "5 stars: 10", "4 stars: 5", etc.)
  const getDistribution = useCallback(() => {
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratings.forEach(r => {
      const rating = Math.round(r.rating || 0);
      if (dist[rating] !== undefined) dist[rating]++;
    });
    return dist;
  }, [ratings]);

  // Get star display (e.g., "4.5 ★")
  const getStarDisplay = useCallback((rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return { full, half, empty };
  }, []);

  return {
    ratings,
    userRating,
    averageRating,
    totalRatings,
    loading,
    submitRating,
    deleteRating,
    markHelpful,
    getDistribution,
    getStarDisplay,
  };
}
