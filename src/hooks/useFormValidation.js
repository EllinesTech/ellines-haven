// ── Form Validation Hook for Ellines Haven ───────────────────────────────
// React hook for comprehensive form validation and error handling

import { useState, useCallback, useEffect } from 'react';
import { validateField, validateForm, validateAndSanitizeForm, AuthValidators } from '../utils/validation';
import { logError, ErrorTypes } from '../utils/errorHandler';

/**
 * Comprehensive form validation hook
 * @param {object} initialValues - Initial form values
 * @param {object} validationRules - Validation rules per field
 * @param {object} options - Additional options { validateOnChange, validateOnBlur, sanitizeInputs }
 * @returns {object} Form state and validation methods
 */
export function useFormValidation(initialValues = {}, validationRules = {}, options = {}) {
  const {
    validateOnChange = false,
    validateOnBlur = true,
    sanitizeInputs = true,
    onSubmit,
    onValidationChange
  } = options;

  // Form state
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);

  // Validate a specific field
  const validateSingleField = useCallback((fieldName, value, rules = {}) => {
    const fieldRules = { ...validationRules[fieldName], ...rules };
    return validateField(fieldName, value, fieldRules);
  }, [validationRules]);

  // Validate all form fields
  const validateAllFields = useCallback(() => {
    const validation = validateForm(values, validationRules);
    setErrors(validation.errors);
    setIsValid(validation.isValid);
    return validation;
  }, [values, validationRules]);

  // Update a field value
  const setValue = useCallback((fieldName, value) => {
    const processedValue = sanitizeInputs && typeof value === 'string' 
      ? value.trim() 
      : value;

    setValues(prev => ({ ...prev, [fieldName]: processedValue }));

    // Validate on change if enabled
    if (validateOnChange || touched[fieldName]) {
      const validation = validateSingleField(fieldName, processedValue);
      setErrors(prev => ({
        ...prev,
        [fieldName]: validation.error
      }));
    }
  }, [sanitizeInputs, validateOnChange, touched, validateSingleField]);

  // Set multiple values at once
  const setMultipleValues = useCallback((newValues) => {
    setValues(prev => ({ ...prev, ...newValues }));
    
    if (validateOnChange) {
      const validation = validateForm({ ...values, ...newValues }, validationRules);
      setErrors(validation.errors);
    }
  }, [values, validateOnChange, validationRules]);

  // Handle field blur (validation)
  const handleBlur = useCallback((fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    
    if (validateOnBlur) {
      const validation = validateSingleField(fieldName, values[fieldName]);
      setErrors(prev => ({
        ...prev,
        [fieldName]: validation.error
      }));
    }
  }, [validateOnBlur, values, validateSingleField]);

  // Handle form submission
  const handleSubmit = useCallback(async (customValidation) => {
    setIsSubmitting(true);
    setSubmitCount(prev => prev + 1);
    
    try {
      // Mark all fields as touched
      const allFields = Object.keys({ ...values, ...validationRules });
      const touchedState = {};
      allFields.forEach(field => { touchedState[field] = true; });
      setTouched(touchedState);

      // Validate and sanitize
      const validation = sanitizeInputs 
        ? validateAndSanitizeForm(values, validationRules)
        : validateForm(values, validationRules);

      setErrors(validation.errors);
      setIsValid(validation.isValid);

      if (!validation.isValid) {
        logError(
          `Form validation failed: ${validation.firstError}`,
          {
            formData: Object.keys(values),
            errors: validation.errors,
            operation: 'form-validation'
          }
        );
        return { success: false, errors: validation.errors, firstError: validation.firstError };
      }

      // Run custom validation if provided
      if (customValidation && typeof customValidation === 'function') {
        const customResult = await customValidation(validation.sanitizedData || values);
        if (customResult && !customResult.isValid) {
          const customErrors = customResult.errors || {};
          setErrors(prev => ({ ...prev, ...customErrors }));
          return { success: false, errors: customErrors, firstError: customResult.firstError };
        }
      }

      // Call onSubmit if provided
      if (onSubmit && typeof onSubmit === 'function') {
        const result = await onSubmit(validation.sanitizedData || values);
        return result || { success: true };
      }

      return { success: true, data: validation.sanitizedData || values };

    } catch (error) {
      logError(error, { operation: 'form-submission' });
      return { success: false, error: error.message || 'Form submission failed' };
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validationRules, sanitizeInputs, onSubmit]);

  // Reset form
  const reset = useCallback((newValues = initialValues) => {
    setValues(newValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
    setSubmitCount(0);
    setIsValid(false);
  }, [initialValues]);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Clear specific field error
  const clearFieldError = useCallback((fieldName) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);

  // Set field error manually
  const setFieldError = useCallback((fieldName, error) => {
    setErrors(prev => ({ ...prev, [fieldName]: error }));
  }, []);

  // Get field props for easy integration with inputs
  const getFieldProps = useCallback((fieldName, additionalProps = {}) => {
    return {
      name: fieldName,
      value: values[fieldName] || '',
      onChange: (e) => {
        const value = e.target ? e.target.value : e;
        setValue(fieldName, value);
        additionalProps.onChange?.(e);
      },
      onBlur: (e) => {
        handleBlur(fieldName);
        additionalProps.onBlur?.(e);
      },
      error: errors[fieldName],
      hasError: !!errors[fieldName],
      isTouched: !!touched[fieldName],
      ...additionalProps
    };
  }, [values, errors, touched, setValue, handleBlur]);

  // Effect to notify about validation changes
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange({ isValid, errors, values, touched });
    }
  }, [isValid, errors, values, touched, onValidationChange]);

  // Auto-validate when values change (if enabled)
  useEffect(() => {
    if (validateOnChange || submitCount > 0) {
      validateAllFields();
    }
  }, [values, validateOnChange, submitCount, validateAllFields]);

  return {
    // Form values
    values,
    errors,
    touched,
    isValid,
    isSubmitting,
    submitCount,

    // Form methods
    setValue,
    setValues,
    handleBlur,
    handleSubmit,
    reset,
    clearErrors,
    clearFieldError,
    setFieldError,
    getFieldProps,
    validateField: validateSingleField,
    validateAll: validateAllFields,

    // Helper computed values
    hasErrors: Object.keys(errors).length > 0,
    firstError: Object.values(errors).find(Boolean),
    touchedFields: Object.keys(touched).filter(field => touched[field]),
    dirtyFields: Object.keys(values).filter(field => values[field] !== initialValues[field])
  };
}

