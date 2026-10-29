import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Sun, Repeat, X, CalendarSync, SquarePen, Eye, AlertCircle } from 'lucide-react';
import { INK, MUTED, BORDER, BLUE, BLUE_TINT, NAVY, THEME, DEEP, ACTIVATE_HOVER, HEAD_BG, RULE, WARN_EDGE, WARN_TEXT } from './palette';
import { useSavedStrategies } from '../../context/SavedStrategiesContext';
import { fetchPortfolios } from '../../services/libraryApi';
import TimePicker from './TimePicker';
import { formatDisplay } from './timeValue';

const ExecutionDialog = lazy(() => import('./ExecutionDialog'));
const StrategyReadOnly = lazy(() => import('./StrategyReadOnly'));

/**
 * The deploy screen behind a portfolio's Activate button: its strategies split
 * by kind, with the broker picker and the Strategies tab's execution dialog.
 *
 * GET /api/portfolios returns only a `strategies` field, so each entry is
 * matched against the saved-strategy cards to recover its type, symbol and
 * times. An entry with no card still renders -- it shows dashes.
 */

// The kinds the reference groups by, in its order, with its icons.
const WEEKDAY_LABELS = ['M', 'T', 'W', 'TH', 'F', 'SA', 'SU'];

const GROUPS = [
  { key: 'intraday', label: 'Intraday Strategies', Icon: Sun, tint: '#F59E0B', reentry: true },
  { key: 'btst', label: 'BTST Strategies', Icon: Repeat, tint: '#EC4899' },
  { key: 'positional', label: 'Positional Strategies', Icon: CalendarSync, tint: '#0EA5E9' },
  { key: 'sequential', label: 'Sequential Strategies', Icon: Repeat, tint: '#8B5CF6' },
];

