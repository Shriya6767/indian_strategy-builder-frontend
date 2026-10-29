import { useEffect } from 'react';
import { X } from 'lucide-react';
import { INK, MUTED } from './palette';

/**
 * src/components/algotrade/SetupBrokerDialog.jsx
 *
 * What a strategy's Activate button raises while no broker is connected. The
 * red Setup button is the reference's own — it is the one place in this screen
 * that is not the product's blue, because it is blocking an action rather than
 * offering one.
 */

// Sampled off the reference's own button.
const RED = '#B12020';
const RED_HOVER = '#8F1A1A';

const SetupBrokerDialog = ({ onSetup, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-full max-w-[407px] rounded-lg bg-white shadow-2xl"
           role="dialog" aria-modal="true" aria-label="Setup a broker">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-[16px] font-semibold" style={{ color: INK }}>Setup a broker</h3>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={20} />
          </button>
        </div>
        <p className="px-6 text-[13px] leading-relaxed" style={{ color: INK }}>
          You need to setup atleast 1 broker to be able to activate a strategy.
          Please setup a broker.
        </p>
        <div className="px-6 pt-4 pb-5">
          <button type="button" onClick={onSetup}
                  className="w-full h-[38px] rounded text-[13px] font-medium text-white transition-colors"
                  style={{ backgroundColor: RED }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = RED_HOVER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = RED; }}>
            Setup
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupBrokerDialog;
