import { useEffect, useState } from 'react';
import { X, Clock, ChevronDown, ChevronUp, Filter, CalendarDays } from 'lucide-react';
import {
  INK, MUTED, BORDER, BLUE, DEEP, GREEN, SOFT_BG, TINT_SELECTED, ACTIVATE_HOVER,
} from './palette';
import { fetchActivationTimings } from '../../services/liveTradingApi';
import TimePicker from './TimePicker';
import { isIntraday, timingError } from './activationTiming';

/**
 * Shown when Activate is pressed and a broker is logged in: one row per broker
 * with a quantity multiplier, plus the entry/exit window for overnight ones.
 *
 * INTRADAY HAS NO TIMING PANEL -- the four fields go as nulls. For BTST and
 * positional the window, and which fields are editable, come from
 * GET /live/activation-timings; a BTST entry_date is read-only, not hidden.
 *
 * A window that breaks the rules is stopped HERE, before the request: this
 * starts a real-money deployment.
 */

const INPUT = 'h-[34px] px-3 rounded border text-[13px] outline-none w-full';

/**
 * ONE field per end of the window: "08-10-2026 14:31:59".
 *
 * NOT a native datetime-local: it renders in the BROWSER's locale -- mm/dd/yyyy
 * and a 12-hour clock on most machines here -- which is neither the format
 * asked for nor the one the API speaks. This is our own picker behind a text
 * box, so 15:00 reads as 15:00 everywhere.
 *
 * `lockDate` greys the date HALF and leaves the clock live -- a BTST entry,
 * which always happens today but at a time the user chooses.
 */
const stampParts = (iso) => {
  const [datePart = '', timePart = ''] = String(iso || '').split('T');
  const [y, m, d] = datePart.split('-');
  return {
    date: y && m && d ? `${d}-${m}-${y}` : '',
    time: timePart || '',
  };
};

const TimingField = ({ label, value, onChange, lockDate = false, disabled = false }) => {
  const [open, setOpen] = useState(false);
  // The trigger node in STATE, not a ref: TimePicker measures its rect while
  // rendering, and a ref read during render is both a lint error and null on
  // the first open.
  const [anchor, setAnchor] = useState(null);
  const { date, time } = stampParts(value);

  return (
    <label className="block">
      <span className="block text-[12px] mb-1" style={{ color: MUTED }}>{label}</span>
      <span
        ref={setAnchor}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((was) => !was)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((was) => !was); }
        }}
        className={`${INPUT} flex items-center justify-between gap-2 tabular-nums select-none${disabled ? '' : ' cursor-pointer'}`}
        style={{ borderColor: BORDER, backgroundColor: disabled ? SOFT_BG : '#FFFFFF' }}
      >
        <span>
          {/* The date is dimmed when it cannot be changed, so the fixed half
              is distinguishable from the half that is still the user's. */}
          <span style={{ color: lockDate || disabled ? MUTED : INK }}>{date || '--'}</span>
          {'  '}
          <span style={{ color: disabled ? MUTED : INK }}>{time || '--'}</span>
        </span>
        <CalendarDays size={15} style={{ color: MUTED }} className="shrink-0" />
      </span>

      {open && !disabled && (
        <>
          {/* Click-away, behind the panel. */}
          <span className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <TimePicker value={value} withDate onChange={onChange} lockDate={lockDate}
                      onClose={() => setOpen(false)} anchor={anchor} />
        </>
      )}
    </label>
  );
};

