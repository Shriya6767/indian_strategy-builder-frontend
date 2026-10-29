import { useEffect, useState } from 'react';
import { ChevronUp, Funnel } from 'lucide-react';
import { INK, MUTED, BORDER, RULE, DEEP, THEME, GREEN, DANGER, ACTIVATE_HOVER,
  COUNT_BG, COUNT_TEXT, fillOnHover } from './palette';
import { toneFor, labelFor } from './statusTone';

/**
 * The Deployed Strategies list: column header, a "Deployed on <date>" group
 * header, and one card per running strategy.
 *
 * COLUMNS are a shared grid template so header and rows line up, inside an
 * overflow-x-auto wrapper with a min-width -- on a narrow pane the columns keep
 * their shape and the user scrolls, rather than actions wrapping under the name.
 */

/**
 * PROPORTIONAL tracks, so the four data columns spread across whatever width
 * the pane has instead of huddling at the left with a wide empty gap before
 * the actions. MTM lands roughly where Broker used to sit, and Broker moves
 * out into the space that was going to waste.
 *
 * Every track is minmax(0, Nfr) except the last, which is minmax(340px, 1.6fr)
 * -- a FIXED floor, not an automatic one. That distinction is what keeps the
 * header and the rows aligned: a track whose minimum is `auto` sizes to its own
 * content, and the row's buttons are far wider than the header's "Actions"
 * label, so the rows' columns were squeezed while the header's were not and
 * every value sat beside its label rather than under it. With no content-driven
 * minimum anywhere, both resolve to identical widths.
 */
const COLS = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(340px,1.6fr)] items-center gap-x-8';

/** "+₹ 1,234" green / "-₹ 560" red / "₹ 0" plain. */
const Mtm = ({ value, fallback }) => {
  if (value == null) return <span className="text-[13px] font-medium" style={{ color: INK }}>{fallback}</span>;
  const n = Number(value) || 0;
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return (
    <span className="text-[13px] font-medium tabular-nums"
          style={{ color: n > 0 ? GREEN : n < 0 ? DANGER : INK }}>
      {sign}₹ {Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
    </span>
  );
};

/** Column header strip above the rows. */
export const DeployedHeader = () => (
  // `border border-transparent` is not decoration: a row card has a 1px border
  // and this does not, so without it every column here starts 1px off the
  // column below and the whole strip reads as misaligned.
  <div className={`${COLS} px-4 pb-2 border border-transparent`}>
    <span className="text-[12px]" style={{ color: MUTED }}>Name</span>
    <span className="text-[12px] text-center" style={{ color: MUTED }}>Status</span>
    <span className="text-[12px] text-center" style={{ color: MUTED }}>MTM</span>
    <span className="text-[12px] text-center" style={{ color: MUTED }}>Broker</span>
    <span className="text-[12px] text-right" style={{ color: MUTED }}>Actions</span>
  </div>
);

/** "Deployed on 01 OCT 26", centred on a rule, with its collapse chevron. */
export const DeployedOn = ({ date }) => (
  <div className="flex items-center gap-5 my-3">
    <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
    <button type="button" className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: INK }}>
      Deployed on {date}
      <ChevronUp size={15} />
    </button>
    <span className="h-px flex-1" style={{ backgroundColor: RULE }} />
  </div>
);

/**
 * `live` is this strategy's row from the latest socket snapshot. When present
 * its figures win -- status, MTM and open positions are taken from it rather
 * than from the props, which are only the placeholders shown before the first
 * snapshot arrives.
 */
/**
 * Seconds until `hh:mm[:ss]` today, or null when it has passed / is unparsable.
 * Used to count a deployment down to its entry time instead of showing RUNNING
 * before it has actually entered.
 */
