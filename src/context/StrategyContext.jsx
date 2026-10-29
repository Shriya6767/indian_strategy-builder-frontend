import { createContext, useContext, useState, useEffect } from 'react';
import logger from '../utils/logger';

/**
 * Strategy Context - Stores strategy_id, strategy_name, and version
 * 
 * Features:
 * - In-memory storage via React Context (fast access)
 * - Persistent storage via localStorage (survives refresh/reopen)
 * - Auto-loads from localStorage on mount
 * - Auto-syncs to localStorage on updates
 */

const STORAGE_KEY = 'strategy_session_data';
const VERSION_MAP_KEY = 'strategy_versions_map'; // Maps strategy_name → version

const StrategyContext = createContext(undefined);

/**
 * Strategy Context Provider Component
 * Wraps the app and provides strategy data to all child components
 */
export const StrategyProvider = ({ children }) => {

  const [strategyData, setStrategyData] = useState({
    strategy_id: null,
    strategy_name: null,
    version: null,
  });

  // name -> version, in state as well as localStorage. It used to be read
  // straight out of storage on every lookup, which left it the one thing the
  // app persisted that no context held.
  const [versionMap, setVersionMap] = useState({});

  const [isInitialized, setIsInitialized] = useState(false);
  // True only after a save/load in THIS session — a name restored from
  // localStorage alone keeps the header showing "Unsaved Strategy".
  const [sessionTouched, setSessionTouched] = useState(false);

  /**
   * INITIALIZATION: Load data from localStorage on mount
   * This runs ONCE when the app first loads
   */
  useEffect(() => {
    // The version map comes back with everything else, so a reopened tab knows
    // which version each saved strategy is on.
    try {
      const storedMap = JSON.parse(localStorage.getItem(VERSION_MAP_KEY) || '{}');
      if (storedMap && typeof storedMap === 'object') setVersionMap(storedMap);
    } catch (error) {
      logger.error('[StrategyContext] Error reading version map:', error);
    }

    try {
      const storedData = localStorage.getItem(STORAGE_KEY);
      
      if (storedData) {
        const parsed = JSON.parse(storedData);
        
        setStrategyData({
          strategy_id: parsed.strategy_id || null,
          strategy_name: parsed.strategy_name || null,
          version: parsed.version || null,
        });
        
      } else {
      }
    } catch (error) {
      logger.error(''.repeat(50));
      logger.error('[StrategyContext] ERROR loading from localStorage:', error);
      logger.error('Error details:', error.message);
      logger.error(''.repeat(50));
    } finally {
      setIsInitialized(true);
    }
  }, []); // Empty dependency array = runs once on mount

  /**
   * AUTO-SYNC: Save to localStorage whenever strategyData changes
   * This runs after initialization and whenever data is updated
   */
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strategyData));
    } catch (error) {
      logger.error('[StrategyContext] Error syncing to localStorage:', error);
    }
  }, [strategyData, isInitialized]); // Runs when strategyData changes

  /**
   * UPDATE FUNCTION: Set strategy data (updates Context + localStorage)
   * Also updates the version map (strategy_name → version mapping)
   * 
   * @param {string|number|null} strategy_id - Strategy ID
   * @param {string|null} strategy_name - Strategy name
   * @param {number|null} version - Version number
   */
  const updateStrategyData = (strategy_id, strategy_name, version) => {
    setSessionTouched(true);

    setStrategyData({
      strategy_id: strategy_id || null,
      strategy_name: strategy_name || null,
      version: version || null,
    });

    if (strategy_name && version !== null && version !== undefined) {
      setVersionMap((previous) => {
        const next = { ...previous, [strategy_name]: version };
        try {
          localStorage.setItem(VERSION_MAP_KEY, JSON.stringify(next));
        } catch (error) {
          logger.error('[StrategyContext] Error updating version map:', error);
        }
        return next;
      });
    }

  };

  /**
   * GET VERSION BY STRATEGY NAME
   * Retrieves the stored version for a specific strategy name
   * 
   * @param {string} strategy_name - Strategy name
   * @returns {number|null} Version number or null if not found
   */
  const getVersionByName = (strategy_name) => {
    const version = versionMap[strategy_name];
    return version !== undefined ? version : null;
  };

  /**
   * CLEAR FUNCTION: Reset strategy data (clears Context + localStorage)
   */
  const clearStrategyData = () => {

    setStrategyData({
      strategy_id: null,
      strategy_name: null,
      version: null,
    });

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      logger.error('[StrategyContext] Error clearing localStorage:', error);
    }
  };

  /**
   * GET FUNCTION: Manually read from localStorage (useful for debugging)
   * Normally not needed - use strategyData from Context instead
   */
  const getFromLocalStorage = () => {
    try {
      const storedData = localStorage.getItem(STORAGE_KEY);
      return storedData ? JSON.parse(storedData) : null;
    } catch (error) {
      logger.error('[StrategyContext] Error reading from localStorage:', error);
      return null;
    }
  };

  const contextValue = {
    strategy_id: strategyData.strategy_id,
    strategy_name: strategyData.strategy_name,
    version: strategyData.version,
    
    updateStrategyData,
    
    getVersionByName,
    
    clearStrategyData,
    
    getFromLocalStorage,
    
    isInitialized,
    sessionTouched,
  };

  return (
    <StrategyContext.Provider value={contextValue}>
      {children}
    </StrategyContext.Provider>
  );
};

/**
 * Custom Hook: useStrategy()
 * Use this in any component to access strategy data
 * 
 * Example:
 * const { strategy_id, strategy_name, version, updateStrategyData } = useStrategy();
 */
export const useStrategy = () => {
  const context = useContext(StrategyContext);
  
  if (context === undefined) {
    throw new Error('useStrategy must be used within a StrategyProvider');
  }
  
  return context;
};

export default StrategyContext;
