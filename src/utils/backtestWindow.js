import logger from './logger';

/**
 * The backtest window — start date and index — in localStorage so it survives
 * a reload.
 *
 * These used to live in the Data Selection card. With that gone nothing else
 * remembers them, so a refresh dropped you back to the defaults mid-setup.
 *
 * ONLY THESE TWO: the rest of the config belongs to the builder, and
 * duplicating more here would create a second source of truth.
 *
 * END DATE IS DELIBERATELY NOT REMEMBERED. It has a canonical value --
 * DEFAULT_END_DATE, how far the data actually goes -- so a fresh builder
 * should always open on it. Remembering it was actively wrong: this is saved
 * on EVERY config change, including while a saved strategy is loaded, so
 * opening a strategy that ended on 18-Oct wrote 18-Oct here, and the next
 * hard refresh showed 18-Oct on a brand new strategy. The date moved around
 * (22nd, 18th, 19th) depending on which strategy had been opened last.
 */

const KEY = 'backtest_window';

/** The stored window, or null. Never throws. */
export const readWindow = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;

    // Only well-formed dates are honoured: a half-typed "2026-1" in storage
    // would otherwise be handed to the date input, which silently blanks it.
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const out = {};
    if (iso.test(raw.start_date)) out.start_date = raw.start_date;
    // `end_date` is skipped even when present: entries written before this
    // changed still carry one, and honouring it would bring the old wandering
    // date straight back. Ignoring it here retires those without a migration.
    if (typeof raw.symbol === 'string' && raw.symbol.trim()) out.symbol = raw.symbol;
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    logger.error('[backtestWindow] could not read:', err);
    return null;
  }
};

/**
 * Saves the window. Takes the whole config and picks the three fields out, so
 * callers do not have to remember which ones they are.
 *
 * `symbol` comes from `dte_filter` — the key the Index dropdown writes to,
 * despite its name, and the one both payload builders send as `symbol`.
 */
export const saveWindow = (config) => {
  if (!config) return;
  try {
    const next = {
      start_date: config.start_date || null,
      symbol: config.dte_filter || config.symbol || null,
    };
    const prev = localStorage.getItem(KEY);
    const json = JSON.stringify(next);
    // Writing an identical value on every keystroke is pure waste; localStorage
    // is synchronous and this runs from an effect on the builder's hot path.
    if (prev === json) return;
    localStorage.setItem(KEY, json);
  } catch (err) {
    logger.error('[backtestWindow] could not write:', err);
  }
};
