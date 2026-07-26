/**
 * Public Ellines business emails (customer-facing).
 * Super-admin / Firebase login stays on the internal Gmail — never show that on the site.
 *
 *   info@ellines.co.ke   — General / group / careers
 *   haven@ellines.co.ke  — Orders, leads, invoices, project requests
 */
export const INFO_EMAIL = 'info@ellines.co.ke';
export const HAVEN_EMAIL = 'haven@ellines.co.ke';

/** General / group / careers */
export const SUPPORT_EMAIL = INFO_EMAIL;

/** Orders, leads, invoices, project requests */
export const ORDERS_EMAIL = HAVEN_EMAIL;

/** Primary chip on Haven site */
export const PRIMARY_CONTACT_EMAIL = HAVEN_EMAIL;

export function mailto(email, subject) {
  const base = `mailto:${email}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}
