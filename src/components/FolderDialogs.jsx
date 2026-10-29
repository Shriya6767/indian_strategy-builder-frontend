import { useEffect, useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';


const BLUE = '#0B619B';
const INK = '#1F2937';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

/** Escape closes; the backdrop does not, so a mis-click cannot lose typing. */
const Frame = ({ title, onClose, children, footer, width = 430 }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full bg-white rounded-lg shadow-2xl flex flex-col max-h-[86vh]"
           style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: BORDER }}>
          <h2 className="text-[16px] font-semibold" style={{ color: INK }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: MUTED }}>
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t" style={{ borderColor: BORDER }}>
          {footer}
        </div>
      </div>
    </div>
  );
};

const Cancel = ({ onClick }) => (
  <button type="button" onClick={onClick}
          className="px-4 py-2 text-[14px] font-medium rounded-md transition-colors hover:bg-gray-100"
          style={{ color: '#3a3a3a' }}>
    Cancel
  </button>
);

const Primary = ({ onClick, children, disabled = false }) => (
  <button type="button" onClick={onClick} disabled={disabled}
          className="px-5 py-2 text-[14px] font-medium text-white rounded-md transition-opacity disabled:opacity-60"
          style={{ backgroundColor: BLUE }}>
    {children}
  </button>
);

