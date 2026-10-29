/**
 * The POST /api/save-portfolio request shape, in ONE place.
 *
 * Create-new and the importer used to build the body independently -- the same
 * trap the strategy payload is in (see CLAUDE.md), where a change applied to
 * one and not the other makes them disagree about what a saved portfolio is.
 *
 * SHAPE: { portfolio_id, portfolio_name, index, qty_multiplier,
 *          period_selection, slippage, strategies: [...] }
 * `period_selection` is one form or the other, never both:
 *   { mode: 'weekdays', weekdays_selected: [...] } | { mode: 'dte', dte_selected: [...] }
 */

import { API_URL } from '../config/constants';
import logger from '../utils/logger';

/** The UI's keyed weekday object -> the short codes the backend stores. */
const WEEKDAY_CODES = { mon: 'M', tue: 'T', wed: 'W', thu: 'Th', fri: 'F', sat: 'Sa', sun: 'Su' };

/** Mon-Fri. What a portfolio runs on when nothing narrower has been chosen --
 *  an empty weekday list would mean "runs on no day", which is never intended. */
const ALL_WEEKDAYS = ['M', 'T', 'W', 'Th', 'F'];

/** { mon: true, tue: false, ... } -> ['M'], in week order rather than key order. */
export const weekdayCodes = (weekdays) => Object.entries(WEEKDAY_CODES)
  .filter(([key]) => weekdays?.[key])
  .map(([, code]) => code);

/**
 * Whichever of the two period shapes applies. Accepts a ready-made
 * `period_selection`, the UI's own fields, or nothing at all -- the last case
 * being a fresh portfolio, which runs every weekday.
 */
export const toPeriodSelection = (source = {}) => {
  const existing = source.period_selection;
  if (existing?.mode === 'dte' || existing?.mode === 'weekdays') return existing;

  const mode = String(source.mode || source.dteTab || '').toLowerCase();
  if (mode === 'dte') {
    const dte = source.dte_selected ?? source.selectedDTEs;
    return { mode: 'dte', dte_selected: Array.isArray(dte) && dte.length ? dte : [0] };
  }

  const codes = Array.isArray(source.weekdays_selected)
    ? source.weekdays_selected
    : weekdayCodes(source.weekdays);
  return { mode: 'weekdays', weekdays_selected: codes.length ? codes : ALL_WEEKDAYS };
};

/** A number the backend will accept, with a known fallback for blanks. */
const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** A number, or null for a box left empty. Distinct from num(): the backend
 *  reads null as "not set", where 0 is a real limit of zero. */
const numOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Overall SL / Overall Target -> the four fields the backend wants for each.
 *
 * `risk` is what OverallRiskDialog applies: { enabled, type, mtmValue,
 * percentValue }, where type is 'mtm' or 'percent'.
 *
 * BOTH VALUES TRAVEL WHEN THE TYPE IS PERCENT, because the dialog keeps both
 * boxes editable there -- a percentage is measured against the MTM amount, so
 * the backend needs the pair. Under MTM the percent box is disabled, so that
 * one goes as null rather than as a stale number the user cannot see.
 *
 * Switched off, every field is null and the flag is false: a disabled limit
 * must not arrive looking like a limit of zero.
 */
export const toRiskFields = (prefix, risk = {}) => {
  const on = risk?.enabled === true;
  const isPercent = String(risk?.type || 'mtm').toLowerCase() === 'percent';
  return {
    [`is_${prefix}`]: on,
    [`${prefix}_type`]: on ? (isPercent ? 'PERCENT' : 'MTM') : null,
    [`${prefix}_mtm_value`]: on ? numOrNull(risk.mtmValue) : null,
    [`${prefix}_percent_value`]: on && isPercent ? numOrNull(risk.percentValue) : null,
  };
};

/**
 * The save-portfolio body.
 *
 * Per-strategy settings fall back to the portfolio's own: a strategy that has
 * not been given its own quantity, period or slippage runs on the portfolio's,
 * which is what the UI shows before anything is overridden.
 */
export const buildSavePortfolioPayload = ({
  portfolioId = null,
  portfolioName,
  index = 'sensex',
  qtyMultiplier = 1,
  slippage = 0,
  period,
  strategies = [],
  // Overall SL / Overall Target, as OverallRiskDialog applies them.
  overallSL,
  overallTarget,
} = {}) => {
  const portfolioPeriod = toPeriodSelection(period || {});
  const portfolioQty = num(qtyMultiplier, 1);
  const portfolioSlippage = num(slippage, 0);

  return {
    // null on a create; the real id on a re-save of an existing portfolio.
    portfolio_id: portfolioId ?? null,
    portfolio_name: portfolioName,
    index: String(index || 'sensex').toLowerCase(),
    qty_multiplier: portfolioQty,
    period_selection: portfolioPeriod,
    slippage: portfolioSlippage,
    ...toRiskFields('portfolio_sl', overallSL),
    ...toRiskFields('portfolio_target', overallTarget),
    strategies: strategies.map((entry) => {
      // A strategy that carries no period of its own runs on the portfolio's.
      const hasOwnPeriod = Boolean(
        entry.period_selection || entry.weekdays || entry.selectedDTEs || entry.mode,
      );
      return {
        strategy_id: entry.strategy_id ?? entry.id ?? null,
        strategy_name: entry.strategy_name ?? entry.name ?? '',
        version: num(entry.version, 1),
        qty_multiplier: num(entry.qty_multiplier ?? entry.qty, portfolioQty),
        period_selection: hasOwnPeriod ? toPeriodSelection(entry) : portfolioPeriod,
        slippage: num(entry.slippage ?? entry.slippage_percent ?? entry.budgetPct, portfolioSlippage),
      };
    }),
  };
};

/**
 * POST the body above. Failure is reported the way the rest of this app's
 * portfolio code expects: a thrown Error carrying the backend's own message,
 * including the 200-with-status-false case the backend uses for rejections.
 */
export const savePortfolio = async (payload) => {
  logger.request('[SAVE PORTFOLIO] Request', {
    method: 'POST', url: `${API_URL}/save-portfolio`, body: payload,
  });

  const response = await fetch(`${API_URL}/save-portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  logger.response('[SAVE PORTFOLIO] Response', { status: response.status, data });

  if (!response.ok || data?.status === false) {
    throw new Error(data?.message || data?.detail || `The portfolio could not be saved (${response.status}).`);
  }
  return data;
};
