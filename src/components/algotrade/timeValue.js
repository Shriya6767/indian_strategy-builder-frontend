/**
 * src/components/algotrade/timeValue.js
 *
 * The value helpers behind TimePicker, kept apart from the component so both it
 * and the cells that render its output can share them (a file that exports
 * components AND helpers loses fast refresh).
 *
 * STRING SHAPES — deliberately the same ones the native inputs produced, so
 * callers did not change when the picker did:
 *   time only -> "HH:MM:SS"             (24-hour)
 *   with date -> "YYYY-MM-DDTHH:MM:SS"
 */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const pad = (n) => String(n).padStart(2, '0');

/** A value string -> its parts, with sane fallbacks for anything missing. */
export const parse = (value, withDate) => {
  const text = String(value || '');
  const [datePart, timePart] = text.includes('T') ? text.split('T') : [null, text];
  const [h = '9', m = '15', s = '0'] = (timePart || '').split(':');
  const hour24 = Math.min(23, Math.max(0, Number(h) || 0));
  const [y, mo, d] = (datePart || '').split('-').map(Number);
  const today = new Date();
  return {
    hour12: pad(hour24 % 12 === 0 ? 12 : hour24 % 12),
    minute: pad(Math.min(59, Number(m) || 0)),
    second: pad(Math.min(59, Number(s) || 0)),
    meridiem: hour24 >= 12 ? 'PM' : 'AM',
    year: withDate ? (y || today.getFullYear()) : today.getFullYear(),
    month: withDate ? ((mo || today.getMonth() + 1) - 1) : today.getMonth(),
    day: withDate ? (d || today.getDate()) : today.getDate(),
  };
};

/** The parts back into the caller's string. */
export const build = (p, withDate) => {
  let hour = Number(p.hour12) % 12;
  if (p.meridiem === 'PM') hour += 12;
  const time = `${pad(hour)}:${p.minute}:${p.second}`;
  return withDate ? `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${time}` : time;
};

/** What a row shows: "09:35:00 AM", or { date, time } when a date is carried. */
export const formatDisplay = (value, withDate) => {
  if (!value) return withDate ? { date: '', time: '—' } : '—';
  const p = parse(value, withDate);
  const time = `${p.hour12}:${p.minute}:${p.second} ${p.meridiem}`;
  if (!withDate) return time;
  const d = new Date(p.year, p.month, p.day);
  return { date: `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}`, time };
};
