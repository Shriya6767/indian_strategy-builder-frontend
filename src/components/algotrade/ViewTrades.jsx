import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, Funnel, ChevronDown, Info, Download } from 'lucide-react';
import { INK, MUTED, BORDER, RULE, BLUE, DEEP, GREEN, DANGER, HEAD_BG, ACTIVATE_HOVER, PENDING_TEXT, fillOnHover } from './palette';
import Toggle from './Toggle';
import TradeLegsTable from './TradeLegsTable';
import { fetchDeployment, toApiLeg, getDeployedAt } from '../../services/liveTradingApi';
import { downloadLegCsv } from './legExport';
import { useLiveSnapshot } from '../../services/liveSnapshot';
import { toneFor, labelFor } from './statusTone';
import { getDeploymentWindow } from './deploymentWindow';

const StrategyReadOnly = lazy(() => import('./StrategyReadOnly'));
const MtmGraphDialog = lazy(() => import('./MtmGraphDialog'));

/**
 * The execution detail screen, opened from View Trades.
 *
 * TWO SOURCES, deliberately separated:
 *   REST on mount for what does not change every second -- orders, event log,
 *   execution settings; the live socket for what does -- status, MTM, LTP, SL.
 *
 * Every figure comes straight from the snapshot; nothing is computed here. The
 * snapshot wins wherever both have a value, so the screen is current on open
 * and stays current without re-fetching.
 */

