/**
 * The rules an entry/exit window must satisfy before POST /live/deployments.
 *
 * CHECKED HERE, NOT BY THE SERVER ALONE -- a rejected deployment is a round
 * trip and an error toast for something the screen already knew, and on a
 * live-money action the user should be stopped before the request.
 *
 * THE NUMBERS ARE THE BACKEND'S OWN and deliberately not tightened: a window
 * narrower than the server's refuses times the product actually accepts.
 */

/**
 * The two windows, PER FIELD -- entry and exit are not the same range.
 *
 *   entry  09:15:15 – 15:29:00
 *   exit   09:15:05 – 15:29:30
 *
 * The exit window opens ten seconds earlier and closes thirty later, which is
 * why these cannot be collapsed into one pair of constants.
 */
export const ENTRY_MIN = '09:15:15';
export const ENTRY_MAX = '15:29:00';
export const EXIT_MIN = '09:15:05';
export const EXIT_MAX = '15:29:30';

/** "9:5:0" -> "09:05:00", so string comparison is safe. */
const pad = (value) => String(value || '')
  .split(':')
  .concat(['00', '00'])
  .slice(0, 3)
  .map((part) => String(part).padStart(2, '0'))
  .join(':');

/** Times are zero-padded HH:MM:SS, so `<=` on the strings is a clock compare. */
const within = (time, min, max) => {
  const t = pad(time);
  return t >= min && t <= max;
};

export const isIntraday = (strategyType) => String(strategyType || 'intraday').toLowerCase() === 'intraday';
export const isPositional = (strategyType) => String(strategyType || '').toLowerCase() === 'positional';

/**
 * Saturday or Sunday. Parsed from the parts rather than `new Date(iso)`, which
 * reads a bare "YYYY-MM-DD" as UTC midnight and can therefore land on the
 * previous day for anyone east of Greenwich -- including every user of this
 * product.
 *
 * Weekends only: market holidays are not knowable here, and the server
 * enforces those. A weekend is never a trading day anywhere, so rejecting one
 * can never refuse a date the backend would have taken.
 */
const isWeekend = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
};

/**
 * The first rule broken, as a sentence to put in a red toast -- or null when
 * the window is good.
 *
 * ONE message at a time, deliberately: a toast listing four faults at once is
 * read as a wall and acted on as none of them.
 *
 * Dates are "YYYY-MM-DD", which sorts lexicographically, so they compare as
 * strings without constructing a Date (and without a timezone to get wrong).
 */
export const timingError = ({
  strategyType,
  entryDate,
  entryTime,
  exitDate,
  exitTime,
  expiry,
} = {}) => {
  // Intraday never shows these fields and sends nulls, so there is nothing
  // here to be wrong.
  if (isIntraday(strategyType)) return null;

  if (entryTime && !within(entryTime, ENTRY_MIN, ENTRY_MAX)) {
    return `Entry time must be between ${ENTRY_MIN} and ${ENTRY_MAX}`;
  }
  if (exitTime && !within(exitTime, EXIT_MIN, EXIT_MAX)) {
    return `Exit time must be between ${EXIT_MIN} and ${EXIT_MAX}`;
  }

  if (entryDate && isWeekend(entryDate)) return 'Entry date must be a trading day';
  if (exitDate && isWeekend(exitDate)) return 'Exit date must be a trading day';

  // An exit before the entry it belongs to is the one ordering mistake that
  // can survive both times being individually valid.
  if (entryDate && exitDate && exitDate < entryDate) {
    return 'Exit date cannot be before the entry date';
  }
  if (entryDate && exitDate && entryDate === exitDate
      && entryTime && exitTime && pad(exitTime) <= pad(entryTime)) {
    return 'Exit time must be after the entry time on the same day';
  }

  /*
    Only POSITIONAL is bounded by the expiry. BTST is one night, so its exit
    cannot reach an expiry anyway, and the backend applies the rule to
    positional alone -- enforcing it more widely here would reject deployments
    the server is happy with.
  */
  if (expiry && isPositional(strategyType)) {
    if (entryDate && entryDate > expiry) return `Entry date cannot be after the expiry (${expiry})`;
    if (exitDate && exitDate > expiry) return `Exit date cannot be after the expiry (${expiry})`;
  }

  return null;
};

/**
 * The body for POST /live/deployments.
 *
 * WHAT THE DIALOG SHOWS IS WHAT GETS SENT -- not only edited fields. Sending
 * just the edits relied on the server defaulting to the same value it had
 * reported, and it did not: an untouched positional window defaulted to TODAY
 * and was rejected for an exit time already past.
 *
 * entry_date is honoured for POSITIONAL only, exit_date for BTST and
 * positional. INTRADAY sends four explicit nulls -- it has no window at all.
 */
export const buildDeploymentPayload = ({
  strategyId, version = 0, brokerAccountId, strategyType, timings = {},
}) => {
  const base = {
    strategy_id: strategyId,
    version,
    broker_account_id: brokerAccountId,
  };

  if (isIntraday(strategyType)) {
    return {
      ...base, entry_date: null, entry_time: null, exit_date: null, exit_time: null,
    };
  }

  /*
    ALL FOUR, ALWAYS -- including entry_date for BTST.

    entry_date used to be withheld for BTST, on the rule that BTST always
    enters today and the server would decide it. That is precisely what broke:
    with no entry_date in the body the server defaulted it to TODAY, so a BTST
    activated at 15:15 against an entry time of 09:16 was rejected for an
    entry time already passed -- while the dialog plainly showed TOMORROW.

    A field the server ignores costs nothing. A field the server fills in
    differently from what the user just read costs a refused deployment. So
    the window on screen is the window in the request, every field, every
    time, and nothing is left to a default.
  */
  return {
    ...base,
    entry_date: timings.entryDate || null,
    entry_time: timings.entryTime ? pad(timings.entryTime) : null,
    exit_date: timings.exitDate || null,
    exit_time: timings.exitTime ? pad(timings.exitTime) : null,
  };
};
