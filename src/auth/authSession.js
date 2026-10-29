/**
 * The 7-hour sign-in window, in localStorage so it survives a refresh and a
 * reopened browser. The access token lives in the same entry, so it is deleted
 * with the session and never outlives it; a lapsed window is deleted on read.
 *
 * Two kinds, deliberately distinguished: 'credentials' is a real sign-in,
 * 'tester' is the Get Started button -- same 7 hours, recorded separately so
 * it is obvious nobody actually authenticated.
 */

const STORAGE_KEY = 'auth_session';

/**
 * Display names, keyed by email. Separate from the session on purpose: the name
 * is typed once at signup, while /auth/login answers later sign-ins and may not
 * echo it back. Keeping the pair here means the account menu can still greet
 * someone by name months after they registered. Display text only — never used
 * for auth decisions.
 */
const NAMES_KEY = 'account_names';
const emailKey = (email) => String(email || '').trim().toLowerCase();

export const rememberAccountName = (email, name) => {
  const key = emailKey(email);
  const value = String(name || '').trim();
  if (!key || !value) return;
  try {
    const all = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}');
    if (all[key] === value) return;                 // nothing to write
    localStorage.setItem(NAMES_KEY, JSON.stringify({ ...all, [key]: value }));
  } catch {
    // Storage blocked: the menu falls back to the email. Not worth failing over.
  }
};

export const recallAccountName = (email) => {
  const key = emailKey(email);
  if (!key) return '';
  try {
    return JSON.parse(localStorage.getItem(NAMES_KEY) || '{}')[key] || '';
  } catch {
    return '';
  }
};

export const SESSION_HOURS = 7;
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

/**
 * The live session, or null when there is none / it has expired.
 * An expired or unreadable entry is cleared on read so it cannot linger.
 */
export const readSession = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (!session || typeof session.expiresAt !== 'number') {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (Date.now() >= session.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    // Private mode, blocked storage, corrupt JSON — treat as signed out
    // rather than letting the whole app fail to mount.
    return null;
  }
};

export const hasValidSession = () => readSession() !== null;

export const startSession = (kind = 'credentials', identity = null, auth = null) => {
  const tokenMs = Number(auth?.expiresIn) > 0 ? Number(auth.expiresIn) * 1000 : null;
  const lifetime = tokenMs ? Math.min(SESSION_MS, tokenMs) : SESSION_MS;

  const session = {
    kind,
    identity,
    token: auth?.token || null,
    tokenType: auth?.tokenType || 'bearer',
    startedAt: Date.now(),
    expiresAt: Date.now() + lifetime,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable: the session lives only for this page view. The
    // caller still proceeds, so the UI is usable either way.
  }

  return session;
};

/**
 * Ends the session and takes the token with it — they live in the same entry,
 * so there is no way to clear one and leave the other behind.
 */
export const clearSession = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to do — see startSession
  }
};

/** What a Sign out control calls. */
export const logout = clearSession;

/**
 * The bearer token for outgoing requests, or null when signed out or expired.
 * readSession() deletes a lapsed entry, so an expired token can never be sent.
 */
export const getToken = () => readSession()?.token || null;

/** Milliseconds until the session expires (0 when there is no session). */
export const sessionTimeLeft = () => {
  const session = readSession();
  return session ? Math.max(0, session.expiresAt - Date.now()) : 0;
};
