import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronsLeft,
  Upload,
  Edit2,
  Trash2,
  ChevronDown,
  Play,
  Clock,
  FileEdit,
  Copy,
  Check,
  X,
  FileDown,
  Eye,
} from 'lucide-react';
import { API_URL } from '../services/api';
import PortfolioBacktestResults from './PortfolioBacktestResults';
import ConfirmDialog from './ConfirmDialog';
import { buildPortfolioExport, definitionFromBackendStrategy } from '../utils/algtstPortfolioExport';
import logger from '../utils/logger';
import StrategyRow from './StrategyRow';
import ToggleSwitch, { ToggleSwitchStyles } from './ToggleSwitch';
import OverallRiskDialog from './OverallRiskDialog';
import { colors } from '../theme/colors';
import { TIME_WARNING_DELAY_MS } from '../utils/timeRules';
import DateSegmentInput from './DateSegmentInput';
import { buildSavePortfolioPayload, toRiskFields } from '../services/portfolioApi';
import { riskFromRow, fetchStrategies as fetchLibraryStrategies } from '../services/libraryApi';
import { usePortfolio } from '../context/PortfolioContext';
import { useSavedStrategies } from '../context/SavedStrategiesContext';

const WEEKDAYS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'Su' },
];

const ALL_WEEKDAYS_ON = WEEKDAYS.reduce((acc, d) => ({ ...acc, [d.key]: true }), {});

// The period tabs in Overall Portfolio Setting. Used to validate the saved
// value before it is trusted as state.
const PERIOD_TABS = ['DTE', 'Weekdays', 'Budget Days'];

// Short codes are what the backend stores (period_selection.weekdays_selected:
// ["M","T","W"]); the UI works in { mon: true, ... }.
const WEEKDAY_BY_CODE = WEEKDAYS.reduce((acc, d) => ({ ...acc, [d.label]: d.key }), {});

