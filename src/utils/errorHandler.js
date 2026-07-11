// ── Error handling utilities for Ellines Haven ──────────────────────────
// Centralized error handling, logging, and user-friendly error messages

/**
 * Error types for categorization and handling
 */
export const ErrorTypes = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization', 
  NETWORK: 'network',
  FIREBASE: 'firebase',
  RATE_LIMIT: 'rate_limit',
  SERVER: 'server',
  CLIENT: 'client',
  UNKNOWN: 'unknown'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium', 
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * User-friendly error messages mapped to error codes/types
 */
const ErrorMessages = {
  // Authentication errors
  'auth/user-not-found': 'No account found with this email address. Please check your email or create an account.',
  'auth/wrong-password': 'Incorrect password. Please check your password and try again.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password should be at least 6 characters long.',
  'auth/email-already-in-use': 'An account with this email already exists. Please sign in instead.',
  'auth/too-many-requests': 'Too many failed attempts. Please wait a few minutes before trying again.',
  'auth/network-request-failed': 'Network connection failed. Please check your internet connection and try again.',
  'auth/internal-error': 'Something went wrong on our end. Please try again in a moment.',
  
  // Firestore errors
  'permission-denied': 'You don\'t have permission to access this resource. Please sign in or contact support.',
  'not-found': 'The requested content was not found. It may have been moved or deleted.',
  'already-exists': 'This item already exists. Please try with different details.',
  'resource-exhausted': 'Too many requests. Please wait a moment and try again.',
  'deadline-exceeded': 'Request timed out. Please check your connection and try again.',
  'unavailable': 'Service temporarily unavailable. Please try again in a few minutes.',
  
  // Validation errors
  'validation/required-field': 'This field is required.',
  'validation/invalid-email': 'Please enter a valid email address.',
  'validation/password-mismatch': 'Passwords do not match.',
  'validation/weak-password': 'Password must be stronger. Use at least 8 characters with numbers and symbols.',
  
  // Generic errors
  'network-error': 'Network connection failed. Please check your internet and try again.',
  'server-error': 'Something went wrong on our servers. We\'re working to fix it.',
  'client-error': 'There was a problem with your request. Please try again.',
  'rate-limit': 'You\'re doing that too often. Please wait a moment before trying again.',
  'maintenance': 'We\'re performing maintenance. Please try again shortly.',
  
  // Default fallbacks
  'unknown': 'An unexpected error occurred. Please try again or contact support if the problem persists.'
};

/**
 * Error classification utility
 * @param {Error|string} error - Error object or error code
 * @returns {object} { type: string, severity: string, code: string }
 */
export function classifyError(error) {
  const errorCode = typeof error === 'string' ? error : (error?.code || error?.message || 'unknown');
  const errorMessage = typeof error === 'string' ? error : (error?.message || '');

  // Authentication errors
  if (errorCode.startsWith('auth/') || ['user-not-found', 'wrong-password', 'invalid-email'].includes(errorCode)) {
    return {
      type: ErrorTypes.AUTHENTICATION,
      severity: errorCode === 'auth/too-many-requests' ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
      code: errorCode
    };
  }

  // Authorization errors
  if (errorCode === 'permission-denied' || errorMessage.includes('permission')) {
    return {
      type: ErrorTypes.AUTHORIZATION,
      severity: ErrorSeverity.MEDIUM,
      code: errorCode
    };
  }

  // Network errors
  if (errorCode.includes('network') || errorCode === 'unavailable' || errorMessage.includes('fetch')) {
    return {
      type: ErrorTypes.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      code: errorCode
    };
  }

  // Rate limiting
  if (errorCode.includes('too-many') || errorCode === 'resource-exhausted') {
    return {
      type: ErrorTypes.RATE_LIMIT,
      severity: ErrorSeverity.HIGH,
      code: errorCode
    };
  }

  // Validation errors
  if (errorCode.startsWith('validation/') || errorMessage.includes('required') || errorMessage.includes('invalid')) {
    return {
      type: ErrorTypes.VALIDATION,
      severity: ErrorSeverity.LOW,
      code: errorCode
    };
  }

  // Firebase errors
  if (errorCode.includes('firestore') || errorCode.includes('firebase') || 
      ['not-found', 'already-exists', 'deadline-exceeded'].includes(errorCode)) {
    return {
      type: ErrorTypes.FIREBASE,
      severity: ErrorSeverity.MEDIUM,
      code: errorCode
    };
  }

  // Server errors (5xx equivalent)
  if (errorCode.includes('internal') || errorCode.includes('server')) {
    return {
      type: ErrorTypes.SERVER,
      severity: ErrorSeverity.HIGH,
      code: errorCode
    };
  }

  // Default to unknown
  return {
    type: ErrorTypes.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    code: errorCode
  };
}

