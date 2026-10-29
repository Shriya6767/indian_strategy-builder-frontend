import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Info, ChevronDown, Search, SquarePen } from 'lucide-react';
import {
  INK, MUTED, BORDER, RULE, BLUE, TINT_SELECTED, DEEP, ACTIVATE_HOVER,
  HEAD_BG, PENDING_BG, PENDING_EDGE, PENDING_TEXT, SOFT_BG,
} from './palette';
import SymbolFilter from './SymbolFilter';

const ExecutionDialog = lazy(() => import('./ExecutionDialog'));
import { saveExecutionSettings, isBrokerLoggedIn, getBrokerAccountId, createDeployment, rememberDeployment } from '../../services/liveTradingApi';
import { buildDeploymentPayload } from './activationTiming';
import { rememberDeploymentWindow } from './deploymentWindow';
import { useLiveSnapshot } from '../../services/liveSnapshot';
const SetupBrokerDialog = lazy(() => import('./SetupBrokerDialog'));
const SelectBrokerDialog = lazy(() => import('./SelectBrokerDialog'));
import { fetchStrategies, fetchPortfolios } from '../../services/libraryApi';
import { getAlgoTab, setAlgoTab } from './tabMemory';
import { activationWindowError } from './marketClock';

/**
 * The Activation block: the four tabs and their tables, shared by the main and
 * Pro views so the two cannot drift apart.
 *
 * Strategies calls GET /api/strategies, Portfolios GET /api/portfolios, each
 * visit refetching; a response landing after the tab moved on is dropped.
 * Hover reveals are pure CSS, in a real trailing grid column so they can never
 * paint over another cell.
 */


// RA Algos and CryptoBazaar Algos removed outright -- neither had a source of
// data behind it, so both were empty panels taking up rail space.
const ACTIVATION_TABS = ['Strategies', 'Portfolios'];

// [label, Date#getDay() value] — Monday first, the way the reference lists them.
const WEEKDAYS = [['M', 1], ['T', 2], ['W', 3], ['Th', 4], ['F', 5], ['Sa', 6], ['Su', 0]];
const DTE_OPTIONS = Array.from({ length: 80 }, (_, i) => i);

// The last column is the hover-revealed actions — reserved, so nothing overlaps.
const PORTFOLIO_GRID = 'algo-pf-grid grid grid-cols-[minmax(0,2.6fr)_minmax(150px,1.6fr)_minmax(140px,1.6fr)_minmax(120px,1.6fr)_minmax(380px,2.1fr)] items-center';
// Measured off the reference: Strategy takes ~23% and the three data columns
// are equal at ~18.5% each, with the actions column holding the rest. Their
// headers are centred over the chips beneath them.
const STRATEGY_GRID = 'algo-st-grid grid grid-cols-[minmax(0,2.3fr)_minmax(220px,1.85fr)_minmax(140px,1.85fr)_minmax(230px,1.85fr)_minmax(320px,2.2fr)] items-center';

/** Filters the table it sits above, by name. */
const SearchBox = ({ placeholder, value, onChange }) => (
  <span
    className="inline-flex items-center gap-2 h-[33px] px-3 rounded-md border bg-white w-[234px]"
    style={{ borderColor: BORDER }}
  >
    <Search size={15} style={{ color: MUTED }} />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 min-w-0 text-[13px] outline-none bg-transparent"
      style={{ color: INK }}
      aria-label={placeholder}
    />
  </span>
);

/**
 * "Filter Execution Days" + the Weekdays/DTE segmented switch, then whichever
 * of the two views the mode selects: the seven day dots (today ringed blue) or
 * the Select DTE checkbox dropdown, Select All on top.
 */
