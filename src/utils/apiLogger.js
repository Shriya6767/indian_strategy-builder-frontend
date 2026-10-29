// Global API logger — prints every backend request and response (with full
// parameters) to the browser console for verification.
//
// The app talks to the backend two ways: raw `fetch(...)` calls scattered
// across components, and the axios instance in services/api.js. This module
// covers both: `installFetchLogger()` wraps window.fetch, and
// `attachAxiosLogger(instance)` adds axios interceptors. Only backend calls
// (URLs containing "/api/") are logged, so Vite HMR and asset requests stay out.
//
// Logging never alters a request or a response: the fetch wrapper reads a
// CLONE of the response, leaving the original stream untouched for the caller,
// and every logging step is wrapped so a logging failure can't break a call.

import { logApi } from './fileLog';

const HEADER = 'color:#0782DA;font-weight:600';
const OK = 'color:#008537;font-weight:600';
const FAIL = 'color:#e0473c;font-weight:600';

const isApiUrl = (url) => typeof url === 'string' && url.includes('/api/');

// Request/response bodies travel as JSON strings — parse so the console shows
// an inspectable object instead of one long escaped line.
const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const shortPath = (url) => {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
};

const queryParams = (url) => {
  try {
    const params = new URL(url, window.location.origin).searchParams;
    if ([...params].length === 0) return null;
    return Object.fromEntries(params);
  } catch {
    return null;
  }
};

const logCall = ({ method, url, requestBody, status, ok, responseBody, ms, error }) => {
  /*
    The same call, one line, into src/logs/frontend-*.log via the Vite plugin.
    URL, status and duration ONLY -- the bodies below stay in the console and
    never reach a file, because a log on disk (shared with whoever is testing
    through the tunnel) must not carry tokens or account details.
  */
  logApi({ method, url, status, ms, error });

  const label = `API ${method} ${shortPath(url)}`;
  const statusText = error ? 'NETWORK ERROR' : status;
  const style = error || !ok ? FAIL : OK;

  /*
    OPEN BY DEFAULT, so a request and its response can be read without
    clicking into every entry -- the point of this log is verifying what
    actually went over the wire.

    The one exception is /api/live/*, which polls on a timer: expanding those
    buries everything else within seconds. They stay collapsed and can still
    be opened by hand.
  */
  const isHighFrequency = url.includes('/api/live/');
  const open = isHighFrequency ? console.groupCollapsed : console.group;

  open(`%c${label} %c${statusText}%c ${Math.round(ms)}ms`, HEADER, style, 'color:inherit');
  console.log('URL:', url);

  const params = queryParams(url);
  if (params) console.log('Query Parameters:', params);

  if (requestBody !== undefined && requestBody !== null) {
    const body = parseMaybeJson(requestBody);
    console.log('%cREQUEST BODY', HEADER);
    console.log(body);
    // The raw JSON too: the object above is inspectable, this one can be
    // copied straight out of the console and pasted into a ticket or curl.
    if (typeof body === 'object' && body !== null) {
      console.log(JSON.stringify(body, null, 2));
    }
  }

  if (error) {
    console.log('%cERROR', FAIL, error);
  } else {
    console.log('%cRESPONSE BODY', style);
    console.log(responseBody);
    if (typeof responseBody === 'object' && responseBody !== null) {
      console.log(JSON.stringify(responseBody, null, 2));
    }
  }
  console.groupEnd();
};

export const installFetchLogger = () => {
  if (typeof window === 'undefined' || window.__apiFetchLoggerInstalled) return;
  window.__apiFetchLoggerInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';

    if (!isApiUrl(url)) return originalFetch(input, init);

    const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const startedAt = performance.now();

    try {
      const response = await originalFetch(input, init);

      let responseBody;
      try {
        // Read a clone so the caller still gets an unconsumed body stream.
        const text = await response.clone().text();
        responseBody = text ? parseMaybeJson(text) : '(empty)';
      } catch {
        responseBody = '(unreadable)';
      }

      logCall({
        method,
        url,
        requestBody: init.body,
        status: response.status,
        ok: response.ok,
        responseBody,
        ms: performance.now() - startedAt,
      });

      return response;
    } catch (err) {
      logCall({
        method,
        url,
        requestBody: init.body,
        ms: performance.now() - startedAt,
        error: err?.message || err,
      });
      throw err;
    }
  };
};

export const attachAxiosLogger = (instance) => {
  instance.interceptors.request.use((config) => {
    config.metadata = { startedAt: performance.now() };
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      logCall({
        method: (response.config.method || 'GET').toUpperCase(),
        url: `${response.config.baseURL || ''}${response.config.url || ''}`,
        requestBody: response.config.data,
        status: response.status,
        ok: true,
        responseBody: response.data,
        ms: performance.now() - (response.config.metadata?.startedAt ?? performance.now()),
      });
      return response;
    },
    (error) => {
      const config = error.config || {};
      logCall({
        method: (config.method || 'GET').toUpperCase(),
        url: `${config.baseURL || ''}${config.url || ''}`,
        requestBody: config.data,
        status: error.response?.status,
        ok: false,
        responseBody: error.response?.data,
        ms: performance.now() - (config.metadata?.startedAt ?? performance.now()),
        error: error.response ? undefined : error.message,
      });
      return Promise.reject(error);
    }
  );
};
