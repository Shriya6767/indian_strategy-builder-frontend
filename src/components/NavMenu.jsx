import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight } from 'lucide-react';
import { ChevronDownIcon } from './NavIcons';

const useDismiss = (open, close, panelRef) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (panelRef?.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, panelRef]);
  return ref;
};

const NavMenu = ({
  label,
  /** [{ icon, title, onGo, items: [{ label, onGo }] }] */
  sections = [],
}) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const panelRef = useRef(null);
  const ref = useDismiss(open, () => setOpen(false), panelRef);
  /**
   * The trigger node, in state rather than a ref: the panel is positioned
   * from its rect during render, and a ref read while rendering is null on
   * the first open. Same pattern as TimePicker, for the same reason.
   */
  const [anchor, setAnchor] = useState(null);

  /**
   * The hover plate, MEASURED while hovering the reference: rgb(42, 42, 42).
   *
   * DARKER than the #3A3A3A bar, not lighter -- this was a translucent white
   * wash on the assumption a dark bar lifts; the reference sinks. Shown only
   * while hovered or open; it used to light for the active tab too, leaving a
   * permanent plate on the bar that no one was hovering.
   */
  const lit = open || hover;

  const choose = (fn) => { setOpen(false); fn?.(); };

  /*
    HOVER OR CLICK, EITHER OPENS IT -- for both menus, label and chevron
    alike. The label used to navigate on Algo Trade and the chevron was the
    only way in; now the whole item behaves as one menu, and the pages are
    reached from inside the panel.

    Hover opens on a short delay and closes on a short delay, which is what
    makes a hover menu usable: without the leave delay, the gap between the
    item and the panel below it closes the menu before the pointer lands on
    it, and the panel is unreachable by mouse.
  */
  const hoverTimer = useRef(null);
  const clearHoverTimer = () => { clearTimeout(hoverTimer.current); hoverTimer.current = null; };

  const openSoon = () => { clearHoverTimer(); hoverTimer.current = setTimeout(() => setOpen(true), 90); };
  const closeSoon = () => { clearHoverTimer(); hoverTimer.current = setTimeout(() => setOpen(false), 220); };

  useEffect(() => clearHoverTimer, []);

  return (
    <span ref={ref} className="relative inline-flex">
      {/*
        MEASURED FROM THE REFERENCE with getComputedStyle:
          font  16px / 400 / Inter        colour  #FFFFFF
          pad   8px                        radius  0px  (square, not rounded)
          box   88.125 x 36

        The radius especially -- this was `rounded-md`, and the reference's
        plate has square corners.
      */}
      <span
        className="inline-flex items-center transition-colors"
        style={{ backgroundColor: lit ? '#2A2A2A' : 'transparent' }}
        onMouseEnter={() => { setHover(true); openSoon(); }}
        onMouseLeave={() => { setHover(false); closeSoon(); }}
      >
        <button type="button"
                ref={setAnchor}
                onClick={() => { clearHoverTimer(); setOpen((was) => !was); }}
                /*
                  The word, then BREATHING ROOM before the chevron. Trimming
                  the padding to hit an 88px box left the arrow touching the
                  "t" with a 0px gap, which is what made the item read wrong
                  next to the reference even though the type itself matches it
                  exactly.

                  16px is the REFERENCE'S measured size (Inter / 16px / 400 /
                  #ffffff). It was briefly 15px on request; that put it a pixel
                  under theirs, so it is back.
                */
                className="h-[36px] pl-2 pr-1.5 text-[16px] text-white whitespace-nowrap">
          {label}
        </button>
        <button type="button"
                onClick={() => { clearHoverTimer(); setOpen((was) => !was); }}
                aria-label={`${label} menu`}
                aria-expanded={open}
                className="h-[36px] pl-0 pr-2 inline-flex items-center">
          {/* The chevron does NOT flip while the panel is open -- the
              reference's stays pointing down in both states. */}
          <ChevronDownIcon style={{ color: '#FFFFFF' }} />
        </button>
      </span>

      {/*
        PORTALLED TO THE BODY, and positioned with `fixed`.

        As a plain absolute child of the bar the panel was CLIPPED to a sliver:
        the bar is 48px tall and something above it in the tree clips its
        overflow, so a 300px panel hanging out of a 48px box had nowhere to go.
        A portal leaves that subtree entirely -- nothing upstream can crop it,
        and no ancestor's stacking context can paint over it.

        The rect is read at render, so the panel tracks the trigger wherever
        the bar lays it out.
      */}
      {open && anchor && createPortal(
        (() => {
          const r = anchor.getBoundingClientRect();
          const WIDTH = 358;   // measured on the reference
          // Nudged back on-screen if the trigger sits near the right edge.
          const left = Math.min(Math.max(8, r.left), window.innerWidth - WIDTH - 8);
          return (
            <div
              ref={panelRef}
              className="fixed z-[60] rounded-lg bg-white overflow-hidden"
              style={{
                top: r.bottom + 6,
                left,
                width: WIDTH,
                /*
                  The reference's own shadow, read off it:
                    rgba(0,0,0,0.1) 0px 2px 10px 0px
                  (its first two layers are fully transparent, so they draw
                  nothing). Mine was far heavier -- a 34px spread at 20%
                  opacity -- which read as a modal rather than a menu.
                */
                boxShadow: '0 2px 10px 0 rgba(0,0,0,0.1)',
              }}
              role="menu"
              onMouseEnter={clearHoverTimer}
              onMouseLeave={closeSoon}
            >
              {sections.map((section) => (
                <Section key={section.title} section={section} choose={choose} />
              ))}
            </div>
          );
        })(),
        document.body,
      )}
    </span>
  );
};

