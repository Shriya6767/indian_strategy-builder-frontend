import { useEffect, useRef } from 'react';

/**
 * The three top-level screens, mirrored into the address bar.
 *
 * WHY THIS EXISTS: the app navigates by setting one string (`activeTab`) and
 * the URL never changed, so the browser recorded no history. Pressing Back
 * left the app entirely -- to a blank tab or the previous site -- and a
 * refresh always landed on the builder.
 *
 * WHY NOT REACT ROUTER: the agreed scope is these three screens and nothing
 * nested. A router would buy nested routes, params and guards that are not
 * wanted here, and in exchange the whole view switch in App.jsx would have to
 * be rewritten as <Routes>. This hook adds the same two behaviours -- a URL
 * per screen, and Back working -- without touching that JSX at all.
 *
 * Deliberately NOT addressable: Algo Trade's inner screens (broker setup,
 * history, trades), portfolio details and view-trades. They live in state this
 * hook never reads, so giving them URLs means unpicking `algoEntry`/`tabMemory`
 * -- a separate job.
 */

/** tab -> path. A tab missing here simply has no URL; see the effect below. */
const TAB_PATHS = {
  'builder': '/builder',
  'algo-trade': '/algo-trade',
  'portfolios': '/portfolios',
};

const PATH_TABS = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab]),
);

/** Trailing slashes and case are forgiven; anything unknown reads as null. */
export const tabFromPath = (pathname) => {
  const clean = String(pathname || '').replace(/\/+$/, '').toLowerCase() || '/';
  return PATH_TABS[clean] || null;
};

/**
 * Which tab a fresh load should open, from the address bar.
 * Pass straight to useState so the FIRST render is already the right screen --
 * mounting the builder and correcting it in an effect would flash the wrong
 * page and, on /algo-trade, build the board twice.
 */
export const initialTab = (fallback = 'builder') => {
  if (typeof window === 'undefined') return fallback;
  return tabFromPath(window.location.pathname) || fallback;
};

/**
 * Keeps the address bar and `activeTab` in step, both ways.
 *
 * @param activeTab  the tab currently rendered
 * @param onPopTab   called with a tab when the user presses Back or Forward;
 *                   it should apply it exactly as a click on that tab would
 */
export default function useUrlTab(activeTab, onPopTab) {
  // The callback is read through a ref so the popstate listener is attached
  // ONCE. Re-subscribing whenever the caller passes a new closure would detach
  // and reattach on most renders, and a Back pressed in that gap does nothing.
  const onPop = useRef(onPopTab);
  useEffect(() => { onPop.current = onPopTab; });

  const first = useRef(true);

  useEffect(() => {
    const path = TAB_PATHS[activeTab];
    // An unrouted tab leaves the URL as it was rather than inventing one.
    if (!path) return;

    if (first.current) {
      first.current = false;
      // REPLACE, not push, on the first paint: entering at "/" should become
      // "/builder" without stacking an entry, or the user's first Back press
      // would go to "/" -- a URL that maps to no tab -- instead of leaving.
      if (window.location.pathname !== path) {
        window.history.replaceState({ tab: activeTab }, '', path);
      }
      return;
    }

    // Already correct. This is the Back/Forward case: the browser rewrites the
    // URL before firing popstate, so by the time the new tab renders the path
    // matches -- and pushing here would re-add the entry just stepped off and
    // trap Back in a loop.
    if (window.location.pathname === path) return;

    window.history.pushState({ tab: activeTab }, '', path);
  }, [activeTab]);

  useEffect(() => {
    const handler = () => {
      const tab = tabFromPath(window.location.pathname);
      // Unknown path: leave the screen alone. Better a URL that disagrees for
      // one press than a blank app on a path this build does not serve.
      if (tab) onPop.current?.(tab);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
}
