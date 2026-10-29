import { useEffect, useRef, useState } from 'react';
import { X, Download } from 'lucide-react';
import { INK, MUTED, BORDER, THEME, READONLY_WARN } from './palette';
import StrategyBuilder from '../StrategyBuilder';
import { fetchStrategyConfig } from '../../services/strategyViewApi';

/**
 * The eye icon's popup: the saved strategy in the REAL builder, locked.
 *
 * Mounting the builder means the view covers every strategy type permanently,
 * where a hand-written read-only layout would omit whatever nobody remembered.
 * It cannot disturb the live builder: every write path is fed a sink (a local
 * ref, no-op callbacks), and `inert` takes the subtree out of pointer and focus
 * handling entirely. `readOnly` in the builder is presentation only.
 */

/** Where the PDF helper looks for the markup to capture. */
export const VIEW_CONTAINER_ID = 'strategy-readonly-pdf';

const StrategyReadOnly = ({ strategy, onClose, onNotify }) => {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // The builder pushes its live config into this ref. Pointing it at a ref this
  // popup owns is what keeps it off App's own liveConfigRef.
  const sinkRef = useRef({});

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // One read per open. A response landing after the popup closed is dropped.
  useEffect(() => {
    let stale = false;
    fetchStrategyConfig(strategy.id, strategy.name, strategy.version)
      .then((loaded) => { if (!stale) setConfig(loaded); })
      .catch((e) => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, [strategy.id, strategy.name, strategy.version]);

  const savePdf = async () => {
    setSaving(true);
    try {
      // The same screenshot-to-PDF path the portfolio pages use, pointed at
      // this popup's markup.
      const { generatePortfolioScreenshotPDF } = await import('../../utils/portfolioScreenshotPdf');
      await generatePortfolioScreenshotPDF(strategy.name, {
        containerId: VIEW_CONTAINER_ID,
        filePrefix: 'strategy',
        // A page break may only land between these: every leg card (which
        // carries this id) and every top-level settings section (marked
        // data-pdf-block in StrategyBuilder). Without the sections, pages
        // broke through the middle of Entry settings and the Overall block.
        blockSelector: '[id^="leg-card-"], [data-pdf-block]',
      });
    } catch (e) {
      onNotify?.(e.message || 'The PDF could not be created.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-[min(1280px,94vw)] h-[min(718px,88vh)] rounded-lg bg-white shadow-2xl flex flex-col"
           role="dialog" aria-modal="true" aria-label={`${strategy.name} (read only)`}>

        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: BORDER }}>
          <h3 className="text-[16px] font-semibold truncate" style={{ color: INK }}>{strategy.name}</h3>
          <button type="button" onClick={onClose} title="Close" className="shrink-0" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <p className="text-[13px] py-10 text-center" style={{ color: '#DC2626' }}>{error}</p>}
          {!error && !config && (
            <p className="text-[13px] py-10 text-center" style={{ color: MUTED }}>Loading strategy…</p>
          )}

          {config && (
            // `inert` removes the whole subtree from pointer, focus and tab
            // handling — one attribute instead of disabling hundreds of
            // controls, and it cannot be defeated by a stray handler.
            // `inert` must be a real boolean here: React 19 treats inert="" as
            // absent and drops it, which left the whole tree focusable.
            <div id={VIEW_CONTAINER_ID} className="bg-white" inert={true}>
              <StrategyBuilder
                readOnly
                savedConfig={config}
                strategyId={strategy.id}
                liveConfigRef={sinkRef}
                generation={0}
                isLoading={false}
                backtestResults={null}
                strategySavedInSession={false}
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

        {/* Footer. The reference puts the warning and the PDF button on one
            line at the foot of the dialog, the warning as plain text rather
            than a chip. */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t shrink-0"
             style={{ borderColor: BORDER }}>
          <p className="text-[13px]" style={{ color: READONLY_WARN }}>
            This is a read only view of strategy and can&apos;t be edited
          </p>
          <button
            type="button"
            onClick={savePdf}
            disabled={!config || saving}
            className="inline-flex items-center gap-2 h-[38px] px-4 rounded-md border text-[13px] font-medium bg-white shrink-0 disabled:opacity-50"
            style={{ borderColor: BORDER, color: INK, transition: 'background-color .15s ease, color .15s ease, border-color .15s ease' }}
            onMouseEnter={(e) => {
              if (!config || saving) return;
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
            {saving ? 'Preparing…' : 'PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Every callback the builder can fire is fed this, so nothing escapes the popup. */
function noop() {}

export default StrategyReadOnly;
