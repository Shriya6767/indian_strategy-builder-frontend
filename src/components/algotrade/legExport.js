/**
 * src/components/algotrade/legExport.js
 *
 * ONE definition of the legs table's columns, used by both the table that draws
 * them and the .csv that exports them.
 *
 * The Download button promises "the same columns you can see", so the two must
 * not be written out separately -- a column added to the table and forgotten in
 * the export is exactly the kind of drift this file exists to prevent.
 *
 * `get` pulls the raw value for the CSV. The table formats its own cells
 * (side badges, coloured P&L), which is presentation; the VALUES come from
 * here either way.
 */

/** A leg's columns, in table order. A running deployment shows its live
 *  SL/Target/LTP; a finished one shows what it exited at. */
export const legColumns = (running) => [
  { key: 'symbol', label: 'Instrument', get: (l) => l.symbol },
  // Immediately after the instrument, as the screen reads it: what was traded,
  // then which strategy traded it, then the numbers.
  { key: 'strategy_name', label: 'Strategy Name', get: (_l, name) => name },
  { key: 'qty', label: 'Qty', get: (l) => l.qty },
  { key: 'side', label: 'Side', get: (l) => l.side, csvOnly: true },
  { key: 'entry_price', label: 'Entry Price', get: (l) => l.entry_price },
  { key: 'entry_date', label: 'Entry Date', get: (l) => l.entry_date },
  { key: 'entry_time', label: 'Entry Time', get: (l) => l.entry_time },
  ...(running
    ? [
      { key: 'initial_sl', label: 'Initial SL', get: (l) => l.initial_sl },
      { key: 'stoploss', label: 'Stop Loss', get: (l) => l.stoploss },
      { key: 'target', label: 'Target', get: (l) => l.target },
      { key: 'ltp', label: 'LTP', get: (l) => l.ltp },
    ]
    : [
      { key: 'exit_price', label: 'Exit Price', get: (l) => l.exit_price },
      { key: 'exit_date', label: 'Exit Date', get: (l) => l.exit_date },
      { key: 'exit_time', label: 'Exit Time', get: (l) => l.exit_time },
      { key: 'exit_reason', label: 'Exit Reason', get: (l) => l.exit_reason, csvOnly: true },
    ]),
  { key: 'pnl', label: 'MTM', get: (l) => l.pnl },
];

/** The columns the TABLE draws -- everything except the CSV-only extras. */
export const visibleLegColumns = (running) => legColumns(running).filter((c) => !c.csvOnly);

/**
 * Which table a leg belongs to, by the same rule View Trades splits them --
 * `open`/`exiting` are running, `closed`/`manual` are closed, and anything
 * else never traded.
 */
export const legGroup = (leg) => {
  const status = String(leg?.status || '').toLowerCase();
  if (['open', 'exiting'].includes(status)) return 'running';
  if (['closed', 'manual'].includes(status)) return 'closed';
  return status || 'pending';
};

/**
 * The CSV's columns: the UNION of both tables, with Status first.
 *
 * ONE RECTANGULAR TABLE, not two stacked ones. A deployment can hold running
 * legs and closed legs at once, and the screen draws those as two tables with
 * different columns -- the running one shows live SL/Target/LTP, the closed
 * one shows what it exited at.
 *
 * Writing that as two sections in one file would stop it being a CSV table:
 * sort and filter break across the second header row. A Status column says
 * the same thing and keeps every tool working, which is what a flat format
 * is for.
 *
 * Each row fills the half that applies to it and leaves the other blank. That
 * is the point: before this, ONE `running` flag chose the columns for the
 * whole file, so a running deployment's closed legs were exported with their
 * exit price, time and reason simply absent.
 */
const CSV_ONLY_STATUS = { key: 'leg_status', label: 'Status', get: (l) => legGroup(l) };

export const csvColumns = () => {
  const running = legColumns(true);
  const closed = legColumns(false);
  const seen = new Set();
  const merged = [];
  // Running first, then whatever closed adds -- so the live columns sit next
  // to the entry they belong to, and the exit columns follow.
  [...running, ...closed].forEach((c) => {
    if (seen.has(c.key)) return;
    seen.add(c.key);
    merged.push(c);
  });
  // MTM last, as both tables end on it.
  const pnl = merged.filter((c) => c.key === 'pnl');
  return [CSV_ONLY_STATUS, ...merged.filter((c) => c.key !== 'pnl'), ...pnl];
};

/** Quote anything that would otherwise break the column structure. */
const cell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * The legs as a .csv string, header row included.
 *
 * Every leg of the deployment in one table, grouped by the Status column --
 * running, closed, and the ones that never traded. No `running` flag: the
 * file covers both kinds at once, which is the whole reason for the union
 * above.
 */
export const buildLegCsv = (legs = [], strategyName = '') => {
  const columns = csvColumns();
  const header = columns.map((c) => cell(c.label)).join(',');
  // Grouped so the file opens in the same order as the screen reads, without
  // anyone having to sort it first.
  const order = { running: 0, closed: 1 };
  const sorted = [...legs].sort(
    (a, b) => (order[legGroup(a)] ?? 2) - (order[legGroup(b)] ?? 2),
  );
  const rows = sorted.map(
    (leg) => columns.map((c) => cell(c.get(leg, strategyName))).join(','),
  );
  return [header, ...rows].join('\n');
};

/**
 * Hand the browser a .csv file. Created and revoked around one click, so no
 * blob URL is left alive after the download starts.
 */
export const downloadLegCsv = (legs, strategyName) => {
  const csv = buildLegCsv(legs, strategyName);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  // Named after the strategy, with anything a filesystem would object to
  // replaced -- an instrument name with a slash in it must not create a folder.
  a.download = `${String(strategyName || 'trades').replace(/[\\/:*?"<>|]/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
