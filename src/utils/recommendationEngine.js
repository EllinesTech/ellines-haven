import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { BOOKS } from '../data/books';

const libDocId = (email) => (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

/** Prefer the live catalogue (AppContext / Firestore); fall back to seed BOOKS. */
function catalogue(books) {
  return Array.isArray(books) && books.length ? books : BOOKS;
}

function bookGenres(book) {
  if (Array.isArray(book?.genres) && book.genres.length) return book.genres;
  if (book?.genre) return [book.genre];
  return [];
}

/**
 * Get user's reading profile (genres, avg rating, books read)
 * Libraries are one doc per user: libraries/{sanitizedEmail} → { books: [...] }
 */
export async function getUserReadingProfile(userEmail, books) {
  try {
    const snap = await getDoc(doc(db, 'libraries', libDocId(userEmail)));
    if (!snap.exists()) return null;

    const owned = snap.data().books || [];
    if (!owned.length) return null;

    const list = catalogue(books);
    const genres = {};
    const ratings = [];

    owned.forEach((lb) => {
      const cat = list.find((b) => b.id === lb.id) || lb;
      bookGenres(cat).forEach((g) => {
        genres[g] = (genres[g] || 0) + 1;
      });
      const rating = typeof cat.rating === 'number' ? cat.rating : null;
      if (rating != null) ratings.push(rating);
    });

    const avgRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 3.5;

    return {
      email: userEmail.toLowerCase(),
      genres,
      avgRating,
      booksRead: owned.length,
      ownedIds: new Set(owned.map((b) => b.id)),
      lastUpdated: new Date(),
      preferences: {
        genreWeight: 0.5,
        ratingWeight: 0.2,
        popularityWeight: 0.15,
        authorWeight: 0.1,
        typeWeight: 0.05,
      },
    };
  } catch (error) {
    // Permission / network — caller falls back to trending
    if (import.meta.env.DEV) console.warn('Error getting reading profile:', error?.code || error);
    return null;
  }
}

/**
 * Find similar books based on genre, rating, and other factors
 */
export async function findSimilarBooks(bookId, limitCount = 6, books) {
  try {
    const list = catalogue(books);
    const book = list.find((b) => b.id === bookId);
    if (!book) return [];

    const sourceGenres = bookGenres(book);
    const similarBooks = list.filter((b) => {
      if (b.id === bookId) return false;
      return sourceGenres.some((g) => bookGenres(b).includes(g));
    });

    const scoredBooks = similarBooks.map((b) => {
      let score = 0;
      const bGenres = bookGenres(b);

      if (sourceGenres.length && bGenres.length) {
        const commonGenres = sourceGenres.filter((g) => bGenres.includes(g));
        score += (commonGenres.length / Math.max(sourceGenres.length, bGenres.length)) * 50;
      }

      const bookRating = book.rating || 3.5;
      const bookRating2 = b.rating || 3.5;
      score += Math.max(0, 20 - Math.abs(bookRating - bookRating2) * 5);

      const bookPopularity = book.reviews || 0;
      const bookPopularity2 = b.reviews || 0;
      score += Math.min(15, (bookPopularity2 / Math.max(bookPopularity, 1)) * 10);

      if (book.author && b.author && book.author === b.author) score += 10;
      if (book.type && b.type && book.type === b.type) score += 5;

      return { book: b, score };
    });

    return scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limitCount)
      .map((item) => ({
        ...item.book,
        similarityScore: Math.round(item.score),
      }));
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Error finding similar books:', error);
    return [];
  }
}

/**
 * Calculate recommendations for a user
 */
export async function calculateRecommendations(userEmail, limitCount = 10, books) {
  const list = catalogue(books);
  try {
    const profile = await getUserReadingProfile(userEmail, list);

    if (!profile || Object.keys(profile.genres).length === 0) {
      return getTrendingBooks(limitCount, list);
    }

    const recommendations = [];
    const seenBookIds = new Set(profile.ownedIds || []);

    const genreEntries = Object.entries(profile.genres)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [genre] of genreEntries) {
      list.forEach((book) => {
        if (seenBookIds.has(book.id)) return;
        if (book.active === false || book.status === 'coming-soon' || book.status === 'draft') return;

        let score = 0;
        const genres = bookGenres(book);

        if (genres.includes(genre)) score += 50;

        if (book.rating) {
          const ratingDiff = Math.abs(book.rating - profile.avgRating);
          score += Math.max(0, 20 - ratingDiff * 3);
        }

        score += Math.min(15, ((book.reviews || 0) / 100) * 5);
        if (book.featured) score += 10;
        if (book.status === 'new' || book.type === 'series-starter') score += 5;

        if (score > 0) {
          seenBookIds.add(book.id);
          recommendations.push({
            bookId: book.id,
            bookTitle: book.title,
            author: book.author,
            cover: book.cover,
            genres,
            rating: book.rating,
            reviews: book.reviews,
            reason: generateRecommendationReason(book, genre, profile),
            score: Math.round(score),
            createdAt: new Date(),
          });
        }
      });
    }

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limitCount);
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Error calculating recommendations:', error);
    return getTrendingBooks(limitCount, list);
  }
}

