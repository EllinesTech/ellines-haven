// ── Form validation utilities for Ellines Haven ───────────────────────────
// Provides comprehensive validation functions for auth forms and user input

export const ValidationRules = {
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Please enter a valid email address'
  },
  password: {
    required: true,
    minLength: 6,
    message: 'Password must be at least 6 characters long'
  },
  name: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z\s'-]+$/,
    message: 'Name must contain only letters, spaces, apostrophes, and hyphens'
  },
  phone: {
    required: false,
    pattern: /^[\+]?[\d\s\-\(\)]{10,}$/,
    message: 'Please enter a valid phone number'
  }
};

/**
 * Validate a single field against its rules
 * @param {string} fieldName - Name of the field to validate
 * @param {string} value - Value to validate
 * @param {object} customRules - Optional custom validation rules
 * @returns {object} { isValid: boolean, error: string }
 */
export function validateField(fieldName, value, customRules = {}) {
  const rules = { ...ValidationRules[fieldName], ...customRules };
  
  if (!rules) {
    return { isValid: true, error: null };
  }

  // Required check
  if (rules.required && (!value || value.trim() === '')) {
    return { 
      isValid: false, 
      error: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required` 
    };
  }

  // Skip other validations if field is empty and not required
  if (!rules.required && (!value || value.trim() === '')) {
    return { isValid: true, error: null };
  }

  const trimmedValue = value.trim();

  // Length checks
  if (rules.minLength && trimmedValue.length < rules.minLength) {
    return { 
      isValid: false, 
      error: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be at least ${rules.minLength} characters` 
    };
  }

  if (rules.maxLength && trimmedValue.length > rules.maxLength) {
    return { 
      isValid: false, 
      error: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must not exceed ${rules.maxLength} characters` 
    };
  }

  // Pattern check
  if (rules.pattern && !rules.pattern.test(trimmedValue)) {
    return { 
      isValid: false, 
      error: rules.message || `Invalid ${fieldName} format` 
    };
  }

  return { isValid: true, error: null };
}

/**
 * Validate an entire form object
 * @param {object} formData - Object containing form field values
 * @param {object} fieldRules - Object mapping field names to validation rules
 * @returns {object} { isValid: boolean, errors: object, firstError: string }
 */
export function validateForm(formData, fieldRules = {}) {
  const errors = {};
  let firstError = null;

  Object.keys(formData).forEach(fieldName => {
    const customRules = fieldRules[fieldName];
    const validation = validateField(fieldName, formData[fieldName], customRules);
    
    if (!validation.isValid) {
      errors[fieldName] = validation.error;
      if (!firstError) {
        firstError = validation.error;
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    firstError
  };
}

/**
 * Password strength validator
 * @param {string} password - Password to validate
 * @returns {object} { score: number, feedback: string, isStrong: boolean }
 */
export function validatePasswordStrength(password) {
  if (!password) {
    return { score: 0, feedback: 'Password is required', isStrong: false };
  }

  let score = 0;
  const feedback = [];

  // Length checks
  if (password.length >= 8) score++;
  else feedback.push('Use at least 8 characters');

  if (password.length >= 12) score++;

  // Character variety
  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Add uppercase letters');

  if (/[a-z]/.test(password)) score++;
  else feedback.push('Add lowercase letters');

  if (/[0-9]/.test(password)) score++;
  else feedback.push('Add numbers');

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push('Add symbols (!@#$%...)');

  // Common patterns to avoid
  const commonPatterns = [
    /(.)\1{2,}/,  // Repeated characters
    /123456|654321|abcdef|qwerty/i,  // Sequential patterns
    /password|123456789|qwertyui/i   // Common passwords
  ];

  if (commonPatterns.some(pattern => pattern.test(password))) {
    score = Math.max(0, score - 2);
    feedback.push('Avoid common patterns');
  }

  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const normalizedScore = Math.min(5, Math.max(0, score));
  
  return {
    score: normalizedScore,
    feedback: feedback.length > 0 ? feedback.join(', ') : 'Strong password!',
    isStrong: normalizedScore >= 3,
    label: strengthLabels[normalizedScore]
  };
}

/**
 * Custom validation for auth-specific fields
 */
export const AuthValidators = {
  /**
   * Validate email format and check against common issues
   */
  email: (email) => {
    const baseValidation = validateField('email', email);
    if (!baseValidation.isValid) return baseValidation;

    const normalizedEmail = email.trim().toLowerCase();
    
    // Check for suspicious patterns
    if (normalizedEmail.includes('..') || normalizedEmail.startsWith('.') || normalizedEmail.endsWith('.')) {
      return { isValid: false, error: 'Email format appears invalid' };
    }

    return { isValid: true, error: null };
  },

  /**
   * Validate password confirmation
   */
  passwordConfirmation: (password, confirmPassword) => {
    if (!confirmPassword || confirmPassword.trim() === '') {
      return { isValid: false, error: 'Please confirm your password' };
    }

    if (password !== confirmPassword) {
      return { isValid: false, error: 'Passwords do not match' };
    }

    return { isValid: true, error: null };
  },

  /**
   * Validate login attempt limits
   */
  loginAttempts: (email, maxAttempts = 5) => {
    try {
      const attempts = JSON.parse(localStorage.getItem('eh_login_attempts') || '{}');
      const emailData = attempts[email.toLowerCase()] || { count: 0, lockedUntil: null };
      
      if (emailData.lockedUntil && Date.now() < emailData.lockedUntil) {
        const remaining = Math.ceil((emailData.lockedUntil - Date.now()) / 60000);
        return { 
          isValid: false, 
          error: `Account temporarily locked. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}` 
        };
      }

      if (emailData.count >= maxAttempts) {
        return { 
          isValid: false, 
          error: 'Too many failed attempts. Please try password reset' 
        };
      }

      return { isValid: true, error: null };
    } catch {
      return { isValid: true, error: null };
    }
  }
};

/**
 * Sanitize user input to prevent XSS and other issues
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
}

/**
 * Validate and sanitize form data
 * @param {object} formData - Raw form data
 * @param {object} fieldRules - Validation rules per field
 * @returns {object} { isValid: boolean, sanitizedData: object, errors: object }
 */
export function validateAndSanitizeForm(formData, fieldRules = {}) {
  // First sanitize all string inputs
  const sanitizedData = {};
  Object.keys(formData).forEach(key => {
    sanitizedData[key] = typeof formData[key] === 'string' 
      ? sanitizeInput(formData[key]) 
      : formData[key];
  });

  // Then validate the sanitized data
  const validation = validateForm(sanitizedData, fieldRules);

  return {
    ...validation,
    sanitizedData
  };
}