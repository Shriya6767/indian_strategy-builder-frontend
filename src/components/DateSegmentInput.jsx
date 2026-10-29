import { useState, useRef, useEffect, forwardRef } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { colors } from '../theme/colors';

// Segmented DD/MM/YYYY date input with SINGLE CLICK selection
// Click any segment (DD, MM, YYYY) to select and highlight it

const clampWrap = (num, min, max) => {
  const range = max - min + 1;
  return ((num - min) % range + range) % range + min;
};

const parseValue = (v) => {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [year, month, day] = v.split('-');
    return { day, month, year };
  }
  return { day: 'DD', month: 'MM', year: 'YYYY' };
};

const DateSegmentInput = forwardRef(({ value, onCommit, onKeyDown, disabled = false, placeholder = 'Date', fullWidth = false,
  /** Shorter and tighter. Opt-in, so the Portfolio screen's fields keep the
   *  size they were designed at. */
  compact = false }, ref) => {
  const initial = parseValue(value);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [activeSegment, setActiveSegment] = useState(null); // 'day' | 'month' | 'year' | null
  const typedBufferRef = useRef('');
  const lastCommittedValueRef = useRef(value);
  const isTypingRef = useRef(false);
  const containerRef = useRef(null);
  const nativeDateRef = useRef(null);

  // Merge internal ref with forwarded ref
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(containerRef.current);
      } else {
        ref.current = containerRef.current;
      }
    }
  }, [ref]);

  // Stay in sync with parent value when not typing
  useEffect(() => {
    if (isTypingRef.current) return;
    
    const parsed = parseValue(value);
    setDay(parsed.day);
    setMonth(parsed.month);
    setYear(parsed.year);
    lastCommittedValueRef.current = value;
  }, [value]);

  const selectSegment = (segment) => {
    if (disabled) return;
    setActiveSegment(segment);
    typedBufferRef.current = '';
    isTypingRef.current = true;
  };

  const revertToLastValue = () => {
    const parsed = parseValue(value);
    setDay(parsed.day);
    setMonth(parsed.month);
    setYear(parsed.year);
  };

  const commit = (d, m, y) => {
    // Validate and format as YYYY-MM-DD
    if (d === 'DD' || m === 'MM' || y === 'YYYY') return;
    
    const dayNum = parseInt(d, 10);
    const monthNum = parseInt(m, 10);
    const yearNum = parseInt(y, 10);
    
    if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 2000 || yearNum > 2100) {
      revertToLastValue();
      return;
    }
    
    const newValue = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    lastCommittedValueRef.current = newValue;
    isTypingRef.current = false;
    
    const accepted = onCommit ? onCommit(newValue) : true;
    if (accepted === false) {
      revertToLastValue();
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    // Handle arrow keys for navigation between segments or fields
    if (e.key === 'ArrowLeft') {
      if (!activeSegment || activeSegment === 'day') {
        // At the leftmost segment or no segment active - allow parent navigation
        if (onKeyDown) {
          onKeyDown(e);
        }
        return;
      }
      e.preventDefault();
      if (activeSegment === 'month') selectSegment('day');
      else if (activeSegment === 'year') selectSegment('month');
      return;
    }
    
    if (e.key === 'ArrowRight') {
      if (!activeSegment || activeSegment === 'year') {
        // At the rightmost segment or no segment active - allow parent navigation
        if (onKeyDown) {
          onKeyDown(e);
        }
        return;
      }
      e.preventDefault();
      if (activeSegment === 'day') selectSegment('month');
      else if (activeSegment === 'month') selectSegment('year');
      return;
    }
    // Tab walks DD -> MM -> YYYY, and Shift+Tab walks back. At either end the
    // event is NOT consumed, so focus leaves for the next/previous field like
    // any normal control. Previously both branches called preventDefault()
    // unconditionally, which trapped focus: Tab could never exit from YYYY and
    // Shift+Tab could never exit from DD.
    if (e.key === 'Tab' && !e.shiftKey) {
      // No active segment means nothing is being edited (handleBlur nulls it),
      // so the key must pass through rather than be consumed for no movement.
      if (!activeSegment || activeSegment === 'year') return;   // last segment -> let Tab out
      e.preventDefault();
      if (activeSegment === 'day') selectSegment('month');
      else if (activeSegment === 'month') selectSegment('year');
      return;
    }
    if (e.key === 'Tab' && e.shiftKey) {
      // null means focus only just arrived (onFocus sets 'day' on the next
      // render) — treat it as the first segment so the key is never swallowed.
      if (!activeSegment || activeSegment === 'day') return;
      e.preventDefault();
      if (activeSegment === 'month') selectSegment('day');
      else if (activeSegment === 'year') selectSegment('month');
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      typedBufferRef.current = '';
      if (activeSegment === 'day') {
        setDay('DD');
      } else if (activeSegment === 'month') {
        setMonth('MM');
      } else if (activeSegment === 'year') {
        setYear('YYYY');
      }
      return;
    }
    if (e.key === 'Enter' || e.key === 'Escape') {
      containerRef.current?.blur();
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const digit = e.key;
      const buffer = typedBufferRef.current + digit;

      if (activeSegment === 'day') {
        if (buffer.length === 1) {
          const asNum = parseInt(buffer, 10);
          if (asNum > 3) {
            const d2 = buffer.padStart(2, '0');
            typedBufferRef.current = '';
            setDay(d2);
            commit(d2, month, year);
            selectSegment('month');
          } else {
            typedBufferRef.current = buffer;
            setDay(buffer.padStart(2, '0'));
          }
        } else {
          const clamped = clampWrap(parseInt(buffer, 10), 1, 31);
          const d2 = String(clamped).padStart(2, '0');
          typedBufferRef.current = '';
          setDay(d2);
          commit(d2, month, year);
          selectSegment('month');
        }
      } else if (activeSegment === 'month') {
        if (buffer.length === 1) {
          const asNum = parseInt(buffer, 10);
          if (asNum > 1) {
            const m2 = buffer.padStart(2, '0');
            typedBufferRef.current = '';
            setMonth(m2);
            commit(day, m2, year);
            selectSegment('year');
          } else {
            typedBufferRef.current = buffer;
            setMonth(buffer.padStart(2, '0'));
          }
        } else {
          const clamped = clampWrap(parseInt(buffer, 10), 1, 12);
          const m2 = String(clamped).padStart(2, '0');
          typedBufferRef.current = '';
          setMonth(m2);
          commit(day, m2, year);
          selectSegment('year');
        }
      } else if (activeSegment === 'year') {
        typedBufferRef.current = buffer;
        
        if (buffer.length < 4) {
          setYear(buffer.padStart(4, '0'));
        } else {
          const yearNum = parseInt(buffer, 10);
          const y4 = String(clampWrap(yearNum, 2000, 2100)).padStart(4, '0');
          typedBufferRef.current = '';
          setYear(y4);
          commit(day, month, y4);
        }
      }
    }
  };

  const handleBlur = (e) => {
    if (!containerRef.current || !containerRef.current.contains(e.relatedTarget)) {
      setActiveSegment(null);
      typedBufferRef.current = '';
      isTypingRef.current = false;
    }
  };

  /*
    PUT THE PICKER WHERE IT FITS, before opening it.

    Chrome aligns the native panel's left edge with its input and does NOT
    flip horizontally when it overflows -- so End Date, which sits at the
    right edge on both the builder and the portfolio page, opened a panel that
    ran off the window and was cut in half. Spanning the field was not enough:
    the field itself is what is too far right.

    So the hidden input is moved to fixed viewport coordinates chosen so the
    panel fits, then the picker is opened against it. Clamped on both axes:
    pushed left when the right edge would overflow, and raised above the field
    when there is not enough room below.

    THE SIZES ARE MEASURED, not guessed, and the height has to be close.
    Chrome draws the panel DOWNWARDS from the anchor, so when the anchor is
    raised to clear the bottom of the window, an over-estimated height lifts
    it too far and leaves a visible gap between panel and field -- 73px of it,
    at the first estimate of 340. The panel is ~218 x 275 at a six-row month;
    285 keeps a small margin for the rows a long month adds.

    Width is deliberately the looser of the two: over-estimating it only
    shifts the panel further from the right edge, which is harmless.
  */
  const placeAnchor = () => {
    const el = nativeDateRef.current;
    const field = containerRef.current;
    if (!el || !field) return;

    const PANEL_W = 240;
    const PANEL_H = 285;
    const GAP = 8;

    const r = field.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const left = Math.max(GAP, Math.min(r.left, vw - PANEL_W - GAP));
    const below = r.bottom + PANEL_H + GAP <= vh;
    const top = below ? r.bottom : Math.max(GAP, r.top - PANEL_H - GAP);

    el.style.position = 'fixed';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = '1px';
    el.style.height = '1px';
  };

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={placeholder}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onFocus={() => { if (!activeSegment) selectSegment('day'); }}
      onBlur={handleBlur}
      className={[
        'relative flex items-center border rounded-md font-normal bg-white transition-all duration-200 select-none justify-center',
        compact ? 'px-2 h-8 text-[12px]' : 'px-3 h-10 text-[13px]',
        fullWidth ? 'w-full' : 'w-fit',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text hover:border-gray-400 hover:shadow-md',
        activeSegment ? 'ring-2 border-transparent' : 'border-[#e3e3e3]',
      ].join(' ')}
      style={activeSegment ? { '--tw-ring-color': colors.primary.hover } : {}}
    >
      {/* DD segment - SINGLE CLICK to select */}
      <span
        onClick={() => { selectSegment('day'); containerRef.current?.focus(); }}
        aria-label={`${placeholder} day`}
        className={`px-0.5 rounded min-w-[18px] text-center cursor-pointer ${activeSegment === 'day' ? 'text-white' : day === 'DD' ? 'text-gray-400' : ''}`}
        style={activeSegment === 'day' ? { backgroundColor: colors.primary.hover } : {}}
      >
        {day}
      </span>
      <span className="text-gray-400 -mx-0.5">/</span>
      {/* MM segment - SINGLE CLICK to select */}
      <span
        onClick={() => { selectSegment('month'); containerRef.current?.focus(); }}
        aria-label={`${placeholder} month`}
        className={`px-0.5 rounded min-w-[18px] text-center cursor-pointer ${activeSegment === 'month' ? 'text-white' : month === 'MM' ? 'text-gray-400' : ''}`}
        style={activeSegment === 'month' ? { backgroundColor: colors.primary.hover } : {}}
      >
        {month}
      </span>
      <span className="text-gray-400 -mx-0.5">/</span>
      {/* YYYY segment - SINGLE CLICK to select */}
      <span
        onClick={() => { selectSegment('year'); containerRef.current?.focus(); }}
        aria-label={`${placeholder} year`}
        className={`px-0.5 rounded min-w-[32px] text-center cursor-pointer ${activeSegment === 'year' ? 'text-white' : year === 'YYYY' ? 'text-gray-400' : ''}`}
        style={activeSegment === 'year' ? { backgroundColor: colors.primary.hover } : {}}
      >
        {year}
      </span>
      {/* Calendar icon — opens the browser's native date picker. */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          if (disabled) return;
          const el = nativeDateRef.current;
          if (!el) return;
          placeAnchor();
          try { el.showPicker(); } catch { el.click(); }
        }}
        disabled={disabled}
        aria-label={`Open ${placeholder} calendar`}
        className="ml-2 text-gray-900 hover:text-black disabled:cursor-not-allowed"
      >
        <CalendarIcon size={13} />
      </button>
      {/*
        THE ANCHOR THE NATIVE CALENDAR OPENS AGAINST.

        placeAnchor() above moves it to viewport coordinates that leave room
        for the panel, just before the picker opens. Invisible and untouchable
        throughout: opacity-0, pointer-events-none, tabIndex -1, aria-hidden.
      */}
      <input
        ref={nativeDateRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="fixed w-px h-px opacity-0 pointer-events-none"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : ''}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const [y, m, d] = v.split('-');
          setDay(d);
          setMonth(m);
          setYear(y);
          const accepted = onCommit ? onCommit(v) : true;
          if (accepted === false) {
            const parsed = parseValue(value);
            setDay(parsed.day);
            setMonth(parsed.month);
            setYear(parsed.year);
          }
        }}
      />
    </div>
  );
});

DateSegmentInput.displayName = 'DateSegmentInput';

export default DateSegmentInput;
