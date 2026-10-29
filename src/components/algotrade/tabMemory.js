/**
 * Which tab the Algo Trade board shows when it mounts.
 *
 * It opens on Strategies, and only remembers another tab for the round trip it
 * starts itself -- Portfolios -> Activate -> Edit Portfolio and back. Leaving
 * via the sidebar or signing out ends that trip (`resetAlgoTab`).
 *
 * Its own module so App can reset it without importing the lazy-loaded
 * Activation chunk, which would defeat the split.
 */

const DEFAULT_TAB = 'Strategies';

let current = DEFAULT_TAB;

/** The tab the board should open on. */
export const getAlgoTab = () => current;

/** Remember a tab for the trip Algo Trade is about to start. */
export const setAlgoTab = (tab) => { current = tab; };

/** Back to Strategies — the user has left Algo Trade for good. */
export const resetAlgoTab = () => { current = DEFAULT_TAB; };
