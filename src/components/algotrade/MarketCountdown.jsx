import { useEffect, useState } from 'react';
import { INK, PENDING_BG } from './palette';
import { isMarketOpen, secondsTillOpen, formatCountdown } from './marketClock';

/**
 * src/components/algotrade/MarketCountdown.jsx
 *
 * "43m 6s till market opens" — shown only while the market is shut. One
 * interval, cleared on unmount, and it stops ticking the moment the market
 * opens rather than counting toward a time that has passed.
 */
const MarketCountdown = () => {
  const [left, setLeft] = useState(() => (isMarketOpen() ? null : secondsTillOpen()));

  useEffect(() => {
    const id = setInterval(() => {
      setLeft(isMarketOpen() ? null : secondsTillOpen());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (left === null) return null;

  return (
    <div className="flex justify-center my-5">
      <span
        className="inline-flex items-center px-5 py-2.5 rounded text-[14px] font-semibold"
        style={{ backgroundColor: PENDING_BG, color: INK }}
      >
        {formatCountdown(left)} till market opens
      </span>
    </div>
  );
};

export default MarketCountdown;
