import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import './ReaderProfile.css';

/**
 * READER PROFILE PAGE (Phase 3)
 * 
 * Public reader profiles showing:
 * - Reading statistics
 * - Favorite genres
 * - Books read / currently reading
 * - Reading achievements
 * - Public reviews
 * - Option to follow reader
 */

export default function ReaderProfile() {
  const { email } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useApp();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [email]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      // Get user profile
      const userSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
      const users = userSnap.data()?.users || {};
      const profileData = users[email.replace(/[^a-z0-9]/g, '_')];

      if (!profileData) {
        navigate('/404');
        return;
      }

      setProfile(profileData);

      // Get user's library (books read)
      const libSnap = await getDoc(doc(db, 'libraries', email.toLowerCase()));
      const booksRead = libSnap.exists() ? libSnap.data().books?.length || 0 : 0;

      // Get user's reviews
      const reviewsSnap = await getDocs(
        query(collection(db, 'book_reviews'), where('reviewerEmail', '==', email.toLowerCase()))
      );
      setReviews(reviewsSnap.docs.map(d => d.data()));

      // Calculate stats
      const avgRating = reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
        : 0;

      setStats({
        booksRead,
        reviewsCount: reviews.length,
        avgRating,
        joinDate: profileData.joinDate || 'Unknown',
        favoriteGenres: profileData.favoriteGenres || [],
      });

      // Check if current user follows this reader
      if (currentUser) {
        const followSnap = await getDoc(
          doc(db, 'user_followers', currentUser.email.toLowerCase(), 'following', email.toLowerCase())
        );
        setIsFollowing(followSnap.exists());
      }
    } catch (e) {
      console.error('Error loading profile:', e);
      navigate('/404');
    }
    setLoading(false);
  };

  const toggleFollow = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    try {
      const followDocRef = doc(
        db,
        'user_followers',
        currentUser.email.toLowerCase(),
        'following',
        email.toLowerCase()
      );

      if (isFollowing) {
        // Unfollow
        // await deleteDoc(followDocRef);
        setIsFollowing(false);
      } else {
        // Follow
        await updateDoc(followDocRef, { followedAt: serverTimestamp() }, { merge: true });
        setIsFollowing(true);
      }
    } catch (e) {
      console.error('Error toggling follow:', e);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <p>Loading profile…</p>
      </div>
    );
  }

  if (!profile || !stats) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <p>Profile not found.</p>
      </div>
    );
  }

  return (
    <div className="reader-profile">
      <div className="reader-profile-header">
        {/* Avatar */}
        <div className="reader-profile-avatar">
          {profile.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="reader-profile-info">
          <h1>{profile.name}</h1>
          <p className="reader-profile-email">{email}</p>
          <p className="reader-profile-joined">Joined {new Date(stats.joinDate).toLocaleDateString()}</p>

          {/* Follow Button */}
          {currentUser && currentUser.email !== email && (
            <button
              className={`btn ${isFollowing ? 'btn-outline' : 'btn-primary'}`}
              onClick={toggleFollow}
              style={{ marginTop: 12 }}
            >
              {isFollowing ? '✓ Following' : '+ Follow'}
            </button>
          )}
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="reader-profile-stats">
        <div className="stat-card">
          <div className="stat-value">{stats.booksRead}</div>
          <div className="stat-label">Books Read</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.reviewsCount}</div>
          <div className="stat-label">Reviews Written</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.avgRating}⭐</div>
          <div className="stat-label">Avg Rating</div>
        </div>
      </div>

      {/* Favorite Genres */}
      {stats.favoriteGenres.length > 0 && (
        <div className="reader-profile-section">
          <h2>Favorite Genres</h2>
          <div className="genres-list">
            {stats.favoriteGenres.map(genre => (
              <span key={genre} className="genre-tag">
                {genre}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="reader-profile-section">
          <h2>Recent Reviews</h2>
          <div className="reviews-list">
            {reviews.slice(0, 5).map(review => (
              <div key={review.id} className="review-card">
                <div className="review-header">
                  <strong>{review.bookTitle}</strong>
                  <span className="rating">{'⭐'.repeat(review.rating)}</span>
                </div>
                <p className="review-text">{review.text}</p>
                <small className="review-date">
                  {new Date(review.createdAt?.seconds * 1000).toLocaleDateString()}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* About Section */}
      <div className="reader-profile-section">
        <h2>About</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
          {profile.bio || 'This reader hasn\'t written a bio yet.'}
        </p>
      </div>
    </div>
  );
}