/**
 * One block of the panel.
 *
 * THE WHOLE BLOCK IS ONE TARGET. The heading and the lines under it are plain
 * text, not separate links -- clicking anywhere in the block goes to that
 * section's page, which is how the reference behaves. They were individual
 * buttons with a hover underline; both are gone.
 */
const Section = ({ section, choose }) => {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => choose(section.onGo)}
      /*
        MEASURED on the reference, hovered:
          section  padding 20px, hover ground #ecf6ff (a blue tint, not the
                   neutral grey this had -- that was my guess and it was wrong)
          heading  16px / 500 / #2a2a2a
      */
      className="w-full text-left p-5 bg-white transition-colors hover:bg-[#ecf6ff]"
    >
      <span className="flex items-center gap-2.5">
        {/*
          MEASURED: 30x30, WHITE ground, 4px radius, 1px solid #dcdcdc, and a
          16px #0782da glyph. Both earlier attempts were guesses -- a solid
          #DBEAFE fill, then an #EFF6FF one; the reference is white with a
          faint grey edge.
        */}
        <span className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-[4px] shrink-0 border"
              style={{ backgroundColor: '#FFFFFF', borderColor: '#DCDCDC' }}>
          {Icon ? <Icon size={16} style={{ color: '#0782DA' }} /> : null}
        </span>
        <span className="text-[16px] font-medium" style={{ color: '#2a2a2a' }}>
          {section.title}
        </span>
        <ArrowRight size={15} className="ml-auto shrink-0" style={{ color: '#2563EB' }} />
      </span>

      <span className="mt-2 pl-[41px] block">
        {section.items.map((item) => (
          <span key={item.label} className="flex items-start gap-2 mt-1.5 first:mt-0">
            {/* The reference's square bullet, not a disc. */}
            <span className="mt-[7px] w-[4px] h-[4px] shrink-0" style={{ backgroundColor: '#6B7280' }} />
            <span className="text-[13px]" style={{ color: '#4B5563' }}>{item.label}</span>
          </span>
        ))}
      </span>
    </button>
  );
};

export default NavMenu;
