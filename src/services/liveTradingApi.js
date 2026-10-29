/**
 * The live-trading endpoints (broker connection, login, execution settings).
 *
 * HOST: relative /api/live, through the same Vite proxy as the rest of the app.
 * An earlier version called http://127.0.0.1:8000 directly, which resolved to
 * the BROWSER's machine and was refused everywhere but the backend host.
 *
 * The broker account id lives in localStorage under `live_broker_account_id`:
 * every later call is keyed by it and no endpoint looks it up again.
 */
import logger from '../utils/logger';

const LIVE_API = '/api/live';

const BROKER_ID_KEY = 'live_broker_account_id';

/**
 * Whether the stored broker is logged in. Kept in localStorage because the
 * login happens on the Broker Setup screen while Algo Trade is what needs to
 * know -- component state does not survive that navigation, and there is no
 * status endpoint to ask instead. Replace with a real check when one exists.
 *
 * Declared HERE, above clearBrokerAccount, which reads it: a const is hoisted
 * but not initialised, so a read above its declaration throws.
 */
const LOGGED_IN_KEY = 'live_broker_logged_in';

/** The id of the broker account added on this machine, or null. */
export const getBrokerAccountId = () => {
  const raw = localStorage.getItem(BROKER_ID_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
};

export const setBrokerAccountId = (id) => {
  localStorage.setItem(BROKER_ID_KEY, String(id));
};

/** Remove the broker connection entirely (NOT used by logout -- logout only
 *  clears the flag below, keeping the id so Re-login works after a reload). */
export const clearBrokerAccount = () => {
  localStorage.removeItem(BROKER_ID_KEY);
  localStorage.removeItem(LOGGED_IN_KEY);
};

export const isBrokerLoggedIn = () => localStorage.getItem(LOGGED_IN_KEY) === 'true';

export const setBrokerLoggedIn = (on) => {
  localStorage.setItem(LOGGED_IN_KEY, on ? 'true' : 'false');
};

/**
 * broker_account_id -> the name to show that connection under, cached from the
 * ONE screen that asks for it: Broker Setup.
 *
 * Algo Trade needs these names to label a deployment's broker, but must not
 * call GET /live/brokers itself -- that request belongs to Broker Setup. So the
 * names are written down when that screen loads and read back here, and the
 * board costs a localStorage read instead of a request.
 */
const BROKER_NAMES_KEY = 'live_broker_names';

/** { [broker_account_id]: { name, live } }. */
export const getBrokerNames = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(BROKER_NAMES_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    // Tolerates the older shape, which stored a bare name string per id.
    return Object.fromEntries(Object.entries(raw).map(([id, value]) => [
      id,
      typeof value === 'string' ? { name: value, live: false } : value,
    ]));
  } catch {
    // Corrupt storage must not take the board down; unnamed brokers show "--".
    return {};
  }
};

/*
  Keyed by OUR catalogue id, not the API's value -- `brokerKey` below folds the
  API's many spellings onto these ids, so each broker is named in exactly one
  place however the backend spells it.
*/
export const BROKER_LABELS = {
  symphony: 'Symphony (Open XTS)',
  arham: 'ArhamW - CoLo',
};

/**
 * An API `broker` value -> OUR catalogue id, or undefined if unknown.
 *   'open_xts' | 'symphony' -> 'symphony'   'arham_wealth' | 'arham' -> 'arham'
 *
 * THE ONE PLACE THE TWO VOCABULARIES MEET -- the label, the logo and the
 * "APIs setup" count all need this answer and must agree, or a connection gets
 * counted under one card while wearing another's mark. Case and separators are
 * normalised; only one exact spelling has been seen from the backend so far.
 */
const BROKER_KEYS = {
  symphony: 'symphony',
  open_xts: 'symphony',
  arham: 'arham',
  arham_wealth: 'arham',
};

export const brokerKey = (raw) => BROKER_KEYS[
  String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
];

/**
 * The display name for an API `broker` value. An unrecognised value is shown
 * verbatim rather than guessed at.
 */