const secondsUntil = (value) => {
  if (!value) return null;

  /*
    TWO SHAPES, deliberately:

      "09:16:00"              an entry time -- a clock time TODAY
      "2026-10-09T09:15:15"   a scheduled restart -- an absolute moment

    A restart is stored with its date because it is almost always for
    TOMORROW's open, and a bare clock time read back would count toward
    today's 09:15 instead. An entry time has no such problem: the deployment
    it belongs to is running today by definition.
  */
  const text = String(value);
  if (text.includes('T')) {
    const ms = new Date(text).getTime();
    if (!Number.isFinite(ms)) return null;
    const ahead = Math.floor((ms - Date.now()) / 1000);
    return ahead > 0 ? ahead : null;
  }

  const [h, m, sec] = text.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const target = new Date();
  target.setHours(h, m, sec || 0, 0);
  const diff = Math.floor((target.getTime() - Date.now()) / 1000);
  return diff > 0 ? diff : null;
};

/** "2026-10-09T09:15:15" -> "09:15:15", for the monitoring sentence. */
const clockPart = (value) => {
  const m = /(?:^|T)(\d{2}:\d{2}:\d{2})/.exec(String(value || ''));
  return m ? m[1] : null;
};

const clock = (total) => {
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const DeployedRow = ({ name, symbol = 'SENSEX', openPos = 0, mtm = '₹ 0', broker, live,
  onViewTrades, onSquareOff, onSwitchManual, onArchive, onUnarchive,
  onCancel, onRestart, onResume, resuming = false, restarted = false, staleDay = false, restartAt = null,
  cancelled = false }) => {
  const state = String(live?.status || '').toLowerCase();
  const archivedRow = Boolean(live?.is_archived);

  /*
    A RESUMABLE ERROR IS NOT FINISHED. The server marks a failed deployment
    `resumable: true` while the leg can still be retried, and `false` once the
    error is terminal.

    It matters beyond the Resume button: a resumable error still holds a live
    position, so Square Off and Switch to manual have to stay available. Left
    in the `finished` bucket below it would have shown Archive alone, offering
    to tidy away a deployment that is still in the market.
  */
  const resumable = state === 'error'
    && live?.resumable === true
    /*
      A CANCELLED or ARCHIVED row never offers Resume, whatever the payload
      says. `cancelled` means POST /cancel already succeeded, and the worker
      may not have caught up -- retrying something the user just cancelled is
      the opposite of what they asked for. Without this the `!resumable` added
      to `finished` below would have pulled a cancelled row out of the
      finished bucket and handed it a Resume button.

      `=== true` is deliberately STRICT and must stay so: a loose check would
      read the STRING "false" as truthy and show Resume on a terminal error.
    */
    && !cancelled
    && !archivedRow;

  /**
   * A paused deployment's controls depend on WHEN it paused:
   *   paused TODAY (market shut)  -> Switch to manual · Square Off · View Trades
   *   paused on an EARLIER day    -> Cancel Deployment · Restart · View Trades
   *   restarted (any time)        -> Switch to manual · Square Off · View Trades
   *
   * Opening the market does NOT clear the second case -- a stale deployment
   * nobody restarted is still not running. `staleDay` is that distinction: its
   * trade date is behind today.
   *
   * DECLARED FIRST: these are `const`, hoisted but not initialised, so a read
   * above this point throws at render.
   */
  const pausedRaw = !archivedRow && state === 'paused' && staleDay;
  /**
   * A CANCELLED deployment is finished, whatever the snapshot still says.
   * POST /cancel came back true, so it will never restart -- offering Restart
   * again would fire at something that no longer exists. It keeps its place on
   * the board reading CANCELLED, with Archive to tidy it away when the user
   * chooses to.
   */
  const awaitingRestart = pausedRaw && !restarted && !cancelled;
  const finished = !archivedRow && !resumable && (cancelled || (!pausedRaw
    && ['squared_off', 'sq_off', 'completed', 'error', 'failed'].includes(state)));

  /**
   * THE CHIP IS THE SERVER'S WORD, with no exception at all.
   *
   * It briefly forced CANCELLED after POST /cancel returned true, so the row
   * would not keep reading PAUSED until the next refresh -- but that is still
   * the screen asserting a state the worker has not reported. Every status
   * now comes from the snapshot or the API verbatim; only the BUTTONS react
   * to what we just did.
   */
  const shownState = state;

  /*
    TWO KINDS OF "SCHEDULED", shown differently.

      A — a RESTARTED overnight file, waiting for a moment that is usually
          tomorrow's open. No countdown (hours counting past midnight tells
          nobody anything): "monitoring resumes at 09:15:15".
      B — ACTIVATED TODAY ahead of its entry time. Short and in-session, so a
          live countdown is right: "entry in 03:00:00".

    Told apart by `restartAt`, which exists only for A and only until its
    moment passes -- the store prunes an expired schedule on read.
  */
  /*
    ONLY WHILE IT IS ACTUALLY STILL WAITING. The moment the SERVER says it is
    running, there is nothing to announce -- show the MTM.

    What broke it: pressing Restart after 09:15 records the schedule for
    TOMORROW, a real future moment nothing prunes, so the row said "monitoring
    resumes at 09:15:15" for 22 hours while plainly marked RUNNING. The
    server's status is the authority; a stored schedule is not.
  */
  /*
    `status_reason` is shown except when it merely restates the entry time --
    "entry at 2026-10-13 09:30:00" -- which the live countdown beside it
    already covers, and better.
  */
  const reasonRaw = String(live?.status_reason || '').trim();

  /*
    The backend author's own "Show as" column, applied exactly:

      scheduled + "entry at <when>"   -> the existing countdown says it; no
                                         second line of text here
      scheduled + "waiting for <id>"  -> "Waiting for the earlier deployment
                                         to exit"
      running   + null                -> just RUNNING, nothing to add
      completed + <reason>            -> COMPLETED, and the reason shown

    One line is rewritten because they asked for that one to be rewritten;
    every other reason is the server's own sentence, untouched.
  */
  const reasonText = /^entry at\b/i.test(reasonRaw) ? null
    : (/^waiting for\b/i.test(reasonRaw)
      ? 'Waiting for the earlier deployment to exit'
      : (reasonRaw || null));

  // A card the server is holding back for an earlier deployment: it has no
  // entry moment of its own yet, so nothing counts down.
  const waitingOnEarlier = /^waiting for\b/i.test(reasonRaw);

  const waiting = ['paused', 'scheduled'].includes(state);
  const restartMoment = (cancelled || finished || archivedRow || !waiting)
    ? null
    : (restartAt || null);

  const entryTarget = (!cancelled && !restartMoment && !waitingOnEarlier
    && ['running', 'scheduled'].includes(state))
    ? (live?.entry_time || null)
    : null;

  // Only B ticks. A is a fixed sentence and needs no timer at all.
  const target = entryTarget;

  const [left, setLeft] = useState(() => secondsUntil(target));

  /**
   * Re-seed DURING RENDER when the target moves -- scheduling a restart
   * changes what this row counts down to, and waiting for the effect would
   * show one second of the OLD remaining time first.
   *
   * This is React's documented "adjusting state when a prop changes" pattern,
   * not a stray setState: it runs before the component commits, so there is no
   * extra paint, where doing it in the effect body is a cascading render.
   */
  const [seededFor, setSeededFor] = useState(target);
  if (seededFor !== target) {
    setSeededFor(target);
    setLeft(secondsUntil(target));
  }

  useEffect(() => {
    // Nothing to count down to: no interval is created at all, so a row that
    // has already entered costs nothing per second.
    if (secondsUntil(target) == null) return undefined;
    const id = setInterval(() => {
      const next = secondsUntil(target);
      setLeft(next);
      if (next == null) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [target]);
  // Both figures come straight from the snapshot, so they move with every tick:
  // open positions is the count of legs the server still reports as open, and
  // MTM is its own mark-to-market (a finished deployment has only the booked
  // figure left, so that stands in).
  /*
    OPEN POSITIONS = rows the server still has in the market: `open` AND
    `exiting`. A leg being exited is still a position until it is out, and
    counting only `open` understated the card the moment an exit started.

    Counted per ROW, not per leg_number: a re-entry is a second row with a
    higher `attempt`, and both can be open at once.
  */
  const positions = live
    ? (live.legs || []).filter((l) => ['open', 'exiting'].includes(String(l.status))).length
    : openPos;

  /*
    A SCHEDULED card -- counting down to its own entry, restarted and waiting
    for its resume moment, or held back behind an earlier deployment. Decides
    the buttons: see the note where they are drawn.
  */
  const scheduledCard = !archivedRow && !cancelled && state === 'scheduled';
  const mtmValue = live ? (live.mtm ?? live.realised_pnl ?? 0) : null;

  return (
  /*
    THE WHOLE CARD OPENS VIEW TRADES -- the same thing its View Trades button
    does -- so the blank space between the columns is a target rather than
    dead area. The ACTIONS cell stops the click bubbling: Square Off must
    square off, not square off AND navigate.

    role/tabIndex/Enter so the card is reachable by keyboard too, since it is
    now interactive.
  */
  <div className={`${COLS} rounded border bg-white px-4 py-3 cursor-pointer transition-shadow hover:shadow-[0_1px_8px_0_rgba(0,0,0,0.08)]`}
       style={{ borderColor: BORDER }}
       role="button"
       tabIndex={0}
       onClick={() => onViewTrades?.(live)}
       onKeyDown={(e) => {
         if (e.key === 'Enter') onViewTrades?.(live);
       }}>
    <div className="min-w-0">
      <p className="text-[13px] font-medium truncate" style={{ color: INK }}>{name}</p>
      <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>
        {symbol} &nbsp;•&nbsp; Open Pos: {positions}
      </p>
    </div>

    {/* Status is JUST the status. The countdown used to live here as
        "RUNNING in 03:58:02", which meant the column said two things at once;
        it now sits under MTM, where the reference puts it. */}
    <span className="flex flex-col items-center justify-center gap-1 min-w-0">
      {/* Coloured by what the status actually is. This was green for every
          state, so a deployment that had ERRORED read as healthy. */}
      <span className="inline-flex items-center justify-center h-[21px] px-2 rounded text-[11px] font-medium whitespace-nowrap"
            style={toneFor(shownState)}>
        {labelFor(shownState || 'running')}
      </span>
      {/*
        The server's own `status_reason`, under the chip that it explains.

        Rendered, not computed -- "waiting for deployment 35 to exit" and
        "deployment 35 did not exit before the exit time" are sentences only
        the backend can write. The one it is NOT shown for is "entry at
        09:30:00", because the countdown in the MTM column already says that
        better, live.
      */}
      {reasonText && (
        <span className="text-[10px] leading-tight text-center" style={{ color: MUTED }}
              title={reasonText}>
          {reasonText}
        </span>
      )}
    </span>

    {/* MTM, or whichever notice stands in for it.
        There is no mark-to-market to show before a position exists. A
        restarted file states WHEN monitoring resumes; one waiting on today's
        entry counts down to it. Both give way to the figure the moment they
        are done -- ₹ 0 while nothing has opened, then the live MTM. */}
    <span className="flex justify-center">
      {restartMoment ? (
        <span className="inline-flex items-center justify-center h-[21px] px-2 rounded text-[11px] font-medium whitespace-nowrap"
              style={{ color: COUNT_TEXT, backgroundColor: COUNT_BG }}>
          monitoring resumes at {clockPart(restartMoment)}
        </span>
      ) : left != null ? (
        <span className="inline-flex items-center justify-center h-[21px] px-2 rounded text-[11px] font-medium tabular-nums whitespace-nowrap"
              style={{ color: COUNT_TEXT, backgroundColor: COUNT_BG }}
              title={`Enters at ${target}`}>
          entry in {clock(left)}
        </span>
      ) : (
        <Mtm value={mtmValue} fallback={mtm} />
      )}
    </span>

    <span className="flex items-center justify-center gap-1.5 text-[12px] min-w-0" style={{ color: INK }}>
      <Funnel size={13} style={{ color: GREEN }} className="shrink-0" />
      <span className="truncate">{broker}</span>
    </span>

    {/* Clicks on any button land on that button ONLY -- see the card note. */}
    <div className="flex items-center justify-end gap-2"
         onClick={(e) => e.stopPropagation()}
         onKeyDown={(e) => e.stopPropagation()}
         role="presentation">
      {/* The buttons depend on where the deployment IS. A finished one cannot
          be squared off or handed back, so offering those would be a lie; what
          it can do is be archived. An archived one can only come back. */}
      {awaitingRestart ? (
        <>
          {/* Cancel is the destructive one of the pair, so it fills with the
              theme colour on hover exactly as Switch to manual does. */}
          <button type="button" onClick={onCancel} {...fillOnHover}
                  className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                  style={{ borderColor: BORDER, color: DEEP }}>
            Cancel Deployment
          </button>
          <button type="button" onClick={onRestart}
                  className="h-[30px] px-3 rounded text-[12px] font-medium text-white whitespace-nowrap transition-colors"
                  style={{ backgroundColor: THEME }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
            Restart
          </button>
        </>
      ) : archivedRow ? (
        <button type="button" onClick={onUnarchive} {...fillOnHover}
                className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                style={{ borderColor: BORDER, color: DEEP }}>
          Unarchive
        </button>
      ) : scheduledCard ? (
        /*
          SCHEDULED -- it has not begun running yet, so Square Off is never
          offered here: there is nothing for it to square off, whether the
          card is counting down to its entry, waiting behind an earlier
          deployment, or restarted and waiting for its resume moment.

          Cancel Deployment is always available. Switch to manual appears
          ONLY when legs are actually open -- a restarted overnight file
          still holds yesterday's positions and can be handed back, while a
          card with nothing open has nothing to hand over.
        */
        <>
          <button type="button" onClick={onCancel} {...fillOnHover}
                  className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                  style={{ borderColor: BORDER, color: DEEP }}>
            Cancel Deployment
          </button>
          {positions > 0 && (
            <button type="button" onClick={onSwitchManual} {...fillOnHover}
                    className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                    style={{ borderColor: BORDER, color: DEEP }}>
              Switch to manual
            </button>
          )}
        </>
      ) : finished ? (
        <button type="button" onClick={onArchive} {...fillOnHover}
                className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                style={{ borderColor: BORDER, color: DEEP }}>
          Archive
        </button>
      ) : (
        <>
          {/* Resume leads: on a failed deployment it is what the user came to
              do, and the other two are the alternatives to it. */}
          {resumable && (
            /* Disabled while its own request is in flight. Two clicks would
               be two retries of a live leg, and the second would land after
               the first had already changed the status. */
            <button type="button" onClick={onResume} disabled={resuming}
                    {...(resuming ? {} : fillOnHover)}
                    className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: BORDER, color: DEEP }}>
              {resuming ? 'Resuming…' : 'Resume'}
            </button>
          )}
          <button type="button" onClick={onSwitchManual} {...fillOnHover}
                  className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                  style={{ borderColor: BORDER, color: DEEP }}>
            Switch to manual
          </button>
          <button type="button" onClick={onSquareOff} {...fillOnHover}
                  className="h-[30px] px-3 rounded border text-[12px] font-medium bg-white whitespace-nowrap transition-colors"
                  style={{ borderColor: BORDER, color: DEEP }}>
            Square Off
          </button>
        </>
      )}
      <button type="button"
              className="h-[30px] px-3 rounded text-[12px] font-semibold text-white whitespace-nowrap transition-colors"
              style={{ backgroundColor: DEEP }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = DEEP; }}
              onClick={() => onViewTrades?.(live)}>
        View Trades
      </button>
    </div>
  </div>
  );
};

export default DeployedRow;
