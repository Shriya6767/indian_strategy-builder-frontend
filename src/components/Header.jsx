import { useState, useRef } from 'react';
import { Upload, Download, SquarePen } from 'lucide-react';
import { useStrategy } from '../context/StrategyContext';
import { colors } from '../theme/colors';
import { buildAlgtstExport, algtstFileName } from '../utils/algtstExport';
import { droppedByReferenceFormat } from '../utils/algtstExtras';
import { strategyError } from '../utils/strategyValidation';
import { readAlgtstFile } from '../utils/algtstImport';
import logger from '../utils/logger';


const Header = ({ config = {}, liveConfigRef, onImportStrategy, canImport = true, onNotify,
  /** PDF is offered only once there is a result to put in it. */
  hasResults = false }) => {
  const { strategy_id, strategy_name, sessionTouched } = useStrategy();
  const [pdfBusy, setPdfBusy] = useState(false);

  const isSaved = Boolean(strategy_id && strategy_name && sessionTouched);


  // Export: the builder config serialised as a .algtst file.
  const handleExport = () => {
    const exportName = isSaved ? strategy_name : 'Unsaved Strategy';
    const dropped = droppedByReferenceFormat(liveConfigRef?.current || config);
    if (dropped.length) {
      onNotify?.(`Exported without ${dropped.join(' and ')} — the file format cannot carry them yet.`, 'error');
    }

    // What the builder has on screen, not the app's debounced copy of it.
    const liveConfig = liveConfigRef?.current || config;
    const invalid = strategyError(liveConfig);
    if (invalid) {
      onNotify?.(invalid, 'error');
      return;
    }
    const payload = buildAlgtstExport(liveConfig, exportName);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = algtstFileName(exportName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handlePDF = async () => {
    setPdfBusy(true);
    try {
      const { generatePortfolioScreenshotPDF } = await import('../utils/portfolioScreenshotPdf');
      await generatePortfolioScreenshotPDF(strategy_name || 'strategy', {
        containerId: 'strategy-pdf-content',
        filePrefix: 'strategy',
      });
    } catch (error) {
      logger.error('Failed to generate strategy PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };

  const importInputRef = useRef(null);
  const handleImportFile = async (file) => {
    if (!file) return;

    const parsed = await readAlgtstFile(file);
    if (!parsed.ok) {
      onNotify?.(parsed.error, 'error');
      return;
    }

    onImportStrategy?.(parsed.config);
    if (parsed.warnings?.length) {
      onNotify?.(parsed.warnings.join(' '), 'error');
    }
  };

  const actionBtn =
    'inline-flex items-center gap-2 h-[30px] px-3 text-[12px] font-normal rounded border bg-white transition-colors';

  return (
    <header className="bg-white border-b px-6 py-3" style={{ borderColor: '#ececec' }}>
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-3 min-w-0 flex-wrap gap-y-2">
          <h2 className="text-[22px] font-semibold truncate" style={{ color: '#2a2a2a' }}>
            {isSaved ? strategy_name : 'Unsaved Strategy'}
          </h2>
          {isSaved && (
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <SquarePen size={16} />
            </button>
          )}
          {canImport && (
            <button
              onClick={() => importInputRef.current?.click()}
              className={actionBtn}
              style={{ borderColor: '#e3e3e3', color: colors.actionBar.secondaryText }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg;
                e.currentTarget.style.color = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.borderColor = '#e3e3e3';
                e.currentTarget.style.color = colors.actionBar.secondaryText;
              }}
              type="button"
            >
              <Download size={16} strokeWidth={1.5} data-import-icon />
              Import
            </button>
          )}
          <button onClick={handleExport} className={`${actionBtn} hover:bg-[#ecf6ff]`} style={{ borderColor: '#e3e3e3', color: '#0782DA' }} type="button">
            <Upload size={16} strokeWidth={1.5} />
            Export
          </button>
          {hasResults ? (
            <button
              onClick={handlePDF}
              disabled={pdfBusy}
              className={`${actionBtn} hover:bg-[#ecf6ff] disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{ borderColor: '#e3e3e3', color: '#0782DA' }}
              type="button"
            >
              <Download size={16} strokeWidth={1.5} />
              {pdfBusy ? 'Generating…' : 'PDF'}
            </button>
          ) : null}
        </div>

      </div>

      <input
        ref={importInputRef}
        type="file"
        className="hidden"
        onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }}
      />
    </header>
  );
};

export default Header;
