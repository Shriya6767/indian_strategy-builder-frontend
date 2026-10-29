/**
 * The app's own "are you sure?", in place of window.confirm.
 *
 * window.confirm draws the BROWSER's dialog: titled with the site address, it
 * cannot carry our wording, and some setups suppress it entirely -- which would
 * delete with no confirmation at all. Esc and the backdrop cancel; the confirm
 * button never takes focus, so a stray Enter cannot delete anything.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={() => { if (!busy) onCancel?.(); }}
      role="presentation"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[25rem]"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <h2 className="text-[17px] font-semibold leading-snug" style={{ color: '#2a2a2a' }}>
            {title}
          </h2>
          <button
            onClick={() => { if (!busy) onCancel?.(); }}
            className="p-1 -mt-1 -mr-1 rounded hover:bg-gray-100 transition-colors shrink-0"
            style={{ color: '#6B7280' }}
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {message && (
          <p className="px-6 pt-3 text-[13px] leading-relaxed" style={{ color: '#6B7280' }}>
            {message}
          </p>
        )}

        <div className="flex items-center gap-3 px-6 py-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 text-[14px] font-medium rounded-md transition-colors hover:bg-gray-100 disabled:opacity-60"
            style={{ color: '#3a3a3a' }}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-2.5 text-[14px] font-medium text-white rounded-md transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#C81E1E' }}
            onMouseEnter={(e) => { if (!busy) e.currentTarget.style.backgroundColor = '#A91717'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#C81E1E'; }}
            // A press state as well as a hover: on a destructive button the
            // click should be felt, not just hovered.
            onMouseDown={(e) => { if (!busy) e.currentTarget.style.backgroundColor = '#8E1212'; }}
            onMouseUp={(e) => { if (!busy) e.currentTarget.style.backgroundColor = '#A91717'; }}
            type="button"
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