const ExecutionDaysFilter = ({ mode, onMode, days, onDays }) => {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const boxRef = useRef(null);

  // Present only while the list is open — no cost the rest of the time.
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const allPicked = picked.size === DTE_OPTIONS.length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: MUTED }}>
        Filter Execution Days
        <Info size={14} />
      </span>

      <span className="inline-flex items-center rounded-md border overflow-hidden bg-white" style={{ borderColor: BORDER }}>
        {[['weekdays', 'Weekdays'], ['dte', 'DTE']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onMode(value)}
            // 26px tall — measurably shorter than the search box beside it on
            // the reference, so this is not the shared PILL height.
            className="h-[26px] px-3.5 text-[13px]"
            style={mode === value
              ? { backgroundColor: TINT_SELECTED, color: BLUE, fontWeight: 500 }
              : { backgroundColor: '#FFFFFF', color: INK }}
          >
            {label}
          </button>
        ))}
      </span>

      {mode === 'weekdays' ? (
        <span className="inline-flex items-center gap-2">
          {WEEKDAYS.map(([label, day]) => {
            const on = days.has(day);
            return (
              <button
                key={label}
                type="button"
                onClick={() => onDays((was) => {
                  const next = new Set(was);
                  if (next.has(day)) next.delete(day); else next.add(day);
                  return next;
                })}
                className="inline-flex shrink-0 items-center justify-center w-[27px] h-[27px] rounded-full border text-[12px] bg-white"
                style={on
                  ? { borderColor: BLUE, color: BLUE }
                  // The reference greys the ring and the letter together, a
                  // notch lighter than the muted label grey.
                  : { borderColor: '#C9CBCF', color: '#9CA3AF' }}
              >
                {label}
              </button>
            );
          })}
        </span>
      ) : (
        <span ref={boxRef} className="relative inline-block">
          <button
            type="button"
            onClick={() => setOpen((was) => !was)}
            className="inline-flex items-center justify-between gap-2 h-[33px] px-3 rounded-md border text-[13px] bg-white min-w-[118px]"
            style={{ borderColor: picked.size || open ? BLUE : BORDER, color: INK }}
          >
            {/* The box reports the tally, not a static prompt: every DTE ticked
                reads "All Selected", otherwise the count. */}
            {allPicked ? 'All Selected' : `${picked.size} Selected`}
            <ChevronDown size={14} />
          </button>

          {/* Same panel metrics as the instrument picker beside it — 37px rows,
              16px boxes — so the two dropdowns read as one family. */}
          {open && (
            <span
              className="absolute left-0 top-full mt-1 z-20 w-[150px] max-h-[260px] overflow-y-auto rounded-md border bg-white shadow-lg block"
              style={{ borderColor: BORDER }}
            >
              <label
                className="flex items-center gap-2.5 px-3 h-[37px] text-[13px] cursor-pointer hover:bg-[#F5F5F5]"
                style={{ color: INK }}
              >
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(DTE_OPTIONS))}
                  className="w-4 h-4 shrink-0 accent-[#0782DA]"
                />
                Select All
              </label>
              {DTE_OPTIONS.map((dte) => (
                <label
                  key={dte}
                  className="flex items-center gap-2.5 px-3 h-[37px] text-[13px] cursor-pointer hover:bg-[#F5F5F5]"
                  style={{ color: INK }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(dte)}
                    onChange={() => setPicked((was) => {
                      const next = new Set(was);
                      if (next.has(dte)) next.delete(dte); else next.add(dte);
                      return next;
                    })}
                    className="w-4 h-4 shrink-0 accent-[#0782DA]"
                  />
                  {dte}
                </label>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  );
};

/** Status chip in the strategies row — a rounded rectangle, cream with a tan
 *  border and AMBER text for "Setup Pending", plain grey for the instance
 *  count (which the reference left-aligns inside its box). Heights are per
 *  chip: the reference draws Setup Pending 25px and the count box 21px. */
const Chip = ({ children, bg, edge, width, maxWidth, height = 22, color = INK,
                align = 'justify-center' }) => (
  <span
    className={`inline-flex shrink-0 items-center ${align} px-2.5 rounded text-[12px] whitespace-nowrap`}
    style={{ backgroundColor: bg, color, width, maxWidth, height: `${height}px`,
             border: edge ? `1px solid ${edge}` : 'none' }}
  >
    {children}
  </span>
);

/** Pill marker in the portfolio row — Disabled (26px) / 0 deployed (22px).
 *  The reference draws the two at different heights; one shared size was wrong
 *  for whichever it was not measured from. */
const SoftChip = ({ children, width, height = 26 }) => (
  <span
    className="inline-flex shrink-0 items-center justify-center rounded-full text-[12px] whitespace-nowrap"
    style={{ backgroundColor: SOFT_BG, color: INK, width, height: `${height}px` }}
  >
    {children}
  </span>
);

/**
 * The tab rail is rendered by each panel so the whole filter row lays out as one
 * wrapping flex line, exactly as the reference does. Selection lives above and
 * arrives as props.
 */
const TabsRail = ({ selected, onSelect }) => (
  <span className="inline-flex items-center gap-1 p-[3px] rounded-lg border bg-white" style={{ borderColor: BORDER }}>
    {ACTIVATION_TABS.map((tab) => (
      <button
        key={tab}
        type="button"
        onClick={() => onSelect(tab)}
        className="inline-flex items-center h-[29px] px-4 rounded-md text-[13px] whitespace-nowrap"
        style={tab === selected
          ? { backgroundColor: TINT_SELECTED, color: BLUE, fontWeight: 500 }
          : { color: INK }}
      >
        {tab}
      </button>
    ))}
  </span>
);
/** Loading / error / empty, centred in the table area under the header row. */
const TableNotice = ({ children }) => (
  <p className="text-center text-[13px] py-8" style={{ color: MUTED }}>
    {children}
  </p>
);

const StrategiesPanel = ({ mode, onMode, days, onDays, onTab, rows, error, onEdit, query, onQuery,
                          symbols, onSymbols, onSetup, ready, execDays, onActivate, deployedCount }) => (
  <>
    <div className="mt-6 flex items-center gap-3 flex-wrap">
      <TabsRail selected="Strategies" onSelect={onTab} />
      <SearchBox placeholder="Search Strategies" value={query} onChange={onQuery} />
      <SymbolFilter picked={symbols} onPicked={onSymbols} />
      <ExecutionDaysFilter mode={mode} onMode={onMode} days={days} onDays={onDays} />
    </div>

    <div className="mt-5 overflow-x-auto">
      <div className="algo-table-wide min-w-[1180px]">
        {/* 33px band, as measured off the reference header row. */}
        <div className={`${STRATEGY_GRID} px-5 py-[6px] text-[13px] border-y`}
             style={{ backgroundColor: HEAD_BG, color: MUTED, borderColor: BORDER }}>
          <span>Strategy ({rows?.length ?? 0})</span>
          <span className="text-center">Status</span>
          <span className="text-center">Instances</span>
          <span className="text-center">Execution On</span>
          <span />
        </div>

        {rows === null && <TableNotice>Loading…</TableNotice>}
        {rows !== null && rows.length === 0 && (
          <TableNotice>{error || (query ? `No strategies match "${query}"` : 'No Strategies found')}</TableNotice>
        )}

        {(rows || []).map((row, index) => (
          /* group: the hover reveals are pure CSS. The actions live in their own
             trailing column (reserved by the grid), so they never overlap. */
          <div
            key={row.id ?? `${row.name}-${index}`}
            /* 58px card on a 13px gap — measured card borders at y246/y303 with
               the next card's top edge at y316. */
            className={`${STRATEGY_GRID} group px-5 h-[58px] mt-[13px] text-[13px] border rounded-md bg-white transition-shadow hover:shadow-[0_2px_8px_0_rgba(0,0,0,0.10)]`}
            style={{ borderColor: BORDER, color: INK }}
          >
            <span className="min-w-0 pr-3">
              <span className="inline-flex items-center gap-2 max-w-full text-[14px]" style={{ color: INK }}>
                <span className="truncate">{row.name}</span>
                <button
                  type="button"
                  title={`Edit ${row.name}`}
                  onClick={() => onEdit?.(row)}
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                  style={{ color: BLUE, lineHeight: 0 }}
                >
                  <SquarePen size={15} />
                </button>
              </span>
              <span className="block mt-1 text-[12px]" style={{ color: MUTED }}>
                {row.index}&ensp;•&ensp;{row.type}
              </span>
            </span>

            {/* 211x26, FIXED. An earlier capture suggested the chip scaled with
                the table, but two independent full-resolution crops both measure
                211px, so the odd one out was a rescaled screenshot, not a
                narrower chip. */}
            <span className="flex justify-center">
              {ready.has(String(row.id)) ? (
                /* Confirming the execution dialog flips this row's status. */
                <Chip bg="#F0FBF4" edge="#16A34A" width="211px" height={26} color="#16A34A">
                  Ready to deploy
                </Chip>
              ) : (
                <Chip bg={PENDING_BG} edge={PENDING_EDGE} width="211px"
                      height={26} color={PENDING_TEXT}>
                  Setup Pending
                </Chip>
              )}
            </span>
            <span className="flex justify-center">
              <Chip bg="#FAFAFA" width="103px" height={21} align="justify-start">{deployedCount(row.id)} Deployed</Chip>
            </span>

            {/* What the row actually runs on. DTE reports a count; weekdays
                light the chosen letters and dash the rest; an unconfigured row
                is seven dashes. 26px rings on a 4px gap — at 27px/10px the
                seven of them crowded the hover buttons. */}
            <span className="flex items-center justify-center gap-1">
              {(() => {
                const chosen = execDays[row.id];
                if (chosen?.daysMode === 'DTE') {
                  // A grey 24px pill: every DTE reads "All Selected", otherwise
                  // the numbers themselves — "0,1,2 DTE" — as the reference does.
                  return (
                    <span
                      className="inline-flex items-center justify-center h-[24px] px-3 rounded-full text-[12px]"
                      style={{ backgroundColor: '#F3F3F3', color: INK }}
                    >
                      {chosen.dteAll ? 'All Selected'
                        : chosen.dte.length ? `${[...chosen.dte].sort((a, b) => a - b).join(',')} DTE`
                        : '—'}
                    </span>
                  );
                }
                // 28px rings. A chosen day is a GREY disc with dark text, not a
                // blue one — sampled #F3F3F3 on #E3E3E3 off the reference.
                const picked = new Set(chosen?.days || []);
                return WEEKDAYS.map(([text, day]) => {
                  const on = picked.has(day);
                  return (
                    <span
                      key={text}
                      className="inline-flex shrink-0 items-center justify-center w-[28px] h-[28px] rounded-full border text-[12px]"
                      style={on
                        ? { borderColor: BORDER, color: '#2A2A2A', backgroundColor: '#F3F3F3' }
                        : { borderColor: BORDER, color: MUTED, backgroundColor: '#FFFFFF' }}
                    >
                      {on ? text : '-'}
                    </span>
                  );
                });
              })()}
            </span>

            {/* 34px tall, 136 and 176 wide, 8px apart — measured off a
                full-resolution capture of a hovered reference row. */}
            <span className="invisible group-hover:visible flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onSetup?.(row)}
                className="inline-flex shrink-0 items-center justify-center h-[34px] w-[136px] rounded-xs border text-[12px] font-medium bg-white whitespace-nowrap"
                style={{ borderColor: DEEP, color: DEEP }}
              >
                {ready.has(String(row.id)) ? 'Edit Execution' : 'Setup Execution'}
              </button>
              <button
                type="button"
                onClick={() => onActivate?.(row)}
                className="inline-flex shrink-0 items-center justify-center h-[34px] w-[176px] rounded-xs text-[12px] font-medium text-white whitespace-nowrap transition-colors"
                style={{ backgroundColor: DEEP }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = DEEP; }}
              >
                Activate
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  </>
);

const PortfoliosPanel = ({ onTab, rows, error, query, onQuery, onDeploy, onEditPortfolio }) => (
  <>
    <div className="mt-6 flex items-center gap-3 flex-wrap">
      <TabsRail selected="Portfolios" onSelect={onTab} />
      <SearchBox placeholder="Search Portfolios" value={query} onChange={onQuery} />
    </div>

    <div className="mt-5 overflow-x-auto">
      <div className="algo-table-wide min-w-[1120px]">
        <div className={`${PORTFOLIO_GRID} px-5 py-[6px] text-[13px] border-y`}
             style={{ backgroundColor: HEAD_BG, color: MUTED, borderColor: BORDER }}>
          <span>Name ({rows?.length ?? 0})</span>
          <span className="text-center">Auto Activation</span>
          <span className="text-center">No. of Strategies</span>
          <span className="text-center">Instances</span>
          <span />
        </div>

        {rows === null && <TableNotice>Loading…</TableNotice>}
        {rows !== null && rows.length === 0 && (
          <TableNotice>{error || (query ? `No portfolios match "${query}"` : 'No Portfolios found')}</TableNotice>
        )}

        {(rows || []).map((row, index) => (
          <div
            key={row.id ?? `${row.name}-${index}`}
            /* 48px card on a 12px gap, measured off the reference. */
            className={`${PORTFOLIO_GRID} group px-5 h-[48px] mt-3 text-[13px] border rounded-md bg-white transition-shadow hover:shadow-[0_2px_8px_0_rgba(0,0,0,0.10)]`}
            style={{ borderColor: BORDER, color: INK }}
          >
            <span className="truncate pr-3">{row.name}</span>
            <span className="flex justify-center"><SoftChip width="62px" height={24}>Disabled</SoftChip></span>
            <span className="text-center">{row.strategies}</span>
            <span className="flex justify-center"><SoftChip width="75px" height={22}>0 deployed</SoftChip></span>

            {/* 8px between the three, and both buttons 30px tall — measured off
                the reference, where Edit is a wide outlined box in the theme
                blue and Activate a narrow solid navy one. */}
            <span className="invisible group-hover:visible flex items-center justify-end gap-2">
              {/* A BOXED control, not bare text: 144x30 with a light #E3E3E3
                  border, cyan label, white fill — the same footprint as Edit
                  beside it. Hovering fills it navy with a white label.
                  12px/500: the reference's label inks 129px wide, and in this
                  font stack 12px gives 126.8 / 129.5 / 131.2 at weights
                  400/500/600. 13px looked close on cap height (both 9px) but
                  ran 138px and left almost no padding. */}
              <button
                type="button"
                // Opens the same deploy screen as Activate, but already in
                // auto-activation mode.
                onClick={() => {
                  setAlgoTab('Portfolios');
                  onDeploy?.({ name: row.name, id: row.id, strategies: row.entries, autoMode: true });
                }}
                className="inline-flex shrink-0 items-center justify-center h-[30px] w-[144px] rounded-xs border text-[12px] font-medium whitespace-nowrap transition-colors"
                style={{ borderColor: BORDER, backgroundColor: '#FFFFFF', color: '#00A2C6' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = DEEP;
                  e.currentTarget.style.borderColor = DEEP;
                  e.currentTarget.style.color = '#FFFFFF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = BORDER;
                  e.currentTarget.style.color = '#00A2C6';
                }}
              >
                Enable Auto Activation
              </button>
              <button
                type="button"
                onClick={() => onEditPortfolio?.(row.name)}
                className="inline-flex shrink-0 items-center justify-center h-[30px] w-[144px] rounded-xs border text-[12px] bg-white transition-colors"
                style={{ borderColor: '#0B619B', color: '#0B619B' }}
              >
                Edit
              </button>
              {/* Hover lifts to the reference's desaturated steel blue. */}
              <button
                type="button"
                onClick={() => { setAlgoTab('Portfolios'); onDeploy?.({ name: row.name, id: row.id, strategies: row.entries }); }}
                className="inline-flex shrink-0 items-center justify-center h-[30px] w-[81px] rounded-xs text-[12px] font-medium text-white transition-colors"
                style={{ backgroundColor: DEEP }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = DEEP; }}
              >
                Activate
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  </>
);

const RaAlgosPanel = ({ onTab, query, onQuery }) => (
  <>
    <div className="mt-6 flex items-center gap-3 flex-wrap">
      <TabsRail selected="RA Algos" onSelect={onTab} />
      <SearchBox placeholder="Search RA Algos" value={query} onChange={onQuery} />
    </div>
    <p className="text-center text-[14px] mt-14 mb-4" style={{ color: INK }}>No RA Algos found</p>
  </>
);

const CryptoBazaarPanel = ({ mode, onMode, days, onDays, onTab, query, onQuery }) => (
  <>
    <div className="mt-6 flex items-center gap-3 flex-wrap">
      <TabsRail selected="CryptoBazaar Algos" onSelect={onTab} />
      <SearchBox placeholder="Search Strategies" value={query} onChange={onQuery} />
      <ExecutionDaysFilter mode={mode} onMode={onMode} days={days} onDays={onDays} />
    </div>

    <div className="mt-5 flex items-center gap-8 border-b" style={{ borderColor: RULE }}>
      <span
        className="pb-2.5 -mb-px text-[13px] font-medium border-b-2"
        style={{ color: BLUE, borderColor: BLUE }}
      >
        CryptoBazaar Algos
      </span>
      <span className="pb-2.5 text-[13px]" style={{ color: INK }}>CryptoBazaar Portfolio</span>
    </div>

    <div className="text-center mt-16 mb-6">
      <p className="text-[15px]" style={{ color: INK }}>No Crypto Marketplace are listed yet</p>
      <span
        className="inline-flex items-center h-8 px-4 mt-4 rounded-md border text-[13px] bg-white"
        style={{ borderColor: BLUE, color: BLUE }}
      >
        Explore Crypto Marketplace
      </span>
    </div>
  </>
);



/**
 * Owns which tab is open and the rows behind it. Both views render this, so the
 * Activation block is defined once.
 */
const Activation = ({ onEdit, onNotify, onDeploy, onSetupBroker, onDeployed, onEditPortfolio,
  execDays, onExecDays, reloadKey = 0 }) => {
  // Opens on Strategies by default, but REMEMBERS the last tab for the session:
  // going into a portfolio and coming back should land on Portfolios, not snap
  // back to Strategies. Module-level, so it survives this component unmounting
  // when the tab is left, without touching storage.
  // Opens on whatever the last Algo-Trade-initiated trip left behind —
  // Strategies unless a portfolio round trip is in progress.
  const [tab, setTab] = useState(getAlgoTab);
  const [daysMode, setDaysMode] = useState('dte');
  const [days, setDays] = useState(() => new Set());
  const [query, setQuery] = useState('');
  // Which instruments the table is narrowed to; empty = no narrowing at all.
  const [symbols, setSymbols] = useState(() => new Set());
  // The row whose execution dialog is open, and the ids whose execution has
  // been set up (those read "Ready to deploy" instead of "Setup Pending").
  const [execFor, setExecFor] = useState(null);
  /**
   * "Ready to deploy" is exactly "this strategy has execution settings", and
   * `execDays` is where those settings live -- seeded on load from
   * GET /live/overview and added to by every successful save. Deriving the chip
   * from that one source is what makes it survive a reload: there is no second
   * flag to fall out of step with what the server actually holds.
   */
  const ready = new Set(Object.keys(execDays || {}));
  // id -> the execution days confirmed for that row, so "Execution On" can
  // report them instead of showing seven dashes.
  const setExecDays = onExecDays;
  // Raised by Activate while no broker is connected.
  const [brokerWanted, setBrokerWanted] = useState(false);
  // Deployments come from the live snapshot, so the count is the server's own
  // record rather than anything tracked in the browser.
  const { snapshot } = useLiveSnapshot();
  /*
    "2 Deployed" -- every ACTIVE deployment of this strategy.

    A strategy can now hold several at once: the backend no longer refuses a
    second activation just because one is running, only when an existing
    deployment's exit_date falls after the new entry date. So the count is a
    real count, not a 0/1 flag.

    Finished ones are excluded -- a deployment squared off this morning is
    not an instance any more, and counting it would keep the number climbing
    all week.
  */
  const FINISHED = ['squared_off', 'sq_off', 'completed', 'cancelled', 'error', 'failed'];
  const deployedCount = (strategyId) => (snapshot?.deployments || [])
    .filter((d) => String(d.strategy_id) === String(strategyId)
      && !FINISHED.includes(String(d.status || '').toLowerCase())
      && !d.is_archived).length;

  // null = not loaded yet (shows "Loading…"); [] = loaded and empty.
  const [strategyRows, setStrategyRows] = useState(null);
  const [portfolioRows, setPortfolioRows] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (tab !== 'Strategies' && tab !== 'Portfolios') return undefined;
    let stale = false;

    const request = tab === 'Strategies'
      ? fetchStrategies().then((rows) => rows.map((row) => ({
          // id and version ride along so the pencil can ask for this exact
          // strategy the same way the Strategies screen does.
          id: row.id,
          version: row.version,
          name: row.name,
          index: String(row.symbol || '').toUpperCase() || '—',
          type: String(row.strategy_type || '').toUpperCase() || '—',
          // How many "Leg N" tabs the execution dialog draws.
          legCount: Number(row.leg_count) || 1,
          // The strategy's own entry time, so the dialog opens on it rather
          // than a hardcoded default. Spelling varies between the list payload
          // and the detail one, so both are accepted.
          entryTime: row.entry_time || row.entryTime || row.raw?.entry_time || null,
        })))
      : fetchPortfolios().then((rows) => rows.map((row) => ({
          id: row.id,
          name: row.name,
          // Zero-padded to two digits, the way the reference prints "02".
          strategies: String(
            (row.strategies || []).length
            || Number(row.raw?.no_of_strategies ?? row.raw?.strategy_count ?? 0),
          ).padStart(2, '0'),
          // The entries themselves, for the deploy screen to resolve against
          // the saved-strategy cards.
          entries: row.strategies || [],
        })));

    const apply = tab === 'Strategies' ? setStrategyRows : setPortfolioRows;
    request
      .then((rows) => { if (!stale) { apply(rows); setLoadError(null); } })
      .catch((requestError) => {
        if (stale) return;
        apply([]);
        setLoadError(requestError.message);
      });
    return () => { stale = true; };
    // `reloadKey` re-runs this: editing a strategy in the pencil popup mints a
    // new version, and the row has to carry it or the next open would ask the
    // server for the version before the edit.
  }, [tab, reloadKey]);

  // A term typed for strategies means nothing in the portfolio list, so moving
  // tabs clears it — done here rather than in an effect watching `tab`, which
  // would re-render twice for one click.
  const changeTab = (next) => { setQuery(''); setAlgoTab(next); setTab(next); };

  const matching = (rows) => {
    const term = query.trim().toLowerCase();
    if (!rows) return rows;
    let out = rows;
    if (term) out = out.filter((row) => String(row.name || '').toLowerCase().includes(term));
    // An empty picker means "everything", not "nothing" — narrowing only starts
    // once at least one instrument is ticked.
    if (symbols.size) out = out.filter((row) => symbols.has(String(row.index || '').toUpperCase()));
    return out;
  };

  /**
   * The broker account this browser is connected to, or null.
   *
   * Read ONCE here rather than inline with a `?? 1` fallback: that default
   * silently pointed an unconnected browser at broker account 1, which is a
   * real account on someone's money. No connection means no account.
   */
  const connectedBrokerId = getBrokerAccountId();

  return (
    /* mt-8, not mt-20. The two sections only need to read as separate --
       the "Activation" rule above already does that -- and 80px of blank
       page between them left the board looking like it had ended. */
    <section className="mt-8">
      {brokerWanted && (
        <Suspense fallback={null}>
          {isBrokerLoggedIn() && connectedBrokerId != null ? (
            /* A broker is connected AND logged in, so the choice is which one
               to run on. Design only -- Activate closes without deploying. */
            <SelectBrokerDialog
              strategyName={brokerWanted?.name || 'Strategy'}
              strategyId={brokerWanted?.id}
              // The quantity this strategy's execution settings were saved with,
              // so the dialog multiplies the real figure rather than a hardcoded 1.
              qty={execDays?.[brokerWanted?.id]?.qty ?? 1}
              /*
                NO `?? 1`. That default meant a browser with no stored broker
                id would deploy to broker account 1 -- a real account, chosen
                by nothing but a fallback literal. With no broker connected
                there is no account to deploy to, and the dialog shows none
                rather than inventing one.
              */
              brokers={[{ id: connectedBrokerId, name: 'Symphony (Open XTS)' }]}
              // Decides whether the dialog offers a timing panel at all, and
              // what shape the deployment body takes.
              strategyType={brokerWanted?.type}
              version={brokerWanted?.version ?? 0}
              onNotify={onNotify}
              onClose={() => setBrokerWanted(false)}
              onActivate={(brokerIds = [], _multipliers, { strategyType, timings } = {}) => {
                const row = brokerWanted;
                // The instant the button was pressed -- this is what View Trades
                // shows as "Deployed" and "Last Unpaused", since neither the
                // response nor the snapshot carries an activation timestamp.
                const deployedAt = new Date().toISOString();
                setBrokerWanted(false);
                // One deployment per ticked broker, in parallel. Partial
                // success is reported honestly rather than as a flat failure:
                // some brokers may accept while another rejects.
                // One call per ticked broker, each carrying that broker's own
                // id -- the window comes from the dialog, and for an intraday
                // strategy all four timing fields go as explicit nulls. See
                // buildDeploymentPayload for why null and not omitted.
                Promise.allSettled(brokerIds.map((brokerAccountId) => createDeployment(
                  buildDeploymentPayload({
                    strategyId: row?.id,
                    version: row?.version ?? 0,
                    brokerAccountId,
                    strategyType,
                    timings,
                  }),
                )))
                  .then((results) => {
                    const accepted = results.filter((r) => r.status === 'fulfilled');
                    const ok = accepted.length;
                    const failed = results.length - ok;

                    /*
                      Record the window against EVERY deployment this created
                      -- one per broker, each with its own id.

                      Only the TIMES, and only because the deployment response
                      does not carry them: View Trades gets them from the live
                      snapshot, which drops a deployment the moment it stops
                      being monitored. Without this, a deployment that never
                      traded a leg shows "--" for both times for ever.
                      See deploymentWindow.js.
                    */
                    accepted.forEach((r) => {
                      const id = r.value?.data?.deployment_id ?? r.value?.deployment_id;
                      rememberDeploymentWindow(id, {
                        entryTime: timings?.entryTime,
                        exitTime: timings?.exitTime,
                      });
                    });
                    // The new deployment id, kept against this strategy so View
                    // Trades can ask for it after a reload -- and so the square
                    // off / pause controls have an id before the first snapshot.
                    const deploymentId = accepted
                      .map((r) => r.value?.data?.deployment_id ?? r.value?.deployment_id)
                      .find((id) => id != null);
                    if (deploymentId != null) {
                      rememberDeployment(row?.id, deploymentId, deployedAt);
                    }
                    if (ok) {
                      onDeployed?.({
                        name: row?.name || 'Strategy',
                        symbol: row?.symbol || 'SENSEX',
                        strategyId: row?.id,
                        deploymentId,
                        mtm: '₹ 0',
                        broker: 'Symphony (Open XTS)',
                      });
                    }
                    if (failed) {
                      const why = results.find((r) => r.status === 'rejected')?.reason?.message;
                      onNotify?.(why || `${failed} broker(s) failed to activate`, 'error');
                    } else {
                      onNotify?.(`Activated on ${ok} broker${ok === 1 ? '' : 's'}`, 'success');
                    }
                  });
              }}
            />
          ) : (
            <SetupBrokerDialog
              onClose={() => setBrokerWanted(false)}
              onSetup={() => { setBrokerWanted(false); onSetupBroker?.(); }}
            />
          )}
        </Suspense>
      )}
      {/* Absent from the bundle until a row is actually opened. */}
      {execFor && (
        <Suspense fallback={null}>
          <ExecutionDialog
            strategyName={execFor.name}
            legCount={execFor.legCount}
            strategyId={execFor.id}
            /* The row's own latest_version. Without it the dialog cannot ask
               the server for the entry time -- get-strategy requires it. */
            version={execFor.version}
            entryTime={execFor.entryTime}
            initial={execDays[execFor.id]}
            onNotify={onNotify}
            onClose={() => setExecFor(null)}
            onConfirm={(settings) => {
              // The green "Ready to deploy" chip is driven by the SAVE, not by
              // the dialog closing -- it only flips once the API confirms.
              // version comes from the row -- it rides along on execFor. It was
              // omitted here, so the service's `version = 0` default went out
              // while the strategy was actually on a later version.
              saveExecutionSettings({
                strategyId: execFor.id,
                version: execFor.version ?? 0,
                settings,
              })
                .then((body) => {
                  setExecDays((was) => ({ ...was, [execFor.id]: settings }));
                  setExecFor(null);
                  onNotify?.(body?.message || 'Execution settings saved.', 'success');
                })
                .catch((err) => onNotify?.(err.message, 'error'));
            }}
          />
        </Suspense>
      )}
      <div className="flex items-center gap-5">
        <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
        <h2 className="text-[17px] whitespace-nowrap" style={{ color: INK }}>Activation</h2>
        <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
      </div>

      {tab === 'Strategies' && (
        <StrategiesPanel mode={daysMode} onMode={setDaysMode} days={days} onDays={setDays}
          onTab={changeTab} rows={matching(strategyRows)} error={loadError} onEdit={onEdit}
          query={query} onQuery={setQuery} symbols={symbols} onSymbols={setSymbols}
          onSetup={setExecFor} ready={ready} execDays={execDays}
          deployedCount={deployedCount}
          onActivate={(row) => {
            /*
              The window is checked HERE, on the Activate button, not inside
              the broker dialog.

              Refusing after the user has ticked brokers and set a quantity
              wastes all of that; refusing on the click that opens it costs
              them nothing. The toast says when they can, so nobody has to
              guess whether to wait a minute or until tomorrow.
            */
            const shut = activationWindowError();
            if (shut) { onNotify?.(shut, 'error'); return; }
            setBrokerWanted(row || true);
          }} />
      )}
      {tab === 'Portfolios' && (
        <PortfoliosPanel onTab={changeTab} rows={matching(portfolioRows)} error={loadError}
          query={query} onQuery={setQuery} onDeploy={onDeploy}
          onEditPortfolio={onEditPortfolio} />
      )}
      {tab === 'RA Algos' && <RaAlgosPanel onTab={changeTab} query={query} onQuery={setQuery} />}
      {tab === 'CryptoBazaar Algos' && (
        <CryptoBazaarPanel mode={daysMode} onMode={setDaysMode} days={days} onDays={setDays}
          onTab={changeTab} query={query} onQuery={setQuery} />
      )}
    </section>
  );
};

export default Activation;
