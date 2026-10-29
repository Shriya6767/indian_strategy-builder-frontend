// Indian market session rules for the strategy Entry / Exit times.
//
// The tradable session runs 09:16 – 15:40; both Entry and Exit share that
// window. Entry/Exit ordering is enforced separately (see timeOrderError), so
// an entry at 15:40 is caught there rather than by a tighter entry cap.
//
// Everything here works on the "HH:MM" 24-hour strings the app already stores
// in config.entry_time / config.exit_time.

export const MARKET_OPEN_TIME = '09:16';
export const ENTRY_LAST_TIME = '15:40';
export const EXIT_LAST_TIME = '15:40';

// How long a time-field warning waits after the last edit before it appears.
// Long enough to sit out the gap between picking an hour and picking a minute,
// short enough that the warning still feels immediate once the user stops.
export const TIME_WARNING_DELAY_MS = 650;

export const MARKET_OPEN_MINUTES = 9 * 60 + 16;
export const ENTRY_LAST_MINUTES = 15 * 60 + 40;
export const EXIT_LAST_MINUTES = 15 * 60 + 40;

// "09:16" / "09:16:00" -> 556. Anything else -> null.
export const toMinutes = (t) => {
  if (!t || typeof t !== 'string') return null;
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
};

export const toHHMM = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// "15:40" -> "15:40 PM" — a 24-hour hour with the AM/PM tag kept, exactly how
// the session-bounded time fields display it, so warning text and the field the
// warning is about never disagree.
export const formatTimeLabel = (t) => {
  const mins = toMinutes(t);
  if (mins === null) return t || '';
  const h24 = Math.floor(mins / 60);
  return `${String(h24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
};

// The bounds are spelled out the way the warning reads them: no leading zero on
// the hour, so 09:16 shows as "9:16". Derived from the constants above so the
// message can never drift from what is actually enforced.
const spoken = (t) => t.replace(/^0/, '');

// Session-window check for any single time field, worded the same way for all
// of them. label is what the user sees ("Entry Time", "Delay Restart", ...).
export const sessionWindowError = (label, value, lastTime = EXIT_LAST_TIME) => {
  const mins = toMinutes(value);
  const last = toMinutes(lastTime);
  if (mins === null) return `Please enter a valid ${label} (HH:MM)`;
  if (mins < MARKET_OPEN_MINUTES || mins > last) {
    return `${label} should be greater than equal to ${spoken(MARKET_OPEN_TIME)} and less than equal to ${spoken(lastTime)}`;
  }
  return null;
};

// Session-window check for one field on its own.
// field: 'entry_time' | 'exit_time'. Returns a message, or null when in range.
export const timeRangeError = (field, value) => {
  const isEntry = field === 'entry_time';
  return sessionWindowError(
    isEntry ? 'Entry Time' : 'Exit Time',
    value,
    isEntry ? ENTRY_LAST_TIME : EXIT_LAST_TIME
  );
};

// BTST "Delay restart" — same 09:16–15:40 window as Entry/Exit.
export const delayRestartError = (value) => sessionWindowError('Delay Restart', value);

// Entry/Exit ordering. Intraday, Sequential and Positional all exit the SAME
// day, so the entry has to come strictly first. BTST exits the NEXT day, so an
// exit earlier than the entry is legitimate — only an identical pair is not,
// since that would be a zero-length hold.
/**
 * Strategy types that hold a position OVERNIGHT, so their exit legitimately
 * falls on a later day and may read earlier on the clock than the entry.
 *
 * BTST and Positional behave identically here -- AlgoTest's own documentation
 * treats them as one case, and Positional was being held to the intraday rule
 * purely because this list used to be a single string comparison.
 *
 * Exported so every caller asks the same question; a second hand-written
 * `=== 'btst'` elsewhere is how the two drift apart.
 */
export const OVERNIGHT_TYPES = ['btst', 'positional'];

export const isOvernightType = (strategyType) =>
  OVERNIGHT_TYPES.includes(String(strategyType || 'intraday').toLowerCase());

export const timeOrderError = (strategyType, entryTime, exitTime) => {
  const entry = toMinutes(entryTime);
  const exit = toMinutes(exitTime);
  if (entry === null || exit === null) return null;

  if (isOvernightType(strategyType)) {
    // The only impossible pair is an identical one -- a zero-length hold.
    return entry === exit ? 'Exit Time must be greater than Entry Time' : null;
  }
  return exit <= entry ? 'Entry Time must be less than equal to Exit Time' : null;
};

// The full check used both when a field is committed and when Start Backtest
// is pressed. Returns the first problem found, or null.
export const entryExitError = (strategyType, entryTime, exitTime) =>
  timeRangeError('entry_time', entryTime) ||
  timeRangeError('exit_time', exitTime) ||
  timeOrderError(strategyType, entryTime, exitTime);
