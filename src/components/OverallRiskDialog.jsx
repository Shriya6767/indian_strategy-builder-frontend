import { useEffect, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { colors } from '../theme/colors';

const OVERALL_RISK_DEFAULT = { type: 'mtm', mtmValue: '', percentValue: '' };

const OverallRiskDialog = ({ title, value, onApply, onClose }) => {
  // Seeded from `value` so reopening shows what was applied last. Edits live
  // here until Apply, so closing with Escape or the X discards them.
  const [draft, setDraft] = useState(() => ({ ...OVERALL_RISK_DEFAULT, ...(value || {}) }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const isMtm = draft.type === 'mtm';

  // Digits and at most one decimal point. Typing is not blocked beyond that --
  // a half-entered "12." has to survive, so the value is kept as a string and
  // only read as a number when it is used.
  const onNumber = (key) => (e) => {
    const v = e.target.value;
    if (v === '' || /^\d*\.?\d*$/.test(v)) set({ [key]: v });
  };

  const field = 'w-full bg-white border rounded-md px-3 h-9 text-[13px] outline-none '
    + 'focus:ring-2 focus:ring-blue-200 transition-colors disabled:bg-gray-50 '
    + 'disabled:text-gray-400 disabled:cursor-not-allowed';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[min(560px,94vw)] rounded-lg bg-white shadow-2xl"
           role="dialog" aria-modal="true" aria-label={title}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b"
             style={{ borderColor: '#e3e3e3' }}>
          <h3 className="text-[15px] font-semibold" style={{ color: '#2a2a2a' }}>{title}</h3>
          <button type="button" onClick={onClose} title="Close"
                  className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="w-[9rem]">
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#3a3a3a' }}>
                Type
              </label>
              <div className="relative">
                <select
                  value={draft.type}
                  onChange={(e) => set({ type: e.target.value })}
                  className={`${field} appearance-none pr-8 cursor-pointer`}
                  style={{ borderColor: '#e3e3e3', color: '#3a3a3a' }}
                >
                  <option value="mtm">MTM</option>
                  <option value="percent">Percent</option>
                </select>
                <ChevronDown size={15}
                             className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            <div className="w-[11rem]">
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#3a3a3a' }}>
                MTM value
              </label>
              {/* NEVER disabled. Type = MTM obviously needs it, and Type =
                  Percent needs it too -- the percentage is taken against this
                  amount, so both boxes stay editable there. Only the percent
                  box below greys out, and only when Type is MTM. */}
              <input
                type="text"
                inputMode="decimal"
                value={draft.mtmValue}
                onChange={onNumber('mtmValue')}
                placeholder="0"
                className={field}
                style={{ borderColor: '#e3e3e3', color: '#3a3a3a' }}
              />
            </div>

            <div className="w-[9.5rem]">
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#3a3a3a' }}>
                Percent value
              </label>
              {/* The % sits inside the box, after the number, so the field keeps
                  the same height and baseline as the two beside it. */}
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.percentValue}
                  onChange={onNumber('percentValue')}
                  disabled={isMtm}
                  placeholder="0"
                  className={`${field} pr-7`}
                  style={{ borderColor: '#e3e3e3', color: '#3a3a3a' }}
                />
                <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] ${isMtm ? 'text-gray-300' : 'text-gray-500'}`}>
                  %
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-5 py-4 border-t" style={{ borderColor: '#e3e3e3' }}>
          {/* Same fill and hover as the builder's "Add Leg" — navy at rest,
              the lighter navy under the cursor, border carrying the colour
              with it so the two stay one shape. */}
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="h-[38px] px-6 rounded-md text-[13px] font-medium text-white border transition-colors duration-75"
            style={{
              backgroundColor: colors.legBuilder.addLegBg,
              borderColor: colors.legBuilder.addLegBg,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg;
              e.currentTarget.style.borderColor = colors.legBuilder.addLegHoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg;
              e.currentTarget.style.borderColor = colors.legBuilder.addLegBg;
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverallRiskDialog;
