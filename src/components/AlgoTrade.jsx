import { memo, useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Bell, History as HistoryIcon, ChevronDown, ArrowRight, Pencil, X, Funnel,
} from 'lucide-react';
import {
  INK, MUTED, BORDER, RULE, BLUE, NAVY, DEEP, THEME, DANGER, CARD_BLUE, CARD_EDGE,
  GREEN, PILL, ACTIVATE_HOVER, fillOnHover,
} from './algotrade/palette';
import Activation from './algotrade/Activation';
import BrokerageRate from './algotrade/BrokerageRate';
import MarginPopover from './algotrade/MarginPopover';
import TaxBreakdown from './algotrade/TaxBreakdown';
import DeployedFilters from './algotrade/DeployedFilters';
import MarketCountdown from './algotrade/MarketCountdown';
import MtmGraphDialog from './algotrade/MtmGraphDialog';
import Toggle from './algotrade/Toggle';
import DeployedRow, { DeployedHeader, DeployedOn } from './algotrade/DeployedRow';
import { useLiveSnapshot } from '../services/liveSnapshot';
import { isMarketOpen, istToday, brokerCutoffPassed } from './algotrade/marketClock';
import { getRestartTimes, setRestartTimes } from './algotrade/restartSchedule';
import {
  getBrokerAccountId, isBrokerLoggedIn, squareOffDeployment, squareOffAll,
  switchToManual, switchAllToManual, archiveDeployment, unarchiveDeployment,
  cancelDeployment, cancelAll, restartDeployment, resumeDeployment, restartAll,
  isBrokerLoggedIn as brokerLoggedIn,
  fetchOverview, fetchDeploymentsByDate, fromApiSettings, getBrokerNames,
  brokerEntryLive,
  // Kept imported for the disabled funds call below -- uncommenting that is
  // then a one-line change rather than hunting the import back down.
  // eslint-disable-next-line no-unused-vars
  fetchBrokerFunds,
} from '../services/liveTradingApi';

const BrokerSetup = lazy(() => import('./algotrade/BrokerSetup'));
const ViewTrades = lazy(() => import('./algotrade/ViewTrades'));
const History = lazy(() => import('./algotrade/History'));
const DeployPortfolio = lazy(() => import('./algotrade/DeployPortfolio'));
const RestartDialog = lazy(() => import('./algotrade/RestartDialog'));
const StrategyEditDialog = lazy(() => import('./algotrade/StrategyEditDialog'));
const RestartAllDialog = lazy(() => import('./algotrade/RestartAllDialog'));
const SetupBrokerDialog = lazy(() => import('./algotrade/SetupBrokerDialog'));

const AutoActivationDrawer = ({ onClose }) => {
  // Escape closes it; the listener exists only while the drawer is open.
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} role="presentation" />
      <aside className="relative h-full w-full max-w-[620px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-7 py-5">
          <h3 className="text-[18px] font-semibold" style={{ color: INK }}>Auto Activation</h3>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-start pt-24 px-8 text-center">
          <Bell size={34} style={{ color: BLUE }} fill={BLUE} />
          <p className="mt-5 text-[20px] font-semibold" style={{ color: INK }}>No Notifications Yet</p>
          <p className="mt-2 text-[14px]" style={{ color: MUTED }}>
            There are no new notification for auto activation.
          </p>
        </div>
      </aside>
    </div>
  );
};

/**
 * Total MTM and every broker card share ONE size.
 *
 * `items-stretch` equalises their height only while they sit on a single line,
 * and the broker card carries an extra "+ Add SL/Tgt" line the total does not
 * -- so a fixed width and min-height is what actually makes the two identical,
 * at any wrap point.
 */
const MTM_CARD = 'rounded-md border overflow-hidden w-[184px] min-h-[132px] flex flex-col';

