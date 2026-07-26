/**
 * Public Ellines business emails (customer-facing).
 * Super-admin / Firebase login stays on the internal Gmail account — do not put that on the site.
 *
 * Roles:
 *   info@     — Ellines group inquiries, partnerships, general business
 *   haven@    — Ellines Haven product (primary contact on this site)
 *   support@  — Account help, access issues, technical support
 *   orders@   — Payments, missing books, receipts, order status
 */
export const ELLINES_EMAILS = {
  info: 'info@ellines.co.ke',
  haven: 'haven@ellines.co.ke',
  support: 'support@ellines.co.ke',
  orders: 'orders@ellines.co.ke',
};

/** Primary contact shown in footer / hero contact chips for Haven */
export const PRIMARY_CONTACT_EMAIL = ELLINES_EMAILS.haven;

/** Default support inbox for “contact support” copy */
export const SUPPORT_EMAIL = ELLINES_EMAILS.support;

/** Orders / payments / unlock issues */
export const ORDERS_EMAIL = ELLINES_EMAILS.orders;

/** Group-level inquiries (not Haven-specific) */
export const INFO_EMAIL = ELLINES_EMAILS.info;

export function mailto(email, subject) {
  const base = `mailto:${email}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}
