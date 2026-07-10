// ── Error Display Component for Ellines Haven ─────────────────────────────
// Consistent error messaging and user feedback across the application

import React, { useState, useEffect } from 'react';
import { ErrorSeverity, ErrorTypes, getErrorMessage, logError } from '../utils/errorHandler';
import './ErrorDisplay.css';

/**
 * Icons for different error types and severities
 */
const ErrorIcons = {
  [ErrorTypes.VALIDATION]: '⚠️',
  [ErrorTypes.AUTHENTICATION]: '🔐', 
  [ErrorTypes.AUTHORIZATION]: '🚫',
  [ErrorTypes.NETWORK]: '📡',
  [ErrorTypes.FIREBASE]: '🔥',
  [ErrorTypes.RATE_LIMIT]: '⏱️',
  [ErrorTypes.SERVER]: '🖥️',
  [ErrorTypes.CLIENT]: '💻',
  [ErrorTypes.UNKNOWN]: '❌'
};

const SeverityIcons = {
  [ErrorSeverity.LOW]: 'ℹ️',
  [ErrorSeverity.MEDIUM]: '⚠️', 
  [ErrorSeverity.HIGH]: '❌',
  [ErrorSeverity.CRITICAL]: '🚨'
};

/**
 * Basic error alert component
 */
export function ErrorAlert({ error, onDismiss, className = '', style = {} }) {
  if (!error) return null;

  const message = typeof error === 'string' ? error : getErrorMessage(error);
  
  return (
    <div 
      className={`error-alert ${className}`}
      style={style}
      role="alert"
      aria-live="polite"
    >
      <span className="error-alert-icon">⚠️</span>
      <span className="error-alert-message">{message}</span>
      {onDismiss && (
        <button 
          className="error-alert-close"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Success message component for positive feedback
 */
export function SuccessAlert({ message, onDismiss, className = '', style = {} }) {
  if (!message) return null;
  
  return (
    <div 
      className={`success-alert ${className}`}
      style={style}
      role="status"
      aria-live="polite"
    >
      <span className="success-alert-icon">✅</span>
      <span className="success-alert-message">{message}</span>
      {onDismiss && (
        <button 
          className="success-alert-close"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Advanced error display with retry functionality and detailed information
 */
export function ErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss,
  showDetails = false,
  autoHide = false,
  autoHideDelay = 5000,
  className = '',
  style = {}
}) {
  const [isVisible, setIsVisible] = useState(!!error);
  const [showDetailedInfo, setShowDetailedInfo] = useState(false);

  useEffect(() => {
    setIsVisible(!!error);
    if (error && autoHide) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [error, autoHide, autoHideDelay, onDismiss]);

  if (!error || !isVisible) return null;

  const message = getErrorMessage(error);
  const errorCode = typeof error === 'string' ? error : (error?.code || 'unknown');
  const errorType = error?.classification?.type || ErrorTypes.UNKNOWN;
  const errorSeverity = error?.classification?.severity || ErrorSeverity.MEDIUM;

  const handleRetry = () => {
    setIsVisible(false);
    onRetry?.();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  const severityClass = `error-display--${errorSeverity}`;
  const typeClass = `error-display--${errorType}`;

  return (
    <div 
      className={`error-display ${severityClass} ${typeClass} ${className}`}
      style={style}
      role="alert"
      aria-live="assertive"
    >
      <div className="error-display-content">
        <div className="error-display-header">
          <span className="error-display-icon">
            {ErrorIcons[errorType] || SeverityIcons[errorSeverity]}
          </span>
          <div className="error-display-text">
            <h4 className="error-display-title">
              {errorSeverity === ErrorSeverity.CRITICAL ? 'Critical Error' :
               errorSeverity === ErrorSeverity.HIGH ? 'Error' :
               errorSeverity === ErrorSeverity.MEDIUM ? 'Something went wrong' :
               'Notice'}
            </h4>
            <p className="error-display-message">{message}</p>
          </div>
        </div>

        {showDetails && (
          <div className="error-display-details">
            <button 
              className="error-display-details-toggle"
              onClick={() => setShowDetailedInfo(!showDetailedInfo)}
            >
              {showDetailedInfo ? 'Hide' : 'Show'} Details
            </button>
            
            {showDetailedInfo && (
              <div className="error-display-details-content">
                <p><strong>Error Code:</strong> {errorCode}</p>
                <p><strong>Type:</strong> {errorType}</p>
                <p><strong>Severity:</strong> {errorSeverity}</p>
                {error?.timestamp && (
                  <p><strong>Time:</strong> {new Date(error.timestamp).toLocaleString()}</p>
                )}
                {typeof error === 'object' && error?.stack && (
                  <details>
                    <summary>Technical Details</summary>
                    <pre className="error-display-stack">{error.stack}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        <div className="error-display-actions">
          {onRetry && (
            <button 
              className="error-display-retry btn btn-sm btn-primary"
              onClick={handleRetry}
            >
              Try Again
            </button>
          )}
          {onDismiss && (
            <button 
              className="error-display-dismiss btn btn-sm btn-ghost"
              onClick={handleDismiss}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Form field error display
 */
export function FieldError({ error, fieldName, className = '' }) {
  if (!error) return null;
  
  return (
    <div className={`field-error ${className}`} role="alert">
      <span className="field-error-icon">⚠️</span>
      <span className="field-error-message">{error}</span>
    </div>
  );
}

/**
 * Inline loading state with error handling
 */
export function LoadingState({ 
  isLoading, 
  error, 
  onRetry, 
  loadingText = 'Loading...', 
  children,
  className = '' 
}) {
  if (isLoading) {
    return (
      <div className={`loading-state ${className}`}>
        <div className="loading-spinner"></div>
        <span className="loading-text">{loadingText}</span>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        error={error}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  return children;
}

/**
 * Toast notification hook for temporary error/success messages
 */
export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'error', duration = 4000) => {
    setToast({ message, type, id: Date.now() });
    
    if (duration > 0) {
      setTimeout(() => {
        setToast(null);
      }, duration);
    }
  };

  const showError = (error, duration) => {
    const message = getErrorMessage(error);
    showToast(message, 'error', duration);
    
    // Log the error for debugging
    logError(error, { source: 'toast' });
  };

  const showSuccess = (message, duration) => {
    showToast(message, 'success', duration);
  };

  const hideToast = () => {
    setToast(null);
  };

  const ToastComponent = toast ? (
    <div className={`toast toast--${toast.type}`} key={toast.id}>
      {toast.type === 'error' ? (
        <ErrorAlert error={toast.message} onDismiss={hideToast} />
      ) : (
        <SuccessAlert message={toast.message} onDismiss={hideToast} />
      )}
    </div>
  ) : null;

  return {
    showError,
    showSuccess,
    hideToast,
    ToastComponent
  };
}

/**
 * Error boundary wrapper component
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logError(error, { 
      componentStack: errorInfo.componentStack,
      errorBoundary: true 
    });
    
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <ErrorDisplay
          error={this.state.error}
          onRetry={() => {
            this.setState({ hasError: false, error: null, errorInfo: null });
            this.props.onRetry?.();
          }}
          showDetails={true}
        />
      );
    }

    return this.props.children;
  }
}