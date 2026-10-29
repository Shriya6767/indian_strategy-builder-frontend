import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { colors } from '../theme/colors';

const OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));

const ReentryCountDropdown = ({
  value,
  onChange,
  disabled = false,
  className = '',
  ariaLabel = 'Re-entry count',
  heightClass = 'h-8',
}) => {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      // The list lives in a portal, so it is NOT inside ref — check it too or
      // every option click would close the menu before it registered.
      if (ref.current && ref.current.contains(e.target)) return;
      if (listRef.current && listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const active = list?.querySelector('[data-active="true"]');
    if (list && active) list.scrollTop = active.offsetTop - list.offsetTop;
  }, [open]);

  const selected = (value === '' || value === null || value === undefined)
    ? '1'
    : String(value);

  const LIST_MAX = 192;
  const measure = () => {
    const el = btnRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < LIST_MAX + 8 && r.top > below;
    return {
      left: r.left,
      width: r.width,
      top: up ? null : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : null,
      maxHeight: Math.max(96, Math.min(LIST_MAX, (up ? r.top : below) - 12)),
    };
  };

  useEffect(() => {
    if (!open) return;
    const sync = () => setRect(measure());
    // capture:true so it also fires for the modal's own scroll container.
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
    };
  }, [open]);

  const pick = (v) => {
    onChange(v);
    setOpen(false);
    setHovered(null);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        ref={btnRef}
        onClick={() => { if (!open) setRect(measure()); setOpen((o) => !o); }}
        className={`w-20 ${heightClass} pl-3.5 pr-7 text-[13px] border rounded-none bg-white font-normal outline-none transition-colors text-left disabled:cursor-default flex items-center`}
        style={{
          borderColor: colors.settingsPanel.fieldBorder,
          color: disabled ? '#9CA3AF' : colors.settingsPanel.inputValue,
        }}
      >
        {disabled ? '1' : selected}
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          style={{ color: disabled ? '#9CA3AF' : '#4B5563' }}
        />
      </button>

      {open && !disabled && rect && createPortal(
        <div
          ref={listRef}
          role="listbox"
          className="no-scrollbar fixed z-[300] overflow-y-auto bg-white border shadow-lg py-1"
          style={{
            borderColor: colors.settingsPanel.fieldBorder,
            left: rect.left,
            width: rect.width,
            ...(rect.top !== null ? { top: rect.top } : { bottom: rect.bottom }),
            maxHeight: rect.maxHeight,
          }}
        >
          {OPTIONS.map((opt) => {
            const isActive = opt === selected;
            const isHovered = opt === hovered;
            return (
              <div
                key={opt}
                role="option"
                aria-selected={isActive}
                data-active={isActive ? 'true' : undefined}
                onMouseEnter={() => setHovered(opt)}
                onMouseLeave={() => setHovered((h) => (h === opt ? null : h))}
                onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
                className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer"
                style={{
                  backgroundColor: isActive ? colors.settingsPanel.tintSelectedBg : (isHovered ? '#F3F4F6' : 'transparent'),
                  color: colors.settingsPanel.inputValue,
                }}
              >
                <span>{opt}</span>
                {isActive ? (
                  <CheckCircle2 size={15} strokeWidth={2} className="ml-auto" style={{ color: colors.settingsPanel.tintSelectedTextActive }} />
                ) : isHovered ? (
                  <span
                    className="ml-auto text-[11px] font-medium"
                    style={{ color: colors.settingsPanel.tintSelectedTextActive }}
                  >
                    Select
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default memo(ReentryCountDropdown);
