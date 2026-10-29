import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { colors } from '../theme/colors';
import { usePortfolio } from '../context/PortfolioContext';
import { useSavedStrategies } from '../context/SavedStrategiesContext';
import { fetchStrategies as fetchLibraryStrategies } from '../services/libraryApi';
import logger from '../utils/logger';

const CreatePortfolioModal = ({ isOpen, onClose, onCreatePortfolio, onCreateNewStrategy, onShowToast }) => {
  const { portfolios } = usePortfolio();
  const { strategies: contextStrategies } = useSavedStrategies();
  const [nameError, setNameError] = useState('');
  const [portfolioName, setPortfolioName] = useState('');
  const [activeTab, setActiveTab] = useState('My Strategies');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchStrategies();
    }
  }, [isOpen]);

  const fetchStrategies = async () => {
    setLoading(true);
    try {
      let serverRows = [];
      try {
        serverRows = await fetchLibraryStrategies();
      } catch (error) {
        // A failed read must not empty the dialog -- fall back to the cards,
        // which is what it showed before, rather than to nothing.
        logger.error('[CreatePortfolioModal] could not load the library:', error);
      }
      const byName = new Map();
      const add = (item) => {
        const key = (item?.name || '').trim().toLowerCase();
        if (!key) return;
        const seen = byName.get(key);
        if (!seen || new Date(item.created_at || 0) >= new Date(seen.created_at || 0)) {
          byName.set(key, item);
        }
      };
      (contextStrategies || []).forEach(add);
      serverRows.forEach(add);

      setStrategies([...byName.values()].sort(
        (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
      ));
    } catch (error) {
      logger.error('Error reading the saved strategies:', error);
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredStrategies = strategies.filter(strategy =>
    (strategy.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selectedStrategies.length === filteredStrategies.length) {
      setSelectedStrategies([]);
    } else {
      setSelectedStrategies(filteredStrategies.map(s => s.id));
    }
  };

  const handleToggleStrategy = (strategyId) => {
    setSelectedStrategies(prev =>
      prev.includes(strategyId)
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  /** Shown under the field, and the reason the button refuses. */
  const NAME_TAKEN_MESSAGE = 'This name already exists. Please give a different name.';

  /** A portfolio already goes by this name. Blank is not a clash -- the
   *  empty-field message is a different one. */
  const nameTaken = (name) => {
    const key = String(name ?? '').trim().toLowerCase();
    if (!key) return false;
    return portfolios.some(
      (p) => (p.portfolio_name || '').trim().toLowerCase() === key,
    );
  };

  const handleCreatePortfolio = async () => {
    if (!portfolioName.trim()) {
      onShowToast?.('Please fill the name field', 'error');
      return;
    }
    // Under the field rather than in a toast: the field is what has to change,
    // and a toast about it leaves the user looking for which one.
    if (nameTaken(portfolioName)) {
      setNameError(NAME_TAKEN_MESSAGE);
      return;
    }
    if (selectedStrategies.length === 0) {
      onShowToast?.('Please select at least one strategy', 'error');
      return;
    }
    const toRow = (strategyId) => {
      const strategy = strategies.find((s) => s.id === strategyId);
      return {
        id: strategy?.id || strategyId,
        strategy_id: strategyId,
        name: strategy?.name || '',
        strategy_name: strategy?.name || '',
        version: strategy?.version || 1,
        symbol: strategy?.symbol || 'sensex',
        strategy_type: strategy?.strategy_type || 'intraday',
        qty: strategy?.qty || 1,
        quantity_multiplier: strategy?.quantity_multiplier || 1,
        weekdays: strategy?.weekdays || {},
        selectedDTEs: strategy?.selectedDTEs || [0],
        selectedBudgetDays: strategy?.selectedBudgetDays || [],
        budgetPct: strategy?.budgetPct || 0,
        slippage_percent: strategy?.slippage_percent || 0,
        selected: true,
      };
    };

    const rows = selectedStrategies.map(toRow);

    handleClose();
    // After the dialog has gone, so the detail page mounts on a clean screen.
    setTimeout(() => {
      onCreatePortfolio({
        id: null,
        name: portfolioName.trim(),
        strategies: rows,
      });
    }, 100);
  };

  const handleClose = () => {
    setPortfolioName('');
    setSearchQuery('');
    setSelectedStrategies([]);
    setActiveTab('My Strategies');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Create New Portfolio</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Portfolio Name Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Portfolio Name
            </label>
            <input
              type="text"
              value={portfolioName}
              onChange={(e) => {
                const next = e.target.value;
                setPortfolioName(next);
                setNameError(nameTaken(next) ? NAME_TAKEN_MESSAGE : '');
              }}
              placeholder="Your portfolio name"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              style={{ borderColor: nameError ? '#DC2626' : '#d1d5db' }}
            />
            {nameError && (
              <p className="mt-1.5 text-[12px]" style={{ color: '#DC2626' }}>{nameError}</p>
            )}
          </div>

          {/* Add Strategy Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Add Strategy</h3>
              <button
                type="button"
                onClick={() => { onClose?.(); onCreateNewStrategy?.(); }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + New Strategy
              </button>
            </div>

            {/* Tab - My Strategies */}
            <div className="border-b border-gray-200 mb-4">
              <button
                className="px-4 py-2 text-sm font-medium text-blue-600 relative"
              >
                My Strategies
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Strategy"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            {/* Select All Checkbox */}
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
              <input
                type="checkbox"
                id="select-all"
                checked={selectedStrategies.length === filteredStrategies.length && filteredStrategies.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="select-all" className="text-sm font-medium text-gray-700 cursor-pointer">
                Select all ({filteredStrategies.length})
              </label>
            </div>

            {/* Strategies List */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-gray-500">
                  Loading strategies...
                </div>
              ) : filteredStrategies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No strategies found
                </div>
              ) : (
                filteredStrategies.map((strategy) => (
                  <div key={strategy.id} className="flex items-center gap-2 py-2 hover:bg-gray-50 px-2 rounded">
                    <input
                      type="checkbox"
                      id={`strategy-${strategy.id}`}
                      checked={selectedStrategies.includes(strategy.id)}
                      onChange={() => handleToggleStrategy(strategy.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor={`strategy-${strategy.id}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                      {strategy.name}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleClose}
            className="px-6 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreatePortfolio}
            disabled={loading || nameTaken(portfolioName)}
            className="px-6 py-2 rounded-lg font-medium transition-all text-white active:scale-95 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: colors.legBuilder.addLegBg }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
          >
            {loading ? 'Creating...' : 'Create Portfolio'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePortfolioModal;