export const brokerLabel = (raw) => BROKER_LABELS[brokerKey(raw)] || raw || 'Broker';

/**
 * Whether a broker session is actually usable right now.
 *
 * `logged_in` alone is not enough: the session carries an `expires_at` that
 * the backend sets to 08:30, and a token that lapsed overnight still comes
 * back with logged_in true. Treating that as live showed Logout and Re-login
 * on an account that could not place an order -- so an expired session reads
 * as logged out and the card offers Login.
 *
 * HERE, not in a component: Broker Setup and the board both ask this
 * question, and two copies of the rule is two chances for one screen to
 * think a broker is connected while the other does not.
 */
export const brokerSessionLive = (account) => {
  const session = account?.session;
  if (!session?.logged_in) return false;
  const raw = session.expires_at;
  if (!raw) return true;
  // "2026-10-02 10:53:20.271675" is not a format every browser parses, so the
  // space is replaced before Date sees it.
  const expires = new Date(String(raw).replace(' ', 'T'));
  return Number.isNaN(expires.getTime()) || expires.getTime() > Date.now();
};

/**
 * GET /live/brokers rows -> the `{ id: { name, live, expiresAt } }` shape the
 * whole app reads.
 *
 * One mapping, so the stored copy means the same thing no matter which
 * screen wrote it. The expiry rides along because Algo Trade reads this
 * WITHOUT making a request of its own -- see `brokerEntryLive`.
 */
export const brokerEntriesFrom = (rows = []) => Object.fromEntries(
  rows.map((r) => [
    String(r.broker_account_id),
    {
      name: r.connection_name || brokerLabel(r.broker),
      live: brokerSessionLive(r),
      expiresAt: r?.session?.expires_at || null,
    },
  ]),
);

/**
 * Is a cached broker entry still usable?
 *
 * `live` alone is not enough: it was true when Broker Setup last loaded,
 * which may have been yesterday. `expiresAt` is the server's own cutoff
 * (08:30), so an entry written before it correctly reads dead this morning
 * without anyone having to re-open Broker Setup.
 *
 * An entry with no expiry is trusted, for the older cache shape.
 */
export const brokerEntryLive = (entry) => {
  if (!entry?.live) return false;
  const raw = entry.expiresAt;
  if (!raw) return true;
  const at = new Date(String(raw).replace(' ', 'T')).getTime();
  return Number.isNaN(at) || at > Date.now();
};

export const setBrokerNames = (names) => {
  localStorage.setItem(BROKER_NAMES_KEY, JSON.stringify(names || {}));
};

/**
 * Shared response handling: the API answers with { status, message, data }, so
 * a 200 can still carry status:false. Both paths are surfaced the same way so
 * callers only have to look at one shape.
 */
const send = async (url, options) => {
  const res = await fetch(url, options);
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }

  if (!res.ok || !body || body.status !== true) {
    // FastAPI reports validation failures in `detail`, which is either a
    // string or a list of {loc, msg} entries naming the offending field. The
    // old code only looked at `message`, so those arrived as a bare
    // "Request failed (400)" with the actual reason hidden in the response.
    const detail = body?.detail;
    let fromDetail = null;
    if (Array.isArray(detail)) {
      fromDetail = detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join(' | ');
    } else if (typeof detail === 'string') {
      fromDetail = detail;
    } else if (detail && typeof detail === 'object') {
      // Some handlers answer with a detail OBJECT rather than a string or the
      // usual validation list. Show its own message/error if it has one, and
      // otherwise the whole thing -- anything is better than swallowing it.
      fromDetail = detail.message || detail.error || JSON.stringify(detail);
    }

    const message = fromDetail || body?.message || `Request failed (${res.status})`;
    logger.error('[liveTrading]', url, res.status, message, body);
    throw new Error(message);
  }
  return body;
};