/**
 * Get user-friendly error message
 * @param {Error|string} error - Error object or error code
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(error) {
  const errorCode = typeof error === 'string' ? error : (error?.code || error?.message || 'unknown');
  
  // Direct lookup first
  if (ErrorMessages[errorCode]) {
    return ErrorMessages[errorCode];
  }

  // Partial matches for Firebase auth errors
  const authCodeMatch = Object.keys(ErrorMessages).find(key => 
    key.startsWith('auth/') && errorCode.includes(key.replace('auth/', ''))
  );
  if (authCodeMatch) {
    return ErrorMessages[authCodeMatch];
  }

  // Fallback based on error classification
  const classification = classifyError(error);
  switch (classification.type) {
    case ErrorTypes.AUTHENTICATION:
      return 'Authentication failed. Please check your credentials and try again.';
    case ErrorTypes.AUTHORIZATION:
      return 'You don\'t have permission to perform this action.';
    case ErrorTypes.NETWORK:
      return 'Connection problem. Please check your internet and try again.';
    case ErrorTypes.VALIDATION:
      return 'Please check your input and try again.';
    case ErrorTypes.RATE_LIMIT:
      return 'Too many requests. Please wait a moment before trying again.';
    case ErrorTypes.FIREBASE:
      return 'Database connection issue. Please try again in a moment.';
    case ErrorTypes.SERVER:
      return 'Server error. We\'re working to fix it.';
    default:
      return ErrorMessages.unknown;
  }
}

/**
 * Log error for debugging and monitoring
 * @param {Error|string} error - Error to log
 * @param {object} context - Additional context (user, action, etc.)
 * @param {boolean} skipConsole - Whether to skip console logging
 */
export function logError(error, context = {}, skipConsole = false) {
  const classification = classifyError(error);
  const timestamp = new Date().toISOString();
  
  const errorLog = {
    timestamp,
    error: {
      message: typeof error === 'string' ? error : error?.message,
      code: typeof error === 'string' ? error : error?.code,
      stack: error?.stack
    },
    classification,
    context,
    userAgent: navigator?.userAgent,
    url: window?.location?.href
  };

  // Console logging based on severity
  if (!skipConsole) {
    switch (classification.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR:', errorLog);
        break;
      case ErrorSeverity.HIGH:
        console.error('❌ HIGH SEVERITY:', errorLog);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('⚠️ MEDIUM SEVERITY:', errorLog);
        break;
      default:
        console.info('ℹ️ LOW SEVERITY:', errorLog);
    }
  }

  // Store in localStorage for admin debugging (keep last 50 errors)
  try {
    const stored = JSON.parse(localStorage.getItem('eh_error_log') || '[]');
    stored.unshift(errorLog);
    localStorage.setItem('eh_error_log', JSON.stringify(stored.slice(0, 50)));
  } catch (storageError) {
    console.warn('Failed to store error log:', storageError);
  }

  // Send to admin activity tracker for high/critical errors
  if (classification.severity === ErrorSeverity.HIGH || classification.severity === ErrorSeverity.CRITICAL) {
    try {
      import('../utils/adminActivityTracker').then(({ trackActivity, NOTIFICATION_CATEGORIES }) => {
        trackActivity({
          category: NOTIFICATION_CATEGORIES.SYSTEM_ERROR,
          title: `${classification.severity.toUpperCase()} Error`,
          message: getErrorMessage(error),
          metadata: {
            errorCode: classification.code,
            errorType: classification.type,
            context,
            url: window?.location?.href
          },
          priority: classification.severity === ErrorSeverity.CRITICAL ? 'high' : 'normal'
        });
      }).catch(() => {
        // Fail silently if admin tracker is not available
      });
    } catch {
      // Fail silently
    }
  }

  return errorLog;
}

