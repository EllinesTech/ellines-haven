import React from 'react';
import { getChallengeProgress, getTimeRemaining, formatChallengeForUI } from '../utils/challengeEngine';
import './ChallengeCard.css';

/**
 * ChallengeCard Component
 * Displays a single reading challenge card with progress, details, and action
 */
export default function ChallengeCard({ challenge, onViewDetails, onAction, actionLabel, variant = 'default' }) {
  if (!challenge) return null;
  
  const formatted = formatChallengeForUI(challenge);
  const progress = getChallengeProgress(challenge);
  const timeRemaining = getTimeRemaining(challenge.startedAt, challenge.metadata?.duration);
  
  // Determine card appearance based on status
  const getStatusIcon = () => {
    if (challenge.status === 'completed') return '🏆';
    if (formatted.isExpired) return '⏰';
    return '📖';
  };
  
  const getStatusClass = () => {
    if (challenge.status === 'completed') return 'completed';
    if (formatted.isExpired) return 'expired';
    return 'active';
  };
  
  return (
    <div className={`challenge-card challenge-card--${variant} challenge-card--${getStatusClass()}`}>
      {/* Header with icon and title */}
      <div className="challenge-card__header">
        <span className="challenge-card__icon">{getStatusIcon()}</span>
        <div className="challenge-card__title-group">
          <h3 className="challenge-card__title">{formatted.displayName}</h3>
          <p className="challenge-card__status">{challenge.status}</p>
        </div>
      </div>
      
      {/* Goal and progress info */}
      <div className="challenge-card__info">
        <div className="challenge-card__goal">
          <span className="label">Goal</span>
          <span className="value">{challenge.goal} book{challenge.goal !== 1 ? 's' : ''}</span>
        </div>
        <div className="challenge-card__reward">
          <span className="label">Reward</span>
          <span className="value">💰 {challenge.reward_points} pts</span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="challenge-card__progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-text">
          {challenge.progress}/{challenge.goal} completed
        </span>
      </div>
      
      {/* Time remaining or completion info */}
      <div className="challenge-card__footer">
        {challenge.status === 'completed' ? (
          <span className="completion-date">
            Completed {formatDate(new Date(challenge.completedAt))}
          </span>
        ) : (
          <span className={`time-remaining ${formatted.isExpired ? 'expired' : ''}`}>
            {timeRemaining}
          </span>
        )}
      </div>
      
      {/* Actions */}
      {actionLabel && onAction && (
        <button
          className={`challenge-card__action ${challenge.status === 'completed' ? 'disabled' : ''}`}
          onClick={() => onAction(challenge)}
          disabled={challenge.status === 'completed'}
        >
          {actionLabel}
        </button>
      )}
      
      {/* Details link */}
      {onViewDetails && (
        <button
          className="challenge-card__details"
          onClick={() => onViewDetails(challenge)}
        >
          View Details →
        </button>
      )}
    </div>
  );
}

/**
 * Format date to readable string
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