/** POST /api/live/brokers — add a broker connection. */
export const addBroker = async ({
  connectionName, interactiveKey, interactiveSecret,
  marketdataKey, marketdataSecret, connectionUrl, hostLookupUrl,
  dealerClientId = '',
}) => {
  const body = await send(`${LIVE_API}/brokers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection_name: connectionName,
      interactive_key: interactiveKey,
      interactive_secret: interactiveSecret,
      marketdata_key: marketdataKey,
      marketdata_secret: marketdataSecret,
      /*
        null SURVIVES; everything else is sent as given.

        A broker whose form locks a field (ArhamW's CoLo endpoints and dealer
        id) passes null for it, meaning "this broker has no value here" --
        distinct from the empty string, which means "the user left it blank".
        `|| ''` would have flattened the two together, so the check below is
        explicitly against null rather than falsy.
      */
      connection_url: connectionUrl ?? null,
      host_lookup_url: hostLookupUrl ?? null,
      // Always present. An empty string when the dealer toggle is off or the
      // field was left blank -- the field is never omitted from the request.
      dealer_client_id: dealerClientId == null ? null : (dealerClientId || ''),
    }),
  });

  /*
    THE NEW ACCOUNT DOES NOT BECOME "THE" BROKER IF ONE IS ALREADY STORED.

    This pointer is what Activation sends as `broker_account_id`, and a broker
    that has just been added has not been logged in yet. With two brokers on
    the screen, adopting the new id here left storage naming an un-logged-in
    connection while the `logged_in` flag was still true from the other one --
    normally corrected a moment later by loadAccounts(), but NOT if that
    refetch failed, and the stale pair would then be sent on a live
    activation. Deliberately adopted when nothing is stored, so the
    first-ever connection still works exactly as before.
  */
  const id = body?.data?.broker_account_id;
  if (id != null && getBrokerAccountId() == null) setBrokerAccountId(id);
  return body;
};

/** POST /api/live/brokers/{id}/login — log the stored broker account in. */
export const loginBroker = async (brokerAccountId) => {
  const id = brokerAccountId ?? getBrokerAccountId();
  if (id == null) throw new Error('No broker account set up yet.');
  const body = await send(`${LIVE_API}/brokers/${id}/login`, { method: 'POST' });
  // The response's broker_account_id is authoritative when present; the id we
  // called with is the fallback. Either way storage holds the id and the flag
  // flips true.
  setBrokerAccountId(body?.data?.broker_account_id ?? id);
  setBrokerLoggedIn(true);
  return body;
};


/**
 * Which deployment belongs to which strategy, and when it was activated.
 *
 * The activate response carries the new deployment_id but no timestamp the UI
 * can show, and neither the snapshot nor the deployment detail reports when the
 * user pressed the button. So the moment of the click is recorded here, keyed by
 * strategy id, and View Trades reads it back for "Deployed" / "Last Unpaused"
 * (the same instant, until a pause/resume endpoint reports otherwise).
 *
 * Re-activating a strategy replaces its entry: the newest deployment is the one
 * the screens are about.
 */
const DEPLOYMENTS_KEY = 'live_deployments';

const readDeployments = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DEPLOYMENTS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    // Corrupt storage must not take the screen down with it.
    return {};
  }
};

export const getDeployments = readDeployments;

/** { deployment_id, deployed_at } for a strategy, or null. */
export const getDeploymentFor = (strategyId) => readDeployments()[String(strategyId)] || null;

/** The activation time of a deployment, whichever strategy it belongs to. */
export const getDeployedAt = (deploymentId) => {
  const match = Object.values(readDeployments())
    .find((entry) => String(entry?.deployment_id) === String(deploymentId));
  return match?.deployed_at || null;
};

export const rememberDeployment = (strategyId, deploymentId, deployedAt = new Date().toISOString()) => {
  if (strategyId == null || deploymentId == null) return;
  const all = readDeployments();
  all[String(strategyId)] = { deployment_id: deploymentId, deployed_at: deployedAt };
  localStorage.setItem(DEPLOYMENTS_KEY, JSON.stringify(all));
};

/**
 * Six of the fields the endpoint expects have no control in the execution
 * dialog, so they are sent as the defaults from the API's own example. They are
 * gathered here rather than inlined at the call site so there is one place to
 * change if inputs for them are added later.
 */
/**
 * The execution dialog stores picked days as JS day NUMBERS (Sun 0 .. Sat 6),
 * because that is what its chips toggle. The API wants its own labels, so the
 * two are mapped here. Order is fixed Mon-first rather than click order, which
 * is also what the API's example shows.
 */
const DAY_LABELS = { 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa', 0: 'Su' };
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const toDayLabels = (nums) => DAY_ORDER
  .filter((n) => nums.includes(n))
  .map((n) => DAY_LABELS[n]);

/**
 * Per-leg mapping. The execution dialog stores camelCase keys with UI-cased
 * values ("Trigger", "Limit", "Points", "Continuous"); the API wants
 * snake_case keys with upper-cased enums, and rejects anything else outright
 * ("legs[1]: unknown keys [...]"). Numbers arrive from the inputs as strings.
 */
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const toApiLeg = (leg = {}) => ({
  product: (leg.product || 'NRML').toUpperCase(),
  tgt_sl_ref_price: (leg.refPrice || 'Traded').toUpperCase(),
  delay_entry_sec: num(leg.delayEntry),
  entry_order_type: (leg.entryType || 'Limit').toUpperCase(),
  exit_order_type: (leg.exitType || 'Limit').toUpperCase(),
  // The dialog shows "%" where the API's enum word is PERCENT.
  entry_buffer_type: leg.entryBufferType === '%' ? 'PERCENT' : 'POINTS',
  exit_buffer_type: leg.exitBufferType === '%' ? 'PERCENT' : 'POINTS',
  entry_trigger_buffer: num(leg.entryTrigger),
  entry_limit_buffer: num(leg.entryLimit),
  exit_trigger_buffer: num(leg.exitTrigger),
  exit_limit_buffer: num(leg.exitLimit),
  // No control for this in the dialog; the API's example sends true.
  sl_order_at_broker: true,
  trail_monitoring: (leg.monitoring || 'Continuous').toUpperCase(),
  trail_frequency_sec: num(leg.frequency, 5),
  // No controls either -- the API's example values.
  entry_convert_to_market_sec: 0,
  exit_convert_to_market_sec: 20,
});

const SETTINGS_DEFAULTS = {
  mode: 'live',
  monitoring_frequency_sec: 0,
  order_timeout_sec: 50,
  exit_fallback_market: true,
  max_daily_loss: 0,
  paper_slippage_pct: 0,
};

/**
 * POST /api/live/execution-settings.
 *
 * `legs` arrives from the dialog as an ARRAY (one entry per leg) and the API
 * wants an object keyed by 1-based leg number, so it is re-keyed here.
 * A successful save is what marks the strategy ready to deploy -- the caller
 * should not flip that chip on its own.
 */
export const saveExecutionSettings = async ({
  strategyId, version = 0, brokerAccountId, autoActivate = false, settings,
}) => {
  const brokerId = brokerAccountId ?? getBrokerAccountId();
  if (brokerId == null) throw new Error('No broker account set up yet.');

  const legs = {};
  (settings.legs || []).forEach((leg, i) => { legs[String(i + 1)] = toApiLeg(leg); });

  const body = await send(`${LIVE_API}/execution-settings`, {
    // PUT, not POST -- the backend defines this route as PUT and answers POST
    // with a 405 Method Not Allowed.
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy_id: strategyId,
      version,
      broker_account_id: brokerId,
      auto_activate: autoActivate,
      settings: {
        ...SETTINGS_DEFAULTS,
        qty_multiplier: Number(settings.qty) || 1,
        /*
          THE API'S TWO VALUES ARE `LTP` AND `CANDLE_CLOSE`. Nothing else.

          This sent "ON LTP" / "ON CANDLE CLOSE" until now -- the dialog's own
          wording with the case changed, which is not what the endpoint
          defines. The read below stays loose about spelling so settings saved
          before this change still show the right button.

          The dialog's own field is `monitorMode` ("on LTP" / "on Candle
          Close"). An earlier version read `settings.tradeMonitoring`, which
          the dialog has never sent, so the fallback won every time and a
          strategy set to Candle Close was saved -- and run -- on LTP.
        */
        trade_monitoring: settings.monitorMode === 'on Candle Close'
          ? 'CANDLE_CLOSE'
          : 'LTP',
        strategy_execution_time: settings.execTime || null,
        // The dialog's mode is a UI label ("Weekdays"/"DTE"); the API wants it
        // lowercase, and rejects an empty day list in weekdays mode with a 400.
        // No chips picked means "every weekday", so that is what gets sent.
        execution_days_mode: settings.daysMode === 'DTE' ? 'dte' : 'weekdays',
        execution_days: settings.daysMode === 'DTE'
          ? []
          : (settings.days?.length ? toDayLabels(settings.days) : ['M', 'T', 'W', 'Th', 'F']),
        execution_dte: settings.daysMode === 'DTE' ? (settings.dte || []) : [],
        squareoff_on_entry_error: Boolean(settings.autoSqOff),
        legs,
      },
    }),
  });

  return body;
};

/**
 * The inverse of everything above: one `execution_settings` entry from
 * GET /live/overview, turned back into the shape the execution dialog holds.
 *
 * This is what makes "Ready to deploy" and the Execution On column survive a
 * reload -- the settings are read back from the server rather than remembered
 * in the browser, so what the chip claims and what will actually run are the
 * same thing.
 *
 * Deliberately tolerant: the backend carries entries from an older save that
 * have no `execution_days_mode`, no `execution_dte` and no `legs` at all. Those
 * are read as weekday settings with default legs rather than skipped.
 */
const DAY_NUMBERS = { M: 1, T: 2, W: 3, Th: 4, F: 5, Sa: 6, Su: 0 };

/** 'MPP' -> 'MPP', 'LIMIT' -> 'Limit', 'TRADED' -> 'Traded'. */
const titleCase = (value, allowed) => {
  if (value == null) return undefined;
  const text = String(value);
  const match = allowed.find((option) => option.toUpperCase() === text.toUpperCase());
  return match ?? text;
};

export const fromApiLeg = (leg = {}) => ({
  product: titleCase(leg.product, ['NRML', 'MIS']) ?? 'NRML',
  refPrice: titleCase(leg.tgt_sl_ref_price, ['Traded', 'Trigger']) ?? 'Trigger',
  delayEntry: String(leg.delay_entry_sec ?? 0),
  entryType: titleCase(leg.entry_order_type, ['Limit', 'MPP']) ?? 'Limit',
  exitType: titleCase(leg.exit_order_type, ['Limit', 'MPP']) ?? 'Limit',
  entryBufferType: leg.entry_buffer_type === 'PERCENT' ? '%' : 'Points',
  exitBufferType: leg.exit_buffer_type === 'PERCENT' ? '%' : 'Points',
  entryTrigger: String(leg.entry_trigger_buffer ?? 0),
  entryLimit: String(leg.entry_limit_buffer ?? 3),
  exitTrigger: String(leg.exit_trigger_buffer ?? 0),
  exitLimit: String(leg.exit_limit_buffer ?? 3),
  monitoring: titleCase(leg.trail_monitoring, ['Continuous', 'Delayed']) ?? 'Continuous',
  frequency: String(leg.trail_frequency_sec ?? 5),
});

export const fromApiSettings = (settings = {}) => {
  // Keyed by leg number in the response ("1", "2"); the dialog wants an array
  // in leg order, so the keys are sorted numerically rather than as strings --
  // "10" must not land between "1" and "2".
  const legEntries = Object.entries(settings.legs || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  const dte = Array.isArray(settings.execution_dte) ? settings.execution_dte : [];
  return {
    qty: String(settings.qty_multiplier ?? 1),
    autoSqOff: settings.squareoff_on_entry_error !== false,
    /*
      The mirror of the save above, and deliberately LOOSE about spelling.

      Three forms exist in the wild: the API's own `CANDLE_CLOSE`, the
      "ON CANDLE CLOSE" this app sent for a while, and a bare "CANDLE CLOSE".
      An exact match against any one of them would silently reset the other two
      to LTP -- the quiet kind of wrong, because the dialog would look right
      while the deployment ran on the other mode.

      So: anything mentioning CANDLE is Candle Close, everything else is LTP.
    */
    monitorMode: /CANDLE/.test(String(settings.trade_monitoring || '').toUpperCase())
      ? 'on Candle Close'
      : 'on LTP',
    execTime: settings.strategy_execution_time || null,
    daysMode: settings.execution_days_mode === 'dte' ? 'DTE' : 'Weekdays',
    days: (settings.execution_days || [])
      .map((label) => DAY_NUMBERS[label])
      .filter((n) => n !== undefined),
    dte,
    dteAll: dte.length === 80,
    legs: legEntries.map(([, leg]) => fromApiLeg(leg)),
  };
};


/** GET /api/live/overview — saved execution settings + today's deployments. */
export const fetchOverview = () => send(`${LIVE_API}/overview`, { method: 'GET' });

/** GET /api/live/brokers/{id}/funds — available margin and margin blocked. */
export const fetchBrokerFunds = (brokerAccountId) =>
  send(`${LIVE_API}/brokers/${brokerAccountId}/funds`, { method: 'GET' });

/** GET /api/live/brokers — broker accounts and today's login state. */
export const fetchBrokers = () => send(`${LIVE_API}/brokers`, { method: 'GET' });

/**
 * GET /api/live/deployments/{id} — one deployment in full: legs, every order
 * sent, and the event timeline. This is what the View Trades screen loads on
 * mount; the per-second live figures then arrive over the socket.
 */
export const fetchDeployment = (deploymentId) =>
  send(`${LIVE_API}/deployments/${deploymentId}`, { method: 'GET' });

/**
 * GET /api/live/deployments?trade_date=YYYY-MM-DD — every deployment of one
 * trading day. The endpoint takes a single date, so History asks for its start
 * date; there is no range parameter to widen it with.
 */
export const fetchDeploymentsByDate = (tradeDate, { includeArchived = false } = {}) =>
  send(
    `${LIVE_API}/deployments?trade_date=${encodeURIComponent(tradeDate)}`
    + (includeArchived ? '&include_archived=true' : ''),
    { method: 'GET' },
  );

/** POST /api/live/deployments — activate. Returns the new deployment_id. */
export const createDeployment = (payload) => send(`${LIVE_API}/deployments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

/** Per-deployment controls. One helper: the three share a shape. */
const deploymentAction = (id, action) =>
  send(`${LIVE_API}/deployments/${id}/${action}`, { method: 'POST' });

export const squareOffDeployment = (id) => deploymentAction(id, 'squareoff');

/** POST /api/live/deployments/{id}/manual — hand ONE deployment back to the
 *  user. The route is `manual`, not `pause`; this called `pause` before. */
export const switchToManual = (id) => deploymentAction(id, 'manual');

/**
 * POST /api/live/deployments/{id}/resume — schedule ONE paused deployment to
 * restart.
 *
 *   { "restart_at": "09:15:15" }
 *
 * `restartAt` is always sent: the dialog's Scheduled Restart switch chooses
 * BETWEEN a time the user picked and the 09:15:15 default, it does not choose
 * whether to send one. So there is no shape where the body is empty.
 */
export const restartDeployment = (id, restartAt) => send(`${LIVE_API}/deployments/${id}/resume`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ restart_at: restartAt }),
});

