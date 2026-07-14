/**
 * Purchase & Auth Helper Utilities
 * ─────────────────────────────────
 * Centralized logic for handling purchase flows with login redirects.
 * Used across book cards, detail pages, and shopping cart.
 */

/**
 * Handle purchase action with login redirect if needed
 * @param {Object} user - Current logged-in user (null if not logged in)
 * @param {Function} onPurchase - Callback to execute if user is logged in
 * @param {String} returnPath - Path to return to after login (defaults to current path)
 */
export function handlePurchaseAction(user, onPurchase, returnPath) {
  if (!user) {
    // Not logged in — redirect to login with return path
    const redirectTo = returnPath || window.location.pathname;
    window.location.href = `/login?returnTo=${encodeURIComponent(redirectTo)}`;
    return;
  }
  
  // User is logged in — execute the purchase callback
  onPurchase();
}

/**
 * Generate professional login message for purchase UI
 * Based on book status and purchase type
 */
export function getLoginMessage(bookStatus, isPremium = false) {
  const messages = {
    complete: 'Login or register to purchase this book',
    'free-preview': 'Login or register to read the full book',
    premium: 'Login or register to access premium content',
    ongoing: 'Login or register to purchase available chapters',
    limited: 'Login or register to buy this limited edition',
    default: 'Login or register to make a purchase',
  };
  
  return isPremium 
    ? messages.premium 
    : messages[bookStatus] || messages.default;
}

/**
 * Check if user has purchase restrictions
 * @returns {Object} { isRestricted: boolean, reason: string }
 */
export function checkPurchaseRestrictions(user, myPerms, siteControls) {
  if (!user) return { isRestricted: false, reason: null };
  
  if (siteControls?.readOnlyMode) {
    return { isRestricted: true, reason: 'Site is in read-only mode' };
  }
  
  if (myPerms?.canPurchase === false) {
    return { isRestricted: true, reason: 'Your account cannot make purchases' };
  }
  
  return { isRestricted: false, reason: null };
}

/**
 * Professional purchase UI state manager
 * Determines which button/message to show based on:
 * - User login status
 * - Book ownership
 * - Purchase restrictions
 * - Cart state
 */
export function getPurchaseUiState(book, user, myPerms, siteControls, inCart, owned) {
  const { isRestricted, reason } = checkPurchaseRestrictions(user, myPerms, siteControls);
  
  // State priority: owned > restricted > in cart > can add
  
  if (owned) {
    return { state: 'owned', label: 'Read', action: 'navigate', target: 'reader' };
  }
  
  if (isRestricted) {
    return { state: 'restricted', label: reason || 'Purchase Restricted', action: 'disabled' };
  }
  
  if (inCart) {
    return { state: 'incart', label: 'In Cart', action: 'navigate', target: 'cart' };
  }
  
  if (!user) {
    return { 
      state: 'login-required', 
      label: 'Add to Cart',
      action: 'login',
      message: getLoginMessage(book.status, book.status === 'premium'),
    };
  }
  
  // User is logged in and can purchase
  return { state: 'can-add', label: 'Add to Cart', action: 'add-to-cart' };
}

/**
 * Professional login prompt message component
 * Shows when user needs to log in to purchase
 */
export function getLoginPromptConfig(bookStatus, isPremium = false) {
  const baseConfig = {
    icon: '🔐',
    title: 'Login to Continue',
    message: getLoginMessage(bookStatus, isPremium),
    ctaText: 'Login or Register',
    subtext: '100% secure · Quick setup · All payment methods accepted',
  };
  
  // Customize based on status
  const variants = {
    premium: {
      title: 'Premium Content',
      message: 'Unlock exclusive premium content. Login to access.',
      ctaText: 'Unlock Premium',
    },
    'free-preview': {
      title: 'Continue Reading',
      message: 'First chapter is free. Login to read the full book.',
      ctaText: 'Read Full Book',
    },
    limited: {
      title: 'Limited Edition',
      message: 'This limited edition won\'t be available much longer. Secure yours now.',
      ctaText: 'Secure Your Copy',
    },
  };
  
  return { ...baseConfig, ...variants[bookStatus] };
}

/**
 * Professional empty/disabled state message
 * Shows when user can't purchase due to restrictions
 */
export function getRestrictedStateConfig(reason = '') {
  return {
    icon: '🔒',
    title: 'Purchase Unavailable',
    message: reason || 'Your account currently cannot make purchases.',
    subtext: 'Please contact support if you think this is an error.',
  };
}
