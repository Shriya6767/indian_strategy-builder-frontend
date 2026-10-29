/**
 * The browser half of the file logger: one line per event, posted in batches
 * to /__log, where the Vite plugin prints and appends them to src/logs/.
 *
 * RECORDED: date, time, which API, its status, duration, any error text.
 * NOT RECORDED: request/response bodies, tokens, broker credentials. A log on
 * disk -- shared with whoever tests through the tunnel -- must not carry them.
 *
 * Deliberately unable to break the app: no export throws, a failed post is
 * dropped, and with no plugin listening it turns itself off after one failure.
 */

const ENDPOINT = '/__log';
const FLUSH_MS = 2000;
/** Lines held while offline. Beyond this the OLDEST are dropped: during an
 *  incident the newest lines are the ones worth keeping. */
const MAX_QUEUE = 500;

let queue = [];
let timer = null;
let disabled = false;
/** Consecutive failed posts. Three in a row means nobody is listening. */
let failures = 0;

/**
 * A short id for THIS browser.
 *
 * Everyone testing through the ngrok tunnel writes into one file on the
 * developer's machine, so without this their lines would be indistinguishable.
 * Random, per tab, and meaningless outside the log -- it identifies no person.
 */
const clientId = (() => {
  try {
    const existing = sessionStorage.getItem('fe_log_client');
    if (existing) return existing;
    const made = Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('fe_log_client', made);
    return made;
  } catch {
    return Math.random().toString(36).slice(2, 8);
  }
})();

const post = (batch) => {
  try {
    const body = JSON.stringify(batch);

    /*
      sendBeacon FIRST: it survives the page being closed, which is exactly
      when the last lines before a crash or a reload would otherwise be lost.
      fetch with keepalive is the fallback where it is unavailable.
    */
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) {
      failures = 0;
      return;
    }

    /*
      window.fetch, NOT the app's logging wrapper -- and this URL has no
      "/api/", so apiLogger ignores it either way. A log that logged itself
      would loop.
    */
    fetch(ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then(() => { failures = 0; })
      .catch(() => {
        failures += 1;
        // Three failures: no plugin is listening (a built app served by
        // something other than Vite). Stop trying rather than retry forever.
        if (failures >= 3) disabled = true;
      });
  } catch {
    /* Never let logging throw into the caller. */
  }
};

const flush = () => {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  post(batch);
};

/**
 * Queue one line. Batched rather than posted per event: a busy second can
 * produce a dozen events, and a dozen requests a second is its own problem.
 */
const record = (level, message) => {
  if (disabled || typeof window === 'undefined') return;
  try {
    queue.push({ level, client: clientId, message: String(message ?? '') });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  } catch {
    /* ignored */
  }
};

export const logInfo = (message) => record('INFO', message);
export const logWarn = (message) => record('WARN', message);
export const logError = (message) => record('ERROR', message);

/** Path + query only: the host adds nothing and makes every line longer. */
const shortUrl = (url) => {
  try {
    const u = new URL(url, window.location.origin);
    return `${u.pathname}${u.search}`;
  } catch {
    return String(url || '');
  }
};

/**
 * One API call. Errors (network failure or a 4xx/5xx) are ERROR so they also
 * land in frontend-error.log; everything else is INFO.
 */
export const logApi = ({ method, url, status, ms, error }) => {
  const head = `${String(method || 'GET').toUpperCase().padEnd(4)} ${shortUrl(url)}`;
  const took = ms == null ? '' : ` (${Math.round(ms)}ms)`;

  if (error) return record('ERROR', `${head} -> FAILED ${error}${took}`);
  const level = status >= 400 ? 'ERROR' : 'INFO';
  return record(level, `${head} -> ${status}${took}`);
};

/**
 * The errors nobody is catching today: there is no window.onerror and no
 * unhandledrejection handler anywhere in the app, so a crash mid-session
 * currently leaves no trace at all once the console is gone.
 *
 * Installed once, from main.jsx, before render.
 */
export const installGlobalErrorLog = () => {
  if (typeof window === 'undefined' || window.__feLogInstalled) return;
  window.__feLogInstalled = true;

  window.addEventListener('error', (event) => {
    // Failed <img>/<script> loads arrive here too, with no `error` object.
    if (!event?.error && !event?.message) return;
    const where = event.filename
      ? ` at ${shortUrl(event.filename)}:${event.lineno}:${event.colno}`
      : '';
    logError(`JS ${event.error?.message || event.message}${where}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    logError(`PROMISE ${reason?.message || reason}`);
  });

  // The queue is flushed on the way out, so the last lines before a reload or
  // a close are not lost. `pagehide` fires where `beforeunload` does not
  // (notably on mobile and on bfcache navigations).
  window.addEventListener('pagehide', flush);

  logInfo(`SESSION started -- ${window.location.pathname}`);
};
