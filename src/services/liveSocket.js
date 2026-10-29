import { getToken } from '../auth/authSession';
import logger from '../utils/logger';

/**
 * ONE WebSocket for the whole app, carrying every deployment the user has.
 * Module-level singleton with a subscriber list: opens on the first
 * subscriber, closes when the last leaves, retains only the latest snapshot.
 *
 * /ws is proxied to the backend in vite.config.js, as /api is. Frames are
 * binary (TextDecoder then JSON.parse). READ-ONLY apart from the keep-alive.
 *
 * Every handler ignores events from a socket that is no longer current, so
 * StrictMode's mount/unmount/mount cannot leave an orphaned second socket.
 */

const PING_MS = 30_000;
const STALE_MS = 5_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * PART B -- the last snapshot, kept so a REFRESH does not blank the board.
 *
 * A WebSocket cannot survive a reload, and the board rendered empty for the
 * reconnect second -- which during a live session reads as "my positions are
 * gone". sessionStorage, NOT localStorage: it dies with the tab, so
 * yesterday's MTM can never greet a fresh morning.
 *
 * A cached snapshot NEVER counts as live: `connected` stays false and
 * `fromCache` true until a real frame lands.
 */
const CACHE_KEY = 'live_snapshot_cache';
const CACHE_MAX_AGE_MS = 120_000;
const CACHE_WRITE_MS = 3_000;
let lastCacheWrite = 0;

const readCache = () => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, snapshot } = JSON.parse(raw);
    // Older than two minutes is not "last known", it is wrong.
    if (!at || Date.now() - at > CACHE_MAX_AGE_MS) return null;
    return snapshot || null;
  } catch {
    return null;
  }
};

const writeCache = (snapshot) => {
  const now = Date.now();
  // Snapshots arrive about once a second; serialising each one is wasted work.
  if (now - lastCacheWrite < CACHE_WRITE_MS) return;
  lastCacheWrite = now;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, snapshot }));
  } catch {
    /* Storage full or blocked: the socket is unaffected. */
  }
};

let socket = null;
let subscribers = new Set();
let latest = readCache();
/** True while `latest` is the cached copy rather than a frame from this page. */
let fromCache = latest !== null;
let stale = false;
let attempt = 0;
let pingTimer = null;
let staleTimer = null;
let retryTimer = null;
let teardownTimer = null;
let closedByUs = false;

/**
 * Grace period before the socket is torn down once the last subscriber leaves.
 *
 * React StrictMode mounts an effect, unmounts it, and mounts it again. Without
 * this delay the unmount closes a socket that is still CONNECTING, which the
 * browser reports as "WebSocket is closed before the connection is
 * established" -- the handshake never gets to finish. A remount inside the
 * window cancels the teardown and keeps the same socket.
 *
 * It also helps in normal use: moving between two screens that both show live
 * data reuses one connection instead of closing and reopening it.
 */
const TEARDOWN_MS = 250;

/**
 * Connection diagnostics. Cheap by construction: every field is written inside
 * a handler that already runs, so there is no extra timer or listener. Read it
 * from the console with `__liveSocket()` -- see the export at the bottom.
 */
const diag = {
  opens: 0,          // successful handshakes this session
  closes: 0,
  snapshots: 0,
  lastSnapshotAt: null,
  lastCloseCode: null,
  lastCloseReason: null,
  lastError: null,
};

let onAuthFailure = null;
export const setAuthFailureHandler = (fn) => { onAuthFailure = fn; };

const emit = () => {
  const state = {
    snapshot: latest,
    stale,
    connected: socket?.readyState === WebSocket.OPEN,
    fromCache,
  };
  subscribers.forEach((fn) => {
    try { fn(state); } catch (err) { logger.error('[liveSocket] subscriber threw', err); }
  });
};

const markFresh = () => {
  if (stale) { stale = false; }
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    const running = (latest?.deployments || []).some((d) => d.status === 'running');
    if (running) { stale = true; emit(); }
  }, STALE_MS);
};

