/**
 * src/components/algotrade/marketClock.js
 *
 * Indian market hours, computed in IST regardless of where the browser sits —
 * a trader in another timezone must still see the same countdown as one in
 * Mumbai, so the clock is pinned to +05:30 rather than to the machine.
 */

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const OPEN_MINUTES = 9 * 60 + 15;    // 09:15
const CLOSE_MINUTES = 15 * 60 + 30;  // 15:30

/** Minutes past midnight in IST, and the IST weekday (0 = Sunday). */
export const istNow = (now = new Date()) => {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist = new Date(utcMs + IST_OFFSET_MINUTES * 60_000);
  return {
    minutes: ist.getHours() * 60 + ist.getMinutes(),
    seconds: ist.getSeconds(),
    day: ist.getDay(),
  };
};

/**
 * Today's trading date in IST, as "YYYY-MM-DD".
 *
 * NOT `new Date().toISOString().slice(0, 10)`, which is UTC: between midnight
 * and 05:30 IST that returns YESTERDAY's date, so anything keyed on "is this
 * deployment from an earlier day" would not flip over until 05:30 IST. The
 * market clock is pinned to IST and so is this, for the same reason.
 */
export const istToday = (now = new Date()) => {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist = new Date(utcMs + IST_OFFSET_MINUTES * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`;
};

export const isMarketOpen = (now = new Date()) => {
  const { minutes, day } = istNow(now);
  if (day === 0 || day === 6) return false;
  return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
};

/**
 * Whole seconds until the next 09:15 IST. Weekends roll forward to Monday, so
 * the count never claims the market opens on a Saturday.
 */
export const secondsTillOpen = (now = new Date()) => {
  const { minutes, seconds, day } = istNow(now);
  const secondsNow = minutes * 60 + seconds;
  const openSeconds = OPEN_MINUTES * 60;

  let days = 0;
  if (secondsNow >= openSeconds) days = 1;         // today's open has passed
  let weekday = (day + days) % 7;
  while (weekday === 0 || weekday === 6) { days += 1; weekday = (day + days) % 7; }

  return days * 86_400 + openSeconds - secondsNow;
};

/** 3661 -> "1h 1m 1s"; 186 -> "3m 6s"; 42 -> "42s". */
export const formatCountdown = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
};

/* ────────────────────────────────────────────────────────────────────────
   THE ACTIVATION WINDOW — 08:00 to 15:28 IST, weekdays.

   Wider than the trading session on purpose: a strategy is activated BEFORE
   the open so it is armed and waiting, which is why this starts at 08:00
   rather than 09:15. It shuts two minutes before the session ends, because a
   deployment created at 15:29 has nothing left to do.
   ──────────────────────────────────────────────────────────────────────── */

const ACTIVATE_OPEN = 8 * 60;         // 08:00
const ACTIVATE_CLOSE = 15 * 60 + 28;  // 15:28

const isWeekendDay = (day) => day === 0 || day === 6;

/** "08:00" from minutes past midnight. */
const clockOf = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** 3780 -> "1h 3m"; 2700 -> "45m"; 50 -> "less than a minute". */
const roughly = (totalSeconds) => {
  const mins = Math.ceil(Math.max(0, totalSeconds) / 60);
  if (mins < 1) return 'less than a minute';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const canActivateNow = (now = new Date()) => {
  const { minutes, day } = istNow(now);
  return !isWeekendDay(day) && minutes >= ACTIVATE_OPEN && minutes < ACTIVATE_CLOSE;
};

/**
 * Why activation is refused right now, as a sentence for a red toast -- or
 * null when it is allowed.
 *
 * Every message says the same three things, in the same order: that it cannot
 * happen now, WHEN it can, and HOW LONG until then. A warning that only says
 * "not allowed" leaves the user guessing whether to wait a minute or a day.
 */
export const activationWindowError = (now = new Date()) => {
  const { minutes, seconds, day } = istNow(now);
  if (canActivateNow(now)) return null;

  const weekend = isWeekendDay(day);
  const secondsNow = minutes * 60 + seconds;
  const openSeconds = ACTIVATE_OPEN * 60;

  // Still this morning: the wait is measured in hours, not days.
  if (!weekend && secondsNow < openSeconds) {
    return `Too early — activation opens at ${clockOf(ACTIVATE_OPEN)}, in ${roughly(openSeconds - secondsNow)}`;
  }

  // Otherwise the next window is on a later day. Roll past the weekend so the
  // message never promises an activation on a Saturday.
  let days = 1;
  while (isWeekendDay((day + days) % 7)) days += 1;

  const when = days === 1 ? 'tomorrow' : 'on Monday';
  const wait = roughly(days * 86_400 + openSeconds - secondsNow);

  if (weekend) {
    return `Market closed for the weekend — activation opens ${when} at ${clockOf(ACTIVATE_OPEN)}, in ${wait}`;
  }
  return `Too late — activation closed at ${clockOf(ACTIVATE_CLOSE)}. It opens ${when} at ${clockOf(ACTIVATE_OPEN)}, in ${wait}`;
};

/* ────────────────────────────────────────────────────────────────────────
   THE BROKER SESSION CUTOFF — 08:30 IST, every day.

   A broker token does not survive the night: whatever was logged in
   yesterday is dead by this morning, and placing an order on it would fail
   at the broker. 08:30 is the line the product draws, far enough before the
   09:15 open to leave time to log in again.
   ──────────────────────────────────────────────────────────────────────── */

const BROKER_CUTOFF = 8 * 60 + 30;   // 08:30

/*
  Only the CUTOFF MOMENT lives here. Whether a given session is still good is
  the server's call, not ours: it sets `expires_at` to 08:30, and that
  absolute timestamp is right on every machine where a locally-timed rule
  would have been right on only one.
*/

/** Today's 08:30 IST, in epoch ms. */
export const brokerCutoffAt = (now = new Date()) => {
  const { minutes, seconds } = istNow(now);
  const secondsIntoDay = minutes * 60 + seconds;
  return now.getTime() - secondsIntoDay * 1000 + BROKER_CUTOFF * 60 * 1000;
};

/** Has today's 08:30 passed? */
export const brokerCutoffPassed = (now = new Date()) => now.getTime() >= brokerCutoffAt(now);