const firstNumber = (candidates, fallback) => {
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const resolveWeekdays = (strategy) => {
  const stored = strategy?.weekdays;

  if (
    stored && typeof stored === 'object' && !Array.isArray(stored)
    && WEEKDAYS.some((d) => d.key in stored)
  ) {
    return WEEKDAYS.reduce((acc, d) => ({ ...acc, [d.key]: Boolean(stored[d.key]) }), {});
  }
  if (strategy && typeof strategy === 'object'
      && 'period_selection' in strategy && strategy.period_selection === null) {
    return WEEKDAYS.reduce((acc, d) => ({ ...acc, [d.key]: false }), {});
  }

  const codes = strategy?.period_selection?.weekdays_selected ?? strategy?.weekdays_selected;
  if (Array.isArray(codes)) {
    const chosen = new Set(codes.map((c) => WEEKDAY_BY_CODE[c]).filter(Boolean));
    return WEEKDAYS.reduce((acc, d) => ({ ...acc, [d.key]: chosen.has(d.key) }), {});
  }

  return { ...ALL_WEEKDAYS_ON };
};

const SUPPORTED_INDICES = ['SENSEX'];

/**
 * The backend strategy_id behind a configuration row.
 *
 * Rows carry either the numeric id or a "temp-<ms>-<name>" placeholder, so the
 * digits are dug out. Shared on purpose: the run-backtest payload and the
 * result filter MUST agree on which row is which strategy, and two copies of
 * this rule would be two chances to disagree.
 */
const rowStrategyId = (row) => {
  if (typeof row?.id === 'number') return row.id;
  if (typeof row?.id === 'string') {
    const m = row.id.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  return null;
};

const toInputDate = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const PillDropdown = ({ value, options, onChange, className = '', textColor = '#3a3a3a' }) => (
  <div className={`relative ${className}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap transition-colors"
      style={{ borderColor: '#e3e3e3', color: textColor }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
    <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
  </div>
);

const QtyMultiplierDropdown = ({ value, onChange, onApply, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('1');
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const match = /^(\d+)x?$/.exec(String(value));
      setInputValue(match ? match[1] : '1');
    }
  }, [isOpen, value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApply = () => {
    const multiplier = parseInt(inputValue) || 1;
    onChange(String(multiplier));
    onApply?.(multiplier);
    setIsOpen(false);
  };

  const displayText = 'Qty Multiplier';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap text-left transition-colors"
        style={{ borderColor: '#e3e3e3' }}
      >
        {displayText}
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border rounded-md shadow-lg z-50 p-3 w-48" style={{ borderColor: '#e3e3e3' }}>
          <label className="block text-xs text-[#8e8e8e] mb-2">Quantity Multiplier</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min="1"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleApply();
                  }
                }}
                className="w-full px-3 py-1.5 pr-7 border rounded text-[13px] text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-blue-200"
                style={{ borderColor: '#e3e3e3' }}
                autoFocus
              />
              <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-white text-[13px] font-medium rounded transition-colors whitespace-nowrap"
              style={{ backgroundColor: '#0B619B' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0064AB')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B619B')}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SlippageDropdown = ({ value, onChange, onApply, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('0');
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const match = /^(-?\d+(\.\d+)?)%$/.exec(value);
      setInputValue(match ? match[1] : '0');
    }
  }, [isOpen, value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApply = () => {
    const slippage = parseFloat(inputValue) || 0;
    onChange(`${slippage}%`);
    onApply?.(slippage);
    setIsOpen(false);
  };

  const displayText = 'Slippage';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap text-left transition-colors"
        style={{ borderColor: '#e3e3e3' }}
      >
        {displayText}
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border rounded-md shadow-lg z-50 p-3 w-48" style={{ borderColor: '#e3e3e3' }}>
          <label className="block text-xs text-[#8e8e8e] mb-2">Slippage (%)</label>
          <div className="flex flex-row items-center gap-2">
            <div className="relative flex-1 flex flex-row items-center">
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleApply();
                  }
                }}
                className="w-full pl-3 pr-8 py-1.5 border rounded text-[13px] text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-blue-200"
                style={{ borderColor: '#e3e3e3' }}
                autoFocus
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">%</span>
            </div>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-white text-[13px] font-medium rounded transition-colors whitespace-nowrap"
              style={{ backgroundColor: '#0B619B' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0064AB')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B619B')}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const DTEDropdown = ({ onApply, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  // Multi-select, like the per-row DTE control: a portfolio can be run across
  // several days to expiry at once, so ticking 2 must not untick 0.
  const [selectedDTEs, setSelectedDTEs] = useState([0]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDTE = (d) => {
    setSelectedDTEs((prev) =>
      (prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d].sort((a, b) => a - b)));
  };

  const handleApply = () => {
    onApply?.([...selectedDTEs]);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap text-left transition-colors"
        style={{ borderColor: '#e3e3e3' }}
      >
        DTE
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border rounded-md shadow-lg z-50 p-3 w-44" style={{ borderColor: '#e3e3e3' }}>
          <label className="block text-xs text-[#8e8e8e] mb-2">Days to expiry</label>
          {/* Apply sits under the list now that options are one per line. */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              {/* One option per line, stacked vertically. */}
              <div className="flex flex-col gap-1.5">
                {DTE_OPTIONS.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDTEs.includes(d)}
                      onChange={() => toggleDTE(d)}
                      className="w-4 h-4 rounded cursor-pointer"
                      style={{ accentColor: '#0782DA' }}
                    />
                    <span className="text-[13px] text-[#3a3a3a]">{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleApply}
              className="w-full px-4 py-1.5 text-white text-[13px] font-medium rounded transition-colors whitespace-nowrap"
              style={{ backgroundColor: '#0B619B' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0064AB')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B619B')}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const WeekdaysDropdown = ({ onApply, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState({ ...ALL_WEEKDAYS_ON });
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDay = (key) => {
    setSelectedDays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApply = () => {
    onApply?.(selectedDays);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap text-left transition-colors"
        style={{ borderColor: '#e3e3e3' }}
      >
        Weekdays
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border rounded-md shadow-lg z-50 p-3 w-max" style={{ borderColor: '#e3e3e3' }}>
          <label className="block text-xs text-[#8e8e8e] mb-2">Weekdays</label>
          <div className="flex items-center gap-2">
            {WEEKDAYS.map((d) => {
              const active = selectedDays[d.key];
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  className="w-9 h-9 rounded-full text-xs font-medium border transition-colors"
                  style={
                    active
                      ? { backgroundColor: '#ECF6FF', borderColor: '#0782DA', color: '#0782DA' }
                      : { backgroundColor: '#FFFFFF', borderColor: '#e3e3e3', color: '#9CA3AF' }
                  }
                >
                  {d.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-white text-[13px] font-medium rounded transition-colors whitespace-nowrap ml-1"
              style={{ backgroundColor: '#0B619B' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0064AB')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B619B')}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const BudgetDaysDropdown = ({ onApply, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const dropdownRef = useRef(null);

  const budgetDaysOptions = [
    { key: 'budgetDay', label: 'Budget Day' },
    { key: '1dayBefore', label: '1 day Before' },
    { key: '2daysBefore', label: '2 days before' },
    { key: '3daysBefore', label: '3 days before' },
    { key: '4daysBefore', label: '4 days before' },
    { key: '5daysBefore', label: '5 days before' },
  ];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleKey = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleApply = () => {
    onApply?.(selected);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap text-left transition-colors"
        style={{ borderColor: '#e3e3e3' }}
      >
        Budget Days
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border rounded-md shadow-lg z-50 p-3 w-56" style={{ borderColor: '#e3e3e3' }}>
          <label className="block text-xs text-[#8e8e8e] mb-2">Budget Days</label>
          <div className="max-h-48 overflow-y-auto mb-2">
            {budgetDaysOptions.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-2 px-1 py-1.5 hover:bg-[#f7f7f7] cursor-pointer rounded"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.key)}
                  onChange={() => toggleKey(opt.key)}
                  className="w-4 h-4 rounded cursor-pointer"
                  style={{ accentColor: '#0782DA' }}
                />
                <span className="text-[13px] text-[#3a3a3a]">{opt.label}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="w-full px-4 py-1.5 text-white text-[13px] font-medium rounded transition-colors"
            style={{ backgroundColor: '#0B619B' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0064AB')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B619B')}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

const BudgetDaysMultiSelect = ({ selectedBudgetDays = [], onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const budgetDaysOptions = [
    { key: 'budgetDay', label: 'Budget Day' },
    { key: '1dayBefore', label: '1 day Before' },
    { key: '2daysBefore', label: '2 days before' },
    { key: '3daysBefore', label: '3 days before' },
    { key: '4daysBefore', label: '4 days before' },
    { key: '5daysBefore', label: '5 days before' },
  ];

  const allSelected = selectedBudgetDays.length === budgetDaysOptions.length;

  const toggleBudgetDay = (key) => {
    if (selectedBudgetDays.includes(key)) {
      onChange(selectedBudgetDays.filter((d) => d !== key));
    } else {
      onChange([...selectedBudgetDays, key]);
    }
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(budgetDaysOptions.map(opt => opt.key));
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayText = selectedBudgetDays.length === 0
    ? 'Select Budget Days'
    : `${selectedBudgetDays.length} Selected`;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap text-left transition-colors"
        style={{ borderColor: '#e3e3e3' }}
      >
        {displayText}
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto" style={{ borderColor: '#e3e3e3' }}>
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-[#f7f7f7] cursor-pointer border-b" style={{ borderColor: '#f3f3f3' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded cursor-pointer"
              style={{ accentColor: '#0782DA' }}
            />
            <span className="text-[13px] text-[#3a3a3a]">Select All</span>
          </label>

          {budgetDaysOptions.map((opt) => (
            <label
              key={opt.key}
              className="flex items-center gap-2 px-3 py-2 hover:bg-[#f7f7f7] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedBudgetDays.includes(opt.key)}
                onChange={() => toggleBudgetDay(opt.key)}
                className="w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: '#0782DA' }}
              />
              <span className="text-[13px] text-[#3a3a3a]">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const DTE_OPTIONS = Array.from({ length: 7 }, (_, i) => i); // 0-6 days to expiry

const DTEMultiSelect = ({ selectedDTEs = [0], onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const allSelected = selectedDTEs.length === DTE_OPTIONS.length;

  const toggleDTE = (d) => {
    if (selectedDTEs.includes(d)) {
      onChange(selectedDTEs.filter((v) => v !== d));
    } else {
      onChange([...selectedDTEs, d].sort((a, b) => a - b));
    }
  };

  const toggleSelectAll = () => {
    onChange(allSelected ? [] : DTE_OPTIONS.slice());
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayText = selectedDTEs.length === 0 ? 'Select DTE' : `${selectedDTEs.length} Selected`;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer whitespace-nowrap text-left transition-colors"
        style={{ borderColor: '#e3e3e3' }}
      >
        {displayText}
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-white border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto" style={{ borderColor: '#e3e3e3' }}>
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-[#f7f7f7] cursor-pointer border-b" style={{ borderColor: '#f3f3f3' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded cursor-pointer"
              style={{ accentColor: '#0782DA' }}
            />
            <span className="text-[13px] text-[#3a3a3a]">Select All</span>
          </label>

          {DTE_OPTIONS.map((d) => (
            <label
              key={d}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f7f7f7] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedDTEs.includes(d)}
                onChange={() => toggleDTE(d)}
                className="w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: '#0782DA' }}
              />
              <span className="text-[13px] text-[#3a3a3a]">{d}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};


const PF_ACTION_BTN =
  'inline-flex items-center gap-2 h-[30px] px-3 text-[12px] font-normal rounded border bg-white transition-colors';

const Portfolio = ({
  portfolioId,
  portfolioName: initialName = 'My Portfolio',
  strategies: strategiesProp,
  onBack,
  onDeletePortfolio,
  onSaveAsNew,
  onUpdatePortfolio,
  onRunBacktest,
  onRecentBacktests,
  creditsAvailable = 0,
  backtestsRemaining = 25,
  startDate: savedStartDate,
  endDate: savedEndDate,
  dteTab: savedDteTab,
  onOpenStrategyInBuilder,
  onShowToast,
}) => {

  const { portfolios, addPortfolio } = usePortfolio();
  // One source for the saved strategies; see SavedStrategiesContext.
  const { strategies: savedStrategyCards } = useSavedStrategies();

  const [portfolioName, setPortfolioName] = useState(initialName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [overallRiskEdit, setOverallRiskEdit] = useState(null);

  /** This portfolio as the backend last described it, or null before it loads. */
  const savedPortfolioRow = useMemo(() => {
    const name = String(portfolioName ?? '').trim().toLowerCase();
    return (portfolios || []).find((p) => {
      if (portfolioId != null && String(p.portfolio_id) === String(portfolioId)) return true;
      return String(p.portfolio_name ?? '').trim().toLowerCase() === name;
    }) || null;
  }, [portfolios, portfolioId, portfolioName]);

  const overallRisk = useMemo(() => {
    if (overallRiskEdit) return overallRiskEdit;
    const blank = { enabled: false, applied: false, type: 'mtm', mtmValue: '', percentValue: '' };
    if (!savedPortfolioRow) return { sl: { ...blank }, target: { ...blank } };
    // `applied` follows `enabled`: a saved limit already has its values, so
    // the eye belongs there the moment the portfolio opens.
    const read = (prefix) => {
      const r = riskFromRow(savedPortfolioRow, prefix);
      return { ...r, applied: r.enabled };
    };
    return { sl: read('portfolio_sl'), target: read('portfolio_target') };
  }, [overallRiskEdit, savedPortfolioRow]);

  /** Writes land on the edit copy, seeded from whatever is on screen now. */
  const setOverallRisk = useCallback(
    (update) => setOverallRiskEdit((prev) => (typeof update === 'function'
      ? update(prev ?? overallRisk)
      : update)),
    [overallRisk],
  );
  /** 'sl' | 'target' while that popup is open, else null. */
  const [riskDialog, setRiskDialog] = useState(null);

  const [showSaveAsNewModal, setShowSaveAsNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalName, setEditModalName] = useState(initialName);
  const [allSavedStrategies, setAllSavedStrategies] = useState([]);
  const loadAllStrategies = useCallback(async () => {
    let serverRows = [];
    try {
      serverRows = await fetchLibraryStrategies();
    } catch (error) {
      // A failed read falls back to the cards rather than to an empty list.
      logger.error('[PortfolioDetails] could not load the strategy library:', error);
    }
    const byName = new Map();
    const add = (item) => {
      const key = String(item?.name ?? item?.strategy_name ?? '').trim().toLowerCase();
      if (key) byName.set(key, item);
    };
    (savedStrategyCards || []).forEach(add);
    serverRows.forEach(add);
    setAllSavedStrategies([...byName.values()].sort(
      (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
    ));
  }, [savedStrategyCards]);
  const [saveAsNewName, setSaveAsNewName] = useState('');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [backtestResults, setBacktestResults] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [ranBacktest, setRanBacktest] = useState(false);
  const resultsRef = useRef(null);
  useEffect(() => {
    if (backtestResults) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [backtestResults]);
  const [backtestError, setBacktestError] = useState(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const scopeFilter = 'All';
  const [indexFilter, setIndexFilter] = useState('SENSEX');
  const [qtyMultiplier, setQtyMultiplier] = useState('Qty Multiplier');
  const [dteTab, setDteTab] = useState(
    PERIOD_TABS.includes(savedDteTab) ? savedDteTab : 'Weekdays',
  );
  const [slippage, setSlippage] = useState('Slippage');

  const today = new Date();
  const lastYear = new Date();
  lastYear.setFullYear(today.getFullYear() - 1);
  
  const [startDate, setStartDate] = useState(savedStartDate || toInputDate(lastYear));
  const [endDate, setEndDate] = useState(savedEndDate || toInputDate(today));
  const [responsePopup, setResponsePopup] = useState(null);
  useEffect(() => {
    if (!responsePopup) return;
    const t = setTimeout(() => setResponsePopup(null), 3000);
    return () => clearTimeout(t);
  }, [responsePopup]);

  const dateRangeError = (start, end) => {
    if (!start || !end) return null;          // nothing to compare yet
    const s = new Date(start), e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    return e < s ? 'End Date must be after Start Date' : null;
  };
  const dateWarnTimerRef = useRef(null);
  const warnAboutDatesLater = (message) => {
    if (dateWarnTimerRef.current) clearTimeout(dateWarnTimerRef.current);
    dateWarnTimerRef.current = null;
    if (!message) return;
    dateWarnTimerRef.current = setTimeout(() => {
      dateWarnTimerRef.current = null;
      setResponsePopup({ type: 'error', title: message });
    }, TIME_WARNING_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(dateWarnTimerRef.current), []);

  const [saved, setSaved] = useState(false);
  const dragIndex = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const buildRow = (s, idx) => {
      const row = {
        id: s.id ?? s.strategy_id ?? `strategy_${idx}`,
        name: s.name ?? s.strategy_name ?? 'Untitled Strategy',
        symbol: SUPPORTED_INDICES.includes(String(s.symbol ?? '').toUpperCase())
          ? String(s.symbol).toUpperCase()
          : 'SENSEX',
        strategy_type: (s.strategy_type ?? 'intraday').toUpperCase(),
        version: s.version ?? 1,
        selected: s.selected ?? true,
        qty: firstNumber([s.qty, s.quantity_multiplier, s.qty_multiplier], 1),
        weekdays: resolveWeekdays(s),
        budgetPct: firstNumber([s.budgetPct, s.slippage_percent, s.slippage], 0),
        selectedDTEs: s.selectedDTEs ?? [0],
        selectedBudgetDays: s.selectedBudgetDays ?? [],
      };
      return row;
    };

    if (Array.isArray(strategiesProp)) {
      const builtRows = strategiesProp.map(buildRow);
      setRows(builtRows);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadFallback = () => {
      try {
        const local = savedStrategyCards;
        if (local.length > 0) return local.map(buildRow);
      } catch (e) {
      }
      return [
        {
          id: 'sample_trending',
          name: 'Trending Strategy',
          symbol: 'SENSEX',
          strategy_type: 'INTRADAY',
          selected: true,
          qty: 1,
          weekdays: { ...ALL_WEEKDAYS_ON },
          budgetPct: 0,
          selectedDTEs: [0],
          selectedBudgetDays: [],
        },
      ];
    };

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/strategies/list`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success' && Array.isArray(data.strategies) && data.strategies.length > 0) {
            if (!cancelled) setRows(data.strategies.map(buildRow));
            return;
          }
        }
        if (!cancelled) setRows(loadFallback());
      } catch (e) {
        if (!cancelled) setRows(loadFallback());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [strategiesProp]);

  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const toggleSelectAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const toggleRowSelected = useCallback((id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  }, []);
  const resolveBackendPortfolioId = useCallback(() => {
    const isBackendId = (v) => v !== null && v !== undefined && /^\d+$/.test(String(v));
    const name = String(portfolioName ?? '').trim();
    const matches = (portfolios || []).filter(
      (p) => String(p.portfolio_name ?? '').trim() === name && isBackendId(p.portfolio_id)
    );
    if (matches.length) {
      // Same name saved more than once: prefer the one this view was opened
      // with, else the most recently stored.
      const exact = matches.find((p) => String(p.portfolio_id) === String(portfolioId));
      return Number((exact ?? matches[matches.length - 1]).portfolio_id);
    }
    return isBackendId(portfolioId) ? Number(portfolioId) : null;
  }, [portfolios, portfolioId, portfolioName]);

  const isSavedPortfolio = resolveBackendPortfolioId() !== null;

  /** Shown under the Edit dialog's name field, and the reason Update refuses. */
  const NAME_TAKEN_MESSAGE = 'This name already exists. Please give a different name.';
  const saveAsNewNameTaken = (candidate) => {
    const key = String(candidate ?? '').trim().toLowerCase();
    if (!key) return false;
    return (portfolios || []).some(
      (p) => String(p.portfolio_name ?? '').trim().toLowerCase() === key,
    );
  };

  const editNameTaken = (candidate) => {
    const key = String(candidate ?? '').trim().toLowerCase();
    if (!key) return false;
    const own = String(portfolioName ?? '').trim().toLowerCase();
    return (portfolios || []).some((p) => {
      const theirs = String(p.portfolio_name ?? '').trim().toLowerCase();
      if (theirs !== key) return false;
      if (portfolioId != null && String(p.portfolio_id) === String(portfolioId)) return false;
      return theirs !== own;
    });
  };

  const savePortfolioToBackend = useCallback(async (strategyRows, nameOverride, { asNew = false } = {}) => {
    const toStrategyId = (rowId) => {
      if (typeof rowId === 'number') return rowId;
      const match = String(rowId ?? '').match(/\d+/);
      return match ? parseInt(match[0], 10) : null;
    };
    const payload = buildSavePortfolioPayload({
      portfolioId: asNew ? null : resolveBackendPortfolioId(),
      portfolioName: String(nameOverride ?? portfolioName ?? '').trim(),
      index: indexFilter,
      qtyMultiplier,
      slippage,
      // The tab decides which shape the period takes; the rows carry the days
      // or DTEs themselves, so a per-strategy choice is not flattened away.
      period: { mode: dteTab, weekdays: strategyRows?.[0]?.weekdays,
                selectedDTEs: strategyRows?.[0]?.selectedDTEs },
      overallSL: overallRisk.sl,
      overallTarget: overallRisk.target,
      strategies: (strategyRows || [])
        .map((row) => ({
          strategy_id: toStrategyId(row.id),
          strategy_name: row.name || '',
          version: row.version || 1,
          qty_multiplier: row.qty,
          slippage: row.slippage ?? row.budgetPct,
          mode: dteTab,
          weekdays: row.weekdays,
          selectedDTEs: row.selectedDTEs,
        }))
        .filter((s) => s.strategy_id !== null),
    });

    try {
      const response = await fetch(`${API_URL}/save-portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || data.message || `HTTP ${response.status}`);
      }

      logger.success('Portfolio saved');
      return data;
    } catch (error) {
      logger.error('Error saving portfolio:', error);
      return null;
    }
  }, [portfolioName, resolveBackendPortfolioId, indexFilter, qtyMultiplier,
      slippage, dteTab, overallRisk]);

  const deleteSelected = () => {
    const remaining = rows.filter((r) => !r.selected);
    setRows(remaining);
    savePortfolioToBackend(remaining);
  };

  const deleteRow = useCallback((id) => {
    const remaining = rows.filter((r) => r.id !== id);
    setRows(remaining);
    savePortfolioToBackend(remaining);
  }, [rows, savePortfolioToBackend]);

  const updateRow = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /*
    ONE SOURCE OF TRUTH for "is this strategy in play": rows[].selected.

    It already decides what the run-backtest payload carries. Handing the same
    state to the results means the configuration row's checkbox and the
    Strategy-wise Report's checkbox are the SAME checkbox -- untick either and
    the strategy leaves the Year-wise table, the charts, the Full Report and
    the aggregate together, with the other box following.

    The alternative, a second Set living inside the results, is what the code
    did before: two states for one question, free to disagree the moment a row
    was added or a backtest re-run.
  */
  const excludedStrategyIds = useMemo(() => {
    const out = new Set();
    for (const row of rows) {
      if (row.selected) continue;
      const id = rowStrategyId(row);
      if (id !== null) out.add(String(id));
    }
    return out;
  }, [rows]);

  // Called from the Strategy-wise Report; writes back to the row it belongs to.
  const toggleStrategySelected = useCallback((strategyId) => {
    const key = String(strategyId);
    setRows((prev) => prev.map((r) => (
      String(rowStrategyId(r)) === key ? { ...r, selected: !r.selected } : r
    )));
  }, []);

  const toggleRowWeekday = useCallback((id, dayKey) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, weekdays: { ...r.weekdays, [dayKey]: !r.weekdays[dayKey] } } : r
      )
    );
  }, []);
  const applyQtyMultiplier = (multiplier) => {
    const qty = Number(multiplier) || 1;
    setRows((prev) => prev.map((r) => (r.selected ? { ...r, qty } : r)));
  };

  const applySlippageToRows = (slippageValue) => {
    setRows((prev) =>
      prev.map((r) => {
        if (scopeFilter === 'Selected Only' && !r.selected) return r;
        return { ...r, budgetPct: slippageValue };
      })
    );
  };

  const applyDTEToRows = (dtes) => {
    // Tolerates the old single-number form in case anything still calls it that way.
    const next = Array.isArray(dtes) ? [...dtes] : [dtes];
    setRows((prev) =>
      prev.map((r) => {
        if (scopeFilter === 'Selected Only' && !r.selected) return r;
        return { ...r, selectedDTEs: next };
      })
    );
  };

  const applyWeekdaysToRows = (selectedDays) => {
    setRows((prev) =>
      prev.map((r) => {
        if (scopeFilter === 'Selected Only' && !r.selected) return r;
        return { ...r, weekdays: { ...selectedDays } };
      })
    );
  };

  const applyBudgetDaysToRows = (selectedBudgetDays) => {
    setRows((prev) =>
      prev.map((r) => {
        if (scopeFilter === 'Selected Only' && !r.selected) return r;
        return { ...r, selectedBudgetDays: [...selectedBudgetDays] };
      })
    );
  };

  const handleDragStart = useCallback((index) => (e) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  
  const handleDragOver = useCallback((index) => (e) => {
    e.preventDefault();
  }, []);
  
  const handleDrop = useCallback((index) => (e) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === index) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    dragIndex.current = null;
  }, []);

  const buildPortfolioPayload = () => ({
    id: portfolioId,
    name: portfolioName,
    scopeFilter,
    qtyMultiplier,
    dteTab,
    slippage,
    startDate,
    endDate,
    strategies: rows,
  });

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleUpdatePortfolio = async () => {
    /*
      Read BEFORE the save: afterwards the id exists either way, and the
      message has to say which of the two actually happened.
    */
    const wasSaved = resolveBackendPortfolioId() !== null;

    onUpdatePortfolio?.(buildPortfolioPayload());
    const data = await savePortfolioToBackend(rows);

    // savePortfolioToBackend answers null for a rejected request; it has
    // already logged the reason.
    if (!data) {
      onShowToast?.(
        wasSaved ? 'The portfolio could not be updated.' : 'The portfolio could not be saved.',
        'error',
      );
      return;
    }
    if (!wasSaved) {
      const newId = data?.portfolio_id ?? data?.data?.portfolio_id ?? null;
      if (newId !== null && newId !== undefined) {
        addPortfolio({
          portfolio_id: newId,
          portfolio_name: String(portfolioName ?? '').trim(),
          strategies: rows,
        });
      }
    }

    onShowToast?.(wasSaved ? 'Portfolio updated' : 'Portfolio saved', 'success');
    flashSaved();
  };

  const handleSaveAsNew = () => {
    setSaveAsNewName(`${portfolioName} (copy)`);
    setShowSaveAsNewModal(true);
  };

  const handleConfirmSaveAsNew = async () => {
    const newName = saveAsNewName.trim() || `${portfolioName} (copy)`;

    if (saveAsNewNameTaken(newName)) return;

    const selectedStrategies = rows.filter(row => row.selected);

    if (selectedStrategies.length === 0) {
      alert('Please select at least one strategy');
      return;
    }

    const saved = await savePortfolioToBackend(selectedStrategies, newName, { asNew: true });
    const newId = saved?.portfolio_id ?? saved?.data?.portfolio_id ?? null;

    if (newId === null) {
      alert('Could not save the portfolio. Please try again.');
      return;
    }

    const payload = {
      ...buildPortfolioPayload(),
      id: newId,
      portfolio_id: newId,
      name: newName,
      strategies: selectedStrategies  // Only save selected strategies
    };
    onSaveAsNew?.(payload);
    setShowSaveAsNewModal(false);
    flashSaved();
  };

  const handleConfirmEdit = () => {
    if (rows.length === 0) {
      alert('Please select at least one strategy');
      return;
    }
    if (editNameTaken(editModalName)) return;

    
    const updatedName = editModalName.trim() || portfolioName;
    
    const payload = {
      id: portfolioId,
      name: updatedName,
      scopeFilter,
      qtyMultiplier,
      dteTab,
      slippage,
      startDate,
      endDate,
      strategies: rows  // All rows are the selected strategies
    };
    
    // Update the portfolio name
    setPortfolioName(updatedName);

    // Call the update handler
    onUpdatePortfolio?.(payload);

    // The new name isn't in state yet on this tick, so pass it explicitly.
    savePortfolioToBackend(rows, updatedName);

    setShowEditModal(false);
    flashSaved();
  };

  const handleBacktest = async () => {
    const dateError = dateRangeError(startDate, endDate);
    if (dateError) {
      if (dateWarnTimerRef.current) {
        clearTimeout(dateWarnTimerRef.current);
        dateWarnTimerRef.current = null;
      }
      setResponsePopup({ type: 'error', title: dateError });
      return;
    }

    setBacktestLoading(true);
    setBacktestError(null);
    setBacktestResults(null);

    try {
      const selectedRows = rows.filter(row => row.selected);
      
      if (selectedRows.length === 0) {
        throw new Error('Please select at least one strategy');
      }


      const savedStrategies = savedStrategyCards;
      const resolvedPortfolioId = resolveBackendPortfolioId();

      const payload = {
        portfolio_id: resolvedPortfolioId,
        aggregate_at_eod: true,
        start_date: startDate,
        end_date: endDate,
        // Overall SL / Target, through the SAME builder save-portfolio uses --
        // a backtest that ran on different limits from the ones the portfolio
        // saves with would be answering a question nobody asked.
        ...toRiskFields('portfolio_sl', overallRisk.sl),
        ...toRiskFields('portfolio_target', overallRisk.target),
        strategy_overrides: selectedRows.map(row => {

          const strategyId = rowStrategyId(row);

          if (!strategyId || isNaN(strategyId)) {
            logger.error('Invalid strategy_id for row:', row);
            throw new Error(`Invalid strategy ID for "${row.name}": ${row.id}`);
          }

          let period_selection;
          if (dteTab === 'DTE') {
            // Use array format: [0, 1, 2, etc.]
            period_selection = {
              mode: 'dte',
              dte_selected: row.selectedDTEs || [0]
            };
          } else if (dteTab === 'Weekdays') {
            const weekdayMap = {
              mon: 'M', tue: 'T', wed: 'W', thu: 'Th', 
              fri: 'F', sat: 'Sa', sun: 'Su'
            };
            const weekdays_selected = Object.entries(row.weekdays || {})
              .filter(([key, value]) => value)
              .map(([key]) => weekdayMap[key])
              .filter(Boolean);
            
            period_selection = {
              mode: 'weekdays',
              weekdays_selected
            };
          }

          // Return with strategy_name included (as shown in correct format)
          return {
            strategy_id: strategyId,
            strategy_name: row.name || 'Untitled',
            version: row.version || 2,
            qty_multiplier: row.qty || 1,
            slippage_percent: row.budgetPct || 0,
            period_selection
          };
        })
      };

      logger.request('[RUN PORTFOLIO BACKTEST] Request', {
        method: 'POST',
        url: `${API_URL}/run-portfolio-backtest`,
        body: payload
      });

      const response = await fetch(`${API_URL}/run-portfolio-backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      logger.response('[RUN PORTFOLIO BACKTEST] Response', {
        status: response.status,
        data: data
      });

      if (!response.ok) {
        throw new Error(data.detail || data.message || `HTTP ${response.status}`);
      }

      const transformedData = {
        ...data,
        strategies: (data.strategies || []).map(strategy => {
          return {
            ...strategy,
            trade_results: (strategy.trade_results || []).map(trade => ({
              ...trade,
              legs: (trade.legs || []).map(leg => {
                const originalOption = leg.option;
                const transformedOption = leg.option ? leg.option.toLowerCase() : leg.option;
                if (originalOption !== transformedOption) {
                }
                return {
                  ...leg,
                  option: transformedOption  // CALL → call, PUT → put
                };
              })
            }))
          };
        })
      };

      setBacktestResults(transformedData);
      setRanBacktest(true);

    } catch (error) {
      logger.error('Error running backtest:', error);
      setBacktestError(error.message);
    } finally {
      setBacktestLoading(false);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        handleBacktest();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rows, portfolioName, scopeFilter, qtyMultiplier, dteTab, slippage, startDate, endDate]);

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const definitions = [];
      for (const row of rows) {
        // Same three parameters the strategy loader in App sends. The version
        // is not optional in practice: without it the endpoint answers 422.
        const url = `${API_URL}/get-strategy?strategy_id=${encodeURIComponent(row.id)}`
          + `&strategy_name=${encodeURIComponent(row.name)}`
          + `&version=${encodeURIComponent(row.version || 1)}`;
        const response = await fetch(url);
        const result = await response.json().catch(() => null);
        const data = result?.data;
        if (!response.ok || !data?.strategy) {
          // Carry the backend's own words through to the toast — "Could not
          // read X" on its own leaves nothing to act on.
          const detail = result?.detail?.message
            || (typeof result?.detail === 'string' ? result.detail : null)
            || result?.message
            || `HTTP ${response.status}`;
          throw new Error(`Could not read "${row.name}": ${detail}`);
        }
        definitions.push(definitionFromBackendStrategy(data, row.name));
      }

      const file = buildPortfolioExport({
        name: portfolioName || 'portfolio',
        dteTab,
        rows,
        definitions,
      });

      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${portfolioName || 'portfolio'}`;   // no extension, by request
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Portfolio export failed:', error);
      onShowToast?.(error.message || 'This portfolio could not be exported.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!backtestResults) {
      alert('Please run a backtest first before generating PDF');
      return;
    }
    
    try {
      setIsGeneratingPDF(true);
      // Loaded on demand — see Header.handlePDF.
      const { generatePortfolioScreenshotPDF } = await import('../utils/portfolioScreenshotPdf');
      await generatePortfolioScreenshotPDF(portfolioName || 'Portfolio');
      // Success - PDF downloaded automatically
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const [deleteAsked, setDeleteAsked] = useState(false);

  const handleDeletePortfolio = () => setDeleteAsked(true);

  const confirmDeletePortfolio = async () => {
    setDeleteAsked(false);

    try {
      const payload = { portfolio_id: resolveBackendPortfolioId() };
      
      logger.request('[DELETE PORTFOLIO] Request', {
        method: 'POST',
        url: `${API_URL}/delete-portfolio`,
        body: payload
      });
      
      const response = await fetch(`${API_URL}/delete-portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      logger.response('[DELETE PORTFOLIO] Response', {
        status: response.status,
        data: data
      });
      logger.success('Portfolio deleted successfully');
      
      onDeletePortfolio?.(portfolioId);
    } catch (error) {
      logger.error('Error deleting portfolio:', error);
      alert('Failed to delete portfolio. Please try again.');
    }
  };

  const commitName = () => {
    setPortfolioName(nameDraft.trim() || portfolioName);
    setEditingName(false);
  };

  return (
    <div className="flex flex-col h-[calc(100%+3rem)] bg-white -mx-4 sm:-mx-5 -my-6">
            {responsePopup && (
        <div className="fixed top-6 right-6 z-[200] animate-toast-in" style={{ pointerEvents: 'auto' }}>
          <div className={`flex items-start gap-3 pl-4 pr-3 py-3 rounded-lg shadow-lg text-white text-[14px] font-medium min-w-[280px] max-w-[440px] ${
            responsePopup.type === 'success' ? 'bg-green-600' :
            responsePopup.type === 'info' ? 'bg-blue-600' : 'bg-red-600'
          }`}>
            {responsePopup.type === 'success'
              ? <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M12 11.5v4.5" /></svg>
            }
            <span className="flex-1 leading-snug">{responsePopup.title}</span>
            <button
              type="button"
              onClick={() => setResponsePopup(null)}
              className="shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-white/20 transition-colors"
              title="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-wrap gap-y-3" style={{ borderColor: '#ececec' }}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Collapse"
            type="button"
          >
            <ChevronsLeft size={18} />
          </button>
          <button
            onClick={onBack}
            className="transition-colors"
            style={{ color: '#3a3a3a' }}
            title="Back"
            type="button"
          >
            <ArrowLeft size={20} />
          </button>

          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && commitName()}
              className="text-[18px] font-semibold border-b-2 focus:outline-none px-1 min-w-0"
              style={{ color: '#2a2a2a', borderColor: '#0782DA' }}
            />
          ) : (
            <h1 className="text-[18px] font-semibold truncate" style={{ color: '#2a2a2a' }}>{portfolioName}</h1>
          )}

          <div className="hidden sm:flex items-center gap-2 ml-4">
            {backtestResults ? (
              <button
                onClick={handleGeneratePDF}
                disabled={isGeneratingPDF}
                className={`${PF_ACTION_BTN} ${isGeneratingPDF ? 'cursor-not-allowed opacity-40' : 'hover:bg-[#ecf6ff]'}`}
                style={{ borderColor: '#e3e3e3', color: '#0782DA' }}
                type="button"
                title="Generate PDF report"
              >
                <FileDown size={16} strokeWidth={1.5} />
                {isGeneratingPDF ? 'Generating...' : 'PDF'}
              </button>
            ) : null}

            {/* Export writes the portfolio + strategy definitions as .algtst JSON. */}
            <button
              onClick={handleExport}
              className={`${PF_ACTION_BTN} hover:bg-[#ecf6ff]`}
              style={{ borderColor: '#e3e3e3', color: '#0782DA' }}
              type="button"
            >
              <Upload size={16} strokeWidth={1.5} />
              Export
            </button>
            <button
              onClick={() => {
                setEditModalName(portfolioName);
                setShowEditModal(true);
                loadAllStrategies();
              }}
              className={`${PF_ACTION_BTN} hover:bg-[#f7f7f7]`}
              style={{ borderColor: '#e3e3e3', color: '#2a2a2a' }}
              type="button"
            >
              <Edit2 size={16} strokeWidth={1.5} />
              Edit
            </button>
            <button
              onClick={handleDeletePortfolio}
              className={`${PF_ACTION_BTN} hover:bg-red-50`}
              style={{ borderColor: '#e3e3e3', color: '#b12020' }}
              type="button"
            >
              <Trash2 size={16} strokeWidth={1.5} />
              Delete
            </button>
          </div>
        </div>

      </div>

      {/* Body */}
      <div id="portfolio-pdf-content" className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50">
        {/* Portfolio configuration section - Always visible */}
        <div>
        <ToggleSwitchStyles />
        <div className="flex items-center gap-10 mb-7 flex-wrap gap-y-3">
          <h2 className="text-[13px] font-medium" style={{ color: '#3a3a3a' }}>Overall Portfolio Setting</h2>
          {[
            { key: 'sl', label: 'Overall SL' },
            { key: 'target', label: 'Overall Target' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2.5">
              <span className="text-[13px] font-medium" style={{ color: '#3a3a3a' }}>{label}</span>
              <ToggleSwitch
                size="xs"
                id={`overall-${key}`}
                checked={overallRisk[key].enabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setOverallRisk((prev) => ({
                    ...prev,
                    // The applied values are KEPT when switched off, so turning
                    // it back on reopens the popup filled in rather than blank.
                    [key]: { ...prev[key], enabled: on },
                  }));
                  if (on) setRiskDialog(key);
                }}
              />
              {/* Shown only once Apply has been pressed AND the switch is on. */}
              {overallRisk[key].enabled && overallRisk[key].applied && (
                <button
                  type="button"
                  onClick={() => setRiskDialog(key)}
                  title={`View ${label}`}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <Eye size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="pf-settings-row flex items-center gap-6 px-6 mb-6 flex-wrap lg:flex-nowrap gap-y-3">
          {/* spacer: drag handle */}
          <span className="w-[17px] shrink-0" aria-hidden="true" />
          {/* spacer: row checkbox */}
          <span className="w-4 shrink-0" aria-hidden="true" />

          {/* over the strategy name column */}
          <div className="min-w-[10rem]">
            <div className="pf-nudge relative -left-[105px] w-28">
              <select
                value={indexFilter}
                onChange={(e) => setIndexFilter(e.target.value)}
                className="appearance-none w-full bg-white border rounded-md pl-3 pr-8 py-1.5 text-[12px] text-[#3a3a3a] hover:border-[#c3c3c3] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer transition-colors"
                style={{ borderColor: '#e3e3e3' }}
              >
                <option value="SENSEX">SENSEX</option>
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* over the qty column */}
          <div className="w-32 shrink-0">
            <QtyMultiplierDropdown
              value={qtyMultiplier}
              onChange={setQtyMultiplier}
              onApply={applyQtyMultiplier}
              className="w-full"
            />
          </div>

          <div className="flex-1 max-w-[54rem] flex items-center justify-center gap-3">
            <div className="flex items-center border rounded-md overflow-hidden text-[13px] bg-white" style={{ borderColor: '#e3e3e3' }}>
              {['DTE', 'Weekdays', 'Budget Days'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDteTab(tab)}
                  className="px-3.5 py-1.5 text-[12px] transition-colors whitespace-nowrap"
                  style={
                    dteTab === tab
                      ? { backgroundColor: '#ECF6FF', color: '#0782DA', fontWeight: 500 }
                      : { color: '#3a3a3a' }
                  }
                  onMouseEnter={(e) => { if (dteTab !== tab) e.currentTarget.style.backgroundColor = '#f7f7f7'; }}
                  onMouseLeave={(e) => { if (dteTab !== tab) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* The tab's own "Apply to all rows" popup — DTE / Weekdays / Budget Days */}
            {dteTab === 'DTE' && <DTEDropdown onApply={applyDTEToRows} className="w-32" />}
            {dteTab === 'Weekdays' && <WeekdaysDropdown onApply={applyWeekdaysToRows} className="w-32" />}
            {/* w-32 like the other two: at w-44 this row overflowed its
                container on the Budget Days tab and shoved Slippage out of line
                with the rows below. */}
            {dteTab === 'Budget Days' && <BudgetDaysDropdown onApply={applyBudgetDaysToRows} className="w-32" />}
          </div>

          <div className="pf-nudge w-28 shrink-0 mr-20 -ml-20">
            <SlippageDropdown
              value={slippage}
              onChange={setSlippage}
              onApply={applySlippageToRows}
              className="pf-nudge w-full -left-6"
            />
          </div>

          {/* spacer: row delete icon */}
          <span className="w-4 shrink-0" aria-hidden="true" />
        </div>

        <div className="border rounded-t-lg px-6 py-3 flex items-center justify-between"
             style={{ borderColor: '#e3e3e3', backgroundColor: '#F5F5F5' }}>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded cursor-pointer"
              style={{ accentColor: '#0782DA' }}
            />
            <span className="text-[12px] font-medium" style={{ color: '#4A4A4A' }}>
              <span className="font-semibold">{selectedCount}</span>
              /{rows.length} selected
            </span>
          </label>

          <button
            onClick={deleteSelected}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 text-[12px] font-normal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: '#B12020' }}
            type="button"
            title="Delete Selected"
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </div>

        {/* Strategy rows */}
        <div className="border border-t-0 rounded-b-lg mb-6 divide-y divide-[#f3f3f3] bg-white" style={{ borderColor: '#e3e3e3' }}>
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Loading strategies…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No strategies in this portfolio yet.
            </div>
          ) : (
            rows.map((row, idx) => (
              <StrategyRow
                key={row.id}
                row={row}
                idx={idx}
                dteTab={dteTab}
                PillDropdown={PillDropdown}
                DTEMultiSelect={DTEMultiSelect}
                BudgetDaysMultiSelect={BudgetDaysMultiSelect}
                onUpdateRow={updateRow}
                onToggleSelected={toggleRowSelected}
                onToggleWeekday={toggleRowWeekday}
                onDelete={deleteRow}
                onOpenInBuilder={onOpenStrategyInBuilder}
                onDragStart={handleDragStart(idx)}
                onDragOver={handleDragOver(idx)}
                onDrop={handleDrop(idx)}
              />
            ))
          )}
        </div>

        {/* Backtest duration */}
        <div className="border rounded-lg bg-white px-5 py-4 flex items-center justify-between flex-wrap gap-4" style={{ borderColor: '#e3e3e3' }}>
          <p className="text-[13px] font-medium" style={{ color: '#3a3a3a' }}>Enter the duration of your backtest</p>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[13px]" style={{ color: '#3a3a3a' }}>
                Start Date
              </label>
              <div>
                <DateSegmentInput
                  compact
                  value={startDate}
                  onCommit={(v) => {
                    // Keep what was typed and warn instead of reverting, so the
                    // user can fix either field in whichever order they like.
                    setStartDate(v);
                    warnAboutDatesLater(dateRangeError(v, endDate));
                    return true;
                  }}
                  placeholder="Start Date"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[13px]" style={{ color: '#3a3a3a' }}>
                End Date
              </label>
              <div>
                <DateSegmentInput
                  compact
                  value={endDate}
                  onCommit={(v) => {
                    setEndDate(v);
                    warnAboutDatesLater(dateRangeError(startDate, v));
                    return true;
                  }}
                  placeholder="End Date"
                />
              </div>
            </div>
          </div>
        </div>
        </div>
        {/* End of Portfolio configuration section */}

        {/* Backtest Results Section - Shows below the settings */}

        {backtestError && (
          <div className="border border-red-200 rounded-lg bg-red-50 px-6 py-6 mt-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Backtest Failed</h3>
                <p className="text-red-700 mb-4">{backtestError}</p>
                <button
                  onClick={handleBacktest}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                >
                  Retry Backtest
                </button>
              </div>
            </div>
          </div>
        )}

        {backtestResults && (
          <div className="mt-6" ref={resultsRef}>
            <PortfolioBacktestResults 
              results={backtestResults}
              startDate={startDate}
              endDate={endDate}
              portfolioName={portfolioName}
              /* all rows, not just selected: the correlation matrix's
                 "Show only checked" toggle needs both sets */
              strategies={rows}
              dteTab={dteTab}
              qtyMultiplier={qtyMultiplier}
              slippage={slippage}
              excludedIds={excludedStrategyIds}
              onToggleStrategy={toggleStrategySelected}
              onClose={() => setBacktestResults(null)}
            />
          </div>
        )}
      </div>

      <div className="border-t bg-white px-6 py-4 mt-auto z-10" style={{ borderColor: '#ececec' }}>
        <div className="flex items-center justify-end gap-3 flex-wrap">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 mr-auto">
              <Check size={16} />
              Saved
            </span>
          )}
          <button
            onClick={handleSaveAsNew}
            className="flex items-center gap-2 h-10 px-4 border rounded-md text-[13px] font-medium bg-white transition-colors"
            style={{ borderColor: colors.actionBar.secondaryBorder, color: colors.actionBar.secondaryText }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg; e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = colors.actionBar.secondaryBorder; e.currentTarget.style.color = colors.actionBar.secondaryText; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            type="button"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <Copy size={14} />
            </div>
            Save as new
          </button>
          <button
            onClick={handleUpdatePortfolio}
            className="flex items-center gap-2 h-10 px-4 border rounded-md text-[13px] font-medium bg-white transition-colors"
            style={{ borderColor: colors.actionBar.secondaryBorder, color: colors.actionBar.secondaryText }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg; e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = colors.actionBar.secondaryBorder; e.currentTarget.style.color = colors.actionBar.secondaryText; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            type="button"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <FileEdit size={14} />
            </div>
            {isSavedPortfolio ? 'Update Portfolio' : 'Save Portfolio'}
          </button>
          <button
            onClick={onRecentBacktests}
            className="flex items-center gap-2 h-10 px-4 border rounded-md text-[13px] font-medium bg-white transition-colors"
            style={{ borderColor: colors.actionBar.recentBorder, color: colors.actionBar.recentText }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.actionBar.recentHoverBg; e.currentTarget.style.borderColor = colors.actionBar.recentHoverBg; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = colors.actionBar.recentBorder; e.currentTarget.style.color = colors.actionBar.recentText; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            type="button"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <Clock size={14} />
            </div>
            Recent Backtests
          </button>
          <button
            onClick={handleBacktest}
            disabled={backtestLoading}
            className={`flex items-center gap-2 h-10 px-5 rounded-md text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${ranBacktest ? 'font-medium' : 'font-semibold text-white'}`}
            style={ranBacktest
              ? { backgroundColor: 'transparent', border: `1px solid ${colors.actionBar.secondaryBorder}`, color: colors.actionBar.secondaryText }
              : { backgroundColor: '#008537' }}
            onMouseEnter={(e) => {
              if (backtestLoading) return;
              if (ranBacktest) {
                e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                e.currentTarget.style.color = '#FFFFFF';
              } else {
                e.currentTarget.style.backgroundColor = '#006A2C';
              }
            }}
            onMouseLeave={(e) => {
              if (ranBacktest) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = colors.actionBar.secondaryText;
              } else {
                e.currentTarget.style.backgroundColor = '#008537';
              }
            }}
            type="button"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              {backtestLoading
                ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                : <Play size={14} fill="currentColor" />}
            </div>
            <span className="flex flex-col items-start leading-tight">
              <span>{backtestLoading ? 'Backtesting...' : 'Backtest'}</span>
              {!backtestLoading && <span className="text-[10px] font-normal opacity-80">(Shift+enter)</span>}
            </span>
          </button>
        </div>
        <p className="flex items-center justify-center gap-1 text-[10px] text-gray-400 mt-3">
          {isSavedPortfolio ? 'Update Portfolio' : 'Save Portfolio'}
          {' to save any changes to the DTE or Qty Multiplier'}
        </p>
      </div>

      {/* Save as New Modal */}
      {showSaveAsNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">Create New Portfolio</h2>
              <button
                onClick={() => setShowSaveAsNewModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              {/* Portfolio Name Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Portfolio Name
                </label>
                <input
                  type="text"
                  value={saveAsNewName}
                  onChange={(e) => setSaveAsNewName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  style={{ borderColor: saveAsNewNameTaken(saveAsNewName) ? '#DC2626' : '#d1d5db' }}
                  placeholder="Enter portfolio name"
                />
                {saveAsNewNameTaken(saveAsNewName) && (
                  <p className="mt-1.5 text-[12px]" style={{ color: '#DC2626' }}>
                    {NAME_TAKEN_MESSAGE}
                  </p>
                )}
              </div>

              {/* Add Strategy Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">Add Strategy</h3>
                </div>

                {/* Tab - My Strategies */}
                <div className="border-b border-gray-200 mb-4">
                  <button className="px-4 py-2 text-sm font-medium text-blue-600 relative">
                    My Strategies
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Search Strategy"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                </div>

                {/* Select All Checkbox */}
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                  <input
                    type="checkbox"
                    id="select-all-modal"
                    checked={rows.length > 0 && rows.every(r => r.selected)}
                    onChange={() => {
                      const allSelected = rows.every(r => r.selected);
                      setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="select-all-modal" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Select all ({rows.length})
                  </label>
                </div>

                {/* Strategies List */}
                <div className="max-h-64 overflow-y-auto">
                  {rows.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No strategies found
                    </div>
                  ) : (
                    rows.map((row) => (
                      <div key={row.id} className="flex items-center gap-2 py-2 hover:bg-gray-50 px-2 rounded">
                        <input
                          type="checkbox"
                          id={`modal-strategy-${row.id}`}
                          checked={row.selected}
                          onChange={() => toggleRowSelected(row.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor={`modal-strategy-${row.id}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                          {row.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowSaveAsNewModal(false)}
                className="px-6 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSaveAsNew}
                /* Greyed while the name is taken, including the "(copy)"
                   fallback an empty field would use. */
                disabled={saveAsNewNameTaken(saveAsNewName.trim() || `${portfolioName} (copy)`)}
                className="px-6 py-2 rounded-lg font-medium transition-all text-white active:scale-95 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: colors.legBuilder.addLegBg }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
              >
                Create Portfolio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Portfolio Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">Edit Portfolio</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              {/* Portfolio Name Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Portfolio Name
                </label>
                {/* Checked on every keystroke, so a clash shows before the
                    strategies have been picked rather than after Update. */}
                <input
                  type="text"
                  value={editModalName}
                  onChange={(e) => setEditModalName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  style={{ borderColor: editNameTaken(editModalName) ? '#DC2626' : '#d1d5db' }}
                  placeholder="Enter portfolio name"
                />
                {editNameTaken(editModalName) && (
                  <p className="mt-1.5 text-[12px]" style={{ color: '#DC2626' }}>
                    {NAME_TAKEN_MESSAGE}
                  </p>
                )}
              </div>

              {/* Add Strategy Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">Select Strategies</h3>
                </div>

                {/* Tab - My Strategies */}
                <div className="border-b border-gray-200 mb-4">
                  <button className="px-4 py-2 text-sm font-medium text-blue-600 relative">
                    My Strategies
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Search Strategy"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                </div>

                {/* Select All Checkbox */}
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                  <input
                    type="checkbox"
                    id="select-all-edit-modal"
                    checked={allSavedStrategies.length > 0 && allSavedStrategies.every(strategy => 
                      rows.some(row => row.name === strategy.name)
                    )}
                    onChange={() => {
                      const allSelected = allSavedStrategies.every(strategy => 
                        rows.some(row => row.name === strategy.name)
                      );
                      
                      if (allSelected) {
                        // Deselect all - clear the rows
                        setRows([]);
                      } else {
                        // Select all - add all strategies that aren't already in rows
                        const newRows = allSavedStrategies.map(strategy => {
                          const existingRow = rows.find(row => row.name === strategy.name);
                          if (existingRow) {
                            return existingRow;
                          }
                          return {
                            id: strategy.id || `temp-${Date.now()}-${strategy.name}`,
                            name: strategy.name,
                            qty: 1,
                            dte: 'DTE',
                            selectedDTEs: [0],
                            weekdays: { ...ALL_WEEKDAYS_ON },
                            budgetDays: 'Budget Days',
                            selectedBudgetDays: [],
                            budgetPct: 0,
                            slippage: '0%',
                            selected: true
                          };
                        });
                        setRows(newRows);
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="select-all-edit-modal" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Select all ({allSavedStrategies.length})
                  </label>
                </div>

                {/* Strategies List */}
                <div className="max-h-64 overflow-y-auto">
                  {allSavedStrategies.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No saved strategies found
                    </div>
                  ) : (
                    allSavedStrategies.map((strategy) => {
                      // Check if this strategy is currently in the portfolio
                      const isInPortfolio = rows.some(row => row.name === strategy.name);
                      
                      return (
                        <div key={strategy.id || strategy.name} className="flex items-center gap-2 py-2 hover:bg-gray-50 px-2 rounded">
                          <input
                            type="checkbox"
                            id={`edit-modal-strategy-${strategy.id || strategy.name}`}
                            checked={isInPortfolio}
                            onChange={() => {
                              // Toggle strategy in/out of portfolio
                              const existingRow = rows.find(row => row.name === strategy.name);
                              if (existingRow) {
                                // Remove from portfolio
                                setRows(prev => prev.filter(r => r.name !== strategy.name));
                              } else {
                                // Add to portfolio - create a new row from the strategy
                                const newRow = {
                                  id: strategy.id || `temp-${Date.now()}`,
                                  name: strategy.name,
                                  qty: 1,
                                  dte: 'DTE',
                                  selectedDTEs: [0],

                            weekdays: { ...ALL_WEEKDAYS_ON },
                                  budgetDays: 'Budget Days',
                                  selectedBudgetDays: [],
                                  budgetPct: 0,
                                  slippage: '0%',
                                  selected: true
                                };
                                setRows(prev => [...prev, newRow]);
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                          />
                          <label htmlFor={`edit-modal-strategy-${strategy.id || strategy.name}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                            {strategy.name}
                          </label>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-6 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEdit}
                disabled={editNameTaken(editModalName)}
                className="px-6 py-2 rounded-lg font-medium transition-all text-white active:scale-95 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: colors.legBuilder.addLegBg }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteAsked}
        title="Delete portfolio?"
        message="This Portfolio will be deleted and this action cannot be undone. Are you sure you want to continue?"
        onConfirm={confirmDeletePortfolio}
        onCancel={() => setDeleteAsked(false)}
      />


      {riskDialog && (
        <OverallRiskDialog
          title={riskDialog === 'sl' ? 'Overall SL' : 'Overall Target'}
          value={overallRisk[riskDialog]}
          onClose={() => setRiskDialog(null)}
          onApply={(applied) => {
            setOverallRisk((prev) => ({
              ...prev,
              [riskDialog]: { ...prev[riskDialog], ...applied, applied: true },
            }));
            setRiskDialog(null);
          }}
        />
      )}
    </div>
  );
};

export default Portfolio;