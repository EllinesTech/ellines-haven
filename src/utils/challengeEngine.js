/**
 * Challenge Engine - PHASE 5-6
 * Handles reading challenge logic: tracking progress, calculating points, managing leaderboards
 * Integrated with Firestore for real-time challenge data
 * FIX: Challenges component now properly imported in App.jsx lazy imports
 */

// Challenge types with their goals and reward points
export const CHALLENGE_TYPES = {
  sevenDay: { id: '7day', name: '7-Day Challenge', goal: 1, reward: 50, duration: 7 },
  thirtyDay: { id: '30day', name: '30-Day Challenge', goal: 3, reward: 150, duration: 30 },
  hundredDay: { id: '100day', name: '100-Day Challenge', goal: 5, reward: 300, duration: 100 },
  annual: { id: 'annual', name: 'Annual Challenge', goal: 12, reward: 1000, duration: 365 },
};

/**
 * Generate unique challenge ID for a user
 */
export const generateChallengeId = (userEmail, type) => {
  const email = userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const now = new Date();
  const period = type === 'annual' ? now.getFullYear() : `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `ch_${email}_${type}_${period}`;
};

/**
 * Check if user can start a challenge (not already active)
 */
export const canStartChallenge = (challenges, type) => {
  const active = challenges.find(c => c.type === type && c.status === 'active');
  return !active;
};

/**
 * Calculate challenge progress percentage
 */
export const getChallengeProgress = (challenge) => {
  if (!challenge || challenge.goal === 0) return 0;
  return Math.min(100, Math.round((challenge.progress / challenge.goal) * 100));
};

/**
 * Format time remaining in human-readable format
 */
export const getTimeRemaining = (startedAt, duration) => {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  const end = new Date(start.getTime() + duration * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = end - now;
  
  if (diffMs <= 0) return 'Expired';
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
};

/**
 * Update challenge progress when user completes a book
 * Returns the updated challenge
 */
export const updateChallengeProgress = (challenge, bookCompleted) => {
  if (!challenge || challenge.status !== 'active') return challenge;
  
  const updated = {
    ...challenge,
    progress: challenge.progress + (bookCompleted ? 1 : 0),
  };
  
  // Check if challenge completed
  if (updated.progress >= updated.goal) {
    updated.status = 'completed';
    updated.completedAt = new Date().toISOString();
  }
  
  return updated;
};

/**
 * Generate leaderboard for a challenge type and period
 * Returns sorted array of users with their progress
 */
export const generateLeaderboard = (challengeData) => {
  if (!Array.isArray(challengeData)) return [];
  
  const sorted = [...challengeData]
    .filter(c => c.status === 'completed')
    .sort((a, b) => {
      // Sort by completion time (fastest first)
      const aTime = new Date(a.completedAt || a.startedAt).getTime();
      const bTime = new Date(b.completedAt || b.startedAt).getTime();
      return aTime - bTime;
    })
    .map((challenge, index) => ({
      rank: index + 1,
      userEmail: challenge.userEmail,
      userName: challenge.userName,
      progress: challenge.progress,
      completedAt: challenge.completedAt,
      timeToComplete: calculateTimeToComplete(challenge.startedAt, challenge.completedAt),
    }));
  
  return sorted;
};

/**
 * Calculate days to complete a challenge
 */
export const calculateTimeToComplete = (startedAt, completedAt) => {
  if (!startedAt || !completedAt) return null;
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, days); // At least 1 day
};

/**
 * Get all active challenges for a user
 */
export const getActiveChallenges = (challenges) => {
  return challenges.filter(c => c.status === 'active');
};

/**
 * Get completed challenges for a user
 */
export const getCompletedChallenges = (challenges) => {
  return challenges.filter(c => c.status === 'completed');
};

/**
 * Calculate total reward points earned from challenges
 */
export const calculateTotalRewardPoints = (challenges) => {
  return challenges
    .filter(c => c.status === 'completed')
    .reduce((sum, c) => sum + (c.reward_points || 0), 0);
};

/**
 * Get challenge stats for user profile
 */
export const getChallengeStats = (challenges) => {
  const active = getActiveChallenges(challenges);
  const completed = getCompletedChallenges(challenges);
  const totalPoints = calculateTotalRewardPoints(challenges);
  
  return {
    activeChallenges: active.length,
    completedChallenges: completed.length,
    totalRewardPoints: totalPoints,
    nextMilestone: completed.length === 0 ? '1 Challenge' : `${completed.length + 1} Challenges`,
  };
};

/**
 * Create new challenge for user
 */
export const createChallenge = (userEmail, userName, type) => {
  const now = new Date();
  const challengeType = CHALLENGE_TYPES[type] || CHALLENGE_TYPES.sevenDay;
  
  return {
    id: generateChallengeId(userEmail, challengeType.id),
    userEmail: userEmail.toLowerCase(),
    userName: userName,
    type: challengeType.id,
    goal: challengeType.goal,
    progress: 0,
    startedAt: now.toISOString(),
    completedAt: null,
    status: 'active',
    books: [], // Track books completed in this challenge
    reward_points: challengeType.reward,
    metadata: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      duration: challengeType.duration,
    },
  };
};

/**
 * Check if challenge is expired
 */
export const isChallengeExpired = (challenge) => {
  if (!challenge || !challenge.startedAt || !challenge.metadata?.duration) return false;
  const start = new Date(challenge.startedAt);
  const end = new Date(start.getTime() + challenge.metadata.duration * 24 * 60 * 60 * 1000);
  return new Date() > end;
};

/**
 * Format challenge data for UI display
 */
export const formatChallengeForUI = (challenge) => {
  if (!challenge) return null;
  
  const expired = isChallengeExpired(challenge);
  const progress = getChallengeProgress(challenge);
  const timeRemaining = getTimeRemaining(challenge.startedAt, challenge.metadata?.duration);
  
  return {
    ...challenge,
    displayName: CHALLENGE_TYPES[Object.keys(CHALLENGE_TYPES).find(k => CHALLENGE_TYPES[k].id === challenge.type)]?.name || challenge.type,
    progress,
    timeRemaining,
    isExpired: expired,
    isCompleted: challenge.status === 'completed',
    isActive: challenge.status === 'active' && !expired,
  };
};