/** "Select Broker" — the reference's empty state until a broker is connected. */
const BrokerDialog = ({ onSetupBroker, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-full max-w-[480px] rounded-lg bg-white shadow-2xl flex flex-col"
           role="dialog" aria-modal="true" aria-label="Select Broker">
        <div className="flex items-center justify-between px-6 py-4">
          <h3 className="text-[16px] font-semibold" style={{ color: INK }}>Select Broker</h3>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-5">
          <p className="text-[17px] font-medium" style={{ color: INK }}>No Brokers found</p>
          <button type="button" onClick={onSetupBroker}
                  className="h-[38px] px-5 rounded text-[13px] font-medium text-white transition-colors"
                  style={{ backgroundColor: THEME }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}
                  onMouseDown={(e) => { e.currentTarget.style.backgroundColor = DEEP; }}
                  onMouseUp={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}>
            Setup a Broker
          </button>
        </div>
        <div className="px-6 pb-5">
          {/* Hover and press use the app's theme blue, matching Setup a Broker
              above so the two read as one pair. */}
          <button type="button" onClick={onClose}
                  className="w-full h-[38px] rounded border text-[13px] font-medium bg-white transition-colors"
                  style={{ borderColor: THEME, color: THEME }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = THEME;
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.color = THEME;
                  }}
                  onMouseDown={(e) => { e.currentTarget.style.backgroundColor = DEEP; }}
                  onMouseUp={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};


/**
 * An entry/exit cell. The pencil appears while the row is hovered and opens the
 * platform's own time picker. Every group is time-only — BTST used to carry a
 * date line and a calendar, which the reference does not show here.
 * `locked` renders plain text with no pencil at all: the auto-activation
 * screen shows these read-only.
 */
const TimeCell = ({ value, onChange, locked }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  // The panel is portalled to <body>, so it needs this element's rect to place
  // itself; it also must not count as "outside" for the click-away below.
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      const insideCell = boxRef.current?.contains(e.target);
      const insidePanel = e.target.closest?.('[aria-label="Pick a time"]');
      if (!insideCell && !insidePanel) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const shown = formatDisplay(value);

  return (
    <span
      ref={(el) => { boxRef.current = el; setAnchor(el); }}
      className={`relative inline-flex items-center gap-1.5 -mx-1.5 px-1.5 py-0.5 rounded whitespace-nowrap ${locked ? '' : 'hover:bg-[#F5F5F5]'}`}
      style={{ color: INK }}
    >
      <span>{shown}</span>
      {!locked && (
        <button
          type="button"
          onClick={() => setOpen((w) => !w)}
          title="Edit time"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          style={{ color: NAVY, lineHeight: 0 }}
        >
          <SquarePen size={14} />
        </button>
      )}
      {open && !locked && (
        <TimePicker
          value={value}
          anchor={anchor}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
};


/** The confirmation behind "Enable Auto Activation" (image 12 of the reference). */
const AutoActivationDialog = ({ onClose, onConfirm }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-full max-w-[440px] rounded-lg bg-white shadow-2xl"
           role="dialog" aria-modal="true" aria-label="Enable Auto-Activation">
        <div className="flex items-center justify-between px-6 py-4">
          <h3 className="text-[16px] font-semibold" style={{ color: INK }}>Enable Auto-Activation</h3>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>
        <div className="px-6 pb-2">
          <span className="inline-flex items-center justify-center w-[52px] h-[52px] rounded-lg"
                style={{ backgroundColor: '#E8F4FB', color: BLUE }}>
            <CalendarSync size={26} />
          </span>
          <p className="mt-4 text-[14px] font-medium" style={{ color: BLUE }}>
            Auto-Activation will not start today.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: INK }}>
            If you enable Auto-Activation now, strategies will only run from tomorrow,
            depending on your selected weekdays, market holidays, and DTE rules.
          </p>
        </div>
        <div className="flex items-center justify-end gap-4 px-6 py-5">
          <button type="button" onClick={onClose} className="text-[13px]" style={{ color: INK }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
                  className="inline-flex items-center justify-center h-[38px] px-5 rounded text-[13px] font-medium text-white transition-colors"
                  style={{ backgroundColor: THEME }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
            Enable Auto Activation
          </button>
        </div>
      </div>
    </div>
  );
};

const DeployPortfolio = ({ portfolio, onBack, onEditPortfolio, onSetupBroker, onNotify, startInAuto = false }) => {
  const { strategies: cards } = useSavedStrategies();

  const [brokerOpen, setBrokerOpen] = useState(false);
  const [execFor, setExecFor] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  // Edits to a row's entry/exit, keyed by row. Only what the user changed is
  // stored, so the rows array itself stays untouched and memoised.
  const [times, setTimes] = useState(() => ({}));
  // Rows whose execution has been opened at least once for THIS portfolio: the
  // button reads "Setup Execution" the first time and "Edit Execution" after.
  const [touched, setTouched] = useState(() => new Set());
  // The row whose read-only strategy view is open.
  const [viewing, setViewing] = useState(null);

  // Quantity, DTE and weekdays belong to the PORTFOLIO, not to the execution
  // dialog — read from its own record, with weekdays as the fallback when the
  // record says nothing (which is what the reference shows by default).
  const settings = portfolio?.raw || portfolio || {};
  const dteMode = String(settings.dteTab || '').toLowerCase() === 'dte';
  const dteLabel = Array.isArray(settings.dte) && settings.dte.length
    ? `${[...settings.dte].sort((a, b) => a - b).join(',')}...`
    : '0,1,2,3...';
  const qtyMultiplier = settings.qtyMultiplier ?? 1;
  // The auto-activation screen: the same table, but times are read-only and the
  // footer offers Enable Auto Activation instead of Activate Selected.
  // Only a row's own "Enable Auto Activation" opens this screen in auto mode —
  // Activate Selected is inert in the reference, so there is no path from the
  // footer, and this never changes after mount.
  const autoMode = Boolean(startInAuto);
  const [autoConfirm, setAutoConfirm] = useState(false);
  // The one control that stays live on the auto-activation screen.
  const [agreed, setAgreed] = useState(false);
  // Every row starts ticked, as the reference shows ("1 / 1 Selected").
  const [picked, setPicked] = useState(null);

  // Each portfolio entry joined to its saved card. The API gives ids (or small
  // objects); the card supplies type, symbol and times.
  const rows = useMemo(() => {
    const byId = new Map(cards.map((c) => [String(c.id), c]));
    const byName = new Map(cards.map((c) => [String(c.name).toLowerCase(), c]));
    return (portfolio?.strategies || []).map((entry, i) => {
      const isObject = entry && typeof entry === 'object';
      const id = isObject ? (entry.strategy_id ?? entry.id) : entry;
      const name = isObject ? (entry.strategy_name ?? entry.name) : null;
      const card = byId.get(String(id)) || (name ? byName.get(String(name).toLowerCase()) : null) || {};
      return {
        key: `${id ?? name ?? 'row'}-${i}`,
        id: id ?? card.id ?? null,
        name: name || card.name || 'Untitled',
        symbol: String(card.symbol || '').toUpperCase(),
        type: String(card.strategy_type || 'intraday').toLowerCase(),
        entry: card.entry_time || '',
        exit: card.exit_time || '',
        legCount: Number(card.leg_count) || 1,
        version: card.version ?? null,
      };
    });
  }, [portfolio, cards]);

  const grouped = useMemo(() => GROUPS
    .map((g) => ({ ...g, rows: rows.filter((r) => r.type === g.key) }))
    .filter((g) => g.rows.length), [rows]);

  // null means "nothing touched yet" -> everything counts as selected.
  const isPicked = (key) => (picked === null ? true : picked.has(key));
  const toggleRow = (key) => setPicked((was) => {
    const next = new Set(was === null ? rows.map((r) => r.key) : was);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleGroup = (groupRows) => setPicked((was) => {
    const next = new Set(was === null ? rows.map((r) => r.key) : was);
    const allOn = groupRows.every((r) => next.has(r.key));
    groupRows.forEach((r) => { if (allOn) next.delete(r.key); else next.add(r.key); });
    return next;
  });

  return (
    <div className="-mx-4 sm:-mx-5 -mt-6 pb-24" style={{ color: INK }}>
      {brokerOpen && (
        <BrokerDialog
          onClose={() => setBrokerOpen(false)}
          onSetupBroker={() => { setBrokerOpen(false); onSetupBroker?.(); }}
        />
      )}
      {autoConfirm && (
        <AutoActivationDialog
          onClose={() => setAutoConfirm(false)}
          onConfirm={() => {
            setAutoConfirm(false);
            onNotify?.('Auto activation enabled', 'success');
          }}
        />
      )}
      {viewing && (
        <Suspense fallback={null}>
          <StrategyReadOnly
            strategy={viewing}
            onClose={() => setViewing(null)}
            onNotify={onNotify}
          />
        </Suspense>
      )}
      {execFor && (
        <Suspense fallback={null}>
          <ExecutionDialog
            strategyName={execFor.name}
            legCount={execFor.legCount}
            fromPortfolio
            onClose={() => setExecFor(null)}
            onConfirm={() => {
              setExecFor(null);
              onNotify?.('Updated execution setup successfully', 'success');
            }}
          />
        </Suspense>
      )}

      <div className="px-7 pt-[18px]">
        <p className="text-[12px]" style={{ color: MUTED }}>
          <button type="button" onClick={onBack} className="hover:underline">Algo Trade</button>
          <span className="mx-1.5">›</span>
          <span style={{ color: INK }}>{portfolio?.name}</span>
        </p>

        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onBack} title="Back" style={{ color: INK }}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-[22px] font-medium" style={{ color: INK }}>{portfolio?.name}</h1>
        </div>

        <div className="mt-7 flex items-center justify-between gap-4 flex-wrap">
          {/* Both copies of this control — here and on the auto-activation
              screen below — carry the same pale blue fill, border and label. */}
          {autoMode ? <span /> : <button type="button" onClick={() => setBrokerOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 h-[36px] px-4 rounded-md border text-[13px] whitespace-nowrap"
                  style={{ borderColor: BLUE, color: BLUE, backgroundColor: BLUE_TINT }}>
            Select Broker
            {brokerOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>}
          <button type="button" onClick={async () => {
                    // Refresh the list before handing over, so the portfolio
                    // screen opens against current data rather than a stale copy.
                    try { await fetchPortfolios(); } catch { /* navigate anyway */ }
                    onEditPortfolio?.(portfolio?.name);
                  }}
                  className="inline-flex items-center justify-center h-[36px] w-[113px] rounded-xs border text-[13px] font-medium bg-white transition-colors"
                  style={{ borderColor: NAVY, color: NAVY }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = THEME;
                    e.currentTarget.style.borderColor = THEME;
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.borderColor = NAVY;
                    e.currentTarget.style.color = NAVY;
                  }}>
            Edit Portfolio
          </button>
        </div>

        {autoMode && (
          /* Broker picker + the agreement line. The reference ends that
             sentence with a "Know more" link; left off deliberately. */
          <div className="mt-5 px-4 py-4 rounded border"
               style={{ borderColor: '#CFE6F5', backgroundColor: '#F5FBFE' }}>
            <div className="flex items-center gap-3">
              <span className="text-[13px]" style={{ color: BLUE }}>Auto activate with</span>
              {/* Same pale blue fill as the activate screen's copy — the
                  reference shows this tinted, not white, even though it sits
                  inside the agreement band. */}
              <button type="button" onClick={() => setBrokerOpen(true)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 h-[36px] px-4 rounded-md border text-[13px] whitespace-nowrap"
                      style={{ borderColor: BLUE, color: BLUE, backgroundColor: BLUE_TINT }}>
                Select Broker
                <ChevronDown size={15} />
              </button>
            </div>
            <label className="mt-4 flex items-start gap-2.5 text-[13px] cursor-pointer" style={{ color: INK }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-[#0782DA]"
              />
              I agree that under Auto Activation, Intraday and BTST strategies will run
              automatically as per set entries &amp; exits, using my selected brokers and
              quantity multipliers.
            </label>
          </div>
        )}

        {grouped.length === 0 && (
          <p className="mt-16 text-center text-[14px]" style={{ color: MUTED }}>
            This portfolio has no strategies yet.
          </p>
        )}

        {grouped.map(({ key, label, Icon, tint, rows: groupRows, reentry }) => {
          const open = !collapsed.has(key);
          const on = groupRows.filter((r) => isPicked(r.key)).length;
          return (
            <section key={key} className="mt-9">
              <div className="flex items-center gap-3">
                <button type="button" title={open ? 'Collapse' : 'Expand'}
                        onClick={() => setCollapsed((was) => {
                          const next = new Set(was);
                          if (next.has(key)) next.delete(key); else next.add(key);
                          return next;
                        })}
                        className="w-[26px] h-[26px] rounded-full border flex items-center justify-center"
                        style={{ borderColor: BORDER, color: INK }}>
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <span className="w-[26px] h-[26px] rounded flex items-center justify-center"
                      style={{ backgroundColor: `${tint}22`, color: tint }}>
                  <Icon size={15} />
                </span>
                <h2 className="text-[16px] font-medium" style={{ color: INK }}>{label}</h2>
                <span className="text-[13px]" style={{ color: MUTED }}>
                  ({on} / {groupRows.length} Selected)
                </span>
                {autoMode && key === 'positional' && (
                  <span className="ml-auto inline-flex items-center gap-2 h-[34px] px-3 rounded-md border text-[13px]"
                        style={{ borderColor: WARN_EDGE, color: WARN_TEXT, backgroundColor: '#FFFFFF' }}>
                    <AlertCircle size={15} className="shrink-0" />
                    Positional Strategies can not be auto-activated
                  </span>
                )}
              </div>

              {open && (
                <div className="mt-4 overflow-x-auto">
                  <div className="deploy-table-wide min-w-[1540px]">
                    <div className="deploy-grid grid items-center gap-x-4 px-4 py-2.5 text-[13px] border-x border-b"
                         style={{ backgroundColor: HEAD_BG,
                                  color: MUTED, borderColor: BORDER,
                                  borderLeftColor: 'transparent', borderRightColor: 'transparent' }}>
                      <span className="flex items-center">
                        <input type="checkbox" className="w-4 h-4 accent-[#0782DA]"
                               checked={groupRows.every((r) => isPicked(r.key))}
                               onChange={() => toggleGroup(groupRows)}
                               disabled={autoMode}
                               aria-label={`Select all ${label}`} />
                      </span>
                      <span>Strategies</span>
                      {/* Every data column is centred — labels AND values — so the
                          step from one to the next is the same all the way across
                          and each label sits over its own value. Left-aligning
                          these while centring only Weekdays is what made the
                          Weekdays -> Entry gap read narrower than Entry -> Exit. */}
                      <span className="text-center">Quantity multiplier</span>
                      <span className="text-center">{dteMode ? 'DTE' : 'Weekdays'}</span>
                      <span className="text-center">Entry</span>
                      <span className="text-center">Exit</span>
                      <span className="text-center">{reentry ? 'No Reentry After' : ''}</span>
                      <span />
                    </div>

                    {groupRows.map((row) => (
                      <div key={row.key}
                           className="deploy-grid group grid items-center gap-x-4 px-4 h-[66px] mt-3 text-[13px] border rounded bg-white"
                           style={{ borderColor: BLUE }}>
                        <span className="flex items-center">
                          <input type="checkbox" className="w-4 h-4 accent-[#0782DA]"
                                 checked={isPicked(row.key)}
                                 onChange={() => toggleRow(row.key)}
                                 disabled={autoMode}
                                 aria-label={`Select ${row.name}`} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-[14px]" style={{ color: INK }}>
                            <span className="truncate">{row.name}</span>
                            <button
                              type="button"
                              onClick={() => setViewing(row)}
                              title={`View ${row.name}`}
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: NAVY, lineHeight: 0 }}
                            >
                              <Eye size={18} />
                            </button>
                          </span>
                          <span className="block mt-0.5 text-[12px]" style={{ color: MUTED }}>{row.symbol || '—'}</span>
                        </span>
                        <span className="text-center" style={{ color: INK, opacity: autoMode ? 0.45 : 1 }}>{qtyMultiplier}</span>
                        <span className="flex justify-center" style={{ opacity: autoMode ? 0.45 : 1 }}>
                          {dteMode ? (
                            <span className="inline-flex items-center h-[24px] px-3 rounded-full text-[12px]"
                                  style={{ backgroundColor: '#F3F3F3', color: INK }}>
                              {dteLabel}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-[3px]">
                              {WEEKDAY_LABELS.map((d) => (
                                <span key={d}
                                      className="inline-flex shrink-0 items-center justify-center w-[24px] h-[24px] rounded-full border text-[11px]"
                                      style={{ borderColor: BORDER, color: '#2A2A2A', backgroundColor: '#F3F3F3' }}>
                                  {d}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                        <span className="flex justify-center" style={{ opacity: autoMode ? 0.45 : 1 }}>
                          <TimeCell
                            locked={autoMode}
                            value={times[`${row.key}:in`] ?? row.entry}
                            onChange={(v) => setTimes((was) => ({ ...was, [`${row.key}:in`]: v }))}
                          />
                        </span>
                        <span className="flex justify-center" style={{ opacity: autoMode ? 0.45 : 1 }}>
                          <TimeCell
                            locked={autoMode}
                            value={times[`${row.key}:out`] ?? row.exit}
                            onChange={(v) => setTimes((was) => ({ ...was, [`${row.key}:out`]: v }))}
                          />
                        </span>
                        <span className="text-center" style={{ color: INK }}>{reentry ? '-' : ''}</span>
                        <span className="text-right">
                          <button type="button" onClick={() => { setTouched((w) => new Set(w).add(row.key)); setExecFor(row); }}
                                  className="text-[13px] font-semibold hover:underline underline-offset-2" style={{ color: NAVY }}>
                            {touched.has(row.key) ? 'Edit Execution' : 'Setup Execution'}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Action bar, pinned to the foot of the screen as the reference has it. */}
      <div className="fixed bottom-0 right-0 left-0 flex justify-end px-7 py-3 border-t bg-white z-20"
           style={{ borderColor: RULE }}>
        {/* "Activate Selected" is inert in the reference — activation happens
            through Enable Auto Activation, which needs the agreement ticked. */}
        <button type="button" disabled={!autoMode || !agreed}
                onClick={() => setAutoConfirm(true)}
                className="inline-flex items-center justify-center h-[40px] px-6 rounded text-[13px] font-medium text-white transition-colors disabled:cursor-default"
                style={{ backgroundColor: (autoMode && agreed) ? THEME : '#C9CBCF' }}
                onMouseEnter={(e) => { if (autoMode && agreed) e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                onMouseLeave={(e) => { if (autoMode && agreed) e.currentTarget.style.backgroundColor = THEME; }}>
          {autoMode ? 'Enable Auto Activation' : 'Activate Selected'}
        </button>
      </div>
    </div>
  );
};

/**
 * ONE column track for every group.
 *
 * It used to drop the "No Reentry After" column for the groups that have no
 * re-entry, which made those sections one column narrower — so Quantity
 * multiplier / Weekdays / Entry / Exit sat at different x positions in
 * Intraday than in BTST and Positional, and the three tables did not line up.
 * Only "Setup Execution" appeared aligned, because it is right-aligned against
 * the same right edge. The column is now always present and simply left empty
 * where it does not apply.
 */
/*
 * The row/header column track now lives in src/index.css as `.deploy-grid`,
 * not here: a media query has to be able to restate it for narrow screens
 * (a rotated monitor is ~1080px wide), and an inline style cannot be
 * overridden by one. The desktop track is unchanged — see that file for the
 * reasoning behind the fixed minimums and the equal data columns.
 */
export default DeployPortfolio;
