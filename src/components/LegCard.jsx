import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Info, Copy, X, CheckCircle2 } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';
import StrikeSelector from './StrikeSelector';
import SegmentedGroup from './SegmentedGroup';
import TimeSegmentInput from './TimeSegmentInput';
import PlainDropdown from './PlainDropdown';
import ReentryCountDropdown from './ReentryCountDropdown';
import { colors } from '../theme/colors';
import {
  MARKET_OPEN_TIME,
  EXIT_LAST_TIME,
  toMinutes,
  timeRangeError,
  formatTimeLabel,
  TIME_WARNING_DELAY_MS,
} from '../utils/timeRules';

// Custom dropdown chevron (appearance-none hides the clipped native arrow).
// strokeColor must be URL-encoded, e.g. '%234B5563', '%239CA3AF' or 'white'.
const selectChevron = (strokeColor) =>
  `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;


// Changed: Receives specific data instead of full config - prevents re-renders when unrelated config fields change
// All direct setConfig calls replaced with updateLegInPlace for better performance
const LegCard = ({
  leg,
  legIndex,
  mainLegNumber,
  allLegs, // Changed: from config.legs
  strategyType, // Changed: from config.strategy_type
  entryTime = MARKET_OPEN_TIME, // config.entry_time — Range Breakout's Start Time
  dteFilter, // Changed: from config.dte_filter
  positionalExpiry, // config.positional_expiry — the strategy's expiry basis
  updateLegInPlace,
  duplicateLeg, // Changed: added memoized handler
  removeLeg,
  setResponsePopup,
  legValidationErrors,
  setLegValidationErrors,
  lazyLegDropdownOpen,
  setLazyLegDropdownOpen,
  lazyLegExistingExpanded,
  setLazyLegExistingExpanded,
  lazyLegDropdownRef,
  setLazyLegConfig,
  setLazyLegContext,
  setShowLazyLegModal,
  onAddSequentialLeg,
  sidebarOpen = true,
}) => {
  // Range Breakout modal (AlgoTest style) — opens when the toggle turns ON.
  // Draft holds the pending values; Confirm writes them via updateLegInPlace,
  // Cancel just closes (the toggle stays ON with the leg's existing values,
  // same as the pre-modal behavior).
  const [uiRangeModalOpen, setUiRangeModalOpen] = useState(false);
  const [uiRangeDraft, setUiRangeDraft] = useState(null);
  const rangeEndTimeError = (endTime) => {
    const end = toMinutes(endTime);
    const start = toMinutes(entryTime);
    if (end === null) return 'Please enter a valid End Time (HH:MM)';
    if (start !== null && end <= start) return 'Exit Time must be greater than Entry Time';
    return timeRangeError('exit_time', endTime);
  };

  // Same deal as Entry/Exit Time: each hour/minute step commits, so the warning
  // waits until the user stops adjusting. null just cancels a pending warning.
  const rangeWarnTimerRef = useRef(null);
  const warnAboutRangeLater = (message) => {
    if (rangeWarnTimerRef.current) clearTimeout(rangeWarnTimerRef.current);
    rangeWarnTimerRef.current = null;
    if (!message) return;
    rangeWarnTimerRef.current = setTimeout(() => {
      rangeWarnTimerRef.current = null;
      setResponsePopup({ type: 'error', title: message });
    }, TIME_WARNING_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(rangeWarnTimerRef.current), []);

  const rangeDraftError = uiRangeDraft ? rangeEndTimeError(uiRangeDraft.range_time) : null;
  const endDteOptions = useMemo(
    () => Array.from(
      { length: (positionalExpiry || 'weekly') === 'monthly' ? 25 : 5 },
      (_, i) => String(i)
    ),
    [positionalExpiry]
  );

  const selectableLazyLegs = (allLegs || []).filter(
    (l) => (!leg.isLazyLeg ? l.isLazyLeg : (l.isLazyLeg && l.id !== leg.id))
  );

  const isSequentialStrategy = strategyType === 'sequential';

  // In a Sequential strategy the MAIN legs carry no per-leg exit conditions —
  // the whole Target Profit / Stop Loss / Trail SL row is dropped along with
  // Re-entry on Tgt and Re-entry on SL. Row 1, Simple Momentum and Range Break
  // Out render unchanged. A sequential leg's own card is exempt: it keeps every
  // field, so what the Create Sequential Leg modal configured stays editable.
  const hideExitFields = isSequentialStrategy && !leg.isSequentialLeg;

  // …and conversely, a sequential leg has neither Range Breakout nor Simple
  // Momentum, because the modal that creates it offers neither.
  const hideRangeBreakout = leg.isSequentialLeg;
  const hideMomentum = leg.isSequentialLeg;

  // Row 4 has everything it normally has. See the row itself for why it matters.
  const rowFourIsFull = !hideExitFields && !hideMomentum && !hideRangeBreakout;

  const stackLazyRows = leg.isLazyLeg && sidebarOpen;

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

  const stopLossReady = () => requireParentField(leg.stop_loss_enabled, leg.stop_loss_value, 'Stop Loss');
  const targetReady = () => requireParentField(leg.target_enabled, leg.target_value, 'Target');

  return (
    // id is the scroll anchor StrategyBuilder targets after add / copy / delete.
    <div id={`leg-card-${leg.id}`} className={`relative w-full bg-white rounded-lg border overflow-visible mb-8 pb-6 pt-2 animate-fade-in${leg.isLazyLeg || leg.isSequentialLeg ? ' leg-aligned-rows' : ''}`} style={{ borderColor: colors.settingsPanel.cardBorder, boxShadow: colors.settingsPanel.cardShadow }}>
      {/* Leg number chip (AlgoTest style) */}
      <div className="leg-badge absolute top-3 left-3 px-1.5 py-1 rounded bg-[#f5f5f5] text-[12px] font-semibold" style={{ color: '#555555' }}>
        {leg.isSequentialLeg
          ? (leg.customName && !/^SEQ\d+$/i.test(leg.customName)
              ? leg.customName
              : `SEQ${mainLegNumber}`)
          : leg.isLazyLeg
            ? (leg.customName || `Lazy #${leg.lazyLegNumber}`)
            : `# ${mainLegNumber}`}
      </div>
      <div className="absolute -top-2.5 -right-2.5 flex flex-col items-center gap-2 z-20">
        <button
          onClick={() => removeLeg(leg.id)}
          className="w-[28px] h-[28px] p-1 rounded-full border-2 border-white bg-[#b12020] hover:bg-[#8c1313] text-white flex items-center justify-center transition-colors"
          title="Remove leg"
        >
          <X size={16} />
        </button>
        <button
          onClick={() => duplicateLeg(legIndex, leg)}
          className="w-[28px] h-[28px] p-1 rounded-full border-2 border-white bg-[#808080] hover:bg-[#555555] text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={leg.isSequentialLeg ? "Copy to the next leg without a sequential leg" : "Duplicate leg"}
        >
          <Copy size={16} />
        </button>
      </div>

      {/* Content — single AlgoTest-style field row */}
      <div className="leg-content" style={{
        paddingLeft: '25px',
        paddingRight: '25px',
        paddingTop: '24px',
        paddingBottom: strategyType === 'positional' && !leg.isLazyLeg && !leg.isSequentialLeg ? '30px' : '10px'
      }}>
        {/* Row 1: Lots / Position / Option Type / Expiry / Select Strike Criteria (+ conditional) */}
        <div className="leg-top-row flex flex-wrap items-end justify-center gap-x-5 gap-y-3">
          <div className="flex flex-col">
            <label className="text-[13px] font-medium text-gray-700 mb-1.5">Lots</label>
            <input
              type="number"
              min="1"
              step="1"
              value={leg.lots}
              onChange={(e) => {
                // Kept as the raw string so the field can be cleared and retyped;
                // both payload builders run it through toNumber anyway.
                const val = e.target.value;
                if (val !== '') {
                  if (val.includes('.')) {
                    setResponsePopup({ type: 'error', title: 'Total Lot must be a whole number' });
                    return;
                  }
                  if (Number(val) < 0) {
                    setResponsePopup({ type: 'error', title: 'Total Lot cannot be negative' });
                    return;
                  }
                  if (Number(val) === 0) {
                    setResponsePopup({ type: 'error', title: 'Total Lot must be at least 1' });
                    return;
                  }
                }
                updateLegInPlace(legIndex, { lots: val });
              }}
              className="lot-spinner w-[5.25rem] px-3.5 h-8 text-[13px] font-normal border rounded-md bg-white outline-none"
              style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue }}
              placeholder="1"
            />
          </div>

          {/* Position — same updateLegInPlace wiring, rendered as an AlgoTest dropdown */}
          <div className="flex flex-col">
            <label className="text-[13px] font-medium text-gray-700 mb-1.5">Position</label>
            <select
              value={leg.position}
              onChange={(e) => updateLegInPlace(legIndex, { position: e.target.value })}
              className="appearance-none w-[5.25rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer"
              style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>

          {/* Option Type — same wiring, AlgoTest dropdown */}
          <div className="flex flex-col">
            <label className="text-[13px] font-medium text-gray-700 mb-1.5">Option Type</label>
            <select
              value={leg.option_type}
              onChange={(e) => updateLegInPlace(legIndex, { option_type: e.target.value })}
              className="appearance-none w-[5.25rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer"
              style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
            >
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>

          {/* Expiry — 0DTE/1DTE wired; Weekly/Next Weekly/Monthly are AlgoTest options added
              for appearance only, NOT handled by backtest logic yet. Wire later. */}
          <div className="flex flex-col">
            <label className="text-[13px] font-medium text-gray-700 mb-1.5">Expiry</label>
            <select
              value={leg.expiry}
              onChange={(e) => {
                const expiry = e.target.value;
                if (
                  strategyType === 'positional' &&
                  (positionalExpiry || 'weekly') === 'monthly' &&
                  (expiry === 'weekly' || expiry === 'next_weekly')
                ) {
                  setResponsePopup({
                    type: 'error',
                    title: 'Cannot enter on monthly expiry basis with a weekly leg',
                  });
                }
                updateLegInPlace(legIndex, { expiry });
              }}
              className="appearance-none w-[8.5rem] px-3.5 pr-8 h-8 text-[13px] font-normal border rounded-md outline-none cursor-pointer"
              style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
            >
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
            <select
              style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
              value={leg.strike_criteria}
              onChange={(e) => updateLegInPlace(legIndex, { strike_criteria: e.target.value })}
              className="appearance-none w-[13.5rem] px-3.5 pr-8 h-8 text-[13px] border border-[#e3e3e3] rounded-md font-normal outline-none cursor-pointer"
            >
              <option value="based on points">Based On Strike</option>
              <option value="based on atm percent">Based On ATM %</option>
              <option value="based on premium range">Based On premium range</option>
              <option value="closest premium">Based On Closest Premium</option>
            </select>
          </div>

          {leg.strike_criteria === 'closest premium' && (
            <div className="flex flex-col w-[6.5rem]">
              <label className="text-[13px] font-medium text-gray-700 mb-1.5">Premium</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={leg.closest_premium_value ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) < 0) {
                    setResponsePopup({ type: 'error', title: 'Nearest value cannot be negative' });
                    return;
                  }
                  updateLegInPlace(legIndex, { closest_premium_value: val });
                }}
                className="px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none"
                placeholder="0"
              />
            </div>
          )}

          {leg.strike_criteria === 'based on points' && (
            <div className="flex flex-col w-[6.5rem]">
              <StrikeSelector
                value={leg.strike_type || 'atm'}
                onChange={(value) => updateLegInPlace(legIndex, { strike_type: value })}
              />
            </div>
          )}

          {leg.strike_criteria === 'based on atm percent' && (
            <div className="flex gap-2 items-end">
              <div className="flex flex-col w-[4.25rem]">
                <label className="text-[13px] font-medium text-gray-700 mb-1.5">ATM</label>
                <select
                  style={{ backgroundColor: colors.dropdownPlain.background, borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                  value={leg.atm_percent_direction || '+'}
                  onChange={(e) => updateLegInPlace(legIndex, { atm_percent_direction: e.target.value })}
                  className="appearance-none w-full pl-3.5 pr-7 h-8 text-[13px] border border-[#e3e3e3] rounded-md font-normal outline-none cursor-pointer"
                >
                  <option value="+">+</option>
                  <option value="-">-</option>
                </select>
              </div>
              <div className="flex flex-col w-[6.5rem]">
                <label className="text-[13px] font-medium text-gray-700 mb-1.5">%</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={leg.atm_percent_value ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== '' && Number(val) < 0) {
                        setResponsePopup({ type: 'error', title: 'ATM % value cannot be negative' });
                        return;
                      }
                      updateLegInPlace(legIndex, { atm_percent_value: val });
                    }}
                    className="w-full px-3.5 pr-8 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-600">%</span>
                </div>
              </div>
            </div>
          )}

          {leg.strike_criteria === 'based on premium range' && (
            <div className="flex gap-3">
              <div className="flex flex-col w-[6.5rem]">
                <label className="text-[13px] font-medium text-gray-700 mb-1.5">Lower Range</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={leg.lower_range ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== '' && Number(val) < 0) {
                      setResponsePopup({ type: 'error', title: 'Lower Range cannot be negative' });
                      return;
                    }
                    updateLegInPlace(legIndex, { lower_range: val });
                  }}
                  className="px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none"
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col w-[6.5rem]">
                <label className="text-[13px] font-medium text-gray-700 mb-1.5">Upper Range</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={leg.upper_range ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== '' && Number(val) < 0) {
                      setResponsePopup({ type: 'error', title: 'Upper Range cannot be negative' });
                      return;
                    }
                    updateLegInPlace(legIndex, { upper_range: val });
                  }}
                  className="px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none"
                  placeholder="0"
                />
              </div>
            </div>
          )}

          {(leg.strike_criteria === 'premium_gte' || leg.strike_criteria === 'premium_lte') && (
            <div className="flex flex-col">
              <label className="text-[13px] font-medium text-gray-700 mb-1.5">Premium</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={leg.premium_value ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) < 0) {
                    setResponsePopup({ type: 'error', title: 'Premium cannot be negative' });
                    return;
                  }
                  updateLegInPlace(legIndex, { premium_value: val });
                }}
                className="px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none"
                placeholder="0"
              />
            </div>
          )}
        </div>
      </div>

      <div className={leg.isLazyLeg ? "flex flex-wrap justify-center items-start gap-x-3.5 gap-y-3 mt-5" : "contents"}>
      {!hideExitFields && (
        <div className={leg.isLazyLeg
          ? `leg-lazy-row flex flex-nowrap justify-center items-start gap-x-3.5 ${stackLazyRows ? 'basis-full' : ''}`
          : "leg-field-row flex flex-wrap justify-center items-start gap-x-6 gap-y-3 mt-5"}>
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-medium text-gray-700">Target Profit</label>
              <ToggleSwitch
                size="sm"
                checked={leg.target_enabled || false}
                onChange={(e) => {
                  // Re-entry on Tgt depends on Target, so switching Target off
                  // switches it off too rather than leaving a dependent toggle
                  // on with nothing behind it.
                  if (!e.target.checked) {
                    setLazyLegDropdownOpen(prev => ({ ...prev, [`tgt-${legIndex}`]: false }));
                    updateLegInPlace(legIndex, { target_enabled: false, reentry_tgt_enabled: false });
                    return;
                  }
                  updateLegInPlace(legIndex, { target_enabled: true });
                }}
                id={`target-${legIndex}`}
              />
            </div>
            <div className="flex gap-2">
              <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={leg.target_mode || 'points'} onChange={(e) => updateLegInPlace(legIndex, { target_mode: e.target.value })} disabled={!leg.target_enabled} className="w-[9.25rem] appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                <option value="points">Points (Pts)</option>
                <option value="underlying_points">Underlying Pts</option>
                <option value="percentage">Percent (%)</option>
                <option value="underlying_percentage">Underlying %</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={leg.target_value || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) < 0) {
                    setResponsePopup({ type: 'error', title: 'Target value cannot be negative' });
                    return;
                  }
                  updateLegInPlace(legIndex, { target_value: val });
                }}
                disabled={!leg.target_enabled}
                className="w-20 px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-medium text-gray-700">Stop Loss</label>
              <ToggleSwitch
                size="sm"
                checked={leg.stop_loss_enabled || false}
                onChange={(e) => {
                  // Trail SL and Re-entry on SL both build on Stop Loss, so
                  // switching Stop Loss off switches both of them off.
                  if (!e.target.checked) {
                    setLazyLegDropdownOpen(prev => ({ ...prev, [`sl-${legIndex}`]: false }));
                    updateLegInPlace(legIndex, {
                      stop_loss_enabled: false,
                      trail_enabled: false,
                      reentry_sl_enabled: false,
                    });
                    return;
                  }
                  updateLegInPlace(legIndex, { stop_loss_enabled: true });
                }}
                id={`stopLoss-${legIndex}`}
              />
            </div>
            <div className="flex gap-2">
              <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={leg.stop_loss_mode || 'points'} onChange={(e) => updateLegInPlace(legIndex, { stop_loss_mode: e.target.value })} disabled={!leg.stop_loss_enabled} className="w-[9.25rem] appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                <option value="points">Points (Pts)</option>
                <option value="underlying_points">Underlying Pts</option>
                <option value="percentage">Percent (%)</option>
                <option value="underlying_percentage">Underlying %</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={leg.stop_loss_value || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) < 0) {
                    setResponsePopup({ type: 'error', title: 'Stop Loss value cannot be negative' });
                    return;
                  }
                  updateLegInPlace(legIndex, { stop_loss_value: val });
                }}
                disabled={!leg.stop_loss_enabled}
                className="w-20 px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-medium text-gray-700">Trail SL</label>
              <Info size={14} className="text-gray-400" />
              <ToggleSwitch
                size="sm"
                checked={leg.trail_enabled || false}
                onChange={(e) => {
                  if (e.target.checked && !stopLossReady()) return;
                  updateLegInPlace(legIndex, { trail_enabled: e.target.checked });
                }}
                id={`trailSL-${legIndex}`}
              />
            </div>
            <div className="flex gap-2">
              <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} value={leg.trail_mode || 'points'} onChange={(e) => updateLegInPlace(legIndex, { trail_mode: e.target.value })} disabled={!leg.trail_enabled} className="w-[7.5rem] appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
                <option value="points">Points</option>
                <option value="percentage">Percentage</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={leg.trail_value || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) < 0) {
                    setResponsePopup({ type: 'error', title: 'Trail value cannot be negative' });
                    return;
                  }
                  updateLegInPlace(legIndex, { trail_value: val });
                }}
                disabled={!leg.trail_enabled}
                className="w-20 px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                placeholder="0"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={leg.trail_lock_value || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) < 0) {
                    setResponsePopup({ type: 'error', title: 'Trail lock value cannot be negative' });
                    return;
                  }
                  updateLegInPlace(legIndex, { trail_lock_value: val });
                }}
                disabled={!leg.trail_enabled}
                className="w-20 px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Row 4: Re-Entry On Target / Re-Entry On SL / Simple Momentum / Range Break Out / Add Sequential Button */}
      <div className={leg.isLazyLeg
          ? `leg-lazy-row flex flex-nowrap justify-center items-start gap-x-3.5 ${stackLazyRows ? 'basis-full' : ''}`
          : `leg-field-row flex flex-wrap justify-center items-start gap-x-6 gap-y-3 mt-5 ${rowFourIsFull ? 'pl-[10.5%]' : ''}`}>
        {!hideExitFields && (
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-medium text-gray-700">Re-entry on Tgt</label>
              <ToggleSwitch
                size="sm"
                checked={leg.reentry_tgt_enabled || false}
                onChange={(e) => {
                  if (e.target.checked && !targetReady()) return;
                  if (!e.target.checked) {
                    setLazyLegDropdownOpen(prev => ({ ...prev, [`tgt-${legIndex}`]: false }));
                  }
                  updateLegInPlace(legIndex, {
                    reentry_tgt_enabled: e.target.checked,
                    ...(e.target.checked && !leg.reentry_tgt_count ? { reentry_tgt_count: '1' } : {}),
                  });
                }}
                id={`reentryTarget-${legIndex}`}
              />
            </div>
            <div className="flex gap-2">
              <select
                style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                value={(leg.reentry_tgt_mode === 'lazy_leg' || leg.reentry_tgt_mode?.startsWith('lazy_leg_')) ? 'lazy_leg' : (leg.reentry_tgt_mode || 're_asap')}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'lazy_leg') {
                    updateLegInPlace(legIndex, { reentry_tgt_mode: 'lazy_leg' });
                    setLazyLegDropdownOpen(prev => ({ ...prev, [`tgt-${legIndex}`]: true }));
                  } else {
                    updateLegInPlace(legIndex, { reentry_tgt_mode: value });
                  }
                }}
                disabled={!leg.reentry_tgt_enabled}
                className="w-40 appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40"
              >
                <option value="re_asap">RE ASAP</option>
                <option value="re_asap_reverse">RE ASAP ↩</option>
                <option value="re_momentum" disabled={!leg.momentum_enabled}>RE MOMENTUM</option>
                <option value="re_momentum_reverse" disabled={!leg.momentum_enabled}>RE MOMENTUM ↩</option>
                <option value="re_cost">RE COST</option>
                <option value="re_cost_reverse">RE COST ↩</option>
                {!leg.isSequentialLeg && <option value="lazy_leg">Lazy Leg</option>}
              </select>

              {!leg.isSequentialLeg && (leg.reentry_tgt_mode === 'lazy_leg' || leg.reentry_tgt_mode?.startsWith('lazy_leg_')) && (
                <div
                  className="relative w-20 overflow-visible"
                  ref={(el) => lazyLegDropdownRef.current[`tgt-${legIndex}`] = el}
                  style={{ zIndex: lazyLegDropdownOpen[`tgt-${legIndex}`] ? 100 : 'auto' }}
                >
                  <button
                    type="button"
                    onClick={() => setLazyLegDropdownOpen(prev => ({ ...prev, [`tgt-${legIndex}`]: !prev[`tgt-${legIndex}`] }))}
                    disabled={!leg.reentry_tgt_enabled}
                    className="w-full pl-2.5 pr-2 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40 text-left flex items-center justify-between gap-1"
                  >
                    <span>
                      {(() => {
                        const referencedLazyLeg = allLegs.find(l => `lazy_leg_${l.id}` === leg.reentry_tgt_mode);
                        if (referencedLazyLeg) {
                          return referencedLazyLeg.customName || `lazy${referencedLazyLeg.lazyLegNumber}`;
                        }
                        return 'Select';
                      })()}
                    </span>
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {lazyLegDropdownOpen[`tgt-${legIndex}`] && (
                    <div className="absolute z-[60] right-0 mt-1 min-w-[10.5rem] bg-white border border-[#e3e3e3] rounded-md shadow-lg p-1.5 max-h-64 overflow-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setLazyLegConfig({
                            customName: '', lots: '1', expiry: 'weekly',
                            position: 'buy', option_type: 'call', strike_criteria: 'based on points',
                            atm_strike: 'atm', atm_percent_direction: '+', atm_percent_value: '',
                            closest_premium_value: '', lower_range: '', upper_range: '', premium_value: '',
                            target_enabled: false, target_type: 'points', target_value: '',
                            stop_loss_enabled: false, stop_loss_type: 'points', stop_loss_value: '',
                            trail_sl_enabled: false, trail_sl_type: 'points', trail_sl_value: '', trail_sl_lock_value: '',
                            reentry_tgt_enabled: false, reentry_tgt_mode: 're_asap', reentry_tgt_count: '',
                            reentry_sl_enabled: false, reentry_sl_mode: 're_asap', reentry_sl_count: '',
                            momentum_enabled: false, momentum_type: 'points_up', momentum_value: '',
                            range_breakout_enabled: false, range_instrument: 'underlying', range_time: '', range_direction: 'high'
                          });
                          setLazyLegContext({ legIndex, type: 'target' });
                          setShowLazyLegModal(true);
                          setLazyLegDropdownOpen(prev => ({ ...prev, [`tgt-${legIndex}`]: false }));
                        }}
                        className="w-full px-3.5 py-2 text-[13px] text-white font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
                        style={{ backgroundColor: colors.settingsPanel.tintSelectedTextActive }}
                      >
                        <span>+</span>
                        <span>Create New</span>
                      </button>

                      {selectableLazyLegs.length > 0 && (<>
                      <div className="py-1.5 text-center text-[12px] text-gray-400">OR</div>

                      <button
                        type="button"
                        onClick={() => setLazyLegExistingExpanded(prev => ({ ...prev, [`tgt-${legIndex}`]: !prev[`tgt-${legIndex}`] }))}
                        className="w-full px-2 py-1.5 text-[13px] font-medium rounded flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                        style={{ color: colors.settingsPanel.tintSelectedTextActive }}
                      >
                        <span>Select from existing</span>
                        <svg className={`w-3.5 h-3.5 transition-transform ${lazyLegExistingExpanded[`tgt-${legIndex}`] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {lazyLegExistingExpanded[`tgt-${legIndex}`] && (
                        <div className="mt-1">
                          {selectableLazyLegs.map(lazyLeg => (
                            <button
                              key={lazyLeg.id}
                              type="button"
                              onClick={() => {
                                updateLegInPlace(legIndex, { reentry_tgt_mode: `lazy_leg_${lazyLeg.id}` });
                                setLazyLegDropdownOpen(prev => ({ ...prev, [`tgt-${legIndex}`]: false }));
                              }}
                              className={`w-full px-3 py-2 text-left rounded transition-colors text-[13px] flex items-center justify-between gap-2 ${leg.reentry_tgt_mode === `lazy_leg_${lazyLeg.id}` ? 'text-gray-800' : 'text-gray-700 hover:bg-gray-50'}`}
                              style={leg.reentry_tgt_mode === `lazy_leg_${lazyLeg.id}` ? { backgroundColor: colors.settingsPanel.tintSelectedBg } : {}}
                            >
                              <span>{lazyLeg.customName || `lazy${lazyLeg.lazyLegNumber}`}</span>
                              {leg.reentry_tgt_mode === `lazy_leg_${lazyLeg.id}` && (
                                <CheckCircle2 size={15} style={{ color: colors.settingsPanel.tintSelectedTextActive }} />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      </>)}
                    </div>
                  )}
                </div>
              )}

              {!(leg.reentry_tgt_mode === 'lazy_leg' || leg.reentry_tgt_mode?.startsWith('lazy_leg_')) && (
                <ReentryCountDropdown
                  value={leg.reentry_tgt_count}
                  onChange={(v) => updateLegInPlace(legIndex, { reentry_tgt_count: v })}
                  disabled={!leg.reentry_tgt_enabled}
                />
              )}
            </div>
          </div>
        )}

        {!hideExitFields && (
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-medium text-gray-700">Re-entry on SL</label>
              <ToggleSwitch
                size="sm"
                checked={leg.reentry_sl_enabled || false}
                onChange={(e) => {
                  if (e.target.checked && !stopLossReady()) return;
                  if (!e.target.checked) {
                    setLazyLegDropdownOpen(prev => ({ ...prev, [`sl-${legIndex}`]: false }));
                  }
                  updateLegInPlace(legIndex, {
                    reentry_sl_enabled: e.target.checked,
                    ...(e.target.checked && !leg.reentry_sl_count ? { reentry_sl_count: '1' } : {}),
                  });
                }}
                id={`reentrySL-${legIndex}`}
              />
            </div>
            <div className="flex gap-2">
              <select
                style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }}
                value={(leg.reentry_sl_mode === 'lazy_leg' || leg.reentry_sl_mode?.startsWith('lazy_leg_')) ? 'lazy_leg' : (leg.reentry_sl_mode || 're_asap')}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'lazy_leg') {
                    updateLegInPlace(legIndex, { reentry_sl_mode: 'lazy_leg' });
                    setLazyLegDropdownOpen(prev => ({ ...prev, [`sl-${legIndex}`]: true }));
                  } else {
                    updateLegInPlace(legIndex, { reentry_sl_mode: value });
                  }
                }}
                disabled={!leg.reentry_sl_enabled}
                className="w-40 appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40"
              >
                <option value="re_asap">RE ASAP</option>
                <option value="re_asap_reverse">RE ASAP ↩</option>
                <option value="re_momentum" disabled={!leg.momentum_enabled}>RE MOMENTUM</option>
                <option value="re_momentum_reverse" disabled={!leg.momentum_enabled}>RE MOMENTUM ↩</option>
                <option value="re_cost">RE COST</option>
                <option value="re_cost_reverse">RE COST ↩</option>
                {!leg.isSequentialLeg && <option value="lazy_leg">Lazy Leg</option>}
              </select>

              {!leg.isSequentialLeg && (leg.reentry_sl_mode === 'lazy_leg' || leg.reentry_sl_mode?.startsWith('lazy_leg_')) && (
                <div
                  className="relative w-20 overflow-visible"
                  ref={(el) => lazyLegDropdownRef.current[`sl-${legIndex}`] = el}
                  style={{ zIndex: lazyLegDropdownOpen[`sl-${legIndex}`] ? 100 : 'auto' }}
                >
                  <button
                    type="button"
                    onClick={() => setLazyLegDropdownOpen(prev => ({ ...prev, [`sl-${legIndex}`]: !prev[`sl-${legIndex}`] }))}
                    disabled={!leg.reentry_sl_enabled}
                    className="w-full pl-2.5 pr-2 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40 text-left flex items-center justify-between gap-1"
                  >
                    <span>
                      {(() => {
                        const referencedLazyLeg = allLegs.find(l => `lazy_leg_${l.id}` === leg.reentry_sl_mode);
                        if (referencedLazyLeg) {
                          return referencedLazyLeg.customName || `lazy${referencedLazyLeg.lazyLegNumber}`;
                        }
                        return 'Select';
                      })()}
                    </span>
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {lazyLegDropdownOpen[`sl-${legIndex}`] && (
                    <div className="absolute z-[60] right-0 mt-1 min-w-[10.5rem] bg-white border border-[#e3e3e3] rounded-md shadow-lg p-1.5 max-h-64 overflow-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setLazyLegConfig({
                            customName: '', lots: '1', expiry: 'weekly',
                            position: 'buy', option_type: 'call', strike_criteria: 'based on points',
                            atm_strike: 'atm', atm_percent_direction: '+', atm_percent_value: '',
                            closest_premium_value: '', lower_range: '', upper_range: '', premium_value: '',
                            target_enabled: false, target_type: 'points', target_value: '',
                            stop_loss_enabled: false, stop_loss_type: 'points', stop_loss_value: '',
                            trail_sl_enabled: false, trail_sl_type: 'points', trail_sl_value: '', trail_sl_lock_value: '',
                            reentry_tgt_enabled: false, reentry_tgt_mode: 're_asap', reentry_tgt_count: '',
                            reentry_sl_enabled: false, reentry_sl_mode: 're_asap', reentry_sl_count: '',
                            momentum_enabled: false, momentum_type: 'points_up', momentum_value: '',
                            range_breakout_enabled: false, range_instrument: 'underlying', range_time: '', range_direction: 'high'
                          });
                          setLazyLegContext({ legIndex, type: 'sl' });
                          setShowLazyLegModal(true);
                          setLazyLegDropdownOpen(prev => ({ ...prev, [`sl-${legIndex}`]: false }));
                        }}
                        className="w-full px-3.5 py-2 text-[13px] text-white font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
                        style={{ backgroundColor: colors.settingsPanel.tintSelectedTextActive }}
                      >
                        <span>+</span>
                        <span>Create New</span>
                      </button>

                      {selectableLazyLegs.length > 0 && (<>
                      <div className="py-1.5 text-center text-[12px] text-gray-400">OR</div>

                      <button
                        type="button"
                        onClick={() => setLazyLegExistingExpanded(prev => ({ ...prev, [`sl-${legIndex}`]: !prev[`sl-${legIndex}`] }))}
                        className="w-full px-2 py-1.5 text-[13px] font-medium rounded flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                        style={{ color: colors.settingsPanel.tintSelectedTextActive }}
                      >
                        <span>Select from existing</span>
                        <svg className={`w-3.5 h-3.5 transition-transform ${lazyLegExistingExpanded[`sl-${legIndex}`] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {lazyLegExistingExpanded[`sl-${legIndex}`] && (
                        <div className="mt-1">
                          {selectableLazyLegs.map(lazyLeg => (
                            <button
                              key={lazyLeg.id}
                              type="button"
                              onClick={() => {
                                updateLegInPlace(legIndex, { reentry_sl_mode: `lazy_leg_${lazyLeg.id}` });
                                setLazyLegDropdownOpen(prev => ({ ...prev, [`sl-${legIndex}`]: false }));
                              }}
                              className={`w-full px-3 py-2 text-left rounded transition-colors text-[13px] flex items-center justify-between gap-2 ${leg.reentry_sl_mode === `lazy_leg_${lazyLeg.id}` ? 'text-gray-800' : 'text-gray-700 hover:bg-gray-50'}`}
                              style={leg.reentry_sl_mode === `lazy_leg_${lazyLeg.id}` ? { backgroundColor: colors.settingsPanel.tintSelectedBg } : {}}
                            >
                              <span>{lazyLeg.customName || `lazy${lazyLeg.lazyLegNumber}`}</span>
                              {leg.reentry_sl_mode === `lazy_leg_${lazyLeg.id}` && (
                                <CheckCircle2 size={15} style={{ color: colors.settingsPanel.tintSelectedTextActive }} />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      </>)}
                    </div>
                  )}
                </div>
              )}

              {!(leg.reentry_sl_mode === 'lazy_leg' || leg.reentry_sl_mode?.startsWith('lazy_leg_')) && (
                <ReentryCountDropdown
                  value={leg.reentry_sl_count}
                  onChange={(v) => updateLegInPlace(legIndex, { reentry_sl_count: v })}
                  disabled={!leg.reentry_sl_enabled}
                />
              )}
            </div>
          </div>
        )}

        {/* Simple Momentum */}
        {!hideMomentum && (
        <div className="flex flex-col space-y-2 relative">
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-gray-700">Simple Momentum</label>
            <Info size={14} className="text-gray-400" />
            <ToggleSwitch
                size="sm"
              checked={leg.momentum_enabled || false}
              onChange={(e) => {
                if (e.target.checked && leg.range_enabled) {
                  setLegValidationErrors(prev => ({ ...prev, [`momentum-${legIndex}`]: 'Please disable Range Break Out first.' }));
                  setTimeout(() => {
                    setLegValidationErrors(prev => { const u = { ...prev }; delete u[`momentum-${legIndex}`]; return u; });
                  }, 3000);
                  return;
                }
                setLegValidationErrors(prev => { const u = { ...prev }; delete u[`momentum-${legIndex}`]; return u; });

                const updatedLeg = { ...leg, momentum_enabled: e.target.checked };

                if (!e.target.checked) {
                  // Momentum re-entry modes are only valid while Simple Momentum
                  // is on; fall back to the default mode, not RE COST.
                  if (updatedLeg.reentry_tgt_mode === 're_momentum' || updatedLeg.reentry_tgt_mode === 're_momentum_reverse') {
                    updatedLeg.reentry_tgt_mode = 're_asap';
                  }
                  if (updatedLeg.reentry_sl_mode === 're_momentum' || updatedLeg.reentry_sl_mode === 're_momentum_reverse') {
                    updatedLeg.reentry_sl_mode = 're_asap';
                  }
                }

                updateLegInPlace(legIndex, updatedLeg);
              }}
              id={`momentum-${legIndex}`}
            />
          </div>
          <div className="flex gap-2 relative" style={leg.isLazyLeg ? { paddingBottom: '20px' } : {}}>
            <select style={{ backgroundColor: colors.settingsPanel.activeBg, color: colors.settingsPanel.activeText, borderColor: colors.settingsPanel.activeBg, backgroundImage: selectChevron('white'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center' }} 
value={leg.momentum_mode || leg.momentum_type || 'points'} onChange={(e) => updateLegInPlace(legIndex, { momentum_mode: e.target.value })} disabled={!leg.momentum_enabled} className="w-40 appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors disabled:opacity-40">
              <option value="points">Points (Pts) ↑</option>
              <option value="points_down">Points (Pts) ↓</option>
              <option value="percentage">Percent (%) ↑</option>
              <option value="percentage_down">Percent (%) ↓</option>
              <option value="underlying_points_up">Underlying Pts ↑</option>
              <option value="underlying_points_down">Underlying Pts ↓</option>
              <option value="underlying_percentage_up">Underlying % ↑</option>
              <option value="underlying_percentage_down">Underlying % ↓</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={leg.momentum_value || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== '' && Number(val) < 0) {
                  setResponsePopup({ type: 'error', title: 'Momentum value cannot be negative' });
                  return;
                }
                updateLegInPlace(legIndex, { momentum_value: val });
              }}
              disabled={!leg.momentum_enabled}
              className="w-20 px-3.5 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none transition-colors disabled:opacity-40"
              placeholder="0"
            />
            {legValidationErrors[`momentum-${legIndex}`] && (
              <p className="absolute top-full left-0 mt-1 text-[11px] leading-tight whitespace-nowrap pointer-events-none" style={{ color: '#DC2626' }}>
                {legValidationErrors[`momentum-${legIndex}`]}
              </p>
            )}
          </div>
        </div>
        )}

        {false && (
          <div className="flex flex-col space-y-2 relative">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-medium text-gray-700">Range Breakout</label>
              <Info size={14} className="text-gray-400" />
              <ToggleSwitch
                size="sm"
                checked={leg.range_enabled || false}
                onChange={(e) => {
                  if (e.target.checked && leg.momentum_enabled) {
                    setLegValidationErrors(prev => ({ ...prev, [`range-${legIndex}`]: 'Please disable Simple Momentum first.' }));
                    setTimeout(() => {
                      setLegValidationErrors(prev => { const u = { ...prev }; delete u[`range-${legIndex}`]; return u; });
                    }, 3000);
                    return;
                  }
                  setLegValidationErrors(prev => { const u = { ...prev }; delete u[`range-${legIndex}`]; return u; });
                  updateLegInPlace(legIndex, e.target.checked
                  // Seed the end time from the strategy's Entry Time so the row
                  // never shows a blank while Range Breakout is on.
                  ? { range_enabled: true, range_time: leg.range_time || entryTime }
                  : { range_enabled: false });
                if (e.target.checked) {
                  setUiRangeDraft({
                    range_time: leg.range_time || entryTime,
                    range_direction: leg.range_direction || 'high',
                    range_instrument: leg.range_instrument || 'underlying',
                    // One leg field behind two labels: "End Day" (today /
                    // tomorrow) for BTST, "End DTE" (a day count) for
                    // positional. Seeded from the leg so reopening the dialog
                    // shows what the row shows.
                    range_end_day: leg.range_end_day ?? (strategyType === 'positional' ? '0' : 'today'),
                  });
                  setUiRangeModalOpen(true);
                }
                }}
                id={`rangeBreakout-${legIndex}`}
              />
            </div>
            <div className="flex gap-2 relative">
              <select style={{ backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundColor: '#FFFFFF', borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? colors.settingsPanel.inputValue : '#9CA3AF', backgroundImage: leg.range_enabled ? selectChevron('%234B5563') : selectChevron('%239CA3AF') }} value={leg.range_instrument || 'underlying'} onChange={(e) => updateLegInPlace(legIndex, { range_instrument: e.target.value })} disabled={!leg.range_enabled} className="appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors cursor-pointer disabled:cursor-default w-32">
                <option value="instrument">Instrument</option>
                <option value="underlying">Underlying</option>
              </select>
              <TimeSegmentInput
                value={leg.range_time || entryTime}
                onCommit={(v) => {
                  updateLegInPlace(legIndex, { range_time: v });
                  warnAboutRangeLater(rangeEndTimeError(v));
                  return true;
                }}
                disabled={!leg.range_enabled}
                placeholder="Range end time"
                minTime={MARKET_OPEN_TIME}
                maxTime={EXIT_LAST_TIME}
              />
              <div className="flex">
                <button onClick={() => { if (leg.range_enabled) { updateLegInPlace(legIndex, { range_direction: 'high' }); } }} disabled={!leg.range_enabled} className={`px-4 rounded-md h-8 text-[13px] border transition-colors`} style={(leg.range_direction || 'high') === 'high' ? { backgroundColor: colors.settingsPanel.tintSelectedBg, borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? colors.settingsPanel.tintSelectedTextActive : colors.settingsPanel.tintSelectedText, fontWeight: 500 } : { backgroundColor: '#FFFFFF', borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? '#374151' : '#9CA3AF', fontWeight: 400 }}>High</button>
                <button onClick={() => { if (leg.range_enabled) { updateLegInPlace(legIndex, { range_direction: 'low' }); } }} disabled={!leg.range_enabled} className={`px-4 rounded-md -ml-px h-8 text-[13px] border transition-colors`} style={leg.range_direction === 'low' ? { backgroundColor: colors.settingsPanel.tintSelectedBg, borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? colors.settingsPanel.tintSelectedTextActive : colors.settingsPanel.tintSelectedText, fontWeight: 500 } : { backgroundColor: '#FFFFFF', borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? '#374151' : '#9CA3AF', fontWeight: 400 }}>Low</button>
              </div>
              {/* In-flow red line under the controls rather than a floating
                  bubble, which used to overlay whatever sat below it. */}
              {legValidationErrors[`range-${legIndex}`] && (
                <p className="absolute top-full left-0 mt-1 text-[11px] leading-tight whitespace-nowrap pointer-events-none" style={{ color: '#DC2626' }}>
                  {legValidationErrors[`range-${legIndex}`]}
                </p>
              )}
            </div>
          </div>
        )}
        {/* Range Breakout (intraday) — inline column in the same row, AlgoTest layout */}
      {!leg.isLazyLeg && !hideRangeBreakout && (
        <div className="flex flex-col space-y-2 relative">
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-gray-700 min-w-fit">Range Breakout</label>
            <Info size={14} className="text-gray-400" />
            <ToggleSwitch
                size="sm"
              checked={leg.range_enabled || false}
              onChange={(e) => {
                if (e.target.checked && leg.momentum_enabled) {
                  setLegValidationErrors(prev => ({ ...prev, [`range-${legIndex}`]: 'Please disable Simple Momentum first.' }));
                  setTimeout(() => {
                    setLegValidationErrors(prev => { const u = { ...prev }; delete u[`range-${legIndex}`]; return u; });
                  }, 3000);
                  return;
                }
                setLegValidationErrors(prev => { const u = { ...prev }; delete u[`range-${legIndex}`]; return u; });
                updateLegInPlace(legIndex, e.target.checked
                  // Seed the end time from the strategy's Entry Time so the row
                  // never shows a blank while Range Breakout is on.
                  ? { range_enabled: true, range_time: leg.range_time || entryTime }
                  : { range_enabled: false });
                if (e.target.checked) {
                  setUiRangeDraft({
                    range_time: leg.range_time || entryTime,
                    range_direction: leg.range_direction || 'high',
                    range_instrument: leg.range_instrument || 'underlying',
                    // One leg field behind two labels: "End Day" (today /
                    // tomorrow) for BTST, "End DTE" (a day count) for
                    // positional. Seeded from the leg so reopening the dialog
                    // shows what the row shows.
                    range_end_day: leg.range_end_day ?? (strategyType === 'positional' ? '0' : 'today'),
                  });
                  setUiRangeModalOpen(true);
                }
              }}
              id={`rangeBreakout-${legIndex}`}
            />
          </div>
          <div className="flex gap-2 items-center relative">
            {/* End DTE (AlgoTest Positional) -> range_end_day, sent as a STRING. */}
            {strategyType === 'positional' && (
              <>
                <span className={`text-[13px] font-normal ${leg.range_enabled ? 'text-gray-700' : 'text-gray-400'}`}>End DTE</span>
                {/* PlainDropdown, not a native select: the monthly list runs to
                    24 entries and the browser flips a popup that long upward.
                    Styled like the Entry-settings expiry dropdown. */}
                <PlainDropdown
                  value={String(leg.range_end_day ?? '0')}
                  options={endDteOptions}
                  onChange={(v) => updateLegInPlace(legIndex, { range_end_day: v })}
                  disabled={!leg.range_enabled}
                  buttonClassName="w-[4.25rem] h-8 py-0"
                />
              </>
            )}
            {/* End Day (AlgoTest BTST) -> range_end_day, "today" | "tomorrow". */}
            {strategyType === 'btst' && (<>
            <span className={`text-[13px] font-normal ${leg.range_enabled ? 'text-gray-700' : 'text-gray-400'}`}>End Day</span>
            <select
              value={leg.range_end_day ?? 'today'}
              onChange={(e) => updateLegInPlace(legIndex, { range_end_day: e.target.value })}
              disabled={!leg.range_enabled}
              className="appearance-none pl-3.5 pr-8 h-8 text-[13px] border border-[#e3e3e3] rounded-md bg-white font-normal outline-none cursor-pointer text-gray-700 disabled:text-gray-400 disabled:cursor-default"
              style={{ backgroundImage: leg.range_enabled ? selectChevron('%234B5563') : selectChevron('%239CA3AF'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}
            >
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
            </select>
            </>)}
            <TimeSegmentInput
                value={leg.range_time || entryTime}
                onCommit={(v) => {
                  updateLegInPlace(legIndex, { range_time: v });
                  warnAboutRangeLater(rangeEndTimeError(v));
                  return true;
                }}
                disabled={!leg.range_enabled}
                placeholder="Range end time"
                minTime={MARKET_OPEN_TIME}
                maxTime={EXIT_LAST_TIME}
              />
            <div className="flex">
              <button onClick={() => { if (leg.range_enabled) { updateLegInPlace(legIndex, { range_direction: 'high' }); } }} disabled={!leg.range_enabled} className={`px-4 rounded-md h-8 text-[13px] border transition-colors`} style={(leg.range_direction || 'high') === 'high' ? { backgroundColor: colors.settingsPanel.tintSelectedBg, borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? colors.settingsPanel.tintSelectedTextActive : colors.settingsPanel.tintSelectedText, fontWeight: 500 } : { backgroundColor: '#FFFFFF', borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? '#374151' : '#9CA3AF', fontWeight: 400 }}>High</button>
              <button onClick={() => { if (leg.range_enabled) { updateLegInPlace(legIndex, { range_direction: 'low' }); } }} disabled={!leg.range_enabled} className={`px-4 rounded-md -ml-px h-8 text-[13px] border transition-colors`} style={leg.range_direction === 'low' ? { backgroundColor: colors.settingsPanel.tintSelectedBg, borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? colors.settingsPanel.tintSelectedTextActive : colors.settingsPanel.tintSelectedText, fontWeight: 500 } : { backgroundColor: '#FFFFFF', borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? '#374151' : '#9CA3AF', fontWeight: 400 }}>Low</button>
            </div>
            <select style={{ backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundColor: '#FFFFFF', borderColor: colors.settingsPanel.fieldBorder, color: leg.range_enabled ? colors.settingsPanel.inputValue : '#9CA3AF', backgroundImage: leg.range_enabled ? selectChevron('%234B5563') : selectChevron('%239CA3AF') }} value={leg.range_instrument || 'underlying'} onChange={(e) => updateLegInPlace(legIndex, { range_instrument: e.target.value })} disabled={!leg.range_enabled} className="appearance-none pl-3.5 pr-8 h-8 text-[13px] border rounded-md font-normal outline-none transition-colors cursor-pointer disabled:cursor-default w-32">
              <option value="instrument">Instrument</option>
              <option value="underlying">Underlying</option>
            </select>
            {legValidationErrors[`range-${legIndex}`] && (
              <p className="absolute top-full left-0 mt-1 text-[11px] leading-tight whitespace-nowrap pointer-events-none" style={{ color: '#DC2626' }}>
                {legValidationErrors[`range-${legIndex}`]}
              </p>
            )}
          </div>
        </div>
      )}

      </div>
      </div>

      {isSequentialStrategy && !leg.isLazyLeg && !leg.isSequentialLeg && (
        <div className="leg-seq-row flex flex-col justify-end" style={{ paddingLeft: '25px', paddingRight: '25px', paddingBottom: '10px' }}>
          {/* Same fill / hover as the Add Leg button (colors.legBuilder). */}
          <button
            onClick={() => onAddSequentialLeg(leg)}
            className="px-3.5 py-1.5 text-white rounded-md text-[13px] font-medium transition-colors self-end"
            style={{ backgroundColor: colors.legBuilder.addLegBg }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegHoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.legBuilder.addLegBg; }}
          >
            Add Sequential Leg
          </button>
        </div>
      )}

      {uiRangeModalOpen && uiRangeDraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-semibold text-gray-800">Range Breakout</h3>
              <button onClick={() => setUiRangeModalOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-wrap gap-5 mb-4">
              {strategyType === 'positional' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-gray-400">Entry DTE</label>
                  {/* Entry DTE — VISUAL ONLY, not wired. Wire later. */}
                  <select disabled className="appearance-none w-20 pl-3 pr-7 py-[5px] text-[13px] border rounded-md bg-white text-gray-400 outline-none" style={{ borderColor: colors.settingsPanel.disabledFieldBorder, backgroundImage: selectChevron('%239CA3AF'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
                    <option>0</option>
                  </select>
                </div>
              )}
              {strategyType === 'btst' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-gray-400">Start Day</label>
                  {/* Start Day — VISUAL ONLY, not wired. Wire later. */}
                  <select disabled className="appearance-none w-24 pl-3 pr-7 py-[5px] text-[13px] border rounded-md bg-white text-gray-400 outline-none" style={{ borderColor: colors.settingsPanel.disabledFieldBorder, backgroundImage: selectChevron('%239CA3AF'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
                    <option>Today</option>
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-gray-400">Start Time</label>
                <TimeSegmentInput value={entryTime} disabled placeholder="Start Time" />
              </div>
              {strategyType === 'positional' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-gray-700">End DTE</label>
                  <PlainDropdown
                    value={String(uiRangeDraft.range_end_day ?? '0')}
                    options={endDteOptions}
                    onChange={(v) => setUiRangeDraft((d) => ({ ...d, range_end_day: v }))}
                    buttonClassName="w-20 h-9 py-0"
                  />
                </div>
              )}
              {strategyType === 'btst' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-gray-700">End Day</label>
                  <select
                    value={uiRangeDraft.range_end_day ?? 'today'}
                    onChange={(e) => setUiRangeDraft((d) => ({ ...d, range_end_day: e.target.value }))}
                    className="appearance-none w-28 pl-3 pr-7 py-[5px] text-[13px] border rounded-md bg-white outline-none cursor-pointer"
                    style={{ borderColor: colors.settingsPanel.fieldBorder, color: colors.settingsPanel.inputValue, backgroundImage: selectChevron('%234B5563'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}
                  >
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-gray-700">End Time</label>
                <TimeSegmentInput
                  value={uiRangeDraft.range_time}
                  onCommit={(v) => {
                    setUiRangeDraft((d) => ({ ...d, range_time: v }));
                    warnAboutRangeLater(rangeEndTimeError(v));
                    return true;
                  }}
                  placeholder="End Time"
                  minTime={MARKET_OPEN_TIME}
                  maxTime={EXIT_LAST_TIME}
                />
              </div>
            </div>
            <div className="flex gap-8 mb-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-gray-700">Entry on</label>
                <SegmentedGroup
                  tint
                  padX="px-3.5"
                  options={[{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }]}
                  value={uiRangeDraft.range_direction}
                  onChange={(v) => setUiRangeDraft((d) => ({ ...d, range_direction: v }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-gray-700">Tracking</label>
                <SegmentedGroup
                  tint
                  padX="px-3.5"
                  options={[{ value: 'instrument', label: 'Instrument' }, { value: 'underlying', label: 'Underlying' }]}
                  value={uiRangeDraft.range_instrument}
                  onChange={(v) => setUiRangeDraft((d) => ({ ...d, range_instrument: v }))}
                />
              </div>
            </div>
            <p className="text-[13px] text-gray-700 leading-6 mb-6">
              We will start by tracking the <b>{uiRangeDraft.range_instrument === 'underlying' ? 'Underlying' : 'Instrument'}</b> price
              between <b>{strategyType === 'btst' ? 'Today ' : strategyType === 'positional' ? 'Entry DTE 0 ' : ''}{formatTimeLabel(entryTime)}</b> and{' '}
              <b>{strategyType === 'btst' ? (uiRangeDraft.range_end_day === 'tomorrow' ? 'Tomorrow ' : 'Today ') : strategyType === 'positional' ? `End DTE ${uiRangeDraft.range_end_day ?? '0'} ` : ''}{formatTimeLabel(uiRangeDraft.range_time)}</b>.
              We will take entry after <b>{formatTimeLabel(uiRangeDraft.range_time)}</b> once
              the <b>{uiRangeDraft.range_direction === 'high' ? 'High' : 'Low'}</b> price of
              the <b>{uiRangeDraft.range_instrument === 'underlying' ? 'Underlying' : 'Instrument'}</b> in the range is breached.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setUiRangeModalOpen(false)}
                className="px-4 py-2 text-[13px] font-medium rounded-md hover:bg-gray-50 transition-colors"
                style={{ color: colors.settingsPanel.activeBg }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (rangeDraftError) {
                    setResponsePopup({ type: 'error', title: rangeDraftError });
                    return;
                  }
                  const { range_time, range_direction, range_instrument, range_end_day } = uiRangeDraft;
                  updateLegInPlace(legIndex, { range_time, range_direction, range_instrument, range_end_day });
                  setUiRangeModalOpen(false);
                }}
                aria-disabled={rangeDraftError ? 'true' : undefined}
                title={rangeDraftError || 'Confirm'}
                className={`px-5 py-2 text-[13px] font-medium text-white rounded-md transition-colors ${rangeDraftError ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ backgroundColor: colors.legBuilder.addLegBg }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(LegCard);