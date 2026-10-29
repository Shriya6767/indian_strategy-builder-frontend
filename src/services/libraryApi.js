/**
 * src/services/libraryApi.js
 *
 * The user's saved library, straight from the backend: GET /api/strategies and
 * GET /api/portfolios. Both are behind the signed-in user, so the row a request
 * gets back is already scoped to them — no user id is sent, and none should be.
 * The bearer token rides along automatically (see src/auth/authHeader.js), which
 * is why there is no Authorization header here.
 *
 * Both endpoints answer `{ status: true, data: [...] }`. The rows are read
 * loosely — a field is looked for under the two or three names the rest of this
 * app and the backend each use for it — so a response that spells something
 * differently still fills a card instead of leaving it blank.
 */

import { API_URL } from '../config/constants';
import logger from '../utils/logger';

/** First of `names` that the row actually has a value for. */
const pick = (row, names, fallback = undefined) => {
  for (const name of names) {
    const value = row?.[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

/** "HH:MM" out of "HH:MM:SS", "HH:MM" or nothing. */
const toHHMM = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
};

/**
 * The version a row's details should be read from: the one whose number matches
 * `latest_version`, or failing that the highest numbered one. A row carries
 * every version it has ever had, and the card is about the current strategy.
 */
const latestVersionOf = (row = {}) => {
  const versions = Array.isArray(row.versions) ? row.versions : [];
  if (!versions.length) return {};
  const wanted = row.latest_version ?? row.version;
  return versions.find((v) => v?.version === wanted)
    || versions.reduce((best, v) => ((v?.version ?? 0) > (best?.version ?? -1) ? v : best), versions[0]);
};

/**
 * One strategy row -> the shape the cards and the loaders already speak.
 *
 * The endpoint nests the details: the row itself has only the id, the name and
 * which version is current, while the symbol, type and date range live in the
 * matching entry of `versions`. `raw` is kept so a screen that wants a field
 * this does not name can still reach it without another request.
 */
export const normaliseStrategy = (row = {}) => {
  const current = latestVersionOf(row);
  return {
    id: pick(row, ['strategy_id', 'id']) ?? null,
    name: pick(row, ['strategy_name', 'name'], 'Untitled'),
    version: pick(row, ['latest_version', 'version', 'strategy_version'], null),
    // '' rather than a stand-in value when nothing carries it. A default here
    // becomes a LIE on screen: a SENSEX strategy reading "NIFTY" because the
    // field was missing is worse than a card with a blank line.
    symbol: pick(current, ['symbol'], pick(row, ['symbol', 'index', 'ticker'], '')),
    strategy_type: String(pick(current, ['strategy_type'], pick(row, ['strategy_type', 'type'], ''))),
    start_date: pick(current, ['start_date'], pick(row, ['start_date'], '')),
    end_date: pick(current, ['end_date'], pick(row, ['end_date'], '')),
    leg_count: pick(current, ['leg_count'], null),
    // Not in this response today; read anyway so they show the moment they are.
    entry_time: toHHMM(pick(current, ['entry_time'], pick(row, ['entry_time'], ''))),
    exit_time: toHHMM(pick(current, ['exit_time'], pick(row, ['exit_time'], ''))),
    created_at: pick(current, ['created_at', 'updated_at'], pick(row, ['created_at'], null)),
    versions: Array.isArray(row.versions) ? row.versions : [],
    raw: row,
  };
};

/** One portfolio row, same idea. */
/**
 * One of the backend's two risk blocks -> the shape OverallRiskDialog holds.
 *
 * Reading it here rather than at each screen keeps the four field names in one
 * place. A null value stays null: the box must come back empty, not as 0.
 */
export const riskFromRow = (row, prefix) => ({
  enabled: row?.[`is_${prefix}`] === true,
  type: String(row?.[`${prefix}_type`] || 'MTM').toLowerCase() === 'percent' ? 'percent' : 'mtm',
  mtmValue: row?.[`${prefix}_mtm_value`] ?? '',
  percentValue: row?.[`${prefix}_percent_value`] ?? '',
});

export const normalisePortfolio = (row = {}) => ({
  id: pick(row, ['portfolio_id', 'id']) ?? null,
  name: pick(row, ['portfolio_name', 'name'], 'Untitled'),
  strategies: pick(row, ['strategies', 'strategy_list', 'items'], []) || [],
  created_at: pick(row, ['created_at', 'createdAt', 'updated_at'], null),
  // Read straight off the row, NOT through pick(): null is a real answer here
  // (no days chosen) and pick() treats null as "missing" and moves on.
  period_selection: row?.period_selection ?? null,
  index: pick(row, ['index'], 'sensex'),
  qty_multiplier: pick(row, ['qty_multiplier'], 1),
  slippage: row?.slippage ?? 0,
  overallSL: riskFromRow(row, 'portfolio_sl'),
  overallTarget: riskFromRow(row, 'portfolio_target'),
  raw: row,
});

/**
 * The array inside a `{ status, data }` envelope. A backend that answers with a
 * bare array, or nests the list one level further, still reads — the alternative
 * is an empty library whenever a shape shifts.
 */
const rowsOf = (body) => {
  if (Array.isArray(body)) return body;
  const data = body?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.strategies)) return data.strategies;
  if (Array.isArray(data?.portfolios)) return data.portfolios;
  return [];
};

