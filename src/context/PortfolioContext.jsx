import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchPortfolios } from '../services/libraryApi';
import { deletePortfolioAPI } from '../services/api';
import logger from '../utils/logger';

const PortfolioContext = createContext();

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
};

export const PortfolioProvider = ({ children }) => {
  const [portfolios, setPortfolios] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  /**
   * GET /api/portfolios — the signed-in user's own list, which is the only
   * complete one: localStorage holds what THIS browser happened to create.
   * Called when the Portfolios screen opens rather than on mount, so signing in
   * and never opening it costs nothing.
   *
   * A failure leaves the stored list alone: replacing it with nothing would
   * read as "your portfolios are gone".
   */
  const refreshFromBackend = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const rows = await fetchPortfolios();
      setPortfolios(rows.map((row) => ({ ...row.raw, portfolio_name: row.name, id: row.id })));
      return null;
    } catch (error) {
      logger.error('[Portfolios] Could not load from the backend:', error);
      setSyncError(error.message);
      return error.message;
    } finally {
      setIsSyncing(false);
    }
  }, []);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedPortfolios = localStorage.getItem('portfolios');
    
    if (savedPortfolios) {
      try {
        const parsed = JSON.parse(savedPortfolios);
        setPortfolios(parsed);
      } catch (error) {
        logger.error('Error loading portfolios from localStorage:', error);
        setPortfolios([]);
      }
    } else {
      setPortfolios([]);
    }
    
    setIsLoaded(true);
  }, []); // Run once on mount

  useEffect(() => {
    if (isLoaded) {
      if (portfolios.length > 0) {
        localStorage.setItem('portfolios', JSON.stringify(portfolios));
      } else {
        localStorage.removeItem('portfolios');
      }
    }
  }, [portfolios, isLoaded]);

  const addPortfolio = (portfolio) => {
    
    const newPortfolio = {
      portfolio_id: portfolio.portfolio_id || portfolio.id,
      portfolio_name: portfolio.portfolio_name || portfolio.name,
      strategies: (portfolio.strategies || []).map(strategy => ({
        id: strategy.id || strategy.strategy_id,
        strategy_id: strategy.strategy_id || strategy.id,
        strategy_name: strategy.strategy_name || strategy.name,
        version: strategy.version || 1,
        symbol: strategy.symbol || 'SPXW',
        strategy_type: strategy.strategy_type || 'intraday',
        qty: strategy.qty,
        quantity_multiplier: strategy.quantity_multiplier,
        weekdays: strategy.weekdays,
        selectedDTEs: strategy.selectedDTEs,
        selectedBudgetDays: strategy.selectedBudgetDays,
        budgetPct: strategy.budgetPct,
        slippage_percent: strategy.slippage_percent,
        selected: strategy.selected !== undefined ? strategy.selected : true
      })),
      createdAt: portfolio.createdAt || new Date().toISOString()
    };
    
    setPortfolios(prev => [...prev, newPortfolio]);
    return newPortfolio;
  };

  const updatePortfolio = (portfolioId, updatedData) => {
    
    setPortfolios(prev =>
      prev.map(p =>
        p.portfolio_id === portfolioId
          ? { 
              ...p, 
              ...updatedData, 
              strategies: (updatedData.strategies || p.strategies || []).map(strategy => ({
                id: strategy.id || strategy.strategy_id,
                strategy_id: strategy.strategy_id || strategy.id,
                strategy_name: strategy.strategy_name || strategy.name,
                version: strategy.version || 1,
                symbol: strategy.symbol,
                strategy_type: strategy.strategy_type,
                qty: strategy.qty,
                quantity_multiplier: strategy.quantity_multiplier,
                weekdays: strategy.weekdays,
                selectedDTEs: strategy.selectedDTEs,
                selectedBudgetDays: strategy.selectedBudgetDays,
                budgetPct: strategy.budgetPct,
                slippage_percent: strategy.slippage_percent,
                selected: strategy.selected
              })),
              updatedAt: new Date().toISOString() 
            }
          : p
      )
    );
  };

  const deletePortfolio = async (portfolioId) => {
    try {
      
      const response = await deletePortfolioAPI(portfolioId);
      
      setPortfolios(prev => prev.filter(p => p.portfolio_id !== portfolioId));
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete portfolio:', error);
      throw error;
    }
  };

  /**
   * Drop a portfolio from local state WITHOUT calling the backend.
   *
   * For the caller that has already deleted it server-side — the portfolio
   * detail page, which runs its own confirm and its own /delete-portfolio with
   * the id resolved by name. It used to finish by calling deletePortfolio()
   * below, which issued a SECOND identical POST for one user action.
   *
   * Use deletePortfolio() when nothing has contacted the backend yet (the
   * portfolio list card); use this when something already has.
   */
  const removePortfolioLocal = (portfolioId) => {
    setPortfolios(prev => prev.filter(p => p.portfolio_id !== portfolioId));
  };

  const getPortfolioById = (portfolioId) => {
    return portfolios.find(p => p.portfolio_id === portfolioId);
  };

  const clearAllPortfolios = () => {
    setPortfolios([]);
    localStorage.removeItem('portfolios');
  };

  const value = {
    portfolios,
    addPortfolio,
    updatePortfolio,
    deletePortfolio,
    removePortfolioLocal,
    getPortfolioById,
    clearAllPortfolios,
    refreshFromBackend,
    isSyncing,
    syncError,
    isLoaded // Expose whether data has been loaded from localStorage
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
};