const socketUrl = () => {
  const token = getToken();
  if (!token) return null;
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws/live?token=${encodeURIComponent(token)}`;
};

const connect = () => {
  const url = socketUrl();
  if (!url || socket) return;

  closedByUs = false;
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    logger.error('[liveSocket] could not open', err);
    scheduleReconnect();
    return;
  }
  ws.binaryType = 'arraybuffer';
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;               // replaced or closed meanwhile
    diag.opens += 1;
    attempt = 0;
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, PING_MS);
    emit();
  };

  ws.onmessage = (ev) => {
    if (socket !== ws) return;
    try {
      const text = typeof ev.data === 'string'
        ? ev.data
        : new TextDecoder().decode(ev.data);
      const msg = JSON.parse(text);
      if (msg?.type !== 'snapshot') return;
      diag.snapshots += 1;
      diag.lastSnapshotAt = Date.now();
      latest = msg;
      fromCache = false;                     // a real frame, not the cache
      writeCache(msg);
      markFresh();
      emit();
    } catch (err) {
      diag.lastError = String(err?.message || err);
      logger.error('[liveSocket] bad frame', err);
    }
  };

  ws.onerror = () => { /* onclose always follows; handled there */ };

  ws.onclose = (ev) => {
    if (socket !== ws) return;               // we replaced or closed it on purpose
    diag.closes += 1;
    diag.lastCloseCode = ev.code;
    diag.lastCloseReason = ev.reason || null;
    clearInterval(pingTimer);
    socket = null;

    if (ev.code === 4401) {
      logger.error('[liveSocket] token rejected (4401)');
      subscribers.clear();
      onAuthFailure?.();
      return;
    }
    emit();
    if (!closedByUs && subscribers.size > 0) scheduleReconnect();
  };
};

function scheduleReconnect() {
  const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  attempt += 1;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (subscribers.size > 0 && !socket) connect();
  }, wait);
}

export const subscribeLive = (fn) => {
  // A new subscriber cancels any teardown still pending from the last one.
  clearTimeout(teardownTimer);
  teardownTimer = null;
  subscribers.add(fn);
  if (!socket) connect();
  else fn({ snapshot: latest, stale, connected: socket.readyState === WebSocket.OPEN, fromCache });

  return () => {
    subscribers.delete(fn);
    if (subscribers.size > 0) return;

    clearTimeout(teardownTimer);
    teardownTimer = setTimeout(() => {
      // Re-checked: a remount during the grace period re-subscribed, and the
      // socket should stay.
      if (subscribers.size > 0) return;
      closedByUs = true;
      clearInterval(pingTimer);
      clearTimeout(staleTimer);
      clearTimeout(retryTimer);
      const s = socket;
      socket = null;                         // null first so its onclose is ignored
      s?.close();
    }, TEARDOWN_MS);
  };
};

export const getLatestSnapshot = () => latest;

/**
 * A one-line health check, for use from the console during market hours:
 *
 *   __liveSocket()
 *
 * `state` is the live readyState, `secondsSinceSnapshot` is the number that
 * matters most -- while a deployment is running it should never exceed 1-2.
 * Anything above 5 means the screen is not live, which is also what the
 * "Not live" chip in the UI reflects.
 */
export const getSocketStatus = () => ({
  state: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][socket?.readyState] ?? 'NONE',
  subscribers: subscribers.size,
  secondsSinceSnapshot: diag.lastSnapshotAt
    ? Math.round((Date.now() - diag.lastSnapshotAt) / 1000)
    : null,
  reconnectAttempt: attempt,
  stale,
  ...diag,
});

if (typeof window !== 'undefined') {
  window.__liveSocket = getSocketStatus;
  /*
    The DECODED snapshot, for reading from the console during market hours.
    Frames arrive binary (see binaryType above), so DevTools' own Messages tab
    shows them as blobs -- this is the only way to read what actually came in
    without adding logging to the hot path.

    A getter, not a stored copy: it always returns the latest frame rather
    than whatever was current when the console was opened.
  */
  window.__liveSnapshot = getLatestSnapshot;
}

/**
 * Vite replaces this module on edit, which resets the `socket` variable above
 * while the real connection stays open -- leaving an orphan that keeps
 * receiving frames nobody reads, and making it look as though the app opened
 * two connections. Closing it on dispose keeps exactly one socket per page.
 */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearInterval(pingTimer);
    clearTimeout(staleTimer);
    clearTimeout(retryTimer);
    clearTimeout(teardownTimer);
    const s = socket;
    socket = null;
    s?.close();
  });
}
