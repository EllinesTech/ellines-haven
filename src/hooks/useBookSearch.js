import { useMemo, useState, useCallback } from 'react';

/**
 * Custom hook for searching and filtering books
 * Provides full-text search, genre/author/price filtering, and sorting
 */
export function useBookSearch(books = []) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    genres: [],
    authors: [],
    priceRange: { min: 0, max: Infinity },
    minRating: 0,
    language: 'all',
    sortBy: 'relevance', // relevance, price-low, price-high, newest, rating
  });

  // Extract unique authors and genres from books
  const metadata = useMemo(() => {
    const genres = new Set();
    const authors = new Set();
    const maxPrice = 0;

    books.forEach(book => {
      if (book.genre) {
        if (Array.isArray(book.genre)) {
          book.genre.forEach(g => genres.add(g));
        } else {
          genres.add(book.genre);
        }
      }
      if (book.author) authors.add(book.author);
      if (book.price && book.price > maxPrice) maxPrice = book.price;
    });

    return {
      genres: Array.from(genres).sort(),
      authors: Array.from(authors).sort(),
      maxPrice: Math.max(1000, Math.ceil(maxPrice / 100) * 100),
    };
  }, [books]);

  // Search and filter logic
  const results = useMemo(() => {
    let filtered = [...books];

    // Text search (title, author, description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(book =>
        (book.title?.toLowerCase().includes(query)) ||
        (book.author?.toLowerCase().includes(query)) ||
        (book.description?.toLowerCase().includes(query)) ||
        (book.genre && (Array.isArray(book.genre) 
          ? book.genre.some(g => g.toLowerCase().includes(query))
          : book.genre.toLowerCase().includes(query)))
      );
    }

    // Genre filter
    if (filters.genres.length > 0) {
      filtered = filtered.filter(book => {
        const bookGenres = Array.isArray(book.genre) ? book.genre : [book.genre];
        return bookGenres.some(g => filters.genres.includes(g));
      });
    }

    // Author filter
    if (filters.authors.length > 0) {
      filtered = filtered.filter(book =>
        filters.authors.includes(book.author)
      );
    }

    // Price range filter
    filtered = filtered.filter(book =>
      (book.price || 0) >= filters.priceRange.min &&
      (book.price || 0) <= filters.priceRange.max
    );

    // Rating filter
    if (filters.minRating > 0) {
      filtered = filtered.filter(book =>
        (book.rating || 0) >= filters.minRating
      );
    }

    // Language filter
    if (filters.language !== 'all') {
      filtered = filtered.filter(book =>
        (book.language || 'English') === filters.language
      );
    }

    // Sorting
    switch (filters.sortBy) {
      case 'price-low':
        filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-high':
        filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'newest':
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'relevance':
      default:
        // If there's a search query, boost exact title matches to top
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered.sort((a, b) => {
            const aMatches = a.title?.toLowerCase().startsWith(query) ? 1 : 0;
            const bMatches = b.title?.toLowerCase().startsWith(query) ? 1 : 0;
            return bMatches - aMatches;
          });
        }
        break;
    }

    return filtered;
  }, [books, searchQuery, filters]);

  const updateSearch = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setFilters({
      genres: [],
      authors: [],
      priceRange: { min: 0, max: metadata.maxPrice },
      minRating: 0,
      language: 'all',
      sortBy: 'relevance',
    });
  }, [metadata.maxPrice]);

  return {
    results,
    searchQuery,
    filters,
    metadata,
    updateSearch,
    updateFilters,
    clearFilters,
    resultCount: results.length,
  };
}