/**
 * POST /api/live/deployments/{id}/resume — retry a deployment that ERRORED.
 *
 * THE SAME URL as restartDeployment above, and that is deliberate on the
 * backend's side: the body is what separates them. A scheduled restart sends
 * `{ restart_at }` and is NOT touched by this; resume sends an empty object.
 *
 * `{}` rather than no body at all: the endpoint parses JSON, and a POST with
 * neither a body nor a Content-Type is a different request to it.
 *
 * Offered only while the snapshot reports `status: "error"` with
 * `resumable: true` -- a terminal error comes back resumable:false and has no
 * Resume button at all.
 *
 * The reply is the deployment snapshot: on success `status` is running and
 * `resumable` false, and the retried leg appears as a NEW attempt carrying
 * `entry_mode: RESUME`. A retry that fails again returns to error with a
 * fresh reason and resumable true, so it can be pressed again.
 */
export const resumeDeployment = (id) => send(`${LIVE_API}/deployments/${id}/resume`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});

/**
 * POST /api/live/restart-all — several at once, each with its own time:
 *   { "restarts": [ { "deployment_id": 22, "restart_at": "09:15:15" }, ... ] }
 *
 * PARTIAL SUCCESS IS NORMAL. The reply is one row per deployment, and
 * `status: true` at the top only means the request was understood -- a row
 * carrying `error` did NOT restart. The caller must read every row.
 */
