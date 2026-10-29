/**
 * src/utils/strategyValidation.js
 *
 * Rules a strategy must satisfy before it leaves the builder — whether that is
 * a backtest, a save, or an export to a file.
 *
 * They live here rather than inside StrategyBuilder because Export is in the
 * header, outside that component. A copy over there would be a second place to
 * change every time a rule moves, and the two would drift — which is exactly
 * what already happened to this app's payload building (see CLAUDE.md).
 *
 * Each returns the message to show, or null when the config is fine, so a caller
 * reads as: `const error = check(config); if (error) { show(error); return; }`.
 */

export const NO_LEGS_ERROR = 'Please add at least one leg';
export const RANGE_DTE_ERROR =
  'For Positional strategy, ORB end time must be between entry DTE and exit DTE';

/**
 * Nothing to trade. Lazy legs do not count: one only ever opens in response to
 * another leg, so a strategy made only of them never takes a position.
 */
export const noLegsError = (config = {}) =>
  (config.legs || []).some((leg) => !leg.isLazyLeg) ? null : NO_LEGS_ERROR;

/**
 * Positional: a leg's Range Breakout window has to close while the strategy is
 * actually holding. Entry is N trading days before expiry and exit is M, so the
 * window may only end on one of the days from N down to M — an End DTE outside
 * that has the range closing before the strategy opens, or after it has left.
 *
 * Only applies to positional strategies, and only to a numeric End DTE: BTST
 * spells the same field "today"/"tomorrow" and has its own rules.
 */
export const rangeBreakoutDteError = (config = {}) => {
  if (String(config.strategy_type || 'intraday').toLowerCase() !== 'positional') return null;

  const entry = Number(config.positional_entry_day);
  const exit = Number(config.positional_exit_day);
  if (Number.isNaN(entry) || Number.isNaN(exit)) return null;

  const [low, high] = entry >= exit ? [exit, entry] : [entry, exit];
  const offending = (config.legs || []).some((leg) => {
    if (!leg.range_enabled) return false;
    const dte = Number(leg.range_end_day);
    if (Number.isNaN(dte)) return false;
    return dte < low || dte > high;
  });

  return offending ? RANGE_DTE_ERROR : null;
};

/**
 * Every rule above, in the order they should be reported. Returns the first
 * message, or null when the strategy is ready to leave the builder.
 */
export const strategyError = (config = {}) =>
  noLegsError(config) || rangeBreakoutDteError(config);