/**
 * Specialized hook for authentication forms
 */
export function useAuthFormValidation(type = 'login', options = {}) {
  const getInitialValues = () => {
    switch (type) {
      case 'register':
        return { name: '', email: '', password: '', confirmPassword: '', phone: '' };
      case 'login':
        return { email: '', password: '' };
      case 'forgot-password':
        return { email: '' };
      case 'reset-password':
        return { password: '', confirmPassword: '' };
      default:
        return {};
    }
  };

  const getValidationRules = () => {
    const commonRules = {
      email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      password: { required: true, minLength: 6 }
    };

    switch (type) {
      case 'register':
        return {
          ...commonRules,
          name: { required: true, minLength: 2, maxLength: 50 },
          confirmPassword: { required: true },
          phone: { required: false }
        };
      case 'reset-password':
        return {
          password: { required: true, minLength: 6 },
          confirmPassword: { required: true }
        };
      case 'forgot-password':
        return { email: commonRules.email };
      default:
        return commonRules;
    }
  };

  const form = useFormValidation(getInitialValues(), getValidationRules(), {
    validateOnBlur: true,
    sanitizeInputs: true,
    ...options
  });

  // Custom validation for auth forms
  const customValidation = useCallback(async (values) => {
    const errors = {};

    // Email validation with auth-specific checks
    if (values.email) {
      const emailValidation = AuthValidators.email(values.email);
      if (!emailValidation.isValid) {
        errors.email = emailValidation.error;
      }

      // Check login attempts for login form
      if (type === 'login') {
        const attemptsValidation = AuthValidators.loginAttempts(values.email);
        if (!attemptsValidation.isValid) {
          errors.email = attemptsValidation.error;
        }
      }
    }

    // Password confirmation validation
    if (values.confirmPassword !== undefined) {
      const confirmValidation = AuthValidators.passwordConfirmation(
        values.password, 
        values.confirmPassword
      );
      if (!confirmValidation.isValid) {
        errors.confirmPassword = confirmValidation.error;
      }
    }

    const hasErrors = Object.keys(errors).length > 0;
    return {
      isValid: !hasErrors,
      errors,
      firstError: hasErrors ? Object.values(errors)[0] : null
    };
  }, [type]);

  // Enhanced submit handler with auth-specific validation
  const handleAuthSubmit = useCallback(async () => {
    return form.handleSubmit(customValidation);
  }, [form, customValidation]);

  return {
    ...form,
    handleSubmit: handleAuthSubmit,
    
    // Auth-specific helpers
    getEmailProps: () => form.getFieldProps('email', { type: 'email', autoComplete: 'email' }),
    getPasswordProps: () => form.getFieldProps('password', { type: 'password', autoComplete: 'current-password' }),
    getNameProps: () => form.getFieldProps('name', { type: 'text', autoComplete: 'name' }),
    getPhoneProps: () => form.getFieldProps('phone', { type: 'tel', autoComplete: 'tel' }),
    getConfirmPasswordProps: () => form.getFieldProps('confirmPassword', { type: 'password', autoComplete: 'new-password' })
  };
}

/**
 * Hook for real-time validation feedback
 */
export function useRealTimeValidation(fieldName, validationRules, debounceMs = 300) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    if (!value) {
      setError(null);
      setIsValid(false);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    
    const timeoutId = setTimeout(() => {
      const validation = validateField(fieldName, value, validationRules);
      setError(validation.error);
      setIsValid(validation.isValid);
      setIsValidating(false);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [value, fieldName, validationRules, debounceMs]);

  return {
    value,
    setValue,
    error,
    isValid,
    isValidating,
    hasError: !!error
  };
}