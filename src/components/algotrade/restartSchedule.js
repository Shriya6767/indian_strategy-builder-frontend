/**
 * When each deployment is scheduled to restart, and the default they open on.
 *
 * The restart endpoints are not wired yet, so nothing on the server knows a
 * restart was scheduled -- but the countdown pill has to count to something,
 * and that is what the user picked. localStorage rather than component state,
 * so a refresh does not drop a schedule the screen still claims to honour.
 *
 * When the endpoints land the server's answer should win and this becomes a
 * fallback, which is why the reads stay behind one function.
 */

/**
 * The time every Restart dialog opens on. FIXED for every strategy, not read
 * from the strategy's own entry time: the reference shows 09:15:15 on every
 * row of Restart All regardless of what each one was built with, because this
 * is about the market opening, not about the strategy.
 */
export const DEFAULT_RESTART_TIME = '09:15:15';

const KEY = 'live_restart_times';

const pad = (n) => String(n).padStart(2, '0');

/**
 * "09:15:15" -> the next MOMENT that clock time occurs, as
 * "YYYY-MM-DDTHH:MM:SS".
 *
 * An ABSOLUTE moment is stored, not a bare clock time -- that is what makes a
 * schedule survive a refresh. A bare "09:15:15" read back next morning is
 * indistinguishable from one set minutes ago, so the countdown would count
 * toward it again on a day it was never meant for. With the date attached, a
 * passed schedule is simply dropped on the next read.
 */
const nextOccurrence = (time) => {
  const [h = 0, m = 0, sec = 0] = String(time).split(':').map(Number);
  const when = new Date();
  when.setHours(h, m, sec, 0);
  if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
    + `T${pad(h)}:${pad(m)}:${pad(sec)}`;
};

/**
 * `{ "<deployment_id>": "YYYY-MM-DDTHH:MM:SS" }` — only schedules still in
 * the FUTURE.
 *
 * Pruned on every read: once a restart moment has passed it says nothing
 * about the deployment any more, and leaving it would keep a row looking
 * scheduled forever. Pruning on read rather than on a timer means there is no
 * background work and no way to miss the cleanup.
 */
export const getRestartTimes = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // A hand-edited or half-written entry must not take the board down.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const now = Date.now();
    const live = {};
    let dropped = false;
    Object.entries(parsed).forEach(([id, at]) => {
      // Tolerates the older bare-clock shape by treating it as expired.
      const ms = String(at).includes('T') ? new Date(at).getTime() : NaN;
      if (Number.isFinite(ms) && ms > now) live[id] = at;
      else dropped = true;
    });
    if (dropped) localStorage.setItem(KEY, JSON.stringify(live));
    return live;
  } catch {
    return {};
  }
};

/** Remember `id` restarts at `time` ("HH:MM:SS"); writes are best-effort. */
export const setRestartTime = (id, time) => {
  if (id == null || !time) return;
  try {
    const all = getRestartTimes();
    all[String(id)] = nextOccurrence(time);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage full or disabled — the in-memory schedule still stands */ }
};

/** Record several at once, so Restart All is ONE write rather than N. */
export const setRestartTimes = (entries = []) => {
  if (!entries.length) return;
  try {
    const all = getRestartTimes();
    entries.forEach(({ id, time }) => {
      if (id != null && time) all[String(id)] = nextOccurrence(time);
    });
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* as above */ }
};

/** Drop one — on cancel, or once the server reports it running. */
export const clearRestartTime = (id) => {
  if (id == null) return;
  try {
    const all = getRestartTimes();
    delete all[String(id)];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* as above */ }
};
