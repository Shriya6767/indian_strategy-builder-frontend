import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Funnel, ChevronUp, ChevronDown } from 'lucide-react';
import { INK, MUTED, BORDER, GREEN, THEME, ACTIVATE_HOVER, SOFT_BG, BLUE } from './palette';
import { DEFAULT_RESTART_TIME } from './restartSchedule';
import RestartTimeField from './RestartTimeField';

/**
 * Restart every paused deployment, grouped by the broker each runs on.
 *
 * SUBMIT IS PER BROKER -- each group sends only its own checked rows, because
 * brokers are separate connections and one being logged out must not block the
 * other. Everything is checked on open (the button says Restart ALL).
 * "Apply to all" sets one time across every checked row, for the common case
 * of bringing them all back at the market open.
 */

/** A square checkbox in the product's blue. */
const Check = ({ on, onChange, label }) => (
  <button type="button" onClick={onChange} aria-pressed={on} aria-label={label}
          className="w-[14px] h-[14px] rounded-[3px] border shrink-0 inline-flex items-center justify-center"
          style={{
            borderColor: on ? BLUE : BORDER,
            backgroundColor: on ? BLUE : '#FFFFFF',
          }}>
    {on && (
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1 5.2 3.8 8 9 2.2" fill="none" stroke="#FFFFFF" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </button>
);

const RestartAllDialog = ({ groups = [], onClose, onSubmit }) => {
  const allIds = useMemo(
    () => groups.flatMap((g) => g.rows.map((r) => String(r.id))),
    [groups],
  );

  // Checked by default, and every row opens on the same default time.
  const [checked, setChecked] = useState(() => new Set(allIds));
  const [times, setTimes] = useState(() => Object.fromEntries(
    allIds.map((id) => [id, DEFAULT_RESTART_TIME]),
  ));
  const [collapsed, setCollapsed] = useState(() => new Set());

  // The "apply to all" panel, and the time it is holding.
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTime, setApplyTime] = useState(DEFAULT_RESTART_TIME);
  const applyRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleRow = (id) => setChecked((was) => {
    const next = new Set(was);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const setTime = (id, value) => setTimes((was) => ({ ...was, [id]: value }));

  const toggleGroup = (group) => {
    const ids = group.rows.map((r) => String(r.id));
    const every = ids.every((id) => checked.has(id));
    setChecked((was) => {
      const next = new Set(was);
      ids.forEach((id) => (every ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const collapse = (brokerId) => setCollapsed((was) => {
    const next = new Set(was);
    if (next.has(brokerId)) next.delete(brokerId); else next.add(brokerId);
    return next;
  });

  /** One time onto every CHECKED row — unticked rows are not being restarted. */
  const applyToAll = () => {
    setTimes((was) => {
      const next = { ...was };
      allIds.forEach((id) => { if (checked.has(id)) next[id] = applyTime; });
      return next;
    });
    setApplyOpen(false);
  };

  const submit = (group) => {
    const picks = group.rows
      .filter((r) => checked.has(String(r.id)))
      .map((r) => ({ id: r.id, time: times[String(r.id)] || DEFAULT_RESTART_TIME }));
    if (picks.length) onSubmit?.(group, picks);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-full max-w-[460px] max-h-[86vh] flex flex-col rounded-lg bg-white shadow-2xl"
           role="dialog" aria-modal="true" aria-label="Restart all deployments">

        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Restart All</h2>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-3">
          <span className="text-[12px]" style={{ color: MUTED }}>Apply to all</span>
          <span ref={applyRef} className="relative">
            <button type="button" onClick={() => setApplyOpen((was) => !was)}
                    className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded border text-[12px] bg-white"
                    style={{ borderColor: BORDER, color: INK }}>
              Schedule Restart
              {applyOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {applyOpen && (
              <>
                <span className="fixed inset-0 z-[54]" onClick={() => setApplyOpen(false)} />
                <span className="absolute right-0 top-[30px] z-[56] flex items-center gap-2 p-2.5 rounded-md border bg-white shadow-lg whitespace-nowrap"
                      style={{ borderColor: BORDER }}>
                  <span className="text-[12px]" style={{ color: MUTED }}>Restart at</span>
                  <RestartTimeField value={applyTime} onChange={setApplyTime} />
                  <button type="button" onClick={applyToAll}
                          className="h-[26px] px-3 rounded text-[12px] font-semibold text-white transition-colors"
                          style={{ backgroundColor: THEME }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
                    Apply
                  </button>
                </span>
              </>
            )}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {groups.map((group) => {
            const ids = group.rows.map((r) => String(r.id));
            const picked = ids.filter((id) => checked.has(id)).length;
            const shut = collapsed.has(String(group.brokerId));

            return (
              <div key={group.brokerId} className="mb-4 rounded border"
                   style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium min-w-0"
                        style={{ color: INK }}>
                    <Funnel size={13} style={{ color: GREEN }} className="shrink-0" />
                    <span className="truncate">{group.brokerName}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center h-[19px] px-2 rounded text-[10px] font-semibold"
                          style={group.live
                            ? { color: GREEN, backgroundColor: '#E6F3EB' }
                            : { color: MUTED, backgroundColor: SOFT_BG }}>
                      {group.live ? 'LOGGED IN' : 'LOGGED OUT'}
                    </span>
                    <button type="button" onClick={() => collapse(String(group.brokerId))}
                            title={shut ? 'Expand' : 'Collapse'} style={{ color: MUTED }}>
                      {shut ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </button>
                  </span>
                </div>

                {!shut && (
                  <>
                    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t"
                         style={{ borderColor: BORDER }}>
                      <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: INK }}>
                        <Check on={picked === ids.length && ids.length > 0}
                               onChange={() => toggleGroup(group)}
                               label={`Select all on ${group.brokerName}`} />
                        Select All
                      </span>
                      <span className="text-[12px]" style={{ color: MUTED }}>Restart at</span>
                    </div>

                    {group.rows.map((row) => {
                      const id = String(row.id);
                      return (
                        <div key={id}
                             className="flex items-center justify-between gap-3 px-3 py-2 border-t"
                             style={{ borderColor: BORDER }}>
                          <span className="inline-flex items-center gap-2 text-[12px] min-w-0"
                                style={{ color: INK }}>
                            <Check on={checked.has(id)} onChange={() => toggleRow(id)}
                                   label={`Restart ${row.name}`} />
                            <span className="truncate">
                              {row.name}
                              {row.legs ? <span style={{ color: MUTED }}> ({row.legs})</span> : null}
                            </span>
                          </span>
                          <RestartTimeField value={times[id] || DEFAULT_RESTART_TIME}
                                            onChange={(v) => setTime(id, v)}
                                            disabled={!checked.has(id)} />
                        </div>
                      );
                    })}

                    <div className="flex justify-end px-3 py-2.5 border-t" style={{ borderColor: BORDER }}>
                      <button type="button" onClick={() => submit(group)} disabled={picked === 0}
                              className="h-[28px] px-4 rounded text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                              style={{ backgroundColor: THEME }}
                              onMouseEnter={(e) => {
                                if (picked) e.currentTarget.style.backgroundColor = ACTIVATE_HOVER;
                              }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
                        Restart {picked}/{ids.length}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RestartAllDialog;
