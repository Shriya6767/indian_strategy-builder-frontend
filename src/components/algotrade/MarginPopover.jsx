import { useEffect, useRef } from 'react';
import { INK, MUTED, BORDER, HEAD_BG } from './palette';

/**
 * src/components/algotrade/MarginPopover.jsx
 *
 * What "View" opens beside Available Margin: a per-broker margin table. With no
 * broker connected there is nothing to check, so it says so rather than showing
 * an empty grid.
 */
const MarginPopover = ({ onClose }) => {
  const boxRef = useRef(null);

  // Click-away closes it; the listener lives only while it is open.
  useEffect(() => {
    const away = (event) => { if (!boxRef.current?.contains(event.target)) onClose(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  return (
    <div
      ref={boxRef}
      className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 w-[288px] rounded-md border bg-white shadow-lg overflow-hidden"
      style={{ borderColor: BORDER }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 text-[13px] font-semibold"
        style={{ backgroundColor: HEAD_BG, color: INK }}
      >
        <span>Broker</span>
        <span>Available Margin</span>
      </div>
      <p className="px-4 py-3.5 text-[13px]" style={{ color: MUTED }}>
        No brokers support margin check
      </p>
    </div>
  );
};

export default MarginPopover;
