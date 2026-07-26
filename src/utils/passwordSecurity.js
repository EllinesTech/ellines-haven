/**
 * Password hashing helpers (Web Crypto SHA-256 + salt).
 * Format: sha256$<saltHex>$<hashHex>
 * Legacy plaintext values are still accepted and upgraded on successful login.
 */

const HASH_PREFIX = 'sha256$';

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function isHashedPassword(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split('$');
  return parts.length === 3 && parts[0] === 'sha256' && parts[1].length >= 16 && parts[2].length === 64;
}

async function sha256Hex(password, saltBytes) {
  const enc = new TextEncoder();
  const passBytes = enc.encode(password);
  const combined = new Uint8Array(saltBytes.length + passBytes.length);
  combined.set(saltBytes, 0);
  combined.set(passBytes, saltBytes.length);
  const digest = await crypto.subtle.digest('SHA-256', combined);
  return toHex(digest);
}

/** Hash a plaintext password for storage. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await sha256Hex(String(password), salt);
  return `${HASH_PREFIX}${toHex(salt)}$${hash}`;
}

/**
 * Verify a password against a stored value (hash or legacy plaintext).
 * Returns { ok, needsUpgrade }.
 */
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, needsUpgrade: false };
  const plain = String(password ?? '');
  const storedStr = String(stored);

  if (isHashedPassword(storedStr)) {
    const [, saltHex, hashHex] = storedStr.split('$');
    const computed = await sha256Hex(plain, fromHex(saltHex));
    return { ok: computed === hashHex, needsUpgrade: false };
  }

  // Legacy plaintext (or localStorage override)
  const ok = storedStr === plain;
  return { ok, needsUpgrade: ok };
}

/** Prefer hashed storage; keep plaintext only when hashing fails. */
export async function storePasswordValue(password) {
  try {
    return await hashPassword(password);
  } catch {
    return String(password);
  }
}
