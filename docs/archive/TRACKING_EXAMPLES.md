# Activity Tracking Examples

This document shows how to add activity tracking to various parts of your application.

## Import Required Functions

```javascript
import { trackActivity, NOTIFICATION_CATEGORIES } from '../utils/adminActivityTracker';
```

## Examples

### 1. Book Purchase (Payment Success)
Add to your payment confirmation handler:

```javascript
// After successful payment confirmation
await trackActivity({
  category: NOTIFICATION_CATEGORIES.BOOK_PURCHASE,
  title: 'Book Purchase',
  message: `${userName} purchased "${bookTitle}" for KES ${price}`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    bookId: book.id,
    bookTitle: book.title,
    price: book.price,
    orderId: order.id,
    paymentMethod: 'M-Pesa', // or 'PayPal', 'Paystack'
  },
  priority: 'normal',
});
```

### 2. Book Download
Add to your download handler:

```javascript
// When user downloads a book
await trackActivity({
  category: NOTIFICATION_CATEGORIES.BOOK_DOWNLOAD,
  title: 'Book Downloaded',
  message: `${userName} downloaded "${bookTitle}"`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    bookId: book.id,
    bookTitle: book.title,
    fileFormat: 'PDF', // or 'EPUB'
    downloadTime: new Date().toISOString(),
  },
  priority: 'low',
});
```

### 3. Review Submission
Add to review submission handler:

```javascript
// After review is saved
await trackActivity({
  category: NOTIFICATION_CATEGORIES.REVIEW_SUBMITTED,
  title: 'New Review',
  message: `${userName} reviewed "${bookTitle}" - ${rating} stars`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    bookId: book.id,
    bookTitle: book.title,
    rating: rating,
    reviewPreview: reviewText.substring(0, 100),
  },
  priority: 'low',
});
```

### 4. Newsletter Signup
Add to newsletter form handler:

```javascript
// After newsletter signup
await trackActivity({
  category: NOTIFICATION_CATEGORIES.NEWSLETTER_SIGNUP,
  title: 'Newsletter Signup',
  message: `${name} (${email}) subscribed to newsletter`,
  userEmail: email,
  userName: name,
  metadata: {
    source: 'footer', // or 'popup', 'homepage'
    signupDate: new Date().toISOString(),
  },
  priority: 'low',
});
```

### 5. Wishlist Addition
Add to wishlist add handler:

```javascript
// When user adds book to wishlist
await trackActivity({
  category: NOTIFICATION_CATEGORIES.WISHLIST_ADD,
  title: 'Wishlist Addition',
  message: `${userName} added "${bookTitle}" to wishlist`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    bookId: book.id,
    bookTitle: book.title,
  },
  priority: 'low',
});
```

### 6. Cart Checkout
Add to checkout initiation:

```javascript
// When user starts checkout
await trackActivity({
  category: NOTIFICATION_CATEGORIES.CART_CHECKOUT,
  title: 'Checkout Started',
  message: `${userName} is checking out ${itemCount} items (KES ${totalAmount})`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    itemCount: cart.length,
    totalAmount: total,
    items: cart.map(item => ({ id: item.id, title: item.title })),
  },
  priority: 'normal',
});
```

### 7. Account Deletion Request
Add to account deletion handler:

```javascript
// When user requests account deletion
await trackActivity({
  category: NOTIFICATION_CATEGORIES.ACCOUNT_DELETION,
  title: 'Account Deletion Request',
  message: `${userName} requested account deletion`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    reason: deletionReason,
    scheduledDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  priority: 'high',
});
```

### 8. Password Reset
Add to password reset handler:

```javascript
// When user resets password
await trackActivity({
  category: NOTIFICATION_CATEGORIES.PASSWORD_RESET,
  title: 'Password Reset',
  message: `${email} reset their password`,
  userEmail: email,
  userName: userName || email,
  metadata: {
    resetMethod: 'email', // or 'sms'
    resetTime: new Date().toISOString(),
  },
  priority: 'normal',
});
```

### 9. Profile Update
Add to profile update handler:

```javascript
// When user updates their profile
await trackActivity({
  category: NOTIFICATION_CATEGORIES.PROFILE_UPDATE,
  title: 'Profile Updated',
  message: `${userName} updated their profile`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    fieldsUpdated: ['name', 'bio', 'location'], // which fields changed
    updateTime: new Date().toISOString(),
  },
  priority: 'low',
});
```

### 10. Payment Event (Successful)
Add to payment processing:

```javascript
// After successful payment
await trackActivity({
  category: NOTIFICATION_CATEGORIES.PAYMENT,
  title: 'Payment Successful',
  message: `${userName} paid KES ${amount} via ${paymentMethod}`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    amount: amount,
    currency: 'KES',
    paymentMethod: paymentMethod,
    transactionId: transactionId,
    orderId: orderId,
  },
  priority: 'normal',
});
```

### 11. Payment Event (Failed)
Add to payment error handler:

```javascript
// After failed payment
await trackActivity({
  category: NOTIFICATION_CATEGORIES.PAYMENT,
  title: 'Payment Failed',
  message: `Payment failed for ${userName} - ${errorReason}`,
  userEmail: user.email,
  userName: user.name,
  metadata: {
    amount: amount,
    paymentMethod: paymentMethod,
    errorReason: errorReason,
    attemptNumber: attemptCount,
  },
  priority: 'high',
});
```

### 12. System Event
Add for system-level events:

```javascript
// For system maintenance, errors, etc.
await trackActivity({
  category: NOTIFICATION_CATEGORIES.SYSTEM,
  title: 'Maintenance Mode Enabled',
  message: 'Site maintenance mode activated by admin',
  userEmail: adminEmail,
  userName: adminName,
  metadata: {
    action: 'maintenance_enabled',
    triggeredBy: adminEmail,
    scheduledDuration: '2 hours',
  },
  priority: 'high',
});
```

## Error Handling

Always wrap tracking calls in try-catch to prevent tracking failures from breaking core functionality:

```javascript
try {
  await trackActivity({
    category: NOTIFICATION_CATEGORIES.USER_LOGIN,
    title: 'User Login',
    message: `${userName} logged in`,
    userEmail: email,
    userName: userName,
    priority: 'low',
  });
} catch (error) {
  console.error('[Activity Tracking Error]', error);
  // Don't throw - let the main operation continue
}
```

## Priority Guidelines

- **low**: Routine activities (logins, views, wishlist adds)
- **normal**: Important user actions (purchases, registrations, contact messages)
- **high**: Critical events (payment failures, account deletions, security issues)

## Best Practices

1. **Be Specific**: Make messages clear and actionable
2. **Include Context**: Add relevant metadata for debugging
3. **Don't Overtrack**: Avoid tracking every minor action
4. **Privacy First**: Don't include sensitive data in messages (passwords, payment card details)
5. **Handle Errors**: Always catch tracking errors to prevent blocking main operations
6. **Use Categories**: Pick the most appropriate category for filtering
7. **Set Priority**: Use priority levels to help admins focus on important events
