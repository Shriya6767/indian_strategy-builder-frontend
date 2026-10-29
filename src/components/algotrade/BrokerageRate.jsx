import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { INK, BORDER, MUTED, NAVY, HEAD_BG } from './palette';

/**
 * The "Brokerage rate" card: a rupee amount and per-order / per-lot.
 *
 * NATIVE CONTROLS ON PURPOSE -- the reference shows the platform's own number
 * spinner and select list, which is what `input type=number` and `<select>`
 * give for free. A hand-rolled list never matched the OS one and lost keyboard
 * behaviour. Presentation only; nothing is sent anywhere yet.
 */

const UNITS = ['per order', 'per lot'];

const BrokerageRate = ({ rate, unit, onRate, onUnit, onDone }) => {
  const boxRef = useRef(null);

  // Never below zero, and a blank box steps from 0 rather than from NaN.
  // The update is FUNCTIONAL: reading `rate` from this closure meant three
  // quick clicks all saw the same starting value and landed on 1, not 3.
  const step = (by) => onRate((prev) => {
    const current = Number(prev);
    const base = Number.isFinite(current) ? current : 0;
    return String(Math.max(0, base + by));
  });

  // Click-away closes the whole card; the listener lives only while it is open.
  useEffect(() => {
    const away = (event) => { if (!boxRef.current?.contains(event.target)) onDone(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onDone]);

  return (
    <div
      ref={boxRef}
      // right-0: the trigger sits in the rightmost column, so a centred card
      // would hang off the edge of the window.
      className="absolute right-0 top-full mt-2 z-40 w-[208px] rounded-md border bg-white shadow-lg"
      style={{ borderColor: BORDER }}
    >
      <p className="px-4 pt-3.5 pb-3 text-[14px] font-semibold" style={{ color: INK }}>
        Brokerage rate
      </p>

      <div className="px-4 flex items-center gap-2">
        {/* ₹ rides in its own tinted cell, divided from the field. */}
        <span
          className="group inline-flex items-center h-[32px] rounded border overflow-hidden shrink-0"
          style={{ borderColor: BORDER }}
        >
          <span
            className="inline-flex items-center h-full px-1.5 text-[13px] border-r"
            style={{ color: MUTED, backgroundColor: HEAD_BG, borderColor: BORDER }}
          >
            ₹
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={rate}
            // Typed entry and the stepper both land here. Anything that is not
            // a non-negative number is dropped rather than stored, so the
            // figure beside the pencil can never read "-3" or "abc".
            onChange={(e) => {
              const next = e.target.value;
              if (next === '' || /^\d*\.?\d*$/.test(next)) onRate(next);
            }}
            // Up/Down still step the value, which type=number gave for free.
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
            }}
            className="w-[34px] h-full px-1.5 text-[13px] outline-none bg-white"
            style={{ color: INK }}
            aria-label="Brokerage rate"
          />

          {/* Our own stepper: a thin chevron PAIR, as the reference draws it.
              Filled triangles were tried and read as a single diamond at this
              size. It is drawn only while the field is hovered or focused,
              which is when the reference reveals it. */}
          <span
            className="flex flex-col shrink-0 pr-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            style={{ color: MUTED }}
          >
            <button type="button" onClick={() => step(1)} title="Increase"
                    tabIndex={-1}
                    className="h-[8px] w-[11px] flex items-center justify-center overflow-hidden">
              <ChevronUp size={11} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => step(-1)} title="Decrease"
                    tabIndex={-1}
                    className="h-[8px] w-[11px] flex items-center justify-center overflow-hidden">
              <ChevronDown size={11} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </span>
        </span>

        {/* appearance:none drops only the oversized native ARROW — the
            dropdown list itself stays native, which is what the reference
            shows. Our own chevron is drawn at the size it measures there. */}
        <span className="relative inline-flex items-center shrink-0">
          <select
            value={unit}
            onChange={(e) => onUnit(e.target.value)}
            className="h-[32px] w-[96px] pl-2 pr-6 rounded border text-[13px] bg-white outline-none appearance-none"
            style={{ borderColor: BORDER, color: INK }}
            aria-label="Rate applies"
          >
            {UNITS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2 pointer-events-none"
            style={{ color: MUTED }}
            aria-hidden="true"
          />
        </span>
      </div>

      <div className="px-4 pb-3 pt-3 text-right">
        <button
          type="button"
          onClick={onDone}
          className="text-[13px] font-medium"
          style={{ color: NAVY }}
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default BrokerageRate;
