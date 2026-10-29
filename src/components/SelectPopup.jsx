import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Makes an opened <select> look on macOS/Safari as it does in Chrome.
 *
 * Chromium paints the option list in the CONTROL's own colours -- a blue select
 * opens a blue list. macOS draws its own menu and ignores them, and no CSS
 * reaches an OS-drawn menu. So on those platforms only, the native list is
 * suppressed and this panel takes its colours from the select it belongs to.
 *
 * Elsewhere it attaches no listener at all. Picking a row writes through the
 * native setter and fires `change`, so every existing onChange keeps working.
 */

const PANEL_MAX_HEIGHT = 260;
const GAP = 4;

/**
 * True only where the native list ignores the control's colours: any browser on
 * macOS, and Safari wherever it runs. Evaluated once — the platform cannot
 * change while the page is open.
 */
const needsCustomList = (() => {
  if (typeof navigator === 'undefined') return false;

  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const ua = navigator.userAgent || '';

  const isMac = /mac/i.test(platform) || (/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua));
  // Chrome, Edge and Opera all carry "Safari" in their UA, so they are excluded
  // by name rather than by sniffing a vendor string.
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);

  return isMac || isSafari;
})();

/** Mixes white or black into a colour, for the hover/selected row. */
const tint = (rgb, amount, towards) => {
  const match = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map(Number);
  const target = towards === 'white' ? 255 : 0;
  const mix = (c) => Math.round(c + (target - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

const isDark = (rgb) => {
  const match = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return false;
  const [r, g, b] = match.slice(1).map(Number);
  // Rec. 601 luma — good enough to decide between a light and a dark row.
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
};

const SelectPopup = () => {
  const selectRef = useRef(null);
  const [menu, setMenu] = useState(null);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!needsCustomList) return undefined;   // nothing attached elsewhere

    const handleMouseDown = (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;

      const select = event.target?.closest?.('select');
      if (!select || select.disabled || select.multiple) return;

      const options = Array.from(select.options).map((option) => ({
        value: option.value,
        label: option.text,
        disabled: option.disabled,
      }));
      if (options.length === 0) return;

      event.preventDefault();          // stops the OS list
      select.focus({ preventScroll: true });

      // The panel dresses itself in the control's own colours, which is exactly
      // what Chromium does with the native list.
      const cs = window.getComputedStyle(select);
      const background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ? cs.backgroundColor
        : '#FFFFFF';
      const dark = isDark(background);

      selectRef.current = select;
      setMenu({
        options,
        value: select.value,
        rect: select.getBoundingClientRect(),
        theme: {
          background,
          color: cs.color,
          border: dark ? background : (cs.borderTopColor || '#e3e3e3'),
          hover: tint(background, dark ? 0.16 : 0.04, dark ? 'white' : 'black') || background,
          selected: tint(background, dark ? 0.26 : 0.07, dark ? 'white' : 'black') || background,
          font: cs.fontSize,
          family: cs.fontFamily,
        },
      });
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;

    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
    const onScrollOrResize = () => close();

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [menu, close]);

  if (!menu) return null;

  const { options, value, rect, theme } = menu;

  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const openUpwards = spaceBelow < Math.min(PANEL_MAX_HEIGHT, 140) && spaceAbove > spaceBelow;
  const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(120, openUpwards ? spaceAbove : spaceBelow));

  const width = Math.max(rect.width, 110);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);

  const choose = (option) => {
    const select = selectRef.current;
    if (option.disabled || !select) return;

    close();
    if (option.value === select.value) return;

    // Deferred by one task: dispatching the change while React is still
    // dispatching OUR mousedown gets the update dropped, and the control snaps
    // back to its old value.
    setTimeout(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, 'value',
      )?.set;
      if (setter) setter.call(select, option.value);
      else select.value = option.value;

      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, 0);
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onMouseDown={(e) => { e.preventDefault(); close(); }} />

      <div
        className="fixed z-[9999] overflow-y-auto rounded-md shadow-lg py-1 border"
        style={{
          left,
          width,
          maxHeight,
          backgroundColor: theme.background,
          borderColor: theme.border,
          color: theme.color,
          fontSize: theme.font,
          fontFamily: theme.family,
          ...(openUpwards ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
        }}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          return (
            <div
              key={`${option.value}-${index}`}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); choose(option); }}
              onMouseEnter={(e) => {
                if (option.disabled || isSelected) return;
                e.currentTarget.style.backgroundColor = theme.hover;
              }}
              onMouseLeave={(e) => {
                if (option.disabled || isSelected) return;
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              className={`px-3 py-1.5 truncate ${option.disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}
              style={{ backgroundColor: isSelected ? theme.selected : 'transparent' }}
            >
              {option.label}
            </div>
          );
        })}
      </div>
    </>,
    document.body,
  );
};

export default SelectPopup;