const SelectBrokerDialog = ({ strategyName = 'Strategy', strategyId = null, brokers = [],
  strategyType = 'intraday', version = 0, qty = 1, onClose, onActivate, onNotify }) => {
  // Nothing ticked on open: activating is a real-money action, so which brokers
  // it runs on is an explicit choice rather than a default to be noticed and
  // undone.
  const [picked, setPicked] = useState(() => new Set());
  const [timingsOpen, setTimingsOpen] = useState(false);

  const intraday = isIntraday(strategyType);

  /**
   * The server's window for this strategy.
   *
   * Fetched whenever the strategy is OVERNIGHT, not only when the user expands
   * the panel -- because the window is sent with the deployment either way.
   * Fetching it lazily meant an untouched activation sent no window at all and
   * the server picked its own, which did not match what the dialog would have
   * shown. One GET per activate is a fair price for the screen and the request
   * agreeing.
   */
  const [timings, setTimings] = useState(null);
  const [editable, setEditable] = useState({});
  const [expiry, setExpiry] = useState(null);
  const [timingsFailed, setTimingsFailed] = useState(false);
  /**
   * DERIVED, not a third piece of state: the panel is loading exactly when it
   * is open and has no timings yet. A separate flag would have to be set from
   * inside the effect, which is a cascading render -- and could drift out of
   * step with `timings` besides.
   */
  const loadingTimings = timingsOpen && !intraday && !timings;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (intraday || timings || strategyId == null) return undefined;
    let alive = true;
    fetchActivationTimings(strategyId, version)
      .then((body) => {
        if (!alive) return;
        const d = body?.data || {};
        setTimings({
          entryDate: d.entry_date || '',
          entryTime: d.entry_time || '',
          exitDate: d.exit_date || '',
          exitTime: d.exit_time || '',
        });
        // Nothing is editable unless the server SAYS so: defaulting an unknown
        // flag to true would let a user change a date the backend will reject.
        setEditable(d.editable || {});
        setExpiry(d.expiry || null);
      })
      .catch((err) => {
        if (!alive) return;
        setTimingsFailed(true);
        onNotify?.(err.message, 'error');
      });
    return () => { alive = false; };
  }, [intraday, timings, strategyId, version, onNotify]);

  /*
    The two fields carry a combined "YYYY-MM-DDTHH:MM:SS"; the payload and the
    rules want the four parts. `timings` stays canonical and the combined
    value is derived from it, so there is one copy of the truth rather than
    two that can disagree.
  */
  const joinIso = (date, time) => (date && time ? `${date}T${time}` : '');
  const entryAt = joinIso(timings?.entryDate, timings?.entryTime);
  const exitAt = joinIso(timings?.exitDate, timings?.exitTime);

  /** Split a picked moment back into the two fields the payload wants. */
  const applyIso = (which) => (iso) => {
    const [date = '', time = ''] = String(iso || '').split('T');
    setTimings((was) => ({ ...was, [`${which}Date`]: date, [`${which}Time`]: time }));
  };

  const setEntryAt = applyIso('entry');
  const setExitAt = applyIso('exit');

  const toggle = (id) => setPicked((was) => {
    const next = new Set(was);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [multipliers, setMultipliers] = useState(
    () => Object.fromEntries(brokers.map((b) => [b.id, '1'])),
  );

  const count = picked.size;

  /**
   * An overnight strategy cannot be deployed until its window is KNOWN.
   *
   * `timings` is null while GET /activation-timings is in flight and stays
   * null if it fails. Either way the payload would carry four nulls, the
   * server would fill them with ITS defaults -- today -- and a strategy whose
   * dialog says tomorrow gets refused for an entry time already passed. That
   * is the same fault that hit BTST, reached by a different route: tick a
   * broker and click Activate inside the first few hundred milliseconds, or
   * click it after the request failed, and positional lands in exactly the
   * same place.
   *
   * So the button waits. Intraday is exempt -- it has no window to wait for.
   */
  const windowReady = intraday || Boolean(timings?.entryDate);

  /**
   * Validate, THEN hand up. A bad window never reaches `onActivate`, so the
   * deployment request is not made at all -- which is the point: the user is
   * told what is wrong while the dialog is still open and the field is still
   * in front of them.
   */
  const submit = () => {
    if (!windowReady) {
      onNotify?.(
        timingsFailed
          ? 'Could not load this strategy’s entry/exit window — close and reopen to try again'
          : 'Loading this strategy’s entry/exit window — one moment',
        'error',
      );
      return;
    }

    const problem = timingError({ strategyType, ...(timings || {}), expiry });
    if (problem) {
      onNotify?.(problem, 'error');
      return;
    }
    onActivate?.([...picked], multipliers, { strategyType, timings: timings || {} });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-full max-w-[640px] rounded-lg bg-white shadow-2xl"
           role="dialog" aria-modal="true" aria-label={`Select broker for ${strategyName}`}>

        {/* Heading: the label and the strategy's own name on two lines, as the
            reference sets it, so a long name never crowds the close button. */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <h3 className="text-[16px] font-semibold leading-snug" style={{ color: INK }}>
            Select Broker for
            <br />
            {strategyName}
          </h3>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        <div className="px-6">
          {/* Intraday has no window to edit -- see the note at the top. */}
          {!intraday && (
            <>
              <div className="flex justify-end">
                <button type="button" onClick={() => setTimingsOpen((was) => !was)}
                        aria-expanded={timingsOpen}
                        className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded border text-[12px] bg-white"
                        style={{ borderColor: timingsOpen ? BLUE : BORDER, color: INK }}>
                  <Clock size={14} />
                  Edit Entry/Exit Timings
                  {timingsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {timingsOpen && (
                <div className="mt-3">
                  {loadingTimings ? (
                    <p className="text-[12px]" style={{ color: MUTED }}>Loading timings…</p>
                  ) : (
                    <>
                      {/* TWO fields, stacked full width -- date and time
                          together on each, as the reference has them. Four
                          separate boxes made the user assemble one moment in
                          time out of two controls. */}
                      <div className="grid gap-3">
                        <TimingField
                          label="Entry Time"
                          value={entryAt}
                          onChange={setEntryAt}
                          // BTST always enters today: the date half is shown
                          // but dimmed and its calendar is dead, while the
                          // clock stays live.
                          lockDate={!editable.entry_date}
                          disabled={!editable.entry_date && !editable.entry_time}
                        />
                        <TimingField
                          label="Exit Time"
                          value={exitAt}
                          onChange={setExitAt}
                          lockDate={!editable.exit_date}
                          disabled={!editable.exit_date && !editable.exit_time}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Just the count. The "Qty Multiplier" heading that sat opposite
              it labelled a column that is not there until a broker is ticked,
              so on an untouched dialog it pointed at nothing. */}
          <div className="mt-4 mb-2">
            <span className="text-[12px]" style={{ color: MUTED }}>{count} selected</span>
          </div>

          <div className="flex flex-col gap-2">
            {brokers.map((broker) => {
              const on = picked.has(broker.id);
              const mult = multipliers[broker.id] ?? '1';
              return (
                <div key={broker.id}
                     className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded border px-3 py-2.5"
                     style={{
                       borderColor: on ? BLUE : BORDER,
                       backgroundColor: on ? TINT_SELECTED : '#FFFFFF',
                     }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(broker.id)}
                         className="w-4 h-4 cursor-pointer shrink-0"
                         style={{ accentColor: BLUE }} />
                  <Filter size={15} style={{ color: GREEN }} className="shrink-0" />
                  <span className="text-[13px] font-medium" style={{ color: INK }}>{broker.name}</span>

                  {/* `qty x [n] = [total]`, shown only once the row is ticked:
                      an unticked broker is not being deployed to, so a quantity
                      for it is noise. The left figure is the strategy's own
                      quantity from its execution settings; the middle box is the
                      only editable part and the total is derived from the two. */}
                  {on && (
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-[13px]" style={{ color: INK }}>{qty}</span>
                      <span className="text-[13px]" style={{ color: MUTED }}>x</span>
                      <input
                        value={mult}
                        onChange={(e) => setMultipliers((was) => ({ ...was, [broker.id]: e.target.value }))}
                        inputMode="numeric"
                        className="w-14 h-[30px] text-center rounded border text-[13px] bg-white outline-none"
                        style={{ borderColor: BORDER, color: INK }}
                        aria-label={`Quantity multiplier for ${broker.name}`}
                      />
                      <span className="text-[13px]" style={{ color: MUTED }}>=</span>
                      <span className="w-14 h-[30px] inline-flex items-center justify-center rounded border text-[13px]"
                            style={{ borderColor: BORDER, color: INK, backgroundColor: '#FFFFFF' }}>
                        {(Number(qty) || 0) * (Number(mult) || 0)}
                      </span>
                    </div>
                  )}

                  <span className={`inline-flex items-center h-[24px] px-2 rounded border text-[11px] font-medium shrink-0${on ? '' : ' ml-auto'}`}
                        style={{ borderColor: GREEN, color: GREEN, backgroundColor: '#FFFFFF' }}>
                    LOGGED IN
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 pt-6 pb-5">
          <button type="button" onClick={onClose}
                  className="px-4 py-3 rounded text-[12px] font-medium transition-colors hover:bg-gray-50"
                  style={{ color: INK }}>
            Cancel
          </button>
          <button type="button"
                  disabled={count === 0 || !windowReady}
                  title={windowReady ? undefined : 'Waiting for this strategy’s entry/exit window'}
                  onClick={submit}
                  className="px-4 py-2 rounded border text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: DEEP, borderColor: DEEP }}
                  onMouseEnter={(e) => {
                    if (count === 0 || !windowReady) return;
                    e.currentTarget.style.backgroundColor = ACTIVATE_HOVER;
                    e.currentTarget.style.borderColor = ACTIVATE_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = DEEP;
                    e.currentTarget.style.borderColor = DEEP;
                  }}>
            {/* Always "Brokers", even at one -- the reference does not
                pluralise this label and the aim is an exact match. */}
            Activate on {count} Brokers
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectBrokerDialog;
