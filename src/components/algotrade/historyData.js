/**
 * Loading and shaping the History page's data, kept out of the component.
 *
 * ONE DAY PER REQUEST: GET /live/deployments takes a single `trade_date`, so a
 * range is walked day by day -- isolated in `loadRange`, which is all that
 * changes when a range endpoint exists.
 *
 * Bounded and batched: MAX_DAYS caps how far back it looks and BATCH how many
 * are in flight, because ninety parallel requests at a live backend is not
 * acceptable. What was dropped is reported, not silently ignored.
 */

import { fetchDeploymentsByDate } from '../../services/liveTradingApi';

/** How many deployments' legs are fetched at once, and how many in flight. */
const BATCH = 6;

/** "2026-10-06" -> Date at local midnight (never parsed as UTC). */
const toDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const toIso = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Every date from `start` to `end` inclusive, oldest first. */
export const daysBetween = (start, end) => {
  const out = [];
  const cursor = toDate(start);
  const last = toDate(end);
  while (cursor <= last && out.length < 2000) {
    out.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

/**
 * The History page's data: ONE request, for today's trade date.
 *
 * GET /live/deployments takes a single `trade_date`, so that is what is asked
 * for -- today's -- when the page opens. Everything else on the page (start and
 * end date, broker, index, strategy) narrows what came back, in the browser.
 * No filter triggers another request.
 *
 * This replaced a day-by-day walk of the whole range, which fired up to 45
 * requests at a live backend every time a date moved. When a range endpoint
 * exists, THIS function is the only thing that changes.
 */
export const loadHistory = async ({ includeArchived = false } = {}) => {
  const day = toIso(new Date());
  const body = await fetchDeploymentsByDate(day, { includeArchived });
  return { rows: Array.isArray(body?.data) ? body.data : [], day };
};

/** Booked P&L per trade date, for the heatmap and the chart. */
export const pnlByDay = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const day = row.trade_date;
    if (!day) return;
    map.set(day, (map.get(day) || 0) + Number(row.realised_pnl || 0));
  });
  return map;
};

