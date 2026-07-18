import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { CHALLENGE_TYPES, getChallengeStats, generateLeaderboard } from '../../utils/challengeEngine';

/**
 * Challenges Admin Panel
 * Manage, monitor, and analyze user challenges and leaderboards
 */
export default function ChallengesPanel() {
  const [challenges, setChallenges] = useState([]);
  const [leaderboards, setLeaderboards] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, active, completed, 7day, 30day, 100day, annual
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  // Load all challenges
  useEffect(() => {
    const loadChallenges = async () => {
      try {
        setLoading(true);
        const ref = collection(db, 'challenges');
        const q = query(ref, orderBy('startedAt', 'desc'), limit(500));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setChallenges(data);

        // Generate leaderboards
        const lbs = {};
        Object.values(CHALLENGE_TYPES).forEach(type => {
          const challenges_for_type = data.filter(c => c.type === type.id);
          lbs[type.id] = generateLeaderboard(challenges_for_type);
        });
        setLeaderboards(lbs);

        // Calculate global stats
        const completed = data.filter(c => c.status === 'completed').length;
        const active = data.filter(c => c.status === 'active').length;
        const totalPoints = data
          .filter(c => c.status === 'completed')
          .reduce((sum, c) => sum + (c.reward_points || 0), 0);

        setStats({
          totalChallenges: data.length,
          activeChallenges: active,
          completedChallenges: completed,
          totalRewardPointsDistributed: totalPoints,
          avgCompletionTime: Math.round(
            data
              .filter(c => c.completedAt)
              .reduce((sum, c) => {
                const start = new Date(c.startedAt);
                const end = new Date(c.completedAt);
                return sum + (end - start) / (1000 * 60 * 60 * 24);
              }, 0) / Math.max(1, data.filter(c => c.completedAt).length)
          ),
        });
      } catch (err) {
        console.error('[ChallengesPanel] Load failed:', err);
      } finally {
        setLoading(false);
      }
    };

    loadChallenges();
  }, []);

  // Apply filters
  const filtered = challenges.filter(c => {
    if (filter === 'active') return c.status === 'active';
    if (filter === 'completed') return c.status === 'completed';
    if (filter.includes('day') && filter !== 'all') return c.type === filter;
    return true;
  });

  const handleCompleteChallenge = async (challengeId) => {
    try {
      await updateDoc(doc(db, 'challenges', challengeId), {
        status: 'completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Refresh challenges
      setChallenges(prev => prev.map(c =>
        c.id === challengeId
          ? { ...c, status: 'completed', completedAt: new Date().toISOString() }
          : c
      ));
    } catch (err) {
      console.error('[Complete challenge] Failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="adm-page">
        <div className="adm-page-head">
          <h2>📖 Challenges</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📖 Challenges Management</h1>
          <span className="adm-page-sub">Monitor user reading challenges, leaderboards, and engagement</span>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="adm-stats-grid cols-5" style={{ marginBottom: '2rem' }}>
          <div className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ fontSize: '1.4rem' }}>📊</div>
            <div className="adm-stat-body">
              <strong>{stats.totalChallenges}</strong>
              <span>Total Challenges</span>
            </div>
          </div>
          <div className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ fontSize: '1.4rem' }}>🎯</div>
            <div className="adm-stat-body">
              <strong>{stats.activeChallenges}</strong>
              <span>Active</span>
            </div>
          </div>
          <div className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ fontSize: '1.4rem' }}>✅</div>
            <div className="adm-stat-body">
              <strong>{stats.completedChallenges}</strong>
              <span>Completed</span>
            </div>
          </div>
          <div className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ fontSize: '1.4rem' }}>⏱️</div>
            <div className="adm-stat-body">
              <strong>{stats.avgCompletionTime}d</strong>
              <span>Avg Completion</span>
            </div>
          </div>
          <div className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ fontSize: '1.4rem' }}>💰</div>
            <div className="adm-stat-body">
              <strong>{stats.totalRewardPointsDistributed.toLocaleString()}</strong>
              <span>Total Points</span>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboards Preview */}
      <div className="adm-section" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0 }}>Leaderboard Preview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {Object.entries(leaderboards).map(([typeId, rankings]) => (
            <div key={typeId} className="card" style={{ padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>
                {CHALLENGE_TYPES[Object.keys(CHALLENGE_TYPES).find(k => CHALLENGE_TYPES[k].id === typeId)]?.name || typeId}
              </h4>
              {rankings.length > 0 ? (
                <table style={{ width: '100%', fontSize: '0.85rem' }}>
                  <tbody>
                    {rankings.slice(0, 3).map((entry, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', padding: '0.5rem 0' }}>
                        <td style={{ padding: '0.5rem' }}>#{entry.rank}</td>
                        <td style={{ padding: '0.5rem' }}>{entry.userName}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{entry.timeToComplete}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No completed challenges</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Challenges Table */}
      <div className="adm-section">
        <h3 style={{ marginTop: 0 }}>Challenges List</h3>

        {/* Filter */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            className="field"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ padding: '0.5rem' }}
          >
            <option value="all">All Challenges</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="7day">7-Day</option>
            <option value="30day">30-Day</option>
            <option value="100day">100-Day</option>
            <option value="annual">Annual</option>
          </select>
          <span style={{ color: 'var(--text-secondary)' }}>{filtered.length} results</span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>User</th>
                <th>Challenge</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Reward</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(challenge => (
                <tr key={challenge.id}>
                  <td>
                    <a href={`/reader/${encodeURIComponent(challenge.userEmail)}`} style={{ color: 'var(--gold)' }}>
                      {challenge.userName || challenge.userEmail}
                    </a>
                  </td>
                  <td>{CHALLENGE_TYPES[Object.keys(CHALLENGE_TYPES).find(k => CHALLENGE_TYPES[k].id === challenge.type)]?.name}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ flex: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            background: 'var(--gold)',
                            width: `${Math.round((challenge.progress / challenge.goal) * 100)}%`,
                          }}
                        />
                      </div>
                      <span>{challenge.progress}/{challenge.goal}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{
                      background: challenge.status === 'completed' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(74, 158, 255, 0.2)',
                      color: challenge.status === 'completed' ? '#2ecc71' : '#4a9eff',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      textTransform: 'capitalize',
                    }}>
                      {challenge.status}
                    </span>
                  </td>
                  <td>{new Date(challenge.startedAt).toLocaleDateString()}</td>
                  <td>
                    {challenge.completedAt
                      ? new Date(challenge.completedAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>
                    <span style={{ background: 'rgba(201, 168, 76, 0.2)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                      💰 {challenge.reward_points}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setSelectedChallenge(challenge)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        padding: '0.25rem 0.5rem',
                      }}
                      title="View Details"
                    >
                      👁️
                    </button>
                    {challenge.status === 'active' && (
                      <button
                        onClick={() => handleCompleteChallenge(challenge.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          padding: '0.25rem 0.5rem',
                        }}
                        title="Mark as Complete"
                      >
                        ✓
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedChallenge && (
        <div className="adm-overlay" onClick={() => setSelectedChallenge(null)}>
          <div className="adm-confirm card" style={{ maxWidth: '500px', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
            <button
              className="adm-close-btn"
              onClick={() => setSelectedChallenge(null)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem' }}
            >
              ✕
            </button>
            <h2 style={{ marginTop: 0 }}>Challenge Details</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>User</span>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{selectedChallenge.userName || selectedChallenge.userEmail}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Challenge Type</span>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  {CHALLENGE_TYPES[Object.keys(CHALLENGE_TYPES).find(k => CHALLENGE_TYPES[k].id === selectedChallenge.type)]?.name}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Progress</span>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{selectedChallenge.progress}/{selectedChallenge.goal} books</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Status</span>
                <div style={{ fontSize: '1rem', fontWeight: 600, textTransform: 'capitalize' }}>{selectedChallenge.status}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Started</span>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{new Date(selectedChallenge.startedAt).toLocaleString()}</div>
              </div>
              {selectedChallenge.completedAt && (
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Completed</span>
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>{new Date(selectedChallenge.completedAt).toLocaleString()}</div>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Reward Points</span>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>💰 {selectedChallenge.reward_points}</div>
              </div>
            </div>

            {selectedChallenge.books && selectedChallenge.books.length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: '0 0 1rem 0' }}>Books Completed</h3>
                {selectedChallenge.books.map((book, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <span>📖</span>
                    <span>{book.title}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {new Date(book.completed_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
