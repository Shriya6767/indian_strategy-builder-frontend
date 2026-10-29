import {
  DEFAULT_SYMBOL,
  DEFAULT_START_DATE,
  DEFAULT_END_DATE,
  DEFAULT_EXIT_TIME,
} from './constants';
import { MARKET_OPEN_TIME } from '../utils/timeRules';

/**
 * The shape of a brand-new strategy, and of a brand-new leg.
 *
 * Moved out of StrategyBuilder when the .algtst importer needed the same
 * starting point -- an imported file carries only what the exporter writes, so
 * the rest must come from these same defaults. A drifted default is invisible
 * until a field reaches the backend as undefined.
 *
 * Both functions return a FRESH object every call; never export the literals,
 * or one screen's edits leak into the next.
 */

export const getDefaultConfig = () => ({
  symbol: 'sensex',
  start_month: '',
  start_year: '',
  end_month: '',
  end_year: '',
  // Prefilled so a new strategy has a usable backtest window out of the
  // box; both remain fully editable in Data Selection.
  start_date: DEFAULT_START_DATE,
  end_date: DEFAULT_END_DATE,
  // Backs the Index dropdown and is sent as `symbol` (load-data, save,
  // run-backtest). It MUST equal one of the dropdown's option values —
  // the placeholder 'null' matched none, so the select displayed SENSEX
  // while the requests carried the string "null".
  dte_filter: DEFAULT_SYMBOL,
  instrument_index: DEFAULT_SYMBOL,
  underlying_from: 'cash',
  underlying_type: 'cash',
  square_off: 'partial',
  is_squareoff: false,
  trail_to_be: false,
  trail_to_be_scope: 'all_legs', // 'all_legs' | 'sl_legs'
  is_trail_sl_break_even: false,
  trail_sl_break_even_type: 'na',
  strategy_type: 'intraday',
  sequential_position_type: 'BUY',
  entry_time: MARKET_OPEN_TIME,
  exit_time: DEFAULT_EXIT_TIME,
  // BTST "Delay restart". Defaults to the session open — the old UI-only
  // default of 09:15 sat one minute outside the allowed 09:16–15:40 window,
  // so the field was invalid before the user touched it.
  // Intraday/Sequential show this where BTST/Positional show "Delay restart".
  no_reentry_after_enabled: false,
  no_reentry_after_time: '09:35',
  delay_restart_enabled: false,
  delay_restart_time: MARKET_OPEN_TIME,
  // Positional. positional_expiry drives how many "trading days before
  // expiry" the Entry/Exit dropdowns offer (weekly 0-4, monthly 0-24).
  positional_expiry: 'weekly',
  positional_entry_day: '0',
  positional_exit_day: '0',
  // "Stop monitoring after" (Positional) — UI ONLY for now, deliberately not
  // in any payload. Same 09:16-15:40 window as the other time fields.
  stop_monitoring_enabled: false,
  stop_monitoring_time: DEFAULT_EXIT_TIME,
  lot_size: 1,
  legs: [],
  is_strategy_sl: false,
  strategy_sl_type: 'points',
  strategy_sl_value: 0,
  is_strategy_target: false,
  strategy_target_type: 'points',
  strategy_target_value: 0,
  overall_stop_loss_enabled: false,
  overall_stop_loss_mode: 'mtm',
  overall_stop_loss_value: '',  // Empty by default
  overall_target_enabled: false,
  overall_target_mode: 'mtm',
  overall_target_value: '',  // Empty by default
  lock_profit_enabled: false,
  lock_profit_mode: 'mtm',  // Default to MTM
  lock_profit_value: 0,
  lock_profit_value1: '',  // First input field
  lock_profit_value2: '',  // Second input field
  lock_profit_lock_value: 1,
  is_overall_reentry_sl: false,
  overall_reentry_sl_enabled: false,
  overall_reentry_sl_mode: 're_asap',
  overall_reentry_sl_type: 're_asap',
  overall_reentry_sl_count: '',  // Empty by default
  overall_reentry_sl_value: 0,
  overall_reentry_sl_cost_mode: 'same_capital',
  overall_reentry_sl_multiplier: 2,
  overall_reentry_sl_cost_value: 1,
  is_overall_reentry_target: false,
  overall_reentry_tgt_enabled: false,
  overall_reentry_tgt_mode: 're_asap',
  overall_reentry_target_type: 're_asap',
  overall_reentry_tgt_count: '',  // Empty by default
  overall_reentry_target_value: 0,
  overall_reentry_tgt_cost_mode: 'profit_percentage',
  overall_reentry_tgt_cost_value: 1,
  is_overall_trail_sl: false,
  overall_trail_sl_enabled: false,
  overall_trail_sl_type: 'points',
  overall_instrument_move: 0,
  overall_stoploss_move: 0,
});

/** A fresh leg, in the state the Leg Builder starts every leg in. */
export const getDefaultLeg = () => ({
  segment: 'options',
  lots: '1',
  position: 'buy',
  option_type: 'call',
  expiry: 'weekly',
  strike_criteria: 'based on points',
  strike_type: 'atm',
  strike_value: '',
  premium_tolerance: '',
  atm_percent_direction: '+',
  atm_percent_value: '',
  // Empty, not seeded: a value the user never typed must never reach a
  // request. The inputs carry placeholders, so they still read as 50/100/50
  // hints without putting real data on the leg.
  lower_range: '',
  upper_range: '',
  closest_premium_value: '',
  entry_time: '',  // Empty = use global time
  exit_time: '',   // Empty = use global time
  target_enabled: false,
  target_mode: 'points',
  target_value: '',
  stop_loss_enabled: false,
  stop_loss_mode: 'points',
  stop_loss_value: '',
  trail_enabled: false,
  trail_mode: 'points',
  trail_value: '',
  momentum_enabled: false,
  momentum_mode: 'points',
  momentum_value: '',
  range_enabled: false,
  range_instrument: 'underlying',
  range_time: '',
  reentry_tgt_enabled: false,
  reentry_tgt_mode: 're_asap',
  reentry_tgt_count: '',
  reentry_sl_enabled: false,
  reentry_sl_mode: 're_asap',
  reentry_sl_count: '',
  trail_lock_value: '',
  range_breadth_enabled: false,
  range_breadth_comparison: 'gte',
  range_breadth_value: '',
  open_low_enabled: false,
  open_low_mode: 'points',
  open_low_value: '',
  open_high_enabled: false,
  open_high_mode: 'points',
  open_high_value: '',
  gap_filter_enabled: false,
  gap_filter_instrument: 'instrument',
  gap_filter_direction: 'gap_up',
  gap_filter_comparison: 'gte',
  gap_filter_value: '',
});
