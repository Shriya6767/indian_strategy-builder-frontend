import { useState, useEffect, useRef } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { useSavedStrategies } from '../context/SavedStrategiesContext';
import { Trash2, Folder, ChevronDown, X } from 'lucide-react';
import { deleteStrategy } from '../services/strategyApi';
import logger from '../utils/logger';
import { fetchStrategies as fetchStrategiesFromBackend } from '../services/libraryApi';

const asDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const SavedStrategiesList = ({ onLoadStrategy, onNavigateToBuilder, onShowToast, onRefreshStrategies, refreshKey }) => {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
  const [showPaperTradeModal, setShowPaperTradeModal] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [paperTradeInstances, setPaperTradeInstances] = useState(1);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState(null);

  const { strategies: contextStrategies, removeStrategy } = useSavedStrategies();

  const fetchStrategies = async () => {
    setLoading(true);
    setOpenDropdown(null);
    try {
      // GET /api/strategies — the signed-in user's own library, which is the
      // only complete list: localStorage only ever held what this browser saw.
      const rows = await fetchStrategiesFromBackend();
      setStrategies(rows);
    } catch (error) {
      logger.error('[SavedStrategiesList] Could not load strategies:', error);
      setStrategies([...contextStrategies].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      ));
      if (onShowToast) onShowToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStrategies();
    setOpenDropdown(null);
  }, [refreshKey, contextStrategies]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = (strategyId) => {
    if (strategyId === null || strategyId === undefined) {
      return;
    }
    setOpenDropdown(openDropdown === strategyId ? null : strategyId);
  };

  const handleActivate = (strategy, mode) => {
    setOpenDropdown(null);
    if (mode === 'paper') {
      setSelectedStrategy(strategy);
      setShowPaperTradeModal(true);
      setPaperTradeInstances(1);
    } else if (mode === 'live') {
    }
  };

  const handlePaperTradeActivate = () => {
    setShowPaperTradeModal(false);
    setSelectedStrategy(null);
  };

  const handleModalClose = () => {
    setShowPaperTradeModal(false);
    setSelectedStrategy(null);
    setPaperTradeInstances(1);
  };

  const handleStrategyClick = async (strategy) => {
    if (onLoadStrategy) {
      try {
        await onLoadStrategy(strategy.id, strategy.name);
        if (onNavigateToBuilder) {
          onNavigateToBuilder();
        }
      } catch (error) {
        logger.error('[SavedStrategiesList] Error loading strategy:', error);
        alert(`Failed to load strategy: ${error.message}`);
      }
    } else {
      logger.error('[SavedStrategiesList] onLoadStrategy callback is not defined!');
    }
  };

  const handleDelete = async (strategyId, strategyName) => {
    setStrategyToDelete({ id: strategyId, name: strategyName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!strategyToDelete) return;
    const { id: strategyId, name: strategyName } = strategyToDelete;
    try {
      removeStrategy({ id: strategyId, name: strategyName });
      if (onShowToast) {
        onShowToast(`Strategy "${strategyName}" deleted successfully!`, 'success');
      }
      fetchStrategies();
      if (onRefreshStrategies) {
        onRefreshStrategies();
      }
      try {
        await deleteStrategy(strategyId, strategyName);
      } catch (backendError) {
      }
    } catch (error) {
      logger.error('[SavedStrategiesList] Delete error:', error);
      if (onShowToast) {
        onShowToast(`Failed to delete strategy: ${error.message}`, 'error');
      } else {
        alert(`Failed to delete strategy: ${error.message}`);
      }
    } finally {
      setShowDeleteModal(false);
      setStrategyToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setStrategyToDelete(null);
  };

  const outlineBtn =
    'px-4 py-2 rounded-md text-[13px] font-medium border bg-white text-[#2a2a2a] hover:bg-[#f5f5f5] transition-colors';

  return (
    <div
      className="w-full h-full"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      <div className="mx-0">
        {/* Header — section-style heading like the rest of the app */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[20px] font-normal" style={{ color: '#3a3a3a' }}>Saved Strategies</h2>
            <span className="text-[13px] text-gray-400">{strategies.length} saved</span>
          </div>

        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 bg-white rounded-lg border border-[#f3f3f3] animate-pulse h-56" />
            ))}
          </div>
        ) : strategies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg border border-[#f3f3f3]">
            <Folder size={56} className="text-gray-300 mb-4" />
            <p className="text-[15px] font-medium text-gray-600 mb-1">No saved strategies yet</p>
            <p className="text-[13px] text-gray-400">Build a strategy and save it to see it here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                className="bg-white rounded-lg border border-[#f3f3f3] hover:border-[#e3e3e3] transition-colors p-5"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-[16px] font-semibold truncate" style={{ color: '#2a2a2a' }}>
                    {strategy.name}
                  </h2>
                  {strategy.strategy_type ? (
                  <span
                    className="px-2.5 py-1 rounded text-[12px] font-medium shrink-0"
                    style={{ backgroundColor: '#ECF6FF', color: '#0782DA' }}
                  >
                    {String(strategy.strategy_type).toUpperCase()}
                  </span>
                  ) : null}
                </div>

                {/* Symbol */}
                {strategy.symbol ? (
                  <h3 className="text-[14px] font-medium mb-2 uppercase" style={{ color: '#3a3a3a' }}>
                    {strategy.symbol}
                  </h3>
                ) : null}
                <div className="flex justify-between text-[13px] mb-5 gap-3">
                  {strategy.entry_time || strategy.exit_time ? (
                    <>
                      <div>
                        <span className="text-gray-500">Entry time: </span>
                        <span className="font-medium" style={{ color: '#2a2a2a' }}>{strategy.entry_time || '—'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-500">Exit time: </span>
                        <span className="font-medium" style={{ color: '#2a2a2a' }}>{strategy.exit_time || '—'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-gray-500">Start date: </span>
                        <span className="font-medium" style={{ color: '#2a2a2a' }}>{asDate(strategy.start_date) || '—'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-500">End date: </span>
                        <span className="font-medium" style={{ color: '#2a2a2a' }}>{asDate(strategy.end_date) || '—'}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 relative">
                  <button
                    onClick={() => handleStrategyClick(strategy)}
                    className={outlineBtn}
                    style={{ borderColor: '#e3e3e3' }}
                  >
                    Strategy
                  </button>
                  <button className={outlineBtn} style={{ borderColor: '#e3e3e3' }}>
                    Execution
                  </button>

                  {/* Activate dropdown */}
                  <div className="relative z-10" ref={openDropdown === strategy.id ? dropdownRef : null}>
                    <button
                      onClick={() => toggleDropdown(strategy.id)}
                      className="px-4 py-2 rounded-md text-[13px] font-medium text-white transition-colors flex items-center gap-1.5 hover:bg-[#0a5588]"
                      style={{ backgroundColor: '#0B619B' }}
                    >
                      Activate
                      <ChevronDown size={14} />
                    </button>

                    {openDropdown === strategy.id && strategy.id !== null && strategy.id !== undefined && (
                      <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-[#e3e3e3] z-50 overflow-hidden p-1">
                        <button
                          onClick={() => handleActivate(strategy, 'paper')}
                          className="w-full px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-[#f5f5f5] rounded transition-colors"
                        >
                          Paper Trade
                        </button>
                        <button
                          onClick={() => handleActivate(strategy, 'live')}
                          className="w-full px-3 py-2 text-left text-[13px] text-gray-400 hover:bg-[#f5f5f5] rounded transition-colors"
                        >
                          Live Trade
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(strategy.id, strategy.name);
                    }}
                    className="p-2 rounded-md border bg-white hover:bg-red-50 transition-colors ml-auto z-20 relative cursor-pointer"
                    style={{ borderColor: '#e3e3e3', color: '#e0473c' }}
                    title="Delete strategy"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paper Trade Modal */}
      {showPaperTradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-[16px] font-semibold text-gray-800">
                Paper-Trading Activation Settings
              </h2>
              <button
                onClick={handleModalClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-6">
              <div className="flex justify-end mb-5">
                <span className="text-[13px] text-gray-500 font-medium">
                  {paperTradeInstances}/10
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="text-center">
                  <h3 className="text-[13px] font-medium text-gray-700">Broker</h3>
                </div>
                <div className="text-center">
                  <h3 className="text-[13px] font-medium text-gray-700">No. of time</h3>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-center mb-6">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="paperTrade"
                    className="w-4 h-4 rounded border-gray-300"
                    style={{ accentColor: '#0B619B' }}
                    defaultChecked
                  />
                  <label htmlFor="paperTrade" className="text-[13px] text-gray-700 font-medium">
                    Paper Trade
                  </label>
                </div>
                <div className="flex items-center justify-center">
                  <div className="flex items-center border rounded-md" style={{ borderColor: '#e3e3e3' }}>
                    <button
                      onClick={() => setPaperTradeInstances(Math.max(1, paperTradeInstances - 1))}
                      className="px-3 py-1 text-[14px] hover:bg-[#f5f5f5] transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={paperTradeInstances}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setPaperTradeInstances(Math.min(10, Math.max(1, val)));
                      }}
                      className="w-14 text-center border-x py-1 text-[13px] focus:outline-none"
                      style={{ borderColor: '#e3e3e3' }}
                      min="1"
                      max="10"
                    />
                    <button
                      onClick={() => setPaperTradeInstances(Math.min(10, paperTradeInstances + 1))}
                      className="px-3 py-1 text-[14px] hover:bg-[#f5f5f5] transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handlePaperTradeActivate}
                  className="px-6 py-2 text-[13px] font-medium text-white rounded-md transition-colors"
                  style={{ backgroundColor: '#0C4A6E' }}
                >
                  Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteModal && !!strategyToDelete}
        title={`Are you sure you want to delete ${strategyToDelete?.name ?? ''} strategy?`}
        message="You will not have access to this strategy anymore."
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
};

export default SavedStrategiesList;
