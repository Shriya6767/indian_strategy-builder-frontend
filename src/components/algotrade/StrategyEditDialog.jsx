import { useEffect, useRef, useState } from 'react';
import { X, Download } from 'lucide-react';
import { INK, MUTED, BORDER, THEME } from './palette';
import StrategyBuilder from '../StrategyBuilder';
import { fetchStrategyConfig } from '../../services/strategyViewApi';
import { buildSaveStrategyPayload, updateStrategy } from '../../services/strategyApi';
import { useSavedStrategies } from '../../context/SavedStrategiesContext';
import logger from '../../utils/logger';

/**
 * The pencil icon's popup on Algo Trade -> Strategies: the saved strategy in
 * the REAL builder, editable, with an Update that writes a new version.
 *
 * Sibling of StrategyReadOnly, which the PORTFOLIO's eye icon opens. That one
 * is deliberately locked; this one is not, and the two stay separate because
 * they are reached from different screens and mean different things.
 */

/** Where the PDF helper looks for the markup to capture. */
export const EDIT_CONTAINER_ID = 'strategy-edit-pdf';

const StrategyEditDialog = ({ strategy, onClose, onNotify, onUpdated }) => {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { upsertStrategy } = useSavedStrategies();

  /*
    The builder writes its CURRENT config here on every change. Read this on
    Update rather than a state copy: the builder's `onConfigChange` push is
    debounced by 200ms, so a value typed and then immediately saved would go
    out one edit behind.

    It is a ref this popup owns, so nothing here can reach App's own
    liveConfigRef or the strategy open in the builder tab.
  */
  const liveConfigRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !updating) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, updating]);

  // One read per open, asked for THIS strategy's version -- the endpoint
  // rejects a request with no version. A response landing after the popup
  // closed is dropped.
  useEffect(() => {
    let stale = false;
    fetchStrategyConfig(strategy.id, strategy.name, strategy.version)
      .then((loaded) => { if (!stale) setConfig(loaded); })
      .catch((e) => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, [strategy.id, strategy.name, strategy.version]);

  const savePdf = async () => {
    setPdfSaving(true);
    try {
      const { generatePortfolioScreenshotPDF } = await import('../../utils/portfolioScreenshotPdf');
      await generatePortfolioScreenshotPDF(strategy.name, {
        containerId: EDIT_CONTAINER_ID,
        filePrefix: 'strategy',
        blockSelector: '[id^="leg-card-"], [data-pdf-block]',
      });
    } catch (e) {
      onNotify?.(e.message || 'The PDF could not be created.', 'error');
    } finally {
      setPdfSaving(false);
    }
  };

  /**
   * PUT /api/update-strategy for THIS strategy, then refresh its saved card.
   *
   * THE ID COMES FROM THE POPUP, never from App. App's `strategyId` is
   * whatever the Strategy Builder tab has open, which is a different strategy
   * or none at all -- reusing its save handler would have updated the wrong
   * row, or created a new strategy, with a success toast either way.
   *
   * The card write is not optional: Setup Execution reads its entry time from
   * `saved_strategies_cards` and nothing else, so skipping this would leave it
   * showing the old time after a successful save.
   */
  const handleUpdate = async () => {
    const current = liveConfigRef.current || config;
    if (!current) return;

    if (!current.legs || current.legs.length === 0) {
      onNotify?.('At least one leg is required to update the strategy.', 'error');
      return;
    }

    setUpdating(true);
    try {
      const requestBody = buildSaveStrategyPayload(
        { ...current, strategy_name: strategy.name },
        1,
      );
      requestBody.strategy.strategy_id = strategy.id;

      const result = await updateStrategy(requestBody);

      // The backend reports failure as HTTP 200 with { status: false }, which
      // is why this is checked rather than trusting the absence of a throw.
      if (result && result.success === false) {
        throw new Error(result.message || result.error || 'The strategy could not be updated.');
      }

      const nextVersion = result?.version || strategy.version || 1;
      upsertStrategy({
        id: strategy.id,
        name: strategy.name,
        version: nextVersion,
        symbol: current.dte_filter || current.symbol || 'sensex',
        strategy_type: current.strategy_type || 'intraday',
        entry_time: current.entry_time || '09:16',
        exit_time: current.exit_time || '15:40',
        start_date: current.start_date || null,
        end_date: current.end_date || null,
        leg_count: current.legs?.length || 0,
      });

      onNotify?.('Strategy updated successfully', 'success');
      onUpdated?.({ ...strategy, version: nextVersion });
      onClose();
    } catch (e) {
      // The popup STAYS OPEN on failure: the edits are still in it, and
      // closing would throw away work the server has not accepted.
      logger.error('[StrategyEditDialog] update failed:', e);
      onNotify?.(e.message || 'The strategy could not be updated.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-[min(1280px,94vw)] h-[min(718px,88vh)] rounded-lg bg-white shadow-2xl flex flex-col"
           role="dialog" aria-modal="true" aria-label={`Edit ${strategy.name}`}>

        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: BORDER }}>
          <h3 className="text-[16px] font-semibold truncate" style={{ color: INK }}>{strategy.name}</h3>
          <button type="button" onClick={onClose} disabled={updating} title="Close"
                  className="shrink-0 disabled:opacity-40" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <p className="text-[13px] py-10 text-center" style={{ color: '#DC2626' }}>{error}</p>}
          {!error && !config && (
            <p className="text-[13px] py-10 text-center" style={{ color: MUTED }}>Loading strategy…</p>
          )}

          {config && (
            // No `inert` and no `readOnly`, unlike StrategyReadOnly -- this one
            // is meant to be edited. Every callback below is still a no-op: the
            // builder's own Save, Save As New and Run Backtest belong to the
            // builder TAB, and the only way out of this popup is its own
            // Update button.
            // `builder-in-dialog` hides the builder's own fixed action bar.
            // It is position: fixed, so inside this modal it escapes to the
            // foot of the SCREEN and offered Save As New / Update / Start
            // Backtest under a dialog that has its own Update button.
            <div id={EDIT_CONTAINER_ID} className="bg-white builder-in-dialog">
              <StrategyBuilder
                savedConfig={config}
                strategyId={strategy.id}
                liveConfigRef={liveConfigRef}
                generation={0}
                isLoading={false}
                backtestResults={null}
                strategySavedInSession
                saveCompletedCounter={0}
                backtestCompletedCounter={0}
                sidebarOpen={false}
                onConfigChange={noop}
                onRunBacktest={noop}
                onSaveStrategy={noop}
                onSaveAsNew={noop}
                onResetStrategyId={noop}
                onClearResults={noop}
                onLoadVersion={noop}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
             style={{ borderColor: BORDER }}>
          <button
            type="button"
            onClick={savePdf}
            disabled={!config || pdfSaving || updating}
            className="inline-flex items-center gap-2 h-[38px] px-4 rounded-md border text-[13px] font-medium bg-white shrink-0 disabled:opacity-50"
            style={{ borderColor: BORDER, color: INK, transition: 'background-color .15s ease, color .15s ease, border-color .15s ease' }}
            onMouseEnter={(e) => {
              if (!config || pdfSaving || updating) return;
              e.currentTarget.style.backgroundColor = THEME;
              e.currentTarget.style.borderColor = THEME;
              e.currentTarget.style.color = '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.borderColor = BORDER;
              e.currentTarget.style.color = INK;
            }}
          >
            <Download size={15} />
            {pdfSaving ? 'Preparing…' : 'PDF'}
          </button>

          <button
            type="button"
            onClick={handleUpdate}
            disabled={!config || updating}
            className="inline-flex items-center gap-2 h-[38px] px-5 rounded-md text-[13px] font-medium text-white shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: THEME }}
          >
            {updating && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {updating ? 'Updating…' : 'Update Strategy'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** The builder's own action buttons belong to the builder tab, not here. */
function noop() {}

export default StrategyEditDialog;
