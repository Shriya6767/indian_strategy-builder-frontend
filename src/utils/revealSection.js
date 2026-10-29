import logger from './logger';

/**
 * Scroll a section into view AFTER it renders — and only if it is not already
 * on screen.
 *
 * NOT JUST scrollIntoView(): the target does not exist yet when we decide to
 * scroll. Opening a strategy swaps the builder's `key` (unmount + mount), and
 * on a first visit its lazy chunk is still downloading. So this polls for the
 * element, with a deadline, rather than guessing a delay.
 *
 * setTimeout, NOT requestAnimationFrame -- rAF does not fire while the page is
 * not compositing, so the scroll would be silently skipped.
 */

/** How much of the section must already be on screen to count as "the user is
 *  looking at it", in which case nothing moves. */
const ALREADY_VISIBLE = 0.5;

const POLL_MS = 60;
const DEADLINE_MS = 2500;

/** The nearest ancestor that actually scrolls, or null for the page itself. */
const scrollParentOf = (el) => {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

/**
 * The fraction of the element that is inside the visible box, 0..1.
 *
 * The denominator is capped at the viewport's own height so that a section
 * TALLER than the viewport can still reach 1 — otherwise a long section could
 * never look "visible enough" and would be scrolled to every single time.
 */
export const visibleFraction = (rect, view) => {
  const viewHeight = view.bottom - view.top;
  if (viewHeight <= 0 || rect.height <= 0) return 0;
  const overlap = Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top);
  if (overlap <= 0) return 0;
  return overlap / Math.min(rect.height, viewHeight);
};

/**
 * Scrolls `#id` into view once it exists, unless it is already mostly on
 * screen. Safe to call when the element will never appear: it gives up at the
 * deadline without throwing.
 *
 * Returns a function that cancels the pending attempt — call it if the thing
 * that asked for the scroll is itself torn down.
 */
export const revealSection = (id, { alreadyVisible = ALREADY_VISIBLE } = {}) => {
  if (typeof document === 'undefined') return () => {};

  let timer = null;
  let cancelled = false;
  const giveUpAt = Date.now() + DEADLINE_MS;

  const attempt = () => {
    if (cancelled) return;

    const el = document.getElementById(id);
    if (!el) {
      // Not rendered yet -- or never will be, if the user navigated away.
      if (Date.now() >= giveUpAt) {
        logger.warning(`[revealSection] "${id}" never appeared; not scrolling`);
        return;
      }
      timer = setTimeout(attempt, POLL_MS);
      return;
    }

    const scroller = scrollParentOf(el);
    const view = scroller
      ? scroller.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };

    // THE WHOLE POINT: if the user can already see this section, leave the
    // page exactly where they put it. Yanking the scroll position on someone
    // who is already looking at the right place is worse than doing nothing.
    if (visibleFraction(el.getBoundingClientRect(), view) >= alreadyVisible) return;

    // Honour the OS "reduce motion" setting -- a smooth scroll across a long
    // page is exactly the kind of movement that setting exists to stop.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  timer = setTimeout(attempt, 0);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
};

/** The builder's Instrument settings block — the section a strategy opens on. */
export const INSTRUMENT_SECTION_ID = 'instrument-settings';
