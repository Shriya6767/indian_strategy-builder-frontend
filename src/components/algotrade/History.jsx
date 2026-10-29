import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronDown, Download, Info, Maximize2, Upload, Funnel, X,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { INK, MUTED, BORDER, BLUE, BLUE_TINT, DEEP, GREEN, DANGER, RULE } from './palette';
import Toggle from './Toggle';
import { fetchDeployment, getBrokerNames } from '../../services/liveTradingApi';
import { downloadNodePng } from './chartPng';
import {
  loadHistory, loadLegs, pnlByDay, groupByDay, buildHeatmap, buildHistoryCsv,
  dayPill, shortDay, toIso, MAX_LEG_FETCHES,
} from './historyData';

/**
 * Past algo trades: filter bar, P&L summary, calendar heatmap, chart, and the
 * per-deployment trade table.
 *
 * The range is walked one day at a time -- the only shape GET /live/deployments
 * offers -- so a range endpoint would change `loadRange` alone.
 *
 * LEGS ARE LAZY: a day can hold dozens of deployments and each one's legs are
 * a separate request, so nothing is fetched until "Show Details", and each
 * result is cached for the life of the page.
 */

/** "+₹ 1,234" green / "-₹ 560" red / "₹ 0" plain. */
const Money = ({ value, className = '' }) => {
  const n = Number(value || 0);
  return (
    <span className={`tabular-nums ${className}`}
          style={{ color: n > 0 ? GREEN : n < 0 ? DANGER : INK }}>
      {n < 0 ? '-' : ''}₹ {Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
    </span>
  );
};

/** A label with its info hint, as the filter bar draws them. */
const FilterLabel = ({ children, hint }) => (
  <span className="inline-flex items-center gap-1.5 text-xs leading-6 mb-1" style={{ color: INK }}>
    {children}
    {hint && <Info size={12} style={{ color: MUTED }} />}
  </span>
);

/**
 * The filter-bar dropdowns: a checkbox list with Select All on top, reporting
 * "All Selected" or a count on its trigger.
 *
 * The outside-click listener exists only while the panel is open, so a closed
 * dropdown costs nothing.
 */
const MultiSelect = ({ options, picked, onPicked, width = 'w-[126px]', icon = false }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  // An empty set means "all", so every box reads ticked -- otherwise the
  // trigger says All Selected above a list with nothing checked.
  const all = picked.size === 0 || (picked.size === options.length && options.length > 0);
  const isOn = (value) => picked.size === 0 || picked.has(value);

  const toggle = (value) => {
    // Unticking one while "all" is implied means every other option, not none.
    const base = picked.size === 0 ? new Set(options.map((o) => o.value)) : new Set(picked);
    if (base.has(value)) base.delete(value); else base.add(value);
    onPicked(base);
  };

  return (
    <span ref={boxRef} className="relative inline-block">
      <button type="button" onClick={() => setOpen((was) => !was)}
              className={`inline-flex items-center justify-between gap-2 h-[30px] px-2.5 rounded border bg-white text-xs whitespace-nowrap ${width}`}
              style={{ borderColor: open ? BLUE : BORDER, color: INK }}>
        {/* One option picked shows its NAME -- "1 Selected" tells the user
            nothing when the answer is simply SENSEX. */}
        {all ? 'All Selected'
          : picked.size === 1 ? (options.find((o) => picked.has(o.value))?.label ?? '1 Selected')
            : `${picked.size} Selected`}
        <ChevronDown size={13} style={{ color: MUTED }} />
      </button>

      {open && (
        <span className="absolute left-0 top-full mt-1 z-30 min-w-full w-max max-h-[260px] overflow-y-auto rounded-md border bg-white shadow-lg block"
              style={{ borderColor: BORDER }}>
          <label className="flex items-center gap-2.5 px-3 h-[36px] text-[13px] cursor-pointer hover:bg-[#F5F5F5]"
                 style={{ color: INK }}>
            <input type="checkbox" checked={all}
                   onChange={() => onPicked(all ? new Set(['\u0000none']) : new Set())}
                   className="w-4 h-4 shrink-0 accent-[#0782DA]" />
            Select All
          </label>
          {options.map((option) => (
            <label key={option.value}
                   className="flex items-center gap-2.5 px-3 h-[36px] text-[13px] cursor-pointer hover:bg-[#F5F5F5]"
                   style={{ color: INK }}>
              <input type="checkbox" checked={isOn(option.value)}
                     onChange={() => toggle(option.value)}
                     className="w-4 h-4 shrink-0 accent-[#0782DA]" />
              {icon && <Funnel size={13} style={{ color: GREEN }} />}
              {option.label}
            </label>
          ))}
        </span>
      )}
    </span>
  );
};

/**
 * Heatmap cell colours, on a FOUR-step scale per direction rather than two.
 *
 * The reference's calendar is readable at a glance because a heavy day is a
 * deep colour and a light one is pale -- a single mid green for every profit
 * flattens the whole thing into noise. Breakeven is its own state, distinct
 * from "no data".
 */
const WIN_SCALE = ['#C9EAD5', '#86D3A5', '#2F9E5E', '#0B7A3B'];
const LOSS_SCALE = ['#F9D5D2', '#F0A9A4', '#D4544B', '#B3261E'];

const cellTone = (pnl) => {
  if (pnl === undefined) return '#F1F2F4';
  if (pnl === 0) return '#CFE6F5';
  const scale = pnl > 0 ? WIN_SCALE : LOSS_SCALE;
  const size = Math.abs(pnl);
  const step = size > 40_000 ? 3 : size > 20_000 ? 2 : size > 5_000 ? 1 : 0;
  return scale[step];
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'Th', 'F', 'S'];

/** The months-across, weekdays-down calendar, coloured by that day's P&L. */
const Heatmap = ({ months }) => (
  <div className="border rounded-md bg-white p-5 overflow-x-auto flex flex-col justify-center"
       style={{ borderColor: BORDER }}>
    {/* justify-between, not a fixed gap: the months spread to fill the card,
        so the right-hand half is no longer dead space. */}
    <div className="flex gap-7 min-w-fit justify-between w-full">
      <div className="flex flex-col gap-[4px] pt-6 shrink-0">
        {WEEKDAY_LABELS.map((d, i) => (
          <span key={`${d}-${i}`} className="h-[18px] text-[11px] leading-[18px] w-4"
                style={{ color: MUTED }}>
            {d}
          </span>
        ))}
      </div>

      {months.map((month) => (
        <div key={month.key} className="shrink-0 flex flex-col justify-end">
          <p className="text-[12px] font-medium mb-2 text-center" style={{ color: MUTED }}>
            {month.label}
          </p>
          <div className="flex gap-[4px]">
            {month.weeks.map((week, wi) => (
              <div key={`${month.key}-${wi}`} className="flex flex-col gap-[4px]">
                {WEEKDAY_LABELS.map((_, di) => {
                  const cell = week?.[di];
                  return (
                    <span key={di} className="w-[18px] h-[18px] rounded-[3px]"
                          style={{ backgroundColor: cell ? cellTone(cell.pnl) : 'transparent' }}
                          title={cell?.pnl === undefined ? cell?.iso
                            : `${cell.iso}: ₹ ${Number(cell.pnl).toLocaleString('en-IN')}`} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    <div className="flex items-center gap-6 mt-5 text-[12px]" style={{ color: INK }}>
      {[['Loss', '#B3261E'], ['Breakeven', '#CFE6F5'], ['Profit', '#0B7A3B']].map(([label, colour]) => (
        <span key={label} className="inline-flex items-center gap-2">
          <span className="w-[13px] h-[13px] rounded-[3px]" style={{ backgroundColor: colour }} />
          {label}
        </span>
      ))}
    </div>
  </div>
);

/** The P&L curve. One definition, drawn inline and again inside the expanded
 *  dialog, so the two cannot drift apart. */
const PnlChart = ({ data, colour, height = 248 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data} margin={{ top: 10, right: 14, bottom: 4, left: 4 }}>
      <defs>
        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
          <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={RULE} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} tickMargin={8}
             angle={-35} textAnchor="end" height={56} interval="preserveStartEnd"
             stroke={BORDER} />
      <YAxis tick={{ fontSize: 10, fill: MUTED }} width={64} stroke={BORDER}
             tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
      <ReferenceLine y={0} stroke={MUTED} strokeDasharray="4 4" />
      <Tooltip formatter={(v) => [`₹ ${Number(v).toLocaleString('en-IN')}`, 'P&L']}
               contentStyle={{ fontSize: 12, borderColor: BORDER, borderRadius: 6 }} />
      <Area type="monotone" dataKey="pnl" stroke={colour} strokeWidth={2}
            fill="url(#pnlFill)" dot={false} activeDot={{ r: 4 }} />
    </AreaChart>
  </ResponsiveContainer>
);

/** Names the file before it is written. */
const FileNameDialog = ({ value, onChange, onDownload, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
    <div className="relative w-[320px] rounded-md bg-white shadow-2xl">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 className="text-[16px] font-semibold" style={{ color: INK }}>Enter file name</h3>
        <button type="button" onClick={onClose} title="Close" style={{ color: INK }}>
          <X size={18} />
        </button>
      </div>
      <div className="h-px" style={{ backgroundColor: BORDER }} />
      <div className="px-5 py-4">
        <p className="text-[13px] mb-2" style={{ color: INK }}>File Name:</p>
        <input value={value} onChange={(e) => onChange(e.target.value)}
               className="w-full h-9 px-3 rounded border text-[13px] outline-none"
               style={{ borderColor: BORDER, color: INK }} aria-label="File name" />
        <div className="text-right mt-5">
          <button type="button" onClick={onDownload}
                  className="h-9 px-5 rounded text-[13px] font-medium text-white"
                  style={{ backgroundColor: DEEP }}>
            Download
          </button>
        </div>
      </div>
    </div>
  </div>
);

/** The buy/sell tag beside a price — pale fill, coloured letter. */
const SideTag = ({ sell }) => (
  <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded text-[10px] font-semibold"
        style={{ backgroundColor: sell ? '#FDECEC' : '#E6F4EA', color: sell ? DANGER : GREEN }}
        title={sell ? 'Sell' : 'Buy'}>
    {sell ? 'S' : 'B'}
  </span>
);

/** One "Label: value" pair in the detail strip. */
const Fact = ({ label, value }) => (
  <span className="truncate" style={{ color: MUTED }}>
    {label}: <span style={{ color: INK }}>{value ?? '-'}</span>
  </span>
);

/**
 * The entry/exit breakdown under an expanded leg: ONE line, ENTRY on the left
 * and EXIT on the right, as the reference draws it -- not a stacked panel.
 *
 * Underlying, trigger price and the two trigger/report times are not in the
 * deployment payload today, so they read "-" rather than being invented. They
 * fill in the moment the backend sends them.
 */
const DETAIL_COLS = 'auto repeat(4, minmax(0,1fr)) auto repeat(4, minmax(0,1fr))';

const LegDetail = ({ leg }) => (
  // A GRID, not a wrapping flex row: every leg's fields then sit in the same
  // ten columns, so ENTRY and EXIT line up down the table instead of each row
  // breaking wherever its own values happen to end.
  <div className="grid items-center gap-x-5 gap-y-1 px-4 py-2 text-[11px]"
       style={{ gridTemplateColumns: DETAIL_COLS, backgroundColor: '#FCFCFC' }}>
    <span className="font-semibold" style={{ color: INK }}>ENTRY:</span>
    <Fact label="Underlying" value={leg.entry_underlying} />
    <Fact label="Tgr Price" value={leg.entry_trigger_price} />
    <Fact label="Tgr time" value={leg.entry_trigger_time} />
    <Fact label="Report time" value={leg.entry_report_time || leg.entry_time} />

    <span className="font-semibold" style={{ color: INK }}>EXIT:</span>
    <Fact label="Underlying" value={leg.exit_underlying} />
    <Fact label="Tgr Price" value={leg.exit_trigger_price} />
    <Fact label="Tgr time" value={leg.exit_trigger_time} />
    <Fact label="Report time" value={leg.exit_report_time || leg.exit_time} />
  </div>
);

/** "2026-10-05" + "14:06:11" -> "Oct 05, 2026, 02:06 PM" — the reference prints
 *  the date and the time in one cell, not the clock alone. */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const whenText = (date, time) => {
  if (!date && !time) return '-';
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''));
  const t = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  const datePart = d ? `${MONTH_NAMES[Number(d[2]) - 1]} ${d[3]}, ${d[1]}` : '';
  if (!t) return datePart || '-';
  const hour = Number(t[1]);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = String(hour % 12 === 0 ? 12 : hour % 12).padStart(2, '0');
  const clockPart = `${h12}:${t[2]} ${suffix}`;
  return datePart ? `${datePart}, ${clockPart}` : clockPart;
};

/** Indices the filter offers./** Indices the filter offers. SENSEX is ticked by default, as asked. */
const INDEX_OPTIONS = [{ value: 'SENSEX', label: 'SENSEX' }];

/** The trade table's columns. One template for the header and every leg row. */
const TRADE_COLS = 'minmax(220px,2fr) 110px minmax(130px,1fr) 80px 80px 110px minmax(130px,1fr) 110px';


const History = ({ onBack, onNotify }) => {
  const [scope, setScope] = useState('Strategies');
  const today = toIso(new Date());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [naming, setNaming] = useState(false);
  const [fileName, setFileName] = useState('Historical Trades');
  const [brokerage, setBrokerage] = useState(false);
  const [taxes, setTaxes] = useState(false);
  // SENSEX pre-ticked; the other two filters open on "all", which is what an
  // empty set means to MultiSelect.
  const [pickedIndexes, setPickedIndexes] = useState(() => new Set(['SENSEX']));
  const [pickedBrokers, setPickedBrokers] = useState(() => new Set());
  // Empty means "every strategy", and the dropdown renders that as All
  // Selected with every box ticked -- see `strategyPicked` below.
  const [pickedStrategies, setPickedStrategies] = useState(() => new Set());

  // null = not loaded yet, [] = loaded and empty.
  const [rows, setRows] = useState(null);
  // The one request is mount-only, so this flips once and stays true; moving a
  // date never puts the page back into a loading state.
  const [loaded, setLoaded] = useState(false);
  const loading = !loaded;

  // deployment_id -> its legs. Filled on demand by Show Details and kept for
  // the life of the page, so re-opening a row makes no second request.
  const [legsById, setLegsById] = useState(() => new Map());
  const [open, setOpen] = useState(() => new Set());
  // The blown-up panel: 'heat' | 'graph' | null. One dialog, two tabs.
  const [expanded, setExpanded] = useState(null);
  const summaryRef = useRef(null);
  const expandedRef = useRef(null);

  const notify = useRef(onNotify);
  useEffect(() => { notify.current = onNotify; });

  const brokerNames = getBrokerNames();
  const brokerName = (id) => brokerNames[String(id)]?.name || '--';

  // The broker filter lists the connections this browser knows about, by the
  // name the user gave them -- the same names the rows show.
  const brokerOptions = Object.entries(brokerNames)
    .map(([id, entry]) => ({ value: id, label: entry.name }));

  /**
   * ONE request, when the page opens: GET /live/deployments for today.
   *
   * Start and end date, broker, index and strategy are all PAGE filters from
   * here on -- they narrow `rows` below without going back to the server.
   * Mount-only, so moving a date costs nothing.
   */
  useEffect(() => {
    let alive = true;

    loadHistory()
      .then(({ rows: found }) => {
        if (!alive) return;
        setRows(found);
        if (found.length === 0) notify.current?.('No strategy available', 'error');
      })
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        notify.current?.(err.message || 'No strategy available', 'error');
      })
      .finally(() => { if (alive) setLoaded(true); });

    return () => { alive = false; };
  }, []);

  /**
   * Legs for every deployment on screen, because the table shows them without
   * being asked. Batched and capped in historyData, and applied per batch so
   * the table fills in progressively rather than all at the end.
   *
   * Only ids that have no legs yet are requested, so changing a filter or a
   * date within the same page never re-fetches what is already held.
   */
  useEffect(() => {
    if (!rows || rows.length === 0) return undefined;

    let alive = true;
    const missing = rows
      .map((row) => row.deployment_id)
      .filter((id) => !legsById.has(String(id)));
    if (missing.length === 0) return undefined;

    loadLegs(missing, fetchDeployment, (found) => {
      if (!alive) return;
      setLegsById((was) => {
        const next = new Map(was);
        found.forEach(([id, legs]) => next.set(id, legs));
        return next;
      });
    }).then(({ skipped }) => {
      if (alive && skipped > 0) {
        notify.current?.(`Legs loaded for the first ${MAX_LEG_FETCHES} deployments`, 'error');
      }
    });

    return () => { alive = false; };
    // legsById is deliberately NOT a dependency: this effect writes it, so
    // watching it would re-run the effect on its own result, forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /** Show Details / Hide Details for one deployment -- every one of its legs
   *  gets its ENTRY/EXIT strip, as the reference opens them together. */
  const toggleDetails = (deploymentId) => setOpen((was) => {
    const next = new Set(was);
    const key = String(deploymentId);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const allRows = rows || [];

  // Strategy names come from what actually came back, so the filter can never
  // offer a strategy the range does not contain.
  const strategyOptions = [...new Set(allRows.map((r) => r.strategy_name))]
    .filter(Boolean).sort()
    .map((name) => ({ value: name, label: name }));

  /** An empty set means "all", not "none" -- a filter nobody has touched must
   *  not hide everything. */
  const keeps = (set, value) => set.size === 0 || set.has(value);

  const list = allRows
    // An errored deployment never traded, so it has nothing to show on a page
    // about past trades -- it would be a row of dashes with a zero P&L.
    .filter((row) => !['error', 'failed'].includes(String(row.status || '').toLowerCase()))
    .filter((row) => (!row.trade_date
      || ((!startDate || row.trade_date >= startDate) && (!endDate || row.trade_date <= endDate)))
    && keeps(pickedStrategies, row.strategy_name)
    && keeps(pickedBrokers, String(row.broker_account_id))
    // Index is not on the deployment row; until it is, this filter only
    // narrows once the backend sends one rather than silently dropping rows.
    && (pickedIndexes.size === 0 || !row.index || pickedIndexes.has(String(row.index).toUpperCase())));

  const totalPnl = list.reduce((sum, row) => sum + Number(row.realised_pnl || 0), 0);
  const perDay = pnlByDay(list);
  const grouped = groupByDay(list);
  const months = buildHeatmap(startDate, endDate, perDay);
  // The line takes the colour of the span's result, so a losing period is red
  // at a glance rather than a green line that happens to sit below zero.
  const chartColour = totalPnl < 0 ? DANGER : GREEN;
  const chartData = [...perDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, pnl]) => ({ day: shortDay(day), pnl }));

  const download = () => {
    const csv = buildHistoryCsv(list, legsById, brokerName);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(fileName || 'Historical Trades').trim().replace(/[\\/:*?"<>|]/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNaming(false);
  };

  return (
    <div className="px-6 lg:px-9 py-4">
      {naming && (
        <FileNameDialog value={fileName} onChange={setFileName}
                        onDownload={download} onClose={() => setNaming(false)} />
      )}

      {/* The charts, larger. One dialog with two tabs rather than two dialogs:
          the header, the P&L figure and the export button are identical in
          both, and only the panel below them changes. */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setExpanded(null)}
               role="presentation" />
          <div className="relative w-full max-w-[1100px] rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3" data-png-hide>
              <div>
                <p className="text-[12px]" style={{ color: MUTED }}>PnL</p>
                <p className="text-[20px] font-semibold mt-0.5"><Money value={totalPnl} /></p>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full border overflow-hidden bg-white"
                      style={{ borderColor: BORDER }}>
                  {[['heat', 'Heat Map'], ['graph', 'Graph']].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setExpanded(key)}
                            className="h-[30px] px-4 text-[13px]"
                            style={expanded === key
                              ? { backgroundColor: BLUE_TINT, color: BLUE, fontWeight: 500 }
                              : { backgroundColor: '#FFFFFF', color: INK }}>
                      {label}
                    </button>
                  ))}
                </span>
                <button type="button"
                        onClick={() => downloadNodePng(
                          expandedRef.current,
                          expanded === 'heat' ? 'PnL heat map' : 'PnL graph',
                        ).catch(() => {})}
                        title="Download as .png"
                        className="inline-flex items-center justify-center w-[28px] h-[28px] rounded"
                        style={{ backgroundColor: '#ECF6FF', color: BLUE }}>
                  <Upload size={14} />
                </button>
                <button type="button" onClick={() => setExpanded(null)} title="Close"
                        style={{ color: MUTED }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div ref={expandedRef} className="px-6 pb-6 bg-white">
              {expanded === 'heat'
                ? <Heatmap months={months} />
                : (
                  <div className="border rounded-md bg-white p-4" style={{ borderColor: BORDER }}>
                    <PnlChart data={chartData} colour={chartColour} height={380} />
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs leading-6" style={{ color: MUTED }}>
        Algo Trade <span className="mx-1">&rsaquo;</span> <span style={{ color: INK }}>History</span>
      </p>

      <div className="flex items-center gap-3 mt-1 mb-5">
        <button type="button" onClick={onBack} title="Back" style={{ color: INK }}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[22px] font-semibold" style={{ color: INK }}>History</h1>
      </div>

      {/* Filter bar. items-end so every control sits on one baseline, and
          flex-wrap so a rotated screen stacks it instead of clipping it. */}
      <div className="flex items-end gap-6 xl:gap-8 flex-wrap text-xs font-normal leading-6">
        {/* The radios sit in the label row, so the select below them lines up
            with Start Date and End Date rather than hanging a row proud. */}
        <div className="flex flex-col">
          <span className="flex items-center gap-5 text-xs leading-6 mb-1">
            {['Strategies', 'Portfolios'].map((name) => (
              <label key={name} className="inline-flex items-center gap-2 cursor-pointer"
                     style={{ color: INK }}>
                <input type="radio" name="history-scope" checked={scope === name}
                       onChange={() => setScope(name)} className="w-3.5 h-3.5 accent-[#0782DA]" />
                {name}
              </label>
            ))}
          </span>
          <MultiSelect options={strategyOptions} picked={pickedStrategies}
                       onPicked={setPickedStrategies} width="w-[150px]" />
        </div>

        <div className="flex flex-col">
          <FilterLabel hint>Start Date</FilterLabel>
          <input type="date" value={startDate} max={endDate}
                 onChange={(e) => setStartDate(e.target.value)}
                 className="h-[30px] px-2 rounded border text-xs outline-none w-[134px]"
                 style={{ borderColor: BORDER, color: INK }} aria-label="Start date" />
        </div>

        <div className="flex flex-col">
          <FilterLabel hint>End Date</FilterLabel>
          <input type="date" value={endDate} min={startDate}
                 onChange={(e) => setEndDate(e.target.value)}
                 className="h-[30px] px-2 rounded border text-xs outline-none w-[134px]"
                 style={{ borderColor: BORDER, color: INK }} aria-label="End date" />
        </div>

        <div className="flex flex-col">
          <FilterLabel>Index</FilterLabel>
          <MultiSelect options={INDEX_OPTIONS} picked={pickedIndexes}
                       onPicked={setPickedIndexes} width="w-[120px]" />
        </div>

        <div className="flex flex-col">
          <FilterLabel>Broker</FilterLabel>
          <MultiSelect options={brokerOptions} picked={pickedBrokers}
                       onPicked={setPickedBrokers} width="w-[132px]" icon />
        </div>

        <div className="flex items-center ml-auto">
          <button type="button" onClick={() => setNaming(true)}
                  className="inline-flex items-center gap-2 text-[13px] font-medium"
                  style={{ color: BLUE }}>
            <Download size={14} />
            Download .csv
          </button>
        </div>
      </div>

      {/* ── P&L summary ─────────────────────────────────────────────────── */}
      <div ref={summaryRef} className="mt-6 border rounded-md bg-white px-5 py-4"
           style={{ borderColor: BORDER }}>
        <div className="flex items-start justify-between gap-8 flex-wrap">
          <div className="flex items-start gap-10 flex-wrap">
            <div className="rounded-md px-4 py-2.5"
                 style={{ backgroundColor: totalPnl < 0 ? '#FBF3F3' : '#EAF7EF' }}>
              <p className="text-[12px]" style={{ color: MUTED }}>PnL</p>
              <p className="text-[22px] font-semibold mt-0.5">
                <Money value={totalPnl} />
              </p>
            </div>
            <div>
              <p className="text-[12px] inline-flex items-center gap-3 whitespace-nowrap" style={{ color: INK }}>
                Include Brokerage
                <Toggle on={brokerage} onClick={() => setBrokerage((b) => !b)}
                        title="Include Brokerage" />
              </p>
            </div>
            <div>
              <p className="text-[12px] inline-flex items-center gap-3 whitespace-nowrap" style={{ color: INK }}>
                Taxes &amp; charges
                <Toggle on={taxes} onClick={() => setTaxes((t) => !t)}
                        title="Taxes and charges" />
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3" data-png-hide>
            <button type="button" onClick={() => setExpanded('heat')}
                    title="Open the charts larger" style={{ color: MUTED }}>
              <Maximize2 size={16} />
            </button>
            <button type="button"
                    onClick={() => downloadNodePng(summaryRef.current, 'PnL summary').catch(() => {})}
                    title="Download this panel as a .png"
                    className="inline-flex items-center justify-center w-[26px] h-[26px] rounded"
                    style={{ backgroundColor: '#ECF6FF', color: BLUE }}>
              <Upload size={14} />
            </button>
          </div>
        </div>

        {/* Heatmap and chart side by side on a wide screen, stacked below
            1100px so a rotated monitor gets two full-width panels. */}
        <div className="grid gap-5 mt-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))' }}>
          <Heatmap months={months} />

          <div className="border rounded-md bg-white p-4" style={{ borderColor: BORDER }}>
            {chartData.length === 0 ? (
              <p className="text-[13px] text-center py-16" style={{ color: MUTED }}>
                No P&amp;L to chart yet
              </p>
            ) : (
              <PnlChart data={chartData} colour={chartColour} />
            )}
          </div>
        </div>
      </div>

      {/* ── Trades ──────────────────────────────────────────────────────── */}
      {loading && <p className="text-center text-[14px] mt-16" style={{ color: MUTED }}>Loading…</p>}

      {!loading && list.length === 0 && (
        <div className="text-center mt-20">
          <p className="text-[26px] font-bold" style={{ color: INK }}>No deployed strategies found</p>
          <p className="text-[16px] mt-4" style={{ color: MUTED }}>Try changing your filter</p>
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="mt-6 overflow-x-auto algo-table-wide">
          <div className="min-w-[1060px]">
            {grouped.map(([day, dayRows]) => (
              <div key={day}>
                {/* The DAY leads, then that day's column names: each date is
                    its own small table, so its headers belong under its own
                    heading rather than once at the top of the page. */}
                {/* A rule either side of the pill, so the date reads as a
                    divider between days rather than a chip floating in space --
                    the same treatment "Deployed on …" gets on the board. */}
                <div className="flex items-center gap-5 mt-6 mb-3">
                  <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
                  <span className="inline-flex items-center h-[26px] px-3 rounded-full border text-[12px] bg-white whitespace-nowrap"
                        style={{ borderColor: BORDER, color: INK }}>
                    {dayPill(day)}
                  </span>
                  <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
                </div>

                <div className="grid px-4 py-2.5 text-[12px] border-b"
                     style={{ gridTemplateColumns: TRADE_COLS, color: MUTED, borderColor: RULE }}>
                  <span>Instrument</span>
                  <span>Entry</span>
                  <span>Entry Time</span>
                  <span>SL</span>
                  <span>TP</span>
                  <span>Exit</span>
                  <span>Exit Time</span>
                  <span className="text-right">MTM</span>
                </div>

                {dayRows.map((row) => {
                  const key = String(row.deployment_id);
                  const legs = legsById.get(key) || [];
                  const showing = open.has(key);
                  return (
                    <div key={key} className="border rounded-md bg-white mb-2.5"
                         style={{ borderColor: BORDER }}>
                      {/* The deployment's own line: name, broker, Show Details,
                          and its booked P&L. */}
                      <div className="flex items-center gap-4 flex-wrap px-4 py-3">
                        <span className="text-[13px] font-semibold" style={{ color: INK }}>
                          {row.strategy_name} ({row.version})
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: MUTED }}>
                          traded with
                          <Funnel size={13} style={{ color: GREEN }} />
                          <span style={{ color: INK }}>{brokerName(row.broker_account_id)}</span>
                        </span>

                        <button type="button"
                                onClick={() => toggleDetails(key)}
                                disabled={legs.length === 0}
                                className="ml-auto text-[12px] font-medium disabled:opacity-40"
                                style={{ color: BLUE }}>
                          {showing ? 'Hide Details' : 'Show Details'}
                        </button>

                        <span className="text-[13px] font-semibold w-[110px] text-right">
                          <Money value={row.realised_pnl} />
                        </span>
                      </div>

                      {/* Legs are listed WITHOUT being asked for -- Show Details
                          opens their entry/exit breakdown, it does not reveal
                          the rows themselves. */}
                      {/* A leg with no instrument is not a trade -- the backend
                          returns placeholder entries for legs that never fired,
                          and drawing them left blank rows under the strategy. */}
                      {legs.filter((leg) => leg?.symbol).map((leg, i) => (
                        <div key={`${key}:${i}`} className="border-t" style={{ borderColor: RULE }}>
                          <div className="grid items-center px-4 py-2.5 text-[12px]"
                               style={{ gridTemplateColumns: TRADE_COLS, color: INK }}>
                            <span className="truncate">
                              {leg.symbol} <span style={{ color: MUTED }}>x {leg.qty}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <SideTag sell={String(leg.side).toUpperCase() === 'SELL'} />
                              {leg.entry_price ?? '-'}
                            </span>
                            <span style={{ color: MUTED }}>
                              {whenText(leg.entry_date, leg.entry_time)}
                            </span>
                            <span style={{ color: MUTED }}>{leg.stoploss ?? '-'}</span>
                            <span style={{ color: MUTED }}>{leg.target ?? '-'}</span>
                            <span className="inline-flex items-center gap-1.5">
                              {leg.exit_price == null ? <span style={{ color: MUTED }}>-</span> : (
                                <>
                                  <SideTag sell={String(leg.side).toUpperCase() !== 'SELL'} />
                                  {leg.exit_price}
                                </>
                              )}
                            </span>
                            <span style={{ color: MUTED }}>
                              {whenText(leg.exit_date, leg.exit_time)}
                            </span>
                            <span className="text-right"><Money value={leg.pnl} /></span>
                          </div>

                          {showing && <LegDetail leg={leg} />}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
