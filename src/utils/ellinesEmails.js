/**
 * Public Ellines business emails (customer-facing).
 * Super-admin / Firebase login stays on the internal Gmail — never show that on the site.
 *
 *   info@ellines.co.ke   — General / group / careers (public)
 *   haven@ellines.co.ke  — Orders, leads, invoices, project requests (public)
 *
 * Internal Resend notify destinations (Firebase Functions params — mirror Tech):
 *   LEADS_NOTIFY_EMAIL / ORDERS_NOTIFY_EMAIL → tech@ellines.co.ke
 *   CAREERS_NOTIFY_EMAIL → info@ellines.co.ke
 */
export const INFO_EMAIL = 'info@ellines.co.ke';
export const HAVEN_EMAIL = 'haven@ellines.co.ke';

/** General / group / careers (public display) */
export const SUPPORT_EMAIL = INFO_EMAIL;

/** Orders, leads, invoices, project requests (public display) */
export const ORDERS_EMAIL = HAVEN_EMAIL;

/** Primary chip on Haven site */
export const PRIMARY_CONTACT_EMAIL = HAVEN_EMAIL;

/** Internal staff notify — matches Ellines Tech LEADS/ORDERS_NOTIFY_EMAIL */
export const LEADS_NOTIFY_EMAIL = 'tech@ellines.co.ke';
export const ORDERS_NOTIFY_EMAIL = 'tech@ellines.co.ke';

/** Internal careers notify — matches Ellines Tech CAREERS_NOTIFY_EMAIL */
export const CAREERS_NOTIFY_EMAIL = 'info@ellines.co.ke';

/** Resend From header — matches Firebase RESEND_FROM default */
export const RESEND_FROM_DEFAULT = 'Ellines Haven <noreply@haven.ellines.co.ke>';

export function mailto(email, subject) {
  const base = `mailto:${email}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}