/** "₹ -1,234" / "₹ 0" -- Indian grouping, matching the rest of the screen. */
const rupees = (n) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** "2026-10-06" -> "06 OCT 26", the group header's format in the reference.
 *  Split by hand rather than parsed as a Date: the string is already the
 *  trading day, and letting a timezone shift it could label it the day before. */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dayLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}` : String(iso ?? '');
};

const DeployedTable = ({ groups, onSquareOff, onManual, onArchive, onUnarchive,
  onCancel, onRestart, onResume, resumingId, onViewTrades, restartedIds, cancelledIds, isStaleDay, restartTimes }) => (
  <div className="mt-5 overflow-x-auto algo-table-wide">
    <div className="min-w-[1340px]">
      <DeployedHeader />
      {groups.map(([day, dayRows]) => (
        <div key={day}>
          <DeployedOn date={dayLabel(day)} />
          <div className="flex flex-col gap-2.5">
            {dayRows.map((row) => (
              <DeployedRow key={row.key} name={row.name} symbol={row.symbol}
                           broker={row.broker} mtm={row.mtm} live={row.live}
                           onSquareOff={() => onSquareOff(row)}
                           onSwitchManual={() => onManual(row)}
                           onArchive={() => onArchive(row)}
                           onUnarchive={() => onUnarchive(row)}
                           onCancel={() => onCancel(row)}
                           onRestart={() => onRestart(row)}
                           onResume={() => onResume(row)}
                           resuming={resumingId === String(row.deploymentId)}
                           restarted={restartedIds?.has(String(row.deploymentId))
                             || Boolean(restartTimes?.[String(row.deploymentId)])}
                           cancelled={cancelledIds?.has(String(row.deploymentId))}
                           restartAt={restartTimes?.[String(row.deploymentId)]}
                           staleDay={isStaleDay?.(row)}
                           onViewTrades={() => onViewTrades(row)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const AlgoTrade = ({ initialView = 'main', onNotify, onEditPortfolio }) => {
  // Which screen this tab shows: the board, the broker list, or the Pro view.
  // `initialView` lets the top bar's Broker Setup land straight on the broker
  // screen — App remounts this component (keyed) whenever that entry changes,
  // so the initializer is enough and no effect has to watch the prop.
  const [view, setView] = useState(initialView);

  const changeView = (next) => setView(next);

  // No reset needed on arrival: App renders this tab conditionally, so leaving
  // Algo Trade unmounts it and the next visit starts on the board.
  // The portfolio whose deploy screen is open, if any.
  const [deploying, setDeploying] = useState(null);
  // Which view the broker / deploy screens were opened FROM, so Back returns
  // there rather than always dropping onto the main board — the Pro view can
  // open both. Neither screen draws the Pro rail, and the app sidebar is
  // hidden while pro mode is on, so entering one from Pro leaves pro mode and
  // Back turns it on again.
  const [brokerReturn, setBrokerReturn] = useState('main');
  const openBroker = (from) => { setBrokerReturn(from); setDeploying(null); changeView('broker'); };

  const openDeploy = (portfolio) => setDeploying(portfolio);
  const closeDeploy = () => setDeploying(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brokerage, setBrokerage] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  // The rate lives HERE, not inside the card: the figure beside the pencil has
  // to show it after the card closes, and reopening must not reset it.
  const [rate, setRate] = useState('0');
  const [rateUnit, setRateUnit] = useState('per order');

  const [marginOpen, setMarginOpen] = useState(false);
  const [taxes, setTaxes] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  // Several statuses can be watched at once, so this is a set, not one choice.
  const [statuses, setStatuses] = useState(() => new Set());
  // Strategies activated this session. Design only -- resets on reload, since
  // nothing is deployed for real yet.
  const [deployed, setDeployed] = useState([]);
  // The deployment whose View Trades screen is open, or null for the list.
  const [tradesFor, setTradesFor] = useState(null);
  // Execution settings saved from the dialog, keyed by strategy id. Held here
  // rather than in Activation so View Trades can show the leg configuration
  // straight away, without waiting for a deployment to exist.
  const [execDays, setExecDays] = useState({});
  // Today's deployments and execution settings, as the server has them.
  const [overview, setOverview] = useState(null);
  // Archived deployments, fetched ONLY while the Show archived toggle is on --
  // they are a separate request and most sessions never ask for them.
  const [archivedRows, setArchivedRows] = useState([]);
  // Available margin and margin blocked, from the broker's own funds endpoint.
  // The setter is unused while that call is commented out, and kept so turning
  // it back on needs no other edit.
  // eslint-disable-next-line no-unused-vars
  const [funds, setFunds] = useState(null);
  // Declared HERE, beside the rows it gates, because the merge below reads it.
  // It used to be declared a hundred lines further down, past that merge --
  // a `const` is hoisted but not initialised, so reading it early threw
  // "Cannot access 'archived' before initialization" and the whole tab died.
  const [archived, setArchived] = useState(false);
  /**
   * Deployments restarted from this screen.
   *
   * SESSION STATE, deliberately: no restart endpoint exists yet, so there is
   * nothing on the server to read this back from. When the endpoint lands, the
   * deployment's own status replaces this entirely and the Set goes away.
   */
  const [restarted, setRestarted] = useState(() => new Set());
  // Deployments archived from this screen, so the card leaves at once rather
  // than on the next refetch.
  const [archivedIds, setArchivedIds] = useState(() => new Set());
  // The chips in force before Show archived was turned on, so turning it off
  // puts the user back where they were rather than on an empty selection.
  const statusesBeforeArchive = useRef(null);
  // { all, names, ids } while the confirm dialog is up, else null.
  const [restartAsk, setRestartAsk] = useState(null);
  // Whether the broker-grouped Restart All dialog is up.
  const [restartAllOpen, setRestartAllOpen] = useState(false);
  const [cancelled, setCancelled] = useState(() => new Set());
  const restartTimes = getRestartTimes();
  // Raised when Restart is pressed with no broker logged in.
  const [brokerWanted, setBrokerWanted] = useState(false);
  const stored = getBrokerNames();
  const brokerNames = stored;
  const notify = useRef(onNotify);
  useEffect(() => { notify.current = onNotify; });

  useEffect(() => {
    let alive = true;

    fetchOverview()
      .then((body) => {
        if (!alive) return;
        const data = body?.data || {};
        setOverview(data);
        const restored = {};
        (data.execution_settings || []).forEach((row) => {
          if (row?.strategy_id == null) return;
          restored[row.strategy_id] = fromApiSettings(row.settings || {});
        });
        // Anything saved during THIS session wins over the server's copy: the
        // user has just changed it and the response may predate that.
        setExecDays((was) => ({ ...restored, ...was }));
      })
      .catch((err) => notify.current?.(err.message, 'error'));

    return () => { alive = false; };
  }, []);

  /** Re-read the day's deployments after a command changes one of them. */
  const refreshOverview = () => fetchOverview()
    .then((body) => setOverview(body?.data || {}))
    .catch(() => {});

  /*
    The deployment whose Resume is in flight, so its own button can say so
    without disabling every other row's.

    DECLARED ABOVE handleResume, not with the other dialog state further down:
    a `const` is hoisted but not initialised, so the handler reading it from
    above its declaration is a TDZ error waiting for the first click.
  */
  const [resumingId, setResumingId] = useState(null);

  /**
   * Resume a deployment the worker reported as a RESUMABLE error.
   *
   * No body: the endpoint is shared with the scheduled restart, which is the
   * one that sends `{ restart_at }`. Sending that here would ask the server to
   * reschedule for tomorrow rather than retry now.
   *
   * The row is not touched afterwards -- refreshOverview re-reads the day and
   * the socket carries the new status, so the card follows the SERVER. A
   * retry that fails again comes back as error with a fresh reason and its
   * Resume button intact, which is what the backend specifies.
   */
  const handleResume = (id) => {
    if (id == null) {
      onNotify?.('No deployment to resume', 'error');
      return;
    }
    // Ignore a second click on a retry already in flight. The button is
    // disabled too; this is the guard that holds if anything else calls in.
    if (resumingId != null) return;

    setResumingId(String(id));
    resumeDeployment(id)
      .then((body) => {
        onNotify?.(body?.message || `Resumed (deployment ${body?.data?.deployment_id ?? id})`, 'success');
        refreshOverview();
      })
      .catch((err) => onNotify?.(err.message || 'The deployment could not be resumed.', 'error'))
      .finally(() => setResumingId(null));
  };

  const handleSquareOff = (id) => {
    if (id == null) {
      onNotify?.('No deployment to square off', 'error');
      return;
    }
    squareOffDeployment(id)
      .then((body) => {
        onNotify?.(`Squared off (deployment ${body?.data?.deployment_id ?? id})`, 'success');
        refreshOverview();
      })
      // The API's own words, so "Deployment is already squared_off" reads as
      // the plain fact it is. Anything it cannot explain means the worker is
      // unreachable, and nothing in this UI can close the position -- which has
      // to be said rather than shown as a generic failure.
      .catch((err) => onNotify?.(
        err.message || 'Could not reach the worker — square off at the broker terminal',
        'error',
      ));
  };

  const handleManual = (id) => {
    if (id == null) {
      onNotify?.('No deployment to switch', 'error');
      return;
    }
    switchToManual(id)
      .then(() => { onNotify?.('Switched to manual', 'success'); refreshOverview(); })
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  const handleManualAll = () => {
    switchAllToManual()
      .then((body) => {
        onNotify?.(body?.message || 'Switched all to manual', 'success');
        refreshOverview();
      })
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  /**
   * Cancel Deployment -> POST /deployments/{id}/cancel.
   *
   * Distinct from Archive: cancelling drops an overnight deployment that was
   * never restarted, archiving tidies a finished one away. A cancelled row
   * stays on the board reading CANCELLED with Archive beside it, so the user
   * can see what happened to it and then tidy it away deliberately -- the two
   * are separate decisions.
   */
  const markCancelled = (id) => setCancelled((was) => new Set(was).add(String(id)));

  const handleCancel = (id) => {
    if (id == null) return;
    cancelDeployment(id)
      .then((body) => {
        markCancelled(id);
        onNotify?.(body?.message || 'Deployment cancelled', 'success');
        refreshOverview();
      })
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  /**
   * POST /cancel-all and POST /restart-all answer with ONE ROW PER
   * DEPLOYMENT, not a single verdict:
   *
   *   data: [ { deployment_id, status, error }, ... ]
   *
   * so `status: true` on the envelope only means the request was understood.
   * This splits the rows into the ones that worked and the ones that did not,
   * and is shared by both handlers because both replies have this shape --
   * reading it twice is how one of them ends up trusting the envelope.
   */
  const splitOutcomes = (body, picked = []) => {
    const rowsOut = Array.isArray(body?.data) ? body.data : null;

    /*
      NO PER-ROW `data` -> EVERYTHING ASKED FOR SUCCEEDED.

      This used to return two empty lists, and the caller then showed no toast
      at all and marked nothing restarted -- so pressing Restart looked like a
      dead button while the server had in fact accepted the request. The reply
      shape simply varies: some endpoints answer with a row per deployment,
      others with a bare { status: true, message }.

      Treating it as success is not a guess: `send()` throws unless the body
      carries status === true, so reaching this point already means the server
      said yes.
    */
    if (!rowsOut) {
      return { ok: picked.map((p) => ({ deployment_id: p.id })), bad: [] };
    }
    return {
      ok: rowsOut.filter((r) => !r?.error),
      bad: rowsOut.filter((r) => r?.error),
    };
  };

  /**
   * One toast naming every deployment that was refused, and why.
   *
   * Names come from a REF, not from `allRows` directly: that list is built
   * further down this component, and closing over it here would be a
   * use-before-define -- which reads fine (these handlers only run later) right
   * up until someone calls one during render and gets a blank screen. The ref
   * is written after every commit, which is soon enough: nothing reads it
   * until the user acts.
   */
  const rowsRef = useRef([]);
  // Likewise for the paused rows Cancel All acts on.
  const awaitingRestartRef = useRef([]);

  const reportFailures = (bad) => {
    if (!bad.length) return;
    const nameOf = (id) => rowsRef.current.find((r) => String(r.deploymentId) === String(id))?.name
      || `#${id}`;
    onNotify?.(
      bad.map((r) => `${nameOf(r.deployment_id)}: ${r.error}`).join(' | '),
      'error',
    );
  };

  const handleCancelAll = () => {
    // The rows Cancel All acts on, so a reply with no per-row `data` can still
    // name what succeeded -- the same silent-no-op that affected Restart All.
    const targets = awaitingRestartRef.current.map((row) => ({ id: row.deploymentId }));
    cancelAll()
      .then((body) => {
        const { ok, bad } = splitOutcomes(body, targets);
        ok.forEach((r) => markCancelled(r.deployment_id));
        reportFailures(bad);
        if (ok.length) {
          onNotify?.(body?.message
            || `Cancelled ${ok.length} deployment${ok.length === 1 ? '' : 's'}`, 'success');
        }
        refreshOverview();
      })
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  const handleRestartAll = () => setRestartAllOpen(true);

  /**
   * Restart -> POST /deployments/{id}/resume  { restart_at }
   * Restart All -> POST /restart-all          { restarts: [...] }
   *
   * `schedule` is [{ id, time }] -- one entry per deployment, because Restart
   * All lets every row carry its own time.
   *
   * The time is also written down locally: the board counts the MTM cell down
   * to it, and the next snapshot will not necessarily carry it back.
   */
  const markRestarted = (schedule = []) => {
    if (!schedule.length) return;
    setRestartTimes(schedule);
    setRestarted((was) => {
      const next = new Set(was);
      schedule.forEach(({ id }) => next.add(String(id)));
      return next;
    });
  };

  /** The single dialog: one deployment, one time. */
  const confirmRestart = (time) => {
    const { ids = [] } = restartAsk || {};
    setRestartAsk(null);
    const id = ids[0];
    if (id == null) return;

    restartDeployment(id, time)
      .then((body) => {
        markRestarted([{ id, time }]);
        onNotify?.(body?.message || `Restart scheduled at ${time}`, 'success');
        refreshOverview();
      })
      // A refused restart leaves the row PAUSED with its Restart button, which
      // is the truth: nothing was scheduled.
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  /**
   * Restart All: one broker's checked rows, each with its own time.
   *
   * PARTIAL SUCCESS IS THE NORMAL CASE. The reply carries a row per
   * deployment, and one of them failing (a time outside the server's window,
   * say) must not mark the others restarted or leave this one claiming to be.
   * So only rows with `error: null` flip, and the rest stay paused and are
   * named in a red toast.
   */
  const confirmRestartAll = (_group, picks = []) => {
    setRestartAllOpen(false);
    if (!picks.length) return;

    const restarts = picks.map(({ id, time }) => ({ deployment_id: id, restart_at: time }));
    restartAll(restarts)
      .then((body) => {
        const { ok, bad } = splitOutcomes(body, picks);
        const okIds = new Set(ok.map((r) => String(r.deployment_id)));
        markRestarted(picks.filter((p) => okIds.has(String(p.id))));
        reportFailures(bad);
        if (ok.length) {
          onNotify?.(body?.message
            || `Restart scheduled for ${ok.length} deployment${ok.length === 1 ? '' : 's'}`, 'success');
        }
        refreshOverview();
      })
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  /**
   * Restart needs a broker, exactly as Activate does -- so with none logged in
   * it raises the same Setup Broker prompt rather than failing at the API.
   */
  const askRestart = (payload) => {
    if (getBrokerAccountId() == null || !brokerLoggedIn()) {
      setBrokerWanted(true);
      return;
    }
    setRestartAsk(payload);
  };

  const handleArchive = (id) => {
    if (id == null) return;
    archiveDeployment(id)
      .then((body) => {
        onNotify?.(body?.message || 'Archived successfully', 'success');
        setArchivedIds((was) => new Set(was).add(String(id)));
        refreshOverview();
        setArchivedRows((was) => was.filter((d) => String(d.deployment_id) !== String(id)));
      })
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  const handleUnarchive = (id) => {
    if (id == null) return;
    unarchiveDeployment(id)
      .then((body) => {
        onNotify?.(body?.message || 'Unarchived successfully', 'success');
        // Back among the live rows, under whatever status it holds.
        setArchivedIds((was) => {
          const next = new Set(was);
          next.delete(String(id));
          return next;
        });
        // Gone from the archived list the moment it comes back -- the user
        // asked for it NOT to stay on screen after unarchiving.
        setArchivedRows((was) => was.filter((d) => String(d.deployment_id) !== String(id)));
        refreshOverview();
      })
      .catch((err) => onNotify?.(err.message, 'error'));
  };

  const handleSquareOffAll = () => {
    squareOffAll()
      .then((body) => {
        // The kill switch reports what it actually closed. An empty list is a
        // success with nothing to do, and saying "requested" there would read
        // as though positions had just been closed when none were open.
        const closed = body?.data?.data;
        const count = Array.isArray(closed) ? closed.length : 0;
        onNotify?.(
          count === 0
            ? 'Nothing to square off — no running deployments'
            : `Squared off ${count} deployment${count === 1 ? '' : 's'}`,
          'success',
        );
        refreshOverview();
      })
      .catch((err) => onNotify?.(
        err.message || 'Could not reach the worker — square off at the broker terminal',
        'error',
      ));
  };
  // Live figures. Every value below comes straight from the latest snapshot --
  // nothing is computed here, as the server is the single source of truth.
  const { snapshot } = useLiveSnapshot();
  const liveDeployments = snapshot?.deployments || [];
  const byId = new Map();
  deployed.forEach((d) => {
    if (d.deploymentId == null) return;
    byId.set(String(d.deploymentId), {
      deployment_id: d.deploymentId,
      strategy_id: d.strategyId,
      strategy_name: d.name,
      broker_account_id: getBrokerAccountId(),
      status: 'running',
    });
  });

  (overview?.deployments || []).forEach((d) => {
    const key = String(d.deployment_id);
    byId.set(key, { ...(byId.get(key) || {}), ...d });
  });

  // Only present while Show archived is on, and fetched by the effect below.
  if (archived) {
    archivedRows.filter((d) => d.is_archived).forEach((d) => {
      const key = String(d.deployment_id);
      byId.set(key, { ...(byId.get(key) || {}), ...d });
    });
  }

  liveDeployments.forEach((d) => {
    const key = String(d.deployment_id);
    byId.set(key, { ...(byId.get(key) || {}), ...d });
  });

  /**
   * Archive is applied ONCE, to the finished list.
   *
   * It used to filter the overview source only -- and the snapshot, which runs
   * last and carries no `is_archived` at all, simply put the row back. So
   * archiving a deployment the worker was still broadcasting made the card
   * vanish and reappear a second later. Filtering the merged result closes
   * that, whichever source the row came from.
   *
   * `archivedIds` is what this browser has just archived: the row leaves the
   * instant the request succeeds, rather than waiting for the refetch, and the
   * flag from the server takes over once it arrives.
   */
  const isArchivedRow = (d) => Boolean(d.is_archived) || archivedIds.has(String(d.deployment_id));
  const merged = [...byId.values()]
    .filter((d) => (archived ? isArchivedRow(d) : !isArchivedRow(d)));
  const totalOpenPositions = merged.reduce(
    (sum, d) => sum + (d.legs || []).filter((l) => l.status === 'open').length,
    0,
  );
  const STATUS_FILTERS = {
    Running: ['running'],
    Paused: ['paused'],
    'Sq Off': ['squared_off', 'sq_off', 'completed'],
    Error: ['error', 'failed'],
    Manual: ['manual'],
  };

  const toRow = (d) => ({
    key: String(d.deployment_id),
    name: d.strategy_name,
    symbol: d.strategy_type ? d.strategy_type.toUpperCase() : 'SENSEX',
    strategyId: d.strategy_id,
    deploymentId: d.deployment_id,
    broker: brokerNames[String(d.broker_account_id)]?.name || '--',
    // The snapshot's live mark-to-market when there is one; a finished
    // deployment has only its booked figure left to show.
    mtm: rupees(d.mtm ?? d.realised_pnl),
    tradeDate: d.trade_date || null,
    live: d,
  });

  const allRows = merged.map(toRow);
  const statusOf = (row) => String(row.live?.status || '').toLowerCase();
  const rowsWithStatus = (keys) => allRows.filter((row) => keys.includes(statusOf(row)));
  const wanted = statuses.size === 0
    ? null
    : [...statuses].flatMap((name) => STATUS_FILTERS[name] || []);

  const rows = wanted === null ? allRows : rowsWithStatus(wanted);
  const today = istToday();
  const groupByDay = (list) => [...list.reduce((map, row) => {
    const day = row.tradeDate || today;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(row);
    return map;
  }, new Map())].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const grouped = groupByDay(rows);
  const marketOpen = isMarketOpen();
  const todayIso = istToday();

  const isStale = (row) => Boolean(row.tradeDate) && row.tradeDate < todayIso;
  const pausedRows = allRows.filter((row) => statusOf(row) === 'paused' && isStale(row));
  const awaitingRestart = pausedRows.filter((row) => {
    const id = String(row.deploymentId);
    // `restartTimes[id]` is the half that survives a refresh -- see its note.
    return !restarted.has(id) && !restartTimes[id] && !cancelled.has(id);
  });

  /*
    Kept current for the handlers ABOVE, which need these lists but are
    declared before them. Written in an effect, not inline: a ref assigned
    during render is a render side effect, and React makes no promise about
    when it lands.
  */
  useEffect(() => {
    rowsRef.current = allRows;
    awaitingRestartRef.current = awaitingRestart;
  });

  /**
   * Which pair of header buttons to show.
   *
   *   market open                  -> Switch all to manual · Square off all
   *   anything awaiting a restart  -> Cancel All · Restart All
   *   restarted, market still shut -> Cancel All
   *
   * Restart All disappears the moment nothing is left to restart, which is
   * exactly when it would do nothing.
   */
  // Restart All stands while ANY row still needs restarting. Restart five of
  // nine and the four left are exactly what the button is for; it goes away
  // only once none are left -- or once the market opens, which the first arm
  // covers, after which a row nobody restarted keeps its OWN Restart button.
  const headerMode = marketOpen ? 'live'
    : awaitingRestart.length > 0 ? 'restartable' : 'live';

  /**
   * The Restart All dialog's list: everything still awaiting a restart,
   * grouped by the broker it runs on. Built from the SAME `awaitingRestart`
   * the header button is derived from, so the dialog can never offer a row
   * the board no longer thinks needs one.
   */
  const restartGroups = [...awaitingRestart.reduce((map, row) => {
    const id = String(row.live?.broker_account_id ?? 'unknown');
    if (!map.has(id)) {
      map.set(id, {
        brokerId: id,
        brokerName: row.broker,
        live: Boolean(brokerNames[id]?.live),
        rows: [],
      });
    }
    map.get(id).rows.push({
      id: row.deploymentId,
      name: row.name,
      legs: (row.live?.legs || []).length || null,
    });
    return map;
  }, new Map()).values()];

  const availableMargin = funds?.available_margin ?? funds?.available ?? funds?.net ?? 0;
  const marginBlocked = funds?.margin_blocked ?? funds?.utilised ?? funds?.used ?? 0;

  const cachedBrokerIds = Object.keys(brokerNames);
  const activeBrokerId = String(getBrokerAccountId() ?? '');

  /**
   * WHICH BROKERS ARE ACTUALLY USABLE -- computed ONCE, read by all three
   * things that care: the "Broker Login n/n" counter, the broker cards, and
   * the "Please login the broker" warning.
   *
   * They each used to test it their own way. The warning checked the stored
   * `expiresAt`; the counter and the cards read the bare `live` flag. So
   * after 08:30, with last night's session expired, the page said "Please
   * login the broker" and "Broker Login 1/1" at the same time, and drew a
   * card for a connection that could not place an order.
   *
   * `brokerEntryLive` is the single test -- logged in AND not past the
   * server's own expiry. One answer, so the three cannot disagree again.
   */
  const liveBrokerIds = cachedBrokerIds.filter((id) => brokerEntryLive(brokerNames[id]));
  const activeBroker = liveBrokerIds.includes(activeBrokerId)
    ? brokerNames[activeBrokerId]
    : null;
  const brokerCard = (name, value) => ({ name, value, mtm: rupees(value) });

  const brokerCards = activeBroker
    ? [brokerCard(activeBroker.name, merged
      .filter((d) => String(d.broker_account_id) === activeBrokerId)
      .reduce((sum, d) => sum + Number(d.mtm ?? d.realised_pnl ?? 0), 0))]
    // Before Broker Setup has ever been opened there is no cache to read, so
    // the stored id and flag are all there is to go on.
    : (getBrokerAccountId() != null && isBrokerLoggedIn() && !activeBroker
      ? [brokerCard('Symphony (Open XTS)',
        liveDeployments.reduce((sum, d) => sum + Number(d.mtm || 0), 0))]
      : []);

  const brokerWarning = brokerCutoffPassed() && liveBrokerIds.length === 0;

  const loggedInCount = cachedBrokerIds.length > 0
    ? `${liveBrokerIds.length}/${cachedBrokerIds.length}`
    : `${getBrokerAccountId() != null && isBrokerLoggedIn() && !brokerCutoffPassed() ? 1 : 0}/1`;
  const [graphOpen, setGraphOpen] = useState(false);

  /**
   * Show archived -> GET /live/deployments?trade_date=...&include_archived=true.
   *
   * One request per switch-on, and nothing at all while the toggle is off --
   * the archived list is the long tail nobody looks at most days. Turning it
   * off drops the rows rather than keeping them in memory.
   */
  useEffect(() => {
    if (!archived) return undefined;
    let alive = true;
    fetchDeploymentsByDate(istToday(), { includeArchived: true })
      .then((body) => { if (alive) setArchivedRows(Array.isArray(body?.data) ? body.data : []); })
      .catch((err) => { if (alive) notify.current?.(err.message, 'error'); });
    return () => { alive = false; };
  }, [archived]);

  const toggleStatus = (name) => setStatuses((was) => {
    const next = new Set(was);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const [editStrategy, setEditStrategy] = useState(null);
  // Bumped after a successful edit so the Activation list refetches and its
  // rows carry the new version.
  const [strategiesReloadKey, setStrategiesReloadKey] = useState(0);
  const handleEdit = (row) => setEditStrategy({ id: row.id, name: row.name, version: row.version });

  const fallback = <p className="px-6 py-8 text-[13px]" style={{ color: MUTED }}>Loading…</p>;

  if (deploying) {
    return (
      <Suspense fallback={fallback}>
        <DeployPortfolio
          portfolio={deploying}
          startInAuto={deploying.autoMode}
          onBack={closeDeploy}
          onEditPortfolio={onEditPortfolio}
          onSetupBroker={() => openBroker('main')}
          onNotify={onNotify}
        />
      </Suspense>
    );
  }
  if (view === 'broker') {
    return <Suspense fallback={fallback}><BrokerSetup onBack={() => changeView(brokerReturn)} onNotify={onNotify} /></Suspense>;
  }

  if (tradesFor) {
    return (
      <Suspense fallback={fallback}>
        <ViewTrades
          localSettings={execDays[tradesFor.strategyId]}
          deploymentId={tradesFor.deploymentId}
          strategyId={tradesFor.strategyId}
          strategyName={tradesFor.name}
          brokerName={tradesFor.broker}
          onBack={() => setTradesFor(null)}
          onPause={() => handleManual(tradesFor.deploymentId)}
          onSquareOff={() => handleSquareOff(tradesFor.deploymentId)}
        />
      </Suspense>
    );
  }
  if (view === 'history') {
    return (
      <Suspense fallback={fallback}>
        <History onBack={() => changeView('main')} onNotify={onNotify} />
      </Suspense>
    );
  }
  return (
    <div className="-mx-4 sm:-mx-5 -mt-6 pb-5" style={{ color: INK }}>
      {drawerOpen && <AutoActivationDrawer onClose={() => setDrawerOpen(false)} />}
      {brokerWanted && (
        <Suspense fallback={null}>
          <SetupBrokerDialog onClose={() => setBrokerWanted(false)}
                             onSetup={() => { setBrokerWanted(false); openBroker('main'); }} />
        </Suspense>
      )}
      {restartAsk && (
        <Suspense fallback={null}>
          <RestartDialog brokerName={restartAsk.brokerName || brokerCards[0]?.name || 'Broker'}
                         brokerLive={restartAsk.brokerLive ?? Boolean(brokerCards.length)}
                         onClose={() => setRestartAsk(null)}
                         onConfirm={confirmRestart} />
        </Suspense>
      )}
      {restartAllOpen && (
        <Suspense fallback={null}>
          <RestartAllDialog groups={restartGroups}
                            onClose={() => setRestartAllOpen(false)}
                            onSubmit={confirmRestartAll} />
        </Suspense>
      )}
      {graphOpen && (
        <MtmGraphDialog brokerName={graphOpen === true ? null : graphOpen}
                        onClose={() => setGraphOpen(false)} />
      )}
      {editStrategy && (
        <Suspense fallback={null}>
          <StrategyEditDialog
            strategy={editStrategy}
            onClose={() => setEditStrategy(null)}
            onNotify={onNotify}
            /* The row's version moves on after an update, so the next open of
               this popup -- and the read it makes -- asks for the new one. */
            onUpdated={() => setStrategiesReloadKey((n) => n + 1)}
          />
        </Suspense>
      )}

      <div className="px-7 pt-[16px] pb-2 border-b" style={{ borderColor: BORDER }}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-[20px] leading-8 font-medium" style={{ color: INK }}>Algo Trade</h1>

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className={PILL} style={{ borderColor: BORDER, color: NAVY }}
                  onClick={() => setDrawerOpen(true)}>
            <Bell size={14} />
            Auto Activation
          </button>

          <span className={PILL} style={{ borderColor: BORDER, color: INK }}>
            <Toggle as="span" />
            Auto restart paused executions
          </span>

          {/* One control, three cells, divided — as on the reference screen. */}
          <span
            className="inline-flex items-center h-[27px] rounded-md border text-[12px] whitespace-nowrap bg-white divide-x"
            style={{ borderColor: BORDER, color: NAVY }}
          >
            <button type="button" onClick={() => changeView('history')}
                    className="inline-flex items-center gap-2 px-3 h-full hover:underline underline-offset-4" style={{ borderColor: BORDER }}>
              <HistoryIcon size={14} />
              History
            </button>
            <button type="button" onClick={() => openBroker('main')}
                    className="inline-flex items-center px-3 h-full hover:underline underline-offset-4" style={{ borderColor: BORDER }}>
              Broker Login {loggedInCount}
            </button>
          </span>
          {/* No Help Center, no Get Plan — removed outright. This group sits at
              the row's right edge, so the remaining controls end at the corner
              in their original order with no hole left behind. */}
        </div>
      </div>
      </div>

      {/*
        BROKER NOT LOGGED IN, and the market is close enough that it matters.

        Sits directly under the top bar, full width, because by 08:30 an
        un-logged-in broker is the one thing that will stop every activation
        and every restart that day -- and the only other sign of it is a
        button in the corner reading "Broker Login 0/1". It disappears the
        moment a broker is live.
      */}
      {brokerWarning && (
        <div className="px-7 pt-3">
          <p className="text-[13px] font-medium px-3 py-2 rounded"
             style={{ color: DANGER, backgroundColor: '#FBF3F3' }}>
            Please login the broker
          </p>
        </div>
      )}

      <div className="px-7">
      {/* ── MTM card + account figures ──────────────────────────────────── */}
      <div className="mt-6 flex items-start justify-between gap-8 flex-wrap">
        {/* Total MTM, then one card per connected broker -- the reference
            shows all three side by side. The per-broker cards are white with a
            soft border where the total is blue-tinted, and carry the broker's
            name and an "Add SL/Tgt" link the total does not have.
            DESIGN ONLY: the figures are placeholders and Add SL/Tgt is inert. */}
        <div className="flex items-stretch gap-4 flex-wrap">
          <div className={MTM_CARD} style={{ borderColor: CARD_EDGE }}>
            <div className="px-4 pt-4 pb-6 flex-1" style={{ backgroundColor: CARD_BLUE }}>
              <p className="text-[12px] font-medium" style={{ color: INK }}>Total MTM</p>
              <p className="text-[16px] font-semibold mt-1"
                 style={{ color: (snapshot?.total_mtm ?? 0) < 0 ? DANGER : GREEN }}>
                {rupees(snapshot?.total_mtm)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGraphOpen(true)}
              className="w-full px-4 py-2.5 border-t text-[12px] flex items-center gap-1"
              style={{ borderColor: CARD_EDGE, backgroundColor: CARD_BLUE }}
            >
              <span className="font-medium" style={{ color: BLUE }}>Today&apos;s</span>
              <span className="font-medium" style={{ color: INK }}>MTM Graph</span>
              <ArrowRight size={13} style={{ color: INK }} />
            </button>
          </div>

          {brokerCards.map((broker) => (
            <div key={broker.name}
                 className={`${MTM_CARD} bg-white`} style={{ borderColor: CARD_EDGE }}>
              <div className="px-4 pt-4 pb-6 flex-1 flex flex-col">
                <p className="text-[12px] font-medium flex items-center gap-1.5 truncate" style={{ color: INK }}>
                  <Funnel size={13} style={{ color: GREEN }} className="shrink-0" />
                  <span className="truncate">{broker.name}</span>
                </p>
                {/* Coloured by the figure, not hardcoded green: a broker card
                    showing "-₹ 75,031" in green states the opposite of itself. */}
                <p className="text-[16px] font-semibold mt-1"
                   style={{ color: broker.value < 0 ? DANGER : GREEN }}>{broker.mtm}</p>
                <button type="button" className="text-[11px] font-medium mt-auto text-left w-fit"
                        style={{ color: BLUE }}>
                  + Add SL/Tgt
                </button>
              </div>
              <button
                type="button"
                onClick={() => setGraphOpen(broker.name)}
                className="w-full px-4 py-2.5 border-t text-[12px] flex items-center gap-1 bg-white"
                style={{ borderColor: BORDER }}
              >
                <span className="font-medium" style={{ color: BLUE }}>Today&apos;s</span>
                <span className="font-medium" style={{ color: INK }}>MTM Graph</span>
                <ArrowRight size={13} style={{ color: INK }} />
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[auto_auto_auto] gap-x-4 gap-y-2.5 text-[12px]">
            <span className="font-medium" style={{ color: INK }}>Open Positions</span>
            <span className="font-medium" style={{ color: INK }}>Available Margin</span>
            <span className="font-medium" style={{ color: INK }}>Margin Blocked (approx)</span>

            <span className="font-semibold" style={{ color: INK }}>{totalOpenPositions}</span>
            <span className="relative inline-flex items-center gap-1.5">
              <span className="font-semibold" style={{ color: INK }}>{rupees(availableMargin)}</span>
              <button type="button" onClick={() => setMarginOpen((was) => !was)}
                      title="Margin breakdown" style={{ color: BLUE }}>
                <ChevronDown size={13} />
              </button>
              {marginOpen && <MarginPopover onClose={() => setMarginOpen(false)} />}
            </span>
            <span className="font-semibold" style={{ color: INK }}>{rupees(marginBlocked)}</span>

            {/* The kill switch sits on the Include Brokerage ROW, in the first
                column, so the three figures above it and the two controls
                beside it all read as one aligned block.

                Shown ONLY while something is deployed: with an empty board it
                has nothing to square off, and a destructive-looking button that
                cannot act is worse than no button. The cell is still rendered
                so the grid keeps its shape. */}
            {rows.length > 0 ? (
              <button
                type="button"
                onClick={handleSquareOffAll}
                className="inline-flex items-center justify-center h-[28px] px-3 rounded border text-[12px] font-medium whitespace-nowrap w-fit transition-colors"
                style={{ backgroundColor: '#FBF3F3', borderColor: '#F3C9C9', color: DANGER }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8E4E4'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FBF3F3'; }}
              >
                Square off all
              </button>
            ) : <span />}
            <span className="relative inline-flex items-center gap-2.5 font-medium" style={{ color: INK }}>
              Include Brokerage
              <Toggle
                on={brokerage}
                title="Include Brokerage"
                onClick={() => { const next = !brokerage; setBrokerage(next); setRateOpen(next); }}
              />
              {rateOpen && (
                <BrokerageRate rate={rate} unit={rateUnit}
                               onRate={setRate} onUnit={setRateUnit}
                               onDone={() => setRateOpen(false)} />
              )}
            </span>
            <span className="inline-flex items-center gap-2.5 font-medium" style={{ color: INK }}>
              Taxes &amp; charges
              <Toggle
                on={taxes}
                title="Taxes and charges"
                onClick={() => { const next = !taxes; setTaxes(next); if (!next) setTaxOpen(false); }}
              />
            </span>

            <span />
            {/* The pencil reopens the rate card once brokerage is on — the
                toggle is how it is switched on, this is how it is edited. */}
            <button
              type="button"
              onClick={() => { if (brokerage) setRateOpen((was) => !was); }}
              disabled={!brokerage}
              title={brokerage ? 'Edit the brokerage rate' : 'Switch Include Brokerage on first'}
              className="inline-flex items-center gap-1.5 w-fit font-semibold disabled:cursor-default"
              style={{ color: MUTED }}
            >
              {rate === '' ? '0' : rate}
              <Pencil size={12} />
            </button>
            <span className="relative inline-flex items-center gap-1 font-semibold" style={{ color: MUTED }}>
              ₹ 0
              <button type="button" onClick={() => setTaxOpen((was) => !was)}
                      title="Charges breakdown" style={{ color: MUTED }}>
                <ChevronDown size={13} />
              </button>
              {taxOpen && <TaxBreakdown onClose={() => setTaxOpen(false)} />}
            </span>
        </div>
      </div>

      {/* Design only: rows added by activating a strategy. Session state --
          nothing is persisted and no deploy request is sent. */}
      {/* ── Deployed Strategies ─────────────────────────────────────────── */}
      <section className="mt-6 mb-4">
        <div className="flex items-center gap-5">
          <h2 className="text-[19px] whitespace-nowrap" style={{ color: INK }}>Deployed Strategies</h2>
          <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
          {rows.length > 0 && (
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Same fill-on-hover as their per-row counterparts, from the
                  one shared handler, so the four behave identically. */}
              {headerMode === 'live' ? (
                <button type="button" onClick={handleManualAll} {...fillOnHover}
                        className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                        style={{ borderColor: BORDER, color: DEEP }}>
                  Switch all to manual
                </button>
              ) : (
                <>
                  <button type="button" onClick={handleCancelAll} {...fillOnHover}
                          className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                          style={{ borderColor: BORDER, color: DEEP }}>
                    Cancel All
                  </button>
                  {headerMode === 'restartable' && (
                    <button type="button"
                            onClick={handleRestartAll}
                            className="h-[30px] px-3 rounded text-[12px] font-medium text-white whitespace-nowrap transition-colors"
                            style={{ backgroundColor: THEME }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
                      Restart All
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2.5 flex-wrap">
          <DeployedFilters
            selected={statuses}
            onToggle={toggleStatus}
            archived={archived}
            onArchived={(on) => {
              if (on) {
                statusesBeforeArchive.current = statuses;
                setStatuses(new Set());
              } else {
                setStatuses(statusesBeforeArchive.current ?? new Set());
                statusesBeforeArchive.current = null;
              }
              setArchived(on);
            }}
          />
        </div>

        <MarketCountdown />

        {rows.length === 0 ? (
          <div className="flex items-center gap-5">
            <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
            <p className="text-[14px] whitespace-nowrap" style={{ color: INK }}>No strategies found</p>
            <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
          </div>
        ) : (
          <DeployedTable groups={grouped}
                onSquareOff={(row) => handleSquareOff(row.deploymentId)}
                          onManual={(row) => handleManual(row.deploymentId)}
                          onArchive={(row) => handleArchive(row.deploymentId)}
                          onUnarchive={(row) => handleUnarchive(row.deploymentId)}
                          onCancel={(row) => handleCancel(row.deploymentId)}
                          onResume={(row) => handleResume(row.deploymentId)}
                          resumingId={resumingId}
                          onRestart={(row) => askRestart({
                            all: false, names: [row.name], ids: [row.deploymentId],
                            rows: [{ strategyId: row.strategyId, name: row.name }],
                            // THIS row's broker, not brokerCards[0]: the
                            // restart runs on the connection the deployment
                            // was placed through, and with two brokers on the
                            // board the first card is the wrong one half the
                            // time.
                            brokerName: row.broker,
                            brokerLive: Boolean(
                              brokerNames[String(row.live?.broker_account_id)]?.live,
                            ),
                          })}
                          restartedIds={restarted}
                          cancelledIds={cancelled}
                          restartTimes={restartTimes}
                          isStaleDay={isStale}
                          onViewTrades={(row) => setTradesFor({
                            /*
                              THE ROW'S OWN ID, AND ONLY THAT. This used to fall
                              back to a stale `live_deployments` cache, so Square
                              Off could act on a DIFFERENT deployment than the one
                              on screen. Every row carries its own id; if it ever
                              does not, no id is better than a guess.
                            */
                            deploymentId: row.deploymentId,
                            strategyId: row.strategyId,
                            name: row.name,
                            broker: row.broker,
                          })} />
        )}

            </section>

      <Activation onEdit={handleEdit} onNotify={onNotify} reloadKey={strategiesReloadKey} onDeploy={(p) => openDeploy(p, 'main')}
                  execDays={execDays} onExecDays={setExecDays}
                  onSetupBroker={() => openBroker('main')}
                  onDeployed={(row) => {
                    setDeployed((was) => [
                      ...was,
                      { ...row, key: `${row.name}-${was.length}` },
                    ]);
                    // Ask the server for the day's deployments straight away
                    // rather than waiting on the next snapshot -- the new row
                    // gets its real status, broker and figures immediately.
                    refreshOverview();
                  }}
                  onEditPortfolio={onEditPortfolio} />
      </div>
    </div>
  );
};

// The app shell re-renders on every toast, counter and backtest change. Its one
// prop is a stable callback (see openStrategyInBuilder in App), so memo keeps
// those re-renders off this screen entirely.
export default memo(AlgoTrade);
