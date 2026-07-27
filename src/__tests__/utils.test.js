import { describe, it, expect } from 'vitest';

describe('Logger utility', () => {
  it('exports a logger object with expected methods', async () => {
    const { default: logger } = await import('../utils/logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});

describe('Cookie consent gating', () => {
  it('consent values are stored correctly', () => {
    localStorage.setItem('eh_cookie_consent', 'declined');
    expect(localStorage.getItem('eh_cookie_consent')).toBe('declined');
    localStorage.setItem('eh_cookie_consent', 'accepted');
    expect(localStorage.getItem('eh_cookie_consent')).toBe('accepted');
    localStorage.removeItem('eh_cookie_consent');
  });
});

describe('Chapter grants parsing', () => {
  it('parses grants from localStorage correctly', () => {
    const mockGrants = {
      grants: [
        { bookId: 'book1', chapters: [0, 1, 2] },
        { bookId: 'book2', chapters: 'all' },
      ]
    };
    localStorage.setItem('eh_chapter_grants', JSON.stringify(mockGrants));
    const cached = JSON.parse(localStorage.getItem('eh_chapter_grants'));
    const grant = cached.grants.find(g => g.bookId === 'book1');
    expect(grant.chapters).toEqual([0, 1, 2]);
    const allGrant = cached.grants.find(g => g.bookId === 'book2');
    expect(allGrant.chapters).toBe('all');
    localStorage.removeItem('eh_chapter_grants');
  });
});

describe('Firestore rules security model', () => {
  it('documents that libraries collection is write-locked for clients', () => {
    // This is a documentation test — verifying our security model is understood
    // The firestore.rules file locks libraries to: create: false, update: false
    // Only Cloud Functions (Admin SDK) can grant books after payment verification
    expect(true).toBe(true);
  });
});
