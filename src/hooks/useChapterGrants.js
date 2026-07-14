/**
 * Chapter Grants Hook
 * 
 * Manages admin grants of individual chapters or chapter ranges to users.
 * Firestore schema:
 * {
 *   user_chapter_grants/{userEmailKey}/
 *     {
 *       userEmail: 'user@email.com',
 *       grants: [
 *         { bookId: 'book1', chapters: [0, 1, 2], grantedAt: timestamp, grantedBy: 'admin@email.com' },
 *         { bookId: 'book2', chapters: 'all', grantedAt: timestamp },
 *         { bookId: 'book3', chapters: [], disabled: true } // Empty chapters + disabled = book locked
 *       ]
 *     }
 * }
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

function userEmailKey(email) {
  return (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Load chapter grants for a user
 * Grants override library ownership — if admin grants a chapter, it's accessible even if not purchased
 */
export function useChapterGrants(userEmail) {
  const [grants, setGrants] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userEmail) {
      setGrants(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, 'user_chapter_grants', userEmailKey(userEmail));
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setGrants(snap.data().grants || []);
      } else {
        setGrants([]);
      }
      setLoading(false);
    }, (err) => {
      console.warn('[ChapterGrants] Load failed:', err.message);
      setGrants([]);
      setLoading(false);
    });

    return () => unsub();
  }, [userEmail]);

  return { grants, loading };
}

/**
 * Check if user has access to a specific chapter via grants
 * @param grants - Array of grant objects from useChapterGrants
 * @param bookId - Book ID
 * @param chapterNum - Chapter number (0-indexed)
 * @returns true if user has been granted access by admin
 */
export function isChapterGranted(grants, bookId, chapterNum) {
  if (!grants || !Array.isArray(grants)) return false;

  const grant = grants.find(g => g.bookId === bookId);
  if (!grant) return false;

  // If disabled is true and chapters is empty, entire book is locked for this user
  if (grant.disabled && (!grant.chapters || grant.chapters.length === 0)) {
    return false;
  }

  // If chapters is 'all', user has all chapters
  if (grant.chapters === 'all') return true;

  // If chapters is an array, check if this chapter is in the list
  if (Array.isArray(grant.chapters)) {
    return grant.chapters.includes(chapterNum);
  }

  return false;
}

/**
 * Check if entire book is granted (chapters === 'all')
 */
export function isBookFullyGranted(grants, bookId) {
  if (!grants || !Array.isArray(grants)) return false;
  const grant = grants.find(g => g.bookId === bookId);
  return grant?.chapters === 'all' && !grant?.disabled;
}

/**
 * Get all granted chapter numbers for a book
 */
export function getGrantedChapters(grants, bookId) {
  if (!grants || !Array.isArray(grants)) return [];
  const grant = grants.find(g => g.bookId === bookId);
  if (!grant) return [];
  if (grant.chapters === 'all') return 'all';
  if (Array.isArray(grant.chapters)) return grant.chapters;
  return [];
}

/**
 * Admin: Grant chapters to a user
 * @param userEmail - Target user email
 * @param bookId - Book ID
 * @param chapters - 'all' | [] (remove) | [0, 1, 2] (specific chapters)
 * @param adminEmail - Admin who made the grant
 */
