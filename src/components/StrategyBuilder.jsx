import { useState, useEffect, useRef, useCallback, useMemo, memo, Fragment } from 'react'; // Added memo for performance
import { Info, Save, Play, ArrowRightLeft, X, CopyPlus } from 'lucide-react';
import { readWindow, saveWindow } from '../utils/backtestWindow';
import ToggleSwitch, { ToggleSwitchStyles } from './ToggleSwitch';
import SegmentedGroup from './SegmentedGroup';
import LegCard from './LegCard';
import StrikeSelector from './StrikeSelector';
import PlainDropdown from './PlainDropdown';
import ReentryCountDropdown from './ReentryCountDropdown';
import DateSegmentInput from './DateSegmentInput'; // Segmented DD/MM/YYYY with single-click selection
import TimeSegmentInput from './TimeSegmentInput';
import BacktestResults from './BacktestResults';
import CompareBacktestSidebar from './CompareBacktestSidebar';
import { API_URL } from '../services/api';
import { DEFAULT_EXIT_TIME, SUPPORTED_INDEXES, DEFAULT_SYMBOL, DEFAULT_END_DATE } from '../config/constants';
import {
  MARKET_OPEN_TIME,
  ENTRY_LAST_TIME,
  EXIT_LAST_TIME,
  timeRangeError,
  timeOrderError,
  isOvernightType,
  entryExitError,
  delayRestartError,
  sessionWindowError,
  TIME_WARNING_DELAY_MS,
} from '../utils/timeRules';
import { getDefaultConfig, getDefaultLeg } from '../config/defaultStrategyConfig';
import { compareBacktests } from '../services/strategyApi';
import { useStrategy } from '../context/StrategyContext';
import logger from '../utils/logger';
import { INSTRUMENT_SECTION_ID } from '../utils/revealSection';
import { noLegsError, rangeBreakoutDteError } from '../utils/strategyValidation';
import { colors } from '../theme/colors';

const ROW_BLOCK = 'w-full max-w-[30rem] mx-auto';

