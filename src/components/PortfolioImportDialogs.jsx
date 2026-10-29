import { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

/**
 * The three screens an import walks through once the file is read: rename the
 * portfolio, rename clashing strategies, done.
 *
 * Each rename refuses to move on while a name clashes and says so under the
 * offending field, not as a toast. A clash with ANOTHER field in the same
 * dialog is caught too -- two strategies renamed alike would collide on save.
 */

const shell = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4';
const card = 'bg-white rounded-lg shadow-xl w-full max-w-[24rem]';
const NAVY = '#0C4A6E';
const NAVY_HOVER = '#0A3D5C';

const Header = ({ title, onClose }) => (
  <div className="flex items-start justify-between gap-4 px-6 pt-5">
    <h2 className="text-[17px] font-semibold leading-snug" style={{ color: '#2a2a2a' }}>{title}</h2>
    <button
      onClick={onClose}
      className="p-1 -mt-1 -mr-1 rounded hover:bg-gray-100 transition-colors shrink-0"
      style={{ color: '#6B7280' }}
      aria-label="Close"
      type="button"
    >
      <X size={18} />
    </button>
  </div>
);

const Footer = ({ onCancel, onConfirm, busy, confirmLabel = 'Import' }) => (
  <div className="flex items-center gap-3 px-6 py-5">
    <button
      onClick={onCancel}
      disabled={busy}
      className="flex-1 py-2.5 text-[14px] font-medium rounded-md transition-colors hover:bg-gray-100 disabled:opacity-60"
      style={{ color: '#3a3a3a' }}
      type="button"
    >
      Cancel
    </button>
    <button
      onClick={onConfirm}
      disabled={busy}
      className="flex-1 py-2.5 text-[14px] font-medium text-white rounded-md transition-colors disabled:opacity-60"
      style={{ backgroundColor: NAVY }}
      onMouseEnter={(e) => { if (!busy) e.currentTarget.style.backgroundColor = NAVY_HOVER; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = NAVY; }}
      type="button"
    >
      {busy ? 'Importing…' : confirmLabel}
    </button>
  </div>
);

const field = (hasError) => ({
  borderColor: hasError ? '#DC2626' : '#e3e3e3',
  color: '#2a2a2a',
});

/** "You already have a portfolio with the same name." */
export const RenamePortfolioDialog = ({ isOpen, initialName, isTaken, onCancel, onConfirm, busy }) => {
  const [name, setName] = useState(initialName || '');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter a name.'); return; }
    if (isTaken(trimmed)) { setError('This name already exists. Please give a different name.'); return; }
    onConfirm(trimmed);
  };

  return (
    <div className={shell}>
      <div className={card}>
        <Header title="Rename Portfolio" onClose={onCancel} />
        <div className="px-6 pt-3">
          <p className="text-[13px] leading-relaxed" style={{ color: '#6B7280' }}>
            You already have a portfolio with the same name.
            <br />
            Please enter a new name for this portfolio to proceed.
          </p>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            autoFocus
            className="w-full mt-4 h-10 px-3 border rounded-md text-[14px] outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={field(!!error)}
          />
          {error && <p className="mt-1.5 text-[12px]" style={{ color: '#DC2626' }}>{error}</p>}
        </div>
        <Footer onCancel={onCancel} onConfirm={submit} busy={busy} />
      </div>
    </div>
  );
};

/** "Please rename the following strategies" — one field per clashing name. */
export const RenameStrategiesDialog = ({ isOpen, names, isTaken, onCancel, onConfirm, busy }) => {
  const [values, setValues] = useState(names || []);
  const [errors, setErrors] = useState({});

  if (!isOpen) return null;

  const setAt = (index, value) => {
    setValues((prev) => prev.map((v, i) => (i === index ? value : v)));
    setErrors((prev) => (prev[index] ? { ...prev, [index]: '' } : prev));
  };

  const submit = () => {
    const next = {};
    const seen = new Map();
    values.forEach((raw, index) => {
      const trimmed = raw.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed) {
        next[index] = 'Please enter a name.';
      } else if (isTaken(trimmed)) {
        next[index] = 'This name already exists. Please give a different name.';
      } else if (seen.has(key)) {
        next[index] = 'This name is used twice here. Please give a different name.';
      }
      seen.set(key, index);
    });

    if (Object.values(next).some(Boolean)) { setErrors(next); return; }
    onConfirm(values.map((v) => v.trim()));
  };

  return (
    <div className={shell}>
      <div className={card}>
        <Header title="Strategy Name Conflict Detected" onClose={onCancel} />
        <div className="px-6 pt-3">
          <p className="text-[13px]" style={{ color: '#3a3a3a' }}>Please rename the following strategies</p>
          <div className="mt-3 flex flex-col gap-3">
            {values.map((value, index) => (
              <div key={index}>
                <input
                  value={value}
                  onChange={(e) => setAt(index, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  autoFocus={index === 0}
                  className="w-full h-10 px-3 border rounded-md text-[14px] outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  style={field(!!errors[index])}
                />
                {errors[index] && (
                  <p className="mt-1.5 text-[12px]" style={{ color: '#DC2626' }}>{errors[index]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
        <Footer onCancel={onCancel} onConfirm={submit} busy={busy} />
      </div>
    </div>
  );
};

/** The green tick, and the way straight into what was just imported. */
export const ImportDoneDialog = ({ isOpen, portfolioName, onGo }) => {
  if (!isOpen) return null;

  return (
    <div className={shell}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[20rem] px-6 py-10 text-center">
        <CheckCircle2 size={40} strokeWidth={1.75} className="mx-auto" style={{ color: '#16A34A' }} />
        <p className="mt-5 text-[17px] font-semibold" style={{ color: '#2a2a2a' }}>Portfolio Imported</p>
        <button
          onClick={onGo}
          className="mt-5 px-5 h-10 text-[14px] font-medium rounded-md border bg-white transition-colors"
          style={{ borderColor: '#d0d5dd', color: '#3a3a3a' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F6FA'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
          type="button"
        >
          Go to {portfolioName}
        </button>
      </div>
    </div>
  );
};