export async function grantChaptersToUser(userEmail, bookId, chapters, adminEmail) {
  if (!userEmail || !bookId) {
    throw new Error('Missing userEmail or bookId');
  }

  const ref = doc(db, 'user_chapter_grants', userEmailKey(userEmail));
  
  try {
    // Fetch existing grants
    const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(ref));
    const existing = snap.exists() ? snap.data().grants || [] : [];

    // Update or create grant for this book
    const updated = existing.filter(g => g.bookId !== bookId);
    
    if (chapters && (chapters === 'all' || (Array.isArray(chapters) && chapters.length > 0))) {
      updated.push({
        bookId,
        chapters,
        grantedAt: serverTimestamp(),
        grantedBy: adminEmail || 'system',
        disabled: false,
      });
    }

    await setDoc(ref, {
      userEmail: userEmail.toLowerCase(),
      grants: updated,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (err) {
    console.error('[ChapterGrants] Grant failed:', err);
    throw err;
  }
}

/**
 * Admin: Disable access to a book for a user
 * Used for chapter-level access restrictions
 */
export async function disableBookForUser(userEmail, bookId, adminEmail) {
  if (!userEmail || !bookId) {
    throw new Error('Missing userEmail or bookId');
  }

  const ref = doc(db, 'user_chapter_grants', userEmailKey(userEmail));

  try {
    const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(ref));
    const existing = snap.exists() ? snap.data().grants || [] : [];

    // Update or create disabled entry
    const updated = existing.filter(g => g.bookId !== bookId);
    updated.push({
      bookId,
      chapters: [],
      disabled: true,
      disabledAt: serverTimestamp(),
      disabledBy: adminEmail || 'system',
    });

    await setDoc(ref, {
      userEmail: userEmail.toLowerCase(),
      grants: updated,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (err) {
    console.error('[ChapterGrants] Disable failed:', err);
    throw err;
  }
}

/**
 * Admin: Remove all grants for a user for a specific book
 */
export async function removeBookGrant(userEmail, bookId) {
  if (!userEmail || !bookId) {
    throw new Error('Missing userEmail or bookId');
  }

  const ref = doc(db, 'user_chapter_grants', userEmailKey(userEmail));

  try {
    const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(ref));
    if (!snap.exists()) return true;

    const existing = snap.data().grants || [];
    const updated = existing.filter(g => g.bookId !== bookId);

    if (updated.length === 0) {
      // If no grants left, delete the entire document
      await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(ref));
    } else {
      await setDoc(ref, {
        userEmail: userEmail.toLowerCase(),
        grants: updated,
        updatedAt: serverTimestamp(),
      });
    }

    return true;
  } catch (err) {
    console.error('[ChapterGrants] Remove grant failed:', err);
    throw err;
  }
}

/**
 * Admin: Bulk grant chapters to multiple users
 */
export async function bulkGrantChapters(userEmails, bookId, chapters, adminEmail) {
  if (!Array.isArray(userEmails) || userEmails.length === 0 || !bookId) {
    throw new Error('Invalid parameters for bulk grant');
  }

  const results = { success: [], failed: [] };

  for (const email of userEmails) {
    try {
      await grantChaptersToUser(email.trim(), bookId, chapters, adminEmail);
      results.success.push(email);
    } catch (err) {
      results.failed.push({ email, error: err.message });
    }
  }

  return results;
}

/**
 * Admin: Set first chapter as free for a book for all users
 * Stores in site_data.book_free_chapters instead of per-user grants
 */
export async function setFirstChapterFree(bookId, isFree, adminEmail) {
  if (!bookId) throw new Error('Missing bookId');

  try {
    const ref = doc(db, 'site_data', 'book_settings');
    
    const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(ref));
    const existing = snap.exists() ? snap.data() : {};
    const freeChapters = existing.freeFirstChapters || {};

    if (isFree) {
      freeChapters[bookId] = { enabled: true, setAt: serverTimestamp(), setBy: adminEmail };
    } else {
      delete freeChapters[bookId];
    }

    await setDoc(ref, {
      freeFirstChapters: freeChapters,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return true;
  } catch (err) {
    console.error('[ChapterGrants] Set first chapter free failed:', err);
    throw err;
  }
}

/**
 * Admin: Schedule a chapter release (for automatic unlock on date)
 */
export async function scheduleChapterRelease(bookId, chapterNum, releaseDate, adminEmail) {
  if (!bookId || chapterNum === undefined || !releaseDate) {
    throw new Error('Missing bookId, chapterNum, or releaseDate');
  }

  try {
    const ref = doc(db, 'site_data', 'chapter_schedules');
    
    const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(ref));
    const existing = snap.exists() ? snap.data() : {};
    const schedules = existing.schedules || [];

    // Remove existing schedule for this chapter
    const updated = schedules.filter(s => !(s.bookId === bookId && s.chapterNum === chapterNum));

    // Add new schedule
    updated.push({
      bookId,
      chapterNum,
      releaseDate: new Date(releaseDate).getTime(),
      scheduledAt: serverTimestamp(),
      scheduledBy: adminEmail,
      released: false,
    });

    await setDoc(ref, { schedules: updated, updatedAt: serverTimestamp() }, { merge: true });

    return true;
  } catch (err) {
    console.error('[ChapterGrants] Schedule release failed:', err);
    throw err;
  }
}

export default useChapterGrants;
