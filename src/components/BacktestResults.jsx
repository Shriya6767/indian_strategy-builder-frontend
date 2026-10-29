import { Fragment, useMemo, useState, useEffect, useRef } from 'react';
import React from 'react';
import { Download } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend, Line } from 'recharts';
import MonthlyStatsTable from './MonthlyStatsTable';
import ReportPager from './ReportPager';
import ToggleSwitch from './ToggleSwitch';
import { API_URL } from '../services/api';
import logger from '../utils/logger';
import { colors } from '../theme/colors';

const inr = (value, decimals = 2) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const selectChevron = (strokeColor) =>
  `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

// AlgoTest chart palette: green equity curve, red drawdown, blue underlying.
const CHART_GREEN = '#00A651';
const CHART_RED = '#EF5350';
const CHART_BLUE = '#4A90D9';

// "2024-01-01" -> "01 Jan 2024", the axis/tooltip date style on AlgoTest charts.
const chartDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value ?? '')
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  padding: '8px 12px',
};
const TOOLTIP_LABEL_STYLE = { color: '#1F2937', fontWeight: 600, marginBottom: 4 };
// No colour override — recharts tints each row with its series colour.
const TOOLTIP_ITEM_STYLE = { padding: 0 };

// Faint solid grid — the "table" of light boxes behind an AlgoTest chart.
const GRID_STROKE = '#EFEFEF';

const STAT_BORDER = '#F3F3F3';  // block's outer edge — AlgoTest --primaryBlack-250
const STAT_DIVIDER = '#E3E3E3'; // row dividers — AlgoTest --primaryBlack-350, a step darker
const StatRow = ({ label, underline = false, last = false, children }) => (
  <>
    <span
      className={`px-5 py-2 min-h-[65px] flex items-center text-[14px] font-normal ${last ? '' : 'border-b'} ${underline ? 'underline decoration-dotted underline-offset-2' : ''}`}
      style={{ borderColor: STAT_DIVIDER, color: '#2A2A2A', backgroundColor: 'transparent' }}
    >
      {label}
    </span>
    <span
      className={`px-5 py-2 min-h-[65px] text-[14px] font-normal border-l ${last ? '' : 'border-b'} flex items-center justify-end whitespace-nowrap`}
      style={{ borderColor: STAT_DIVIDER, color: '#2A2A2A', backgroundColor: 'transparent' }}
    >
      {children}
    </span>
  </>
);

const StatColumn = ({ children }) => (
  <div
    className="border rounded-lg overflow-hidden grid grid-cols-[1fr_auto] content-start"
    style={{ borderColor: STAT_BORDER, backgroundColor: '#F8F8F8' }}
  >
    {children}
  </div>
);

const ColoredValue = ({ value, prefix = '₹ ', suffix = '', decimals = 2, fixed = false, className = '' }) => {
  const numValue = Number(value || 0);
  const isPositive = numValue >= 0;
  const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
  const formattedValue = numValue.toLocaleString('en-IN', {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: decimals
  });

  return (
    <span className={`${colorClass} ${className}`}>
      {prefix}{formattedValue}{suffix}
    </span>
  );
};

const PAGE_LEG_TARGET = 12; // minimum LEG rows per page; whole day-groups are never split

const BacktestResults = ({ results, onSaveStrategy, strategyId, strategyName, strategySavedInSession, onClearResults }) => {
  const [statsView, setStatsView] = useState('day'); // 'day' | 'trade'
  const [inOutSample, setInOutSample] = useState(false);
  const [slippage, setSlippage] = useState(0); // Default to 0 instead of 1
  const [slippageCalculated, setSlippageCalculated] = useState(false);
  const [slippageResults, setSlippageResults] = useState(null); // Store slippage-adjusted results
  const [refreshKey, setRefreshKey] = useState(0); // Force re-render key
  const [sortField, setSortField] = useState('Entry Date');
  const [sortDir, setSortDir] = useState('ASC');
  const [page, setPage] = useState(1);
  const [expandedLegs, setExpandedLegs] = useState(() => new Set());
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showErrorMessage, setShowErrorMessage] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState(() => new Set(['underlyingValue']));

  const toggleSeries = (key) => {
    if (!key) return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Legend label: dark when the line is on, struck through and grey when off.
  const legendLabel = (value, entry) => {
    const off = hiddenSeries.has(entry?.dataKey);
    return (
      <span
        style={{
          color: off ? '#9CA3AF' : '#374151',
          textDecoration: off ? 'line-through' : 'none',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        {value}
      </span>
    );
  };

  // Ref for auto-scrolling to results when backtest completes
  const resultsRef = useRef(null);

  // Auto-scroll to results when they become available
  useEffect(() => {
    if (results && resultsRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }, 100);
    }
  }, [results]); // Only trigger when results change

  const toggleLegExpanded = (key) => {
    setExpandedLegs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const activeResults = slippageResults ? { data: slippageResults } : results;


  let allTrades = [];
  let cumulativeData = [];
  let drawdownData = [];
  let overallExits = [];

  const monthlyStatsArray = activeResults?.data?.monthly_state_result || activeResults?.data?.monthlyStateResult || [];
  const monthlyStats = {};
  monthlyStatsArray.forEach(yearData => {
    const year = yearData.year;
    const daysMatch = yearData.days_of_Max_Drawdown?.match(/^(\d+)/);
    const daysNum = daysMatch ? daysMatch[1] : null;
    const dateMatch = yearData.days_of_Max_Drawdown?.match(/\[(.*?) to (.*?)\]/);
    const mddStart = dateMatch ? dateMatch[1] : null;
    const mddEnd = dateMatch ? dateMatch[2] : null;

    monthlyStats[year] = {
      Jan: yearData.january ? parseFloat(yearData.january) : null,
      Feb: yearData.february ? parseFloat(yearData.february) : null,
      Mar: yearData.march ? parseFloat(yearData.march) : null,
      Apr: yearData.april ? parseFloat(yearData.april) : null,
      May: yearData.may ? parseFloat(yearData.may) : null,
      Jun: yearData.june ? parseFloat(yearData.june) : null,
      Jul: yearData.july ? parseFloat(yearData.july) : null,
      Aug: yearData.august ? parseFloat(yearData.august) : null,
      Sep: yearData.september ? parseFloat(yearData.september) : null,
      Oct: yearData.october ? parseFloat(yearData.october) : null,
      Nov: yearData.november ? parseFloat(yearData.november) : null,
      Dec: yearData.december ? parseFloat(yearData.december) : null,
      total: yearData.total ? parseFloat(yearData.total) : 0,
      max_drawdown: yearData.max_Drawdown ? parseFloat(yearData.max_Drawdown) : null,
      days_for_mdd: daysNum,
      mdd_start: mddStart,
      mdd_end: mddEnd,
      r_mdd: yearData.yearly_Return_per_MaxDD ? parseFloat(yearData.yearly_Return_per_MaxDD) : null
    };
  });

  const tradeResults = activeResults?.data?.trade_results
    || activeResults?.data?.tradeResults
    || activeResults?.data?.trades
    || activeResults?.data?.data
    || (Array.isArray(activeResults?.data) ? activeResults.data : []);
  
  
  if (tradeResults.length > 0) {
    const firstTrade = tradeResults[0];
    if (firstTrade.legs && firstTrade.legs.length > 0) {
      firstTrade.legs.forEach((leg, idx) => {
      });
    }
  }
  
  // A leg that never entered has no P/L to report, whatever the backend echoes
  // back on it — otherwise an untriggered leg drags the day's total (and the
  // equity curve) with a number that was never traded.
  const legPnl = (leg) => (leg && leg.entry_datetime ? (leg.pnl || 0) : 0);

  const hasEntered = (leg) => Boolean(leg && leg.entry_datetime);

  if (tradeResults.length > 0) {
    tradeResults.forEach((record) => {
      (record.legs || []).forEach((leg) => {
        if (!hasEntered(leg)) return;
        allTrades.push({ ...leg, pnl: legPnl(leg), trade_date: record.trade_date });
      });
    });
    let cumPnl = 0;
    let peak = 0;
    tradeResults.forEach((record) => {
      const dayPnl = (record.legs || []).reduce((s, l) => s + legPnl(l), 0);
      cumPnl += dayPnl;
      if (cumPnl > peak) peak = cumPnl;
      // Read the underlying off the first leg that actually TRADED. Taking
      // legs[0] blindly meant a day whose first leg never entered reported a
      // null underlying, which punched a hole in the blue series.
      const pricedLeg = (record.legs || []).find((l) => l.underlying_entry_price != null);
      cumulativeData.push({ date: record.trade_date, cumulativePnl: Math.round(cumPnl * 100) / 100, underlyingValue: pricedLeg?.underlying_entry_price ?? null });
      drawdownData.push({ date: record.trade_date, drawdown: Math.round((cumPnl - peak) * 100) / 100 });
    });
  }

  const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
  const r2    = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const summaryReports      = activeResults?.data?.summary_report_result || activeResults?.data?.summaryreportResult || [];
  const daywiseSummaryRaw   = summaryReports.find(r => r.reportType?.toLowerCase().includes('day'))?.summaryReport   || {};
  const tradewiseSummaryRaw = summaryReports.find(r => r.reportType?.toLowerCase().includes('trade'))?.summaryReport || {};

  const mapBackendSummary = (raw, isDay) => ({
    overall_profit:          toNum(raw.OverallProfit),
    no_of_trades:            toInt(isDay ? raw.NumberOfDays      : raw.NumberOfTrades),
    avg_profit_per_trade:    toNum(isDay ? raw.AvgProfitPerDays  : raw.AvgProfitPerTrade),
    win_percentage:          toNum(raw.WinPer),
    loss_percentage:         toNum(raw.LossPer),
    avg_loss_losing_trades:  toNum(isDay ? raw.AvgLossOnLossingDays   : raw.AvgLossOnLossingTrade),
    avg_profit_winning_trades: toNum(isDay ? raw.AvgProfitOnWinningDays : raw.AvgProfitOnWinningTrade),
    max_profit_single_trade: toNum(isDay ? raw.MaxProfitInSingleDays  : raw.MaxProfitInSingleTrade),
    max_loss_single_trade:   toNum(isDay ? raw.MaxLossInSingleDays    : raw.MaxLossInSingleTrade),
    max_drawdown_trade:      toNum(raw.Max_Drawdown),
    days_in_max_drawdown:    raw['Days_of_Max_Drawdown'] !== undefined && raw['Days_of_Max_Drawdown'] !== null ? String(raw['Days_of_Max_Drawdown']) : '—',
    no_of_trades_in_max_dd:  raw['MaxTradesInDrawdown'] !== undefined && raw['MaxTradesInDrawdown'] !== null ? toInt(raw['MaxTradesInDrawdown']) : 0,
    return_to_maxdd:         toNum(raw.ReturnPerMaxDD),
    reward_to_risk:          toNum(raw.RewardToRiskRatio),
    expectancy_ratio:        toNum(raw.ExpectancyRatio),
    max_win_streak:          toInt(raw.MaxWiningStreak),
    max_loss_streak:         toInt(raw.MaxLossingStreak),
  });

  const computeStats = (trades) => {
    if (!trades.length) return mapBackendSummary({}, true);
    const profitTrades = trades.filter(t => (t.pnl || 0) > 0);
    const lossTrades   = trades.filter(t => (t.pnl || 0) < 0);
    const totalPnl     = r2(trades.reduce((s, t) => s + (t.pnl || 0), 0));
    const avgProfit    = profitTrades.length ? r2(profitTrades.reduce((s,t)=>s+t.pnl,0)/profitTrades.length) : 0;
    const avgLoss      = lossTrades.length   ? r2(Math.abs(lossTrades.reduce((s,t)=>s+t.pnl,0))/lossTrades.length) : 0;
    let cumPnl=0, peak=0, maxDd=0;
    trades.forEach(t => {
      cumPnl += (t.pnl||0);
      if (cumPnl>peak) peak=cumPnl;
      if (cumPnl-peak < maxDd) maxDd=cumPnl-peak;
    });
    let mxW=0,mxL=0,cW=0,cL=0;
    trades.forEach(t=>{
      if((t.pnl||0)>=0){cW++;cL=0;if(cW>mxW)mxW=cW;}
      else{cL++;cW=0;if(cL>mxL)mxL=cL;}
    });
    return {
      overall_profit:          totalPnl,
      no_of_trades:            trades.length,
      avg_profit_per_trade:    trades.length ? r2(totalPnl/trades.length) : 0,
      win_percentage:          trades.length ? Number(((profitTrades.length/trades.length)*100).toFixed(2)) : 0,
      loss_percentage:         trades.length ? Number(((lossTrades.length/trades.length)*100).toFixed(2)) : 0,
      avg_loss_losing_trades:  avgLoss,
      max_profit_single_trade: profitTrades.length ? Math.max(...profitTrades.map(t=>t.pnl)) : 0,
      max_loss_single_trade:   lossTrades.length   ? Math.min(...lossTrades.map(t=>t.pnl))   : 0,
      max_drawdown_trade:      r2(maxDd),
      days_in_max_drawdown:    '—',
      return_to_maxdd:         maxDd!==0 ? Number((totalPnl/Math.abs(maxDd)).toFixed(2)) : 0,
      reward_to_risk:          avgLoss!==0 ? Number((avgProfit/avgLoss).toFixed(2)) : 0,
      expectancy_ratio:        avgLoss!==0 ? Number((((profitTrades.length/(trades.length||1))*avgProfit-(lossTrades.length/(trades.length||1))*avgLoss)/avgLoss).toFixed(2)) : 0,
      max_win_streak:          mxW,
      max_loss_streak:         mxL,
      no_of_trades_in_max_dd:  0,
    };
  };

  const dayTradeList = useMemo(() => {
    const map = new Map();
    allTrades.forEach(leg => {
      const key = leg.trade_date || 'unknown';
      if (!map.has(key)) map.set(key, { trade_date: key, pnl: 0 });
      map.get(key).pnl = r2(map.get(key).pnl + (leg.pnl || 0));
    });
    return Array.from(map.values()).sort((a,b) => a.trade_date.localeCompare(b.trade_date));
  }, [allTrades]);

  const backendDayStats   = mapBackendSummary(daywiseSummaryRaw,   true);
  const backendTradeStats = mapBackendSummary(tradewiseSummaryRaw, false);

  const hasDayStats   = Object.keys(daywiseSummaryRaw).length > 0;
  const hasTradeStats = Object.keys(tradewiseSummaryRaw).length > 0;

  const daywiseSummary   = hasDayStats   ? backendDayStats   : computeStats(dayTradeList);
  const tradewiseSummary = hasTradeStats ? backendTradeStats : computeStats(allTrades);

  const activeStats = statsView === 'day' ? daywiseSummary : tradewiseSummary;
  const activeRaw = statsView === 'day' ? daywiseSummaryRaw : tradewiseSummaryRaw;
  // Full backend string with its date range, e.g. "9 [2024-01-09 to 2024-01-17]".
  // The ISO dates inside are rewritten to AlgoTest's shorter M/D/YYYY form so
  // the value fits on one line: "9 [1/9/2024 to 1/17/2024]".
  const getDaysInMaxDrawdown = () => {
    const shortenDates = (text) =>
      text.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => `${Number(m)}/${Number(d)}/${y}`);
    const possibleNames = ['Days_of_Max_Drawdown', 'DaysOfMaxDrawdown', 'days_of_max_drawdown'];
    for (const name of possibleNames) {
      const value = activeRaw[name];
      if (value !== undefined && value !== null && value !== '' && value !== 0) {
        return shortenDates(String(value));
      }
    }
    return activeStats.days_in_max_drawdown || '—';
  };

  const getTradesInMaxDrawdown = () => {
    const possibleNames = ['MaxTradesInDrawdown', 'maxTradesInDrawdown', 'max_trades_in_drawdown'];
    for (const name of possibleNames) {
      const value = activeRaw[name];
      if (value !== undefined && value !== null && value !== 0) {
        return value;
      }
    }
    return activeStats.no_of_trades_in_max_dd ?? 0;
  };



  const scopedTrades = useMemo(() => {
    if (!inOutSample) return allTrades;
    const hasSampleFlag = allTrades.some(t => t.sample === 'out' || t.is_out_of_sample !== undefined);
    if (!hasSampleFlag) return allTrades;
    return allTrades.filter(t => t.sample === 'out' || t.is_out_of_sample === true);
  }, [allTrades, inOutSample]);

  const dayGroups = useMemo(() => {
    const map = new Map();
    scopedTrades.forEach((leg) => {
      const entryDate = leg.entry_datetime ? new Date(leg.entry_datetime) : null;
      const dateKey = leg.trade_date || (entryDate ? entryDate.toISOString().split('T')[0] : 'unknown');
      if (!map.has(dateKey)) {
        map.set(dateKey, { dateKey, legs: [] });
      }
      map.get(dateKey).legs.push(leg);
    });

    return Array.from(map.values()).map((group) => {
      // A leg that never entered has no timestamp to sort on — comparing it
      // yields NaN, which left it sitting at index 0. Those legs go last.
      const legsSorted = [...group.legs].sort((a, b) => {
        const ta = a.entry_datetime ? new Date(a.entry_datetime).getTime() : Infinity;
        const tb = b.entry_datetime ? new Date(b.entry_datetime).getTime() : Infinity;
        return ta - tb;
      });
      // The day's entry is the earliest leg that ACTUALLY traded. Reading it off
      // legsSorted[0] meant one untriggered leg (e.g. MOMENTUM_NOT_TRIGGERED)
      // blanked the day's Entry Time and sorted the whole day to the top.
      const firstEntered = legsSorted.find((l) => l.entry_datetime);
      const entryDate = firstEntered ? new Date(firstEntered.entry_datetime) : null;
      const exitDates = legsSorted
        .map(l => (l.exit_datetime ? new Date(l.exit_datetime) : null))
        .filter(Boolean);
      const latestExit = exitDates.length ? new Date(Math.max(...exitDates.map(d => d.getTime()))) : null;
      const totalPnl = legsSorted.reduce((sum, l) => sum + legPnl(l), 0);

      return {
        dateKey: group.dateKey,
        entryDate,
        exitDate: latestExit,
        weekday: entryDate ? entryDate.toLocaleDateString('en-US', { weekday: 'long' }) : '',
        totalPnl,
        legs: legsSorted
      };
    });
  }, [scopedTrades]);

  const sortedGroups = useMemo(() => {
    const groups = [...dayGroups];
    const dir = sortDir === 'ASC' ? 1 : -1;
    // Fall back to the day's own date when a group has no usable timestamp —
    // `|| 0` alone dumped such a day at the very start of the report.
    const dayTime = (g) => new Date(g.dateKey).getTime() || 0;
    const entryTime = (g) => g.entryDate?.getTime() ?? dayTime(g);
    const exitTime = (g) => g.exitDate?.getTime() ?? dayTime(g);
    groups.sort((a, b) => {
      if (sortField === 'P/L') return (a.totalPnl - b.totalPnl) * dir;
      if (sortField === 'Exit Date') return (exitTime(a) - exitTime(b)) * dir;
      return (entryTime(a) - entryTime(b)) * dir;
    });
    return groups;
  }, [dayGroups, sortField, sortDir]);

  const pages = useMemo(() => {
    const result = [];
    let current = [];
    let currentLegCount = 0;
    sortedGroups.forEach((group) => {
      if (currentLegCount >= PAGE_LEG_TARGET) {
        result.push(current);
        current = [];
        currentLegCount = 0;
      }
      current.push(group);
      currentLegCount += group.legs.length;
    });
    if (current.length > 0) result.push(current);
    return result;
  }, [sortedGroups]);

  const totalPages = Math.max(1, pages.length);
  const clampedPage = Math.min(page, totalPages);
  const csvDate = (value) => {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // "09:35:00" — 24-hour, as in the reference file.
  const csvTime = (value) => {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const csvWeekday = (value) => {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
  };
  const csvFloat = (value) => {
    if (value === undefined || value === null || value === '') return '';
    const n = Number(value);
    if (Number.isNaN(n)) return '';
    return Number.isInteger(n) ? n.toFixed(1) : String(n);
  };

  const csvSide = (value) =>
    (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase() : '');

  const buildTradesCsv = () => {
    const header = ['Index', 'Entry-Date', 'Entry-Weekday', 'Entry-Time', 'Entry-Price',
                    'Entry-Delta', 'Quantity', 'Instrument-Kind', 'StrikePrice', 'Position',
                    'ExitDate', 'Exit-Weekday', 'ExitTime', 'ExitPrice', 'Exit-Delta',
                    'P/L', 'Remarks'];
    const rows = [header];

    sortedGroups.forEach((group, idx) => {
      const n = idx + 1;
      const firstLeg = group.legs?.[0] || {};
      // Day summary row: weekday / delta / instrument columns blank; the price
      // columns carry the UNDERLYING entry/exit prices.
      rows.push([
        n,
        csvDate(group.entryDate), '', csvTime(group.entryDate),
        csvFloat(firstLeg.underlying_entry_price), '', '', '', '', '',
        csvDate(group.exitDate), '', csvTime(group.exitDate),
        csvFloat(firstLeg.underlying_exit_price), '',
        csvFloat(group.totalPnl), '',
      ]);
      (group.legs || []).forEach((leg, legIdx) => {
        rows.push([
          `${n}.${legIdx + 1}`,
          csvDate(leg.entry_datetime), csvWeekday(leg.entry_datetime), csvTime(leg.entry_datetime),
          csvFloat(leg.entry_price), csvFloat(leg.entry_delta ?? leg.delta),
          // Traded size is the backend's quantity_multiplier (e.g. 20).
          leg.quantity_multiplier ?? leg.qty ?? leg.lot_size ?? '',
          (leg.option || '').toUpperCase(), csvFloat(leg.strike), csvSide(leg.position),
          csvDate(leg.exit_datetime), csvWeekday(leg.exit_datetime), csvTime(leg.exit_datetime),
          csvFloat(leg.exit_price), csvFloat(leg.exit_delta),
          csvFloat(legPnl(leg)), leg.exit_reason || leg.status || '',
        ]);
      });
    });
    const esc = (cell) => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return rows.map((r) => r.map(esc).join(',')).join('\n');
  };

  const tradesFileName = (kind = 'trades') => {
    const isSaved = strategyId && strategyId !== -999 && strategyId !== '-999';
    const name = isSaved ? String(strategyName || '').trim() : '';
    const safe = name.replace(/[\\/:*?"<>|]/g, '_');
    const today = csvDate(new Date());
    return safe ? `${kind}_${safe}_${today}.csv` : `${kind}_${today}.csv`;
  };

  const buildRawTradesCsv = () => {
    const header = ['Index', 'Trade-Date', 'Instrument', 'StrikePrice', 'Option-Type', 'Position',
                    'Quantity', 'Entry-Date', 'Entry-Time', 'Entry-Price',
                    'Exit-Date', 'Exit-Time', 'Exit-Price', 'P/L', 'Exit-Reason'];
    const rows = [header];
    let n = 0;
    sortedGroups.forEach((group) => {
      (group.legs || []).forEach((leg) => {
        n += 1;
        rows.push([
          n,
          csvDate(group.entryDate),
          leg.ticker || '',
          csvFloat(leg.strike),
          (leg.option || '').toUpperCase(),
          csvSide(leg.position),
          leg.quantity_multiplier ?? leg.qty ?? leg.lot_size ?? '',
          csvDate(leg.entry_datetime), csvTime(leg.entry_datetime), csvFloat(leg.entry_price),
          csvDate(leg.exit_datetime), csvTime(leg.exit_datetime), csvFloat(leg.exit_price),
          csvFloat(legPnl(leg)),
          leg.exit_reason || leg.status || '',
        ]);
      });
    });
    const esc = (cell) => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return rows.map((r) => r.map(esc).join(',')).join('\n');
  };

  const saveCsv = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadTradesCsv = () => saveCsv(buildRawTradesCsv(), tradesFileName('trades'));
  const downloadReportCsv = () => saveCsv(buildTradesCsv(), tradesFileName('report'));

  const pagedGroups = pages[clampedPage - 1] || [];
  const groupIndexOffset = pages.slice(0, clampedPage - 1).reduce((sum, pg) => sum + pg.length, 0);
  // "Showing X - Y trades out of Z" counts LEG rows only — day summary rows
  // are grouping furniture, not trades.
  const totalLegsAll = sortedGroups.reduce((sum, g) => sum + g.legs.length, 0);
  const legsOnPage = pagedGroups.reduce((sum, g) => sum + g.legs.length, 0);
  const legsBefore = pages.slice(0, clampedPage - 1).reduce((sum, pg) => sum + pg.reduce((s, g) => s + g.legs.length, 0), 0);


  // "9:35:00 AM" — the on-screen time style of the report table.
  const tableTime = (value) => {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const h24 = d.getHours();
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  };


  if (!results) {
    return <div className="text-center text-gray-500">No results to display</div>;
  }

  return (
    <div
      ref={resultsRef}
      key={`results-${refreshKey}`}
      className="bg-white border-t"
      style={{ borderColor: colors.settingsPanel.cardBorder }}
    >
      {showSuccessMessage && (
        <div className="fixed top-6 right-6 z-[200] animate-toast-in" style={{ pointerEvents: 'auto' }}>
          <div className="flex items-start gap-3 pl-4 pr-3 py-3 rounded-lg shadow-lg text-white text-[14px] font-medium min-w-[280px] max-w-[440px] bg-green-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
            <span className="flex-1 leading-snug">Slippage applied successfully.</span>
            <button
              type="button"
              onClick={() => setShowSuccessMessage(false)}
              className="shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-white/20 transition-colors"
              title="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification - Error Message */}
      {showErrorMessage && (
        <div className="fixed top-6 right-6 z-[200] animate-toast-in" style={{ pointerEvents: 'auto' }}>
          <div className="flex items-start gap-3 pl-4 pr-3 py-3 rounded-lg shadow-lg text-white text-[14px] font-medium min-w-[280px] max-w-[440px] bg-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M12 11.5v4.5" /></svg>
            <span className="flex-1 leading-snug">Please re-run the backtest.</span>
            <button
              type="button"
              onClick={() => setShowErrorMessage(false)}
              className="shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-white/20 transition-colors"
              title="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      
      {/* SLIPPAGE SECTION */}
      <div className="mx-0">
        <div className="px-8 pt-8 pb-4 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-normal" style={{ color: colors.settingsPanel.label }}>Slippage:</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={slippage === 0 ? '' : slippage}
                  onChange={(e) => {
                    setSlippage(parseFloat(e.target.value) || 0);
                    setSlippageCalculated(false);
                  }}
                  className="w-24 px-3 py-2 pr-8 text-[13px] border rounded-md bg-white font-normal outline-none transition-all"
                  style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                  placeholder="0"
                  step="0.1"
                  min="0"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
              </div>
            </div>
            
            <button 
              onClick={async () => {
                
                try {
                  const requestPayload = {
                    strategy_id: strategyId || -999,  // Use strategyId if saved, otherwise -999 for unsaved
                    slippage_percent: slippage  // Changed from Slippage_percent to slippage_percent
                  };


                  const response = await fetch(`${API_URL}/apply-slippage`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestPayload)
                  });


                  if (!response.ok) {
                    let errorMessage = 'Failed to apply slippage';
                    try {
                      const errorData = await response.json();
                      errorMessage = errorData.message || errorData.error || errorData.detail || errorMessage;
                      logger.error('Error response:', errorData);
                    } catch (e) {
                      const errorText = await response.text();
                      errorMessage = errorText || errorMessage;
                      logger.error('Error response text:', errorText);
                    }
                    throw new Error(errorMessage);
                  }

                  const result = await response.json();
                  
                  if (result.success && result.data) {
                    
                    setSlippageResults(result.data);
                    setSlippageCalculated(true);
                    setRefreshKey(prev => prev + 1); // Force component re-render
                    
                    
                    setShowSuccessMessage(true);
                    setTimeout(() => setShowSuccessMessage(false), 3000); // Hide after 3 seconds
                  } else {
                    throw new Error('Invalid response format');
                  }
                  
                } catch (error) {
                  logger.error('Error applying slippage:', error);
                  
                  setShowErrorMessage(true);
                  setTimeout(() => setShowErrorMessage(false), 3000); // Hide after 3 seconds
                  
                  setSlippageCalculated(false);
                  setSlippageResults(null);
                }
              }}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg active:scale-95 transition-all shadow-sm hover:shadow-md"
              style={{ backgroundColor: colors.legBuilder.addLegBg }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
            >
              Calculate
            </button>
            
          </div>
        </div>
        
       
        </div>
      </div>

      {/* 1. MONTHLY STATS TABLE */}
      <div className="mx-0">
        <MonthlyStatsTable monthlyStats={monthlyStats} />
      </div>

      {/* 2. CUMULATIVE PnL CHART */}
      <div className="mx-0">
        <div className="px-8 py-8">
        {cumulativeData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulativeData} margin={{ top: 5, right: 24, left: 16, bottom: 5 }}>
                <CartesianGrid stroke={GRID_STROKE} />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={chartDate}
                  minTickGap={40}
                />
                <YAxis
                  yAxisId="pnl"
                  width={78}
                  stroke="#9ca3af"
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={(value) => Number(value).toLocaleString('en-IN')}
                  label={{ value: 'Cumulative PnL', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#9ca3af', textAnchor: 'middle' } }}
                />
                <YAxis
                  yAxisId="underlying"
                  orientation="right"
                  width={82}
                  stroke="#9ca3af"
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={(value) => Number(value).toLocaleString('en-IN')}
                  label={{ value: 'Underlying Value', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#9ca3af', textAnchor: 'middle' } }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={false}
                  separator=": "
                  labelFormatter={chartDate}
                  formatter={(value, name) => [inr(value, 0), name]}
                />
                <Legend
                  verticalAlign="top"
                  align="center"
                  iconType="rect"
                  onClick={(e) => toggleSeries(e?.dataKey)}
                  formatter={legendLabel}
                  wrapperStyle={{ fontSize: 12, paddingBottom: 8, cursor: 'pointer' }}
                />
                <Line
                  yAxisId="pnl"
                  type="linear"
                  dataKey="cumulativePnl"
                  stroke={CHART_GREEN}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: CHART_GREEN }}
                  name="Cumulative PnL"
                  hide={hiddenSeries.has('cumulativePnl')}
                />
                <Line
                  yAxisId="underlying"
                  type="linear"
                  dataKey="underlyingValue"
                  stroke={CHART_BLUE}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: CHART_BLUE }}
                  name="Underlying Value"
                  connectNulls
                  hide={hiddenSeries.has('underlyingValue')}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (

          <p className="text-gray-500">No cumulative data available</p>
        )}
        </div>
      </div>

      {/* 3. DRAWDOWN CHART */}
      <div className="mx-0">
        <div className="px-8 py-8">
        {drawdownData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={drawdownData} margin={{ top: 5, right: 24, left: 16, bottom: 5 }}>
                <CartesianGrid stroke={GRID_STROKE} />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={chartDate}
                  minTickGap={40}
                />
                <YAxis
                  width={78}
                  stroke="#9ca3af"
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={(value) => Number(value).toLocaleString('en-IN')}
                  label={{ value: 'Drawdown', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#9ca3af', textAnchor: 'middle' } }}
                />
                <YAxis
                  yAxisId="spacer"
                  orientation="right"
                  width={82}
                  tick={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={false}
                  separator=""
                  labelFormatter={chartDate}
                  formatter={(value) => [inr(value, 0), null]}
                />
                <Line
                  type="linear"
                  dataKey="drawdown"
                  stroke={CHART_RED}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: CHART_RED }}
                  name="Drawdown"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-500">No drawdown data available</p>
        )}
        </div>
      </div>

      {/* 4. OVERALL STATS GRID */}
      <div className="mx-0">
        <div className="px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-[13px]" style={{ color: colors.settingsPanel.label, fontWeight: statsView === 'day' ? 600 : 400, opacity: statsView === 'day' ? 1 : 0.55 }}>Day wise</span>
            <ToggleSwitch
              id="stats-view-toggle"
              checked={statsView === 'trade'}
              onChange={() => setStatsView(prev => (prev === 'day' ? 'trade' : 'day'))}
            />
            <span className="text-[13px]" style={{ color: colors.settingsPanel.label, fontWeight: statsView === 'trade' ? 600 : 400, opacity: statsView === 'trade' ? 1 : 0.55 }}>Trade wise</span>
          </div>
        </div>   

        {/* AlgoTest column order: profitability | per-trade extremes | ratios & streaks */}
        <div className="stats-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <StatColumn>
            <StatRow label="Overall Profit">
              <ColoredValue value={activeStats.overall_profit} prefix="₹ " decimals={2} />
            </StatRow>

            <StatRow label={statsView === 'day' ? 'No. of Days' : 'No. of Trades'}>{activeStats.no_of_trades || 0}</StatRow>

            <StatRow label={statsView === 'day' ? 'Average Profit per Day' : 'Average Profit per Trade'}>
              <ColoredValue value={activeStats.avg_profit_per_trade} prefix="₹ " decimals={2} />
            </StatRow>

            <StatRow label="Win %">{activeStats.win_percentage || 0}</StatRow>

            <StatRow label="Loss %">{activeStats.loss_percentage || 0}</StatRow>

            <StatRow last label={statsView === 'day' ? 'Average Profit on Winning Days' : 'Average Profit on Winning Trades'}>
              <ColoredValue value={activeStats.avg_profit_winning_trades} prefix="₹ " decimals={2} />
            </StatRow>
          </StatColumn>

          <StatColumn>
            <StatRow label={statsView === 'day' ? 'Average Loss on Losing Days' : 'Average Loss on Losing Trades'}>
              <ColoredValue value={-Math.abs(activeStats.avg_loss_losing_trades)} prefix="₹ " decimals={2} />
            </StatRow>

            <StatRow label={statsView === 'day' ? 'Max Profit in Single Day' : 'Max Profit in Single Trade'}>
              <ColoredValue value={activeStats.max_profit_single_trade} prefix="₹ " decimals={2} />
            </StatRow>

            <StatRow label={statsView === 'day' ? 'Max Loss in Single Day' : 'Max Loss in Single Trade'}>
              <ColoredValue value={activeStats.max_loss_single_trade} prefix="₹ " decimals={2} />
            </StatRow>

            <StatRow label="Max Drawdown">
              <ColoredValue value={activeStats.max_drawdown_trade} prefix="₹ " decimals={2} />
            </StatRow>

            <StatRow last label="Duration of Max Drawdown">
              <span className="text-[13px]">{getDaysInMaxDrawdown()}</span>
            </StatRow>
          </StatColumn>

          <StatColumn>
            <StatRow  label="Return/MaxDD">{activeStats.return_to_maxdd || 0}</StatRow>

            <StatRow label="Reward to Risk Ratio">{activeStats.reward_to_risk || 0}</StatRow>

            <StatRow  label="Expectancy Ratio">{activeStats.expectancy_ratio || 0}</StatRow>

            <StatRow label={statsView === 'day' ? 'Max Win Streak (days)' : 'Max Win Streak (trades)'}>{activeStats.max_win_streak || 0}</StatRow>

            <StatRow label={statsView === 'day' ? 'Max Losing Streak (days)' : 'Max Losing Streak (trades)'}>{activeStats.max_loss_streak || 0}</StatRow>

            <StatRow last  label="Max trades in any drawdown">{getTradesInMaxDrawdown()}</StatRow>
          </StatColumn>
        </div>

        {/* Download trades — outlined navy at rest, filled navy on hover (AlgoTest) */}
        <div className="flex justify-end mt-6">
          <button
            onClick={downloadTradesCsv}
            className="flex items-center gap-2 px-4 py-2 rounded-md border text-[13px] font-medium transition-colors"
            style={{ borderColor: colors.legBuilder.addLegBg, color: colors.legBuilder.addLegBg, backgroundColor: '#FFFFFF' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.color = colors.legBuilder.addLegBg; }}
          >
            <Download size={15} />
            Download trades
          </button>
        </div>
        </div>
      </div>

            {/* 6. FULL REPORT - TRADES TABLE */}
      <div className="mx-0">
        <div className="px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-[24px] font-medium" style={{ color: '#2A2A2A' }}>Full Report</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="text-[13px] font-normal mr-1" style={{ color: colors.settingsPanel.label }}>Sort By :</span>
            {/* appearance-none + the shared chevron: the native arrow sat on the
                box edge, half outside it. Exit Date is gone — Entry Date and P/L
                are the only sorts offered, as on AlgoTest. */}
            <select
              value={sortField}
              onChange={(e) => { setSortField(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-1.5 border rounded-md text-[13px] font-normal outline-none cursor-pointer bg-white"
              style={{
                borderColor: colors.settingsPanel.fieldBorder,
                color: colors.settingsPanel.inputValue,
                backgroundImage: selectChevron('%234B5563'),
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.6rem center',
              }}
            >
              <option>Entry Date</option>
              <option>P/L</option>
            </select>
            <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: colors.settingsPanel.fieldBorder }}>
              <button
                onClick={() => { setSortDir('ASC'); setPage(1); }}
                className="px-3.5 py-1.5 text-[13px] transition-colors"
                style={sortDir === 'ASC'
                  ? { backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, fontWeight: 500 }
                  : { backgroundColor: '#FFFFFF', color: colors.settingsPanel.inactiveText }}
              >
                Asc
              </button>
              <button
                onClick={() => { setSortDir('DESC'); setPage(1); }}
                className="px-3.5 py-1.5 text-[13px] border-l transition-colors"
                style={sortDir === 'DESC'
                  ? { backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, fontWeight: 500, borderColor: colors.settingsPanel.fieldBorder }
                  : { backgroundColor: '#FFFFFF', color: colors.settingsPanel.inactiveText, borderColor: colors.settingsPanel.fieldBorder }}
              >
                Desc
              </button>
            </div>
            <span className="text-[13px] ml-2" style={{ color: '#374151' }}>
              Showing <b>{totalLegsAll === 0 ? 0 : legsBefore + 1} - {legsBefore + legsOnPage}</b> trades out of <b>{totalLegsAll}</b>
            </span>
          </div>
        </div>

        {/* Trades Table — AlgoTest 13-column layout, centered cells, horizontal rules only */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: '#E5E7EB', backgroundColor: '#E3E3E3' }}>
                {['Index', 'Entry Date', 'Entry Time', 'Exit Date', 'Exit Time', 'Type',
                  'Strike', 'B/S', 'Qty', 'Entry Price', 'Exit Price', 'P/L'].map((h) => (
                  <th key={h} className="px-1 py-1 text-center text-[14px] font-bold whitespace-nowrap border-2" style={{ color: '#2A2A2A', borderColor: '#D4D4D8' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedGroups.length > 0 ? (
                  pagedGroups.map((group, gIndex) => {
                  const rowIndex = groupIndexOffset + gIndex + 1;
                  const dateStr = group.entryDate ? group.entryDate.toISOString().split('T')[0] : group.dateKey;
                  const dayExitStr = group.exitDate ? group.exitDate.toISOString().split('T')[0] : dateStr;

                  return (
                    <Fragment key={group.dateKey}>
                      {/* Day summary row: dates/times + the day's P/L, instrument columns blank */}
                      <tr className="border-b" style={{ borderColor: '#E5E7EB' }}>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A', backgroundColor: '#E3E3E3' }}>{rowIndex}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{dateStr}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{tableTime(group.entryDate)}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{dayExitStr}</td>
                        <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{tableTime(group.exitDate)}</td>
                        <td className="p-1 text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                        <td className="p-1 text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                        <td className="p-1 text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                        <td className="p-1 text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                        <td className="p-1 text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                        <td className="p-1 text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}></td>
                        <td className="p-1 text-[14px] font-medium text-center border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>
                          <ColoredValue value={group.totalPnl} prefix="" suffix="" decimals={2} fixed />
                        </td>
                      </tr>

                      {/* Leg detail rows */}
                      {group.legs.map((leg, legIdx) => {
                        const pnl = legPnl(leg);
                        const isProfit = pnl >= 0;
                        const entryDate = leg.entry_datetime ? new Date(leg.entry_datetime) : null;
                        const entryDateStr = entryDate ? entryDate.toISOString().split('T')[0] : '---';
                        const entryTimeStr = entryDate ? tableTime(entryDate) : '---';
                        const exitDate = leg.exit_datetime ? new Date(leg.exit_datetime) : null;
                        const exitDateStr = exitDate ? exitDate.toISOString().split('T')[0] : '---';
                        const exitTimeStr = exitDate ? tableTime(exitDate) : '---';
                        const legKey = `${group.dateKey}-${legIdx}`;
                        const isExpanded = expandedLegs.has(legKey);

                        return (
                          <Fragment key={legKey}>
                            {/* Leg row — click still expands the raw backend fields below */}
                            <tr
                              className="border-b hover:bg-gray-50 cursor-pointer" style={{ borderColor: '#E5E7EB' }}
                              onClick={() => toggleLegExpanded(legKey)}
                              title="Click to see every raw field returned by the backend for this leg"
                            >
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A', backgroundColor: '#E3E3E3' }}>{rowIndex}.{legIdx + 1}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{entryDateStr}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{entryTimeStr}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{exitDateStr}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{exitTimeStr}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.option?.toUpperCase()}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.strike != null ? Math.round(Number(leg.strike)) : ''}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.position ? String(leg.position).charAt(0).toUpperCase() + String(leg.position).slice(1).toLowerCase() : ''}</td>
                              {/* A leg that never triggered carries no size — dashed like its other empty cells, not "1". */}
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.quantity_multiplier ?? leg.qty ?? leg.lot_size ?? '---'}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.entry_price?.toFixed(2)}</td>
                              <td className="p-1 text-center text-[14px] font-medium border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>{leg.exit_price?.toFixed(2)}</td>
                              <td className="p-1 text-[14px] font-medium text-center border-2" style={{ borderColor: '#D4D4D8', color: '#2A2A2A' }}>
                                <ColoredValue value={pnl} prefix="" suffix="" decimals={2} fixed />
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="border-b" style={{ borderColor: '#f0f0f0', backgroundColor: '#F7FAFC' }}>
                                <td colSpan={12} className="px-6 py-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-[11px]">
                                    <div><span className="text-gray-500">Ticker: </span><span className="text-gray-800 font-medium">{leg.ticker || '---'}</span></div>
                                    <div><span className="text-gray-500">Moneyness: </span><span className="text-gray-800 font-medium">{leg.moneyness || '---'}</span></div>
                                    <div><span className="text-gray-500">Distance from Underlying: </span><span className="text-gray-800 font-medium">{leg.distance_from_underlying?.toFixed?.(2) ?? '---'}</span></div>
                                    <div><span className="text-gray-500">Underlying Entry Price: </span><span className="text-gray-800 font-medium">{leg.underlying_entry_price?.toFixed?.(2) ?? '---'}</span></div>
                                    <div><span className="text-gray-500">Status: </span><span className="text-gray-800 font-medium">{leg.status || '---'}</span></div>
                                    <div><span className="text-gray-500">Target Price: </span><span className="text-gray-800 font-medium">{leg.target_price?.toFixed?.(2) ?? '---'}</span></div>
                                    <div><span className="text-gray-500">Stoploss Price: </span><span className="text-gray-800 font-medium">{leg.stoploss_price?.toFixed?.(2) ?? '---'}</span></div>
                                    <div><span className="text-gray-500">Is Reentry: </span><span className="text-gray-800 font-medium">{leg.is_reentry ? 'Yes' : 'No'}</span></div>
                                    <div><span className="text-gray-500">Reentry Mode: </span><span className="text-gray-800 font-medium">{leg.reentry_mode || '---'}</span></div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="12" className="px-3 py-4 text-center text-gray-500">
                    No trades available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer — AlgoTest layout: Download Report bottom-left, square page controls bottom-right */}
        {sortedGroups.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={downloadReportCsv}
                className="px-4 py-2 rounded-md border text-[13px] font-medium transition-colors"
                style={{ borderColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeBg, backgroundColor: '#FFFFFF' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.settingsPanel.activeBg; e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.color = colors.settingsPanel.activeBg; }}
              >
                Download Report
              </button>

              <button
                onClick={() => {
                  if (onClearResults) {
                    onClearResults();
                  }
                }}
                className="px-4 py-2 rounded-md border text-[13px] font-medium text-red-600 border-red-400 bg-white hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
                title="Close and clear this report"
              >
                Close Report
              </button>
            </div>

            <ReportPager page={clampedPage} totalPages={totalPages} onChange={setPage} />
          </div>
        )}

        </div>
      </div>
    </div>
  );
}

export default React.memo(BacktestResults);
