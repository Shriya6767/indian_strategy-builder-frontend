import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Search, MoreVertical, FileUp, Trash2 } from 'lucide-react';
import CreatePortfolioModal from './CreatePortfolioModal';
import ImportStrategyModal from './ImportStrategyModal';
import ConfirmDialog from './ConfirmDialog';
import { RenamePortfolioDialog, RenameStrategiesDialog, ImportDoneDialog } from './PortfolioImportDialogs';
import PortfolioDetails from './PortfolioDetails';
import { usePortfolio } from '../context/PortfolioContext';
import { useSavedStrategies } from '../context/SavedStrategiesContext';
import { readJsonFile, isStrategyFile } from '../utils/algtstImport';
import { parsePortfolioFile } from '../utils/algtstPortfolio';
import { buildSaveStrategyPayload, saveStrategy } from '../services/strategyApi';
import { buildSavePortfolioPayload, savePortfolio } from '../services/portfolioApi';
import { colors } from '../theme/colors';
import logger from '../utils/logger';

const PortfolioCard = React.memo(function PortfolioCard({
  portfolio,
  isMenuOpen,
  onToggleMenu,
  onDelete,
  onView,
}) {
  const slicedStrategies = React.useMemo(() => {
    return portfolio.strategies.slice(0, 3);
  }, [portfolio.strategies]);

  return (
    <div
      className="bg-white rounded-md border border-[#dcdcdc] hover:border-[#c8c8c8] transition-colors flex flex-col"
      style={{ width: '437px', minHeight: '262px' }}
    >
      {/* Card Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <h3 className="text-[20px] font-semibold truncate" style={{ color: '#2a2a2a' }}>
          {portfolio.portfolio_name}
        </h3>
        <div className="relative flex-shrink-0 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(portfolio.portfolio_id);
            }}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <MoreVertical size={16} />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-[#e3e3e3] rounded-md shadow-lg z-10 p-1">
              <button
                onClick={(e) => onDelete(portfolio.portfolio_id, portfolio.portfolio_name, e)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium rounded whitespace-nowrap hover:bg-red-50"
                style={{ color: '#e0473c' }}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Strategies band (AlgoTest) */}
      <div className="px-4 py-2 text-[13px]" style={{ backgroundColor: '#f7f7f7' }}>
        <span className="text-gray-500">Strategies: </span>
        <span className="font-medium" style={{ color: '#2a2a2a' }}>{portfolio.strategies.length}</span>
      </div>

      {/* Card Body */}
      <div className="px-4 py-2 flex-1 flex flex-col">
        <div className="flex-1">
          {slicedStrategies.map((strategy, idx) => (
            <div key={strategy.strategy_id || strategy.id || idx} className="border-b border-[#f3f3f3] py-2.5 last:border-b-0">
              <p className="text-[13px] truncate" style={{ color: '#3a3a3a' }}>{strategy.name || strategy.strategy_name || 'Untitled'}</p>
            </div>
          ))}
          {portfolio.strategies.length > 3 && (
            <div className="py-2">
              <p className="text-[13px]" style={{ color: '#0782DA' }}>+{portfolio.strategies.length - 3} more</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer — outlined View button (AlgoTest) */}
      <div className="px-4 pb-4 pt-2 mt-auto">
        <button
          onClick={() => onView(portfolio)}
          className="w-full text-center text-[12px] font-medium py-2 rounded border bg-[#fafafa] hover:bg-[#f0f0f0] transition-colors"
          style={{ borderColor: '#e5e7eb', color: '#0C4A6E' }}
        >
          View
        </button>
      </div>
    </div>
  );
});

const Portfolios = ({ onShowToast, onCreateNewStrategy, onOpenStrategyInBuilder, openPortfolioName, onOpenedPortfolio }) => {
  const { portfolios, deletePortfolio, removePortfolioLocal, updatePortfolio, addPortfolio, refreshFromBackend } = usePortfolio();

  // GET /api/portfolios whenever this screen opens, so the list is the user's
  // own rather than whatever this browser last stored.
  useEffect(() => {
    let cancelled = false;
    refreshFromBackend().then((error) => {
      if (error && !cancelled) onShowToast?.(error, 'error');
    });
    return () => { cancelled = true; };
  }, [refreshFromBackend]);
  const { strategies: savedStrategies, upsertStrategy } = useSavedStrategies();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPortfolio, setCurrentPortfolio] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  const handleCreatePortfolio = () => {
    setIsModalOpen(true);
  };

  const handlePortfolioCreated = (portfolioData) => {

    const newPortfolio = {
      portfolio_id: portfolioData.id,
      portfolio_name: portfolioData.name,
      strategies: (portfolioData.strategies || []).map((strategy, idx) => ({
        id: strategy.id || strategy.strategy_id || idx,
        name: strategy.name || strategy.strategy_name || 'Untitled',
        symbol: strategy.symbol || 'SPXW',
        strategy_type: (strategy.strategy_type || 'intraday').toUpperCase(),
        version: strategy.version || 1
      })),
      createdAt: new Date().toISOString()
    };


    setCurrentPortfolio(newPortfolio);
  };

  // The card menu's delete: the details screen has its own (see below).
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeletePortfolio = useCallback((portfolioId, portfolioName, e) => {
    e.stopPropagation();
    setPendingDelete({ id: portfolioId, name: portfolioName });
  }, []);

  const confirmDeletePortfolio = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deletePortfolio(pendingDelete.id);
      setOpenMenuId(null);
      setPendingDelete(null);
    } catch (error) {
      onShowToast?.(`Failed to delete portfolio: ${error.message}`, 'error');
      logger.error('Delete error:', error);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, deletePortfolio, onShowToast]);

  const handleBack = () => {
    setCurrentPortfolio(null);
    // Also retire the request Algo Trade arrived with, otherwise the derived
    // value above would immediately reopen the same portfolio.
    onOpenedPortfolio?.();
  };
  const filteredPortfolios = useMemo(
    () =>
      portfolios.filter(portfolio =>
        portfolio.portfolio_name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [portfolios, searchQuery]
  );

  const handleToggleMenu = useCallback((portfolioId) => {
    setOpenMenuId((prev) => (prev === portfolioId ? null : portfolioId));
  }, []);

  const requestedPortfolio = useMemo(() => {
    if (!openPortfolioName) return null;
    return portfolios.find(
      (p) => String(p.portfolio_name).toLowerCase() === String(openPortfolioName).toLowerCase(),
    ) || null;
  }, [openPortfolioName, portfolios]);

  const handleViewPortfolio = useCallback((portfolio) => {
    setCurrentPortfolio(portfolio);
  
    refreshFromBackend?.();
  }, [refreshFromBackend]);

  const shownPortfolio = currentPortfolio || requestedPortfolio;

  const handleUpdatePortfolio = (updatedPortfolioData) => {
    try {
      if (!shownPortfolio) throw new Error('No portfolio is open.');
      updatePortfolio(shownPortfolio.portfolio_id, {
        portfolio_name: updatedPortfolioData.name,
        strategies: updatedPortfolioData.strategies,
        startDate: updatedPortfolioData.startDate,
        endDate: updatedPortfolioData.endDate,
        scopeFilter: updatedPortfolioData.scopeFilter,
        qtyMultiplier: updatedPortfolioData.qtyMultiplier,
        dteTab: updatedPortfolioData.dteTab,
        slippage: updatedPortfolioData.slippage,
      });

      setCurrentPortfolio({
        ...shownPortfolio,
        portfolio_name: updatedPortfolioData.name,
        strategies: updatedPortfolioData.strategies,
        startDate: updatedPortfolioData.startDate,
        endDate: updatedPortfolioData.endDate,
        scopeFilter: updatedPortfolioData.scopeFilter,
        qtyMultiplier: updatedPortfolioData.qtyMultiplier,
        dteTab: updatedPortfolioData.dteTab,
        slippage: updatedPortfolioData.slippage,
      });


      if (onShowToast) {
        onShowToast('Portfolio Updated', 'success');
      }
    } catch (error) {
      logger.error('Error updating portfolio:', error);

      if (onShowToast) {
        onShowToast(`Failed to update portfolio: ${error.message}`, 'error');
      }
    }
  };

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);     // parsed file awaiting its names
  const [importNames, setImportNames] = useState(null);   // { portfolioName, strategyNames }
  const [importStage, setImportStage] = useState(null);   // 'portfolio' | 'strategies' | 'done'
  const [importBusy, setImportBusy] = useState(false);
  const [importedPortfolio, setImportedPortfolio] = useState(null);

  const savedStrategyNames = useCallback(
    () => new Set(savedStrategies.map((c) => String(c?.name || '').trim().toLowerCase()).filter(Boolean)),
    [savedStrategies],
  );

  const portfolioNameTaken = useCallback(
    (name) => portfolios.some((p) => (p.portfolio_name || '').trim().toLowerCase() === name.trim().toLowerCase()),
    [portfolios],
  );

  const closeImportFlow = () => {
    setImportFile(null);
    setImportNames(null);
    setImportStage(null);
    setImportedPortfolio(null);
  };

  /**
   * Creates everything the file describes: one save-strategy per strategy (they
   * need real ids before a portfolio can reference them), then the portfolio.
   */
  const runImport = useCallback(async (parsed, portfolioName, strategyNames) => {
    setImportBusy(true);
    try {
      const saved = [];
      for (let i = 0; i < parsed.strategies.length; i += 1) {
        const strategy = parsed.strategies[i];
        const name = strategyNames[i] || strategy.name;

        const payload = buildSaveStrategyPayload(strategy.config, 1);
        payload.strategy = { ...payload.strategy, strategy_name: name, strategy_id: null };
        const result = await saveStrategy(payload);

        // The backend reports failure as HTTP 200 with { status: false }.
        if (result?.data?.status === false || result?.status === false) {
          throw new Error(result?.data?.message || result?.message || `Could not save "${name}".`);
        }
        const strategyId = result?.strategy_id ?? result?.data?.strategy_id;
        if (strategyId === undefined || strategyId === null) {
          throw new Error(`"${name}" was saved but the backend returned no id.`);
        }
        // The version matters as much as the id: get-strategy needs both, and
        // an imported strategy is not necessarily version 1 on the backend.
        const version = result?.version ?? result?.data?.version ?? 1;
        saved.push({ ...strategy, name, strategyId, version });
      }

      saved.forEach((entry) => {
        upsertStrategy({
          id: entry.strategyId,
          name: entry.name,
          version: entry.version,
          symbol: entry.config.dte_filter || entry.config.symbol || 'sensex',
          strategy_type: entry.config.strategy_type || 'intraday',
          entry_time: entry.config.entry_time || '09:16',
          exit_time: entry.config.exit_time || '15:40',
          start_date: entry.config.start_date || null,
          end_date: entry.config.end_date || null,
          created_at: new Date().toISOString(),
          leg_count: entry.config.legs?.length || 0,
        });
      });

      const data = await savePortfolio(buildSavePortfolioPayload({
        portfolioId: null,
        portfolioName,
        // The imported strategies' own index, so the portfolio is saved against
        // the market it actually trades.
        index: saved[0]?.config?.symbol || saved[0]?.config?.dte_filter || 'sensex',
        // An imported file carries a DTE tab choice; everything else takes the
        // builder's defaults until the portfolio screen edits it.
        period: { mode: parsed.dteTab === 'DTE' ? 'dte' : 'weekdays' },
        strategies: saved.map((s) => ({
          strategy_id: s.strategyId,
          strategy_name: s.name,
          version: s.version,
        })),
      }));
      if (!data?.portfolio_id) {
        throw new Error(data?.message || 'The portfolio could not be created.');
      }

      const created = addPortfolio({
        portfolio_id: data.portfolio_id,
        portfolio_name: portfolioName,
        dteTab: parsed.dteTab,
        strategies: saved.map((s) => ({
          id: s.strategyId,
          strategy_id: s.strategyId,
          name: s.name,
          strategy_name: s.name,
          version: s.version,
          symbol: s.config.dte_filter,
          strategy_type: s.config.strategy_type,
          qty: s.qty,
          quantity_multiplier: s.qty,
          weekdays: s.weekdays,
          selectedDTEs: s.selectedDTEs,
          selected: s.selected,
        })),
        createdAt: new Date().toISOString(),
      });

      setImportedPortfolio(created);
      setImportStage('done');
      if (parsed.warnings?.length) {
        onShowToast?.(parsed.warnings.join(' '), 'error');
      }
    } catch (error) {
      logger.error('Error importing portfolio:', error);
      onShowToast?.(error.message || 'This portfolio could not be imported.', 'error');
      closeImportFlow();
    } finally {
      setImportBusy(false);
    }
  }, [addPortfolio, onShowToast, upsertStrategy]);

  /** Portfolio name settled — on to the strategies, or straight to the work. */
  const afterPortfolioName = useCallback((parsed, portfolioName) => {
    const taken = savedStrategyNames();
    const clashing = parsed.strategies.some((s) => taken.has(s.name.trim().toLowerCase()));

    setImportNames({ portfolioName, strategyNames: parsed.strategies.map((s) => s.name) });
    if (clashing) {
      setImportStage('strategies');
    } else {
      setImportStage(null);
      runImport(parsed, portfolioName, parsed.strategies.map((s) => s.name));
    }
  }, [savedStrategyNames, runImport]);

  const handleImportFile = async (file) => {
    const invalid = 'File upload failed due to tampering. Please import a valid file.';
    const json = await readJsonFile(file);
    if (!json || isStrategyFile(json)) return invalid;

    const parsed = parsePortfolioFile(json);
    if (!parsed.ok) return parsed.error;

    setImportOpen(false);
    setImportFile(parsed);

    if (portfolioNameTaken(parsed.name)) {
      setImportStage('portfolio');
    } else {
      afterPortfolioName(parsed, parsed.name);
    }
    return null;
  };

  const handleSaveAsNew = (portfolioData) => {
    try {
      const newPortfolioId = portfolioData.portfolio_id ?? portfolioData.id;
      if (newPortfolioId === undefined || newPortfolioId === null) {
        throw new Error('Backend did not return a portfolio id');
      }

      const newPortfolio = addPortfolio({
        portfolio_id: newPortfolioId,
        portfolio_name: portfolioData.name, // Use the name from modal input
        strategies: portfolioData.strategies,
        startDate: portfolioData.startDate,
        endDate: portfolioData.endDate,
        scopeFilter: portfolioData.scopeFilter,
        qtyMultiplier: portfolioData.qtyMultiplier,
        dteTab: portfolioData.dteTab,
        slippage: portfolioData.slippage,
        createdAt: new Date().toISOString()
      });


      setCurrentPortfolio(newPortfolio);

      if (onShowToast) {
        onShowToast('Portfolio saved as new', 'success');
      }
    } catch (error) {
      logger.error('Error saving portfolio as new:', error);

      if (onShowToast) {
        onShowToast(`Failed to save portfolio: ${error.message}`, 'error');
      }
    }
  };

  const handleDeletePortfolioFromDetails = useCallback(async () => {
    try {
      if (!shownPortfolio) throw new Error('No portfolio is open.');
      removePortfolioLocal(shownPortfolio.portfolio_id);
      setCurrentPortfolio(null);
    } catch (error) {
      onShowToast?.(`Failed to delete portfolio: ${error.message}`, 'error');
      logger.error('Delete error:', error);
    }
  }, [shownPortfolio, removePortfolioLocal, onShowToast]);

  const deleteDialog = (
    <ConfirmDialog
      isOpen={!!pendingDelete}
      title="Delete portfolio?"
      message="This Portfolio will be deleted and this action cannot be undone. Are you sure you want to continue?"
      onConfirm={confirmDeletePortfolio}
      onCancel={() => setPendingDelete(null)}
      busy={deleting}
    />
  );

  if (shownPortfolio) {
    return (
      <>
      <PortfolioDetails
        key={shownPortfolio.portfolio_id}
        portfolioId={shownPortfolio.portfolio_id}
        portfolioName={shownPortfolio.portfolio_name}
        strategies={shownPortfolio.strategies}
        startDate={shownPortfolio.startDate}
        endDate={shownPortfolio.endDate}
        dteTab={shownPortfolio.dteTab}
        onBack={handleBack}
        onUpdatePortfolio={handleUpdatePortfolio}
        onSaveAsNew={handleSaveAsNew}
        onDeletePortfolio={handleDeletePortfolioFromDetails}
        onOpenStrategyInBuilder={onOpenStrategyInBuilder}
        onShowToast={onShowToast}
      />
      {deleteDialog}
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen -mx-4 sm:-mx-5 -my-6" style={{ backgroundColor: '#FAFAFA', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        {/* AlgoTest-style page bar: blue underlined tab title, no credits info */}
        <div className="bg-white border-b px-6" style={{ borderColor: '#ececec' }}>
          <span
            className="inline-block text-[15px] font-medium py-3 border-b-2"
            style={{ color: colors.actionBar.primaryBg, borderColor: colors.actionBar.primaryBg }}
          >
            My Portfolio
          </span>
        </div>

        <div className={`px-6 py-5 ${portfolios.length === 0 ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                type="text"
                placeholder="Search Portfolio"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border rounded text-[12px] font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                style={{ borderColor: '#e3e3e3', color: '#3a3a3a' }}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 p-2 text-[12px] font-medium rounded border bg-white transition-colors"
                style={{ borderColor: '#d8d8d8', color: '#3a3a3a' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                  e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg;
                  e.currentTarget.style.color = '#FFFFFF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#d8d8d8';
                  e.currentTarget.style.color = '#3a3a3a';
                }}
              >
                <FileUp size={14} />
                Import
              </button>
              <button
                onClick={handleCreatePortfolio}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-white rounded transition-colors hover:bg-[#093a57]"
                style={{ backgroundColor: '#0C4A6E' }}
              >
                <Plus size={14} />
                Create new portfolio
              </button>
            </div>
          </div>
        </div>

        {/* Portfolios List or Empty State */}
        {portfolios.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 160px)' }}>
            <div className="text-center">
              {/* Outlined panes, the shape the reference empty state uses. */}
              <svg
                width="96" height="76" viewBox="0 0 96 76" fill="none"
                className="mx-auto mb-7" aria-hidden="true"
              >
                <rect x="1" y="1" width="94" height="74" rx="7" stroke="#C9CDD2" strokeWidth="2" />
                <line x1="40" y1="1" x2="40" y2="75" stroke="#C9CDD2" strokeWidth="2" />
                {[20, 30, 40, 50, 60].map((y) => (
                  <line key={y} x1="52" y1={y} x2="84" y2={y} stroke="#C9CDD2" strokeWidth="2" strokeLinecap="round" />
                ))}
              </svg>

              <h2 className="text-[22px] font-semibold mb-2" style={{ color: '#2a2a2a' }}>Portfolios</h2>
              <p className="text-[14px] mb-7" style={{ color: '#6B7280' }}>No portfolios created yet.</p>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-2 h-10 px-5 text-[14px] font-medium rounded-md border bg-white transition-colors"
                  style={{ borderColor: colors.actionBar.secondaryBorder, color: colors.actionBar.secondaryText }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                    e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg;
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.borderColor = colors.actionBar.secondaryBorder;
                    e.currentTarget.style.color = colors.actionBar.secondaryText;
                  }}
                >
                  <FileUp size={16} />
                  Import
                </button>
                <button
                  onClick={handleCreatePortfolio}
                  className="inline-flex items-center gap-2 h-10 px-5 text-[14px] font-medium rounded-md border bg-white transition-colors"
                  style={{ borderColor: colors.actionBar.secondaryBorder, color: colors.actionBar.secondaryText }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                    e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg;
                    e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.borderColor = colors.actionBar.secondaryBorder;
                    e.currentTarget.style.color = colors.actionBar.secondaryText;
                  }}
                >
                  <Plus size={16} />
                  Create new portfolio
                </button>
              </div>
            </div>
          </div>
        ) : filteredPortfolios.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
            <div className="text-center">
              <p className="text-[13px] text-gray-400">No portfolios match your search</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex flex-wrap gap-5">
              {filteredPortfolios.map((portfolio) => (
                <PortfolioCard
                  key={portfolio.portfolio_id}
                  portfolio={portfolio}
                  isMenuOpen={openMenuId === portfolio.portfolio_id}
                  onToggleMenu={handleToggleMenu}
                  onDelete={handleDeletePortfolio}
                  onView={handleViewPortfolio}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Portfolio Modal */}
      <CreatePortfolioModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreatePortfolio={handlePortfolioCreated}
        onCreateNewStrategy={onCreateNewStrategy}
        onShowToast={onShowToast}
      />

      <ImportStrategyModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImportFile}
        title="Import Portfolio"
      />

      <RenamePortfolioDialog
        key={`pf-${importFile?.name ?? ''}`}
        isOpen={importStage === 'portfolio'}
        initialName={importFile?.name ?? ''}
        isTaken={portfolioNameTaken}
        onCancel={closeImportFlow}
        onConfirm={(name) => afterPortfolioName(importFile, name)}
        busy={importBusy}
      />

      <RenameStrategiesDialog
        key={`st-${(importNames?.strategyNames ?? []).join('|')}`}
        isOpen={importStage === 'strategies'}
        names={importNames?.strategyNames ?? []}
        isTaken={(name) => savedStrategyNames().has(name.trim().toLowerCase())}
        onCancel={closeImportFlow}
        onConfirm={(names) => { setImportStage(null); runImport(importFile, importNames.portfolioName, names); }}
        busy={importBusy}
      />

      <ImportDoneDialog
        isOpen={importStage === 'done'}
        portfolioName={importNames?.portfolioName ?? ''}
        onGo={() => { const target = importedPortfolio; closeImportFlow(); setCurrentPortfolio(target); }}
      />

      {deleteDialog}
    </>
  );
};

export default Portfolios;