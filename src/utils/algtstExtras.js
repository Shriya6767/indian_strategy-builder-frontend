/**
 * The `strategydesk` block riding alongside a `.algtst` file.
 *
 * The reference format cannot express positional days, per-leg times, premium
 * strikes, range breakout, gap filters or sequential legs, so a round trip
 * through their fields alone would return a strategy that looks right and
 * behaves differently. Reference fields are kept exactly as they were; ONLY
 * what they cannot express goes here, or there would be two sources of truth.
 *
 * Lazy legs are not here yet: dropped on export with a warning, refused on
 * import, until there is a real populated IdleLegConfigs to match.
 */

import { getDefaultConfig, getDefaultLeg } from '../config/defaultStrategyConfig';

/** Strategy-level settings the reference format has no field for. */
const STRATEGY_FIELDS = [
  // NOT here, deliberately:
  //   start_date / end_date — a file does not carry a backtest window at all.
  //     An imported strategy takes this build's default dates, which is what
  //     the form shows for anything new.
  //   positional_expiry / entry day / exit day — these have a real home in the
  //     reference format (a PositionalIndicator in Entry and Exit), so they are
  //     written there rather than here.
  // The strategy row's re-entry clock: "No re-entry after" for
  // intraday/sequential, "Delay restart" for BTST/positional.
  'no_reentry_after_enabled', 'no_reentry_after_time',
  'delay_restart_enabled', 'delay_restart_time',
  'stop_monitoring_enabled', 'stop_monitoring_time',
  // Trail SL to break-even applies to all legs or only the ones with an SL;
  // the reference field is a bare boolean, so the scope has to live here.
  'trail_to_be_scope',
  // Overall trail SL: the on/off, the two numbers and the unit are all written
  // as real fields now (OverallTrailSL), so only the older mirror keys that
  // have no home over there stay here.
  'overall_trail_sl_type',
  'overall_instrument_move', 'overall_stoploss_move',
  // NOT here: the overall stop loss and target. MTM and Percent map onto the
  // reference format's Points and Percentage (see OVERALL_TYPE in
  // algtstExport), so they are written as real fields.
  // Re-entry cost settings sit behind the count the reference field carries.
  'overall_reentry_sl_cost_mode', 'overall_reentry_sl_multiplier', 'overall_reentry_sl_cost_value',
  'overall_reentry_tgt_cost_mode', 'overall_reentry_tgt_cost_value',
  'sequential_position_type',
];

/** Per-leg settings with no reference field. */
const LEG_FIELDS = [
  'segment',
  // A lazy leg can be given a name of its own in the builder.
  'customName',
  'entry_time', 'exit_time',
  // Everything about choosing a strike other than by strike type.
  'strike_criteria', 'strike_value', 'premium_tolerance',
  'atm_percent_direction', 'atm_percent_value',
  'lower_range', 'upper_range', 'closest_premium_value',
  // Entry conditions.
  // All five: the toggle, what is tracked, when the window ends (range_end_day
  // is "today"/"tomorrow" for BTST and a DTE count for positional), the end
  // time, and which side of the range triggers entry. Leaving any of them out
  // is a strategy that imports looking right and enters on the wrong signal.
  'range_enabled', 'range_instrument', 'range_time',
  'range_end_day', 'range_direction',
  'range_breadth_enabled', 'range_breadth_comparison', 'range_breadth_value',
  'open_low_enabled', 'open_low_mode', 'open_low_value',
  'open_high_enabled', 'open_high_mode', 'open_high_value',
  'gap_filter_enabled', 'gap_filter_instrument', 'gap_filter_direction',
  'gap_filter_comparison', 'gap_filter_value',
];

/**
 * The listed fields that DIFFER from a fresh strategy's.
 *
 * Only differences are carried, which is what keeps an ordinary strategy's file
 * byte-identical to the reference format — no block at all, nothing for another
 * reader to trip over. A field left at its default needs no recording: import
 * starts from those same defaults.
 */