/**
 * Error boundary utility for React components
 * @param {Error} error - Error from componentDidCatch
 * @param {object} errorInfo - Error info from componentDidCatch
 * @param {object} context - Additional context
 */
export function handleComponentError(error, errorInfo, context = {}) {
  const enhancedContext = {
    ...context,
    component: errorInfo?.componentStack,
    errorBoundary: true
  };

  logError(error, enhancedContext);
  
  return {
    message: 'Something went wrong with this component. Please refresh the page.',
    canRetry: true
  };
}

/**
 * Async operation error handler with retry logic
 * @param {function} operation - Async function to execute
 * @param {object} options - { maxRetries, retryDelay, context }
 * @returns {Promise} Result or throws handled error
 */
export async function withErrorHandling(operation, options = {}) {
  const { maxRetries = 3, retryDelay = 1000, context = {} } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classification = classifyError(error);
      
      // Don't retry validation or authentication errors
      if (classification.type === ErrorTypes.VALIDATION || 
          classification.type === ErrorTypes.AUTHENTICATION ||
          classification.type === ErrorTypes.AUTHORIZATION) {
        break;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff for retries
      const delay = retryDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Log the final error
  logError(lastError, { ...context, attempts: maxRetries });
  throw lastError;
}

/**
 * Create a standardized error response
 * @param {Error|string} error - Error to format
 * @param {object} context - Additional context
 * @returns {object} Standardized error response
 */
export function createErrorResponse(error, context = {}) {
  const classification = classifyError(error);
  const message = getErrorMessage(error);
  
  return {
    success: false,
    error: {
      message,
      code: classification.code,
      type: classification.type,
      severity: classification.severity
    },
    context,
    timestamp: new Date().toISOString()
  };
}

/**
 * Firebase-specific error handler
 * @param {Error} firebaseError - Firebase error object
 * @returns {object} Formatted error response
 */
export function handleFirebaseError(firebaseError) {
  const context = {
    service: 'firebase',
    operation: firebaseError?.customData?.operation || 'unknown'
  };

  logError(firebaseError, context);
  return createErrorResponse(firebaseError, context);
}

/**
 * Authentication-specific error handler
 * @param {Error} authError - Auth error object
 * @param {string} operation - The auth operation (login, register, etc.)
 * @returns {object} Formatted error response with auth-specific handling
 */
export function handleAuthError(authError, operation = 'authentication') {
  const context = {
    operation,
    service: 'auth'
  };

  // Special handling for rate limiting in auth
  if (authError?.code === 'auth/too-many-requests') {
    // Record this in rate limiting system
    try {
      const email = authError?.customData?.email || 'unknown';
      const attempts = JSON.parse(localStorage.getItem('eh_login_attempts') || '{}');
      const emailData = attempts[email] || { count: 0, firstAt: Date.now() };
      emailData.count += 1;
      emailData.lockedUntil = Date.now() + (15 * 60 * 1000); // 15 minutes
      attempts[email] = emailData;
      localStorage.setItem('eh_login_attempts', JSON.stringify(attempts));
    } catch {
      // Fail silently
    }
  }

  logError(authError, context);
  return createErrorResponse(authError, context);
}


/**
 * Silent error handler - logs error but doesn't throw
 * Use for non-critical operations where failure is acceptable
 * @param {Error|string} error - Error to log silently
 * @param {string} context - Human-readable context (e.g., "[Login] Failed to fetch user content")
 * @returns {void}
 */
export function silentError(error, context = '') {
  const errorMsg = typeof error === 'string' ? error : error?.message || 'Unknown error';
  const fullMessage = context ? `${context}: ${errorMsg}` : errorMsg;
  
  console.warn(`[Silently Handled] ${fullMessage}`);
  
  // Store in localStorage for debugging (but don't escalate to admin)
  try {
    const stored = JSON.parse(localStorage.getItem('eh_silent_errors') || '[]');
    stored.unshift({
      timestamp: new Date().toISOString(),
      message: fullMessage,
      context: context || 'unknown'
    });
    localStorage.setItem('eh_silent_errors', JSON.stringify(stored.slice(0, 20)));
  } catch {
    // Fail silently on storage error
  }
}
