import { useState } from 'react';
import MonthlyStatsTable from './MonthlyStatsTable';
import ReportPager from './ReportPager';
import { legRows, summaryFromRows, monthlyFromRows } from '../utils/portfolioStats';
import { X, Download } from 'lucide-react';
import { colors } from '../theme/colors';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

// Custom dropdown chevron (appearance-none hides the clipped native arrow).
const selectChevron = (strokeColor) =>
  `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

const PortfolioBacktestResults = ({ 
  results, 
  startDate, 
  endDate,
  portfolioName,
  strategies,
  dteTab,
  qtyMultiplier,
  slippage,
  /*
    WHICH STRATEGIES ARE OUT, owned by PortfolioDetails as rows[].selected.

    Lifted out of this component on purpose: the same state decides what the
    run-backtest payload carries, so the configuration row's checkbox and the
    Strategy-wise Report's checkbox below are one checkbox with two faces.
    Keeping a private Set here let them disagree.
  */
  excludedIds,
  onToggleStrategy,
  onClose
}) => {
  const [sortBy, setSortBy] = useState('Entry date');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [currentPage, setCurrentPage] = useState(1);
  const [aggregateByDay, setAggregateByDay] = useState(true); // Checkbox state for daywise vs tradewise
  const [showFileNameModal, setShowFileNameModal] = useState(false);
  const [fileName, setFileName] = useState('');
  const tradesPerPage = 10;

  if (!results) {
    return null;
  }

  console.log('[PortfolioBacktestResults] Received results:', results);

  // The API response has data at root level, not nested in data property
  const data = results.data || results;

  console.log('[PortfolioBacktestResults] Using data:', data);
  console.log('[PortfolioBacktestResults] Data keys:', Object.keys(data));

  // Parse aggregate summary data
  const aggregate = data.aggregate || {};
  const summaryReports = aggregate.summary_report_result || [];
  const daywiseSummary = summaryReports.find(r => r.reportType === 'Daywise')?.summaryReport || {};
  const tradewiseSummary = summaryReports.find(r => r.reportType === 'Tradewise')?.summaryReport || {};

  // Parse monthly stats
  const yearlyReturns = aggregate.monthly_state_result || [];

 
  const portfolioMonthlyStats = {};
  yearlyReturns.forEach((yearData) => {
    const raw = yearData.days_of_Max_Drawdown || '';
    const daysMatch = raw.match(/^(\d+)/);
    const dateMatch = raw.match(/\[(.*?) to (.*?)\]/);
    const num = (v) => (v === null || v === undefined || v === '' ? null : parseFloat(v));
    portfolioMonthlyStats[yearData.year] = {
      Jan: num(yearData.january), Feb: num(yearData.february), Mar: num(yearData.march),
      Apr: num(yearData.april),   May: num(yearData.may),      Jun: num(yearData.june),
      Jul: num(yearData.july),    Aug: num(yearData.august),   Sep: num(yearData.september),
      Oct: num(yearData.october), Nov: num(yearData.november), Dec: num(yearData.december),
      total: num(yearData.total) ?? 0,
      max_drawdown: num(yearData.max_Drawdown),
      days_for_mdd: daysMatch ? daysMatch[1] : null,
      mdd_start: dateMatch ? dateMatch[1] : null,
      mdd_end: dateMatch ? dateMatch[2] : null,
      r_mdd: num(yearData.yearly_Return_per_MaxDD),
    };
  });

  // Parse strategy-wise data.

  const strategyMeta = Array.isArray(data.strategies) ? data.strategies : [];
  const rootTrades = Array.isArray(data.trade_results) ? data.trade_results : [];

  const strategiesData = (() => {
    // id -> display name, from the response first, then the portfolio rows.
    const nameById = new Map();
    strategyMeta.forEach((m) => {
      if (m?.strategy_id !== undefined && m?.strategy_id !== null) {
        nameById.set(String(m.strategy_id), m.strategy_name);
      }
    });
    (Array.isArray(strategies) ? strategies : []).forEach((row) => {
      const key = String(row?.id ?? '');
      if (key && !nameById.has(key)) nameById.set(key, row.name);
    });
    const metaById = new Map(
      strategyMeta.map((m) => [String(m.strategy_id), m])
    );

    if (rootTrades.length > 0) {
      const byStrategy = new Map();
      rootTrades.forEach((trade) => {
        const legsById = new Map();
        (trade.legs || []).forEach((leg) => {
          const sid = String(leg.strategy_id ?? 'unknown');
          if (!legsById.has(sid)) legsById.set(sid, []);
          legsById.get(sid).push(leg);
        });
        legsById.forEach((legs, sid) => {
          if (!byStrategy.has(sid)) {
            const meta = metaById.get(sid) || {};
            byStrategy.set(sid, {
              strategy_id: sid,
              strategy_name: meta.strategy_name || nameById.get(sid) || `Strategy ${sid}`,
              summary_report_result: meta.summary_report_result || [],
              monthly_state_result: meta.monthly_state_result || [],
              trade_results: [],
            });
          }
          byStrategy.get(sid).trade_results.push({ trade_date: trade.trade_date, legs });
        });
      });
      // A strategy that reported summaries but traded nothing still deserves its
      // column in the strategy-wise table.
      strategyMeta.forEach((m) => {
        const sid = String(m.strategy_id);
        if (!byStrategy.has(sid)) {
          byStrategy.set(sid, { ...m, strategy_id: sid, trade_results: m.trade_results || [] });
        }
      });
      return Array.from(byStrategy.values());
    }

    return strategyMeta;
  })();
  const splitDateTime = (value) => {
    if (!value || typeof value !== 'string') return { date: '', time: '' };
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
    if (m) return { date: m[1], time: m[2].length === 5 ? `${m[2]}:00` : m[2] };
    // Date with no time part at all.
    const dateOnly = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
    return dateOnly ? { date: dateOnly[1], time: '' } : { date: '', time: '' };
  };

  // Milliseconds for ordering; legs that never entered sort last instead of
  // returning NaN and landing at index 0.
  const stampMs = (value) => {
    const { date, time } = splitDateTime(value);
    if (!date) return null;
    const t = new Date(`${date}T${time || '00:00:00'}`).getTime();
    return Number.isNaN(t) ? null : t;
  };
  const allLegRows = legRows(rootTrades);
  const everyStrategyId = [...new Set(strategiesData.map((s) => String(s.strategy_id)))];
  const isTicked = (id) => !(excludedIds?.has(String(id)) ?? false);
  const tickedIds = everyStrategyId.filter(isTicked);
  const anyExcluded = tickedIds.length !== everyStrategyId.length;
  const noneTicked = tickedIds.length === 0;
  const tickedRows = anyExcluded
    ? allLegRows.filter((r) => isTicked(r.strategyId))
    : allLegRows;
  const recomputed = anyExcluded ? summaryFromRows(tickedRows) : null;
  const monthlyStatsShown = anyExcluded
    ? (() => {
      const recalculated = monthlyFromRows(tickedRows);
      const out = {};
      for (const [year, row] of Object.entries(recalculated)) {
        const original = portfolioMonthlyStats[year];
        out[year] = original
          ? {
            ...row,
            days_for_mdd: original.days_for_mdd,
            mdd_start: original.mdd_start,
            mdd_end: original.mdd_end,
            r_mdd: original.r_mdd,
          }
          : row;
      }
      return out;
    })()
    : portfolioMonthlyStats;

  /*
    The table is keyed by NAME (that is what the columns are), while the
    checkboxes and the filter work on ids. One map, built once, rather than a
    lookup scan inside the render of every cell.
  */
  const idByName = new Map(strategiesData.map((st) => [st.strategy_name, String(st.strategy_id)]));
  const fadedColumns = new Set(
    strategiesData.filter((st) => !isTicked(st.strategy_id)).map((st) => st.strategy_name),
  );

  const toggleStrategy = (id) => onToggleStrategy?.(id);

  // Build cumulative P/L data from trades
  const allTradesWithPnL = [];
  strategiesData.forEach(strategy => {
    // Unticked strategies are left out of the curve, as they are out of the
    // Aggregate column -- the chart and the figures describe the same set.
    if (!isTicked(strategy.strategy_id)) return;
    const trades = strategy.trade_results || [];
    trades.forEach(trade => {
      // Calculate trade P/L from legs
      let tradePnL = 0;
      if (trade.legs && trade.legs.length > 0) {
        trade.legs.forEach(leg => {
          if (leg.pnl !== undefined && leg.pnl !== null) {
            tradePnL += parseFloat(leg.pnl) || 0;
          }
        });
      }
      
      // Only add trades that have P/L data
      if (trade.legs && trade.legs.length > 0) {
        allTradesWithPnL.push({
          date: trade.trade_date || trade.entry_datetime?.split('T')[0],
          pnl: tradePnL,
          strategy_name: strategy.strategy_name,
          strategy_id: strategy.strategy_id
        });
      }
    });
  });

  // Sort trades by date
  allTradesWithPnL.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate cumulative P/L and drawdown
  const cumulativeData = [];
  let cumulativePnL = 0;
  let peak = 0;
  
  allTradesWithPnL.forEach(trade => {
    cumulativePnL += trade.pnl;
    
    // Update peak if we've reached a new high
    if (cumulativePnL > peak) {
      peak = cumulativePnL;
    }
    
    // Calculate drawdown from peak
    const drawdown = cumulativePnL - peak;
    
    cumulativeData.push({
      date: trade.date,
      cumulative: cumulativePnL,
      drawdown: drawdown,
      pnl: trade.pnl
    });
  });

  console.log('[PortfolioBacktestResults] Cumulative data calculated:', {
    totalTrades: allTradesWithPnL.length,
    finalCumulativePnL: cumulativePnL,
    dataPoints: cumulativeData.length
  });
  
  // Parse all trades from all strategies for the table
  // Build BOTH daywise aggregated data and individual leg data
  const allTradesLegwise = []; // Individual legs (tradewise)
  const dayTradesMap = {}; // Aggregated by day (daywise)
  
  strategiesData.forEach(strategy => {
    // Unticked strategies drop out of the Full Report too, so the trade list
    // and the figures above it always describe the same set.
    if (!isTicked(strategy.strategy_id)) return;
    const trades = strategy.trade_results || [];
    trades.forEach(trade => {
      const tradeDate = trade.trade_date;
      
      // Process each leg as a separate trade row (tradewise)
      if (trade.legs && trade.legs.length > 0) {
        trade.legs.forEach(leg => {
          // Every leg from the response is reported here, executed or not —
          // the portfolio report is deliberately unfiltered (the Strategy
          // Builder report still hides legs that never entered).
          {
            // Entry/exit timestamps live on the LEG, not on the trade. Reading
            // trade.entry_datetime (which does not exist) blanked every Entry
            // Time and fell back to the bare trade_date for Entry Date.
            const entryStamp = leg.entry_datetime || trade.entry_datetime || '';
            const exitStamp = leg.exit_datetime || trade.exit_datetime || '';

            const { date: entryDate, time: entryTimeFormatted } = splitDateTime(entryStamp);
            const { date: exitDate, time: exitTimeFormatted } = splitDateTime(exitStamp);

            const legData = {
              entry_stamp: entryStamp,
              exit_stamp: exitStamp,
              strategy_name: strategy.strategy_name,
              strategy_id: strategy.strategy_id,
              trade_date: trade.trade_date,
              entry_date: entryDate || trade.trade_date,
              entry_time: entryTimeFormatted,
              exit_date: exitDate || '',
              exit_time: exitTimeFormatted,
              leg_number: leg.leg,
              type: leg.option || '', // "call" or "put"
              strike: leg.strike || '',
              side: leg.position || '', // "BUY" or "SELL"
              qty: leg.quantity_multiplier || leg.quantity || leg.qty || leg.lot_size || '',
              entry_price: leg.entry_price || leg.entryPrice || 0,
              exit_price: leg.exit_price || leg.exitPrice || 0,
              pnl: leg.pnl || leg.profit_loss || 0,
              // Why the leg closed, same source and precedence the Strategy
              // Builder export uses for its Remarks column.
              remarks: leg.exit_reason || leg.status || '',
              moneyness: leg.moneyness || '',
              ticker: leg.ticker || ''
            };
            
            allTradesLegwise.push(legData);
            
            // Aggregate by day (daywise)
            if (!dayTradesMap[tradeDate]) {
              dayTradesMap[tradeDate] = {
                strategy_name: strategy.strategy_name,
                strategy_id: strategy.strategy_id,
                trade_date: tradeDate,
                // Filled in below from the legs actually collected for the day,
                // so one untriggered leg can no longer blank the day's times.
                entry_date: tradeDate,
                entry_time: '',
                exit_date: '',
                exit_time: '',
                legs_count: 0,
                total_pnl: 0,
                qty: leg.quantity_multiplier || leg.quantity || leg.qty || leg.lot_size || 0,
                // Collect all strikes, sides, entry prices, exit prices from legs
                strikes: [],
                sides: [],
                entry_prices: [],
                exit_prices: [],
                types: [],
                legs: []
              };
            }
            
            // Add leg data to the aggregated day
            dayTradesMap[tradeDate].strikes.push(leg.strike || '');
            dayTradesMap[tradeDate].sides.push(leg.position || '');
            dayTradesMap[tradeDate].entry_prices.push(leg.entry_price || 0);
            dayTradesMap[tradeDate].exit_prices.push(leg.exit_price || 0);
            dayTradesMap[tradeDate].types.push(leg.option || '');
            
            dayTradesMap[tradeDate].legs.push(legData);
            dayTradesMap[tradeDate].legs_count += 1;
            dayTradesMap[tradeDate].total_pnl += parseFloat(legData.pnl || 0);
          }
        });
      }
    });
  });
  
  // Convert daywise map to array, ordering each day's legs chronologically and
  // taking the day's window from the legs that actually traded: entry = first
  // leg to enter, exit = last leg to exit.
  const allTradesDaywise = Object.values(dayTradesMap).map((day) => {
    const legs = [...day.legs].sort(
      (a, b) => (stampMs(a.entry_stamp) ?? Infinity) - (stampMs(b.entry_stamp) ?? Infinity)
    );
    const firstEntered = legs.find((l) => stampMs(l.entry_stamp) !== null);
    const lastExited = legs
      .filter((l) => stampMs(l.exit_stamp) !== null)
      .sort((a, b) => stampMs(a.exit_stamp) - stampMs(b.exit_stamp))
      .pop();

    return {
      ...day,
      legs,
      entry_date: firstEntered?.entry_date || day.trade_date,
      entry_time: firstEntered?.entry_time || '',
      exit_date: lastExited?.exit_date || '',
      exit_time: lastExited?.exit_time || '',
    };
  });
  
  console.log('[PortfolioBacktestResults] Trade data built:', {
    legwiseTrades: allTradesLegwise.length,
    daywiseTrades: allTradesDaywise.length,
    sampleLegwise: allTradesLegwise[0],
    sampleDaywise: allTradesDaywise[0]
  });
  
  // Choose which data to display based on checkbox
  let allTrades = aggregateByDay ? allTradesDaywise : allTradesLegwise;
  
  // Apply sorting based on user selection
  const sortedTrades = [...allTrades].sort((a, b) => {
    let compareValue = 0;
    
    if (sortBy === 'Entry date') {
      const dateA = new Date(a.entry_date || a.trade_date || 0);
      const dateB = new Date(b.entry_date || b.trade_date || 0);
      compareValue = dateA - dateB;
    } else if (sortBy === 'Exit date') {
      const dateA = new Date(a.exit_date || a.trade_date || 0);
      const dateB = new Date(b.exit_date || b.trade_date || 0);
      compareValue = dateA - dateB;
    } else if (sortBy === 'Exit time') {
      const timeA = a.exit_time || '00:00:00';
      const timeB = b.exit_time || '00:00:00';
      compareValue = timeA.localeCompare(timeB);
    } else if (sortBy === 'P/L') {
      const pnlA = parseFloat(a.pnl || a.total_pnl || 0);
      const pnlB = parseFloat(b.pnl || b.total_pnl || 0);
      compareValue = pnlA - pnlB;
    }
    
    // Apply sort order (ASC or DESC)
    return sortOrder === 'ASC' ? compareValue : -compareValue;
  });
  
  // Pagination logic
  const totalPages = Math.ceil(sortedTrades.length / tradesPerPage);
  const safePage = Math.min(Math.max(1, currentPage), Math.max(totalPages, 1));

  const indexOfLastTrade = safePage * tradesPerPage;
  const indexOfFirstTrade = indexOfLastTrade - tradesPerPage;
  const currentTrades = sortedTrades.slice(indexOfFirstTrade, indexOfLastTrade);

  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatNumber = (value, decimals = 2) => {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  // CSV wants plain numbers — formatNumber's en-IN grouping would put commas
  // inside a field and break the column on import.
  const csvNumber = (value, decimals = 2) => {
    if (value === undefined || value === null || value === '') return '';
    const num = parseFloat(value);
    return Number.isNaN(num) ? '' : num.toFixed(decimals);
  };

  const defaultReportName = `trade_${portfolioName || 'portfolio'}`;
  const saveCsv = (csv, filename) => {
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  };

  const downloadStrategyTrades = (strategyId, strategyName) => {
    const key = String(strategyId);

    // "2025-10-28" -> "Tuesday". Built from the date alone so a timestamp's
    // timezone cannot roll it to the day before.
    const weekday = (date) => {
      if (!date) return '';
      const d = new Date(`${date}T12:00:00`);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
    };

    // The first of several spellings the backend has used for a field.
    const pick = (obj, names) => {
      for (const n of names) {
        const v = obj?.[n];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return '';
    };

    /*
      Percentage move on the leg's own premium, signed the way the position
      profits: a Sell gains when the price falls. Computed rather than read,
      because the response does not carry it.
    */
    const plPercent = (leg) => {
      const entry = parseFloat(leg?.entry_price);
      const exit = parseFloat(leg?.exit_price);
      if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry === 0) return '';
      const sell = String(leg?.position ?? '').toUpperCase().startsWith('S');
      return ((sell ? entry - exit : exit - entry) / entry) * 100;
    };

    const header = ['Index', 'Entry-Date', 'Entry-Weekday', 'Entry-Time', 'Entry-Price',
      'Entry-Delta', 'Quantity', 'Instrument-Kind', 'StrikePrice', 'Position',
      'ExitDate', 'Exit-Weekday', 'ExitTime', 'ExitPrice', 'Exit-Delta',
      'P/L', 'P/L-Percentage', 'ExpiryDate', 'Remarks'];
    const rows = [header];

    let n = 0;
    rootTrades.forEach((trade) => {
      const legs = (trade.legs || []).filter((l) => String(l.strategy_id ?? '') === key);
      if (!legs.length) return;
      n += 1;

      // The trade's own span: earliest entry to latest exit across its legs.
      const first = legs[0];
      const last = legs[legs.length - 1];
      const pEntry = splitDateTime(first?.entry_datetime);
      const pExit = splitDateTime(last?.exit_datetime);
      const totalPnl = legs.reduce((sum, l) => sum + (parseFloat(l?.pnl) || 0), 0);

      rows.push([
        String(n),
        pEntry.date, '', pEntry.time,
        pick(first, ['underlying_entry_price']),
        '', '', '', '', '',
        pExit.date, '', pExit.time,
        pick(last, ['underlying_exit_price']),
        '',
        totalPnl, '', '',
        pick(last, ['exit_reason']) || pick(first, ['entry_reason']),
      ]);

      legs.forEach((leg, i) => {
        const entry = splitDateTime(leg.entry_datetime);
        const exit = splitDateTime(leg.exit_datetime);
        rows.push([
          `${n}.${i + 1}`,
          entry.date, weekday(entry.date), entry.time,
          pick(leg, ['entry_price']),
          pick(leg, ['entry_delta', 'delta_entry']),
          pick(leg, ['quantity', 'qty', 'lot_size']),
          pick(leg, ['option', 'type']),
          pick(leg, ['strike']),
          pick(leg, ['position', 'side']),
          exit.date, weekday(exit.date), exit.time,
          pick(leg, ['exit_price']),
          pick(leg, ['exit_delta', 'delta_exit']),
          pick(leg, ['pnl']),
          plPercent(leg),
          pick(leg, ['expiration_date', 'expiry_date']),
          pick(leg, ['exit_reason']) || pick(leg, ['entry_reason']),
        ]);
      });
    });

    const csv = rows
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const safe = String(strategyName || 'strategy').replace(/[\\/:*?"<>|]/g, '_');
    saveCsv(csv, `${safe}.csv`);
  };

  const buildTradesCsv = () => {
    const header = ['Index', 'Entry Date', 'Entry Time', 'Exit Date', 'Exit Time', 'Type',
                    'Strike', 'B/S', 'Qty', 'Entry Price', 'Exit Price', 'P/L', 'Remarks'];
    const rows = [header];

    sortedTrades.forEach((trade, idx) => {
      const n = idx + 1;
      if (aggregateByDay) {
        // Remarks is a per-leg exit reason, so the day summary row leaves it
        // blank — the same way the Strategy Builder export does.
        rows.push([
          n, trade.entry_date || '', trade.entry_time || '', trade.exit_date || '', trade.exit_time || '',
          '', '', '', '', '', '', csvNumber(trade.total_pnl), '',
        ]);
        (trade.legs || []).forEach((leg, legIdx) => {
          rows.push([
            `${n}.${legIdx + 1}`, leg.entry_date || '', leg.entry_time || '', leg.exit_date || '', leg.exit_time || '',
            (leg.type || '').toUpperCase(), leg.strike ?? '', leg.side || '', leg.qty ?? '',
            csvNumber(leg.entry_price), csvNumber(leg.exit_price), csvNumber(leg.pnl), leg.remarks || '',
          ]);
        });
      } else {
        rows.push([
          n, trade.entry_date || '', trade.entry_time || '', trade.exit_date || '', trade.exit_time || '',
          (trade.type || '').toUpperCase(), trade.strike ?? '', trade.side || '', trade.qty ?? '',
          csvNumber(trade.entry_price), csvNumber(trade.exit_price), csvNumber(trade.pnl), trade.remarks || '',
        ]);
      }
    });

    // Every field quoted, embedded quotes doubled. Leading BOM so Excel opens
    // the file as UTF-8 instead of mangling the rupee sign and names.
    const body = rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    return `\ufeff${body}`;
  };

  const downloadTradesCsv = () => {
    // Empty input means "use the default", matching the placeholder shown.
    const typed = fileName.trim();
    const safe = (typed || defaultReportName).replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([buildTradesCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safe.toLowerCase().endsWith('.csv') ? safe : `${safe}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setShowFileNameModal(false);
    setFileName('');
  };

  // Build strategy stats object for table
  const strategyStats = {};
  strategiesData.forEach(strategy => {
    // Get strategy-specific summary data based on checkbox
    const strategySummaryReports = strategy.summary_report_result || [];
    const reportType = aggregateByDay ? 'Daywise' : 'Tradewise';
    const strategySummary = strategySummaryReports.find(r => r.reportType === reportType)?.summaryReport || {};
    
    // Use different fields based on report type
    if (aggregateByDay) {
      // Daywise mode - use "Days" fields
      strategyStats[strategy.strategy_name] = {
        overall_profit: strategySummary.OverallProfit || 0,
        num_trades: strategySummary.NumberOfDays || 0,
        avg_profit: strategySummary.AvgProfitPerDays || 0,
        win_rate: strategySummary.WinPer || 0,
        loss_rate: strategySummary.LossPer || 0,
        avg_win: strategySummary.AvgProfitOnWinningDays || 0,
        avg_loss: strategySummary.AvgLossOnLossingDays || 0,
        max_profit: strategySummary.MaxProfitInSingleDays || 0,
        max_loss: strategySummary.MaxLossInSingleDays || 0,
        max_drawdown: strategySummary.Max_Drawdown || 0,
        mdd_duration: strategySummary.Days_of_Max_Drawdown || '-',
        return_mdd: strategySummary.ReturnPerMaxDD || 0,
        reward_risk: strategySummary.RewardToRiskRatio || 0,
        expectancy: strategySummary.ExpectancyRatio || 0,
        max_win_streak: strategySummary.MaxWiningStreak || 0,
        max_loss_streak: strategySummary.MaxLossingStreak || 0,
        max_dd_days: strategySummary.MaxTradesInDrawdown || 0,
      };
    } else {
      // Tradewise mode - use "Trade" fields (singular form)
      strategyStats[strategy.strategy_name] = {
        overall_profit: strategySummary.OverallProfit || 0,
        num_trades: strategySummary.NumberOfTrades || 0,
        avg_profit: strategySummary.AvgProfitPerTrade || 0,
        win_rate: strategySummary.WinPer || 0,
        loss_rate: strategySummary.LossPer || 0,
        avg_win: strategySummary.AvgProfitOnWinningTrade || 0,
        avg_loss: strategySummary.AvgLossOnLossingTrade || 0,
        max_profit: strategySummary.MaxProfitInSingleTrade || 0,
        max_loss: strategySummary.MaxLossInSingleTrade || 0,
        max_drawdown: strategySummary.Max_Drawdown || 0,
        mdd_duration: strategySummary.Days_of_Max_Drawdown || '-',
        return_mdd: strategySummary.ReturnPerMaxDD || 0,
        reward_risk: strategySummary.RewardToRiskRatio || 0,
        expectancy: strategySummary.ExpectancyRatio || 0,
        max_win_streak: strategySummary.MaxWiningStreak || 0,
        max_loss_streak: strategySummary.MaxLossingStreak || 0,
        max_dd_days: strategySummary.MaxTradesInDrawdown || 0,
      };
    }
  });

  // Add aggregate column based on checkbox
  const aggregateSummary = aggregateByDay ? daywiseSummary : tradewiseSummary;
  const aggregateLabel = aggregateByDay ? 'Aggregate' : 'Aggregate(Trades)';
  
  if (aggregateByDay) {
    // Daywise aggregate
    strategyStats[aggregateLabel] = {
      overall_profit: aggregateSummary.OverallProfit || 0,
      num_trades: aggregateSummary.NumberOfDays || 0,
      avg_profit: aggregateSummary.AvgProfitPerDays || 0,
      win_rate: aggregateSummary.WinPer || 0,
      loss_rate: aggregateSummary.LossPer || 0,
      avg_win: aggregateSummary.AvgProfitOnWinningDays || 0,
      avg_loss: aggregateSummary.AvgLossOnLossingDays || 0,
      max_profit: aggregateSummary.MaxProfitInSingleDays || 0,
      max_loss: aggregateSummary.MaxLossInSingleDays || 0,
      max_drawdown: aggregateSummary.Max_Drawdown || 0,
      mdd_duration: aggregateSummary.Days_of_Max_Drawdown || '-',
      return_mdd: aggregateSummary.ReturnPerMaxDD || 0,
      reward_risk: aggregateSummary.RewardToRiskRatio || 0,
      expectancy: aggregateSummary.ExpectancyRatio || 0,
      max_win_streak: aggregateSummary.MaxWiningStreak || 0,
      max_loss_streak: aggregateSummary.MaxLossingStreak || 0,
      max_dd_days: aggregateSummary.MaxTradesInDrawdown || 0,
    };
  } else {
    // Tradewise aggregate (singular form)
    strategyStats[aggregateLabel] = {
      overall_profit: aggregateSummary.OverallProfit || 0,
      num_trades: aggregateSummary.NumberOfTrades || 0,
      avg_profit: aggregateSummary.AvgProfitPerTrade || 0,
      win_rate: aggregateSummary.WinPer || 0,
      loss_rate: aggregateSummary.LossPer || 0,
      avg_win: aggregateSummary.AvgProfitOnWinningTrade || 0,
      avg_loss: aggregateSummary.AvgLossOnLossingTrade || 0,
      max_profit: aggregateSummary.MaxProfitInSingleTrade || 0,
      max_loss: aggregateSummary.MaxLossInSingleTrade || 0,
      max_drawdown: aggregateSummary.Max_Drawdown || 0,
      mdd_duration: aggregateSummary.Days_of_Max_Drawdown || '-',
      return_mdd: aggregateSummary.ReturnPerMaxDD || 0,
      reward_risk: aggregateSummary.RewardToRiskRatio || 0,
      expectancy: aggregateSummary.ExpectancyRatio || 0,
      max_win_streak: aggregateSummary.MaxWiningStreak || 0,
      max_loss_streak: aggregateSummary.MaxLossingStreak || 0,
      max_dd_days: aggregateSummary.MaxTradesInDrawdown || 0,
    };
  }

  /*
    THE AGGREGATE COLUMN. Replaced with the recomputation whenever a strategy
    is unticked -- the block assigned above came from the response and always
    describes all of them.
  */
  if (recomputed) strategyStats[aggregateLabel] = recomputed;

  const strategyNames = [
    ...Object.keys(strategyStats).filter((name) => name === aggregateLabel),
    ...Object.keys(strategyStats).filter((name) => name !== aggregateLabel),
  ];

  console.log('[PortfolioBacktestResults] Final data:', {
    yearlyReturns: yearlyReturns.length,
    strategyNames: strategyNames.length,
    allTrades: allTrades.length,
    daywiseSummary,
    strategyStats
  });

  return (
    <div className="space-y-6 mt-6">
      {/* Show message if no trade data */}
      {allTrades.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">No Trade Data Available</h3>
          <p className="text-yellow-700">
            The backtest completed but no trades were executed. This usually means:
          </p>
          <ul className="list-disc list-inside text-yellow-700 mt-2 space-y-1">
            <li>No option chain data available for the selected date range</li>
            <li>The strategy entry conditions were not met during the backtest period</li>
            <li>There may be configuration issues with the strategy parameters</li>
          </ul>
          <p className="text-yellow-700 mt-3">
            <strong>Backend logs show:</strong> "No chain rows for leg 1 (option_type=call, dte=1)"
          </p>
          <p className="text-yellow-700 mt-2">
            Try adjusting your strategy settings or date range, or check if historical data is available for this period.
          </p>
        </div>
      )}

      {/* BACKTEST RESULT Header.

          SHOWN EVEN WITH NOTHING TICKED, with empty axes. The reference keeps
          the chart frame standing and empties it, which reads as "no strategy
          selected"; removing the card instead makes the page jump and looks
          like the backtest itself failed. */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Bcktest Result</h2>
            <div className="flex items-center gap-2 mb-2 ignore-pdf">
            </div>
          </div>
          <div className="flex items-center gap-3">   
          </div>
        </div>

        {/* Cumulative P/L Chart */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm font-medium">Cumulative P/L</span>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulativeData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  stroke="#d1d5db"
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  stroke="#d1d5db"
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value) => [formatCurrency(value), 'Cumulative P/L']}
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #d1d5db', 
                    borderRadius: '6px',
                    padding: '8px 12px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke="#10b981" 
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Drawdown Chart */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              <span className="text-sm font-medium">Drawdown</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulativeData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  stroke="#d1d5db"
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  stroke="#d1d5db"
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value) => [formatCurrency(value), 'Drawdown']}
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #d1d5db', 
                    borderRadius: '6px',
                    padding: '8px 12px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="drawdown" 
                  stroke="#ef4444" 
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Year-wise Returns — the SAME component the Strategy Builder renders.
          This used to be a second, hand-written table with its own padding,
          header shade and number formatting, so the two pages disagreed and the
          portfolio one rendered differently again on other machines. One
          component means one appearance everywhere. */}
      {/* `emptyAsTable`: with nothing ticked this keeps the column headings
          and drops the rows, as the reference does, rather than replacing the
          whole table with a sentence. */}
      <div className="bg-white rounded-lg border border-gray-200">
        <MonthlyStatsTable monthlyStats={monthlyStatsShown}
                          headingClass="text-lg font-bold"
                          emptyAsTable />
      </div>

      {/* Brokerage, Taxes & Analysis */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Brokerage, Taxes & Analysis:</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <input type="checkbox" />
              Include Brokerage:
            </label>
            <input type="number" defaultValue="0" className="w-full px-3 py-2 border border-gray-300 rounded" />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <input type="checkbox" />
              Taxes & charges:
            </label>
            <input type="number" defaultValue="23150.0" className="w-full px-3 py-2 border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-2 block">Select VIX Range</label>
            <div className="flex items-center gap-2">
              <input type="number" placeholder="From" defaultValue="0" className="w-full px-3 py-2 border border-gray-300 rounded" />
              <span>To</span>
              <input type="number" placeholder="To" defaultValue="150" className="w-full px-3 py-2 border border-gray-300 rounded" />
              <button
                className="px-4 py-2 text-white rounded whitespace-nowrap transition-colors"
                style={{ backgroundColor: colors.legBuilder.addLegBg }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
              >
                Re-calculate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Strategy-wise Report */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Strategy-wise Report</h3>
            <p className="text-xs text-gray-500">*The returns are annualized for calculations *</p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input 
              type="checkbox" 
              checked={aggregateByDay}
              onChange={(e) => setAggregateByDay(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="select-none">Aggregate At End of Trading Day</span>
          </label>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            {/* The Strategy-wise Report is a LIGHT table, unlike the Full Report
                above: a pale grey surface with white rules between the rows, and
                centred headings in the same ink as the labels. It briefly wore
                the Full Report's #E3E3E3 band, which is from a different screen
                and read far too heavy here. */}
            <thead>
              <tr>
                <th className="px-4 py-3 text-center text-[14px] font-semibold"
                    style={{ backgroundColor: '#F8F8F8', color: '#2A2A2A' }}>Statistic</th>
                {strategyNames.map(strategy => {
                  /*
                    The Aggregate column has no box of its own -- it IS the
                    result of the boxes, and ticking it would mean nothing.
                  */
                  const id = idByName.get(strategy);
                  const ticked = id === undefined ? true : isTicked(id);
                  return (
                    <th key={strategy} className="px-4 py-3 text-center text-[14px] font-semibold"
                        style={{ backgroundColor: '#F8F8F8', color: ticked ? '#2A2A2A' : '#A1A1AA' }}>
                      {id !== undefined && (
                        <div className="flex justify-center mb-1">
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => toggleStrategy(id)}
                            aria-label={`Include ${strategy} in the portfolio figures`}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                      )}
                      {strategy}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-white">
              {/*
                THE STATISTICS DISAPPEAR WHEN NOTHING IS TICKED. Every figure
                here describes the ticked strategies, so with none of them
                ticked each row would read as a column of zeroes -- a result
                that did not happen. The Download Trades row below stays, so a
                strategy can still be exported without being counted.
              */}
              {!noneTicked && (<>
              <StatisticRow 
                label="Overall Profit" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="overall_profit"
                isCurrency 
              />
              <StatisticRow 
                label={aggregateByDay ? "No. of Trades(Periods)" : "No. of Trades"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="num_trades"
              />
              <StatisticRow 
                label={aggregateByDay ? "Average Profit per Period" : "Average Profit per Trade"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="avg_profit"
                isCurrency 
              />
              <StatisticRow 
                label={aggregateByDay ? "Win %(Periods)" : "Win %"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="win_rate"
              />
              <StatisticRow 
                label={aggregateByDay ? "Loss %(Periods)" : "Loss %"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="loss_rate"
              />
              <StatisticRow 
                label={aggregateByDay ? "Average Profit on Winning Periods" : "Average Profit on Winning Trades"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="avg_win"
                isCurrency 
              />
              <StatisticRow 
                label={aggregateByDay ? "Average Loss on Losing Periods" : "Average Loss on Losing Trades"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="avg_loss"
                isCurrency 
              />
              <StatisticRow 
                label={aggregateByDay ? "Max Profit in Single Period" : "Max Profit in Single Trade"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="max_profit"
                isCurrency 
              />
              <StatisticRow 
                label={aggregateByDay ? "Max Loss in Single Period" : "Max Loss in Single Trade"} 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="max_loss"
                isCurrency 
              />
              <StatisticRow 
                label="Max Drawdown" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="max_drawdown"
                isCurrency 
              />
              <StatisticRow 
                label="Duration of Max Drawdown" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="mdd_duration"
              />
              <StatisticRow 
                label="Return/MaxDD" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="return_mdd"
              />
              <StatisticRow 
                label="Reward to Risk Ratio" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="reward_risk"
              />
              <StatisticRow 
                label="Expectancy Ratio" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="expectancy"
              />
              <StatisticRow 
                label="Max Win Streak (Periods)" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="max_win_streak"
              />
              <StatisticRow 
                label="Max Losing Streak (Periods)" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="max_loss_streak"
              />
              <StatisticRow 
                label="Max days in any drawdown(Periods)" 
                strategies={strategyNames} 
                data={strategyStats}
                fadedColumns={fadedColumns}
                field="max_dd_days"
              />
              </>)}

              {anyExcluded && (
              <tr style={{ backgroundColor: '#F8F8F8' }}>
                <td className="px-4 py-3 text-left font-semibold text-[14px]" style={{ color: '#2A2A2A' }}>
                  Download Trades
                </td>
                {strategyNames.map((strategy) => {
                  const id = idByName.get(strategy);
                  // Aggregate has no file of its own -- it is a summary, not a
                  // strategy -- and a ticked strategy does not offer one here.
                  if (id === undefined || isTicked(id)) {
                    return (
                      <td key={strategy} className="px-4 py-3 text-center text-[12px]"
                          style={{ color: '#A1A1AA' }}>{id === undefined ? '-' : ''}</td>
                    );
                  }
                  return (
                    <td key={strategy} className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => downloadStrategyTrades(id, strategy)}
                        title={`Download ${strategy} trades as CSV`}
                        aria-label={`Download ${strategy} trades as CSV`}
                        className="inline-flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
                      >
                        <Download size={16} />
                      </button>
                    </td>
                  );
                })}
              </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showFileNameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-[16px] font-semibold text-gray-800">Enter file name</h3>
              <button
                type="button"
                onClick={() => setShowFileNameModal(false)}
                className="text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <label className="block text-[13px] text-gray-600 mb-2" htmlFor="trades-file-name">
                File Name:
              </label>
              <input
                id="trades-file-name"
                autoFocus
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') downloadTradesCsv(); }}
                placeholder={defaultReportName}
                className="w-full px-3 h-10 border rounded-md text-[13px] outline-none focus:ring-2 focus:ring-blue-200"
                style={{ borderColor: '#e3e3e3', color: '#3a3a3a' }}
              />
            </div>

            <div className="flex justify-end px-6 pb-5">
              <button
                type="button"
                onClick={downloadTradesCsv}
                className="px-5 py-2 rounded-md text-white text-[13px] font-medium transition-colors"
                style={{ backgroundColor: colors.legBuilder.addLegBg }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Report - Only show if there are actual trades with data */}
      {allTrades.length > 0 && (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Full Report</h3>
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-normal mr-1" style={{ color: colors.settingsPanel.label }}>Sort By :</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 border rounded-md text-[13px] font-normal outline-none cursor-pointer bg-white"
              style={{
                borderColor: colors.settingsPanel.fieldBorder,
                color: colors.settingsPanel.inputValue,
                backgroundImage: selectChevron('%234B5563'),
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.6rem center',
              }}
            >
              <option>Entry date</option>
              <option>P/L</option>
            </select>
            <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: colors.settingsPanel.fieldBorder }}>
              <button
                onClick={() => setSortOrder('ASC')}
                className="px-3.5 py-1.5 text-[13px] transition-colors"
                style={sortOrder === 'ASC'
                  ? { backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, fontWeight: 500 }
                  : { backgroundColor: '#FFFFFF', color: colors.settingsPanel.inactiveText }}
              >
                Asc
              </button>
              <button
                onClick={() => setSortOrder('DESC')}
                className="px-3.5 py-1.5 text-[13px] border-l transition-colors"
                style={sortOrder === 'DESC'
                  ? { backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, fontWeight: 500, borderColor: colors.settingsPanel.fieldBorder }
                  : { backgroundColor: '#FFFFFF', color: colors.settingsPanel.inactiveText, borderColor: colors.settingsPanel.fieldBorder }}
              >
                Desc
              </button>
            </div>
            <span className="text-sm text-gray-600">
              Showing {indexOfFirstTrade + 1} - {Math.min(indexOfLastTrade, sortedTrades.length)} trades out of {sortedTrades.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead style={{ backgroundColor: '#E3E3E3' }}>
              <tr>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Index</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Entry Date</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Entry Time</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Exit Date</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Exit Time</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Type</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Strike</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>B/S</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Qty</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Entry Price</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>Exit Price</th>
                <th className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currentTrades.map((trade, idx) => {
                // Daywise aggregation - show parent row + child leg rows
                if (aggregateByDay) {
                  const pnl = parseFloat(trade.total_pnl || 0);
                  const rows = [];
                  
                  rows.push(
                    <tr key={`${indexOfFirstTrade + idx}-parent`} className="hover:bg-gray-50 font-medium">
                      {/* Index column carries the header band's grey, as the builder draws it. */}
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A', backgroundColor: '#E3E3E3' }}>{indexOfFirstTrade + idx + 1}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.entry_date || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.entry_time || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.exit_date || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.exit_time || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                      <td className={`p-1 text-center text-[14px] font-medium border-2 ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ borderColor: '#D4D4D8' }}>
                        {formatNumber(pnl, 2)}
                      </td>
                    </tr>
                  );
                  
                  // Child rows for each leg
                  trade.legs && trade.legs.forEach((leg, legIdx) => {
                    const legPnl = parseFloat(leg.pnl || 0);
                    rows.push(
                      <tr key={`${indexOfFirstTrade + idx}-leg-${legIdx}`} className="hover:bg-gray-50">
                        {/* The LEG row's index is grey too -- the builder fills the
                            whole Index column, not just the day-summary rows. */}
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A', backgroundColor: '#E3E3E3' }}>{indexOfFirstTrade + idx + 1}.{legIdx + 1}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.entry_date || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.entry_time || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.exit_date || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.exit_time || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.type || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.strike || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.side || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.qty || '-'}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{formatNumber(leg.entry_price, 2)}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{formatNumber(leg.exit_price, 2)}</td>
                        <td className={`p-1 text-center text-[14px] font-medium border-2 ${legPnl >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ borderColor: '#D4D4D8' }}>
                          {formatNumber(legPnl, 2)}
                        </td>
                      </tr>
                    );
                  });
                  
                  return rows;
                } else {
                  // Tradewise - show individual legs
                  const pnl = parseFloat(trade.pnl || 0);
                  return (
                    <tr key={`${indexOfFirstTrade + idx}-${trade.leg_number}`} className="hover:bg-gray-50">
                      {/* Index column carries the header band's grey, as the builder draws it. */}
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A', backgroundColor: '#E3E3E3' }}>{indexOfFirstTrade + idx + 1}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.entry_date || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.entry_time || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.exit_date || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.exit_time || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.type || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.strike || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.side || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{trade.qty || '-'}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{formatNumber(trade.entry_price, 2)}</td>
                      <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{formatNumber(trade.exit_price, 2)}</td>
                      <td className={`p-1 text-center text-[14px] font-medium border-2 ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ borderColor: '#D4D4D8' }}>
                        {formatNumber(pnl, 2)}
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>

        {/* The shared pager -- see ReportPager.jsx. */}
        <ReportPager page={safePage} totalPages={totalPages} onChange={setCurrentPage} />


        {/* Same pair, same styling as the Strategy Builder report footer:
            outlined navy Download Report, outlined red Close Report. */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setFileName(''); setShowFileNameModal(true); }}
            className="px-4 py-2 rounded-md border text-[13px] font-medium transition-colors"
            style={{ borderColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeBg, backgroundColor: '#FFFFFF' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.settingsPanel.activeBg; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.color = colors.settingsPanel.activeBg; }}
          >
            Download Report
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border text-[13px] font-medium text-red-600 border-red-400 bg-white hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
              title="Close and clear this report"
            >
              Close Report
            </button>
          )}
        </div>
      </div>
      )}

    </div>
  );
};

const StatisticRow = ({ label, strategies, data, field, isCurrency = false, fadedColumns }) => {
  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    
    if (isCurrency) {
      return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <tr style={{ backgroundColor: '#F8F8F8' }}>
      <td className="px-4 py-3 text-left font-semibold text-[14px]" style={{ color: '#2A2A2A' }}>{label}</td>
      {strategies.map(strategy => {
        const value = data[strategy]?.[field] || 0;
        const numValue = parseFloat(value);
        const money = isCurrency || label.includes('Profit') || label.includes('Loss');
        const faded = fadedColumns?.has(strategy);
        const tone = money ? (numValue >= 0 ? '#006A2C' : '#B12020') : '#A1A1AA';

        return (
          <td key={strategy} className="px-4 py-3 text-center font-semibold text-[12px]"
              style={{ color: tone, opacity: faded ? 0.4 : 1 }}>
            {formatValue(value)}
          </td>
        );
      })}
    </tr>
  );
};

export default PortfolioBacktestResults;
