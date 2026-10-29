import logger from './logger';

/**
 * The values each dropdown actually offers, and a guard that refuses to hand
 * one of them anything else.
 *
 * WHY THIS EXISTS. A <select> given a value matching none of its options does
 * not complain -- it renders the FIRST option. So a strategy saved with a
 * percent stop loss could reopen showing Points, with nothing in the console,
 * nothing on screen, and a real position taken on the wrong unit. That is the
 * worst shape a bug can have here: invisible, and about money.
 *
 * Every list below is copied from the <option> values of the control it feeds.
 * KEEP THEM IN STEP: adding an option to a dropdown without adding it here
 * makes that option unloadable, which the round-trip test (scripts/
 * roundtrip.test.mjs) will fail on rather than letting it reach a user.
 */

/** Target and Stop Loss offer all four units. */
export const LEG_UNITS = new Set([
  'points', 'underlying_points', 'percentage', 'underlying_percentage',
]);

/**
 * Trail SL offers only two -- it has no underlying variants, unlike Target and
 * Stop Loss. Narrower on purpose; do not widen it to match LEG_UNITS without
 * adding the options to the control first.
 */
export const TRAIL_UNITS = new Set(['points', 'percentage']);

/** Simple Momentum: eight directional units. */
export const MOMENTUM_MODES = new Set([
  'points', 'points_down', 'percentage', 'percentage_down',
  'underlying_points_up', 'underlying_points_down',
  'underlying_percentage_up', 'underlying_percentage_down',
]);

/** Overall SL / Target speak 'percent', NOT the legs' 'percentage'. */
export const OVERALL_UNITS = new Set(['mtm', 'percent']);

/**
 * Is a backend on/off flag actually ON?
 *
 * NOT `Boolean(x)` and not `x || false`. JSON carries these as real booleans
 * most of the time, but a flag that arrives as the STRING "false" is truthy
 * in JavaScript -- so the plain check reads "false" as on, which is the exact
 * opposite of what the record says. Same for "0" and "False".
 *
 * Anything genuinely unset reads as off.
 */
export const isOn = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v !== '' && v !== 'false' && v !== '0' && v !== 'null' && v !== 'none' && v !== 'undefined';
  }
  return Boolean(value);
};

/**
 * `value` if the control can display it, otherwise `fallback` -- and a log
 * line naming what was dropped.
 *
 * The log is the point. Falling back silently is how this class of bug hides;
 * a line in frontend-error.log naming the field and the offending value is
 * what turns "the strategy traded wrong" into "the backend sent X for Y".
 *
 * An absent value is NOT logged: plenty of fields are legitimately unset, and
 * drowning the real cases in noise would defeat the purpose.
 *
 * `report: false` says the same thing about a whole field: use it when the
 * control is switched OFF, so its unit is whatever the backend happens to
 * default to and means nothing. Still falls back to a displayable value --
 * only the log line is skipped.
 */
export const oneOf = (value, allowed, fallback, label, { report = true } = {}) => {
  if (allowed.has(value)) return value;
  if (report && value !== undefined && value !== null && value !== '') {
    logger.error(
      `[decode] ${label} came back as "${value}", which is not one of: `
      + `${[...allowed].join(', ')}. Showing "${fallback}" instead.`,
    );
  }
  return fallback;
};
