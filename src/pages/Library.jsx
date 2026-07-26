import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import BookCard from '../components/BookCard';
import { useApp } from '../context/AppContext';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import { GENRES } from '../data/books';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { usePageMeta } from '../hooks/usePageMeta';
import './Library.css';

const LIB_DEFAULTS = {
  hero_badge:          'Complete Collection',
  hero_heading:        'The Library',
  hero_sub:            'Every novel & short story by Elijah Mwangi M — original fiction drawn from real East African life.',
  search_placeholder:  'Search by title, genre or author…',
  empty_heading:       'No books found',
  empty_sub:           'Try adjusting your filters or search term.',
};

function useLibContent() {
  const [c, setC] = useState(LIB_DEFAULTS);
  useEffect(() => {
    getDoc(doc(db, 'site_data', 'library_content')).then(snap => {
      if (snap.exists()) setC(prev => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);
  return c;
}

const STATUS_FILTERS = [
  { value:'',             label:'All',          icon:'📚' },
  { value:'complete',     label:'Complete',     icon:'✅' },
  { value:'ongoing',      label:'Ongoing',      icon:'📖' },
  { value:'premium',      label:'Premium',      icon:'⭐' },
  { value:'free-preview', label:'Free Preview', icon:'👀' },
  { value:'coming-soon',  label:'Coming Soon',  icon:'🔜' },
  { value:'limited',      label:'Limited',      icon:'⏳' },
];

const TYPE_TABS = [
  { value: '',             label: 'All Works' },
  { value: 'novel',        label: 'Novels' },
  { value: 'short-story',  label: 'Short Stories' },
];

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'rating',     label: 'Top Rated' },
  { value: 'price-asc',  label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
];

const GENRE_ICONS = {
  // Primary
  Romance: '💕', Mystery: '🔍', Fantasy: '🌙', 'Sci-Fi': '🚀',
  Historical: '📜', 'Short Stories': '✍️', Drama: '🎭', Adventure: '⚔️',
  // Sub-genres
  'Contemporary Fiction': '🏙️', 'Relationship Drama': '💔', 'Literary Fiction': '📖', 'African Fiction': '🌍',
  'Emotional Drama': '🫀', 'Psychological Fiction': '🧠', 'Urban Fiction': '🌆',
  'Historical Fiction': '🏛️', 'African Literature': '✊', 'Family Saga': '👨‍👩‍👧‍👦',
  'Short Story Collection': '📝', 'East African Fiction': '🦁',
  'Thriller': '⚡', 'African Crime Fiction': '🕵️',
  'Epic Fantasy': '🐉', 'East African Mythology': '⚡',
  'Epistolary Fiction': '✉️',
};

const PRIMARY_GENRES = ['Romance','Mystery','Fantasy','Sci-Fi','Historical','Short Stories','Drama','Adventure'];

const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconEmpty = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="13" y2="12"/>
  </svg>
);

const IconLock = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

export default function Library() {
  const { books: allBooks, myPerms } = useApp();
  usePageMeta({
    title: 'The Library',
    description: 'Browse all novels and short stories by Elijah Mwangi M — original East African fiction. Buy, read online, and download.',
  });
  const editCtx = useEditMode();
  const lc = useLibContent();
  // Merge edit context on top when editing
  const cv = (editCtx?.editMode && editCtx?.pageKey === 'library_content')
    ? { ...lc, ...editCtx.pageData } : lc;
  const [params, setParams] = useSearchParams();
  const [search, setSearch]     = useState('');
  const [sort, setSort]         = useState('newest');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchRef = useRef(null);

  const genre  = params.get('genre')  || '';
  const type   = params.get('type')   || '';
  const status = params.get('status') || '';

  // close sidebar on outside click (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e) => {
      if (!e.target.closest('.lib-sidebar') && !e.target.closest('.lib-filter-toggle')) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [sidebarOpen]);

  if (myPerms && myPerms.canBrowse === false) {
    return (
      <main className="lib-restricted">
        <div className="lib-restricted__icon"><IconLock /></div>
        <h2>Library Access Restricted</h2>
        <p>You don't have permission to browse the library.</p>
        <Link to="/" className="btn btn-primary">Go Home</Link>
      </main>
    );
  }

  const books = useMemo(() => {
    let r = allBooks.filter(b => b.active !== false);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q) ||
        (b.genres || []).some(g => g.toLowerCase().includes(q)) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.themes || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (genre) r = r.filter(b =>
      b.genre === genre ||
      (b.genres || []).includes(genre)
    );
    if (type)   r = r.filter(b => b.type  === type);
    if (status) r = r.filter(b => (b.status || 'complete') === status);
    if (sort === 'newest')     r.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sort === 'rating')     r.sort((a, b) => b.rating - a.rating);
    if (sort === 'price-asc')  r.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') r.sort((a, b) => b.price - a.price);
    return r;
  }, [search, genre, type, status, sort, allBooks]);

  const setGenre  = g => { const p = new URLSearchParams(params); g ? p.set('genre', g) : p.delete('genre'); setParams(p); };
  const setType   = t => { const p = new URLSearchParams(params); t ? p.set('type', t)  : p.delete('type');  setParams(p); };
  const setStatus = s => { const p = new URLSearchParams(params); s ? p.set('status',s) : p.delete('status'); setParams(p); };
  const clear = () => { setSearch(''); setParams({}); };

  const hasFilters = genre || type || search || status;
  const activeStatusMeta = STATUS_FILTERS.find(s => s.value === status);

  return (
    <main className="lib-page">

      {/* ── Hero Header ── */}
      <header className="lib-hero">
        <div className="lib-hero__glow" aria-hidden="true" />
        <div className="lib-hero__orb lib-hero__orb--1" aria-hidden="true" />
        <div className="lib-hero__orb lib-hero__orb--2" aria-hidden="true" />
        <div className="container lib-hero__inner">
          <p className="lib-hero__brand">Ellines Haven</p>
          <span className="lib-hero__badge">
            <EditableField field="hero_badge">{cv.hero_badge}</EditableField>
          </span>
          <h1>The <span className="gold-text">Library</span></h1>
          <p className="lib-hero__sub">
            Every novel &amp; short story by <strong>Elijah Mwangi M</strong> —{' '}
            <EditableField field="hero_sub" multiline>
              {cv.hero_sub.replace(/^Every novel.*?— ?/, '')}
            </EditableField>
          </p>
          <div className="lib-hero__search">
            <span className="lib-hero__search-icon"><IconSearch /></span>
            <input
              ref={searchRef}
              className="lib-hero__search-input"
              placeholder={cv.search_placeholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search books"
            />
            {search && (
              <button
                type="button"
                className="lib-hero__search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >✕</button>
            )}
          </div>
        </div>
      </header>

      {/* ── Type tabs (sticky) ── */}
      <div className="lib-type-bar">
        <div className="container lib-type-bar__inner">
          <div className="lib-type-tabs">
            {TYPE_TABS.map(t => (
              <button
                key={t.value}
                type="button"
                className={`lib-type-tab${type === t.value ? ' lib-type-tab--on' : ''}`}
                onClick={() => setType(t.value)}
              >{t.label}</button>
            ))}
          </div>
          <div className="lib-type-bar__right">
            <span className="lib-count">
              <strong>{books.length}</strong> {books.length === 1 ? 'book' : 'books'}
              {hasFilters && (
                <button type="button" className="lib-clear-inline" onClick={clear}>× Clear</button>
              )}
            </span>
            <select className="lib-sort-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort books">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" className="lib-filter-toggle" onClick={() => setSidebarOpen(s => !s)}>
              Filters {hasFilters && <span className="lib-filter-dot" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Genre chips row ── */}
      <div className="lib-genre-bar">
        <div className="container lib-genre-bar__inner">
          <button
            type="button"
            className={`lib-genre-chip${!genre ? ' lib-genre-chip--on' : ''}`}
            onClick={() => setGenre('')}
          >All</button>
          {GENRES.map(g => (
            <button
              key={g}
              type="button"
              className={`lib-genre-chip${genre === g ? ' lib-genre-chip--on' : ''}${!PRIMARY_GENRES.includes(g) ? ' lib-genre-chip--sub' : ''}`}
              onClick={() => setGenre(g)}
            >
              <span>{GENRE_ICONS[g] || '📚'}</span> {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="container lib-layout">

        {/* Sidebar */}
        <aside className={`lib-sidebar${sidebarOpen ? ' lib-sidebar--open' : ''}`}>
          <div className="lib-sidebar__header">
            <span>Filters</span>
            <button type="button" className="lib-sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close filters">✕</button>
          </div>

          <div className="lib-sidebar__section">
            <h4 className="lib-sidebar__heading">Status</h4>
            {STATUS_FILTERS.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                className={`lib-filt-btn${status === value ? ' lib-filt-btn--on' : ''}`}
                onClick={() => { setStatus(value); setSidebarOpen(false); }}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>

          <div className="lib-sidebar__section">
            <h4 className="lib-sidebar__heading">Genre</h4>
            <button
              type="button"
              className={`lib-filt-btn${!genre ? ' lib-filt-btn--on' : ''}`}
              onClick={() => { setGenre(''); setSidebarOpen(false); }}
            >📚 All Genres</button>
            {GENRES.map(g => (
              <button
                key={g}
                type="button"
                className={`lib-filt-btn${genre === g ? ' lib-filt-btn--on' : ''}`}
                onClick={() => { setGenre(g); setSidebarOpen(false); }}
              >
                <span>{GENRE_ICONS[g] || '📚'}</span> {g}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm lib-sidebar__clear"
              onClick={() => { clear(); setSidebarOpen(false); }}
            >
              × Clear All Filters
            </button>
          )}
        </aside>

        {/* Sidebar backdrop (mobile) */}
        {sidebarOpen && <div className="lib-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        {/* Book grid */}
        <div className="lib-main">

          {/* Active filter chips */}
          {hasFilters && (
            <div className="lib-active-filters">
              {genre && <span className="lib-chip">{GENRE_ICONS[genre]} {genre} <button type="button" onClick={() => setGenre('')}>×</button></span>}
              {status && activeStatusMeta && <span className="lib-chip">{activeStatusMeta.icon} {activeStatusMeta.label} <button type="button" onClick={() => setStatus('')}>×</button></span>}
              {search && <span className="lib-chip">"{search}" <button type="button" onClick={() => setSearch('')}>×</button></span>}
            </div>
          )}

          {books.length === 0 ? (
            <div className="lib-empty">
              <div className="lib-empty__icon"><IconEmpty /></div>
              <h3><EditableField field="empty_heading">{cv.empty_heading}</EditableField></h3>
              <p><EditableField field="empty_sub">{cv.empty_sub}</EditableField></p>
              <button type="button" className="btn btn-outline lib-empty__cta" onClick={clear}>Clear Filters</button>
            </div>
          ) : (
            <div className="lib-books-grid">
              {books.map(b => <BookCard key={b.id} book={b} />)}
            </div>
          )}
        </div>
      </div>

    </main>
  );
}