/** Deployments grouped under their trade date, newest day first. */
export const groupByDay = (rows) => [...rows.reduce((map, row) => {
  const day = row.trade_date || '';
  if (!map.has(day)) map.set(day, []);
  map.get(day).push(row);
  return map;
}, new Map())].sort((a, b) => (a[0] < b[0] ? 1 : -1));

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "2026-10-05" -> "05 OCT 26", the date pill's format. */
export const dayPill = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}` : String(iso ?? '');
};

/** "2026-10-05" -> "05 Oct", the chart's axis format. */
export const shortDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const month = MONTHS[Number(m[2]) - 1];
  return `${m[3]} ${month.charAt(0)}${month.slice(1).toLowerCase()}`;
};

/**
 * The calendar heatmap's shape: one entry per month in range, each holding the
 * weeks that month spans. A cell is `{ iso, pnl }`, with `pnl` undefined for a
 * day outside the range or with no deployments -- drawn as an empty square.
 *
 * Weeks run Sunday-first, which is the row order the reference labels
 * (S M T W Th F S).
 */
export const buildHeatmap = (start, end, pnl) => {
  const first = toDate(start);
  const last = toDate(end);
  const months = [];

  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  while (cursor <= last) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Week columns: index 0 is the week containing the 1st.
    const weeks = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const iso = toIso(date);
      const week = Math.floor((day + new Date(year, month, 1).getDay() - 1) / 7);
      if (!weeks[week]) weeks[week] = Array(7).fill(null);
      weeks[week][date.getDay()] = {
        iso,
        pnl: date >= first && date <= last ? pnl.get(iso) : undefined,
      };
    }

    months.push({ key: `${year}-${month}`, label: `${MONTHS[month]} ${String(year).slice(2)}`, weeks });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

/**
 * The History .csv, in the reference export's own shape.
 *
 * ONE ROW PER TRADE, not per leg: a leg that entered and exited contributes an
 * "Entry" row and an "Exit" row, which is how the reference file reads and what
 * makes it pivotable. A leg that never exited contributes only its entry.
 *
 * "NA" rather than blank for a value the deployment never recorded, matching
 * the reference -- an empty cell reads as a missing export, "NA" as a fact.
 */
const CSV_COLUMNS = [
  'Strategy ID', 'Strategy name', 'Date', 'Symbol', 'Broker', 'Broker Name',
  'Buy/Sell', 'Trade Price', 'Exchange Time', 'Qty', 'Entry/Exit', 'Instr.',
  'Strike', 'Expiry', 'Trigger Price', 'Trigger Time', 'SL', 'Tgt',
  'Underlying', 'Report Time',
];

/** Every field is quoted, as the reference file quotes them. */
const cell = (value) => {
  const text = value === null || value === undefined || value === '' ? 'NA' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * "SENSEX 08OCT2026 CE 73800" -> { instr: 'CE', strike: '73800', expiry: '08OCT2026' }.
 * Read loosely: an unfamiliar symbol yields NAs rather than throwing, and the
 * full symbol is always written out in its own column regardless.
 */
const parseSymbol = (symbol) => {
  const text = String(symbol || '');
  const instr = /\b(CE|PE)\b/.exec(text)?.[1];
  const expiry = /\b(\d{1,2}[A-Z]{3}\d{2,4})\b/.exec(text.toUpperCase())?.[1];
  // The strike is the last bare number, so a date in the symbol is not mistaken
  // for one.
  const numbers = text.match(/\b\d{3,6}\b/g) || [];
  return { instr, expiry, strike: numbers[numbers.length - 1] };
};

/** "2026-10-05" + "13:40:00" -> "2026-10-05 13:40:00". */
const stamp = (date, time) => (date && time ? `${date} ${time}` : date || time || '');

export const buildHistoryCsv = (rows, legsById, brokerName, brokerLabel = 'Symphony (Open XTS)') => {
  const lines = [CSV_COLUMNS.map((c) => `"${c}"`).join(',')];

  rows.forEach((row) => {
    const legs = legsById.get(String(row.deployment_id)) || [];
    const head = [
      row.deployment_id,
      `${row.strategy_name} (${row.version})`,
      row.created_at,
    ];
    const broker = [brokerLabel, brokerName(row.broker_account_id)];

    legs.forEach((leg) => {
      const { instr, expiry, strike } = parseSymbol(leg.symbol);
      const buy = String(leg.side || 'BUY').toUpperCase() === 'BUY';
      const common = [leg.symbol, ...broker];
      const tail = [instr, strike, expiry];

      // Entry.
      lines.push([
        ...head, ...common,
        buy ? 'Buy' : 'Sell', leg.entry_price, stamp(leg.entry_date, leg.entry_time), leg.qty,
        'Entry', ...tail,
        leg.entry_trigger_price, leg.entry_trigger_time,
        leg.initial_sl ?? leg.stoploss, leg.target,
        leg.entry_underlying, stamp(leg.entry_date, leg.entry_report_time || leg.entry_time),
      ].map(cell).join(','));

      // Exit -- only once there is one. The side flips: a BUY is closed by a SELL.
      if (leg.exit_price == null && !leg.exit_time) return;
      lines.push([
        ...head, ...common,
        buy ? 'Sell' : 'Buy', leg.exit_price, stamp(leg.exit_date, leg.exit_time), leg.qty,
        'Exit', ...tail,
        leg.exit_trigger_price, leg.exit_trigger_time,
        leg.stoploss, leg.target,
        leg.exit_underlying, stamp(leg.exit_date, leg.exit_report_time || leg.exit_time),
      ].map(cell).join(','));
    });
  });

  return lines.join('\n');
};

/**
 * Legs for many deployments at once.
 *
 * The History table shows them without being asked, so they have to be loaded
 * for every row -- batched, and capped, for the same reason the day walk is:
 * a wide range must not turn into hundreds of simultaneous requests. Anything
 * past the cap simply has no legs listed, which the caller reports.
 */
export const MAX_LEG_FETCHES = 80;

export const loadLegs = async (deploymentIds, fetchOne, onBatch) => {
  const wanted = deploymentIds.slice(0, MAX_LEG_FETCHES);
  const skipped = deploymentIds.length - wanted.length;

  for (let i = 0; i < wanted.length; i += BATCH) {
    const slice = wanted.slice(i, i + BATCH);
    const settled = await Promise.allSettled(slice.map((id) => fetchOne(id)));
    const found = [];
    settled.forEach((result, k) => {
      if (result.status !== 'fulfilled') return;
      found.push([String(slice[k]), result.value?.data?.legs || []]);
    });
    // Reported per batch, so the table fills in progressively instead of
    // staying empty until the last request lands.
    if (found.length) onBatch(found);
  }

  return { skipped };
};
