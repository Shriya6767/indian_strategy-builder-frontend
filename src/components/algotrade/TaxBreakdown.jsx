import { useEffect, useRef } from 'react';
import { INK, MUTED, BORDER } from './palette';

/**
 * src/components/algotrade/TaxBreakdown.jsx
 *
 * What the chevron under "Taxes & charges" opens: the statutory charges that
 * make up the figure, itemised, with the total beneath a rule.
 *
 * The rows are the charge heads themselves, not data — every figure reads zero
 * until there are trades to charge against.
 */

const CHARGES = [
  'Clearing Charges',
  'IPFT',
  'STT',
  'Stamp Duty',
  'SEBI Charges',
  'Exchange Charges',
  'GST (18%)',
];

const TaxBreakdown = ({ onClose }) => {
  const boxRef = useRef(null);

  useEffect(() => {
    const away = (event) => { if (!boxRef.current?.contains(event.target)) onClose(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  return (
    <div
      ref={boxRef}
      className="absolute right-0 top-full mt-2 z-40 w-[244px] rounded-md border bg-white shadow-lg"
      style={{ borderColor: BORDER }}
    >
      <p className="px-4 pt-3.5 pb-2 text-[14px] font-semibold" style={{ color: INK }}>Breakdown</p>

      <div className="px-4 pb-2">
        {CHARGES.map((charge) => (
          <div key={charge} className="flex items-center justify-between py-[7px] text-[13px]">
            <span style={{ color: MUTED }}>{charge}</span>
            <span style={{ color: MUTED }}>₹ 0</span>
          </div>
        ))}
      </div>

      <div className="h-px mx-4" style={{ backgroundColor: BORDER }} />
      <div className="flex items-center justify-between px-4 py-3 text-[13px]">
        <span style={{ color: INK }}>Total</span>
        <span className="text-[15px]" style={{ color: INK }}>₹ 0</span>
      </div>
    </div>
  );
};

export default TaxBreakdown;
