import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import logger from '../utils/logger';
import { getLibrary, subscribeLibrary } from '../services/strategyLibrary';

/**
 * The saved strategies, in React state AND localStorage — one owner for both.
 *
 * Every screen used to read `saved_strategies_cards` itself, each getting a
 * snapshot at its own moment. Now it hydrates once on mount, mirrors back on
 * every change, and every screen reads the same state. A card holds the id and
 * version a loader needs, keyed by the name the user knows it by.
 */

const STORAGE_KEY = 'saved_strategies_cards';

const SavedStrategiesContext = createContext(undefined);

export const useSavedStrategies = () => {
  const context = useContext(SavedStrategiesContext);
  if (!context) {
    throw new Error('useSavedStrategies must be used within a SavedStrategiesProvider');
  }
  return context;
};

const normalise = (name) => String(name || '').trim().toLowerCase();

export const SavedStrategiesProvider = ({ children }) => {
  const [strategies, setStrategies] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Hydrate once. Until this has run nothing is written back, or an empty
  // initial state would erase the list before it was ever read.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      /*
        Only real, named entries survive. A hole or a null in the stored array
        -- which is what DevTools renders as the leading comma in `[,…]` --
        used to reach `byName`, where `normalise(s.name)` on an undefined entry
        throws inside a useMemo and takes the render down with it.
      */
      setStrategies(
        Array.isArray(saved)
          ? saved.filter((card) => card && typeof card === 'object' && card.name)
          : [],
      );
    } catch (error) {
      logger.error('[SavedStrategies] Could not read the saved list:', error);
      setStrategies([]);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    } catch (error) {
      // Storage full or blocked: the list still works for this session.
      logger.error('[SavedStrategies] Could not write the saved list:', error);
    }
  }, [strategies, isLoaded]);

  /** One row per NAME — that is how a user identifies a strategy. */
  const upsertStrategy = useCallback((card) => {
    if (!card?.name) return;
    setStrategies((previous) => {
      const at = previous.findIndex((s) => normalise(s.name) === normalise(card.name));
      if (at === -1) return [...previous, card];
      const next = previous.slice();
      // created_at belongs to the first save, not this one.
      next[at] = { ...previous[at], ...card, created_at: previous[at].created_at || card.created_at };
      return next;
    });
  }, []);

  /** Matched on id OR name: a strategy saved before and after the backend
   *  handed out an id can leave a card behind under each. */
  const removeStrategy = useCallback(({ id, name } = {}) => {
    setStrategies((previous) => previous.filter((s) => {
      const sameId = id !== undefined && id !== null && String(s.id) === String(id);
      const sameName = name && normalise(s.name) === normalise(name);
      return !(sameId || sameName);
    }));
  }, []);

  const byName = useMemo(() => {
    const map = new Map();
    strategies.forEach((s) => map.set(normalise(s.name), s));
    return map;
  }, [strategies]);

  /*
    THE SERVER'S NAMES TOO -- this is what makes "name already exists" true.

    The cards above are localStorage: only what THIS browser saved. A strategy
    saved elsewhere is absent from them while being present on the server --
    and checking the cards alone is why saving an existing name went through,
    letting the backend mint a SECOND strategy_id under it.

    Seeded from the library cache and kept current by its change event, so no
    request is made just to answer this.
  */
  const [libraryRows, setLibraryRows] = useState(() => getLibrary() || []);
  useEffect(() => subscribeLibrary((rows) => setLibraryRows(rows || [])), []);

  /** ONE state, two derivations -- the names to test against, and the rows a
   *  loader needs. Both recompute only when the library actually changes. */
  const serverNames = useMemo(
    () => new Set(libraryRows.map((r) => normalise(r?.name)).filter(Boolean)),
    [libraryRows],
  );
  const serverRows = useMemo(() => {
    const map = new Map();
    libraryRows.forEach((r) => {
      if (r?.name) map.set(normalise(r.name), { id: r.id, name: r.name, version: r.version });
    });
    return map;
  }, [libraryRows]);

  /**
   * The card for a name, or null — the id and version a loader needs.
   * Prefers this browser's own card (it may carry a version saved seconds ago
   * that the server list predates) and falls back to the server's row.
   */
  const findByName = useCallback(
    (name) => byName.get(normalise(name)) || serverRows.get(normalise(name)) || null,
    [byName, serverRows],
  );

  /** TRUE IF EITHER SOURCE KNOWS THE NAME. See the note above. */
  const hasName = useCallback(
    (name) => {
      const key = normalise(name);
      return byName.has(key) || serverNames.has(key);
    },
    [byName, serverNames],
  );

  const value = useMemo(() => ({
    strategies,
    isLoaded,
    upsertStrategy,
    removeStrategy,
    findByName,
    hasName,
  }), [strategies, isLoaded, upsertStrategy, removeStrategy, findByName, hasName]);

  return (
    <SavedStrategiesContext.Provider value={value}>
      {children}
    </SavedStrategiesContext.Provider>
  );
};

export default SavedStrategiesContext;
