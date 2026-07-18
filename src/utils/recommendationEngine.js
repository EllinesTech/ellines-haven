import { collection, query, where, getDocs, limit, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { BOOKS } from '../data/books';

/**
 * Get user's reading profile (genres, avg rating, books read)
 */
export async function getUserReadingProfile(userEmail) {
  try {
    const libraryQuery = query(
      collection(db, 'libraries'),
      where('email', '==', userEmail.toLowerCase())
    );
    const libraryDocs = await getDocs(libraryQuery);
    
    if (libraryDocs.empty) {
      return null; // No reading history
    }

    const genres = {};
    const ratings = [];
    let totalBooks = 0;

    libraryDocs.forEach(doc => {
      const book = doc.data();
      totalBooks++;
      
      // Track genres
      if (book.genres && Array.isArray(book.genres)) {
        book.genres.forEach(genre => {
          genres[genre] = (genres[genre] || 0) + 1;
        });
      }
      
      // Track ratings
      if (book.rating && typeof book.rating === 'number') {
        ratings.push(book.rating);
      }
    });

    // Get review data
    const reviewsQuery = query(
      collection(db, 'book_reviews'),
      where('email', '==', userEmail.toLowerCase())
    );
    const reviewDocs = await getDocs(reviewsQuery);
    
    reviewDocs.forEach(doc => {
      const review = doc.data();
      if (review.rating && typeof review.rating === 'number') {
        ratings.push(review.rating);
      }
      if (review.genres && Array.isArray(review.genres)) {
        review.genres.forEach(genre => {
          genres[genre] = (genres[genre] || 0) + 0.5; // Lower weight for reviews
        });
      }
    });

    const avgRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : 3.5;

    return {
      email: userEmail.toLowerCase(),
      genres,
      avgRating,
      booksRead: totalBooks,
      lastUpdated: new Date(),
      preferences: {
        genreWeight: 0.5,
        ratingWeight: 0.2,
        popularityWeight: 0.15,
        authorWeight: 0.1,
        typeWeight: 0.05
      }
    };
  } catch (error) {
    console.error('Error getting reading profile:', error);
    return null;
  }
}

/**
 * Find similar books based on genre, rating, and other factors
 */
export async function findSimilarBooks(bookId, limit = 6) {
  try {
    const book = BOOKS.find(b => b.id === bookId);
    if (!book) return [];

    const similarBooks = BOOKS.filter(b => {
      if (b.id === bookId) return false; // Exclude the book itself
      
      // Must have overlapping genres
      const hasCommonGenre = book.genres?.some(g => b.genres?.includes(g));
      return hasCommonGenre;
    });

    // Score books by similarity
    const scoredBooks = similarBooks.map(b => {
      let score = 0;

      // Genre match (0-50 points)
      if (book.genres && b.genres) {
        const commonGenres = book.genres.filter(g => b.genres.includes(g));
        score += (commonGenres.length / Math.max(book.genres.length, b.genres.length)) * 50;
      }

      // Rating similarity (0-20 points)
      const bookRating = book.rating || 3.5;
      const bookRating2 = b.rating || 3.5;
      const ratingDiff = Math.abs(bookRating - bookRating2);
      score += Math.max(0, 20 - ratingDiff * 5);

      // Popularity (0-15 points)
      const bookPopularity = book.reviews || 0;
      const bookPopularity2 = b.reviews || 0;
      score += Math.min(15, (bookPopularity2 / Math.max(bookPopularity, 1)) * 10);

      // Author (0-10 points)
      if (book.author && b.author && book.author === b.author) {
        score += 10;
      }

      // Type match (0-5 points)
      if (book.type && b.type && book.type === b.type) {
        score += 5;
      }

      return { book: b, score };
    });

    // Sort by score and return top N
    return scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.book,
        similarityScore: Math.round(item.score)
      }));
  } catch (error) {
    console.error('Error finding similar books:', error);
    return [];
  }
}

/**
 * Calculate recommendations for a user
 */
export async function calculateRecommendations(userEmail, limit = 10) {
  try {
    // Get user's reading profile
    const profile = await getUserReadingProfile(userEmail);
    
    if (!profile || Object.keys(profile.genres).length === 0) {
      // No history - return trending/featured books instead
      return getTrendingBooks(limit);
    }

    const recommendations = [];
    const seenBookIds = new Set();

    // Get books by preferred genres
    const genreEntries = Object.entries(profile.genres)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3); // Top 3 genres

    for (const [genre, count] of genreEntries) {
      BOOKS.forEach(book => {
        if (seenBookIds.has(book.id)) return;
        
        let score = 0;

        // Genre match (weight: 50%)
        if (book.genres?.includes(genre)) {
          score += 50;
        }

        // Rating match (weight: 20%)
        if (book.rating) {
          const ratingDiff = Math.abs(book.rating - profile.avgRating);
          score += Math.max(0, 20 - ratingDiff * 3);
        }

        // Popularity (weight: 15%)
        const popularity = (book.reviews || 0) / 100;
        score += Math.min(15, popularity * 5);

        // Featured books bonus (weight: 10%)
        if (book.featured) {
          score += 10;
        }

        // New releases bonus (weight: 5%)
        if (book.status === 'new' || book.type === 'series-starter') {
          score += 5;
        }

        if (score > 0) {
          recommendations.push({
            bookId: book.id,
            bookTitle: book.title,
            author: book.author,
            cover: book.cover,
            genres: book.genres,
            rating: book.rating,
            reviews: book.reviews,
            reason: generateRecommendationReason(book, genre, profile),
            score: Math.round(score),
            createdAt: new Date()
          });
        }
      });
    }

    // Sort by score and return top N
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.error('Error calculating recommendations:', error);
    return getTrendingBooks(limit);
  }
}