export const restartAll = (restarts) => send(`${LIVE_API}/restart-all`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ restarts }),
});

/**
 * DELETE /api/live/brokers/{id} — removes the broker account entirely.
 *
 * No request body; replies { status: true, message: "Broker removed." }.
 * Destructive and irreversible, so nothing calls this without a confirmation
 * in front of it.
 */
export const deactivateBroker = (brokerAccountId) =>
  send(`${LIVE_API}/brokers/${brokerAccountId}`, { method: 'DELETE' });

/** POST /api/live/cancel-all — same per-deployment reply shape as restart-all. */
export const cancelAll = () => send(`${LIVE_API}/cancel-all`, { method: 'POST' });

/**
 * GET /api/live/activation-timings — the entry/exit window a strategy would
 * be deployed with, and WHICH of the four fields the user may change.
 *
 *   data.editable = { entry_date, entry_time, exit_date, exit_time }
 *
 * The flags are the point: a BTST strategy always enters today, so it comes
 * back with entry_date false and the field is shown read-only rather than
 * hidden. Hiding it would leave the user wondering what date it will use.
 */
export const fetchActivationTimings = (strategyId, version = 0) => send(
  `${LIVE_API}/activation-timings?strategy_id=${encodeURIComponent(strategyId)}&version=${encodeURIComponent(version)}`,
  { method: 'GET' },
);