const money = (n) => (n == null ? '--' : `₹ ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const pnlColour = (n) => (Number(n || 0) < 0 ? DANGER : GREEN);

/** "+₹ 1,234" green / "-₹ 560" red / "₹ 0" plain. The sign is always written
 *  out, so a loss can never be read as a gain at a glance. */
const signedMoney = (n) => {
  if (n == null) return '--';
  const value = Number(n);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}₹ ${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

/**
 * "2026-10-06 12:09:15.929621" / an ISO stamp -> "06 Oct 2026, 12:09:15".
 * Parsed by hand rather than with Date: the API's space-separated form is not
 * a format every browser accepts, and a wrong-by-a-timezone stamp on a trading
 * record is worse than none.
 */
const stamp = (value) => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(String(value));
  if (!m) return String(value);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, y, mo, d, hh, mm, ss] = m;
  return `${d} ${months[Number(mo) - 1]} ${y}, ${hh}:${mm}:${ss}`;
};

/**
 * A message row's timestamp, as the reference writes it:
 * "Oct 08, 2026, 09:31:59 AM".
 *
 * The full date, not just the clock: a messages window spans an overnight
 * deployment, where "09:31:59" alone does not say which day it happened on.
 * Hand-parsed for the same reason `stamp` is -- see the note there.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const messageStamp = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) {
    // No date to be had -- fall back to whatever clock part is in there.
    const only = /[T ](\d{2}:\d{2}:\d{2})/.exec(String(value ?? ''));
    return only ? only[1] : null;
  }
  const [, y, mo, d, hh, mm, ss] = m;
  const hour = Number(hh);
  const h12 = String(hour % 12 === 0 ? 12 : hour % 12).padStart(2, '0');
  return `${MONTHS[Number(mo) - 1]} ${d}, ${y}, ${h12}:${mm}:${ss} ${hour >= 12 ? 'PM' : 'AM'}`;
};

/**
 * "2026-10-06" + "12:09:16" -> "06 Oct 2026, 12:09:16".
 *
 * Matches the Deployed / Last Unpaused stamps beside it, so the four read as
 * one row. Either half may be missing: with no time the date stands alone,
 * with no date the time does. Nothing is invented -- a guessed date is worse
 * than a missing one on a trading record.
 */
const windowStamp = (date, time) => {
  const t = String(time ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? '').trim());
  if (!m) return t || null;
  const [, y, mo, d] = m;
  const on = `${d} ${MONTHS[Number(mo) - 1]} ${y}`;
  return t ? `${on}, ${t}` : on;
};

/**
 * Which event levels each tab shows. The API writes "info", "warn" and "error";
 * the reference's third tab is called Critical, so warnings land there rather
 * than being silently dropped by a tab that matches nothing.
 */
const LEVELS = {
  Info: ['info'],
  Critical: ['warn', 'warning', 'critical'],
  Error: ['error', 'fatal'],
};

const LEVEL_COLOURS = {
  warn: PENDING_TEXT, warning: PENDING_TEXT, critical: PENDING_TEXT,
  error: DANGER, fatal: DANGER,
};

/**
 * A labelled figure in the status strip.
 *
 * EVERY pair is centred, Status included. The column is only as wide as the
 * wider of the label and the value, so centring inside it puts the figure
 * directly under the middle of the words above it.
 *
 * Status was left-aligned for a while so it began on the same x as the
 * Today's MTM Graph button; centring it reads better across the strip, and
 * that exact-x alignment is given up deliberately.
 */
const Stat = ({ label, children }) => (
  <div className="flex flex-col items-center text-center">
    <p className="text-[12px] whitespace-nowrap" style={{ color: MUTED }}>{label}</p>
    <div className="text-[13px] mt-1.5" style={{ color: INK }}>{children}</div>
  </div>
);

/**
 * One of the four deployment timestamps -- centred under its own label, the
 * same rule the status strip and the legs table follow, so the three read as
 * one page rather than three habits.
 */
const Stamp = ({ label, value }) => (
  <div className="flex flex-col items-center text-center">
    <p className="text-[12px] whitespace-nowrap" style={{ color: MUTED }}>{label}</p>
    <p className="text-[13px] mt-0.5 whitespace-nowrap" style={{ color: INK }}>{value || '--'}</p>
  </div>
);

/**
 * One read-only execution setting: its label, an optional info hint, and the
 * value in a disabled-looking box with a chevron -- the reference draws these
 * as greyed-out selects, because that is what they are on the live form. They
 * are inert here: this is a record of how the deployment ran, not a form.
 *
 * `suffix` is the unit printed OUTSIDE the box ("0" | sec), as the reference
 * has it -- not "0 sec" crammed inside.
 */
const ConfigField = ({ label, value, hint, suffix, className = '' }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <span className="inline-flex items-center gap-1 text-[13px] min-w-[132px]" style={{ color: INK }}>
      {label}
      {hint && <Info size={12} style={{ color: MUTED }} />}
    </span>
    <span className="inline-flex items-center justify-between gap-2 h-[32px] px-3 rounded border text-[12px] min-w-[104px]"
          style={{ borderColor: BORDER, color: MUTED, backgroundColor: '#FAFAFA' }}>
      {value ?? '--'}
      <ChevronDown size={13} style={{ color: MUTED }} />
    </span>
    {suffix && <span className="text-[12px]" style={{ color: MUTED }}>{suffix}</span>}
  </div>
);

const MESSAGE_TABS = ['All', 'Info', 'Critical', 'Error'];

/** How long to wait before the single retry of the detail read below. */
const RETRY_MS = 1200;

const ViewTrades = ({ deploymentId, strategyId, strategyName, brokerName, onBack, onPause,
  onSquareOff, localSettings }) => {
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [msgTab, setMsgTab] = useState('All');
  const [brokerage, setBrokerage] = useState(false);
  const [taxes, setTaxes] = useState(false);
  // The read-only strategy popup, absent from the bundle until it is opened.
  const [viewStrategy, setViewStrategy] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);

  const { snapshot } = useLiveSnapshot();

  /**
   * One fetch on mount for the parts the socket does not carry -- the orders,
   * the event log and the execution settings.
   *
   * RETRIED ONCE, because this endpoint has been seen to answer 404 for a
   * deployment that exists and then 200 for the identical URL seconds later.
   * The whole screen hangs off `detail`: when it fails, the Messages window is
   * empty, the orders are missing and the only thing shown is the error --
   * with no way back except leaving the page and returning.
   *
   * ONLY THIS READ. It is a GET and asks for nothing to happen, so repeating
   * it cannot do harm. Square Off and Switch to manual are NOT retried on the
   * same symptom: they change a real position, and a request that quietly
   * went through before a retry would square off twice.
   */
  useEffect(() => {
    if (deploymentId == null) return undefined;
    let alive = true;
    let timer = null;

    const load = (attempt = 0) => fetchDeployment(deploymentId)
      .then((body) => { if (alive) { setDetail(body?.data ?? body); setLoadError(null); } })
      .catch((err) => {
        if (!alive) return;
        if (attempt === 0) {
          timer = setTimeout(() => load(1), RETRY_MS);
          return;
        }
        setLoadError(err.message);
      });

    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [deploymentId]);

  // The live row for this deployment, matched on id and falling back to the
  // strategy, so the screen still tracks when only a strategy id is known.
  const live = useMemo(() => {
    const rows = snapshot?.deployments || [];
    return rows.find((d) => String(d.deployment_id) === String(deploymentId))
      || rows.find((d) => String(d.strategy_id) === String(strategyId))
      || null;
  }, [snapshot, deploymentId, strategyId]);

  // Snapshot first, REST second -- live values win wherever both exist.
  const view = { ...(detail || {}), ...(live || {}) };
  const running = String(view.status || '').toLowerCase() === 'running';
  const legs = live?.legs || detail?.legs || [];

  /*
    LEGS ARE SPLIT BY EACH ROW'S OWN STATUS, never the deployment's -- this was
    titled from `view.status`, so a leg that had exited at 642.3 still sat under
    "Running Legs".

      open, exiting                        -> still in the market
      closed, manual                       -> out, with a booked exit
      skipped, error, pending, waiting,
      entering                             -> never traded; with the messages,
                                              or they read as holdings

    Rows are NOT merged by leg_number: a re-entry is a second row with a higher
    `attempt`, and attempt 1 can be closed while attempt 2 is open.
  */
  const legStatus = (l) => String(l?.status || '').toLowerCase();
  const openLegs = legs.filter((l) => ['open', 'exiting'].includes(legStatus(l)));
  const closedLegs = legs.filter((l) => ['closed', 'manual'].includes(legStatus(l)));
  const pendingLegs = legs.filter(
    (l) => !['open', 'exiting', 'closed', 'manual'].includes(legStatus(l)),
  );

  const messages = (detail?.events || []).filter((e) => {
    if (msgTab === 'All') return true;
    return (LEVELS[msgTab] || []).includes(String(e.level || 'info').toLowerCase());
  });

  /**
   * When this deployment was activated. The REST detail's `created_at` is the
   * server's own record and is preferred; the time the Activate click was
   * recorded in this browser is the fallback for a deployment whose detail has
   * not arrived yet.
   *
   * Deployed and Last Unpaused are the same instant: nothing has paused and
   * resumed it since, and there is no endpoint reporting a later resume.
   */
  const deployedAt = stamp(detail?.created_at) || stamp(getDeployedAt(deploymentId));

  /**
   * Last Unpaused is the server's own figure where it has one -- a deployment
   * restarted this morning was unpaused long after it was deployed, so the two
   * are only the same until something pauses and resumes it.
   */
  const lastUnpausedAt = stamp(view.last_unpaused_at ?? view.resumed_at ?? view.updated_at)
    || deployedAt;

  /*
    ENTRY AND EXIT -- what happened if it happened, otherwise what was chosen.

    A deployment's exit moment is when its LAST leg closed, which only exists
    once every leg has. Until then it is still running its plan, so show the
    plan: a BTST plans to exit tomorrow, and if a stop-loss closes every leg
    today then "tomorrow" describes something that did not happen.

    Dates come from the deployment response (always there); times from the
    snapshot, then the legs, then the window recorded at activation.
  */
  const stored = getDeploymentWindow(deploymentId);

  const entered = legs.filter((l) => l.entry_date || l.entry_time);
  const allExited = legs.length > 0 && legs.every((l) => l.exit_date || l.exit_time);

  // Earliest fill: the moment the deployment actually began trading.
  const firstEntry = entered
    .slice()
    .sort((a, b) => `${a.entry_date} ${a.entry_time}`.localeCompare(`${b.entry_date} ${b.entry_time}`))[0];

  // Latest close: only meaningful once every leg is out.
  const lastExit = allExited
    ? legs.slice().sort((a, b) => `${b.exit_date} ${b.exit_time}`.localeCompare(`${a.exit_date} ${a.exit_time}`))[0]
    : null;

  const entryStamp = firstEntry
    ? windowStamp(firstEntry.entry_date, firstEntry.entry_time)
    : windowStamp(view.trade_date, view.entry_time ?? stored?.entryTime);

  const exitStamp = lastExit
    ? windowStamp(lastExit.exit_date, lastExit.exit_time)
    : windowStamp(view.exit_date, view.exit_time ?? stored?.exitTime);

  const name = view.strategy_name || strategyName || 'Strategy';

  /**
   * The leg blocks, preferring what the backend reports and falling back to
   * what the execution dialog saved this session -- so the configuration is
   * visible as soon as it is set, before a deployment exists to fetch.
   *
   * The dialog holds legs as an ARRAY in its own camelCase shape; toApiLeg is
   * the same converter the save request uses, so what is shown here and what
   * was sent cannot drift apart.
   */
  const settingsLegs = detail?.settings?.legs
    || (localSettings?.legs || []).reduce((acc, leg, i) => {
      acc[String(i + 1)] = toApiLeg(leg);
      return acc;
    }, {});

  return (
    <div className="px-6 py-5">
      {/* The saved strategy in the real builder, locked -- the same popup the
          deploy screen's eye icon opens, so the two can never disagree. */}
      {graphOpen && (
        <Suspense fallback={null}>
          <MtmGraphDialog brokerName={view.broker || brokerName}
                          deploymentId={deploymentId}
                          onClose={() => setGraphOpen(false)} />
        </Suspense>
      )}
      {viewStrategy && (
        <Suspense fallback={null}>
          <StrategyReadOnly
            strategy={{
              id: view.strategy_id ?? strategyId,
              name: view.strategy_name ?? strategyName,
              version: view.version ?? null,
            }}
            onClose={() => setViewStrategy(false)}
          />
        </Suspense>
      )}

      <p className="text-[12px]" style={{ color: MUTED }}>
        <button type="button" onClick={onBack} className="hover:underline">Algo Trade</button>
        {'  ›  '}{name}
      </p>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <button type="button" onClick={onBack} title="Back" style={{ color: INK }}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[20px] font-medium" style={{ color: INK }}>{name}</h1>
        <button type="button"
                onClick={() => setViewStrategy(true)}
                className="inline-flex items-center gap-1.5 h-[27px] px-2.5 rounded border text-[12px] bg-white"
                style={{ borderColor: BORDER, color: INK }}>
          <Eye size={14} /> View Strategy
        </button>
      </div>

      {/* Secondary actions. Design only for now -- none is wired. */}
      <div className="flex items-center gap-2.5 mt-3 flex-wrap">
        <button type="button" onClick={() => setGraphOpen(true)}
                className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded border text-[11px] bg-white"
                style={{ borderColor: BORDER, color: BLUE }}>
          Today&apos;s MTM Graph
        </button>
      </div>

      {loadError && (
        <p className="mt-4 text-[13px]" style={{ color: DANGER }}>{loadError}</p>
      )}

      {/* Status strip */}
      {/*
        PACKED LEFT on ONE uniform gap -- `auto-cols-max` sizes each column to
        its own content and `gap-x-10` puts the same space between every pair.

        It used to be `repeat(auto-fit, minmax(135px, 1fr))`, which stretched
        seven stats across the FULL page width: the gaps were enormous and
        grew with the window, so Status and Open Position read as unrelated.
        Equal fractions give equal gaps only when the contents are equal
        widths, which labels never are.

        The first column starts at the container edge, which is what puts
        "Status" directly under the Today's MTM Graph button and in line with
        the legs table's Instrument header.
      */}
      <div className="mt-5 pb-4 border-b grid grid-flow-col auto-cols-max gap-x-10 gap-y-5 overflow-x-auto"
           style={{ borderColor: RULE }}>
        <Stat label="Status">
          {/* The SAME chip the board draws, from the same table -- blue for
              squared off / completed / cancelled, green running, amber
              paused, red error. It was green-or-grey here, so a deployment
              that read COMPLETED in blue on the board read grey on its own
              detail page. */}
          <span className="inline-flex items-center h-[21px] px-2 rounded text-[11px] font-medium"
                style={toneFor(view.status)}>
            {labelFor(view.status)}
          </span>
        </Stat>
        <Stat label="Open Position">{view.open_position ?? legs.filter((l) => l.status === 'open').length}</Stat>
        <Stat label="Broker">
          <span className="inline-flex items-center gap-1.5">
            <Funnel size={13} style={{ color: GREEN }} />{view.broker || brokerName || '--'}
          </span>
        </Stat>
        <Stat label="Include Brokerage">
          <span className="inline-flex items-center gap-2">
            <Toggle on={brokerage} onClick={() => setBrokerage((b) => !b)} />
            <span style={{ color: MUTED }}>{brokerage ? money(view.brokerage) : '0'}</span>
          </span>
        </Stat>
        <Stat label="Taxes &amp; charges">
          <span className="inline-flex items-center gap-2">
            <Toggle on={taxes} onClick={() => setTaxes((t) => !t)} />
            <span style={{ color: MUTED }}>{taxes ? money(view.taxes) : money(0)}</span>
          </span>
        </Stat>
        <Stat label="Margin Blocked (approx)">{money(view.margin_blocked)}</Stat>
        <Stat label="MTM">
          <span className="text-[15px] font-medium" style={{ color: pnlColour(view.mtm) }}>
            {signedMoney(view.mtm)}
          </span>
        </Stat>
      </div>

      {/* Timestamps, with the running-only actions alongside */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Stamp label="Deployed:" value={deployedAt} />
          <Stamp label="Last Unpaused:" value={lastUnpausedAt} />
          <Stamp label="Entry Time:" value={entryStamp} />
          <Stamp label="Exit Time:" value={exitStamp} />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {running && (
            <>
              <button type="button" onClick={onPause} {...fillOnHover}
                      className="h-[34px] px-4 rounded border text-[13px] font-medium bg-white whitespace-nowrap transition-colors"
                      style={{ borderColor: BORDER, color: DEEP }}>
                Switch to manual
              </button>
              <button type="button" onClick={onSquareOff} {...fillOnHover}
                      className="h-[34px] px-4 rounded border text-[13px] font-medium bg-white whitespace-nowrap transition-colors"
                      style={{ borderColor: BORDER, color: DEEP }}>
                Square Off
              </button>
            </>
          )}
          {/* Always available, running or finished: a closed deployment is
              exactly when someone wants the trades out of the screen. Exports
              the legs below, with the columns they can see. */}
          <button type="button"
                  onClick={() => downloadLegCsv(legs, name)}
                  disabled={legs.length === 0}
                  title={legs.length === 0 ? 'No legs to export yet' : `Download ${name}.csv`}
                  className="inline-flex items-center gap-1.5 h-[34px] px-4 rounded text-[13px] font-semibold text-white whitespace-nowrap transition-colors disabled:opacity-50"
                  style={{ backgroundColor: DEEP }}
                  onMouseEnter={(e) => {
                    if (legs.length) e.currentTarget.style.backgroundColor = ACTIVATE_HOVER;
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = DEEP; }}>
            <Download size={14} /> Download
          </button>
        </div>
      </div>

      {/* Both tables can be on screen at once -- a half-exited strategy has
          legs in each. The Running one is always drawn so its empty state
          shows when nothing has traded yet. */}
      {(openLegs.length > 0 || closedLegs.length === 0) && (
        <TradeLegsTable legs={openLegs} running strategyName={name} />
      )}
      {closedLegs.length > 0 && (
        <TradeLegsTable legs={closedLegs} running={false} strategyName={name} />
      )}

      {/* Neither open nor closed: never entered, or not a position yet. Shown
          with the reason the server gave rather than hidden, so a skipped or
          errored leg is accounted for instead of silently missing. */}
      {pendingLegs.length > 0 && (
        <section className="mt-8">
          <h3 className="text-[17px]" style={{ color: INK }}>Pending &amp; Skipped Legs</h3>
          <div className="mt-3 rounded border" style={{ borderColor: RULE }}>
            {pendingLegs.map((leg, i) => (
              <div key={`${leg.leg_number}-${leg.attempt ?? 0}-${i}`}
                   className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b last:border-b-0 text-[13px]"
                   style={{ borderColor: RULE, color: INK }}>
                <span className="font-medium">
                  Leg {leg.leg_number}
                  {leg.attempt > 1 ? ` · attempt ${leg.attempt}` : ''}
                </span>
                <span>{leg.symbol || '--'}</span>
                <span className="uppercase text-[11px] px-2 h-[20px] inline-flex items-center rounded"
                      style={toneFor(legStatus(leg))}>
                  {legStatus(leg)}
                </span>
                <span style={{ color: MUTED }}>
                  {leg.error || leg.exit_reason || leg.status_reason || ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Messages */}
      <section className="mt-8">
        <h3 className="text-[17px]" style={{ color: INK }}>Messages Window</h3>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {MESSAGE_TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setMsgTab(tab)}
                    className="h-[27px] px-3 rounded-full border text-[12px]"
                    style={msgTab === tab
                      ? { borderColor: BLUE, color: BLUE, backgroundColor: '#ECF6FF' }
                      : { borderColor: BORDER, color: INK, backgroundColor: '#FFFFFF' }}>
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-x-auto">
          <div style={{ minWidth: 640 }}>
            <div className="grid px-4 py-2.5 text-[12px] rounded-t"
                 style={{ gridTemplateColumns: '230px 1fr', backgroundColor: HEAD_BG, color: MUTED }}>
              <span>Time</span><span>Message</span>
            </div>
            {messages.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-center" style={{ color: MUTED }}>No messages</p>
            ) : messages.map((m, i) => {
              const level = String(m.level || 'info').toLowerCase();
              return (
                <div key={`${m.created_at || i}-${i}`} className="grid px-4 py-2.5 text-[13px] border-b"
                     style={{ gridTemplateColumns: '230px 1fr', borderColor: RULE, color: INK }}>
                  {/* NO level chip. The reference writes the timestamp plain,
                      and a chip of varying width (INFO / WARN / ERROR) pushed
                      every time to a different x, so the column never lined
                      up. The level still reads at a glance -- it colours the
                      message text itself, which is where the words are. */}
                  <span className="tabular-nums" style={{ color: MUTED }}>
                    {messageStamp(m.created_at) || '--'}
                  </span>
                  <span style={{ color: LEVEL_COLOURS[level] || INK }}>{m.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Execution settings, read-only */}
      <section className="mt-8 pb-10">
        <h3 className="text-[17px]" style={{ color: INK }}>Execution Settings</h3>
        {/* Disabled throughout: this is a record of how the deployment ran, not
            a form. Every control is inert and styled to read that way. */}
        {/* Three columns, as the reference lays them out: NRML/MIS, Tgt/SL Ref
            Price and Delay entry by stack down the first; Entry and Exit Order
            Type each take a column of their own, aligned with the first row.
            The old single auto-fit grid ran all five across one line, which
            matched nothing. */}
        <div className="mt-5 flex flex-col gap-8">
          {Object.entries(settingsLegs).map(([num, leg]) => (
            <div key={num}>
              <p className="text-[14px] font-medium mb-3" style={{ color: INK }}>Leg {num}</p>
              <div className="grid gap-x-10 gap-y-3.5"
                   style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                <ConfigField label="NRML/MIS" value={leg.product} />
                <ConfigField label="Entry Order Type" value={leg.entry_order_type} />
                <ConfigField label="Exit Order Type" value={leg.exit_order_type} />

                {/* col-start-1 rather than empty spacer cells: these two drop
                    to the first column of the next rows at ANY column count,
                    so a narrower pane that fits only one or two tracks still
                    lays out correctly instead of pulling spacers into view. */}
                <ConfigField className="col-start-1" label="Tgt/SL Ref Price" hint
                             value={leg.tgt_sl_ref_price} />
                <ConfigField className="col-start-1" label="Delay entry by" hint
                             value={leg.delay_entry_sec ?? 0} suffix="sec" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ViewTrades;
