import { useState, useRef, useEffect, memo } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Small list dropdown with the same look as StrikeDropdown — selected row
 * tinted blue with a check, hover highlight, rounded panel with a shadow.
 *
 * Built out of real DOM instead of a native <select> for two reasons:
 *  - a native popup is drawn by the OS, so it cannot be styled and looks
 *    different on every machine;
 *  - the browser flips that popup UPWARD when the list is long and sits low on
 *    the page (the 25-entry monthly list did exactly that). This panel is
 *    anchored with `top-full`, so it always opens downward and scrolls inside
 *    its own max-height instead.
 *
 * `options` is an array of strings; value/onChange work like a <select>.
 */
const PlainDropdown = ({ value, options, onChange, disabled = false, buttonClassName = '', panelWidthClass = 'w-full' }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.includes(value) ? value : options[0];

  useEffect(() => {
    if (!open) return;   // listener only while the panel is actually open
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center' });
    }
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 px-3 py-2 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal hover:border-gray-400 focus:ring-2 focus:ring-blue-200 outline-none transition-all disabled:opacity-40 disabled:cursor-default ${buttonClassName}`}
      >
        <span className="text-slate-800">{selected}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={listRef}
          className={`absolute top-full left-0 z-30 mt-1 ${panelWidthClass} min-w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1`}
        >
          {options.map((opt) => {
            const isActive = opt === selected;
            return (
              <div
                key={opt}
                data-active={isActive}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`flex items-center justify-between px-3 py-2 text-[13px] cursor-pointer transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-700 hover:bg-gray-100'
                }`}
              >
                <span>{opt}</span>
                {isActive && <Check size={14} className="text-blue-600" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default memo(PlainDropdown);
