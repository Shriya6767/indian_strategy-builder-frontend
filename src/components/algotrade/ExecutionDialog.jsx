import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchStrategyConfig } from '../../services/strategyViewApi';
import { X, Info, Copy, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { INK, MUTED, BORDER, BLUE, TINT_SELECTED, THEME, ACTIVATE_HOVER, NAVY, HEAD_BG, PENDING_EDGE } from './palette';
import Toggle from './Toggle';

/**
 * "Edit execution for <strategy>" — the modal behind Setup Execution.
 *
 * Presentation plus local state; confirming reports the settings up so the row
 * can flip to "Ready to deploy".
 *
 * Leg settings live in ONE array keyed by index, so switching tabs is a number
 * change rather than a remount and typing never rebuilds the panel. Number
 * fields step through a functional updater, so a rapid click streak cannot
 * collapse into one increment.
 */

/**
 * The strategy's entry time as the saved-strategy CARD last recorded it.
 *
 * A SEED ONLY. The card is written when a strategy is saved from the builder,
 * so it goes stale the moment the strategy changes any other way -- the dialog
 * once opened on 12:00:00 while the builder read 11:25. The effect below
 * replaces this with the server's value; this keeps the field from being blank
 * meanwhile. Matched on id first, name second. Null when there is no card.
 */
const STRATEGY_CARDS_KEY = 'saved_strategies_cards';

const storedEntryTime = (strategyId, strategyName) => {
  try {
    const cards = JSON.parse(localStorage.getItem(STRATEGY_CARDS_KEY) || '[]');
    if (!Array.isArray(cards)) return null;
    const card = cards.find((c) => strategyId != null && String(c?.id) === String(strategyId))
      || cards.find((c) => String(c?.name || '').trim().toLowerCase()
        === String(strategyName || '').trim().toLowerCase());
    /*
      SECONDS ARE KEPT. This used to capture hours and minutes only, so a
      builder entry time of 13:30:15 seeded the dialog as 13:30 -- and anyone
      quick enough to press Update before the confirming fetch answered saved
      13:30 against a 13:30:15 strategy. Fifteen seconds early, silently, and
      only in the fast path.

      "09:16" (no seconds) still comes back unchanged.
    */
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(card?.entry_time ?? '').trim());
    if (!match) return null;
    const [, h, m, sec] = match;
    return `${h.padStart(2, '0')}:${m}${sec ? `:${sec}` : ''}`;
  } catch {
    return null;
  }
};

/** "13:29:06" -> seconds past midnight; missing parts count as zero. */
const toSec = (t) => {
  const [h = 0, m = 0, sec = 0] = String(t || '').split(':').map(Number);
  return (h * 3600) + (m * 60) + sec;
};

/**
 * THE 59-SECOND LEASH, in one place for the three things that apply it: the
 * seed on open, the server-confirm effect, and the Save validation.
 *
 * Execution may begin at most 59 seconds before the entry time and never
 * after it -- entry 13:30:00 accepts 13:29:01 through 13:30:00, both ends
 * included.
 */
const withinLeash = (entry, exec) => {
  const lead = toSec(entry) - toSec(exec);
  return lead >= 0 && lead <= 59;
};

const NRML = ['NRML', 'MIS'];
const REF_PRICE = ['Traded', 'Trigger'];
const ORDER_TYPE = ['Limit', 'MPP'];
const BUFFER_TYPE = ['Points', '%'];
const MONITORING = ['Continuous', 'Delayed'];
const WEEKDAYS = [['M', 1], ['T', 2], ['W', 3], ['Th', 4], ['F', 5], ['Sa', 6], ['Su', 0]];
const DTE_OPTIONS = Array.from({ length: 80 }, (_, i) => i);

/** One leg's execution settings, as the reference defaults them. */
const freshLeg = () => ({
  product: 'NRML',
  // Traded, not Trigger. Saved settings override this; it is the opening
  // value for a leg nobody has configured yet.
  refPrice: 'Traded',
  delayEntry: '0',
  entryType: 'Limit',
  entryBufferType: 'Points',
  entryTrigger: '0',
  entryLimit: '3',
  exitType: 'Limit',
  exitBufferType: 'Points',
  exitTrigger: '0',
  exitLimit: '3',
  monitoring: 'Continuous',
  frequency: '5',
});

