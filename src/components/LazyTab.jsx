import { Component, Suspense } from 'react';
import logger from '../utils/logger';

/**
 * Error boundary + Suspense for the lazily-imported tabs.
 *
 * Each tab is a hashed chunk. A new build deletes the old hashes, so a browser
 * that loaded the page before a deploy asks for a file that is gone -- and with
 * no boundary React tears the whole root down, leaving a blank page. Reloading
 * fixes it because index.html revalidates; this does that automatically, once.
 */

const RELOAD_MARK_KEY = 'chunk_reload_attempted_at';
// A reload loop would re-fail within milliseconds; a genuine second failure
// hours later should still be allowed to recover on its own.
const RELOAD_COOLDOWN_MS = 30_000;

const isChunkLoadError = (error) => {
  const text = `${error?.name || ''} ${error?.message || error || ''}`;
  return (
    // Chrome/Edge, Firefox, Safari all word this differently.
    /dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /Loading chunk .* failed/i.test(text) ||
    /error loading dynamically imported module/i.test(text)
  );
};

const recentlyReloaded = () => {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_MARK_KEY) || 0);
    return at > 0 && Date.now() - at < RELOAD_COOLDOWN_MS;
  } catch {
    // Storage blocked: treat as "already tried" so a loop is impossible.
    return true;
  }
};

const markReloaded = () => {
  try {
    sessionStorage.setItem(RELOAD_MARK_KEY, String(Date.now()));
  } catch {
    // Nothing to do — recentlyReloaded() already errs on the safe side.
  }
};

class LazyTabBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error) {
    return { error, reloading: isChunkLoadError(error) && !recentlyReloaded() };
  }

  componentDidCatch(error) {
    logger.error('[LazyTab] Tab failed to render', error?.message || error);

    if (isChunkLoadError(error) && !recentlyReloaded()) {
      markReloaded();
      window.location.reload();
    }
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    // The reload is already running; showing an error first would flash.
    if (reloading) return this.props.fallback;

    const stale = isChunkLoadError(error);

    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-[15px] font-medium" style={{ color: '#2a2a2a' }}>
          {stale ? 'This page was updated' : 'Something went wrong on this tab'}
        </p>
        <p className="text-[13px] mt-2 max-w-md" style={{ color: '#6B7280' }}>
          {stale
            ? 'A newer version of the app is available, so this section could not be loaded. Reload to pick it up.'
            : 'Reloading usually clears it. Your saved strategies are not affected.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 h-10 px-5 rounded-md text-[14px] font-medium text-white transition-colors"
          style={{ backgroundColor: '#0B619B' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0064AB'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0B619B'; }}
        >
          Reload
        </button>
      </div>
    );
  }
}

/** Drop-in replacement for `<Suspense fallback={…}>` around a lazy tab. */
const LazyTab = ({ fallback, children }) => (
  <LazyTabBoundary fallback={fallback}>
    <Suspense fallback={fallback}>{children}</Suspense>
  </LazyTabBoundary>
);

export default LazyTab;
export { LazyTabBoundary };
