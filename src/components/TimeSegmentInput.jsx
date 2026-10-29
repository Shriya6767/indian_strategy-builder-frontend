import { useState, useRef, useEffect, useMemo, forwardRef } from 'react';
import { Clock } from 'lucide-react';
import { colors } from '../theme/colors';
import { toMinutes } from '../utils/timeRules';

const PICKER_BLUE = '#0782DA'; 

const pad = (n) => String(n).padStart(2, '0');
const HOUR_LIST = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTE_LIST = Array.from({ length: 60 }, (_, i) => pad(i));

// "13:30" (24h) -> { hour: '01', minute: '30', meridiem: 'PM' }
const parseValue = (v) => {
  if (v && /^\d{2}:\d{2}(:\d{2})?$/.test(v)) {
    const [h24, m] = v.split(':').map(Number);
    const meridiem = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { hour: pad(h12), minute: pad(m), meridiem };
  }
  return { hour: '09', minute: '15', meridiem: 'AM' };
};

// 12h segments -> 24h "HH:MM"
const to24h = (hour, minute, meridiem) => {
  let h = parseInt(hour, 10) % 12;
  if (meridiem === 'PM') h += 12;
  return `${pad(h)}:${minute}`;
};

// (…12, 13, 14, 15 — not 1, 2, 3) while the AM/PM segment stays in the field,
// Typing is deliberately left unbounded — an out-of-session time is reported by
// the caller's warning rather than being silently swallowed here.
const TimeSegmentInput = forwardRef(({ value, onCommit, disabled = false, placeholder = 'Time', onKeyDown, fullWidth = false, minTime, maxTime }, ref) => {
  const initial = parseValue(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [meridiem, setMeridiem] = useState(initial.meridiem); // 'AM' | 'PM' | null (cleared -> '--')
  const [activeSegment, setActiveSegment] = useState(null); // 'hour' | 'minute' | 'meridiem' | null
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const typedBufferRef = useRef('');
  const isTypingRef = useRef(false);
  const containerRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  useEffect(() => {
    const focused = containerRef.current?.contains(document.activeElement);
    if (isTypingRef.current && focused) return;
    isTypingRef.current = false;
    const parsed = parseValue(value);
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setMeridiem(parsed.meridiem);
  }, [value]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;
    [hourListRef, minuteListRef].forEach((r) => {
      const list = r.current;
      const active = list?.querySelector('[data-active="true"]');
      if (list && active) list.scrollTop = active.offsetTop - list.offsetTop;
    });
  }, [dropdownOpen]);

  const commit = (h, m, mer) => {
    if (!mer) return; // meridiem cleared ('--') — wait until it is set again
    isTypingRef.current = false;
    const accepted = onCommit ? onCommit(to24h(h, m, mer)) : true;
    if (accepted === false) {
      const parsed = parseValue(value);
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setMeridiem(parsed.meridiem);
    }
  };

  // --- session-bounded picker ------------------------------------------------
  const bounds = useMemo(() => {
    const lo = toMinutes(minTime);
    const hi = toMinutes(maxTime);
    if (lo === null || hi === null || hi < lo) return null;
    return { lo, hi };
  }, [minTime, maxTime]);

  // The hour currently held by the segments, as a 24-hour number.
  const hour24 = (parseInt(hour, 10) % 12) + (meridiem === 'PM' ? 12 : 0);

  const boundedHours = useMemo(() => {
    if (!bounds) return [];
    const out = [];
    for (let h = Math.floor(bounds.lo / 60); h <= Math.floor(bounds.hi / 60); h++) out.push(h);
    return out;
  }, [bounds]);

  const minutesForHour = (h) => {
    if (!bounds) return MINUTE_LIST;
    const from = Math.max(0, bounds.lo - h * 60);
    const to = Math.min(59, bounds.hi - h * 60);
    const out = [];
    for (let m = from; m <= to; m++) out.push(pad(m));
    return out.length ? out : MINUTE_LIST;
  };

  const boundedMinutes = bounds ? minutesForHour(hour24) : MINUTE_LIST;

  const apply24 = (h, m) => {
    const mer = h >= 12 ? 'PM' : 'AM';
    const h12 = pad(h % 12 === 0 ? 12 : h % 12);
    setHour(h12);
    setMinute(m);
    setMeridiem(mer);
    commit(h12, m, mer);
  };


  const pickBoundedHour = (h) => {
    const allowed = minutesForHour(h);
    apply24(h, allowed.includes(minute) ? minute : allowed[0]);
  };


  const boundedHourPrefixes = boundedHours.map(pad);
  const clampBoundedHour = (h) => {
    const lo = boundedHours[0];
    const hi = boundedHours[boundedHours.length - 1];
    return Math.min(hi, Math.max(lo, h));
  };

  const selectSegment = (segment) => {
    if (disabled) return;
    setActiveSegment(segment);
    typedBufferRef.current = '';
    isTypingRef.current = true;
  };

  const toggleDropdown = (e) => {
    e.preventDefault();
    if (disabled) return;
    setDropdownOpen((open) => !open);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowLeft' && activeSegment === 'hour') { onKeyDown && onKeyDown(e); return; }
    if (e.key === 'ArrowRight' && activeSegment === 'meridiem') { onKeyDown && onKeyDown(e); return; }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectSegment(activeSegment === 'meridiem' ? 'minute' : 'hour');
      return;
    }
    if (e.key === 'Tab' && e.shiftKey) {
      if (!activeSegment || activeSegment === 'hour') return;
      e.preventDefault();
      selectSegment(activeSegment === 'meridiem' ? 'minute' : 'hour');
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      if (e.key === 'Tab' && (!activeSegment || activeSegment === 'meridiem')) return;
      e.preventDefault();
      selectSegment(activeSegment === 'hour' ? 'minute' : 'meridiem');
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      typedBufferRef.current = '';
      if (activeSegment === 'hour' && bounds) {
        // Steps through the in-window hours (09…15), wrapping at the ends.
        const at = boundedHours.indexOf(hour24);
        const next = boundedHours[
          ((at === -1 ? 0 : at) + delta + boundedHours.length) % boundedHours.length
        ];
        pickBoundedHour(next);
      } else if (activeSegment === 'hour') {
        const next = pad(((parseInt(hour, 10) - 1 + delta + 12) % 12) + 1);
        setHour(next);
        commit(next, minute, meridiem);
      } else if (activeSegment === 'minute') {
        const next = pad((parseInt(minute, 10) + delta + 60) % 60);
        setMinute(next);
        commit(hour, next, meridiem);
      } else if (activeSegment === 'meridiem') {
        const next = meridiem === 'AM' ? 'PM' : 'AM';
        setMeridiem(next);
        commit(hour, minute, next);
      }
      return;
    }

    // AM/PM segment: a -> AM, p -> PM, Backspace/Delete -> cleared ('--')
    if (activeSegment === 'meridiem') {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setMeridiem(null);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'p') {
        e.preventDefault();
        const next = k === 'a' ? 'AM' : 'PM';
        setMeridiem(next);
        commit(hour, minute, next);
      }
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const digit = e.key;
      if (activeSegment === 'hour' && bounds) {
        const buf = typedBufferRef.current + digit;
        if (buf.length === 1 && boundedHourPrefixes.some((p) => p[0] === digit)) {
          // Could still grow into 10…15 — hold it and wait for the second digit.
          typedBufferRef.current = buf;
          return;
        }
        typedBufferRef.current = '';
        pickBoundedHour(clampBoundedHour(parseInt(buf, 10)));
        selectSegment('minute');
      } else if (activeSegment === 'hour') {
        const buf = typedBufferRef.current + digit;
        if (buf.length === 1) {
          if (digit >= '2') {
            const next = pad(parseInt(digit, 10));
            setHour(next);
            typedBufferRef.current = '';
            commit(next, minute, meridiem);
            selectSegment('minute');
          } else {
            typedBufferRef.current = buf;
            setHour(pad(parseInt(digit, 10) || 12));
          }
        } else {
          let n = parseInt(buf, 10);
          if (n < 1) n = 1;
          if (n > 12) n = parseInt(digit, 10) || 12;
          const next = pad(n);
          setHour(next);
          typedBufferRef.current = '';
          commit(next, minute, meridiem);
          selectSegment('minute');
        }
      } else if (activeSegment === 'minute') {
        const buf = typedBufferRef.current + digit;
        if (buf.length === 1) {
          if (digit >= '6') {
            const next = pad(parseInt(digit, 10));
            setMinute(next);
            typedBufferRef.current = '';
            commit(hour, next, meridiem);
            selectSegment('meridiem');
          } else {
            typedBufferRef.current = buf;
            setMinute(pad(parseInt(digit, 10)));
          }
        } else {
          const next = pad(Math.min(59, parseInt(buf, 10)));
          setMinute(next);
          typedBufferRef.current = '';
          commit(hour, next, meridiem);
          selectSegment('meridiem');
        }
      }
    }
  };

  const handleBlur = (e) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget)) {
      if (meridiem) {
        const shown = to24h(hour, minute, meridiem);
        const current = parseValue(value);
        const same = current.hour === hour
          && current.minute === minute
          && current.meridiem === meridiem;
        if (!same) onCommit?.(shown);
      }

      setActiveSegment(null);
      typedBufferRef.current = '';
      isTypingRef.current = false;
      if (!meridiem) {
        // restore from the committed value if AM/PM was left cleared
        const parsed = parseValue(value);
        setMeridiem(parsed.meridiem);
      }
    }
  };

  const segCls = (seg) => `rounded-none px-0.5 text-center cursor-text ${activeSegment === seg ? 'text-white' : ''}`;
  const segStyle = (seg) => (activeSegment === seg ? { backgroundColor: PICKER_BLUE } : {});

  const cell = (active) =>
    `px-3 py-1.5 text-[13px] text-center cursor-pointer ${active ? 'text-white' : 'text-gray-800 hover:bg-gray-100'}`;
  const cellStyle = (active) => (active ? { backgroundColor: PICKER_BLUE, borderRadius: '4px' } : {});

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      role="group"
      aria-label={placeholder}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onFocus={() => { if (!activeSegment) selectSegment('hour'); }}
      onBlur={handleBlur}
      className={`relative ${fullWidth ? 'block w-full' : 'inline-block'}`}
    >
      <div
        className={[
          'inline-flex items-center gap-0 px-3 py-[5px] text-[13px] border rounded-none font-normal bg-white transition-all duration-200 select-none',
          fullWidth ? 'w-full' : '',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
        ].join(' ')}
        style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
      >
        <span
          onMouseDown={(e) => { e.preventDefault(); selectSegment('hour'); containerRef.current?.focus(); }}
          aria-label={`${placeholder} hour`}
          className={segCls('hour')}
          style={segStyle('hour')}
        >
          {/* Bounded pickers show the 24-hour hour, matching the dropdown: pick
              15 and the field reads 15, not 03. AM/PM stays alongside it. */}
          {bounds ? pad(hour24) : hour}
        </span>
        <span>:</span>
        <span
          onMouseDown={(e) => { e.preventDefault(); selectSegment('minute'); containerRef.current?.focus(); }}
          aria-label={`${placeholder} minute`}
          className={segCls('minute')}
          style={segStyle('minute')}
        >
          {minute}
        </span>
        <span
          onMouseDown={(e) => { e.preventDefault(); selectSegment('meridiem'); containerRef.current?.focus(); }}
          aria-label={`${placeholder} AM/PM`}
          className={`ml-1 ${segCls('meridiem')}`}
          style={segStyle('meridiem')}
        >
          {meridiem || '--'}
        </span>
        <button
          type="button"
          onMouseDown={toggleDropdown}
          disabled={disabled}
          aria-label={`Open ${placeholder} picker`}
          className={`text-gray-900 hover:text-black disabled:cursor-not-allowed ${fullWidth ? 'ml-auto' : 'ml-2'}`}
        >
          <Clock size={13} />
        </button>
      </div>

      {dropdownOpen && !disabled && (
        <div
          className="absolute z-50 mt-1 flex bg-white border rounded-none shadow-lg overflow-hidden"
          style={{ width: bounds ? '132px' : '176px', borderColor: colors.settingsPanel.fieldBorder }}
        >
          <div ref={hourListRef} className="no-scrollbar flex-1 max-h-56 overflow-y-auto p-1">
            {bounds
              ? boundedHours.map((h) => {
                  const isActive = h === hour24;
                  return (
                    <div
                      key={h}
                      data-active={isActive ? 'true' : undefined}
                      onMouseDown={(e) => { e.preventDefault(); pickBoundedHour(h); }}
                      className={cell(isActive)}
                      style={cellStyle(isActive)}
                    >
                      {pad(h)}
                    </div>
                  );
                })
              : HOUR_LIST.map((h) => {
                  const isActive = h === hour;
                  return (
                    <div
                      key={h}
                      data-active={isActive ? 'true' : undefined}
                      onMouseDown={(e) => { e.preventDefault(); setHour(h); commit(h, minute, meridiem); }}
                      className={cell(isActive)}
                      style={cellStyle(isActive)}
                    >
                      {h}
                    </div>
                  );
                })}
          </div>
          <div ref={minuteListRef} className="no-scrollbar flex-1 max-h-56 overflow-y-auto p-1">
            {boundedMinutes.map((m) => {
              const isActive = m === minute;
              return (
                <div
                  key={m}
                  data-active={isActive ? 'true' : undefined}
                  onMouseDown={(e) => { e.preventDefault(); setMinute(m); commit(hour, m, meridiem); }}
                  className={cell(isActive)}
                  style={cellStyle(isActive)}
                >
                  {m}
                </div>
              );
            })}
          </div>
          {/* AM/PM column only in the unbounded picker — a 24-hour hour column
              already fixes the meridiem. */}
          <div className={`flex-1 p-1 ${bounds ? 'hidden' : ''}`}>
            {(meridiem === 'PM' ? ['PM', 'AM'] : ['AM', 'PM']).map((mer) => {
              const isActive = mer === meridiem;
              return (
                <div
                  key={mer}
                  onMouseDown={(e) => { e.preventDefault(); setMeridiem(mer); commit(hour, minute, mer); }}
                  className={cell(isActive)}
                  style={cellStyle(isActive)}
                >
                  {mer}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

TimeSegmentInput.displayName = 'TimeSegmentInput';

export default TimeSegmentInput;