const selectChevron = (strokeColor) =>
  `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

let legIdSequence = 0;
const nextLegId = () => Date.now() * 1000 + (++legIdSequence % 1000);

const SEQUENTIAL_LEG_DEFAULTS = Object.freeze({
  customName: '',
  lots: '1',
  expiry: 'weekly',
  position: 'buy',
  option_type: 'call',
  strike_criteria: 'based on points',
  atm_strike: 'atm',
  atm_percent_direction: '+',
  atm_percent_value: '',
  closest_premium_value: '',
  lower_range: '',
  upper_range: '',
  premium_value: '',
  target_enabled: false,
  target_type: 'points',
  target_value: '',
  stop_loss_enabled: false,
  stop_loss_type: 'points',
  stop_loss_value: '',
  trail_sl_enabled: false,
  trail_sl_type: 'points',
  trail_sl_value: '',
  trail_sl_lock_value: '',
  reentry_tgt_enabled: false,
  reentry_tgt_mode: 're_asap',
  reentry_tgt_count: '',
  reentry_sl_enabled: false,
  reentry_sl_mode: 're_asap',
  reentry_sl_count: '',
  momentum_enabled: false,
  momentum_type: 'points',
  momentum_value: '',
});

const ADVISORY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatAdvisoryDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '--';
  const [, y, mo, d] = m;
  return `${d}-${ADVISORY_MONTHS[Number(mo) - 1] || '---'}-${y.slice(2)}`;
};

const StrategyBuilder = ({ liveConfigRef, generation, onRunBacktest, isLoading, isLoadingStrategy = false, savedConfig, onConfigChange, onSaveStrategy, onSaveAsNew, strategyId, backtestResults, onClearResults, strategySavedInSession, saveCompletedCounter, backtestCompletedCounter, onLoadVersion, sidebarOpen = true,

  readOnly = false }) => {
  const { version: contextVersion, strategy_name: contextStrategyName } = useStrategy();
  
  const isLoadingConfigRef = useRef(false);

  // Refs for keyboard navigation
  const symbolRef = useRef(null);
  const dteFilterRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const loadDataRef = useRef(null);
  
    // Refs for Entry Settings navigation
  const strategyTypeRef = useRef(null);
  const entryTimeRef = useRef(null);
  const exitTimeRef = useRef(null);

  const [uiIndexPlaceholder, setUiIndexPlaceholder] = useState('SENSEX');
  const [uiLegSegment, setUiLegSegment] = useState('options');
  const [uiLegBuilderCollapsed, setUiLegBuilderCollapsed] = useState(false);


  const handleFieldNavigation = useCallback((e, currentField) => {
    const fieldOrder = [symbolRef, dteFilterRef, startDateRef, endDateRef, loadDataRef];
    const currentIndex = fieldOrder.indexOf(currentField);

    if (e.key === 'ArrowRight' && currentIndex < fieldOrder.length - 1) {
      e.preventDefault();
      fieldOrder[currentIndex + 1].current?.focus();
    } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
      e.preventDefault();
      fieldOrder[currentIndex - 1].current?.focus();
    }
  }, []);
  
  const handleEntrySettingsNavigation = useCallback((e, currentField) => {
    const fieldOrder = [strategyTypeRef, entryTimeRef, exitTimeRef];
    const currentIndex = fieldOrder.indexOf(currentField);

    if (e.key === 'ArrowRight' && currentIndex < fieldOrder.length - 1) {
      e.preventDefault();
      fieldOrder[currentIndex + 1].current?.focus();
    } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
      e.preventDefault();
      fieldOrder[currentIndex - 1].current?.focus();
    }
  }, []);


  const mainLegPosition = (legs, parentLegId) =>
    legs.filter(l => !l.isLazyLeg && !l.isSequentialLeg).findIndex(l => l.id === parentLegId) + 1;

  const createSequentialLeg = () => {
    const parentLegId = sequentialLegParentId;
    const parentIndex = config.legs.findIndex(l => l.id === parentLegId);
    if (parentIndex === -1) return;

    const sequentialLegNumber = mainLegPosition(config.legs, parentLegId);

    const displayName = sequentialLegConfig.customName.trim()
      ? sequentialLegConfig.customName.trim()
      : `SEQ${sequentialLegNumber}`;

    const sequentialLeg = {
      id: nextLegId(),
      isSequentialLeg: true,  // Mark as sequential leg
      sequentialLegNumber: sequentialLegNumber,  // For display purposes
      parentLegId,  // Stable parent reference — survives reordering/deletion
      customName: displayName,  // Store the custom or default name

      lots: sequentialLegConfig.lots || '1',
      expiry: sequentialLegConfig.expiry || 'weekly',
      position: sequentialLegConfig.position || 'buy',
      option_type: sequentialLegConfig.option_type || 'call',

      strike_criteria: sequentialLegConfig.strike_criteria || 'based on points',
      strike_type: sequentialLegConfig.atm_strike || 'atm',
      atm_percent_direction: sequentialLegConfig.atm_percent_direction || '+',
      atm_percent_value: sequentialLegConfig.atm_percent_value || '',
      closest_premium_value: sequentialLegConfig.closest_premium_value || '',
      lower_range: sequentialLegConfig.lower_range || '',
      upper_range: sequentialLegConfig.upper_range || '',

      target_enabled: sequentialLegConfig.target_enabled || false,
      target_mode: sequentialLegConfig.target_type || 'points',
      target_value: sequentialLegConfig.target_value || '',
      stop_loss_enabled: sequentialLegConfig.stop_loss_enabled || false,
      stop_loss_mode: sequentialLegConfig.stop_loss_type || 'points',
      stop_loss_value: sequentialLegConfig.stop_loss_value || '',
      trail_enabled: sequentialLegConfig.trail_sl_enabled || false,
      trail_mode: sequentialLegConfig.trail_sl_type || 'points',
      trail_value: sequentialLegConfig.trail_sl_value || '',
      trail_lock_value: sequentialLegConfig.trail_sl_lock_value || '',

      reentry_tgt_enabled: sequentialLegConfig.reentry_tgt_enabled || false,
      reentry_tgt_mode: sequentialLegConfig.reentry_tgt_mode || 're_asap',
      reentry_tgt_count: sequentialLegConfig.reentry_tgt_count || '1',
      reentry_sl_enabled: sequentialLegConfig.reentry_sl_enabled || false,
      reentry_sl_mode: sequentialLegConfig.reentry_sl_mode || 're_asap',
      reentry_sl_count: sequentialLegConfig.reentry_sl_count || '1',

      momentum_enabled: sequentialLegConfig.momentum_enabled || false,
      momentum_mode: sequentialLegConfig.momentum_type || 'points',
      momentum_value: sequentialLegConfig.momentum_value || '',

      range_enabled: false,

      entry_time: config.entry_time,
      exit_time: config.exit_time,
    };

    const updatedLegs = [...config.legs];
    updatedLegs.splice(parentIndex + 1, 0, sequentialLeg);

    setConfig({ ...config, legs: updatedLegs });
    // Bring the newly created sequential leg into view, as Add / Copy / Create
    // Lazy Leg do.
    pendingScrollLegRef.current = sequentialLeg.id;

    closeSequentialLegModal();
  };

  // Close + reset the draft. Used by Cancel, the X, and after a successful Create.
  const closeSequentialLegModal = () => {
    setShowSequentialLegModal(false);
    setSequentialLegParentId(null);
    setSequentialLegConfig(SEQUENTIAL_LEG_DEFAULTS);
  };

  const [config, setConfig] = useState(() => {
    const initial = (savedConfig && Object.keys(savedConfig).length > 0)
      ? { ...getDefaultConfig(), ...savedConfig }
      : getDefaultConfig();
      
    const stored = readWindow();
    if (stored && !(savedConfig && Object.keys(savedConfig).length > 0)) {
      if (stored.start_date) initial.start_date = stored.start_date;
      // No end_date here on purpose -- it stays at DEFAULT_END_DATE, the date
      // the data actually runs to. See backtestWindow.js for why remembering
      // it made a fresh strategy open on whichever strategy was opened last.
      if (stored.symbol) initial.dte_filter = stored.symbol;
    }

    return initial;
  });

  const [showLazyLegModal, setShowLazyLegModal] = useState(false);
  const [lazyLegContext, setLazyLegContext] = useState(null); 
  const [lazyLegConfig, setLazyLegConfig] = useState({
    customName: '',  // NEW: Custom name for lazy leg
    lots: 1,
    expiry: 'weekly',
    position: 'buy',
    option_type: 'call',
    strike_criteria: 'based on points',
    atm_strike: 'atm',
    atm_percent_direction: '+',
    atm_percent_value: '',
    closest_premium_value: '',
    lower_range: '',
    upper_range: '',
    premium_value: '',
    target_enabled: false,      
    target_type: 'points',
    target_value: '0.00',
    stop_loss_enabled: false,   
    stop_loss_type: 'points', 
    stop_loss_value: '0.00',
    trail_sl_enabled: false,    
    trail_sl_type: 'points',
    trail_sl_value: '0.00',
    trail_sl_lock_value: '0.00',  
    reentry_tgt_enabled: false, 
    reentry_tgt_mode: 're_asap',
    reentry_tgt_count: '1',
    reentry_sl_enabled: false,  
    reentry_sl_mode: 're_asap',
    reentry_sl_count: '1',
    momentum_enabled: false,   
    momentum_type: 'points',
    momentum_value: '0.00',
    range_breakout_enabled: false, 
    range_instrument: 'underlying',
    range_time: '',
    range_direction: 'high'
  });
  
  // Leg to scroll into view once the next render commits (add / copy / delete).
  // A ref rather than state: it's consumed by an effect that must not re-render.
  const pendingScrollLegRef = useRef(null);

  const [showSequentialLegModal, setShowSequentialLegModal] = useState(false);
  const [sequentialLegParentId, setSequentialLegParentId] = useState(null); // Which main leg is creating the sequential leg
  const [sequentialLegConfig, setSequentialLegConfig] = useState(SEQUENTIAL_LEG_DEFAULTS);

  // ── Lazy / Sequential leg modal dependency rules ────────────────────────
  // Same contract LegCard applies to the main leg section: Trail SL and
  // Re-entry on SL build on Stop Loss, Re-entry on Tgt builds on Target, and
  // none is meaningful until its parent is ON *and* carries a value. Kept here
  // (rather than duplicated per modal) so both popups enforce one rule set.
  const requireParentField = (enabled, value, fieldLabel) => {
    if (!enabled) {
      setResponsePopup({ type: 'error', title: `Please enable the ${fieldLabel} first.` });
      return false;
    }
    if (value === '' || value === null || value === undefined) {
      setResponsePopup({ type: 'error', title: `Please enter a value for ${fieldLabel}.` });
      return false;
    }
    return true;
  };
  const modalStopLossReady = (cfg) => requireParentField(cfg.stop_loss_enabled, cfg.stop_loss_value, 'Stop Loss');
  const modalTargetReady = (cfg) => requireParentField(cfg.target_enabled, cfg.target_value, 'Target');

  // Switching a parent OFF switches its dependents off too, so a dependent
  // toggle can never be left on with nothing behind it.
  const modalTargetToggle = (setCfg) => (e) => {
    if (!e.target.checked) {
      setCfg(prev => ({ ...prev, target_enabled: false, reentry_tgt_enabled: false }));
      return;
    }
    setCfg(prev => ({ ...prev, target_enabled: true }));
  };
  const modalStopLossToggle = (setCfg) => (e) => {
    if (!e.target.checked) {
      setCfg(prev => ({ ...prev, stop_loss_enabled: false, trail_sl_enabled: false, reentry_sl_enabled: false }));
      return;
    }
    setCfg(prev => ({ ...prev, stop_loss_enabled: true }));
  };
  
  // (entryTimeRef / exitTimeRef removed -- no longer needed now that Entry
  // and Exit Time use the segmented TimeSegmentInput component, which
  // manages its own internal focus instead of a raw <input> DOM ref.)
  // Remembers the last COMPLETE, validated Entry/Exit time for each field.
  // Used to safely revert if the user leaves a field empty/incomplete,
  // so an invalid time can never silently reach Save or Run Backtest.
  const lastValidTimeRef = useRef({ entry_time: config.entry_time, exit_time: config.exit_time });
  
  const dataSelectionRef = useRef(null);
  
  const [lazyLegDropdownOpen, setLazyLegDropdownOpen] = useState({});
  const [lazyLegExistingExpanded, setLazyLegExistingExpanded] = useState({});
  const lazyLegDropdownRef = useRef({});
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(lazyLegDropdownOpen).forEach(key => {
        if (lazyLegDropdownOpen[key] && lazyLegDropdownRef.current[key]) {
          if (!lazyLegDropdownRef.current[key].contains(event.target)) {
            setLazyLegDropdownOpen(prev => ({ ...prev, [key]: false }));
          }
        }
      });
    };

    if (Object.values(lazyLegDropdownOpen).some(isOpen => isOpen)) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [lazyLegDropdownOpen]);
  
  const [dataLoaded, setDataLoaded] = useState(() => {
    if (savedConfig && savedConfig.dataLoaded) {
      return savedConfig.dataLoaded;
    }
    return false;
  });
  const [loadingData, setLoadingData] = useState(false);
  const [dataStatus, setDataStatus] = useState(() => {
    if (savedConfig && savedConfig.dataLoaded) {
      return "Data loaded ?";
    }
    return "Click 'Load Data' to begin";
  });
  const [rowCount, setRowCount] = useState(0);  // Track row count dynamically

  const [responsePopup, setResponsePopup] = useState(null); // { type: 'success'|'error'|'info', title }
  
  const [dteValidationError, setDteValidationError] = useState(null);
  
  const [legValidationErrors, setLegValidationErrors] = useState({});

  const [compareSidebarOpen, setCompareSidebarOpen] = useState(false);
  const [compareData, setCompareData] = useState([]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(false); // Track if saving as new strategy

  const [originalConfig, setOriginalConfig] = useState(() => {
    if (savedConfig && Object.keys(savedConfig).length > 0) {
      const initial = JSON.parse(JSON.stringify(savedConfig));
      return initial;
    }
    return null;
  });

  useEffect(() => {
    if (!responsePopup) return;
    const t = setTimeout(() => setResponsePopup(null), 3000);
    return () => clearTimeout(t);
  }, [responsePopup]);

  // Bring the leg just added, copied, or left behind by a delete into view.
  // Runs after the legs render, so the target node already exists. Clearing a
  // ref (rather than state) keeps this from triggering another render.
  useEffect(() => {
    const legId = pendingScrollLegRef.current;
    if (legId == null) return;
    pendingScrollLegRef.current = null;
    document
      .getElementById(`leg-card-${legId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [config.legs]);

  const [userMadeChanges, setUserMadeChanges] = useState(false);
  
  const [isSaveButtonEnabled, setIsSaveButtonEnabled] = useState(false);

  const hasConfigChanged = () => {
    if (!originalConfig) {
      return config.legs.length > 0;
    }
    
    if (!strategyId || strategyId === -999 || strategyId === '-999') {
      return config.legs.length > 0;
    }
    
    if (userMadeChanges) {
      return true;
    }
    
    try {
      const configToCompare = JSON.parse(JSON.stringify(config));
      const originalToCompare = JSON.parse(JSON.stringify(originalConfig));
      
      const fieldsToIgnore = ['currentLeg', 'dataLoaded'];
      fieldsToIgnore.forEach(field => {
        delete configToCompare[field];
        delete originalToCompare[field];
      });
      
      const configString = JSON.stringify(configToCompare);
      const originalString = JSON.stringify(originalToCompare);
      const hasChanged = configString !== originalString;
      
      return hasChanged;
    } catch (error) {
      logger.error('Error during comparison:', error);
      return config.legs.length > 0;
    }
  };

  const [currentLeg, setCurrentLeg] = useState(() => {
    if (savedConfig && savedConfig.currentLeg) {
      return savedConfig.currentLeg;
    }
    const strategyType = (savedConfig && savedConfig.strategy_type) || 'intraday';
    const dteFilter = (savedConfig && savedConfig.dte_filter) || '0';
    const defaultExpiry = 'weekly';
    
    return getDefaultLeg();
  });

  const [tempHour, setTempHour] = useState('09');
  const [tempMinute, setTempMinute] = useState('30');
  const [timePickerTarget, setTimePickerTarget] = useState(null);
  const [timePickerModal, setTimePickerModal] = useState(false);

  const [rangeBreakoutModal, setRangeBreakoutModal] = useState({
    isOpen: false,
    entryDte: 0,
    startTime: '09:17',
    endDte: 0,
    endTime: '09:45',
    entryOn: 'high',
    tracking: 'strike_price'
  });

  const [trailSLFilter, setTrailSLFilter] = useState('all'); // 'all' or 'sl'

  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerValue, setTimePickerValue] = useState('09:30');
  const handleTimePickerSelect = (time) => {
    setTimePickerValue(time);
    setTimePickerOpen(false);
  };

  const timeWarningTimerRef = useRef(null);
  const warnAboutTimeLater = (message) => {
    if (timeWarningTimerRef.current) clearTimeout(timeWarningTimerRef.current);
    timeWarningTimerRef.current = null;
    if (!message) return;
    timeWarningTimerRef.current = setTimeout(() => {
      timeWarningTimerRef.current = null;
      setResponsePopup({ type: 'error', title: message });
    }, TIME_WARNING_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(timeWarningTimerRef.current), []);

  // Positional: the exit must not be FURTHER from expiry than the entry, i.e.
  // exit days <= entry days. Returns the message, or null when the pair is fine.
  const positionalDayError = (entryDay, exitDay) => {
    if ((config.strategy_type || 'intraday') !== 'positional') return null;
    const entry = Number(entryDay);
    const exit = Number(exitDay);
    if (Number.isNaN(entry) || Number.isNaN(exit)) return null;
    return exit > entry
      ? 'Exit days to expiry cannot be greater than the entry days'
      : null;
  };

  // Positional on a MONTHLY basis counts trading days back from a monthly
  // expiry, so a leg that trades a weekly contract has no place in it — the leg
  // would expire before the strategy's own expiry. Same rule AlgoTest enforces.
  // Takes the leg list so a pending edit can be checked before it is committed.
  const POSITIONAL_WEEKLY_LEG_ERROR = 'Cannot enter on monthly expiry basis with a weekly leg';
  const positionalExpiryError = (legs = config.legs, expiry = config.positional_expiry) => {
    if ((config.strategy_type || 'intraday') !== 'positional') return null;
    if ((expiry || 'weekly') !== 'monthly') return null;
    const hasWeeklyLeg = (legs || []).some(
      (l) => l.expiry === 'weekly' || l.expiry === 'next_weekly'
    );
    return hasWeeklyLeg ? POSITIONAL_WEEKLY_LEG_ERROR : null;
  };

  // Same warning for a single expiry value, used by the Lazy Leg and Sequential
  // Leg modals where the leg does not exist in config.legs yet.
  const warnIfWeeklyLegExpiry = (expiry) => {
    if ((config.strategy_type || 'intraday') !== 'positional') return;
    if ((config.positional_expiry || 'weekly') !== 'monthly') return;
    if (expiry !== 'weekly' && expiry !== 'next_weekly') return;
    setResponsePopup({ type: 'error', title: POSITIONAL_WEEKLY_LEG_ERROR });
  };

  // "trading days before expiry" choices: a weekly expiry is at most 4 trading
  // days out, a monthly one up to 24. Rebuilt only when the basis changes.
  const positionalDayOptions = useMemo(
    () => Array.from(
      { length: (config.positional_expiry || 'weekly') === 'monthly' ? 25 : 5 },
      (_, i) => String(i)
    ),
    [config.positional_expiry]
  );

  const commitTime = (field, formatted) => {
    const entry = field === 'entry_time' ? formatted : config.entry_time;
    const exit = field === 'exit_time' ? formatted : config.exit_time;

    const error =
      timeRangeError(field, formatted) ||
      timeOrderError(config.strategy_type, entry, exit);

    warnAboutTimeLater(error);
    if (!error) lastValidTimeRef.current[field] = formatted;

    handleChange(field, formatted);
    return true;
  };

  useEffect(() => {
    if (savedConfig && Object.keys(savedConfig).length > 0) {
      const currentConfigJson = JSON.stringify({...config, currentLeg: undefined, dataLoaded: undefined});
      const savedConfigJson = JSON.stringify({...savedConfig, currentLeg: undefined, dataLoaded: undefined});
      
      if (currentConfigJson === savedConfigJson && strategyId) {
        return;
      }
      
      isLoadingConfigRef.current = true;
      
      const mergedConfig = {
        ...getDefaultConfig(), // Start with defaults to ensure all fields exist
        ...savedConfig, // Override with saved values
      };
      
      // Strip seconds from times (convert "HH:MM:SS" to "HH:MM" for TimeSegmentInput)
      if (mergedConfig.entry_time && mergedConfig.entry_time.includes(':')) {
        const parts = mergedConfig.entry_time.split(':');
        mergedConfig.entry_time = `${parts[0]}:${parts[1]}`;
      }
      if (mergedConfig.exit_time && mergedConfig.exit_time.includes(':')) {
        const parts = mergedConfig.exit_time.split(':');
        mergedConfig.exit_time = `${parts[0]}:${parts[1]}`;
      }
      
      if (mergedConfig.legs && mergedConfig.legs.length > 0) {
        const needsMigration = mergedConfig.legs.some(leg => !leg.entry_time || !leg.exit_time);
        const needsAtmPercentMigration = mergedConfig.legs.some(leg => 
          leg.atm_percent_direction === undefined || 
          leg.lower_range === undefined || 
          leg.upper_range === undefined
        );
        
        if (needsMigration || needsAtmPercentMigration) {
          mergedConfig.legs = mergedConfig.legs.map(leg => ({
            ...leg,
            strike_criteria: leg.strike_criteria,
            entry_time: leg.entry_time || mergedConfig.entry_time || '09:16',
            exit_time: leg.exit_time || mergedConfig.exit_time || DEFAULT_EXIT_TIME,
            atm_percent_direction: leg.atm_percent_direction !== undefined ? leg.atm_percent_direction : '+',
            atm_percent_value: leg.atm_percent_value !== undefined ? leg.atm_percent_value : '',
            lower_range: leg.lower_range !== undefined ? leg.lower_range : '',
            upper_range: leg.upper_range !== undefined ? leg.upper_range : ''
          }));
        }
      }
      
      setConfig(mergedConfig);
      lastValidTimeRef.current = {
        entry_time: mergedConfig.entry_time,
        exit_time: mergedConfig.exit_time,
      };
      setOriginalConfig(JSON.parse(JSON.stringify(mergedConfig)));
      setUserMadeChanges(false);
      
      if (savedConfig.currentLeg) {
        setCurrentLeg(savedConfig.currentLeg);
      }
      
      if (savedConfig.dataLoaded !== undefined) {
        setDataLoaded(savedConfig.dataLoaded);
        setDataStatus(savedConfig.dataLoaded ? "Data loaded ?" : "Click 'Load Data' to begin");
      }
      setTimeout(() => {
        isLoadingConfigRef.current = false;
      }, 0);
    }
  }, [savedConfig]);

  // Ref that holds the debounce timer for pushing config changes up to the
  // parent (App.jsx). Declared once via useRef so the same timer instance
  // persists across renders instead of being recreated each time.
  const configChangeTimerRef = useRef(null);
  // Always holds the MOST RECENT config snapshot, even while a debounced
  // push is still pending -- used to flush on unmount so no edit is ever lost.
  const latestConfigWithExtrasRef = useRef(null);

  useEffect(() => {
    const configWithExtras = {
      ...config,
      currentLeg,
      dataLoaded  // ? NEW: Persist data loaded state
    };
    latestConfigWithExtrasRef.current = configWithExtras;
    saveWindow(config);
    if (liveConfigRef) liveConfigRef.current = configWithExtras;

    if (onConfigChange && !isLoadingConfigRef.current) {

      if (strategyId && strategyId !== -999 && strategyId !== '-999' && originalConfig) {
        setUserMadeChanges(true);
      }

      if (configChangeTimerRef.current) {
        clearTimeout(configChangeTimerRef.current);
      }
      configChangeTimerRef.current = setTimeout(() => {
        onConfigChange(latestConfigWithExtrasRef.current, generation);
        configChangeTimerRef.current = null;
      }, 200);
    }
  }, [config, currentLeg, dataLoaded]); // ? Added dataLoaded to deps

  
  useEffect(() => {
    return () => {
      if (configChangeTimerRef.current) {
        clearTimeout(configChangeTimerRef.current);
        if (onConfigChange && latestConfigWithExtrasRef.current) {
          // Stamped with THIS builder's generation. After a reset the app has
          // moved on, and a flush from the builder being torn down is dropped
          // rather than landing on top of the fresh strategy.
          onConfigChange(latestConfigWithExtrasRef.current, generation);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (saveCompletedCounter > 0) {
      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      setUserMadeChanges(false);
    }
  }, [saveCompletedCounter]);


  useEffect(() => {
    const buttonShouldBeEnabled = hasConfigChanged();
    setIsSaveButtonEnabled(buttonShouldBeEnabled); // Update state to force re-render
  }, [config, originalConfig, strategyId, userMadeChanges]);

  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ];

  const years = ['2022', '2023', '2024', '2025'];

  const handleChange = (field, value) => {
    // Flip the "user made changes" flag immediately (synchronously) instead of
    // waiting for hasConfigChanged() to discover it later via an expensive
    // JSON.stringify(JSON.parse(...)) deep-clone comparison. This does not
    // change what the Save button does -- it only avoids doing a slow
    // comparison to arrive at an answer we already know for certain here.
    setUserMadeChanges(true);

    // NOTE: dte_filter is deliberately NOT here — it now holds the Index name
    // (e.g. "sensex"), not a number.
    const numericConfigFields = ['lot_size', 'strategy_sl_value',
                                 'strategy_target_value', 'overall_stop_loss_value', 
                                 'overall_target_value', 'lock_profit_value1', 'lock_profit_value2',
                                 'overall_reentry_sl_count', 'overall_reentry_tgt_count',
                                 'overall_instrument_move', 'overall_stoploss_move'];
    
    let processedValue = value;
    
    if (numericConfigFields.includes(field)) {
      if (value === '' || value === null || value === undefined) {
        processedValue = '';
      } else {
        const numValue = Number(value);
        if (numValue < 0) {
          setResponsePopup({ type: 'error', title: `${field.replace(/_/g, ' ')} cannot be negative` });
          return; // Don't update
        }
        processedValue = value;
      }
    }
    
    if (field === 'start_date' || field === 'end_date') {
      if (dataLoaded) {
        setDataLoaded(false);
        setDataStatus("Click 'Load Data' to begin");
      }
    }
    
    if (field === 'lock_profit_enabled' && !value) {
      processedValue = false; // Set toggle to false
    }
    
    const newConfig = { ...config, [field]: processedValue };
    
    if (field === 'lock_profit_enabled' && !value) {
      newConfig.lock_profit_value1 = '';
      newConfig.lock_profit_value2 = '';
    }
    
    if (field === 'dte_filter' && !isLoadingConfigRef.current) {
      const newExpiry = 'weekly';
      
      newConfig.legs = config.legs.map(leg => ({
        ...leg,
        expiry: newExpiry
      }));
      
      setCurrentLeg(prev => ({ ...prev, expiry: newExpiry }));
      
      if (dataLoaded) {
        setDataLoaded(false);
        setDataStatus(null);
      }
    }
    
    // DTE/strategy-type compatibility validations removed (Indian version).

    if (field === 'strategy_type') {
      // Every type except BTST resets legs to a points-based stop loss.
      if (value === 'intraday' || value === 'sequential' || value === 'positional') {
        newConfig.legs = config.legs.map(leg => ({
          ...leg,
          stop_loss_mode: 'points'
        }));
        setCurrentLeg(prev => ({ ...prev, stop_loss_mode: 'points' }));
        const toMinutes = (t) => {
          if (!t || t.length !== 5 || !t.includes(':')) return null;
          const [h, m] = t.split(':').map(Number);
          return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
        };
        const toHHMM = (mins) =>
          `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

        const entryMins = toMinutes(newConfig.entry_time);
        const exitMins = toMinutes(newConfig.exit_time);
        const LAST_MINUTE = 23 * 60 + 59;

        if (!isOvernightType(value)
          && entryMins !== null && exitMins !== null
          && exitMins <= entryMins && entryMins < LAST_MINUTE) {
          const defaultExit = toMinutes(DEFAULT_EXIT_TIME);
          const repaired = defaultExit !== null && defaultExit > entryMins
            ? DEFAULT_EXIT_TIME
            : toHHMM(Math.min(entryMins + 1, LAST_MINUTE));
          newConfig.exit_time = repaired;
          lastValidTimeRef.current.exit_time = repaired;
          setResponsePopup({
            type: 'info',
            title: `Exit Time set to ${repaired} — only BTST and Positional can exit before the entry time`,
          });
        }
      }
    }
    
    setConfig(newConfig);
    
    if (strategyId && strategyId !== -999 && strategyId !== '-999' && originalConfig) {
      setUserMadeChanges(true);
    } else {
    }
  };

  const handleNumberFocus = (e) => {
    setTimeout(() => e.target.select(), 0);
  };

  const handleLegChange = (field, value) => {
    if (field === 'expiry') {
    }
    
    const numericFields = ['lots', 'strike_value', 'premium_tolerance', 'lower_range', 'upper_range', 
                          'premium_value', 'target_value', 'stop_loss_value', 'trail_value', 
                          'trail_lock_value', 'momentum_value', 'reentry_tgt_count', 'reentry_sl_count'];
    
    if (numericFields.includes(field)) {
      if (value === '' || value === null || value === undefined) {
        setCurrentLeg(prev => ({ ...prev, [field]: '' }));
        return;
      }
      
      const numValue = Number(value);
      
      if (numValue < 0) {
        setResponsePopup({ type: 'error', title: `${field.replace(/_/g, ' ')} cannot be negative` });
        return; // Don't update the field
      }
      
      setCurrentLeg(prev => ({ ...prev, [field]: value }));
    } else {
      setCurrentLeg(prev => ({ ...prev, [field]: value }));
    }
  };


  // Memoized handler to update a single leg - stable reference prevents LegCard re-renders
  const updateLegInPlace = useCallback((legIndex, updatedFields) => {
    setConfig(prev => ({
      ...prev,
      legs: prev.legs.map((leg, i) => 
        i === legIndex ? { ...leg, ...updatedFields } : leg
      )
    }));
    
    if (strategyId && strategyId !== -999 && strategyId !== '-999' && originalConfig) {
      setUserMadeChanges(true);
    }
  }, [strategyId, originalConfig]); // Changed: wrapped in useCallback with functional setState

  const addLeg = () => {
    if (currentLeg.reentry_tgt_enabled && !currentLeg.target_enabled) {
      setResponsePopup({ 
        type: 'error', 
        title: 'Target must be selected first before enabling Re-entry Target.' 
      });
      return;
    }
    
    if (currentLeg.reentry_sl_enabled && !currentLeg.stop_loss_enabled) {
      setResponsePopup({ 
        type: 'error', 
        title: 'Stop Loss must be selected first before enabling Re-entry on SL.' 
      });
      return;
    }
    
    if (currentLeg.trail_enabled && !currentLeg.stop_loss_enabled) {
      setResponsePopup({ 
        type: 'error', 
        title: 'Stop Loss must be selected first before enabling Trail SL.' 
      });
      return;
    }
    
    
    
    let straddleId;
    
    const currentOptionType = currentLeg.option_type.toUpperCase();
    const oppositeType = currentOptionType === 'CALL' ? 'PUT' : 'CALL';
    
    const existingLegs = config.legs.filter(leg => !leg.isReentry);
    let foundPair = null;
    
    for (let i = existingLegs.length - 1; i >= 0; i--) {
      const leg = existingLegs[i];
      if (leg.option_type.toUpperCase() === oppositeType) {
        const hasPair = existingLegs.some(l => 
          l.straddle_id === leg.straddle_id && 
          l.option_type.toUpperCase() !== leg.option_type.toUpperCase()
        );
        
        if (!hasPair) {
          foundPair = leg;
          break;
        }
      }
    }
    
    if (foundPair) {
      straddleId = foundPair.straddle_id;
    } else {
      const maxStraddleId = existingLegs.reduce((max, leg) => 
        Math.max(max, leg.straddle_id || 0), 0
      );
      straddleId = maxStraddleId + 1;
    }
    
    
    const legWithTime = {
      ...currentLeg,
      id: nextLegId(),
      straddle_id: straddleId,
      option_type: (currentLeg.option_type || 'call').toLowerCase(),  // call/put
      position: (currentLeg.position || 'buy').toLowerCase(),  // buy/sell
      entry_time: currentLeg.entry_time || config.entry_time,  // Lock current time
      exit_time: currentLeg.exit_time || config.exit_time,     // Lock current time
      atm_percent_direction: currentLeg.atm_percent_direction || '+',
      atm_percent_value: currentLeg.atm_percent_value || '',
      lower_range: currentLeg.lower_range || '',
      upper_range: currentLeg.upper_range || '',
      closest_premium_value: currentLeg.closest_premium_value || ''
    };
    
    
    
    const newConfig = {
      ...config,
      legs: [...config.legs, legWithTime]
    };
    setConfig(newConfig);
    pendingScrollLegRef.current = legWithTime.id;
  };


  const createLazyLeg = () => {
    
    const existingLazyLegs = config.legs.filter(leg => leg.isLazyLeg);
    const lazyLegNumber = existingLazyLegs.length + 1;
    
    const displayName = lazyLegConfig.customName.trim() 
      ? lazyLegConfig.customName.trim() 
      : `lazy${lazyLegNumber}`;
    
    const lazyLeg = {
      id: nextLegId(),
      isLazyLeg: true,  // Mark as lazy leg
      lazyLegNumber: lazyLegNumber,  // For display purposes
      customName: displayName,  // NEW: Store the custom or default name
      
      lots: lazyLegConfig.lots || 1,
      expiry: lazyLegConfig.expiry || 'weekly',
      position: lazyLegConfig.position || 'buy',
      option_type: lazyLegConfig.option_type || 'call',
      
      strike_criteria: lazyLegConfig.strike_criteria || 'based on points',
      strike_type: lazyLegConfig.atm_strike || 'atm',
      atm_percent_direction: lazyLegConfig.atm_percent_direction || '+',
      atm_percent_value: lazyLegConfig.atm_percent_value || '',
      closest_premium_value: lazyLegConfig.closest_premium_value || '',
      lower_range: lazyLegConfig.lower_range || '',
      upper_range: lazyLegConfig.upper_range || '',
      
      target_enabled: lazyLegConfig.target_enabled || false,
      target_mode: lazyLegConfig.target_type || 'points',
      target_value: lazyLegConfig.target_value || '',
      
      stop_loss_enabled: lazyLegConfig.stop_loss_enabled || false,
      stop_loss_mode: lazyLegConfig.stop_loss_type || 'points',
      stop_loss_value: lazyLegConfig.stop_loss_value || '',
      
      trail_enabled: lazyLegConfig.trail_sl_enabled || false,
      trail_mode: lazyLegConfig.trail_sl_type || 'points',
      trail_value: lazyLegConfig.trail_sl_value || '',
      trail_lock_value: lazyLegConfig.trail_sl_lock_value || '',
      
      reentry_tgt_enabled: lazyLegConfig.reentry_tgt_enabled || false,
      reentry_tgt_mode: lazyLegConfig.reentry_tgt_mode || 're_asap',
      reentry_tgt_count: lazyLegConfig.reentry_tgt_count || '1',
      
      reentry_sl_enabled: lazyLegConfig.reentry_sl_enabled || false,
      reentry_sl_mode: lazyLegConfig.reentry_sl_mode || 're_asap',
      reentry_sl_count: lazyLegConfig.reentry_sl_count || '1',
      
      momentum_enabled: lazyLegConfig.momentum_enabled || false,
      momentum_type: lazyLegConfig.momentum_type || 'points',
      momentum_value: lazyLegConfig.momentum_value || '',
      
      range_breakout_enabled: lazyLegConfig.range_breakout_enabled || false,
      range_instrument: lazyLegConfig.range_instrument || 'underlying',
      range_time: lazyLegConfig.range_time || '',
      range_direction: lazyLegConfig.range_direction || 'high',
      
      entry_time: config.entry_time,
      exit_time: config.exit_time,
      
      straddle_id: Date.now() % 10000  // Simple ID for lazy legs
    };
    
    
    const updatedLegs = [...config.legs, lazyLeg];
    
    if (lazyLegContext && lazyLegContext.legIndex !== undefined) {
      const parentLegIndex = lazyLegContext.legIndex;
      const fieldToUpdate = lazyLegContext.type === 'target' ? 'reentry_tgt_mode' : 'reentry_sl_mode';
      
      updatedLegs[parentLegIndex] = {
        ...updatedLegs[parentLegIndex],
        [fieldToUpdate]: `lazy_leg_${lazyLeg.id}` // Store lazy leg ID
      };
      
    }
    
    const newConfig = {
      ...config,
      legs: updatedLegs
    };
    setConfig(newConfig);
    // Bring the newly created lazy leg into view, the same way Add / Copy do.
    pendingScrollLegRef.current = lazyLeg.id;

    setShowLazyLegModal(false);
    setLazyLegContext(null);
    setLazyLegConfig({
      customName: '',
      lots: 1,
      expiry: 'weekly',
      position: 'buy',
      option_type: 'call',
      strike_criteria: 'based on points',
      atm_strike: 'atm',
      atm_percent_direction: '+',
      atm_percent_value: '',
      closest_premium_value: '',
      lower_range: '',
      upper_range: '',
      premium_value: '',
      target_enabled: false,
      target_type: 'points',
      target_value: '0.00',
      stop_loss_enabled: false,
      stop_loss_type: 'points',
      stop_loss_value: '0.00',
      trail_sl_enabled: false,
      trail_sl_type: 'points',
      trail_sl_value: '0.00',
      trail_sl_lock_value: '0.00',
      reentry_tgt_enabled: false,
      reentry_tgt_mode: 're_asap',
      reentry_tgt_count: '1',
      reentry_sl_enabled: false,
      reentry_sl_mode: 're_asap',
      reentry_sl_count: '1',
      momentum_enabled: false,
      momentum_type: 'points',
      momentum_value: '0.00',
      range_breakout_enabled: false,
      range_instrument: 'underlying',
      range_time: '',
      range_direction: 'high'
    });
    
  };

  const removeLeg = useCallback((id) => {
    // Removing a main leg also removes the sequential leg attached to it,
    // otherwise the child is orphaned and never renders again.
    const remaining = config.legs.filter(leg => leg.id !== id && leg.parentLegId !== id);

    // Scroll to the nearest surviving leg *before* the one being deleted.
    const removedIndex = config.legs.findIndex(l => l.id === id);
    for (let i = removedIndex - 1; i >= 0; i--) {
      if (remaining.some(r => r.id === config.legs[i].id)) {
        pendingScrollLegRef.current = config.legs[i].id;
        break;
      }
    }

    setConfig(prev => ({ ...prev, legs: remaining }));
  }, [config.legs]);

  const openSequentialLegModal = useCallback((parentLeg) => {
    const existing = config.legs.find(l => l.isSequentialLeg && l.parentLegId === parentLeg.id);
    if (existing) {
      const label = existing.customName && !/^SEQ\d+$/i.test(existing.customName)
        ? existing.customName
        : `SEQ${mainLegPosition(config.legs, parentLeg.id)}`;
      setResponsePopup({ type: 'error', title: `${label} already created` });
      return;
    }
    setSequentialLegParentId(parentLeg.id);
    setShowSequentialLegModal(true);
  }, [config.legs]);

  const duplicateLeg = useCallback((legIndex, leg) => {
    const updated = [...config.legs];
    let duplicatedLeg = { ...leg, id: nextLegId() };
    let insertAt = legIndex + 1;

    if (leg.isLazyLeg) {
      const existingLazyLegs = updated.filter(l => l.isLazyLeg);
      duplicatedLeg.lazyLegNumber = existingLazyLegs.length + 1;
      // Copy naming: lazy2 -> lazy3 (next in the lazyN sequence); a custom name
      // like "densi" -> densi1 -> densi2 ... (always unique among lazy legs).
      const currentName = (leg.customName || `lazy${leg.lazyLegNumber}`).trim();
      const takenNames = new Set(existingLazyLegs.map(l => (l.customName || `lazy${l.lazyLegNumber}`).trim()));
      let newName;
      if (/^lazy\d+$/.test(currentName)) {
        let n = 0;
        takenNames.forEach(nm => { const m = nm.match(/^lazy(\d+)$/); if (m) n = Math.max(n, parseInt(m[1], 10)); });
        newName = `lazy${n + 1}`;
      } else {
        const m = currentName.match(/^(.*?)(\d+)$/);
        const root = m ? m[1] : currentName;
        const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let n = 0;
        takenNames.forEach(nm => {
          const mm = nm.match(new RegExp('^' + escaped + '(\\d+)$'));
          if (mm) n = Math.max(n, parseInt(mm[1], 10));
        });
        newName = `${root}${n + 1}`;
      }
      duplicatedLeg.customName = newName;
    } else if (leg.isSequentialLeg) {
      const mainLegs = updated.filter(l => !l.isLazyLeg && !l.isSequentialLeg);
      const target = mainLegs.find(
        m => !updated.some(sl => sl.isSequentialLeg && sl.parentLegId === m.id)
      );

      if (!target) {
        setResponsePopup({ type: 'error', title: 'Every leg already has a sequential leg' });
        return;
      }

      const targetNumber = mainLegs.findIndex(m => m.id === target.id) + 1;
      duplicatedLeg.parentLegId = target.id;
      duplicatedLeg.sequentialLegNumber = targetNumber;
      duplicatedLeg.customName = `SEQ${targetNumber}`;
      insertAt = updated.findIndex(l => l.id === target.id) + 1;
    }

    updated.splice(insertAt, 0, duplicatedLeg);
    setConfig(prev => ({ ...prev, legs: updated }));
    pendingScrollLegRef.current = duplicatedLeg.id;
  }, [config.legs]);

  const clearAllLegs = () => {
    const newConfig = { ...config, legs: [] };
    setConfig(newConfig);
  };
  const handleSubmit = async () => {
    let updatedStrategyId = strategyId;
    let updatedStrategyName = config.strategy_name || contextStrategyName;
    let updatedVersion = contextVersion;

    if (!config.start_date || !config.end_date) {
      setResponsePopup({ type: 'error', title: 'Please select both start and end dates' });
      return;
    }
    
    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFormatRegex.test(config.start_date) || !dateFormatRegex.test(config.end_date)) {
      logger.error('[BACKTEST] Invalid date format:', {
        start_date: config.start_date,
        end_date: config.end_date
      });
      setResponsePopup({ type: 'error', title: 'Please select valid Start and End dates' });
      return;
    }
    
    if (new Date(config.end_date) < new Date(config.start_date)) {
      setResponsePopup({ type: 'error', title: 'End date must be after start date' });
      return;
    }

    /*
      The "Please load data first" gate is gone with the Load Data button.
      Preparing data is the user's own step now, so the backtest goes straight
      out and the backend answers for whatever it has.
    */
    
    if (!config.strategy_type) {
      setResponsePopup({ type: 'error', title: 'Please select a strategy type' });
      return;
    }
    
    if (config.legs.length === 0) {
      setResponsePopup({ type: 'error', title: 'Please add at least one leg' });
      return;
    }

    // Sequential strategy: every main leg must carry a sequential leg.
    if (config.strategy_type === 'sequential') {
      const missing = config.legs
        .filter(l => !l.isLazyLeg && !l.isSequentialLeg)
        .filter(l => !config.legs.some(s => s.isSequentialLeg && s.parentLegId === l.id))
        .map(l => `LEG #${mainLegPosition(config.legs, l.id)}`);

      if (missing.length > 0) {
        setResponsePopup({ type: 'error', title: `Please add sequential leg for ${missing.join(', ')}` });
        return;
      }
    }

    const timeError = entryExitError(config.strategy_type, config.entry_time, config.exit_time);
    if (timeError) {
      setResponsePopup({ type: 'error', title: timeError });
      return;
    }


    const legsError = noLegsError(config);
    if (legsError) {
      setResponsePopup({ type: 'error', title: legsError });
      return;
    }

  
    const rangeDteError = rangeBreakoutDteError(config);
    if (rangeDteError) {
      setResponsePopup({ type: 'error', title: rangeDteError });
      return;
    }

 
    const dayError = positionalDayError(config.positional_entry_day, config.positional_exit_day);
    if (dayError) {
      setResponsePopup({ type: 'error', title: dayError });
      return;
    }

 
    const expiryError = positionalExpiryError();
    if (expiryError) {
      setResponsePopup({ type: 'error', title: expiryError });
      return;
    }


    if (config.delay_restart_enabled) {
      const delayError = delayRestartError(config.delay_restart_time);
      if (delayError) {
        setResponsePopup({ type: 'error', title: delayError });
        return;
      }
    }


    const reallyChanged = (() => {
      if (!originalConfig) return false;
      try {
        const a = { ...config, currentLeg: undefined, dataLoaded: undefined };
        const b = { ...originalConfig, currentLeg: undefined, dataLoaded: undefined };
        return JSON.stringify(a) !== JSON.stringify(b);
      } catch { return userMadeChanges; }
    })();

    if (strategyId && strategyId !== -999 && strategyId !== '-999' && reallyChanged) {
      try {
        const saveResult = await onSaveStrategy(
          { ...config, strategy_name: config.strategy_name || contextStrategyName },
          { silent: true },
        );

        if (!saveResult) {
          // Save failed
          setResponsePopup({
            type: 'error',
            title: 'Failed to save changes. Please try again.'
          });
          logger.error('[BACKTEST] Auto-save failed: No result returned');
          return; // Don't proceed with backtest
        }

        // CRITICAL: Extract updated strategy info from save result
        updatedStrategyId = saveResult.strategy_id || saveResult.data?.strategy_id || strategyId;
        updatedStrategyName = saveResult.strategy_name || saveResult.data?.strategy_name || config.strategy_name;
        updatedVersion = saveResult.version || saveResult.data?.version || contextVersion || 1;

        console.log('[BACKTEST] Auto-save completed, updated values:', {
          strategy_id: updatedStrategyId,
          strategy_name: updatedStrategyName,
          version: updatedVersion
        });

     
        setResponsePopup(null);
      } catch (error) {
        // Save failed - show error and stop
        setResponsePopup({
          type: 'error',
          title: 'Failed to save changes. Please try again.'
        });
        logger.error('[BACKTEST] Auto-save failed:', error);
        return; // Don't proceed with backtest
      }
    }


    const toNumber = (val) => (val === '' || val === null || val === undefined) ? 0 : Number(val);

    const formatTime = (time) => {
      if (!time) return '00:00:00';
      const parts = time.split(':');
      return `${(parts[0] || '00').padStart(2, '0')}:${(parts[1] || '00').padStart(2, '0')}:00`;
    };

    const formatStrikeTypeForBackend = (strikeType) => {
      if (!strikeType || strikeType === 'atm') return 'ATM';
      const lc = strikeType.toLowerCase();
      if (lc.startsWith('itm_')) {
        const n = parseInt(lc.replace('itm_', ''), 10);
        return `ITM-${isNaN(n) ? 1 : n}`;
      }
      if (lc.startsWith('otm_')) {
        const n = parseInt(lc.replace('otm_', ''), 10);
        return `OTM-${isNaN(n) ? 1 : n}`;
      }
      return 'ATM';
    };

    const strikeCriteriaMap = {
      'based on points': 'based on points',           // lowercase
      'closest premium': 'closest premium',           // lowercase
      'based on atm percent': 'atm percentage',       // Map to 'atm percentage' (backend name)
      'premium range': 'premium range',               // lowercase
      'based on premium range': 'premium range',      // Map to 'premium range' (without "based on")
      'based_on_points': 'based on points',
      'closest_premium': 'closest premium',
      'based_on_atm_percent': 'atm percentage',
      'premium_range': 'premium range',
    };
    
    const getMappedStrikeCriteria = (criteria) => {
      if (!criteria) return 'closest premium';
      const normalized = criteria.toLowerCase().trim();
      const mapped = strikeCriteriaMap[normalized] || criteria;
      return mapped;
    };

    const isPremiumRange = (criteria) => !!criteria && getMappedStrikeCriteria(criteria) === 'premium range';
    const isClosestPremium = (criteria) => !!criteria && getMappedStrikeCriteria(criteria) === 'closest premium';

    const typeMap = {
      'points':                'POINTS',
      'percentage':            'PERCENT',
      'percent':               'PERCENT',
      'mtm':                   'MTM',
      'underlying_points':     'UNDERLYING_POINTS',
      'underlying_percentage': 'UNDERLYING_PERCENT',
    };

    const normalizeType = (typeValue) => {
      if (!typeValue) return 'POINTS';
      const lower = typeValue.toLowerCase();
      return typeMap[lower] || typeValue.toUpperCase();
    };

    const momentumModeMap = {
      'points':                       'POINTS_UP',
      'points_down':                  'POINTS_DOWN',
      'percentage':                   'PERCENT_UP',
      'percentage_down':              'PERCENT_DOWN',
      'underlying_points_up':         'UNDERLYING_POINTS_UP',
      'underlying_points_down':       'UNDERLYING_POINTS_DOWN',
      'underlying_percentage_up':     'UNDERLYING_PERCENT_UP',
      'underlying_percentage_down':   'UNDERLYING_PERCENT_DOWN',
      'percent_up':                   'PERCENT_UP',
      'percent_down':                 'PERCENT_DOWN',
    };

    const normalizeMomentumType = (momentumMode) => {
      if (!momentumMode) return 'POINTS_UP';
      const lower = String(momentumMode).toLowerCase();
      return momentumModeMap[lower] || String(momentumMode).toUpperCase();
    };

    const reentryModeMap = {
      're_asap':              'RE_ASAP',
      're_asap_reverse':      'RE_ASAP_REVERSE',
      're_momentum':          'RE_MOMENTUM',
      're_momentum_reverse':  'RE_MOMENTUM_REVERSE',
      're_cost':              'RE_COST',
      're_cost_reverse':      'RE_COST_REVERSE',
    };

    const buildLegObject = (leg, idx, allLegs) => {
      
      
      
      
      const actualPremiumValue = (leg.strike_criteria === 'closest premium' || leg.strike_criteria === 'closest_premium')
        ? toNumber(leg.strike_value)
        : ((leg.strike_criteria === 'premium range' || leg.strike_criteria === 'premium_range') ? toNumber(leg.premium_tolerance) : 0);
      
      
      const atmOperatorValue = (() => {
        const direction = leg.atm_percent_direction;
        if (direction === '+') return '+';
        if (direction === '-') return '-';
        return '+';
      })();
      
      const legObject = {
        ...(leg.isLazyLeg && { leg_name: leg.customName || `lazy${leg.lazyLegNumber}` || null }),
        lot_size:             toNumber(leg.lots),
        position_type:        (leg.position || 'buy').toUpperCase(),
        option_type:          (leg.option_type || 'call').toLowerCase(),
        expiry_type:          leg.expiry ? leg.expiry : 'weekly',
        strike_criteria:      getMappedStrikeCriteria(leg.strike_criteria).toLowerCase(),
        atm_strike:           (leg.strike_criteria === 'based on points' || leg.strike_criteria === 'based_on_points' ||
                               leg.strike_criteria === 'based on atm percent' || leg.strike_criteria === 'based_on_atm_percent' ||
                               leg.strike_criteria === 'atm percentage')
                              ? formatStrikeTypeForBackend(leg.strike_type)
                              : null,
        strike_sign:          (leg.strike_criteria === 'based on atm percent' || 
                               leg.strike_criteria === 'based_on_atm_percent' ||
                               leg.strike_criteria === 'atm percentage')
                              ? (leg.atm_percent_direction === '-' ? '-' : '+')
                              : '',   // ITM/OTM: the direction is already in atm_strike
        premium_value:        isClosestPremium(leg.strike_criteria)
                                ? toNumber(leg.closest_premium_value ?? leg.strike_value)
                                : (isPremiumRange(leg.strike_criteria) ? toNumber(leg.premium_tolerance) : 0),
        lower_range:          isPremiumRange(leg.strike_criteria) ? toNumber(leg.lower_range) : 0,
        upper_range:          isPremiumRange(leg.strike_criteria) ? toNumber(leg.upper_range) : 0,
        multiplier_percentage: (leg.strike_criteria === 'based on atm percent' || 
                               leg.strike_criteria === 'based_on_atm_percent' ||
                               leg.strike_criteria === 'atm percentage')
                              ? toNumber(leg.atm_percent_value)
                              : toNumber(leg.multiplier_percentage),
        is_target:            leg.target_enabled || false,
        target_type:          normalizeType(leg.target_mode),
        target_value:         toNumber(leg.target_value),
        is_stoploss:          leg.stop_loss_enabled || false,
        stoploss_type:        normalizeType(leg.stop_loss_mode),
        stoploss_value:       toNumber(leg.stop_loss_value),
        is_trail_sl:          leg.trail_enabled || false,
        trail_sl_type:        leg.trail_enabled ? normalizeType(leg.trail_mode) : null,
        instrument_moves:     leg.trail_enabled ? toNumber(leg.trail_value) : null,
        stoploss_moves:       leg.trail_enabled ? toNumber(leg.trail_lock_value) : null,
        is_reentry_sl:        leg.reentry_sl_enabled || false,
        reentry_sl_type:      null,
        reentry_sl_value:     0,
        is_reentry_target:    leg.reentry_tgt_enabled || false,
        reentry_target_type:  null,
        reentry_target_value: 0,
        is_simple_momentum:   leg.momentum_enabled || false,
        momentum_type:        normalizeMomentumType(leg.momentum_mode || leg.momentum_type),
        momentum_value:       toNumber(leg.momentum_value),
        ...(leg.isLazyLeg ? {} : {
          is_range_breakout:    leg.range_enabled || false,
          range_breakout_type:  leg.range_enabled ? (leg.range_instrument === 'instrument' ? 'Instrument' : 'Underlying') : null,
          // End of the breakout window. BTST sends "today"/"tomorrow"; Positional
      // sends the DTE number AS A STRING. Must stay identical to the save
      // builder in strategyApi.js.
      range_end_day: (() => {
        if (!leg.range_enabled) return null;
        const st = (config.strategy_type || '').toLowerCase();
        const v = String(leg.range_end_day ?? '');
        // Each type accepts only ITS OWN shape — must match strategyApi.js.
        if (st === 'btst') return (v === 'today' || v === 'tomorrow') ? v : 'today';
        if (st === 'positional') return /^\d+$/.test(v) ? v : '0';
        return null;
      })(),
      range_end_time:       leg.range_enabled ? formatTime(leg.range_time) : null,
          range_on:             leg.range_enabled ? ((leg.range_direction || 'high').charAt(0).toUpperCase() + (leg.range_direction || 'high').slice(1)) : null,
        }),
      };

      if (leg.reentry_sl_enabled) {
        if (!leg.isSequentialLeg && leg.reentry_sl_mode && leg.reentry_sl_mode.startsWith('lazy_leg_')) {
          const lazyLegId = parseInt(leg.reentry_sl_mode.replace('lazy_leg_', ''));
          const referencedLazyLeg = allLegs.find(l => l.id === lazyLegId);
          
          if (referencedLazyLeg) {
            legObject.reentry_sl_type = 'LAZY_LEG';
            legObject.reentry_sl_value = 1;
            legObject.lazy_leg = buildLegObject(referencedLazyLeg, idx, allLegs);
            if (referencedLazyLeg.customName) {
              legObject.lazy_leg.leg_name = referencedLazyLeg.customName;
            }
          } else {
            legObject.reentry_sl_type = 'RE_ASAP';
            legObject.reentry_sl_value = toNumber(leg.reentry_sl_count);
          }
        } else {
          legObject.reentry_sl_type = reentryModeMap[leg.reentry_sl_mode] || (leg.reentry_sl_mode ? leg.reentry_sl_mode.toUpperCase() : 'RE_ASAP');
          legObject.reentry_sl_value = toNumber(leg.reentry_sl_count);
        }
      } else {
        legObject.reentry_sl_value = 0;
      }

      if (leg.reentry_tgt_enabled) {
        if (!leg.isSequentialLeg && leg.reentry_tgt_mode && leg.reentry_tgt_mode.startsWith('lazy_leg_')) {
          const lazyLegId = parseInt(leg.reentry_tgt_mode.replace('lazy_leg_', ''));
          const referencedLazyLeg = allLegs.find(l => l.id === lazyLegId);
          
          if (referencedLazyLeg) {
            legObject.reentry_target_type = 'LAZY_LEG';
            legObject.reentry_target_value = 1;
            if (!legObject.lazy_leg) {
              legObject.lazy_leg = buildLegObject(referencedLazyLeg, idx, allLegs);
              if (referencedLazyLeg.customName) {
                legObject.lazy_leg.leg_name = referencedLazyLeg.customName;
              }
            }
          } else {
            legObject.reentry_target_type = 'RE_ASAP';
            legObject.reentry_target_value = toNumber(leg.reentry_tgt_count);
          }
        } else {
          legObject.reentry_target_type = reentryModeMap[leg.reentry_tgt_mode] || (leg.reentry_tgt_mode ? leg.reentry_tgt_mode.toUpperCase() : 'RE_ASAP');
          legObject.reentry_target_value = toNumber(leg.reentry_tgt_count);
        }
      } else {
        legObject.reentry_target_value = 0;
      }

      return legObject;
    };

    const allLegs = config.legs;
    const mainLegs = allLegs.filter(leg => !leg.isLazyLeg && !leg.isSequentialLeg);
    
    const legsArray = mainLegs.map((leg, idx) => {
      const legObject = buildLegObject(leg, idx, allLegs);
      
      if (config.strategy_type === 'sequential') {
        const sequentialLeg = allLegs.find(l => l.isSequentialLeg && l.parentLegId === leg.id);

        if (sequentialLeg) {
          const sequentialLegObject = buildLegObject(sequentialLeg, idx, allLegs);
          sequentialLegObject.leg_name = sequentialLeg.customName || `SEQ${sequentialLeg.sequentialLegNumber}`;
          legObject.sequential_leg = sequentialLegObject;
        }
      }
      
      return legObject;
    });

    config.legs.forEach((leg, i) => {
    });

    
    const resolvedStrategyId = updatedStrategyId || strategyId || -999;
    const isUnsavedStrategy =
      !resolvedStrategyId || resolvedStrategyId === -999 || resolvedStrategyId === '-999';

    const isPositional = (config.strategy_type || '').toLowerCase() === 'positional';

    const isDelayRestartOn =
      ['btst', 'positional'].includes((config.strategy_type || '').toLowerCase())
      && Boolean(config.delay_restart_enabled);

    const strategyObject = {
      strategy_id:                     resolvedStrategyId,  // Use updated ID from save result
      strategy_name:                   updatedStrategyName || config.strategy_name || contextStrategyName || null,
      version:                         isUnsavedStrategy
                                         ? 0
                                         : (updatedVersion || contextVersion || 1),
      // Index dropdown selection (Data Selection section).
      symbol:                          config.dte_filter,
      start_date:                      config.start_date,
      end_date:                        config.end_date,
      underlying_type:                 config.underlying_from === 'futures' ? 'futures' : 'cash',
      is_squareoff:                    config.square_off === 'complete',
      is_trail_sl_break_even:          config.trail_to_be || false,
      trail_sl_break_even_type:        config.trail_sl_break_even_type && config.trail_sl_break_even_type !== 'na' ? normalizeType(config.trail_sl_break_even_type) : 'POINTS',
      strategy_type:                   (config.strategy_type || 'intraday').toUpperCase(),
      // Positional-only keys — must stay identical to strategyApi.js.
      ...(isPositional ? {
        positional_expire_on:          config.positional_expiry || 'weekly',
        positional_entry_day:          toNumber(config.positional_entry_day),
        positional_exit_day:           toNumber(config.positional_exit_day),
      } : {}),
      entry_time:                      formatTime(config.entry_time),
      entry_delay:                     0,
      exit_time:                       formatTime(config.exit_time),
      exit_delay:                      0,
      is_delay_restart:                isDelayRestartOn,
      delay_restart_time:              isDelayRestartOn ? formatTime(config.delay_restart_time || MARKET_OPEN_TIME) : null,
      is_strategy_sl:                  config.overall_stop_loss_enabled || false,
      strategy_sl_type:                normalizeType(config.overall_stop_loss_mode),
      strategy_sl_value:               toNumber(config.overall_stop_loss_value),
      is_strategy_target:              config.overall_target_enabled || false,
      strategy_target_type:            normalizeType(config.overall_target_mode),
      strategy_target_value:           toNumber(config.overall_target_value),
      is_overall_reentry_sl:           config.overall_reentry_sl_enabled || false,
      overall_reentry_sl_type:         config.overall_reentry_sl_enabled ? (reentryModeMap[config.overall_reentry_sl_mode] || (config.overall_reentry_sl_mode ? config.overall_reentry_sl_mode.toUpperCase() : 'RE_ASAP')) : null,
      overall_reentry_sl_value:        config.overall_reentry_sl_enabled ? toNumber(config.overall_reentry_sl_count) : 0,
      is_overall_reentry_target:       config.overall_reentry_tgt_enabled || false,
      overall_reentry_target_type:     config.overall_reentry_tgt_enabled ? (reentryModeMap[config.overall_reentry_tgt_mode] || (config.overall_reentry_tgt_mode ? config.overall_reentry_tgt_mode.toUpperCase() : 'RE_ASAP')) : null,
      overall_reentry_target_value:    config.overall_reentry_tgt_enabled ? toNumber(config.overall_reentry_tgt_count) : 0,
      is_overall_trail_sl:             config.lock_profit_enabled || false,
      // Overall Trail SL's MTM option is reported to the backend as POINTS.
      overall_trail_sl_type:           config.lock_profit_enabled
                                         ? (String(config.lock_profit_mode || 'mtm').toLowerCase() === 'mtm'
                                             ? 'POINTS'
                                             : normalizeType(config.lock_profit_mode))
                                         : 'POINTS',
      overall_instrument_move:         config.lock_profit_enabled ? toNumber(config.lock_profit_value1) : 0,
      overall_stoploss_move:           config.lock_profit_enabled ? toNumber(config.lock_profit_value2) : 0,
      leg_count:                       legsArray.length,
    };

    const backtestPayload = {
      strategy: strategyObject,
      legs: legsArray,
    };

    backtestPayload.legs.forEach((leg, idx) => {
    });
    backtestPayload.legs.forEach((leg, idx) => {
    });

    sendBacktestRequest(backtestPayload);
  };

  const sendBacktestRequest = async (payload) => {
    try {
      // Log the strategy info being sent to backend
      console.log('[BACKTEST] Sending payload with strategy info:', {
        strategy_id: payload.strategy.strategy_id,
        strategy_name: payload.strategy.strategy_name,
        version: payload.strategy.version
      });

      const payloadValidation = validatePayload(payload);
      if (!payloadValidation.isValid) {
        logger.error('[BACKTEST] PAYLOAD VALIDATION FAILED:');
        logger.error('[BACKTEST] Missing Fields:', payloadValidation.missingFields);
        logger.error('[BACKTEST] Invalid Types:', payloadValidation.invalidTypes);
        setResponsePopup({ type: 'error', title: `Payload Validation Error:\n${payloadValidation.missingFields.join('\n')}` });
        return;
      }

      
      payload.legs.forEach((leg, index) => {
        if (leg.is_range_breakout) {
        } else {
        }
      });

      onRunBacktest(payload);

    } catch (error) {
      logger.error('[BACKTEST] CRITICAL ERROR IN BACKTEST HANDLER');
      logger.error('[BACKTEST] Error:', error.message);
      setResponsePopup({ type: 'error', title: `Backtest Error: ${error.message}` });
    }
  };


  const startBacktestRef = useRef(null);
  useEffect(() => {
    startBacktestRef.current = handleSubmit;
  });

  useEffect(() => {
    const onKeyDown = (e) => {
      // Shift+Enter only — the shortcut shown on the button.
      if (e.key !== 'Enter' || e.repeat || !e.shiftKey) return;
      if (isLoading || isLoadingStrategy || document.querySelector('.fixed.inset-0')) return;
      e.preventDefault();
      startBacktestRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLoading, isLoadingStrategy]);

  const validatePayload = (payload) => {
    const missingFields = [];
    const invalidTypes = [];
    
    // action and dte_filter were dropped from the payload entirely, so the
    // validator must not demand them — it silently refused every backtest when
    // it did, with only a console error to show for it.
    const requiredStrategyFields = [
      'strategy_name', 'symbol', 'start_date', 'end_date',
      'underlying_type', 'is_squareoff', 'is_trail_sl_break_even',
      'strategy_type', 'entry_time', 'exit_time', 'leg_count'
    ];
    
    const requiredLegFields = [
      'lot_size', 'position_type', 'option_type', 'expiry_type',
      'strike_criteria', 'atm_strike', 'strike_sign', 'premium_value',
      'is_target', 'target_type', 'target_value',
      'is_stoploss', 'stoploss_type', 'stoploss_value',
      'is_trail_sl', 'is_reentry_sl', 'is_reentry_target',
      'is_simple_momentum', 'is_range_breakout'
    ];
    
    if (!payload.strategy) {
      missingFields.push('strategy: object is missing');
      return { isValid: false, missingFields, invalidTypes };
    }
    
    for (const field of requiredStrategyFields) {
      if (!(field in payload.strategy)) {
        missingFields.push(`strategy.${field}`);
      }
    }
    
    // dte_filter is intentionally always null now — expiry travels per-leg
    // as expiry_type — so it is no longer type-checked here.
    if (typeof payload.strategy.is_squareoff !== 'boolean') {
      invalidTypes.push(`strategy.is_squareoff should be boolean, got ${typeof payload.strategy.is_squareoff}`);
    }
    
    if (!Array.isArray(payload.legs)) {
      missingFields.push('legs: array is missing or not an array');
      return { isValid: false, missingFields, invalidTypes };
    }
    
    if (payload.legs.length === 0) {
      missingFields.push('legs: array is empty, must have at least one leg');
      return { isValid: false, missingFields, invalidTypes };
    }
    
    for (let i = 0; i < payload.legs.length; i++) {
      const leg = payload.legs[i];
      for (const field of requiredLegFields) {
        if (!(field in leg)) {
          missingFields.push(`legs[${i}].${field}`);
        }
      }
      
      if (typeof leg.lot_size !== 'number') {
        invalidTypes.push(`legs[${i}].lot_size should be number, got ${typeof leg.lot_size}`);
      }
      if (typeof leg.is_target !== 'boolean') {
        invalidTypes.push(`legs[${i}].is_target should be boolean, got ${typeof leg.is_target}`);
      }
    }
    
    const isValid = missingFields.length === 0 && invalidTypes.length === 0;
    
    
    return { isValid, missingFields, invalidTypes };
  };

  const downloadCSV = async () => {
    try {
      const response = await fetch(`${API_URL}/backtest/export-csv`, {
        method: 'GET',
        headers: {
          'Accept': 'text/csv'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download CSV');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'backtest_report.csv';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('CSV download error:', error);
      let errorMsg = error.message;
      if (errorMsg.includes('No backtest results')) {
        errorMsg = 'Please run a backtest first before downloading CSV.';
      } else if (errorMsg.includes('No trades found')) {
        errorMsg = 'No trades to export. Try running backtest with different settings.';
      }
      setResponsePopup({ type: 'error', title: 'CSV Download Failed: ' + errorMsg });
    }
  };

  const downloadExcel = async () => {
    try {
      const response = await fetch(`${API_URL}/backtest/export-excel`, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download Excel');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backtest_report.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Excel download error:', error);
      let errorMsg = error.message;
      if (errorMsg.includes('No backtest results')) {
        errorMsg = 'Please run a backtest first before downloading Excel.';
      } else if (errorMsg.includes('No trades found')) {
        errorMsg = 'No trades to export. Try running backtest with different settings.';
      }
      setResponsePopup({ type: 'error', title: 'Excel Download Failed: ' + errorMsg });
    }
  };

  const handleCompareBacktest = async () => {
    
    if (!strategyId || strategyId === -999 || strategyId === '-999') {
      logger.error('[Compare] Invalid strategy ID:', strategyId);
      setResponsePopup({ type: 'error', title: 'Please save the strategy before comparing backtests' });
      return;
    }
    
    if (!config.strategy_name) {
      logger.error('[Compare] Missing strategy name');
      setResponsePopup({ type: 'error', title: 'Please save the strategy with a name first' });
      return;
    }
    
    try {
      setLoadingCompare(true);
      
      // REMOVED DELAY - Fetch immediately for instant response
      console.log('[Compare] Fetching compare data with:', { strategyId, strategyName: config.strategy_name });
      const result = await compareBacktests(strategyId, config.strategy_name);
      
      console.log('[Compare] ===== COMPARE API RESPONSE =====');
      console.log('[Compare] Success:', result.success);
      console.log('[Compare] Total versions returned:', result.data?.length || 0);
      console.log('[Compare] Full data:', JSON.stringify(result.data, null, 2));
      console.log('[Compare] =====================================');
      
      if (result.data && Array.isArray(result.data)) {
        console.log('[Compare] Versions detail:', result.data.map(v => ({ 
          version: v.version, 
          created_at: v.created_at,
          overall_mtm: v.overall_mtm,
          strategy_id: v.strategy_id,
          strategy_name: v.strategy_name
        })));
      }
      
      if (result.success) {
        if (!result.data || result.data.length === 0) {
          setResponsePopup({ type: 'error', title: 'Run a backtest first to generate comparison data' });
          return;
        }
        setCompareData(result.data);
        setCompareSidebarOpen(true);
      } else {
        throw new Error(result.message || 'Failed to fetch comparison data');
      }
    } catch (error) {
      logger.error('[Compare] ===== ERROR =====');
      logger.error('[Compare] Error object:', error);
      logger.error('[Compare] Error message:', error.message);
      logger.error('[Compare] Error stack:', error.stack);
      setResponsePopup({ type: 'error', title: `Failed to load comparison data:\n\n${error.message}` });
    } finally {
      setLoadingCompare(false);
    }
  };

  const handleScrollToParameters = () => {
    if (dataSelectionRef.current) {
      // Close the compare sidebar first
      setCompareSidebarOpen(false);
      
      setTimeout(() => {
        dataSelectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }, 300);
    }
  };

  const loadData = async () => {

    if (!config.start_date || !config.end_date) {
      const errorMsg = 'Please select both Start Date and End Date before loading data';
      logger.error('[Load Data]', errorMsg);
      setDataStatus(errorMsg);
      setResponsePopup({ type: 'error', title: errorMsg });
      return;
    }
    if (new Date(config.end_date) < new Date(config.start_date)) {
      const errorMsg = 'End Date must be after Start Date';
      logger.error('[Load Data]', errorMsg);
      setDataStatus(errorMsg);
      setResponsePopup({ type: 'error', title: errorMsg });
      return;
    }

    setLoadingData(true);
    setDataLoaded(false);

    const requestPayload = {
      start_date: config.start_date,
      end_date:   config.end_date,
      // Index dropdown selection (Data Selection section) — sent as symbol.
      symbol:     config.dte_filter,
    };


    try {
      /*
        LOAD DATA IS COMMENTED OUT, not deleted.

        The button that called it is gone -- preparing data is now the user's
        own step. The request body was { start_date, end_date, symbol } and
        the reply only ever set three pieces of LOCAL UI state: dataLoaded,
        rowCount and dataStatus. Nothing persisted, and nothing else in the
        app read them, so removing the call costs no data.

        Kept verbatim so re-enabling it is uncommenting, not rewriting.
      */
      // const response = await fetch(`${API_URL}/load-data`, {
      // method:  'POST',
      // headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      // body:    JSON.stringify(requestPayload),
      // });
      //
      // const rawText = await response.text();
      // let result;
      // try {
      // result = rawText ? JSON.parse(rawText) : {};
      // } catch {
      // throw new Error(`Server returned invalid response (HTTP ${response.status})`);
      // }
      //
      //
      // if (!response.ok) {
      // const detail = result.detail;
      // let errMsg;
      // if (Array.isArray(detail) && detail.length > 0) {
      // errMsg = detail.map(d => d.msg).join('; ');
      // } else if (detail && typeof detail === 'object') {
      // errMsg = detail.message || detail.error || JSON.stringify(detail);
      // } else {
      // errMsg = result.message || result.error || `Error ${response.status}`;
      // }
      // setDataLoaded(false);
      // setRowCount(0);
      // setDataStatus(`✗ ${errMsg}`);
      // setResponsePopup({ type: 'error', title: errMsg });
      // return;
      // }
      //
      // if (result.success) {
      // const data           = result.data || {};
      // const actualRowCount = typeof data.rows === 'number'         ? data.rows
      // : typeof data.record_count === 'number' ? data.record_count
      // : 0;
      // const backendMessage = data.message || result.message || 'Data loaded successfully';
      //
      // if (actualRowCount === 0) {
      // setDataLoaded(false);
      // setRowCount(0);
      // setDataStatus('No trading days found');
      // setResponsePopup({ type: 'error', title: backendMessage });
      // } else {
      // setDataLoaded(true);
      // setRowCount(actualRowCount);
      // setDataStatus(`✓ ${backendMessage}`);
      // setResponsePopup({ type: 'success', title: backendMessage });
      // }
      // } else {
      // throw new Error(result.error || result.message || 'Load failed');
      // }
      //
      //
    } catch (error) {
      const msg = error.name === 'TypeError'
        ? 'Cannot reach server'
        : error.message;
      setDataLoaded(false);
      setRowCount(0);
      setDataStatus(`✗ ${msg}`);
      setResponsePopup({ type: 'error', title: msg });
    } finally {
      setLoadingData(false);
    }
  };


  return (

        <div id={readOnly ? 'strategy-readonly-content' : 'strategy-pdf-content'}
             className={readOnly ? 'strategy-readonly' : 'min-h-screen pb-16'}
             style={{ backgroundColor: colors.page.background }}>
      <ToggleSwitchStyles />
      <div className="mx-0">
        
        {/*
          DATA SELECTION WAS HERE and has been removed.
        */}

      <div
        className="builder-two-col mx-auto grid grid-cols-1 gap-6 md:grid-cols-[39%_61%] mb-8 animate-fade-in"
        style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
      >

        <div className="flex flex-col gap-14">

          {/* Instrument Settings */}
          <div data-pdf-block id={INSTRUMENT_SECTION_ID} style={{ scrollMarginTop: 16 }}>
            <h2 className="text-[20px] font-normal mb-2.5" style={{ color: colors.settingsPanel.heading }}>Instrument settings</h2>
            <div className="bg-white rounded-lg border p-8 flex flex-col items-center gap-7" style={{ borderColor: colors.settingsPanel.cardBorder, boxShadow: colors.settingsPanel.cardShadow }}>

              <div className="flex items-center justify-between gap-4 w-full max-w-[18rem]">
                <label className="text-[13px] font-medium whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>Index</label>
                <select
                  value={config.dte_filter || DEFAULT_SYMBOL}
                  onChange={(e) => handleChange('dte_filter', e.target.value)}
                  className="appearance-none pl-3 pr-9 py-2 border rounded-md text-[13px] font-normal w-40 outline-none cursor-pointer"
                  style={{
                    backgroundColor: colors.dropdownPlain.background,
                    color: colors.settingsPanel.inputValue,
                    borderColor: colors.settingsPanel.fieldBorder,
                    backgroundImage: selectChevron('%234B5563'),
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.65rem center',
                  }}
                >
                  {SUPPORTED_INDEXES.map((ix) => (
                    <option key={ix.value} value={ix.value}>{ix.label}</option>
                  ))}
                </select>
              </div>

              {/* Underlying From — REAL, wired to config.underlying_from */}
              <div className="flex items-center justify-between gap-3 w-full max-w-[18rem]">
                <label className="text-[13px] font-medium whitespace-nowrap flex items-center gap-1.5" style={{ color: colors.settingsPanel.label }}>
                  Underlying from
                  <Info size={14} className="text-gray-400" />
                </label>
                <SegmentedGroup
                  options={[{ value: 'cash', label: 'Cash' }, { value: 'futures', label: 'Futures' }]}
                  value={config.underlying_from}
                  onChange={(v) => handleChange('underlying_from', v)}
                />
              </div>
            </div>
          </div>

          {/* Legwise Settings */}
          <div data-pdf-block>
            <h2 className="text-[20px] font-normal mb-2.5" style={{ color: colors.settingsPanel.heading }}>Legwise settings</h2>
            <div className="bg-white rounded-lg border p-8 flex flex-col items-center gap-7" style={{ borderColor: colors.settingsPanel.cardBorder, boxShadow: colors.settingsPanel.cardShadow }}>
              {/* Square Off — REAL, wired to config.square_off */}
              <div className="flex items-center gap-3">
                <label className="text-[13px] font-medium whitespace-nowrap flex items-center gap-1.5" style={{ color: colors.settingsPanel.label }}>
                  Square Off
                  <Info size={14} className="text-gray-400" />
                </label>
                <SegmentedGroup
                  options={[{ value: 'partial', label: 'Partial' }, { value: 'complete', label: 'Complete' }]}
                  value={config.square_off}
                  onChange={(v) => handleChange('square_off', v)}
                />
              </div>

              {/* Trail SL to Break-even price — REAL, wired to config.trail_to_be / config.trail_to_be_scope */}
              <label className="flex items-center gap-2 cursor-pointer flex-wrap justify-center">
                <input
                  type="checkbox"
                  checked={config.trail_to_be || false}
                  onChange={(e) => handleChange('trail_to_be', e.target.checked)}
                  className="appearance-none w-4 h-4 rounded border-2 cursor-pointer bg-white"
                  style={config.trail_to_be
                    ? {
                        backgroundColor: colors.settingsPanel.activeBg,
                        borderColor: colors.settingsPanel.activeBg,
                        backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")`,
                        backgroundSize: '10px',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                      }
                    : { borderColor: colors.settingsPanel.checkboxBorder }}
                />
                <span className="text-[13px] font-medium whitespace-nowrap flex items-center gap-1.5" style={{ color: colors.settingsPanel.label }}>
                  Trail SL to Break-even price
                  <Info size={14} className="text-gray-400" />
                </span>
                {/* Muted while the checkbox is unchecked, full blue once checked */}
                <SegmentedGroup
                  options={[{ value: 'all_legs', label: 'All Legs' }, { value: 'sl_legs', label: 'SL Legs' }]}
                  value={config.trail_to_be_scope || 'all_legs'}
                  onChange={(v) => handleChange('trail_to_be_scope', v)}
                  muted={!config.trail_to_be}
                />
              </label>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Entry Settings */}
        <div data-pdf-block className="flex flex-col">
          <h2 className="text-[20px] font-normal mb-2.5" style={{ color: colors.settingsPanel.heading }}>Entry settings</h2>
          <div
            className={`bg-white rounded-lg border px-8 pt-10 pb-6 flex-1 flex flex-col justify-start min-h-[400px] ${
              (config.strategy_type || 'intraday') === 'positional' ? 'gap-12' : 'gap-[42px]'
            }`}
            style={{ borderColor: colors.settingsPanel.cardBorder, boxShadow: colors.settingsPanel.cardShadow }}
          >

            {/* Strategy Type — REAL, wired to config.strategy_type */}
            <div className={(config.strategy_type || 'intraday') === 'positional'
              ? 'flex items-center justify-center gap-10'
              : `flex items-center justify-between gap-10 ${ROW_BLOCK}`}>
              <label className="text-[13px] font-medium whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>Strategy Type</label>
              <SegmentedGroup
                options={[
                  { value: 'intraday', label: 'Intraday' },
                  { value: 'btst', label: 'BTST' },
                  { value: 'positional', label: 'Positional' },
                  { value: 'sequential', label: 'Sequential' },
                ]}
                value={config.strategy_type || 'intraday'}
                onChange={(v) => handleChange('strategy_type', v)}
                accent
                padX="px-2"
                textSize="text-[12px]"
                firstRef={strategyTypeRef}
                onFirstKeyDown={(e) => handleEntrySettingsNavigation(e, strategyTypeRef)}
              />
            </div>

            {(config.strategy_type || 'intraday') === 'positional' && (
              <div className="flex items-center justify-center gap-4">
                <label className="text-[13px] font-normal whitespace-nowrap" style={{ color: colors.settingsPanel.sentence }}>Positional expire on a</label>
                <select
                  value={config.positional_expiry || 'weekly'}
                  onChange={(e) => {
                    const expiry = e.target.value;
                    const err = positionalExpiryError(config.legs, expiry);
                    if (err) setResponsePopup({ type: 'error', title: err });
                    handleChange('positional_expiry', expiry);
                  }}
                  className="appearance-none pl-3 pr-9 py-2 border rounded-md text-[13px] font-normal outline-none cursor-pointer"
                  style={{
                    backgroundColor: colors.dropdownPlain.background,
                    color: colors.settingsPanel.inputValue,
                    borderColor: colors.settingsPanel.fieldBorder,
                    backgroundImage: selectChevron('%234B5563'),
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.65rem center',
                  }}
                >
                  <option value="weekly">Weekly Expiry</option>
                  <option value="monthly">Monthly Expiry</option>
                </select>
                <span className="text-[13px] font-normal" style={{ color: colors.settingsPanel.sentence }}>basis</span>
              </div>
            )}

            {(config.strategy_type || 'intraday') === 'positional' ? (
              <div className="entry-exit-row flex items-stretch justify-center gap-[10.5%]">
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                  <label className="text-[13px] font-medium text-center" style={{ color: colors.settingsPanel.label }}>Entry Time</label>
                  <TimeSegmentInput
                    ref={entryTimeRef}
                    value={config.entry_time}
                    onCommit={(formatted) => commitTime('entry_time', formatted)}
                    placeholder="Entry Time"
                    onKeyDown={(e) => handleEntrySettingsNavigation(e, entryTimeRef)}
                    minTime={MARKET_OPEN_TIME}
                    maxTime={ENTRY_LAST_TIME}
                    fullWidth
                  />
                  <span className="text-[13px] font-medium" style={{ color: colors.settingsPanel.label }}>Entry</span>
                  <div className="flex items-center gap-3">
                    <PlainDropdown
                      value={String(config.positional_entry_day ?? '0')}
                      options={positionalDayOptions}
                      onChange={(v) => {
                        warnAboutTimeLater(positionalDayError(v, config.positional_exit_day));
                        handleChange('positional_entry_day', v);
                      }}
                      buttonClassName="w-[3.75rem] h-8 py-0"
                    />
                    <span className="text-[13px] font-normal whitespace-nowrap" style={{ color: colors.settingsPanel.sentence }}>trading days before expiry</span>
                  </div>
                </div>

                <div className="border-l self-stretch" style={{ borderColor: colors.settingsPanel.divider }} />

                <div className="flex-1 flex flex-col gap-3 min-w-0">
                  <label className="text-[13px] font-medium text-center" style={{ color: colors.settingsPanel.label }}>Exit Time</label>
                  <TimeSegmentInput
                    ref={exitTimeRef}
                    value={config.exit_time}
                    onCommit={(formatted) => commitTime('exit_time', formatted)}
                    placeholder="Exit Time"
                    onKeyDown={(e) => handleEntrySettingsNavigation(e, exitTimeRef)}
                    minTime={MARKET_OPEN_TIME}
                    maxTime={EXIT_LAST_TIME}
                    fullWidth
                  />
                  <span className="text-[13px] font-medium" style={{ color: colors.settingsPanel.label }}>Exit</span>
                  <div className="flex items-center gap-3">
                    <PlainDropdown
                      value={String(config.positional_exit_day ?? '0')}
                      options={positionalDayOptions}
                      onChange={(v) => {
                        warnAboutTimeLater(positionalDayError(config.positional_entry_day, v));
                        handleChange('positional_exit_day', v);
                      }}
                      buttonClassName="w-[3.75rem] h-8 py-0"
                    />
                    <span className="text-[13px] font-normal whitespace-nowrap" style={{ color: colors.settingsPanel.sentence }}>trading days before expiry</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`flex items-center justify-between gap-20 ${ROW_BLOCK}`}>
                <div className="flex items-center gap-3">
                  <label className="text-[13px] font-medium whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>Entry Time</label>
                  <div className="flex items-center gap-2">
                    <TimeSegmentInput
                      ref={entryTimeRef}
                      value={config.entry_time}
                      onCommit={(formatted) => commitTime('entry_time', formatted)}
                      placeholder="Entry Time"
                      onKeyDown={(e) => handleEntrySettingsNavigation(e, entryTimeRef)}
                      minTime={MARKET_OPEN_TIME}
                      maxTime={ENTRY_LAST_TIME}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-[13px] font-medium whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>Exit Time</label>
                  <div className="flex items-center gap-2">
                    <TimeSegmentInput
                      ref={exitTimeRef}
                      value={config.exit_time}
                      onCommit={(formatted) => commitTime('exit_time', formatted)}
                      placeholder="Exit Time"
                      onKeyDown={(e) => handleEntrySettingsNavigation(e, exitTimeRef)}
                      minTime={MARKET_OPEN_TIME}
                      maxTime={EXIT_LAST_TIME}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* No re-entry after + Overall Momentum — VISUAL ONLY, local uiXxx state, not wired to config/handleChange. Wire later. */}
            <div className={(config.strategy_type || 'intraday') === 'positional'
              ? 'flex items-stretch justify-center gap-10'
              : `flex items-stretch justify-between gap-10 mt-[18px] ${ROW_BLOCK}`}>
              {['intraday', 'sequential'].includes(config.strategy_type || 'intraday') ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <label className="text-[13px] font-medium whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>No re-entry after</label>
                    <ToggleSwitch
                      checked={config.no_reentry_after_enabled || false}
                      onChange={(e) => handleChange('no_reentry_after_enabled', e.target.checked)}
                      id="noReentryAfter"
                      size="sm"
                    />
                  </div>
                  <TimeSegmentInput
                    value={config.no_reentry_after_time || '09:35'}
                    onCommit={(v) => { handleChange('no_reentry_after_time', v); return true; }}
                    disabled={!config.no_reentry_after_enabled}
                    placeholder="No re-entry after"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <label className="text-[13px] font-medium whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>Delay restart</label>
                    <ToggleSwitch
                      checked={config.delay_restart_enabled || false}
                      onChange={(e) => handleChange('delay_restart_enabled', e.target.checked)}
                      id="delayRestart"
                      size="sm"
                    />
                  </div>
                
                  <TimeSegmentInput
                    value={config.delay_restart_time || MARKET_OPEN_TIME}
                    onCommit={(v) => {
                      warnAboutTimeLater(delayRestartError(v));
                      handleChange('delay_restart_time', v);
                      return true;
                    }}
                    disabled={!config.delay_restart_enabled}
                    placeholder="Delay restart"
                    minTime={MARKET_OPEN_TIME}
                    maxTime={EXIT_LAST_TIME}
                  />
                </div>
              )}

              
              <div className="pl-10 border-l flex flex-col items-center gap-3" style={{ borderColor: colors.settingsPanel.divider }}>
                <div className="flex items-center gap-3">
                  <label className="text-[13px] font-medium whitespace-nowrap flex items-center gap-1.5" style={{ color: colors.settingsPanel.label }}>
                    Stop monitoring after
                    <Info size={14} className="text-gray-400" />
                  </label>
                  <ToggleSwitch
                    checked={config.stop_monitoring_enabled || false}
                    onChange={(e) => handleChange('stop_monitoring_enabled', e.target.checked)}
                    id="stopMonitoringAfter"
                    size="sm"
                  />
                </div>
                <TimeSegmentInput
                  value={config.stop_monitoring_time || DEFAULT_EXIT_TIME}
                  onCommit={(v) => {
                    warnAboutTimeLater(sessionWindowError('Stop Monitoring After', v));
                    handleChange('stop_monitoring_time', v);
                    return true;
                  }}
                  disabled={!config.stop_monitoring_enabled}
                  placeholder="Stop monitoring after"
                  minTime={MARKET_OPEN_TIME}
                  maxTime={EXIT_LAST_TIME}
                />
              </div>
            </div>

          </div>
        </div>

      </div>  


      {/* LEG BUILDER — AlgoTest-style */}
      <div className="mx-0 px-0 w-full" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

        {uiLegBuilderCollapsed ? (
          /* Collapsed (AlgoTest): one slim bordered bar with the heading + Expand link */
          <div className="w-full bg-white rounded-lg border mb-8 flex items-center justify-between px-4 py-2.5" style={{ borderColor: colors.settingsPanel.cardBorder, boxShadow: colors.settingsPanel.cardShadow }}>
            <h2 className="text-[20px] font-normal flex items-center gap-1.5" style={{ color: colors.settingsPanel.heading }}>
              Leg Builder
              <Info size={14} className="text-gray-400" />
            </h2>
            <span onClick={() => setUiLegBuilderCollapsed(false)} className="text-[15px] font-semibold cursor-pointer select-none" style={{ color: colors.legBuilder.collapseLink }}>Expand</span>
          </div>
        ) : (
          <>
        {/* Header row (outside the card, like the settings sections) */}
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[20px] font-normal flex items-center gap-1.5" style={{ color: colors.settingsPanel.heading }}>
            Leg Builder
            <Info size={14} className="text-gray-400" />
          </h2>
          <span onClick={() => setUiLegBuilderCollapsed(true)} className="text-[15px] font-semibold cursor-pointer select-none" style={{ color: colors.legBuilder.collapseLink }}>Collapse</span>
        </div>

        <div className="w-full bg-white rounded-lg border mb-8" style={{ borderColor: colors.settingsPanel.cardBorder, boxShadow: colors.settingsPanel.cardShadow }}>
          <div className="px-8 py-10 flex flex-col gap-10">

            <div className="flex flex-wrap items-end justify-center gap-x-8 gap-y-5">

              {/* Select segments — "Futures" is VISUAL ONLY (uiLegSegment), not wired. Wire later. */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Select segments</label>
                <SegmentedGroup
                  className="self-start h-9"
                  padX="px-3.5"
                  equal
                  accent
                  options={[{ value: 'futures', label: 'Futures' }, { value: 'options', label: 'Options' }]}
                  value={uiLegSegment}
                  onChange={setUiLegSegment}
                />
              </div>

              {/* Total Lot — REAL, wired to currentLeg.lots */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Total Lot</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={currentLeg.lots}
                  onChange={(e) => handleLegChange('lots', e.target.value)}
                  onFocus={handleNumberFocus}
                  className="lot-spinner w-24 px-3.5 h-9 text-[13px] font-normal border rounded-md bg-white outline-none"
                  style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                />
              </div>

              {/* Position — REAL, wired to currentLeg.position */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Position</label>
                <SegmentedGroup
                  className="self-start h-9"
                  padX="px-3.5"
                  equal
                  accent
                  options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]}
                  value={currentLeg.position}
                  onChange={(v) => handleLegChange('position', v)}
                />
              </div>

              {/* Option Type — REAL, wired to currentLeg.option_type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Option Type</label>
                <SegmentedGroup
                  className="self-start h-9"
                  padX="px-3.5"
                  equal
                  accent
                  options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]}
                  value={currentLeg.option_type}
                  onChange={(v) => handleLegChange('option_type', v)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Expiry</label>
                <select
                  value={currentLeg.expiry}
                  onChange={(e) => handleLegChange('expiry', e.target.value)}
                  className="appearance-none w-[9.5rem] pl-3.5 pr-9 h-9 text-[13px] font-normal border rounded-md outline-none cursor-pointer"
                  style={{
                      backgroundColor: colors.dropdownPlain.background,
                      color: colors.settingsPanel.inputValue,
                      borderColor: colors.settingsPanel.fieldBorder,
                      backgroundImage: selectChevron('%234B5563'),
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.6rem center',
                    }}
                >
                  <option value="weekly">Weekly</option>
                  <option value="next_weekly">Next Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="next_monthly">Next Monthly</option>
                </select>
              </div>

              {/* Strike Criteria — REAL, wired to currentLeg.strike_criteria (options unchanged) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium h-5 leading-5 flex items-center gap-1" style={{ color: colors.settingsPanel.label }}>
                  Strike Criteria
                  <Info size={12} className="text-gray-400" />
                </label>
                <select
                  value={currentLeg.strike_criteria}
                  onChange={(e) => handleLegChange('strike_criteria', e.target.value)}
                  className="appearance-none w-[15rem] pl-3.5 pr-9 h-9 text-[13px] font-normal border rounded-md outline-none cursor-pointer"
                  style={{
                      backgroundColor: colors.dropdownPlain.background,
                      color: colors.settingsPanel.inputValue,
                      borderColor: colors.settingsPanel.fieldBorder,
                      backgroundImage: selectChevron('%234B5563'),
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.6rem center',
                    }}
                >
                  <option value="based on points">Based On Strike</option>
                  <option value="based on atm percent">Based On ATM %</option>
                  <option value="based on premium range">Based On premium range</option>
                  <option value="closest premium">Based On Closest Premium</option>
                </select>
              </div>

              {/* Strike Type — only when Strike Criteria is "Based On Strike" (REAL, via StrikeSelector) */}
              {currentLeg.strike_criteria === 'based on points' && (
                <div className="flex flex-col gap-1.5 w-[7.5rem] shrink-0">
                  <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Strike Type</label>
                  <StrikeSelector
                    heightClass="h-9"
                    size="md"
                    value={currentLeg.strike_type || 'atm'}
                    onChange={(value) => handleLegChange('strike_type', value)}
                  />
                </div>
              )}

              {/* ATM % — only when Strike Criteria is "Based On ATM %" (REAL; AlgoTest inline layout) */}
              {currentLeg.strike_criteria === 'based on atm percent' && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>ATM</span>
                  <select
                    value={currentLeg.atm_percent_direction || '+'}
                    onChange={(e) => handleLegChange('atm_percent_direction', e.target.value)}
                    className="appearance-none pl-3 pr-7 py-2 text-[13px] font-normal border rounded-md outline-none cursor-pointer"
                    style={{
                      backgroundColor: colors.dropdownPlain.background,
                      color: colors.settingsPanel.inputValue,
                      borderColor: colors.settingsPanel.fieldBorder,
                      backgroundImage: selectChevron('%234B5563'),
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.45rem center',
                    }}
                  >
                    <option value="+">+</option>
                    <option value="-">-</option>
                  </select>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={currentLeg.atm_percent_value ?? ''}
                      onChange={(e) => handleLegChange('atm_percent_value', e.target.value)}
                      onFocus={handleNumberFocus}
                      className="w-[6.25rem] pl-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md bg-white outline-none"
                      style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                      placeholder="0"
                    />
                    <span className="absolute right-3 text-[13px] font-medium pointer-events-none" style={{ color: colors.settingsPanel.label }}>%</span>
                  </div>
                  <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>of ATM</span>
                </div>
              )}

              {/* Premium — only when Strike Criteria is "Based On Closest Premium" (REAL) */}
              {currentLeg.strike_criteria === 'closest premium' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Premium</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentLeg.closest_premium_value ?? ''}
                    onChange={(e) => handleLegChange('closest_premium_value', e.target.value)}
                    onFocus={handleNumberFocus}
                    className="w-[6.25rem] px-3.5 h-8 text-[13px] font-normal border rounded-md bg-white outline-none"
                    style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                    placeholder=""
                  />
                </div>
              )}

              {/* Lower/Upper Range — only when Strike Criteria is "Based On premium range" (REAL) */}
              {currentLeg.strike_criteria === 'based on premium range' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Lower Range</label>
                    <input
                      type="number"
                      step="0.01"
                      value={currentLeg.lower_range ?? ''}
                      onChange={(e) => handleLegChange('lower_range', e.target.value)}
                      onFocus={handleNumberFocus}
                      className="w-[6.25rem] px-3.5 h-8 text-[13px] font-normal border rounded-md bg-white outline-none"
                      style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                      placeholder=""
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Upper Range</label>
                    <input
                      type="number"
                      step="0.01"
                      value={currentLeg.upper_range ?? ''}
                      onChange={(e) => handleLegChange('upper_range', e.target.value)}
                      onFocus={handleNumberFocus}
                      className="w-[6.25rem] px-3.5 h-8 text-[13px] font-normal border rounded-md bg-white outline-none"
                      style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                      placeholder=""
                    />
                  </div>
                </>
              )}

              {/* Premium — legacy criteria "Premium >=" / "Premium <=" (REAL) */}
              {(currentLeg.strike_criteria === 'premium_gte' || currentLeg.strike_criteria === 'premium_lte') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium h-5 leading-5" style={{ color: colors.settingsPanel.label }}>Premium</label>
                  <input
                    type="number"
                    step="0.01"
                    value={currentLeg.premium_value ?? ''}
                    onChange={(e) => handleLegChange('premium_value', e.target.value)}
                    onFocus={handleNumberFocus}
                    className="w-[6.25rem] px-3.5 h-8 text-[13px] font-normal border rounded-md bg-white outline-none"
                    style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={addLeg}
                className="px-4 py-3 text-[12px] leading-4 font-semibold text-white rounded border transition-colors duration-75"
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
                Add Leg
              </button>
            </div>

          </div>
        </div>
          </>
        )}
      </div>
    </div>

      {showLazyLegModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-3" style={{ backgroundColor: 'rgba(42, 42, 42, 0.7)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
          <div className="bg-white rounded-md w-full max-w-7xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-[#fafafa] border-[#e3e3e3] rounded-t-md">
              <h2 className="text-[16px] font-normal text-[#3a3a3a]">Create New Lazy Leg</h2>
              <button
                onClick={() => {
                  setShowLazyLegModal(false);
                  setLazyLegContext(null);
                  setLazyLegConfig({
                    customName: '', lots: 1, expiry: 'weekly', position: 'buy', option_type: 'call',
                    strike_criteria: 'based on points', atm_strike: 'atm', atm_percent_direction: '+', atm_percent_value: '',
                    closest_premium_value: '', lower_range: '', upper_range: '', premium_value: '',
                    target_enabled: false, target_type: 'points', target_value: '0.00',
                    stop_loss_enabled: false, stop_loss_type: 'points', stop_loss_value: '0.00',
                    trail_sl_enabled: false, trail_sl_type: 'points', trail_sl_value: '0.00', trail_sl_lock_value: '0.00',
                    reentry_tgt_enabled: false, reentry_tgt_mode: 're_asap', reentry_tgt_count: '1',
                    reentry_sl_enabled: false, reentry_sl_mode: 're_asap', reentry_sl_count: '1',
                    momentum_enabled: false, momentum_type: 'points', momentum_value: '0.00',
                    range_breakout_enabled: false, range_instrument: 'underlying', range_time: '', range_direction: 'high'
                  });
                }}
                className="w-6 h-6 p-0.5 rounded-full flex items-center justify-center text-[#555555] hover:bg-[#f3f3f3] transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="pt-4 px-5 pb-3">
              <div className="flex items-center gap-3 mb-5">
                <label className="text-[13px] font-medium text-gray-700 whitespace-nowrap">Enter Leg Name</label>
                <input
                  value={lazyLegConfig.customName}
                  onChange={(e) => setLazyLegConfig(prev => ({ ...prev, customName: e.target.value }))}
                  placeholder={`lazy${config.legs.filter(l => l.isLazyLeg).length + 1}`}
                  className="w-44 px-3.5 h-8 text-[13px] border rounded-md bg-white outline-none"
                  style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                />
              </div>

              <div className="border rounded-lg px-6 py-6" style={{ borderColor: colors.settingsPanel.cardBorder }}>
                {/* Row 1 */}
                <div className="flex flex-wrap items-end justify-center gap-x-6 gap-y-4">
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Lots</label>
                    <input type="number" min="1" step="1" value={lazyLegConfig.lots} onChange={(e) => { const val = e.target.value; if (val !== '') { if (val.includes('.')) { setResponsePopup({ type: 'error', title: 'Total Lot must be a whole number' }); return; } if (Number(val) < 0) { setResponsePopup({ type: 'error', title: 'Total Lot cannot be negative' }); return; } if (Number(val) === 0) { setResponsePopup({ type: 'error', title: 'Total Lot must be at least 1' }); return; } } setLazyLegConfig(prev => ({ ...prev, lots: val })); }} className="lot-spinner w-24 px-3.5 h-8 text-[13px] font-normal border border-[#e3e3e3] rounded-md bg-white outline-none" style={{ color: colors.settingsPanel.inputValue }} placeholder="1" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Position</label>
                    <select value={lazyLegConfig.position} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, position: e.target.value }))} className="appearance-none w-[5.75rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Option Type</label>
                    <select value={lazyLegConfig.option_type} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, option_type: e.target.value }))} className="appearance-none w-[5.75rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="call">Call</option>
                      <option value="put">Put</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Expiry</label>
                    <select value={lazyLegConfig.expiry} onChange={(e) => { warnIfWeeklyLegExpiry(e.target.value); setLazyLegConfig(prev => ({ ...prev, expiry: e.target.value })); }} className="appearance-none w-[9.5rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="weekly">Weekly</option>
                      <option value="next_weekly">Next Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="next_monthly">Next Monthly</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                      Select Strike Criteria
                      <Info size={12} className="text-gray-400" />
                    </label>
                    <select value={lazyLegConfig.strike_criteria} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, strike_criteria: e.target.value }))} className="appearance-none w-[15rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="based on points">Based On Strike</option>
                      <option value="based on atm percent">Based On ATM %</option>
                      <option value="based on premium range">Based On premium range</option>
                      <option value="closest premium">Based On Closest Premium</option>
                    </select>
                  </div>
                  {lazyLegConfig.strike_criteria === 'based on points' && (
                    <div className="flex flex-col w-[7.5rem]">
                      <StrikeSelector size="md" value={lazyLegConfig.atm_strike || 'atm'} onChange={(value) => setLazyLegConfig(prev => ({ ...prev, atm_strike: value }))} />
                    </div>
                  )}
                  {lazyLegConfig.strike_criteria === 'based on atm percent' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-700">ATM</span>
                      <select value={lazyLegConfig.atm_percent_direction || '+'} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, atm_percent_direction: e.target.value }))} className="appearance-none w-full pl-3.5 pr-7 h-8 text-[13px] border border-[#e3e3e3] rounded-md font-normal outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                        <option value="+">+</option>
                        <option value="-">-</option>
                      </select>
                      <div className="relative flex items-center">
                        <input type="number" min="0" step="0.01" value={lazyLegConfig.atm_percent_value ?? ''} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, atm_percent_value: e.target.value }))} className="w-24 pl-3.5 pr-8 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none" placeholder="0" />
                        <span className="absolute right-3 text-[13px] font-normal text-gray-700 pointer-events-none">%</span>
                      </div>
                      <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap">of ATM</span>
                    </div>
                  )}
                  {lazyLegConfig.strike_criteria === 'closest premium' && (
                    <div className="flex flex-col">
                      <label className="text-[13px] font-medium text-gray-700 mb-1.5">Premium</label>
                      <input type="number" min="0" step="0.01" value={lazyLegConfig.closest_premium_value ?? ''} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, closest_premium_value: e.target.value }))} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="50" />
                    </div>
                  )}
                  {lazyLegConfig.strike_criteria === 'based on premium range' && (
                    <>
                      <div className="flex flex-col">
                        <label className="text-[13px] font-medium text-gray-700 mb-1.5">Lower</label>
                        <input type="number" step="0.01" value={lazyLegConfig.lower_range ?? ''} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, lower_range: e.target.value }))} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="50" />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[13px] font-medium text-gray-700 mb-1.5">Upper</label>
                        <input type="number" step="0.01" value={lazyLegConfig.upper_range ?? ''} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, upper_range: e.target.value }))} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="100" />
                      </div>
                    </>
                  )}
                </div>

                {/* Row 2: Target Profit / Stop Loss / Trail SL */}
                <div className="modal-field-row flex flex-wrap justify-center items-start gap-x-7 gap-y-5 mt-6">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Target Profit</label>
                      
                      <ToggleSwitch size="sm" checked={lazyLegConfig.target_enabled || false} onChange={modalTargetToggle(setLazyLegConfig)} id="lazyTargetProfit" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={lazyLegConfig.target_type || 'points'} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, target_type: e.target.value }))} disabled={!lazyLegConfig.target_enabled} className="appearance-none w-[10.25rem] pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="points">Points (Pts)</option>
                        <option value="underlying_points">Underlying Pts</option>
                        <option value="percentage">Percent (%)</option>
                        <option value="underlying_percentage">Underlying %</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={lazyLegConfig.target_value || ''} onChange={(e) => { const val = e.target.value; if (val !== '' && Number(val) < 0) { setResponsePopup({ type: 'error', title: 'Target value cannot be negative' }); return; } setLazyLegConfig(prev => ({ ...prev, target_value: val })); }} disabled={!lazyLegConfig.target_enabled} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Stop Loss</label>
                      
                      <ToggleSwitch size="sm" checked={lazyLegConfig.stop_loss_enabled || false} onChange={modalStopLossToggle(setLazyLegConfig)} id="lazyStopLoss" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={lazyLegConfig.stop_loss_type || 'points'} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, stop_loss_type: e.target.value }))} disabled={!lazyLegConfig.stop_loss_enabled} className="appearance-none w-[10.25rem] pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="points">Points (Pts)</option>
                        <option value="underlying_points">Underlying Pts</option>
                        <option value="percentage">Percent (%)</option>
                        <option value="underlying_percentage">Underlying %</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={lazyLegConfig.stop_loss_value || ''} onChange={(e) => { const val = e.target.value; if (val !== '' && Number(val) < 0) { setResponsePopup({ type: 'error', title: 'Stop Loss value cannot be negative' }); return; } setLazyLegConfig(prev => ({ ...prev, stop_loss_value: val })); }} disabled={!lazyLegConfig.stop_loss_enabled} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Trail SL</label>
                      <Info size={14} className="text-gray-400" />
                      <ToggleSwitch size="sm" checked={lazyLegConfig.trail_sl_enabled || false} onChange={(e) => { if (e.target.checked && !modalStopLossReady(lazyLegConfig)) return; setLazyLegConfig(prev => ({ ...prev, trail_sl_enabled: e.target.checked })); }} id="lazyTrailSL" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={lazyLegConfig.trail_sl_type || 'points'} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, trail_sl_type: e.target.value }))} disabled={!lazyLegConfig.trail_sl_enabled} className="appearance-none w-36 pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="points">Points</option>
                        <option value="percentage">Percentage</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={lazyLegConfig.trail_sl_value || ''} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, trail_sl_value: e.target.value }))} disabled={!lazyLegConfig.trail_sl_enabled} className="w-[5.5rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                      <input type="number" min="0" step="0.01" value={lazyLegConfig.trail_sl_lock_value || ''} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, trail_sl_lock_value: e.target.value }))} disabled={!lazyLegConfig.trail_sl_enabled} className="w-[5.5rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                    </div>
                  </div>
                </div>

                {/* Row 3: Re-entries / Momentum */}
                <div className="modal-field-row flex flex-wrap justify-center items-start gap-x-7 gap-y-5 mt-6">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Re-entry on Tgt</label>
                      <Info size={14} className="text-gray-400" />
                      <ToggleSwitch size="sm" checked={lazyLegConfig.reentry_tgt_enabled || false} onChange={(e) => { if (e.target.checked && !modalTargetReady(lazyLegConfig)) return; setLazyLegConfig(prev => ({ ...prev, reentry_tgt_enabled: e.target.checked })); }} id="lazyReentryTgt" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={lazyLegConfig.reentry_tgt_mode || 're_asap'} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, reentry_tgt_mode: e.target.value }))} disabled={!lazyLegConfig.reentry_tgt_enabled} className="appearance-none w-40 pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="re_asap">RE ASAP</option>
                        <option value="re_asap_reverse">RE ASAP ↩</option>
                        <option value="re_momentum" disabled={!lazyLegConfig.momentum_enabled}>RE MOMENTUM</option>
                        <option value="re_momentum_reverse" disabled={!lazyLegConfig.momentum_enabled}>RE MOMENTUM ↩</option>
                        <option value="re_cost">RE COST</option>
                        <option value="re_cost_reverse">RE COST ↩</option>
                      </select>
                      <ReentryCountDropdown value={lazyLegConfig.reentry_tgt_count} onChange={(v) => setLazyLegConfig(prev => ({ ...prev, reentry_tgt_count: v }))} disabled={!lazyLegConfig.reentry_tgt_enabled} heightClass="h-8" />
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Re-entry on SL</label>
                      <Info size={14} className="text-gray-400" />
                      <ToggleSwitch size="sm" checked={lazyLegConfig.reentry_sl_enabled || false} onChange={(e) => { if (e.target.checked && !modalStopLossReady(lazyLegConfig)) return; setLazyLegConfig(prev => ({ ...prev, reentry_sl_enabled: e.target.checked })); }} id="lazyReentrySL" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={lazyLegConfig.reentry_sl_mode || 're_asap'} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, reentry_sl_mode: e.target.value }))} disabled={!lazyLegConfig.reentry_sl_enabled} className="appearance-none w-40 pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="re_asap">RE ASAP</option>
                        <option value="re_asap_reverse">RE ASAP ↩</option>
                        <option value="re_momentum" disabled={!lazyLegConfig.momentum_enabled}>RE MOMENTUM</option>
                        <option value="re_momentum_reverse" disabled={!lazyLegConfig.momentum_enabled}>RE MOMENTUM ↩</option>
                        <option value="re_cost">RE COST</option>
                        <option value="re_cost_reverse">RE COST ↩</option>
                      </select>
                      <ReentryCountDropdown value={lazyLegConfig.reentry_sl_count} onChange={(v) => setLazyLegConfig(prev => ({ ...prev, reentry_sl_count: v }))} disabled={!lazyLegConfig.reentry_sl_enabled} heightClass="h-8" />
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Simple Momentum</label>
                      <Info size={14} className="text-gray-400" />
                      <ToggleSwitch size="sm" checked={lazyLegConfig.momentum_enabled || false} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, momentum_enabled: e.target.checked }))} id="lazyMomentum" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={lazyLegConfig.momentum_type || 'points'} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, momentum_type: e.target.value }))} disabled={!lazyLegConfig.momentum_enabled} className="appearance-none w-[11rem] pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="points">Points (Pts) ↑</option>
                        <option value="points_down">Points (Pts) ↓</option>
                        <option value="percentage">Percent (%) ↑</option>
                        <option value="percentage_down">Percent (%) ↓</option>
                        <option value="underlying_points_up">Underlying Pts ↑</option>
                        <option value="underlying_points_down">Underlying Pts ↓</option>
                        <option value="underlying_percentage_up">Underlying % ↑</option>
                        <option value="underlying_percentage_down">Underlying % ↓</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={lazyLegConfig.momentum_value || ''} onChange={(e) => setLazyLegConfig(prev => ({ ...prev, momentum_value: e.target.value }))} disabled={!lazyLegConfig.momentum_enabled} className="w-24 px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 bg-white pt-3 px-5 pb-4">
              <button
                onClick={() => {
                  setShowLazyLegModal(false);
                  setLazyLegContext(null);
                }}
                className="px-4 py-3 text-[12px] font-medium rounded hover:bg-gray-50 transition-colors"
                style={{ color: colors.settingsPanel.inactiveText }}
              >
                Cancel
              </button>
              <button
                onClick={createLazyLeg}
                className="px-4 py-2 text-[12px] font-medium text-white rounded border transition-colors"
                style={{ backgroundColor: colors.legBuilder.addLegBg, borderColor: colors.legBuilder.addLegBg }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg;
                  e.currentTarget.style.borderColor = colors.legBuilder.addLegHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg;
                  e.currentTarget.style.borderColor = colors.legBuilder.addLegBg;
                }}
              >
                Create and Select
              </button>
            </div>
          </div>
        </div>
      )}

      {showSequentialLegModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-3" style={{ backgroundColor: 'rgba(42, 42, 42, 0.7)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
          <div className="bg-white rounded-md w-full max-w-7xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-[#fafafa] border-[#e3e3e3] rounded-t-md">
              <h2 className="text-[16px] font-normal text-[#3a3a3a]">
                Create Sequential Leg for LEG #{mainLegPosition(config.legs, sequentialLegParentId)}
              </h2>
              <button
                onClick={closeSequentialLegModal}
                className="w-6 h-6 p-0.5 rounded-full flex items-center justify-center text-[#555555] hover:bg-[#f3f3f3] transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="pt-4 px-5 pb-3">
              <div className="flex items-center gap-3 mb-5">
                <label className="text-[13px] font-medium text-gray-700 whitespace-nowrap">Enter Leg Name</label>
                <input
                  value={sequentialLegConfig.customName}
                  onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, customName: e.target.value }))}
                  placeholder={`SEQ${mainLegPosition(config.legs, sequentialLegParentId)}`}
                  className="w-44 px-3.5 h-8 text-[13px] border rounded-md bg-white outline-none"
                  style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
                />
              </div>

              <div className="border rounded-lg px-6 py-6" style={{ borderColor: colors.settingsPanel.cardBorder }}>
                {/* Row 1 */}
                <div className="flex flex-wrap items-end justify-center gap-x-6 gap-y-4">
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Lots</label>
                    <input type="number" min="1" step="1" value={sequentialLegConfig.lots} onChange={(e) => { const val = e.target.value; if (val !== '') { if (val.includes('.')) { setResponsePopup({ type: 'error', title: 'Total Lot must be a whole number' }); return; } if (Number(val) < 0) { setResponsePopup({ type: 'error', title: 'Total Lot cannot be negative' }); return; } if (Number(val) === 0) { setResponsePopup({ type: 'error', title: 'Total Lot must be at least 1' }); return; } } setSequentialLegConfig(prev => ({ ...prev, lots: val })); }} className="lot-spinner w-24 px-3.5 h-8 text-[13px] font-normal border border-[#e3e3e3] rounded-md bg-white outline-none" style={{ color: colors.settingsPanel.inputValue }} placeholder="1" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Position</label>
                    <select value={sequentialLegConfig.position} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, position: e.target.value }))} className="appearance-none w-[5.75rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Option Type</label>
                    <select value={sequentialLegConfig.option_type} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, option_type: e.target.value }))} className="appearance-none w-[5.75rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="call">Call</option>
                      <option value="put">Put</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5">Expiry</label>
                    <select value={sequentialLegConfig.expiry} onChange={(e) => { warnIfWeeklyLegExpiry(e.target.value); setSequentialLegConfig(prev => ({ ...prev, expiry: e.target.value })); }} className="appearance-none w-[9.5rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="weekly">Weekly</option>
                      <option value="next_weekly">Next Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="next_monthly">Next Monthly</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                      Select Strike Criteria
                      <Info size={12} className="text-gray-400" />
                    </label>
                    <select value={sequentialLegConfig.strike_criteria} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, strike_criteria: e.target.value }))} className="appearance-none w-[15rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                      <option value="based on points">Based On Strike</option>
                      <option value="based on atm percent">Based On ATM %</option>
                      <option value="based on premium range">Based On premium range</option>
                      <option value="closest premium">Based On Closest Premium</option>
                    </select>
                  </div>
                  {sequentialLegConfig.strike_criteria === 'based on points' && (
                    <div className="flex flex-col w-[7.5rem]">
                      <StrikeSelector size="md" value={sequentialLegConfig.atm_strike || 'atm'} onChange={(value) => setSequentialLegConfig(prev => ({ ...prev, atm_strike: value }))} />
                    </div>
                  )}
                  {sequentialLegConfig.strike_criteria === 'based on atm percent' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-700">ATM</span>
                      <select value={sequentialLegConfig.atm_percent_direction || '+'} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, atm_percent_direction: e.target.value }))} className="appearance-none w-full pl-3.5 pr-7 h-8 text-[13px] border border-[#e3e3e3] rounded-md font-normal outline-none cursor-pointer" style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}>
                        <option value="+">+</option>
                        <option value="-">-</option>
                      </select>
                      <div className="relative flex items-center">
                        <input type="number" min="0" step="0.01" value={sequentialLegConfig.atm_percent_value ?? ''} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, atm_percent_value: e.target.value }))} className="w-24 pl-3.5 pr-8 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none" placeholder="0" />
                        <span className="absolute right-3 text-[13px] font-normal text-gray-700 pointer-events-none">%</span>
                      </div>
                      <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap">of ATM</span>
                    </div>
                  )}
                  {sequentialLegConfig.strike_criteria === 'closest premium' && (
                    <div className="flex flex-col">
                      <label className="text-[13px] font-medium text-gray-700 mb-1.5">Premium</label>
                      <input type="number" min="0" step="0.01" value={sequentialLegConfig.closest_premium_value ?? ''} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, closest_premium_value: e.target.value }))} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="50" />
                    </div>
                  )}
                  {sequentialLegConfig.strike_criteria === 'based on premium range' && (
                    <>
                      <div className="flex flex-col">
                        <label className="text-[13px] font-medium text-gray-700 mb-1.5">Lower</label>
                        <input type="number" step="0.01" value={sequentialLegConfig.lower_range ?? ''} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, lower_range: e.target.value }))} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="50" />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[13px] font-medium text-gray-700 mb-1.5">Upper</label>
                        <input type="number" step="0.01" value={sequentialLegConfig.upper_range ?? ''} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, upper_range: e.target.value }))} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="100" />
                      </div>
                    </>
                  )}
                </div>

                {/* Row 2: Target Profit / Stop Loss / Trail SL */}
                <div className="modal-field-row flex flex-wrap justify-center items-start gap-x-7 gap-y-5 mt-6">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Target Profit</label>
                      <ToggleSwitch size="sm" checked={sequentialLegConfig.target_enabled || false} onChange={modalTargetToggle(setSequentialLegConfig)} id="seqTargetProfit" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={sequentialLegConfig.target_type || 'points'} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, target_type: e.target.value }))} disabled={!sequentialLegConfig.target_enabled} className="appearance-none w-[10.25rem] pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="points">Points (Pts)</option>
                        <option value="underlying_points">Underlying Pts</option>
                        <option value="percentage">Percent (%)</option>
                        <option value="underlying_percentage">Underlying %</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={sequentialLegConfig.target_value || ''} onChange={(e) => { const val = e.target.value; if (val !== '' && Number(val) < 0) { setResponsePopup({ type: 'error', title: 'Target value cannot be negative' }); return; } setSequentialLegConfig(prev => ({ ...prev, target_value: val })); }} disabled={!sequentialLegConfig.target_enabled} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Stop Loss</label>
                      <ToggleSwitch size="sm" checked={sequentialLegConfig.stop_loss_enabled || false} onChange={modalStopLossToggle(setSequentialLegConfig)} id="seqStopLoss" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={sequentialLegConfig.stop_loss_type || 'points'} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, stop_loss_type: e.target.value }))} disabled={!sequentialLegConfig.stop_loss_enabled} className="appearance-none w-[10.25rem] pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="points">Points (Pts)</option>
                        <option value="underlying_points">Underlying Pts</option>
                        <option value="percentage">Percent (%)</option>
                        <option value="underlying_percentage">Underlying %</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={sequentialLegConfig.stop_loss_value || ''} onChange={(e) => { const val = e.target.value; if (val !== '' && Number(val) < 0) { setResponsePopup({ type: 'error', title: 'Stop Loss value cannot be negative' }); return; } setSequentialLegConfig(prev => ({ ...prev, stop_loss_value: val })); }} disabled={!sequentialLegConfig.stop_loss_enabled} className="w-[6.25rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Trail SL</label>
                      <Info size={14} className="text-gray-400" />
                      <ToggleSwitch size="sm" checked={sequentialLegConfig.trail_sl_enabled || false} onChange={(e) => { if (e.target.checked && !modalStopLossReady(sequentialLegConfig)) return; setSequentialLegConfig(prev => ({ ...prev, trail_sl_enabled: e.target.checked })); }} id="seqTrailSL" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={sequentialLegConfig.trail_sl_type || 'points'} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, trail_sl_type: e.target.value }))} disabled={!sequentialLegConfig.trail_sl_enabled} className="appearance-none w-36 pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="points">Points</option>
                        <option value="percentage">Percentage</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={sequentialLegConfig.trail_sl_value || ''} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, trail_sl_value: e.target.value }))} disabled={!sequentialLegConfig.trail_sl_enabled} className="w-[5.5rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                      <input type="number" min="0" step="0.01" value={sequentialLegConfig.trail_sl_lock_value || ''} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, trail_sl_lock_value: e.target.value }))} disabled={!sequentialLegConfig.trail_sl_enabled} className="w-[5.5rem] px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40" placeholder="0" />
                    </div>
                  </div>
                </div>

                {/* Row 3: Re-entries / Momentum */}
                <div className="modal-field-row flex flex-wrap justify-center items-start gap-x-7 gap-y-5 mt-6">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Re-entry on Tgt</label>
                      <Info size={14} className="text-gray-400" />
                      <ToggleSwitch size="sm" checked={sequentialLegConfig.reentry_tgt_enabled || false} onChange={(e) => { if (e.target.checked && !modalTargetReady(sequentialLegConfig)) return; setSequentialLegConfig(prev => ({ ...prev, reentry_tgt_enabled: e.target.checked })); }} id="seqReentryTgt" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={sequentialLegConfig.reentry_tgt_mode || 're_asap'} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, reentry_tgt_mode: e.target.value }))} disabled={!sequentialLegConfig.reentry_tgt_enabled} className="appearance-none w-40 pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="re_asap">RE ASAP</option>
                        <option value="re_asap_reverse">RE ASAP ↩</option>
                        <option value="re_momentum" disabled={!sequentialLegConfig.momentum_enabled}>RE MOMENTUM</option>
                        <option value="re_momentum_reverse" disabled={!sequentialLegConfig.momentum_enabled}>RE MOMENTUM ↩</option>
                        <option value="re_cost">RE COST</option>
                        <option value="re_cost_reverse">RE COST ↩</option>
                      </select>
                      <ReentryCountDropdown value={sequentialLegConfig.reentry_tgt_count} onChange={(v) => setSequentialLegConfig(prev => ({ ...prev, reentry_tgt_count: v }))} disabled={!sequentialLegConfig.reentry_tgt_enabled} heightClass="h-8" />
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] font-medium text-gray-700">Re-entry on SL</label>
                      <Info size={14} className="text-gray-400" />
                      <ToggleSwitch size="sm" checked={sequentialLegConfig.reentry_sl_enabled || false} onChange={(e) => { if (e.target.checked && !modalStopLossReady(sequentialLegConfig)) return; setSequentialLegConfig(prev => ({ ...prev, reentry_sl_enabled: e.target.checked })); }} id="seqReentrySL" />
                    </div>
                    <div className="flex gap-2">
                      <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={sequentialLegConfig.reentry_sl_mode || 're_asap'} onChange={(e) => setSequentialLegConfig(prev => ({ ...prev, reentry_sl_mode: e.target.value }))} disabled={!sequentialLegConfig.reentry_sl_enabled} className="appearance-none w-40 pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                        <option value="re_asap">RE ASAP</option>
                        <option value="re_asap_reverse">RE ASAP ↩</option>
                        <option value="re_momentum" disabled={!sequentialLegConfig.momentum_enabled}>RE MOMENTUM</option>
                        <option value="re_momentum_reverse" disabled={!sequentialLegConfig.momentum_enabled}>RE MOMENTUM ↩</option>
                        <option value="re_cost">RE COST</option>
                        <option value="re_cost_reverse">RE COST ↩</option>
                      </select>
                      <ReentryCountDropdown value={sequentialLegConfig.reentry_sl_count} onChange={(v) => setSequentialLegConfig(prev => ({ ...prev, reentry_sl_count: v }))} disabled={!sequentialLegConfig.reentry_sl_enabled} heightClass="h-8" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 bg-white pt-3 px-5 pb-4">
              <button
                onClick={closeSequentialLegModal}
                className="px-4 py-3 text-[12px] font-medium rounded hover:bg-gray-50 transition-colors"
                style={{ color: colors.settingsPanel.inactiveText }}
              >
                Cancel
              </button>
              <button
                onClick={createSequentialLeg}
                className="px-4 py-2 text-[12px] font-medium text-white rounded border transition-colors"
                style={{ backgroundColor: colors.legBuilder.addLegBg, borderColor: colors.legBuilder.addLegBg }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg;
                  e.currentTarget.style.borderColor = colors.legBuilder.addLegHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg;
                  e.currentTarget.style.borderColor = colors.legBuilder.addLegBg;
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}


            {/* ADDED LEGS - STRUCTURED LAYOUT MATCHING LEG BUILDER DESIGN */}
      {config.legs.length > 0 && (() => {
        const sortedLegs = (() => {
          const ordered = [];
          const placed = new Set();

          config.legs
            .filter(l => !l.isLazyLeg && !l.isSequentialLeg)
            .forEach(mainLeg => {
              ordered.push(mainLeg);
              placed.add(mainLeg.id);
              const seq = config.legs.find(l => l.isSequentialLeg && l.parentLegId === mainLeg.id);
              if (seq) {
                ordered.push(seq);
                placed.add(seq.id);
              }
            });

          config.legs.forEach(l => {
            if (!placed.has(l.id) && !l.isLazyLeg) ordered.push(l);
          });
          config.legs.forEach(l => {
            if (l.isLazyLeg) ordered.push(l);
          });

          return ordered;
        })();

        return (
          <div className="builder-legs-pad mx-0">
            {sortedLegs.length > 0 && (
              <h2 className="text-[20px] font-normal mb-2.5" style={{ color: colors.settingsPanel.heading }}>Legs</h2>
            )}
            {sortedLegs.map((leg, displayIndex) => {
              const legIndex = config.legs.findIndex(l => l.id === leg.id);

              // Calculate main leg number using already-sorted array
              const mainLegNumber = sortedLegs
                .slice(0, displayIndex + 1)
                .filter(l => !l.isLazyLeg && !l.isSequentialLeg)
                .length;

              return (
                <Fragment key={`legwrap-${leg.id}`}>
                {leg.isLazyLeg && sortedLegs.find(l => l.isLazyLeg) === leg && (
                  <h2 className="text-[20px] font-normal mb-2.5 mt-2" style={{ color: colors.settingsPanel.heading }}>Lazy Legs</h2>
                )}
                <LegCard
                  key={leg.id}
                  leg={leg}
                  legIndex={legIndex}
                  mainLegNumber={mainLegNumber}
                  allLegs={config.legs} 
                  strategyType={config.strategy_type} 
                  entryTime={config.entry_time}
                  dteFilter={config.dte_filter} 
                  positionalExpiry={config.positional_expiry}
                  updateLegInPlace={updateLegInPlace}
                  duplicateLeg={duplicateLeg} 
                  removeLeg={removeLeg}
                  setResponsePopup={setResponsePopup}
                  legValidationErrors={legValidationErrors}
                  setLegValidationErrors={setLegValidationErrors}
                  lazyLegDropdownOpen={lazyLegDropdownOpen}
                  setLazyLegDropdownOpen={setLazyLegDropdownOpen}
                  lazyLegExistingExpanded={lazyLegExistingExpanded}
                  setLazyLegExistingExpanded={setLazyLegExistingExpanded}
                  lazyLegDropdownRef={lazyLegDropdownRef}
                  setLazyLegConfig={setLazyLegConfig}
                  setLazyLegContext={setLazyLegContext}
                  setShowLazyLegModal={setShowLazyLegModal}
                  onAddSequentialLeg={openSequentialLegModal}
                  sidebarOpen={sidebarOpen}
                />
                </Fragment>
              );
            })}
          </div>
        );
      })()}

      {/* OVERALL STRATEGY SETTINGS SECTION - REDESIGNED WITH COMPACT STYLE */}
      <div data-pdf-block className="mx-0 mt-8 animate-fade-in">
          <h3 className="text-[20px] font-normal mb-2.5 flex items-center gap-2" style={{ color: colors.settingsPanel.heading }}>
            Overall strategy settings
            <Info size={14} style={{ color: colors.settingsPanel.heading }} />
          </h3>

          {/* Main Layout: 3 columns in row 1, with re-entry fields below */}
          <div className="builder-overall-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,20rem)_minmax(0,20rem)_minmax(0,1fr)] gap-6">
            
            {/* Column 1: Overall Stop Loss + Overall Target (stacked vertically) */}
            <div className="flex flex-col space-y-5 bg-white rounded-lg border p-5" style={{ borderColor: colors.settingsPanel.cardBorder }}>
              {/* Overall Stop Loss */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-[14px] font-medium text-gray-700">Overall Stop Loss</label>
                  <ToggleSwitch
                    size="sm"
                    checked={config.overall_stop_loss_enabled} 
                    onChange={(e) => handleChange('overall_stop_loss_enabled', e.target.checked)} 
                    id="overallStopLoss" 
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                  style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                    value={config.overall_stop_loss_mode}
                    onChange={(e) => handleChange('overall_stop_loss_mode', e.target.value)}
                    disabled={!config.overall_stop_loss_enabled}
                    className="appearance-none w-36 pl-3.5 pr-8 h-8 text-[14px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40"
                  >
                    <option value="mtm">MTM</option>
                    <option value="percent">Percent</option>
                  </select>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    value={config.overall_stop_loss_value} 
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== '' && val.includes('.')) {
                        setResponsePopup({ type: 'error', title: 'Overall Stop Loss must be a whole number' });
                        return;
                      }
                      if (val !== '' && Number(val) < 0) {
                        setResponsePopup({ type: 'error', title: 'Stop Loss value cannot be negative' });
                        return;
                      }
                      handleChange('overall_stop_loss_value', val);
                    }}
                    disabled={!config.overall_stop_loss_enabled}
                    className="w-[5rem] px-3.5 h-8 text-[14px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Overall Target - directly below Stop Loss */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-[14px] font-medium text-gray-700">Overall Target</label>
                  <ToggleSwitch
                    size="sm"
                    checked={config.overall_target_enabled} 
                    onChange={(e) => handleChange('overall_target_enabled', e.target.checked)} 
                    id="overallTarget" 
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                  style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                    value={config.overall_target_mode}
                    onChange={(e) => handleChange('overall_target_mode', e.target.value)}
                    disabled={!config.overall_target_enabled}
                    className="appearance-none w-36 pl-3.5 pr-8 h-8 text-[14px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40"
                  >
                    <option value="mtm">MTM</option>
                    <option value="percent">Percent</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={config.overall_target_value}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== '' && val.includes('.')) {
                        setResponsePopup({ type: 'error', title: 'Overall Target must be a whole number' });
                        return;
                      }
                      if (val !== '' && Number(val) < 0) {
                        setResponsePopup({ type: 'error', title: 'Target value cannot be negative' });
                        return;
                      }
                      handleChange('overall_target_value', val);
                    }}
                    disabled={!config.overall_target_enabled}
                    className="w-[5rem] px-3.5 h-8 text-[14px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Column 2: Overall Re-entry on SL + Overall Re-entry on Tgt (stacked vertically) */}
            <div className="flex flex-col space-y-5 bg-white rounded-lg border p-5" style={{ borderColor: colors.settingsPanel.cardBorder }}>
              {/* Overall Re-entry on SL */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-[14px] font-medium text-gray-700 w-[9.75rem]">Overall Re-entry on SL</label>
                  <ToggleSwitch
                    size="sm"
                    checked={config.overall_reentry_sl_enabled} 
                    onChange={(e) => { handleChange('overall_reentry_sl_enabled', e.target.checked); if (e.target.checked && !config.overall_reentry_sl_count) handleChange('overall_reentry_sl_count', '1'); }} 
                    id="overallReentrySL" 
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                  style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                    value={config.overall_reentry_sl_mode}
                    onChange={(e) => handleChange('overall_reentry_sl_mode', e.target.value)}
                    disabled={!config.overall_reentry_sl_enabled}
                    className="appearance-none w-40 pl-3.5 pr-8 h-8 text-[14px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40"
                  >
                    <option value="re_asap">RE ASAP</option>
                    <option value="re_asap_reverse">RE ASAP ↩</option>
                    <option value="re_momentum">RE MOMENTUM</option>
                    <option value="re_momentum_reverse">RE MOMENTUM ↩</option>
                  </select>
                  <ReentryCountDropdown
                    value={config.overall_reentry_sl_count}
                    onChange={(v) => handleChange('overall_reentry_sl_count', v)}
                    disabled={!config.overall_reentry_sl_enabled}
                    heightClass="h-8"
                  />
                </div>
              </div>

              {/* Overall Re-entry on Tgt - directly below Re-entry on SL */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-[14px] font-medium text-gray-700 w-[9.75rem]">Overall Re-entry on Tgt</label>
                  <ToggleSwitch
                    size="sm"
                    checked={config.overall_reentry_tgt_enabled} 
                    onChange={(e) => { handleChange('overall_reentry_tgt_enabled', e.target.checked); if (e.target.checked && !config.overall_reentry_tgt_count) handleChange('overall_reentry_tgt_count', '1'); }} 
                    id="overallReentryTgt" 
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                  style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                    value={config.overall_reentry_tgt_mode}
                    onChange={(e) => handleChange('overall_reentry_tgt_mode', e.target.value)}
                    disabled={!config.overall_reentry_tgt_enabled}
                    className="appearance-none w-40 pl-3.5 pr-8 h-8 text-[14px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40"
                  >
                    <option value="re_asap">RE ASAP</option>
                    <option value="re_asap_reverse">RE ASAP ↩</option>
                    <option value="re_momentum">RE MOMENTUM</option>
                    <option value="re_momentum_reverse">RE MOMENTUM ↩</option>
                  </select>
                  <ReentryCountDropdown
                    value={config.overall_reentry_tgt_count}
                    onChange={(v) => handleChange('overall_reentry_tgt_count', v)}
                    disabled={!config.overall_reentry_tgt_enabled}
                    heightClass="h-8"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-2 bg-white rounded-lg border p-5 w-full" style={{ borderColor: colors.settingsPanel.cardBorder }}>
              <div className="flex items-center gap-3">
                <label className="text-[14px] font-medium text-gray-700">Overall Trail SL</label>
                <ToggleSwitch
                  size="sm"
                  checked={config.lock_profit_enabled}
                  onChange={(e) => handleChange('lock_profit_enabled', e.target.checked)}
                  id="trailingOptions"
                />
              </div>
              {/* AlgoTest: mode dropdown + both trailing value fields on one row */}
              <div className="flex gap-2">
                <select
                style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                  value={config.lock_profit_mode}
                  onChange={(e) => handleChange('lock_profit_mode', e.target.value)}
                  disabled={!config.lock_profit_enabled}
                  className="appearance-none w-[8.5rem] pl-3.5 pr-8 h-8 text-[14px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40"
                >
                  <option value="mtm">MTM</option>
                  <option value="percent">Percent</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.lock_profit_value1 || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== '' && Number(val) < 0) {
                      setResponsePopup({ type: 'error', title: 'Trailing value cannot be negative' });
                      return;
                    }
                    handleChange('lock_profit_value1', val);
                  }}
                  disabled={!config.lock_profit_enabled}
                  className="w-20 px-3 h-8 text-[14px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                  placeholder="0"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.lock_profit_value2 || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== '' && Number(val) < 0) {
                      setResponsePopup({ type: 'error', title: 'Trailing value cannot be negative' });
                      return;
                    }
                    handleChange('lock_profit_value2', val);
                  }}
                  disabled={!config.lock_profit_enabled}
                  className="w-20 px-3 h-8 text-[14px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
      </div>

      <div data-pdf-block className="mx-0 mt-20 animate-fade-in"
           style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div className="bg-white rounded-lg border px-6 py-5 flex items-center gap-6 flex-wrap"
             style={{ borderColor: colors.settingsPanel.cardBorder }}>
          <span className="text-[16px]" style={{ color: colors.settingsPanel.heading }}>
            Enter the duration of your backtest
          </span>

          <span className="ml-auto flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-3">
              <span className="text-[13px] whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>
                Start Date
              </span>
              <DateSegmentInput
                compact
                value={config.start_date || ''}
                onCommit={(v) => handleChange('start_date', v)}
              />
            </label>

            <label className="flex items-center gap-3">
              <span className="text-[13px] whitespace-nowrap" style={{ color: colors.settingsPanel.label }}>
                End Date
              </span>
              <DateSegmentInput
                compact
                value={config.end_date || ''}
                onCommit={(v) => handleChange('end_date', v)}
              />
            </label>
          </span>
        </div>

        <div className="mt-5 rounded-lg border px-6 py-2.5 flex items-center justify-end gap-2"
             style={{ backgroundColor: '#FAF0E6', borderColor: colors.settingsPanel.cardBorder }}>
          <Info size={14} style={{ color: '#9A6B16' }} />
          <span className="text-[13px] font-semibold" style={{ color: '#9A6B16' }}>
            Latest Backtest data is available for {formatAdvisoryDate(DEFAULT_END_DATE)}
          </span>
        </div>
      </div>

      {/* Backtest Results Section - Show inline after backtest completes */}
      {backtestResults && (
        <div className="mt-8 pb-32 bg-white">
          <BacktestResults 
            results={backtestResults} 
            onSaveStrategy={onSaveStrategy}
            strategyId={strategyId}
            strategyName={config.strategy_name}
            strategySavedInSession={strategySavedInSession}
            onClearResults={onClearResults}
          />
        </div>
      )}

      {/* FIXED BOTTOM ACTION BAR */}
      <div data-builder-chrome="action-bar" className="ignore-pdf fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-1px_10px_rgba(0,0,0,0.05)] z-50">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-end gap-4">
            {strategyId && strategyId !== -999 && strategyId !== '-999' && (
              <button
                type="button"
                onClick={() => {
                  const legsErr = noLegsError(config);
                  if (legsErr) {
                    setResponsePopup({ type: 'error', title: legsErr });
                    return;
                  }

                  const rangeErr = rangeBreakoutDteError(config);
                  if (rangeErr) {
                    setResponsePopup({ type: 'error', title: rangeErr });
                    return;
                  }

                  const dayErr = positionalDayError(config.positional_entry_day, config.positional_exit_day);
                  if (dayErr) { setResponsePopup({ type: 'error', title: dayErr }); return; }
                  const expiryErr = positionalExpiryError();
                  if (expiryErr) { setResponsePopup({ type: 'error', title: expiryErr }); return; }
                  onSaveAsNew?.(latestConfigWithExtrasRef.current);
                }}
                className="flex items-center justify-center gap-2 px-4 py-3 h-[42px] shrink-0 border rounded transition-all duration-200 text-[12px] font-semibold bg-transparent"
                style={{
                  borderColor: colors.actionBar.secondaryBorder,
                  color: colors.actionBar.secondaryText,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                  e.currentTarget.style.color = 'white';
                  e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.color = colors.actionBar.secondaryText;
                  e.currentTarget.style.borderColor = colors.actionBar.secondaryBorder;
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                title="Save these changes as a brand-new strategy"
              >
                <CopyPlus size={16} />
                <span>Save As New</span>
              </button>
            )}

            {(() => {
              const isUpdate = Boolean(strategyId && strategyId !== -999 && strategyId !== '-999');
              return (
                <button
                  onClick={() => {
                    if (!isSaveButtonEnabled) {
                      setResponsePopup({ 
                        type: 'error', 
                        title: 'Please make changes before saving the strategy' 
                      });
                      return;
                    }
                    
                    const legsErr = noLegsError(config);
                  if (legsErr) {
                    setResponsePopup({ type: 'error', title: legsErr });
                    return;
                  }

                  const rangeErr = rangeBreakoutDteError(config);
                  if (rangeErr) {
                    setResponsePopup({ type: 'error', title: rangeErr });
                    return;
                  }

                  const dayErr = positionalDayError(config.positional_entry_day, config.positional_exit_day);
                    if (dayErr) {
                      setResponsePopup({ type: 'error', title: dayErr });
                      return;
                    }

                    const expiryErr = positionalExpiryError();
                    if (expiryErr) {
                      setResponsePopup({ type: 'error', title: expiryErr });
                      return;
                    }

                    onSaveStrategy({
                      ...latestConfigWithExtrasRef.current,
                      strategy_name: latestConfigWithExtrasRef.current.strategy_name || contextStrategyName,
                    }, { viaUpdateButton: true });
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 h-[42px] shrink-0 border rounded transition-all duration-200 text-[12px] font-semibold save-strategy-btn"
                  style={{
                    borderColor: colors.actionBar.secondaryBorder,
                    color: colors.actionBar.secondaryText,
                    backgroundColor: '#ffffff',
                    opacity: 1,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg;
                  }}
                  onMouseDown={(e) => {
                    if (isSaveButtonEnabled) {
                      e.currentTarget.style.transform = 'scale(0.95)';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (isSaveButtonEnabled) {
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.color = colors.actionBar.secondaryText;
                    e.currentTarget.style.borderColor = colors.actionBar.secondaryBorder;
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title={
                    !isSaveButtonEnabled
                      ? 'No changes to save'
                      : config.legs.length === 0
                        ? 'Add at least one leg before saving'
                        : 'Save this strategy'
                  }
                >
                  <Save size={16} />
                  {isUpdate ? 'Update' : 'Save Strategy'}
                </button>
              );
            })()}
            
            {/* Divider before Start Backtest */}
            <div className="h-10 w-px bg-gray-300"></div>
            
            <button 
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-4 py-1 h-[42px] shrink-0 text-white rounded border active:scale-95 transition-all duration-200 text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: colors.backtestButton.background }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = colors.backtestButton.hoverBackground)}
              onMouseLeave={(e) => !isLoading && (e.currentTarget.style.backgroundColor = colors.backtestButton.background)}
              title=""
            >
              {isLoading
                ? <span className="w-[15px] h-[15px] rounded-full border-2 border-white/40 border-t-white animate-spin shrink-0" />
                : <Play size={15} />}
              <span className="flex flex-col items-center leading-tight">
                <span>{isLoading ? 'Running Backtest' : 'Start Backtest'}</span>
                {/* Wired below: Shift+Enter starts the backtest. */}
                {!isLoading && <span className="text-[10px] font-normal opacity-90">(Shift+enter)</span>}
              </span>
            </button>
            
            {/* Divider after Start Backtest - Only show when Compare button is visible */}
            {strategySavedInSession && (
              <div className="h-10 w-px bg-gray-300"></div>
            )}
            
            {strategySavedInSession && (
              <button
                onClick={handleCompareBacktest}
                disabled={loadingCompare}
                className="flex items-center justify-center gap-2 px-4 py-3 h-[42px] shrink-0 border rounded transition-all duration-200 text-[12px] font-semibold bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: colors.actionBar.secondaryBorder,
                  color: colors.actionBar.secondaryText,
                  opacity: 1,
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (loadingCompare) return;
                  e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                  e.currentTarget.style.color = 'white';
                  e.currentTarget.style.borderColor = colors.actionBar.secondaryHoverBg;
                }}
                onMouseDown={(e) => {
                  if (!loadingCompare) e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onMouseUp={(e) => {
                  if (!loadingCompare) e.currentTarget.style.transform = 'scale(1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.color = colors.actionBar.secondaryText;
                  e.currentTarget.style.borderColor = colors.actionBar.secondaryBorder;
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Compare this strategy with other backtests"
              >
                <ArrowRightLeft size={16} className={loadingCompare ? 'animate-pulse' : ''} />
                {loadingCompare ? 'Loading...' : 'Compare Backtest'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RANGE BREAKOUT MODAL */}
      {rangeBreakoutModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full mx-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-800">Range Breakout</h2>
              <button 
                onClick={() => setRangeBreakoutModal({ ...rangeBreakoutModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600 hover:scale-125 hover:rotate-90 active:scale-90 transition-all duration-200"
              >
                ?
              </button>
            </div>

            {/* Content */}
            <div className="space-y-6">
              {/* Row 1: Entry DTE, Start Time, End DTE, End Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <div>
                  <label className="block text-lg text-gray-600 mb-2">Entry DTE</label>
                  <select 
                    value={rangeBreakoutModal.entryDte} 
                    onChange={(e) => setRangeBreakoutModal({ ...rangeBreakoutModal, entryDte: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-black rounded text-lg hover:border-gray-600 hover:shadow-md focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                   >
                    {[0, 1, 2, 3, 4, 5].map(dte => (
                      <option key={dte} value={dte}>{dte}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-lg text-gray-600 mb-2">Start Time</label>
                  <input 
                    type="text" 
                    value={rangeBreakoutModal.startTime} 
                    onChange={(e) => setRangeBreakoutModal({ ...rangeBreakoutModal, startTime: e.target.value })}
                    placeholder="09:17"
                    className="w-full px-4 py-3 border border-black rounded text-lg hover:border-gray-600 hover:shadow-md focus:ring-2 focus:ring-blue-500 transition-all duration-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-lg text-gray-600 mb-2">End DTE</label>
                  <select 
                    value={rangeBreakoutModal.endDte} 
                    onChange={(e) => setRangeBreakoutModal({ ...rangeBreakoutModal, endDte: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-black rounded text-lg hover:border-gray-600 hover:shadow-md focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                  >
                    {[0, 1, 2, 3, 4, 5].map(dte => (
                      <option key={dte} value={dte}>{dte}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-lg text-gray-600 mb-2">End Time</label>
                  <input 
                    type="text" 
                    value={rangeBreakoutModal.endTime} 
                    onChange={(e) => setRangeBreakoutModal({ ...rangeBreakoutModal, endTime: e.target.value })}
                    placeholder="09:45"
                    className="w-full px-4 py-3 border border-black rounded text-lg hover:border-gray-600 hover:shadow-md focus:ring-2 focus:ring-blue-500 transition-all duration-200 font-mono"
                  />
                </div>
              </div>

              {/* Row 2: Entry On and Tracking */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <label className="block text-lg text-gray-600 mb-3">Entry on</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setRangeBreakoutModal({ ...rangeBreakoutModal, entryOn: 'high' })}
                      className={`px-6 py-3 rounded text-lg font-medium hover:scale-105 hover:shadow-md active:scale-95 transition-all duration-200 ${
                        rangeBreakoutModal.entryOn === 'high'
                          ? 'bg-teal-100 text-teal-600 border border-teal-300'
                          : 'bg-white text-gray-700 border border-black'
                      }`}
                    >
                      High
                    </button>
                    <button 
                      onClick={() => setRangeBreakoutModal({ ...rangeBreakoutModal, entryOn: 'low' })}
                      className={`px-6 py-3 rounded text-lg font-medium hover:scale-105 hover:shadow-md active:scale-95 transition-all duration-200 ${
                        rangeBreakoutModal.entryOn === 'low'
                          ? 'bg-teal-100 text-teal-600 border border-teal-300'
                          : 'bg-white text-gray-700 border border-black'
                      }`}
                    >
                      Low
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-lg text-gray-600 mb-3">Tracking</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setRangeBreakoutModal({ ...rangeBreakoutModal, tracking: 'strike_price' })}
                      className={`px-6 py-3 rounded text-lg font-medium hover:scale-105 hover:shadow-md active:scale-95 transition-all duration-200 ${
                        rangeBreakoutModal.tracking === 'strike_price'
                          ? 'bg-teal-100 text-teal-600 border border-teal-300'
                          : 'bg-white text-gray-700 border border-black'
                      }`}
                    >
                      Strike Price
                    </button>
                    <button 
                      onClick={() => setRangeBreakoutModal({ ...rangeBreakoutModal, tracking: 'underlying' })}
                      className={`px-6 py-3 rounded text-lg font-medium hover:scale-105 hover:shadow-md active:scale-95 transition-all duration-200 ${
                        rangeBreakoutModal.tracking === 'underlying'
                          ? 'bg-teal-100 text-teal-600 border border-teal-300'
                          : 'bg-white text-gray-700 border border-black'
                      }`}
                    >
                      Underlying
                    </button>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="bg-gray-50 p-4 rounded-2xl">
                <p className="text-lg text-gray-700">
                  We will start by tracking the <strong>Selected Strike</strong> price between <strong>Entry DTE {rangeBreakoutModal.entryDte} {rangeBreakoutModal.startTime}:00</strong> and <strong>End DTE {rangeBreakoutModal.endDte} {rangeBreakoutModal.endTime}:59</strong>. We will take entry after <strong>{rangeBreakoutModal.endTime}:59</strong> once the <strong>{rangeBreakoutModal.entryOn === 'high' ? 'High' : 'Low'}</strong> price of the <strong>Selected Strike</strong> in the range is breached.
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-6 mt-8">
              <button 
                onClick={() => setRangeBreakoutModal({ ...rangeBreakoutModal, isOpen: false })}
                className="px-6 py-2 border border-black rounded-2xl text-gray-700 hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-95 font-medium transition-all duration-200"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  handleLegChange('range_instrument', rangeBreakoutModal.tracking === 'strike_price' ? 'instrument' : 'custom');
                  handleLegChange('range_time', rangeBreakoutModal.endTime);
                  setRangeBreakoutModal({ ...rangeBreakoutModal, isOpen: false });
                }}
                className="px-6 py-2 bg-teal-600 text-white rounded-2xl hover:bg-teal-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-95 font-medium transition-all duration-200"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TIME PICKER MODAL */}
      {timePickerModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-96">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Select Time (09:16 - 15:40)</h2>
              <button
                onClick={() => setTimePickerModal(false)}
                className="text-gray-400 hover:text-gray-600 hover:scale-125 hover:rotate-90 active:scale-90 text-2xl transition-all duration-200"
              >
                 
              </button>
            </div>

            {/* Hours and Minutes Input */}
            <div className="flex justify-center gap-6 mb-8">
              <div className="flex flex-col items-center">
                <label className="text-gray-600 font-medium mb-2">Hours</label>
                <input
                  type="number"
                  min="13"
                  max="21"
                  value={tempHour}
                  onChange={(e) => setTempHour(String(Math.min(21, Math.max(13, parseInt(e.target.value) || 13))))}
                  className="w-20 px-4 py-3 text-center text-xl border-2 border-blue-300 rounded-2xl font-semibold hover:border-blue-500 hover:shadow-md focus:ring-2 focus:ring-blue-500 transition-all duration-200"               />
              </div>
              <div className="flex items-end text-2xl font-bold text-gray-600 mb-2">:</div>
              <div className="flex flex-col items-center">
                <label className="text-gray-600 font-medium mb-2">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={tempMinute}
                  onChange={(e) => setTempMinute(String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, '0'))}
                  className="w-20 px-4 py-3 text-center text-xl border-2 border-blue-300 rounded-2xl font-semibold hover:border-blue-500 hover:shadow-md focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                />
              </div>
            </div>

            {/* Quick Select Times - Updated to 13:30 - 20:00 range */}
            <div className="mb-8">
              <label className="text-gray-700 font-semibold text-lg mb-3 block">Quick Select</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {['13:30', '14:00', '14:30', '15:00','15:30', '15:40'].map((time) => (
                  <button
                    key={time}
                    onClick={() => {
                      const [h, m] = time.split(':');
                      setTempHour(h);
                      setTempMinute(m);
                    }}
                    className="px-4 py-3 border-2 border-blue-400 text-blue-600 font-semibold rounded-2xl hover:bg-blue-50 hover:border-blue-600 hover:shadow-md hover:-translate-y-0.5 hover:scale-105 active:translate-y-0 active:scale-95 transition-all duration-200"
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>

            {/* Cancel and Select Buttons */}
            <div className="flex gap-6 justify-end">
              <button
                onClick={() => setTimePickerModal(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 font-semibold rounded-2xl hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const timeValue = `${String(tempHour).padStart(2, '0')}:${String(tempMinute).padStart(2, '0')}`;
                  
                  if (timePickerTarget === 'entry_time') {
                    handleLegChange('entry_time', timeValue);
                  } else if (timePickerTarget === 'exit_time') {
                    handleLegChange('exit_time', timeValue);
                  } else if (timePickerTarget === 'range_time') {
                    handleLegChange('range_time', timeValue);
                  }
                  setTimePickerModal(false);
                }}
                style={{ backgroundColor: colors.timePickerSelectButton.background }}
                className="px-6 py-2 text-white font-semibold rounded-2xl hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 hover:scale-105 active:translate-y-0 active:scale-95 transition-all duration-200"
              >
                Select
              </button>
            </div>
          </div>
        </div> 

      )}

      {/* Calendar Modal - Removed */}

      {/* ── Simple toast — shows backend response message ── */}
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

      {/* Keyframe for the dismiss progress bar */}

      {/* Compare Backtest Sidebar */}
      <CompareBacktestSidebar
        isOpen={compareSidebarOpen}
        onClose={() => setCompareSidebarOpen(false)}
        compareData={compareData}
        strategyName={config.strategy_name}
        strategyId={strategyId}
        onLoadVersion={onLoadVersion}
        onScrollToParameters={handleScrollToParameters}
      />

    </div>
  );
};

// Wrap in memo to prevent unnecessary re-renders from parent
export default memo(StrategyBuilder);