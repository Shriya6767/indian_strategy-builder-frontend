import { getToken } from './authSession';

/**
 * Puts `Authorization: Bearer <token>` on every request to our own backend.
 *
 * HERE, NOT AT EACH CALL SITE: the app talks to `/api/...` from dozens of
 * places, so threading a header through all of them would be a permanent
 * invitation to forget one. Wrapping fetch once covers every call, present
 * and future.
 *
 * Deliberately narrow: same-origin `/api/...` only, never overwrites a header
 * a caller set, and skips the sign-in endpoints -- they MINT the token.
 */

const AUTH_FREE_PATHS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/verify-otp',
  '/api/auth/resend-otp',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

/** Is this one of our own API calls, and not a sign-in call? */
const shouldAttach = (url) => {
  if (!url) return false;

  let path = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.origin !== window.location.origin) return false;   // third party
      path = parsed.pathname;
    } catch {
      return false;
    }
  }

  if (!path.startsWith('/api/')) return false;
  return !AUTH_FREE_PATHS.some((p) => path.startsWith(p));
};

const hasAuthHeader = (headers) => {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has('Authorization');
  if (Array.isArray(headers)) return headers.some(([k]) => String(k).toLowerCase() === 'authorization');
  return Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
};

let installed = false;

/** Call once, before the app renders. */
export const installAuthHeader = () => {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url;
      const token = shouldAttach(url) ? getToken() : null;

      if (token && !hasAuthHeader(init.headers) && !(input instanceof Request && input.headers?.has?.('Authorization'))) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('Authorization', `Bearer ${token}`);
        return nativeFetch(input, { ...init, headers });
      }
    } catch {
      // Never let this wrapper break a request — fall through untouched.
    }

    return nativeFetch(input, init);
  };
};

/** The axios twin of the above, for the instance in services/api.js. */
export const attachAxiosAuth = (instance) => {
  instance.interceptors.request.use((config) => {
    try {
      const url = `${config.baseURL || ''}${config.url || ''}`;
      const token = shouldAttach(url) ? getToken() : null;
      if (token && !config.headers?.Authorization) {
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
      }
    } catch {
      // as above — the request goes out either way
    }
    return config;
  });
};