const FIELD = 'h-[34px] rounded border text-[12px] bg-white outline-none';

/** Native select with the oversized platform arrow swapped for a 12px chevron. */
const Select = ({ value, onChange, options, width = 'w-[92px]' }) => (
  <span className="relative inline-flex items-center shrink-0">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD} ${width} pl-2 pr-6 appearance-none`}
      style={{ borderColor: BORDER, color: INK }}
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
    <ChevronDown size={12} className="absolute right-2 pointer-events-none" style={{ color: MUTED }} />
  </span>
);

/**
 * Number field with the reference's stepper: a thin chevron pair that appears
 * on hover or focus. type=text + inputMode so there is no native spinner to
 * fight, with Up/Down keys kept.
 */
const NumberField = ({ value, onChange, width = 'w-[92px]', suffix }) => {
  const step = (by) => onChange((prev) => {
    const n = Number(prev);
    return String(Math.max(0, (Number.isFinite(n) ? n : 0) + by));
  });
  return (
    <span className={`group inline-flex items-center ${width} ${FIELD} pl-2 pr-1 shrink-0`}
          style={{ borderColor: BORDER }}>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === '' || /^\d*\.?\d*$/.test(next)) onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
        }}
        className="flex-1 min-w-0 bg-transparent outline-none text-[12px]"
        style={{ color: INK }}
      />
      <span className="flex flex-col shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            style={{ color: MUTED }}>
        <button type="button" tabIndex={-1} title="Increase" onClick={() => step(1)}
                className="h-[8px] w-[11px] flex items-center justify-center overflow-hidden">
          <ChevronUp size={11} strokeWidth={2.2} />
        </button>
        <button type="button" tabIndex={-1} title="Decrease" onClick={() => step(-1)}
                className="h-[8px] w-[11px] flex items-center justify-center overflow-hidden">
          <ChevronDown size={11} strokeWidth={2.2} />
        </button>
      </span>
      {suffix && <span className="pl-1 pr-1 text-[12px] shrink-0" style={{ color: INK }}>{suffix}</span>}
    </span>
  );
};

const Row = ({ label, info, children }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="inline-flex items-center gap-1 text-[12px] w-[112px] shrink-0" style={{ color: INK }}>
      {label}
      {info && <Info size={12} style={{ color: MUTED }} />}
    </span>
    {children}
  </div>
);

/** "Copy To Legs" — tick the legs to receive this leg's settings. */
const CopyToLegs = ({ legCount, onApply, onClose }) => {
  const [picked, setPicked] = useState(() => new Set());
  const boxRef = useRef(null);

  useEffect(() => {
    const away = (e) => { if (!boxRef.current?.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  const all = picked.size === legCount;
  const toggle = (i) => setPicked((was) => {
    const next = new Set(was);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div ref={boxRef}
         className="absolute right-0 top-full mt-1 z-20 w-[214px] rounded-md border bg-white shadow-lg p-3"
         style={{ borderColor: BORDER }}>
      <p className="text-[12px] mb-2 leading-snug" style={{ color: INK }}>
        Settings will be applied to the<br />selected legs
      </p>
      <label className="flex items-center gap-2.5 h-[30px] text-[12px] cursor-pointer" style={{ color: INK }}>
        <input type="checkbox" checked={all} className="w-4 h-4 accent-[#0782DA]"
               onChange={() => setPicked(all ? new Set()
                 : new Set(Array.from({ length: legCount }, (_, i) => i)))} />
        Select All
      </label>
      {Array.from({ length: legCount }, (_, i) => (
        <label key={i} className="flex items-center gap-2.5 h-[30px] text-[12px] cursor-pointer" style={{ color: INK }}>
          <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)}
                 className="w-4 h-4 accent-[#0782DA]" />
          Leg {i + 1}
        </label>
      ))}
      <button type="button" onClick={() => { onApply([...picked]); onClose(); }}
              className="mt-2 w-full h-[34px] rounded text-[12px] font-medium text-white transition-colors"
              style={{ backgroundColor: THEME }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
        Apply to Selected Legs
      </button>
    </div>
  );
};

/**
 * `initial` is the object a previous Confirm handed back, so reopening the
 * dialog shows what was saved rather than the blank defaults. Everything is
 * guarded: an absent or partial `initial` falls through to the same defaults
 * the dialog always had, and days/dte come back as arrays so they are rebuilt
 * into the Sets this component works with.
 */
const ExecutionDialog = ({ strategyName, legCount = 1, onClose, onConfirm, initial,
  strategyId, version, entryTime, onNotify, fromPortfolio = false }) => {
  const legs = Math.max(1, Number(legCount) || 1);

  const [qty, setQty] = useState(() => (initial?.qty != null ? String(initial.qty) : '1'));
  const [autoSqOff, setAutoSqOff] = useState(() => initial?.autoSqOff ?? true);
  // Defaults to ON LTP. `initial` still wins wherever the strategy already has
  // saved settings -- this is only what a dialog with nothing saved opens on.
  const [monitorMode, setMonitorMode] = useState(() => initial?.monitorMode ?? 'on LTP');
  /**
   * WHAT THE DIALOG OPENS ON.
   *
   * The builder's entry time is the anchor; a SAVED execution time is honoured
   * only while it still obeys the 59-second leash against it:
   *   saved 13:29:06, entry 13:30:00 -> inside  -> show 13:29:06
   *   saved 09:35,    entry 14:00    -> outside -> show 14:00
   *
   * The leash IS the test -- a value inside it is one Save already accepted;
   * one outside is stale by definition, because Save would refuse it today.
   */
  const seedAnchor = storedEntryTime(strategyId, strategyName) ?? entryTime ?? null;
  const [execTime, setExecTime] = useState(() => {
    const saved = initial?.execTime ?? null;
    if (saved != null && seedAnchor != null && withinLeash(seedAnchor, saved)) return saved;
    return seedAnchor ?? saved ?? '09:35';
  });

  /**
   * The entry time Save validates against -- the card's value on open,
   * replaced by the server's once the fetch answers. A ref: nothing renders
   * it, it is only read inside the Save handler.
   */
  const entryAnchor = useRef(seedAnchor);

  /**
   * Whether `execTime` was typed by the user IN THIS DIALOG -- the only
   * thing that may outrank the strategy, and only until the dialog closes.
   */
  const execTimePinned = useRef(false);

  /**
   * The strategy's entry time FROM THE SERVER, which settles the one case the
   * card cannot: a strategy edited on another machine, or one this browser
   * has never saved, has no card here at all.
   *
   * ASKED FOR AN EXPLICIT VERSION. An earlier attempt passed null, meaning
   * "whatever is latest", and the endpoint answered 422 every time -- it
   * requires the parameter. `version` is the row's own `latest_version` from
   * GET /api/strategies, refetched whenever Algo Trade opens and again after
   * the pencil popup updates a strategy, so it is the current one.
   *
   * The card still seeds the field first, so the dialog is never blank while
   * this is in flight. Whatever comes back REPLACES what is shown -- unless
   * the user has typed meanwhile. A failure is silent: the seed stands.
   */
  useEffect(() => {
    // No id, or no version to ask for: the request would be rejected, so the
    // seeded card value is the best answer available.
    if (strategyId == null || version == null) return undefined;
    let alive = true;

    fetchStrategyConfig(strategyId, strategyName, version)
      .then((config) => {
        if (!alive || execTimePinned.current) return;
        const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(config?.entry_time ?? '').trim());
        if (!match) return;
        const [, h, m, sec] = match;
        const real = `${h.padStart(2, '0')}:${m}${sec ? `:${sec}` : ''}`;
        entryAnchor.current = real;

        // The same leash the seed applied, now against the SERVER's entry
        // time: a saved execution time still inside it stands; anything else
        // snaps to the entry time.
        const saved = initial?.execTime ?? null;
        setExecTime(saved != null && withinLeash(real, saved) ? saved : real);
      })
      .catch(() => { /* the seeded time stands */ });

    return () => { alive = false; };
    // `initial.execTime` is read inside but deliberately NOT a dependency: it
    // is the value this dialog OPENED with, and re-running because the parent
    // re-created the object would clobber a time the user has since typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyId, strategyName, version]);

  const [activeLeg, setActiveLeg] = useState(0);
  const [legSettings, setLegSettings] = useState(() => Array.from(
    { length: legs },
    // Per leg, so a strategy that gained a leg since the last save still gets
    // a fresh one for the new position rather than undefined.
    (_, i) => ({ ...freshLeg(), ...(initial?.legs?.[i] || {}) }),
  ));
  // Which leg's Copy-To-Legs popover is open (null = none).
  const [copyOpen, setCopyOpen] = useState(null);
  // The scroll area and each leg section, so a tab click can scroll to it.
  const scrollRef = useRef(null);
  const legRefs = useRef([]);
  const [copied, setCopied] = useState(false);
  const [daysMode, setDaysMode] = useState(() => initial?.daysMode ?? 'Weekdays');
  /*
    Mon-Fri TICKED BY DEFAULT. A fresh dialog used to open with every day
    unticked, and Save then refused with "Please select execution days" --
    an extra step for the overwhelmingly normal choice. Saved settings still
    win (and always hold at least one day, since Save enforces it), and any
    chip can be ticked or unticked freely.
  */
  const [days, setDays] = useState(() => (
    initial?.days?.length ? new Set(initial.days) : new Set([1, 2, 3, 4, 5])
  ));
  const [dte, setDte] = useState(() => new Set(initial?.dte || []));
  const [dteOpen, setDteOpen] = useState(false);
  const dteRef = useRef(null);

  // Escape closes the dialog; the listener exists only while it is mounted.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A click anywhere outside the DTE picker shuts it; the listener exists only
  // while it is open. The trigger itself is inside dteRef, so its own click
  // falls through to the button's toggle rather than being treated as outside.
  useEffect(() => {
    if (!dteOpen) return undefined;
    const away = (e) => { if (!dteRef.current?.contains(e.target)) setDteOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [dteOpen]);

  // One updater for every leg field. It takes the leg INDEX because all legs
  // are rendered at once now; untouched legs keep their object identity.
  const setLeg = useCallback((index, key) => (valueOrFn) => {
    setLegSettings((was) => was.map((leg, i) => {
      if (i !== index) return leg;
      const next = typeof valueOrFn === 'function' ? valueOrFn(leg[key]) : valueOrFn;
      return { ...leg, [key]: next };
    }));
  }, []);

  // A tab scrolls its leg to the top of the list rather than swapping panels —
  // the reference stacks every leg and scrolls between them.
  const scrollToLeg = useCallback((index) => {
    setActiveLeg(index);
    const box = scrollRef.current;
    const section = legRefs.current[index];
    if (!box || !section) return;
    // Rect math, NOT offsetTop: each section is `relative`, so its offsetParent
    // is itself rather than the scroll box, and the subtraction collapsed to 0.
    const top = section.getBoundingClientRect().top
      - box.getBoundingClientRect().top
      + box.scrollTop;
    // Animate unless the viewer has asked for reduced motion, in which case
    // jump straight there.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  // Copy the SOURCE leg's settings onto the ticked ones. The source is excluded
  // so a leg is never rewritten with itself.
  const applyToLegs = (source, indexes) => {
    const targets = indexes.filter((i) => i !== source);
    if (!targets.length) return;
    setLegSettings((was) => was.map((leg, i) => (targets.includes(i) ? { ...was[source] } : leg)));
    setCopied(true);
  };

  // The confirmation is transient, as the reference shows it.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const label = 'text-[12px]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-[min(1003px,94vw)] h-[min(772px,90vh)] rounded-lg bg-white shadow-2xl flex flex-col"
           role="dialog" aria-modal="true" aria-label={`Edit execution for ${strategyName}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0">
          <h3 className="text-[16px] font-semibold" style={{ color: INK }}>
            Edit execution for {strategyName}
          </h3>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        <div className="px-5 overflow-y-auto flex-1">
          {/* Warning banner — amber rule and label on a warm tint, both sampled
              off the reference (borders (156,96,17) on #FAF7F3). */}
          {/* A BORDERED box at full content width (the reference's is 963px of
              its 1005px panel), contents centred, on ONE line. 11px rather than
              12: our font renders this sentence 992px wide against the
              reference's ~940, and 11px brings it to 910 — inside the 917
              available once the icon, gap and padding are taken off. */}
          <div className="flex items-center justify-center gap-1 px-2.5 py-2 rounded border text-[11px] whitespace-nowrap overflow-x-auto"
               style={{ backgroundColor: '#FAF7F3', borderColor: PENDING_EDGE, color: INK }}>
            <Info size={14} className="shrink-0" style={{ color: PENDING_EDGE }} />
            <span>
              Your limit and stop-loss limit orders will be monitored for 50 seconds. If the order
              remains open after this period, it will be cancelled and the strategy will be marked as an error.
            </span>
          </div>

          {/* Three top columns */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Opened from a portfolio, the multiplier and the execution days
                belong to the PORTFOLIO — they are shown in its own table and
                editing them here would give two places to set one thing. */}
            <div>
              {!fromPortfolio && (
              <>
              <p className={label} style={{ color: INK }}>Quantity Multiplier</p>
              <div className="mt-1.5 inline-flex items-center h-[34px] rounded border overflow-hidden"
                   style={{ borderColor: BORDER }}>
                <button type="button" title="Decrease quantity"
                        onClick={() => setQty((p) => String(Math.max(1, (Number(p) || 1) - 1)))}
                        className="w-[30px] h-full text-[14px]" style={{ color: MUTED }}>−</button>
                <input value={qty}
                       onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setQty(v); }}
                       className="w-[44px] h-full text-center text-[12px] outline-none" style={{ color: INK }}
                       aria-label="Quantity multiplier" />
                <button type="button" title="Increase quantity"
                        onClick={() => setQty((p) => String((Number(p) || 0) + 1))}
                        className="w-[30px] h-full text-[14px]" style={{ color: MUTED }}>+</button>
              </div>
              </>
              )}

              <div className={`${fromPortfolio ? '' : 'mt-4'} flex items-center gap-2.5`}>
                <span className={label} style={{ color: INK }}>Auto Sq Off on Margin Error</span>
                <Toggle on={autoSqOff} onClick={() => setAutoSqOff((w) => !w)} title="Auto Sq Off on Margin Error" />
              </div>
              {/* Sits UNDER the toggle, in the reference's amber italic. */}
              <p className="mt-2 text-[12px] italic leading-snug" style={{ color: PENDING_EDGE }}>
                Lots and MTM based Overall SL / Target / Trail SL will be multiplied.
              </p>
            </div>

            <div>
              <p className={label} style={{ color: INK }}>Trade monitoring</p>
              <div className="mt-1.5 inline-flex items-center gap-2">
                {['on LTP', 'on Candle Close'].map((mode) => (
                  <button key={mode} type="button" onClick={() => setMonitorMode(mode)}
                          className="h-[32px] px-3.5 rounded-full border text-[12px] whitespace-nowrap"
                          style={monitorMode === mode
                            ? { borderColor: BLUE, backgroundColor: TINT_SELECTED, color: BLUE, fontWeight: 500 }
                            : { borderColor: BORDER, color: INK, backgroundColor: '#FFFFFF' }}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={label} style={{ color: INK }}>Strategy execution time</p>
              <span className="mt-1.5 inline-flex items-center gap-2 h-[34px] px-2.5 rounded border bg-white"
                    style={{ borderColor: BORDER }}>
                <input type="time" step="1" value={execTime}
                       onChange={(e) => {
                         // Typed by hand: the fetch above must not clobber it.
                         execTimePinned.current = true;
                         setExecTime(e.target.value);
                       }}
                       className="text-[12px] outline-none bg-transparent" style={{ color: INK }}
                       aria-label="Strategy execution time" />
              </span>
            </div>
          </div>

          {/* Leg tabs */}
          <div className="mt-5 flex items-center gap-3 border-b px-2"
               style={{ borderColor: BORDER, backgroundColor: HEAD_BG }}>
            {legSettings.map((_, i) => (
              <button key={i} type="button" onClick={() => scrollToLeg(i)}
                      className="px-3 py-2 text-[13px] -mb-px border-b-2"
                      // Active tab is NAVY text over a navy underline, not ink.
                      style={i === activeLeg
                        ? { color: NAVY, borderColor: NAVY, fontWeight: 600 }
                        : { color: MUTED, borderColor: 'transparent' }}>
                Leg {i + 1}
              </button>
            ))}
            {copied && (
              /* Sampled off the reference: a filled check and label both in
                 #207D46, not the page ink. */
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: '#207D46' }}>
                <CheckCircle2 size={15} fill="#207D46" color="#FFFFFF" />
                Applied Changes to Legs
              </span>
            )}
          </div>

          {/* Every leg, stacked in one scroll area — the tabs above move
              between them. Leg counts are small (2-5), so rendering them all
              costs less than the remount a tab switch would force, and it is
              what the reference shows. */}
          <div ref={scrollRef} className="max-h-[420px] overflow-y-auto">
            {legSettings.map((legRow, i) => (
              <div
                key={i}
                ref={(el) => { legRefs.current[i] = el; }}
                className="relative py-4"
              >
                <div className="flex items-start justify-between">
                  <p className="text-[14px] font-semibold" style={{ color: INK }}>Leg {i + 1}</p>
                  <div className="relative">
                    <button type="button" onClick={() => setCopyOpen(copyOpen === i ? null : i)}
                            className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: NAVY }}>
                      <Copy size={13} />
                      Copy To Legs
                    </button>
                    {copyOpen === i && (
                      <CopyToLegs
                        legCount={legs}
                        onApply={(indexes) => applyToLegs(i, indexes)}
                        onClose={() => setCopyOpen(null)}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-x-8">
                  <div>
                    <Row label="NRML/MIS">
                      <Select value={legRow.product} onChange={setLeg(i, 'product')} options={NRML} />
                    </Row>
                    <Row label="Tgt/SL Ref Price" info>
                      <Select value={legRow.refPrice} onChange={setLeg(i, 'refPrice')} options={REF_PRICE} />
                    </Row>
                    <Row label="Delay entry by" info>
                      <NumberField value={legRow.delayEntry} onChange={setLeg(i, 'delayEntry')} suffix="sec" />
                    </Row>
                  </div>

                  <div>
                    <Row label={<b className="font-semibold">Entry Order Type</b>}>
                      <Select value={legRow.entryType} onChange={setLeg(i, 'entryType')} options={ORDER_TYPE} />
                    </Row>
                    {/* MPP is a market-protection order: it carries no buffers,
                        so the three fields below it go away entirely. */}
                    {legRow.entryType !== 'MPP' && (
                      <>
                        <Row label="Buffer type">
                          <Select value={legRow.entryBufferType} onChange={setLeg(i, 'entryBufferType')} options={BUFFER_TYPE} />
                        </Row>
                        <Row label="Trigger buffer">
                          <NumberField value={legRow.entryTrigger} onChange={setLeg(i, 'entryTrigger')} />
                        </Row>
                        <Row label="Limit buffer">
                          <NumberField value={legRow.entryLimit} onChange={setLeg(i, 'entryLimit')} />
                        </Row>
                      </>
                    )}
                  </div>

                  <div>
                    <Row label={<b className="font-semibold">Exit Order Type</b>}>
                      <Select value={legRow.exitType} onChange={setLeg(i, 'exitType')} options={ORDER_TYPE} />
                    </Row>
                    {legRow.exitType !== 'MPP' && (
                      <>
                        <Row label="Buffer type" info>
                          <Select value={legRow.exitBufferType} onChange={setLeg(i, 'exitBufferType')} options={BUFFER_TYPE} />
                        </Row>
                        <Row label="Trigger buffer">
                          <NumberField value={legRow.exitTrigger} onChange={setLeg(i, 'exitTrigger')} />
                        </Row>
                        <Row label="Limit buffer">
                          <NumberField value={legRow.exitLimit} onChange={setLeg(i, 'exitLimit')} />
                        </Row>
                      </>
                    )}
                    <Row label="Monitoring">
                      <Select value={legRow.monitoring} onChange={setLeg(i, 'monitoring')} options={MONITORING}
                              width="w-[116px]" />
                    </Row>
                    <Row label="Frequency">
                      <NumberField value={legRow.frequency} onChange={setLeg(i, 'frequency')} suffix="sec" />
                    </Row>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-4 border-t shrink-0"
             style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-3 flex-wrap">
            {!fromPortfolio && (
            <>
            <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: MUTED }}>
              Execution Days
              <Info size={12} />
            </span>
            <span className="inline-flex items-center rounded border overflow-hidden" style={{ borderColor: BORDER }}>
              {['Weekdays', 'DTE'].map((mode) => (
                <button key={mode} type="button" onClick={() => setDaysMode(mode)}
                        className="h-[26px] px-3.5 text-[12px]"
                        style={daysMode === mode
                          ? { backgroundColor: TINT_SELECTED, color: BLUE, fontWeight: 500 }
                          : { backgroundColor: '#FFFFFF', color: INK }}>
                  {mode}
                </button>
              ))}
            </span>

            {daysMode === 'Weekdays' ? (
              <span className="inline-flex items-center gap-2">
                {WEEKDAYS.map(([text, day]) => {
                  const on = days.has(day);
                  return (
                    <button key={text} type="button"
                            onClick={() => setDays((was) => {
                              const next = new Set(was);
                              if (next.has(day)) next.delete(day); else next.add(day);
                              return next;
                            })}
                            className="inline-flex shrink-0 items-center justify-center w-[26px] h-[26px] rounded-full border text-[12px] bg-white"
                            style={on ? { borderColor: BLUE, color: BLUE, backgroundColor: TINT_SELECTED }
                                      : { borderColor: '#C9CBCF', color: '#9CA3AF' }}>
                      {text}
                    </button>
                  );
                })}
              </span>
            ) : (
              <span ref={dteRef} className="relative inline-block">
                <button type="button" onClick={() => setDteOpen((w) => !w)}
                        className="inline-flex items-center justify-between gap-2 h-[30px] px-3 rounded border text-[12px] bg-white min-w-[118px]"
                        style={{ borderColor: dte.size || dteOpen ? BLUE : BORDER, color: INK }}>
                  {dte.size === DTE_OPTIONS.length ? 'All Selected'
                    : dte.size ? `${dte.size} Selected` : 'Select DTE'}
                  <ChevronDown size={14} />
                </button>
                {dteOpen && (
                  <span className="absolute left-0 bottom-full mb-1 z-20 w-[150px] max-h-[240px] overflow-y-auto rounded-md border bg-white shadow-lg block"
                        style={{ borderColor: BORDER }}>
                    <label className="flex items-center gap-2.5 px-3 h-[34px] text-[12px] cursor-pointer hover:bg-[#F5F5F5]"
                           style={{ color: INK }}>
                      <input type="checkbox" className="w-4 h-4 shrink-0 accent-[#0782DA]"
                             checked={dte.size === DTE_OPTIONS.length}
                             onChange={() => setDte(dte.size === DTE_OPTIONS.length ? new Set() : new Set(DTE_OPTIONS))} />
                      Select All
                    </label>
                    {DTE_OPTIONS.map((d) => (
                      <label key={d} className="flex items-center gap-2.5 px-3 h-[34px] text-[12px] cursor-pointer hover:bg-[#F5F5F5]"
                             style={{ color: INK }}>
                        <input type="checkbox" className="w-4 h-4 shrink-0 accent-[#0782DA]"
                               checked={dte.has(d)}
                               onChange={() => setDte((was) => {
                                 const next = new Set(was);
                                 if (next.has(d)) next.delete(d); else next.add(d);
                                 return next;
                               })} />
                        {d}
                      </label>
                    ))}
                  </span>
                )}
              </span>
            )}
            </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button type="button" onClick={onClose} className="text-[13px]" style={{ color: INK }}>
              Cancel
            </button>
            <button type="button"
                    onClick={() => {
                      // Execution days are required. The button stays clickable
                      // rather than greying out, so pressing it explains what is
                      // missing instead of doing nothing.
                      const chosen = daysMode === 'DTE' ? dte.size : days.size;
                      if (chosen === 0) {
                        onNotify?.('Please select execution days', 'error');
                        return;
                      }

                      /*
                        THE 59-SECOND LEASH. Execution may begin at most 59
                        seconds before entry and never after -- with entry
                        10:35:00 that is 10:34:01 to 10:35:00 inclusive.

                        Refused on SAVE, not while typing, so the field stays
                        editable. A genuinely different time means changing
                        the ENTRY TIME in the builder; this dialog follows it.
                        With no entry time known there is nothing to compare
                        against and the save proceeds.
                      */
                      if (entryAnchor.current != null
                          && !withinLeash(entryAnchor.current, execTime)) {
                        onNotify?.('Strategy Execution Time can only be upto 59s before Entry Time', 'error');
                        return;
                      }

                      onConfirm?.({
                        qty, autoSqOff, monitorMode, execTime, legs: legSettings,
                        daysMode,
                        days: [...days],
                        dte: [...dte],
                        dteAll: dte.size === DTE_OPTIONS.length,
                      });
                    }}
                    className="inline-flex items-center justify-center h-[34px] px-5 rounded text-[13px] font-medium text-white transition-colors"
                    style={{ backgroundColor: THEME }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
              Update Execution Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutionDialog;
