/**
 * Caps wrong-password attempts at MAX_ATTEMPTS, then locks for LOCK_MINUTES.
 *
 * Counted per EMAIL, not per browser: one person fumbling their password must
 * not lock out someone sharing the machine. In memory only -- a count that
 * outlived the page met a returning user with "3 attempts remaining" on a
 * fresh login.
 *
 * A front-end courtesy, not a security control; the backend is the real gate.
 */

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 5;
const LOCK_MS = LOCK_MINUTES * 60 * 1000;

/** email -> { count, lockedUntil }. Module state: gone on reload, by design. */
const attempts = new Map();
try { localStorage.removeItem('login_attempts'); } catch { /* storage blocked */ }

const keyFor = (email) => String(email || '').trim().toLowerCase();

export const lockTimeLeft = (email) => {
  const key = keyFor(email);
  const entry = attempts.get(key);
  if (!entry?.lockedUntil) return 0;

  const left = entry.lockedUntil - Date.now();
  if (left <= 0) {
    attempts.delete(key);
    return 0;
  }
  return left;
};

/** Records one failure; returns { remaining, lockedMs }. */
export const recordFailure = (email) => {
  const key = keyFor(email);
  const count = (attempts.get(key)?.count || 0) + 1;

  if (count >= MAX_ATTEMPTS) {
    attempts.set(key, { count, lockedUntil: Date.now() + LOCK_MS });
    return { remaining: 0, lockedMs: LOCK_MS };
  }

  attempts.set(key, { count });
  return { remaining: MAX_ATTEMPTS - count, lockedMs: 0 };
};

/** A correct password wipes the slate; so does signing out. */
export const resetAttempts = (email) => {
  if (email === undefined) { attempts.clear(); return; }
  attempts.delete(keyFor(email));
};

/** "4 minutes and 14 seconds" — the wording the reference product uses. */
export const formatWait = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  const parts = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds > 0 || minutes === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' and ');
};
