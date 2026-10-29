import { useMemo, useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import { colors } from '../theme/colors';

/**
 * Strategy-vs-strategy correlation heat map for a portfolio backtest.
 *
 * Correlation is computed here from the backtest response rather than requested
 * from the backend: `data.strategies[].trade_results[].legs[].pnl` already
 * carries everything needed. Each strategy is reduced to a date -> daily P&L
 * series, then every pair is scored with Pearson's r over the dates the two
 * have in common.
 *
 * NO_TRADES (-999) is reported, matching the note above the grid, when a
 * strategy traded on no days, when a pair overlaps on fewer than two days, or
 * when either series is flat (zero variance leaves r undefined).
 */

const NO_TRADES = -999;

const dailyPnlByDate = (strategy) => {
  const byDate = new Map();
  (strategy.trade_results || []).forEach((trade) => {
    const date = trade.trade_date || trade.entry_datetime?.split('T')[0];
    if (!date) return;
    let pnl = 0;
    (trade.legs || []).forEach((leg) => {
      if (leg.pnl !== undefined && leg.pnl !== null && leg.status !== 'NO_CHAIN_DATA') {
        pnl += parseFloat(leg.pnl) || 0;
      }
    });
    byDate.set(date, (byDate.get(date) || 0) + pnl);
  });
  return byDate;
};

const pearson = (a, b) => {
  if (a.size === 0 || b.size === 0) return NO_TRADES;

  const dates = [...a.keys()].filter((d) => b.has(d));
  if (dates.length < 2) return NO_TRADES;

  const xs = dates.map((d) => a.get(d));
  const ys = dates.map((d) => b.get(d));
  const mean = (v) => v.reduce((s, n) => s + n, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const p = xs[i] - mx;
    const q = ys[i] - my;
    num += p * q;
    dx += p * p;
    dy += q * q;
  }
  // A flat series has no variance, so r is undefined rather than 0.
  if (dx === 0 || dy === 0) return NO_TRADES;

  return num / Math.sqrt(dx * dy);
};

// Diverging scale: dark blue at +1, near-white at 0, dark red at -1.
const POSITIVE = [31, 78, 121];
const NEGATIVE = [165, 53, 42];
const MIDPOINT = [247, 247, 247];

const cellColor = (r) => {
  if (r === NO_TRADES) return '#EFEFEF';
  const end = r >= 0 ? POSITIVE : NEGATIVE;
  const t = Math.min(Math.abs(r), 1);
  const mix = MIDPOINT.map((m, i) => Math.round(m + (end[i] - m) * t));
  return `rgb(${mix.join(',')})`;
};

// White text once the fill is dark enough to swallow dark text.
const cellTextColor = (r) => (r !== NO_TRADES && Math.abs(r) > 0.45 ? '#FFFFFF' : '#3A3A3A');

const formatR = (r) => (r === NO_TRADES ? '-999' : Number(r.toFixed(2)).toString());

const LEGEND_TICKS = [1, 0.8, 0.6, 0.4, 0.2, 0, -0.2, -0.4, -0.6, -0.8, -1];

const CorrelationMatrix = ({ strategies = [], checkedNames = null }) => {
  // Collapsed until "Load" is pressed: the Pearson pass is O(n²) over the whole
  // trade history, so it is deferred rather than run on every result render.
  const [loaded, setLoaded] = useState(false);
  const [onlyChecked, setOnlyChecked] = useState(false);
  const [hover, setHover] = useState(null); // { row, col, r, x, y }

  const visible = useMemo(() => {
    if (!onlyChecked || !checkedNames) return strategies;
    return strategies.filter((s) => checkedNames.has(s.strategy_name));
  }, [strategies, onlyChecked, checkedNames]);

  // Recomputed only when the visible set changes — the Pearson pass is O(n²)
  // over the trade history and shouldn't rerun on hover.
  const { names, matrix } = useMemo(() => {
    if (!loaded) return { names: [], matrix: [] };
    const series = visible.map((s) => ({
      name: s.strategy_name || 'Unnamed',
      byDate: dailyPnlByDate(s),
    }));
    return {
      names: series.map((s) => s.name),
      matrix: series.map((a) => series.map((b) => pearson(a.byDate, b.byDate))),
    };
  }, [visible, loaded]);

  if (strategies.length === 0) return null;

  const CELL = 98;
  const ROW_LABEL_W = 76;

  return (
    <div
      className="bg-white rounded-lg border px-8 py-8 mt-8 mb-6"
      style={{ borderColor: colors.settingsPanel.cardBorder, boxShadow: colors.settingsPanel.cardShadow }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[20px] font-normal" style={{ color: colors.settingsPanel.heading }}>
            Correlation Matrix
          </h3>
          <p className="text-[13px] mt-1" style={{ color: '#9CA3AF' }}>
            Identify strategy correlations to optimize diversification and manage portfolio risk.
          </p>
        </div>
        {/* Load while collapsed, Hide once open — top-right, as on the
            reference layout. Hide returns it to the Load state. */}
        <button
          type="button"
          onClick={() => setLoaded((v) => !v)}
          className="px-6 py-2.5 rounded-md border text-[13px] font-medium transition-colors shrink-0"
          style={{ borderColor: colors.saveButton.enabled, color: colors.saveButton.enabled }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F2F8FD'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {loaded ? 'Hide' : 'Load'}
        </button>
      </div>

      {loaded && (
        <>
          {checkedNames && (
            <div className="flex items-center gap-3 mt-5">
              <span className="text-[13px]" style={{ color: colors.settingsPanel.label }}>Show only checked</span>
              <ToggleSwitch
                id="correlation-only-checked"
                size="sm"
                checked={onlyChecked}
                onChange={(e) => setOnlyChecked(e.target.checked)}
              />
            </div>
          )}

          <p className="text-[13px] font-semibold mt-4" style={{ color: '#e0473c' }}>
            * -999 in the Correlation Matrix means one of the strategies didn&apos;t have any trades *
          </p>

          {names.length === 0 ? (
            <p className="text-[13px] mt-6" style={{ color: '#9CA3AF' }}>
              No strategies to correlate.
            </p>
          ) : (
            <div className="flex items-start gap-8 mt-6">
              <div className="overflow-x-auto flex-1">
                <p className="text-[13px] font-medium mb-3" style={{ color: colors.settingsPanel.label }}>
                  Correlation
                </p>

                <div className="relative inline-block">
                  {/* Lower triangle only: the upper half repeats the same pairs. */}
                  {names.map((rowName, i) => (
                    <div key={rowName + i} className="flex items-stretch">
                      <div
                        className="flex items-center justify-end pr-3 text-[12px] shrink-0"
                        style={{ width: ROW_LABEL_W, height: CELL, color: colors.settingsPanel.label }}
                        title={rowName}
                      >
                        <span className="truncate">{rowName}</span>
                      </div>

                      {names.map((colName, j) => {
                        if (j > i) return <div key={colName + j} style={{ width: CELL, height: CELL }} />;
                        const r = matrix[i][j];
                        return (
                          <div
                            key={colName + j}
                            onMouseEnter={() => setHover({ row: rowName, col: colName, r })}
                            onMouseLeave={() => setHover(null)}
                            className="flex items-center justify-center text-[12px] font-semibold border border-white cursor-default"
                            style={{
                              width: CELL,
                              height: CELL,
                              backgroundColor: cellColor(r),
                              color: cellTextColor(r),
                            }}
                          >
                            {formatR(r)}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Column labels, angled so long names don't collide. */}
                  <div className="flex" style={{ paddingLeft: ROW_LABEL_W }}>
                    {names.map((name, j) => (
                      <div key={name + j} style={{ width: CELL }} className="flex justify-center">
                        <span
                          className="text-[12px] whitespace-nowrap origin-top-left"
                          style={{ color: colors.settingsPanel.label, transform: 'rotate(45deg) translateX(4px)' }}
                          title={name}
                        >
                          {name}
                        </span>
                      </div>
                    ))}
                  </div>

                  {hover && (
                    <div
                      className="absolute top-2 left-2 px-3 py-1.5 rounded-md bg-white shadow-lg border text-[12px] pointer-events-none z-10"
                      style={{ borderColor: colors.settingsPanel.cardBorder }}
                    >
                      <span style={{ color: '#9CA3AF' }}>{hover.row} · {hover.col}</span>
                      <span className="ml-2 font-semibold" style={{ color: colors.settingsPanel.inputValue }}>
                        {formatR(hover.r)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scale legend */}
              <div className="flex items-stretch gap-2 shrink-0 pt-9">
                <div
                  className="w-6 rounded"
                  style={{
                    height: LEGEND_TICKS.length * 29,
                    background: `linear-gradient(to bottom, ${cellColor(1)}, ${cellColor(0)}, ${cellColor(-1)})`,
                  }}
                />
                <div className="flex flex-col justify-between text-[11px]" style={{ color: '#9CA3AF' }}>
                  {LEGEND_TICKS.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CorrelationMatrix;