/**
 * Get cached recommendations for a user
 */
export async function getCachedRecommendations(userEmail) {
  try {
    const docRef = doc(db, 'book_recommendations', userEmail.toLowerCase());
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      // Check if cache is still valid (24 hours)
      const createdAt = data.createdAt?.toDate?.() || new Date(0);
      const ageMs = Date.now() - createdAt.getTime();
      const cacheValidMs = 24 * 60 * 60 * 1000;

      if (ageMs < cacheValidMs && data.recommendations?.length > 0) {
        return data.recommendations;
      }
    }
  } catch (error) {
    console.error('Error getting cached recommendations:', error);
  }
  return null;
}

/**
 * Save recommendations to Firestore
 */
export async function saveRecommendations(userEmail, recommendations) {
  try {
    const docRef = doc(db, 'book_recommendations', userEmail.toLowerCase());
    await setDoc(docRef, {
      email: userEmail.toLowerCase(),
      recommendations,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    return true;
  } catch (error) {
    console.error('Error saving recommendations:', error);
    return false;
  }
}

/**
 * Get trending books based on various metrics
 */
export function getTrendingBooks(limit = 10) {
  try {
    const scoredBooks = BOOKS.map(book => {
      let score = 0;

      // Rating (0-30 points)
      if (book.rating) {
        score += (book.rating / 5) * 30;
      }

      // Reviews/engagement (0-30 points)
      const engagementScore = Math.min(30, (book.reviews || 0) / 10);
      score += engagementScore;

      // Featured bonus (0-20 points)
      if (book.featured) {
        score += 20;
      }

      // New release bonus (0-15 points)
      if (book.status === 'new' || book.type === 'series-starter') {
        score += 15;
      }

      // Popular genres bonus (0-5 points)
      const popularGenres = ['Romance', 'Fantasy', 'Mystery', 'Sci-Fi'];
      if (book.genres?.some(g => popularGenres.includes(g))) {
        score += 5;
      }

      return { book, score };
    });

    return scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.book,
        trendingScore: Math.round(item.score)
      }));
  } catch (error) {
    console.error('Error getting trending books:', error);
    return books.slice(0, limit);
  }
}

/**
 * Generate human-readable recommendation reason
 */
function generateRecommendationReason(book, genre, profile) {
  const reasons = [
    `You love ${genre} books!`,
    `Popular in ${genre}`,
    `Highly rated (${book.rating?.toFixed(1)} ⭐)`,
    `Trending now`,
    `Readers like you enjoyed this`,
    `Similar to your favorites`,
    `Matches your reading style`
  ];

  // Pick reason based on book attributes
  if (book.featured) {
    return 'Featured & highly rated';
  }
  if (book.rating >= 4.5) {
    return `Highly rated in ${genre}`;
  }
  if ((book.reviews || 0) > 50) {
    return `Popular ${genre} book`;
  }
  
  return reasons[Math.floor(Math.random() * reasons.length)];
}

/**
 * Get trending books by category/genre
 */
export function getTrendingByCategory(genre, limit = 20) {
  try {
    const genreBooks = BOOKS.filter(book => {
      if (book.genres) {
        return book.genres.includes(genre);
      }
      return book.genre === genre;
    });

    const scoredBooks = genreBooks.map(book => {
      let score = 0;

      // Rating (0-30 points)
      if (book.rating) {
        score += (book.rating / 5) * 30;
      }

      // Reviews/engagement (0-30 points)
      const engagementScore = Math.min(30, (book.reviews || 0) / 10);
      score += engagementScore;

      // Featured bonus (0-20 points)
      if (book.featured) {
        score += 20;
      }

      // New release bonus (0-15 points)
      if (book.status === 'new' || book.type === 'series-starter') {
        score += 15;
      }

      return { book, score };
    });

    return scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.book,
        trendingScore: Math.round(item.score),
        genre
      }));
  } catch (error) {
    console.error('Error getting trending books by category:', error);
    return [];
  }
}

/**
 * Generate trending scores for books
 */
export function calculateTrendingScores(timeframe = '7d') {
  const weights = {
    rating: 0.3,
    reviews: 0.25,
    featured: 0.2,
    newRelease: 0.15,
    popularity: 0.1
  };

  return BOOKS.map(book => {
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
      timeframe
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
  calculateTrendingScores
};