/**
 * Get cached recommendations for a user
 */
export async function getCachedRecommendations(userEmail) {
  try {
    const docRef = doc(db, 'book_recommendations', libDocId(userEmail));
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate?.() || new Date(0);
      const ageMs = Date.now() - createdAt.getTime();
      const cacheValidMs = 24 * 60 * 60 * 1000;

      if (ageMs < cacheValidMs && data.recommendations?.length > 0) {
        return data.recommendations;
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Error getting cached recommendations:', error?.code || error);
  }
  return null;
}

/**
 * Save recommendations to Firestore
 */
export async function saveRecommendations(userEmail, recommendations) {
  try {
    const docRef = doc(db, 'book_recommendations', libDocId(userEmail));
    await setDoc(docRef, {
      email: userEmail.toLowerCase(),
      recommendations,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return true;
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Error saving recommendations:', error?.code || error);
    return false;
  }
}

/**
 * Get trending books based on various metrics
 */
export function getTrendingBooks(limitCount = 10, books) {
  const list = catalogue(books);
  try {
    const scoredBooks = list.filter(
      (b) => b.active !== false && b.status !== 'coming-soon' && b.status !== 'draft'
    ).map((book) => {
      let score = 0;

      if (book.rating) score += (book.rating / 5) * 30;
      score += Math.min(30, (book.reviews || 0) / 10);
      if (book.featured) score += 20;
      if (book.status === 'new' || book.type === 'series-starter') score += 15;

      const popularGenres = ['Romance', 'Fantasy', 'Mystery', 'Sci-Fi'];
      if (bookGenres(book).some((g) => popularGenres.includes(g))) score += 5;

      return { book, score };
    });

    return scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limitCount)
      .map((item) => ({
        ...item.book,
        trendingScore: Math.round(item.score),
      }));
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Error getting trending books:', error);
    return list.slice(0, limitCount);
  }
}

/**
 * Generate human-readable recommendation reason
 */
function generateRecommendationReason(book, genre) {
  if (book.featured) return 'Featured & highly rated';
  if (book.rating >= 4.5) return `Highly rated in ${genre}`;
  if ((book.reviews || 0) > 50) return `Popular ${genre} book`;
  return `You love ${genre} books!`;
}

/**
 * Get trending books by category/genre
 */
export function getTrendingByCategory(genre, limitCount = 20, books) {
  const list = catalogue(books);
  try {
    const genreBooks = list.filter((book) => bookGenres(book).includes(genre));

    const scoredBooks = genreBooks.map((book) => {
      let score = 0;
      if (book.rating) score += (book.rating / 5) * 30;
      score += Math.min(30, (book.reviews || 0) / 10);
      if (book.featured) score += 20;
      if (book.status === 'new' || book.type === 'series-starter') score += 15;
      return { book, score };
    });

    return scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limitCount)
      .map((item) => ({
        ...item.book,
        trendingScore: Math.round(item.score),
        genre,
      }));
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Error getting trending books by category:', error);
    return [];
  }
}

/**
 * Generate trending scores for books
 */
export function calculateTrendingScores(timeframe = '7d', books) {
  const list = catalogue(books);
  const weights = {
    rating: 0.3,
    reviews: 0.25,
    featured: 0.2,
    newRelease: 0.15,
    popularity: 0.1,
  };

  return list.map((book) => {
    let score = 0;
    score += (book.rating || 0) * 5 * weights.rating;
    score += Math.min(50, (book.reviews || 0) / 5) * weights.reviews;
    score += (book.featured ? 50 : 0) * weights.featured;
    score += (book.status === 'new' ? 40 : 0) * weights.newRelease;
    score += Math.min(30, Math.random() * 30) * weights.popularity;

    return {
      id: book.id,
      title: book.title,
      score: Math.round(score),
      timeframe,
    };
  }).sort((a, b) => b.score - a.score);
}

export default {
  getUserReadingProfile,
  findSimilarBooks,
  calculateRecommendations,
  getCachedRecommendations,
  saveRecommendations,
  getTrendingBooks,
  calculateTrendingScores,
};