/**
 * POST /api/live/brokers/{id}/logout — end a broker session. No body.
 *
 * REFUSED while deployments are still live on that broker: the server answers
 * with status false and a message naming how many, and nothing is logged out.
 * `send` surfaces that as a thrown Error carrying the message, so the caller
 * only has to decide what to show.
 *
 * On success the reply carries the whole account back with
 * `session.logged_in: false`, which is what the card and the stored copy are
 * then rebuilt from -- no guessing at the new state.
 */
export const logoutBroker = (id) => send(`${LIVE_API}/brokers/${id}/logout`, { method: 'POST' });

/** POST /api/live/deployments/{id}/cancel — drop a paused deployment. */
export const cancelDeployment = (id) => deploymentAction(id, 'cancel');

/** POST /api/live/deployments/{id}/unarchive — put an archived card back. */
export const unarchiveDeployment = (id) => deploymentAction(id, 'unarchive');

/** POST /api/live/squareoff-all — the kill switch. */
export const squareOffAll = () => send(`${LIVE_API}/squareoff-all`, { method: 'POST' });

/** POST /api/live/manual-all — hand every running deployment back at once. */
export const switchAllToManual = () => send(`${LIVE_API}/manual-all`, { method: 'POST' });

/** DELETE /api/live/deployments/{id} — archive a finished card. */
export const archiveDeployment = (id) =>
  send(`${LIVE_API}/deployments/${id}`, { method: 'DELETE' });
