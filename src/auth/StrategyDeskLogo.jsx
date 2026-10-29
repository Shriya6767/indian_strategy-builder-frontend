import { authTheme } from './authTheme';

/**
 * src/auth/StrategyDeskLogo.jsx
 *
 * The StrategyDesk mark + wordmark, inlined from strategydesk_logo_v3.svg so it
 * can take the page's colors rather than shipping a fixed-color asset.
 *
 * Props:
 * - height:  rendered height in px (the viewBox keeps the proportions)
 * - onDark:  true on the gradient sign-in page — the navy square and the
 *            wordmark would disappear against it, so both go white and the
 *            bars keep the accent blues.
 */
const StrategyDeskLogo = ({ height = 34, onDark = false }) => {
  const squareFill = onDark ? '#FFFFFF' : authTheme.navy;
  const wordFill = onDark ? '#FFFFFF' : authTheme.navy;
  const barLow = onDark ? '#0B619B' : '#0B619B';
  const barMid = onDark ? '#0782DA' : '#0782DA';
  const barHigh = onDark ? '#7FC4F2' : '#7FC4F2';
  const arrow = onDark ? '#0782DA' : '#0782DA';

  return (
    <svg
      height={height}
      viewBox="30 50 520 140"
      role="img"
      aria-label="StrategyDesk"
      style={{ display: 'block' }}
    >
      <defs>
        <marker
          id="sd-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M2 1L8 5L2 9"
            fill="none"
            stroke="context-stroke"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      <rect x="40" y="60" width="120" height="120" rx="24" fill={squareFill} />
      <rect x="66" y="130" width="16" height="40" rx="3" fill={barLow} />
      <rect x="92" y="105" width="16" height="65" rx="3" fill={barMid} />
      <rect x="118" y="80" width="16" height="90" rx="3" fill={barHigh} />
      <path
        d="M66 128 L92 103 L118 78 L134 62"
        fill="none"
        stroke={arrow}
        strokeWidth="3"
        strokeLinecap="round"
        markerEnd="url(#sd-arrow)"
      />

      <text
        x="192"
        y="135"
        fill={wordFill}
        style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: '44px',
          fontWeight: 700,
        }}
      >
        Strategy
        <tspan fill={onDark ? '#7FC4F2' : authTheme.accent}>Desk</tspan>
      </text>
    </svg>
  );
};

export default StrategyDeskLogo;
