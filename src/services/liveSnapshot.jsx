import { useEffect, useState } from 'react';
import { subscribeLive } from './liveSocket';

/**
 * src/services/liveSnapshot.jsx
 *
 * The React side of the live socket: one hook, used by any component that needs
 * live figures.
 *
 * Deliberately NOT a context provider. A provider holding a once-a-second value
 * re-renders its entire subtree every tick; subscribing per component means only
 * the components that actually read live data re-render, and the socket is
 * shared between them regardless (liveSocket is a singleton).
 */
export const useLiveSnapshot = () => {
  const [state, setState] = useState({ snapshot: null, stale: false, connected: false });
  useEffect(() => subscribeLive(setState), []);

  /**
   * `stale` alone was not enough to tell the user the screen is not live.
   *
   * It only turns true once a snapshot HAS arrived and then stops arriving --
   * so a socket that never connected at all (proxy down, worker unreachable,
   * token rejected) left stale:false and no warning anywhere, while status, MTM
   * and open positions silently froze at whatever the REST calls returned. That
   * reads exactly like a working screen on a quiet market.
   *
   * `live` is the honest question: are figures arriving right now? Anything
   * that shows per-second values should gate on this, not on `stale`.
   */
  return { ...state, live: state.connected && !state.stale };
};

/**
 * One deployment's live row, by strategy id -- what a card or table row needs.
 * Returns null until a snapshot naming that strategy arrives.
 */
export const useLiveDeployment = (strategyId) => {
  const { snapshot } = useLiveSnapshot();
  if (strategyId == null) return null;
  return (snapshot?.deployments || [])
    .find((d) => String(d.strategy_id) === String(strategyId)) || null;
};