const Field = ({ label, value, onChange, placeholder, error, autoFocus = false }) => (
  <label className="block">
    <span className="block text-[13px] text-center mb-1.5" style={{ color: MUTED }}>{label}</span>
    <input
      type="text"
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-[38px] px-3 text-[14px] rounded-md border outline-none focus:border-[#0B619B]"
      style={{ borderColor: error ? '#C81E1E' : BORDER, color: INK }}
    />
    {/* The duplicate-name rule shows HERE, under the field, rather than as a
        toast: it is about the thing being typed, and it has to stay on screen
        while it is corrected. */}
    {error ? <span className="block mt-1 text-[12px]" style={{ color: '#C81E1E' }}>{error}</span> : null}
  </label>
);

const StrategyPicker = ({ names, picked, onPicked }) => {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  }, [names, query]);

  const allShownPicked = shown.length > 0 && shown.every((n) => picked.has(n));

  const toggle = (name) => {
    const next = new Set(picked);
    if (next.has(name)) next.delete(name); else next.add(name);
    onPicked(next);
  };

  const toggleAll = () => {
    const next = new Set(picked);
    if (allShownPicked) shown.forEach((n) => next.delete(n));
    else shown.forEach((n) => next.add(n));
    onPicked(next);
  };

  return (
    <>
      <p className="text-[13px] text-center mb-1.5" style={{ color: MUTED }}>Add strategies</p>
      <div className="relative mb-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
        <input
          type="text"
          value={query}
          placeholder="Search"
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-[38px] pl-9 pr-3 text-[14px] rounded-md border outline-none focus:border-[#0B619B]"
          style={{ borderColor: BORDER, color: INK }}
        />
      </div>

      <div className="border rounded-md min-h-[180px] max-h-[240px] overflow-y-auto"
           style={{ borderColor: BORDER }}>
        {names.length === 0 ? (
          <p className="px-3 py-6 text-[13px] text-center" style={{ color: MUTED }}>
            No strategies available
          </p>
        ) : (
          <>
            <Row label="Select All" checked={allShownPicked} onToggle={toggleAll} disabled={shown.length === 0} />
            {shown.map((n) => (
              <Row key={n} label={n} checked={picked.has(n)} onToggle={() => toggle(n)} />
            ))}
            {shown.length === 0 ? (
              <p className="px-3 py-4 text-[13px]" style={{ color: MUTED }}>No match</p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
};

const Row = ({ label, checked, onToggle, disabled = false }) => (
  <button type="button" onClick={onToggle} disabled={disabled}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#F5F5F5] disabled:opacity-50">
    <span className="w-[16px] h-[16px] rounded-[3px] border inline-flex items-center justify-center shrink-0"
          style={{ borderColor: checked ? BLUE : '#C9CBCF', backgroundColor: checked ? BLUE : '#FFFFFF' }}>
      {checked ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6.2 4.6 8.8 10 3.4" stroke="#FFFFFF" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
    <span className="text-[14px] truncate" style={{ color: INK }}>{label}</span>
  </button>
);

/* ── Create ─────────────────────────────────────────────────────────── */

export const CreateFolderDialog = ({ names, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [error, setError] = useState(null);

  return (
    <Frame title="Create New Folder" onClose={onClose}
           footer={<><Cancel onClick={onClose} />
             <Primary onClick={() => onCreate(name, [...picked], setError)}>Create Folder</Primary></>}>
      <div className="mb-4">
        <Field label="Folder Name" value={name} placeholder="Name" autoFocus
               error={error} onChange={(v) => { setName(v); setError(null); }} />
      </div>
      <StrategyPicker names={names} picked={picked} onPicked={setPicked} />
    </Frame>
  );
};

/* ── Add strategies to an existing folder ───────────────────────────── */

export const AddToFolderDialog = ({ folderName, names, onClose, onUpdate }) => {
  const [picked, setPicked] = useState(() => new Set());

  return (
    <Frame title={`Add strategies to ${folderName}`} onClose={onClose}
           footer={<><Cancel onClick={onClose} />
             <Primary onClick={() => onUpdate([...picked])} disabled={picked.size === 0}>Update</Primary></>}>
      <StrategyPicker names={names} picked={picked} onPicked={setPicked} />
    </Frame>
  );
};

/* ── Rename ─────────────────────────────────────────────────────────── */

export const RenameFolderDialog = ({ current, onClose, onRename }) => {
  const [name, setName] = useState(current || '');
  const [error, setError] = useState(null);

  return (
    <Frame title="Rename Folder" width={400} onClose={onClose}
           footer={<><Cancel onClick={onClose} />
             <Primary onClick={() => onRename(name, setError)}>Update</Primary></>}>
      <Field label="Folder Name" value={name} autoFocus error={error}
             onChange={(v) => { setName(v); setError(null); }} />
    </Frame>
  );
};

/* ── Save a new strategy, optionally straight into a folder ─────────── */

export const SaveIntoFolderDialog = ({ folders, initialName = '', onClose, onDone }) => {
  const [name, setName] = useState(initialName);
  const [folderId, setFolderId] = useState('');
  const [error, setError] = useState(null);

  return (
    <Frame title="Save New Strategy" width={400} onClose={onClose}
           footer={<><Cancel onClick={onClose} />
             <Primary onClick={() => onDone(name, folderId || null, setError)}>Done</Primary></>}>
      <div className="mb-4">
        <label className="block">
          <span className="block text-[13px] mb-1.5" style={{ color: INK }}>Strategy Name:</span>
          <input
            type="text"
            value={name}
            autoFocus
            placeholder="Enter Strategy Name"
            onChange={(e) => { setName(e.target.value); setError(null); }}
            className="w-full h-[38px] px-3 text-[14px] rounded-md border outline-none focus:border-[#0B619B]"
            style={{ borderColor: error ? '#C81E1E' : BORDER, color: INK }}
          />
          {error ? <span className="block mt-1 text-[12px]" style={{ color: '#C81E1E' }}>{error}</span> : null}
        </label>
      </div>

      <label className="block">
        <span className="block text-[13px] mb-1.5" style={{ color: INK }}>Select Folder</span>
        {/* Optional on purpose: leaving it on "Select" saves the strategy
            loose, which is what happens today and must stay possible. */}
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="w-full h-[38px] px-3 text-[14px] rounded-md border bg-white outline-none focus:border-[#0B619B]"
          style={{ borderColor: BORDER, color: INK }}
        >
          <option value="">Select</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
    </Frame>
  );
};
