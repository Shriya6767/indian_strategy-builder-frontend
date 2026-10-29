import { fetchStrategies } from './libraryApi';
import logger from '../utils/logger';

/**
 * The saved-strategy library as the BACKEND has it, shared between views.
 *
 * The sidebar tree used to render from the localStorage cards, which hold only
 * what THIS browser saved -- so a strategy saved elsewhere was simply missing.
 * This asks GET /api/strategies instead.
 *
 * Announce-your-own-writes, as strategyFolders does: whoever refreshes, every
 * listener hears about it.
 */

const CHANGED = 'strategy-library-changed';

/** The last answer, so a view mounting later does not have to refetch. */
let latest = null;

export const getLibrary = () => latest;

export const subscribeLibrary = (fn) => {
  if (typeof window === 'undefined') return () => {};
  const onChange = (e) => fn(e.detail ?? latest ?? []);
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
};

/**
 * Refetch, then tell everyone. Never rejects: the library is a convenience,
 * and a failed list must not take down whatever triggered the refresh.
 */
export const refreshLibrary = async () => {
  try {
    const rows = await fetchStrategies();
    latest = Array.isArray(rows) ? rows : [];
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHANGED, { detail: latest }));
    }
    return latest;
  } catch (err) {
    logger.error('[library] could not refresh:', err);
    return latest ?? [];
  }
};