const pickChanged = (source, defaults, fields) => {
  const out = {};
  fields.forEach((field) => {
    const value = source?.[field];
    if (value === undefined) return;
    if (JSON.stringify(value) === JSON.stringify(defaults[field])) return;
    out[field] = value;
  });
  return out;
};

export const EXTRAS_KEY = 'strategydesk';
const EXTRAS_VERSION = 1;

/** Main legs, in the order the reference file lists them. */
export const mainLegsOf = (legs = []) => legs.filter((l) => !l.isLazyLeg && !l.isSequentialLeg);

/**
 * Builds the block. Returns null when there is nothing to carry, so a plain
 * strategy still produces a file byte-identical to the reference format.
 */
export const buildExtras = (config = {}) => {
  const mainLegs = mainLegsOf(config.legs);

  const defaultConfig = getDefaultConfig();
  const defaultLeg = getDefaultLeg();

  const strategy = pickChanged(config, defaultConfig, STRATEGY_FIELDS);
  const legs = mainLegs.map((leg) => pickChanged(leg, defaultLeg, LEG_FIELDS));

  // Sequential legs are not in the reference leg list at all, so they are
  // carried whole. The parent is recorded by POSITION: ids are regenerated on
  // import, so an id would point at nothing.
  const sequentialLegs = (config.legs || [])
    .filter((l) => l.isSequentialLeg)
    .map((leg) => {
      // id and parentLegId are dropped: both are regenerated on import, and a
      // stale id would point at a leg from another session.
      const { parentLegId } = leg;
      const rest = { ...leg };
      delete rest.id;
      delete rest.parentLegId;
      return { ...rest, parentIndex: Math.max(0, mainLegs.findIndex((m) => m.id === parentLegId)) };
    });

  // Lazy legs keyed exactly as IdleLegConfigs keys them, so the two line up.
  const idleLegs = {};
  (config.legs || []).filter((l) => l.isLazyLeg).forEach((leg) => {
    const extra = pickChanged(leg, defaultLeg, LEG_FIELDS);
    if (Object.keys(extra).length) idleLegs[String(leg.id)] = extra;
  });

  const hasLegExtras = legs.some((l) => Object.keys(l).length > 0);
  if (!Object.keys(strategy).length && !hasLegExtras && !sequentialLegs.length
      && !Object.keys(idleLegs).length) return null;

  return { version: EXTRAS_VERSION, strategy, legs, sequentialLegs, idleLegs };
};

/**
 * Lays the block back over a config parsed from the reference fields.
 * Unknown or newer versions are ignored rather than half-applied.
 */
export const applyExtras = (config, extras, { nextLegId, lazyByFileId } = {}) => {
  if (!extras || extras.version !== EXTRAS_VERSION) return config;

  Object.assign(config, extras.strategy || {});

  (extras.legs || []).forEach((extra, index) => {
    if (config.legs[index]) Object.assign(config.legs[index], extra);
  });

  Object.entries(extras.idleLegs || {}).forEach(([fileId, extra]) => {
    const leg = lazyByFileId?.get(String(fileId));
    if (leg) Object.assign(leg, extra);
  });

  // Each sequential leg goes back directly after its parent, which is where
  // the builder puts it and where its numbering comes from.
  (extras.sequentialLegs || []).slice().reverse().forEach((entry) => {
    const { parentIndex = 0, ...leg } = entry;
    const parent = config.legs[parentIndex];
    if (!parent) return;
    const at = config.legs.indexOf(parent);
    config.legs.splice(at + 1, 0, {
      ...leg,
      id: nextLegId(),
      isSequentialLeg: true,
      parentLegId: parent.id,
    });
  });

  return config;
};

/**
 * What a strategy carries that the file cannot hold — nothing, now that lazy
 * legs have a home (IdleLegConfigs) and everything else rides in this block.
 * Kept as the one place to answer that question if a future setting outgrows
 * both, rather than the answer being scattered across the export path.
 */
export const droppedByReferenceFormat = () => [];
