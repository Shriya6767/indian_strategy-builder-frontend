import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { INK, BORDER, BLUE } from './palette';
import { parse, build, MONTHS, pad } from './timeValue';

/**
 * The reference's own picker: four scrolling columns (hour/minute/second/
 * meridiem), with a month calendar beside them when a date is wanted.
 *
 * NOT <input type="time">, which looks different on every OS and cannot be
 * styled to match.
 *
 * VALUE SHAPE, unchanged from the native inputs it replaced:
 *   withDate=false -> "HH:MM:SS"
 *   withDate=true  -> "YYYY-MM-DDTHH:MM:SS"
 */

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const SIXTY = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const MERIDIEM = ['AM', 'PM'];
/** 00-23, for `hour24` callers -- the restart fields, where the value sent is
 *  24-hour and an AM/PM column only invited a wrong pick at 09:15 vs 21:15. */
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** One scrolling column. Scrolls its selection into view when it first opens. */
const Column = ({ options, value, onPick }) => {
  const boxRef = useRef(null);

  useEffect(() => {
    const box = boxRef.current;
    const hit = box?.querySelector('[data-on="true"]');
    if (box && hit) box.scrollTop = hit.offsetTop - box.offsetTop;
    // Once, on open: re-running per keystroke would yank the list under the
    // pointer while someone is scrolling it.
  }, []);

  return (
    <div ref={boxRef} className="h-[216px] w-[52px] overflow-y-auto no-scrollbar">
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            data-on={on ? 'true' : 'false'}
            onClick={() => onPick(option)}
            className="block w-full h-[36px] text-[13px] text-center"
            style={on
              ? { backgroundColor: BLUE, color: '#FFFFFF', fontWeight: 500 }
              : { color: INK }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
};

/**
 * `lockDate` keeps the calendar on screen but inert -- a BTST deployment
 * always enters today, so the date is shown (the user still needs to know
 * which day it will use) while every control that would change it is dead.
 */
const TimePicker = ({ value, onChange, withDate = false, onClose, anchor, lockDate = false,
  /** 00-23 hours and no AM/PM column. Opt-in, so the Strategy Builder's
   *  pickers keep the 12-hour layout they were designed around. */
  hour24 = false }) => {
  const parts = useMemo(() => parse(value, withDate), [value, withDate]);
  const set = (patch) => onChange(build({ ...parts, ...patch }, withDate));

  // The grid for the month on show: leading blanks, then its days.
  const grid = useMemo(() => {
    if (!withDate) return null;
    const first = new Date(parts.year, parts.month, 1).getDay();
    const days = new Date(parts.year, parts.month + 1, 0).getDate();
    const cells = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d += 1) cells.push(d);
    return cells;
  }, [withDate, parts.year, parts.month]);

  const shiftMonth = (by) => {
    const next = new Date(parts.year, parts.month + by, 1);
    set({ year: next.getFullYear(), month: next.getMonth() });
  };

  // FIXED + portalled to <body>: the table this opens from scrolls
  // horizontally, and an absolutely positioned panel was being clipped by that
  // overflow. Positioned from the trigger's own rect, and flipped above it when
  // there is not room below.
  const box = anchor?.getBoundingClientRect?.();
  const panelH = withDate ? 300 : 232;
  const panelW = withDate ? 448 : 212;
  const room = box ? window.innerHeight - box.bottom : 0;
  const style = box
    ? {
        position: 'fixed',
        top: room < panelH && box.top > panelH ? box.top - panelH - 4 : box.bottom + 4,
        left: Math.min(box.left, window.innerWidth - panelW - 8),
        borderColor: BORDER,
      }
    : { borderColor: BORDER };

  const panel = (
    <div className="z-[60] flex rounded-md border bg-white shadow-lg overflow-hidden"
         style={style}
         role="dialog" aria-label="Pick a time">
      {withDate && (
        <div className="w-[228px] p-3 border-r"
             style={{ borderColor: BORDER, opacity: lockDate ? 0.55 : 1 }}
             aria-disabled={lockDate || undefined}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium" style={{ color: INK }}>
              {MONTHS[parts.month]} {parts.year}
            </span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => shiftMonth(-1)} title="Previous month"
                      disabled={lockDate}
                      style={{ color: INK }}><ArrowUp size={15} /></button>
              <button type="button" onClick={() => shiftMonth(1)} title="Next month"
                      disabled={lockDate}
                      style={{ color: INK }}><ArrowDown size={15} /></button>
            </span>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
            {DAY_LABELS.map((d, i) => (
              <span key={`${d}-${i}`} className="text-[12px]" style={{ color: INK }}>{d}</span>
            ))}
            {grid.map((day, i) => (
              day === null
                ? <span key={`blank-${i}`} />
                : (
                  <button
                    key={day}
                    type="button"
                    disabled={lockDate}
                    title={lockDate ? 'This strategy always enters today' : undefined}
                    onClick={() => set({ day })}
                    className="mx-auto w-[24px] h-[24px] rounded text-[12px]"
                    style={day === parts.day
                      ? { backgroundColor: BLUE, color: '#FFFFFF' }
                      : { color: INK }}
                  >
                    {day}
                  </button>
                )
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[12px]">
            <button type="button" onClick={() => onChange('')} disabled={lockDate}
                    style={{ color: BLUE }}>Clear</button>
            <button type="button" style={{ color: BLUE }} disabled={lockDate}
                    onClick={() => {
                      const now = new Date();
                      set({ year: now.getFullYear(), month: now.getMonth(), day: now.getDate() });
                    }}>
              Today
            </button>
          </div>
        </div>
      )}

      <div className="flex" style={{ color: INK }}>
        {hour24 ? (
          <Column options={HOURS_24}
                  value={pad(Number(String(value || '').split(':')[0]) || 0)}
                  onPick={(v) => {
                    // Rebuild from the 24-hour pick: hour12 + meridiem are what
                    // `build()` consumes, so translate rather than bypass it.
                    const h = Number(v);
                    set({ hour12: pad(h % 12 === 0 ? 12 : h % 12), meridiem: h >= 12 ? 'PM' : 'AM' });
                  }} />
        ) : (
          <Column options={HOURS} value={parts.hour12} onPick={(v) => set({ hour12: v })} />
        )}
        <Column options={SIXTY} value={parts.minute} onPick={(v) => set({ minute: v })} />
        <Column options={SIXTY} value={parts.second} onPick={(v) => set({ second: v })} />
        {/* No AM/PM in 24-hour mode: the hour column already says it, and two
            controls for one fact is how 09:15 becomes 21:15. */}
        {!hour24 && (
        <div className="w-[52px]">
          {MERIDIEM.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { set({ meridiem: m }); onClose?.(); }}
              className="block w-full h-[36px] text-[13px] text-center"
              style={m === parts.meridiem
                ? { backgroundColor: BLUE, color: '#FFFFFF', fontWeight: 500 }
                : { color: INK }}
            >
              {m}
            </button>
          ))}
        </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
};

export default TimePicker;
