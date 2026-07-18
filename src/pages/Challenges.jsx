import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import ChallengeCard from '../components/ChallengeCard';
import {
  CHALLENGE_TYPES,
  createChallenge,
  getActiveChallenges,
  getCompletedChallenges,
  generateLeaderboard,
  getChallengeStats,
  formatChallengeForUI,
} from '../utils/challengeEngine';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import './Challenges.css';

/**
 * Challenges Page Component
 * Displays reading challenges, leaderboards, and challenge management
 */
export default function Challenges() {
  const { user, books } = useApp();
  const [userChallenges, setUserChallenges] = useState([]);
  const [leaderboards, setLeaderboards] = useState({});
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('active'); // active, completed, all
  const [filter, setFilter] = useState('all'); // all, 7day, 30day, 100day, annual
  const [error, setError] = useState(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  // Load user challenges
  useEffect(() => {
    if (!user?.email) {
      setLoading(false);
      return;
    }

    const loadChallenges = async () => {
      try {
        setLoading(true);
        const ref = collection(db, 'challenges');
        const q = query(ref, where('userEmail', '==', user.email.toLowerCase()));
        const snapshot = await getDocs(q);
        const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserChallenges(challenges);
      } catch (err) {
        console.error('[Challenges] Load failed:', err);
        setError('Failed to load challenges');
      } finally {
        setLoading(false);
      }
    };

    loadChallenges();
  }, [user?.email]);

  // Load leaderboards
  useEffect(() => {
    const loadLeaderboards = async () => {
      try {
        const ref = collection(db, 'challenge_leaderboards');
        const snapshot = await getDocs(ref);
        const lbs = {};
        snapshot.docs.forEach(doc => {
          lbs[doc.data().type] = doc.data().rankings || [];
        });
        setLeaderboards(lbs);
      } catch (err) {
        console.error('[Leaderboards] Load failed:', err);
      }
    };

    loadLeaderboards();
  }, []);

  // Start a new challenge
  const handleStartChallenge = async (type) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    try {
      const challenge = createChallenge(user.email, user.name, type);
      const ref = doc(db, 'challenges', challenge.id);
      
      await setDoc(ref, {
        ...challenge,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setUserChallenges(prev => [...prev, challenge]);
      setShowStartModal(false);
      setSelectedType(null);
    } catch (err) {
      console.error('[Start Challenge] Failed:', err);
      setError('Failed to start challenge');
    }
  };

  // Filter and sort challenges
  const filtered = userChallenges
    .filter(c => {
      if (filter !== 'all' && c.type !== filter) return false;
      if (sortBy === 'active') return c.status === 'active';
      if (sortBy === 'completed') return c.status === 'completed';
      return true;
    })
    .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

  const activeChallenges = getActiveChallenges(userChallenges);
  const completedChallenges = getCompletedChallenges(userChallenges);
  const stats = getChallengeStats(userChallenges);

  if (!user) {
    return (
      <div className="challenges-page challenges-page--not-auth">
        <div className="challenges-hero">
          <h1>Reading Challenges</h1>
          <p>Sign in to start reading challenges and earn rewards</p>
          <a href="/login" className="btn btn-primary">Sign In</a>
        </div>
      </div>
    );
  }

  return (
    <div className="challenges-page">
      {/* Header */}
      <div className="challenges-hero">
        <div className="challenges-hero__content">
          <h1 className="challenges-hero__title">📖 Reading Challenges</h1>
          <p className="challenges-hero__subtitle">
            Complete reading challenges, earn rewards, and join the leaderboards
          </p>
        </div>
      </div>

      {/* Stats */}
      <section className="challenges-stats">
        <div className="stat-card">
          <span className="stat-icon">🎯</span>
          <div className="stat-info">
            <span className="stat-label">Active Challenges</span>
            <span className="stat-value">{activeChallenges.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🏆</span>
          <div className="stat-info">
            <span className="stat-label">Completed</span>
            <span className="stat-value">{completedChallenges.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <div className="stat-info">
            <span className="stat-label">Total Rewards</span>
            <span className="stat-value">{stats.totalRewardPoints} pts</span>
          </div>
        </div>
      </section>

      {/* Error message */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* My Challenges */}
      <section className="challenges-section">
        <div className="section-header">
          <h2>My Challenges</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowStartModal(true)}
          >
            + Start Challenge
          </button>
        </div>

        {/* Filters and sort */}
        <div className="challenges-controls">
          <div className="filter-group">
            <label>Status:</label>
            <div className="filter-buttons">
              {['active', 'completed', 'all'].map(opt => (
                <button
                  key={opt}
                  className={`filter-btn ${sortBy === opt ? 'active' : ''}`}
                  onClick={() => setSortBy(opt)}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Type:</label>
            <select
              className="filter-select"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="7day">7-Day</option>
              <option value="30day">30-Day</option>
              <option value="100day">100-Day</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>

        {/* Challenges grid */}
        {loading ? (
          <div className="challenges-loading">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="challenges-grid">
            {filtered.map(challenge => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                onViewDetails={setSelectedChallenge}
                onAction={() => {}}
              />
            ))}
          </div>
        ) : (
          <div className="challenges-empty">
            <span className="empty-icon">📭</span>
            <p>No challenges yet. Start your first reading challenge!</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowStartModal(true)}
            >
              Start Your First Challenge
            </button>
          </div>
        )}
      </section>

      {/* Leaderboards */}
      <section className="challenges-section leaderboards-section">
        <h2>Leaderboards</h2>
        <div className="leaderboards-grid">
          {Object.entries(CHALLENGE_TYPES).map(([key, typeData]) => {
            const lb = leaderboards[typeData.id] || [];
            return (
              <div key={key} className="leaderboard-card">
                <h3>{typeData.name} 🏅</h3>
                {lb.length > 0 ? (
                  <div className="leaderboard-list">
                    {lb.slice(0, 5).map((entry, idx) => (
                      <div key={idx} className="leaderboard-entry">
                        <span className="rank-badge">{entry.rank}</span>
                        <span className="user-name">{entry.userName}</span>
                        <span className="time-badge">{entry.timeToComplete}d</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-leaderboard">No completed challenges yet</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Start Challenge Modal */}
      {showStartModal && (
        <ChallengeStartModal
          types={CHALLENGE_TYPES}
          onSelect={handleStartChallenge}
          onClose={() => {
            setShowStartModal(false);
            setSelectedType(null);
          }}
        />
      )}

      {/* Challenge Details Modal */}
      {selectedChallenge && (
        <ChallengeDetailsModal
          challenge={selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
        />
      )}
    </div>
  );
}

/**
 * Modal to start a new challenge
 */
function ChallengeStartModal({ types, onSelect, onClose }) {
  const typeArray = Object.entries(types).map(([key, val]) => ({ key, ...val }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Start a Reading Challenge</h2>
        <p>Choose a challenge type and begin your reading journey!</p>

        <div className="challenge-options">
          {typeArray.map(type => (
            <div
              key={type.id}
              className="challenge-option"
              onClick={() => onSelect(type.key)}
            >
              <h3>{type.name}</h3>
              <p>Goal: {type.goal} book{type.goal !== 1 ? 's' : ''}</p>
              <p className="duration">{type.duration} days</p>
              <p className="reward">💰 {type.reward} points</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Modal to show challenge details
 */
function ChallengeDetailsModal({ challenge, onClose }) {
  const formatted = formatChallengeForUI(challenge);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--large" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>{formatted.displayName}</h2>

        <div className="details-grid">
          <div className="detail-item">
            <span className="label">Status</span>
            <span className="value capitalize">{challenge.status}</span>
          </div>
          <div className="detail-item">
            <span className="label">Progress</span>
            <span className="value">{challenge.progress}/{challenge.goal} books</span>
          </div>
          <div className="detail-item">
            <span className="label">Started</span>
            <span className="value">{new Date(challenge.startedAt).toLocaleDateString()}</span>
          </div>
          {challenge.completedAt && (
            <div className="detail-item">
              <span className="label">Completed</span>
              <span className="value">{new Date(challenge.completedAt).toLocaleDateString()}</span>
            </div>
          )}
          <div className="detail-item">
            <span className="label">Reward Points</span>
            <span className="value">💰 {challenge.reward_points}</span>
          </div>
          <div className="detail-item">
            <span className="label">Time Remaining</span>
            <span className="value">{formatted.timeRemaining}</span>
          </div>
        </div>

        {challenge.books && challenge.books.length > 0 && (
          <div className="books-list">
            <h3>Books Completed</h3>
            {challenge.books.map((book, idx) => (
              <div key={idx} className="book-entry">
                <span>📖</span>
                <span>{book.title}</span>
                <span className="date">{new Date(book.completed_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
