import { useRef, useState } from 'react';
import { X, FileText, AlertTriangle } from 'lucide-react';

/**
 * "Import Strategy" — the drag-and-drop dialog.
 *
 * Belongs to the STRATEGY screen, not the Portfolio one: an import is an
 * unsaved draft with no id, and a portfolio cannot reference that. Three
 * states: empty, picked, failed. The dialog only picks and checks the file;
 * what happens on Import is the caller's, keeping parsing in one place.
 */

const MAX_MB = 20;

const ImportStrategyModal = ({ isOpen, onClose, onImport, title = 'Import Strategy' }) => {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  if (!isOpen) return null;

  const close = () => {
    if (busy) return;             // never yank the dialog out from under a run
    setFile(null);
    setError('');
    setDragging(false);
    onClose?.();
  };

  const accept = (picked) => {
    if (!picked) return;
    // Deliberately no extension check, and no `accept` on the input below: a
    // filter greys out every file that was saved under another name, and the
    // extension proves nothing anyway. What the file CONTAINS is checked on
    // Import — version, strategy, legs — which is the test that matters.
    if (picked.size > MAX_MB * 1024 * 1024) {
      setFile(null);
      setError(`That file is larger than ${MAX_MB}MB.`);
      return;
    }
    setError('');
    setFile(picked);
  };

  const handleImport = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      // The caller returns a message on failure and nothing on success, where
      // it closes this dialog itself.
      const failure = await onImport?.(file);
      if (failure) {
        setError(failure);
      } else {
        // Imported. The caller closes the dialog, so clear what was picked —
        // otherwise the next Import opened onto the previous file instead of
        // the drop zone.
        setFile(null);
        setError('');
        setDragging(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[26rem]">
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#e3e3e3' }}>
          <h2 className="text-[17px] font-semibold" style={{ color: '#2a2a2a' }}>{title}</h2>
          <button
            onClick={close}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            style={{ color: '#6B7280' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              accept(e.dataTransfer.files?.[0]);
            }}
            className="rounded-lg border border-dashed flex flex-col items-center justify-center text-center px-6"
            style={{
              minHeight: '210px',
              borderColor: dragging ? '#0C4A6E' : '#d8d8d8',
              backgroundColor: dragging ? '#F1F6FA' : '#FAFAFA',
            }}
          >
            {file ? (
              <div className="relative w-full flex flex-col items-center gap-3">
                <button
                  onClick={() => { setFile(null); setError(''); }}
                  className="absolute -top-2 right-0 p-1 rounded hover:bg-gray-200 transition-colors"
                  style={{ color: '#6B7280' }}
                  aria-label="Remove file"
                >
                  <X size={16} />
                </button>
                <FileText size={34} strokeWidth={1.5} style={{ color: '#0C4A6E' }} />
                <p className="text-[15px] break-all" style={{ color: '#2a2a2a' }}>{file.name}</p>
              </div>
            ) : (
              <>
                <p className="text-[19px] font-medium" style={{ color: '#3a3a3a' }}>Drag and Drop</p>
                <p className="text-[12px] mt-2" style={{ color: '#6B7280' }}>
                  File less than {MAX_MB}MB (recommended)
                </p>
                <p className="text-[12px] my-3" style={{ color: '#9CA3AF' }}>or</p>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="px-4 py-2 rounded-md text-[13px] font-medium text-white transition-colors hover:bg-[#093a57]"
                  style={{ backgroundColor: '#0C4A6E' }}
                >
                  Browse files
                </button>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
          />

          {error && (
            <div
              className="mt-4 rounded-md border px-3 py-2.5 flex items-start gap-2"
              style={{ borderColor: '#F3C2C2', backgroundColor: '#FEF2F2' }}
            >
              <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
              <div>
                <p className="text-[13px] font-semibold" style={{ color: '#B91C1C' }}>Some error occurred</p>
                <p className="text-[12px] mt-0.5" style={{ color: '#B91C1C' }}>{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-5">
          <button
            onClick={close}
            disabled={busy}
            className="flex-1 py-2.5 text-[14px] font-medium rounded-md transition-colors hover:bg-gray-100 disabled:opacity-60"
            style={{ color: '#3a3a3a' }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file || busy}
            className="flex-1 py-2.5 text-[14px] font-medium text-white rounded-md transition-colors hover:bg-[#093a57] disabled:cursor-not-allowed"
            style={{ backgroundColor: !file || busy ? '#9CA3AF' : '#0C4A6E' }}
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportStrategyModal;