/**
 * How long to wait before giving up on one of these reads.
 *
 * WHY A LIMIT AT ALL: `fetch` has no timeout of its own. A request the server
 * accepts and then never answers stays pending for the life of the page, and
 * the screens here read "not loaded yet" as "still loading" -- so the
 * Strategies tab sat on "Loading…" with no error and no way back. Failing
 * visibly is worse than succeeding and better than hanging.
 */
const TIMEOUT_MS = 20_000;

const getJson = async (path, label) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    // An abort reads as a plain "AbortError" otherwise, which tells the user
    // nothing about what did not happen.
    if (err?.name === 'AbortError') {
      throw new Error(
        `${label} took too long to load — the server did not respond.`,
        { cause: err },
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    // Said plainly: an expired session reads as "empty library" otherwise, and
    // the user re-creates work that is still there.
    throw new Error('Your session has expired — please sign in again.');
  }
  if (!response.ok) {
    throw new Error(`${label} could not be loaded (${response.status}).`);
  }

  const body = await response.json();
  if (body && body.status === false) {
    throw new Error(body.message || body.detail || `${label} could not be loaded.`);
  }
  return body;
};

/** Every strategy the signed-in user has saved. */
/**
 * One row per NAME — the latest.
 *
 * The endpoint returns one entry per `strategy_id` with its versions nested,
 * so two entries can share a NAME while being separate records -- which is how
 * "intra" came to be listed twice, one Ready to deploy and one Setup Pending.
 *
 * WHICH WINS: the higher `latest_version`, then the more recent `created_at`.
 * THE HIDDEN RECORD STILL EXISTS on the server -- this is a display rule, not
 * a delete, so removing the visible one makes the older reappear.
 */
const keyOf = (row) => String(row?.name || '').trim().toLowerCase();

const isNewer = (a, b) => {
  const va = Number(a?.version) || 0;
  const vb = Number(b?.version) || 0;
  if (va !== vb) return va > vb;
  return String(a?.created_at || '') > String(b?.created_at || '');
};

export const latestPerName = (rows = []) => {
  const best = new Map();
  rows.forEach((row) => {
    const key = keyOf(row);
    if (!key) return;                       // unnamed rows are never collapsed
    const prev = best.get(key);
    if (!prev || isNewer(row, prev)) best.set(key, row);
  });
  return rows.filter((row) => !keyOf(row) || best.get(keyOf(row)) === row);
};

export const fetchStrategies = async () => {
  const body = await getJson('/strategies', 'Strategies');
  const raw = rowsOf(body);
  const rows = latestPerName(raw.map(normaliseStrategy));
  // The row's own field names, once. Which ones a card can show depends
  // entirely on what this endpoint returns, and guessing at spellings from the
  // outside is how a SENSEX strategy ends up labelled NIFTY.
  // `hidden` makes a collapsed duplicate visible in the log rather than it
  // silently vanishing -- the record is still on the server.
  logger.request('[GET STRATEGIES] Loaded', {
    count: rows.length,
    hidden: raw.length - rows.length,
    fields: Object.keys(raw[0] || {}),
  });
  return rows;
};

/** Every portfolio the signed-in user has saved. */
export const fetchPortfolios = async () => {
  const body = await getJson('/portfolios', 'Portfolios');
  const raw = rowsOf(body);
  const rows = raw.map(normalisePortfolio);
  logger.request('[GET PORTFOLIOS] Loaded', { count: rows.length, fields: Object.keys(raw[0] || {}) });
  return rows;
};
