/**
 * ONE decoder for GET /api/get-strategy: {strategy, legs, unselected_legs} ->
 * the builder's config, lazy legs, sequential legs, strike criteria and all.
 *
 * Lifted verbatim out of App.jsx when a second caller appeared -- the portfolio
 * export needs the same decode, and its hand-rolled subset silently dropped
 * lazy and sequential legs. Partial copies of a mapping rot invisibly (see
 * CLAUDE.md on the two payload builders), so it lives here once.
 *
 * Deliberately unprettified: kept line-for-line from App so behaviour cannot
 * drift in the move.
 */

import logger from './logger';
import { oneOf, isOn, LEG_UNITS, TRAIL_UNITS, OVERALL_UNITS } from './decodeGuards';
// A sequential leg's default name. Current builds save "SEQ1"/"SEQ2"; older
// ones wrote "SEQ#1". Both must be recognised when a strategy is loaded back,
// otherwise the leg returns as an ordinary main leg.
const SEQ_DEFAULT_NAME = /^SEQ#?(\d+)$/i;

const isSequentialLegName = (name) => typeof name === 'string' && SEQ_DEFAULT_NAME.test(name.trim());

const parseSequentialLegNumber = (name) => {
  const match = typeof name === 'string' ? name.trim().match(SEQ_DEFAULT_NAME) : null;
  return match ? parseInt(match[1], 10) : undefined;
};

// Backend momentum enum -> the <option> value the Simple Momentum dropdowns use.
// These are NOT just lowercased: the backend says POINTS_UP / PERCENT_UP while the
// options are 'points' / 'percentage'. A <select> whose value matches no option
// silently renders the FIRST option, so an unmapped value makes the dropdown show
// "Points (Pts) up" no matter what was actually saved.
const MOMENTUM_MODE_FOR_UI = {
  points_up: 'points',
  points_down: 'points_down',
  percent_up: 'percentage',
  percent_down: 'percentage_down',
  underlying_points_up: 'underlying_points_up',
  underlying_points_down: 'underlying_points_down',
  underlying_percent_up: 'underlying_percentage_up',
  underlying_percent_down: 'underlying_percentage_down',

  /*
    SPELLINGS WE DO NOT SEND BUT MIGHT BE SENT. The eight above are exactly
    what this app writes, so a backend that stores and returns them verbatim
    needs nothing more. These cover a backend that normalises on its way out
    -- "PERCENTAGE_UP" for our "PERCENT_UP", or a bare "POINTS".

    Worth the few lines because the failure is invisible: an unrecognised
    value is not an error, it just draws the first option in the list, and
    the strategy then trades on whatever that happens to be.
  */
  percentage_up: 'percentage',
  percentage_down: 'percentage_down',
  underlying_percentage_up: 'underlying_percentage_up',
  underlying_percentage_down: 'underlying_percentage_down',
  points: 'points',
  percent: 'percentage',
  percentage: 'percentage',
  underlying_points: 'underlying_points_up',
  underlying_percent: 'underlying_percentage_up',
};

/** Exactly the <option> values of the Simple Momentum dropdowns. */
const MOMENTUM_UI_VALUES = new Set([
  'points', 'points_down', 'percentage', 'percentage_down',
  'underlying_points_up', 'underlying_points_down',
  'underlying_percentage_up', 'underlying_percentage_down',
]);

// Times come back from the backend as "HH:MM:SS" but TimeSegmentInput only
// accepts "HH:MM" — anything else silently falls back to its 09:15 default,
// which is how a saved Range Breakout time of 09:45 reappeared as 09:15.
const toHHMM = (time) => {
  if (!time) return null;
  const m = String(time).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
};

/**
 * Whatever the strategy was SAVED with -> the option the dropdown must show.
 *
 * GUARANTEES A REAL OPTION VALUE. It used to hand back any unknown string
 * lowercased, and the dropdown would then quietly draw its first entry --
 * so the screen claimed one thing while the saved strategy said another.
 * Anything unrecognised is logged and falls back to points, which is what
 * every other unset mode in this app falls back to.
 */
const momentumModeForUI = (backendType) => {
  const key = typeof backendType === 'string' ? backendType.trim().toLowerCase() : '';
  if (!key) return 'points';

  const mapped = MOMENTUM_MODE_FOR_UI[key] || key;
  if (MOMENTUM_UI_VALUES.has(mapped)) return mapped;

  logger.error(
    `[decode] momentum_type "${backendType}" is not a value this app offers — showing Points instead.`,
  );
  return 'points';
};

/**
 * Strike Criteria, as the dropdown spells it.
 *
 * The control offers 'based on points' (shown as "Based On Strike"),
 * 'based on atm percent' and 'based on premium range'. The backend stores
 * 'atm percentage' and 'premium range' for two of those, and older rows can
 * carry 'strike_type' or nothing at all.
 *
 * THIS IS NOT COSMETIC. Every branch here used to fall back to 'strike_type',
 * which matches no option -- so the control drew its first entry while the
 * config still said 'strike_type'. On the next save buildSaveStrategyPayload
 * only fills atm_strike when the criteria reads exactly 'based on points', so
 * that leg went out with atm_strike: null and an ITM/OTM strike became ATM.
 */
const STRIKE_CRITERIA_FOR_UI = {
  'atm percentage': 'based on atm percent',
  'premium range': 'based on premium range',
  'based on atm percent': 'based on atm percent',
  'based on premium range': 'based on premium range',
  'based on points': 'based on points',
  'closest premium': 'closest premium',
  'based_on_points': 'based on points',
  'based_on_atm_percent': 'based on atm percent',
  'based_on_premium_range': 'based on premium range',
  'closest_premium': 'closest premium',
  // What the payload builder writes when a leg reached it with no criteria.
  'strike_type': 'based on points',
};

/*
  ALL FOUR options the Strike Criteria dropdown offers. "closest premium"
  ("Based On Closest Premium") was left out when this was written, so every
  leg saved with it was reported as unknown and redrawn as "Based On Strike" --
  the guard doing the exact damage it exists to prevent, and worse than the
  silence before it, because the criteria then decides whether the next save
  carries premium_value or atm_strike.

  Taken from the <option> values in LegCard and StrategyBuilder. If a fifth is
  ever added there, it belongs here in the same commit.
*/
const STRIKE_CRITERIA_UI_VALUES = new Set([
  'based on points', 'based on atm percent', 'based on premium range', 'closest premium',
]);

const strikeCriteriaForUI = (backendValue) => {
  const key = typeof backendValue === 'string' ? backendValue.trim().toLowerCase() : '';
  if (!key) return 'based on points';

  const mapped = STRIKE_CRITERIA_FOR_UI[key] || key;
  if (STRIKE_CRITERIA_UI_VALUES.has(mapped)) return mapped;

  logger.error(
    `[decode] strike_criteria "${backendValue}" is not a value this app offers `
    + '— showing "Based On Strike" instead.',
  );
  return 'based on points';
};

/**
 * A backend number for a field the UI shows as text. Unset values come back as
 * 0 from the backend, and a disabled control must show an empty box, not 0.
 */
const blankIfUnset = (value) => (value === null || value === undefined || value === 0 ? '' : String(value));

export const decodeBackendStrategy = (data, strategyName) => {
  const { strategy, legs, unselected_legs } = data;
  
  const formatTypeForUI = (backendType) => {
    if (!backendType) return 'points';
    const upper = String(backendType).toUpperCase();
    
    if (upper === 'PERCENT') return 'percentage';
    if (upper === 'UNDERLYING_PERCENT') return 'underlying_percentage';
    if (upper === 'POINTS') return 'points';
    if (upper === 'UNDERLYING_POINTS') return 'underlying_points';
    if (upper === 'MTM') return 'mtm';
    
    return String(backendType).toLowerCase();
  };
  

  
  // get-strategy returns no leg_id, so every leg here needs a generated one.
  // A single sequence is used for ALL of them: main legs, nested lazy legs
  // and unselected lazy legs previously used separate Date.now()+offset
  // schemes that overlapped within the same millisecond. A main leg and a
  // lazy leg then shared an id, which produced duplicate React keys and
  // made the lazy-leg picker resolve `lazy_leg_<id>` to the MAIN leg —
  // whose blank name rendered as "lazyundefined".
  let generatedLegIdSeq = 0;
  const nextGeneratedLegId = () => Date.now() * 1000 + (++generatedLegIdSeq);

  // Kept so nested lazy-leg extraction can pair each transformed leg with
  // the right source object. Indexing into `legs` directly goes wrong the
  // moment this filter drops anything, attaching a lazy leg to the wrong
  // parent (or to none at all).
  const selectedOriginalLegs = (legs || []).filter(leg => leg.is_selected !== false);

  const transformedLegs = selectedOriginalLegs.map((leg) => {

    const transformed = {
      ...leg,

      // Frontend uses 'id' to locate a leg for in-place edits
      // (findIndex by id) and as its React key, so it MUST be present and
      // unique. If the backend omits leg_id every leg would share
      // id === undefined, which makes every edit land on the first leg and
      // breaks reconciliation — hence the unique fallback.
      id: leg.leg_id ?? nextGeneratedLegId(),
      isLazyLeg: leg.is_lazy_leg || false, // Mark if this is a lazy leg
      isSequentialLeg: isSequentialLegName(leg.leg_name),
      sequentialLegNumber: parseSequentialLegNumber(leg.leg_name),
      parentLegIndex: leg.parent_leg_index !== undefined ? leg.parent_leg_index : undefined,
      customName: leg.leg_name || '', // Lazy leg name or Sequential leg name
      is_selected: leg.is_selected, // Keep backend flag for reference
      
      lots: String(leg.lot_size || 1),  // Backend: lot_size (number) → Frontend: lots (string)
      position: leg.position_type?.toLowerCase() || 'buy',  // Backend: position_type → Frontend: position
      option_type: leg.option_type?.toLowerCase() || 'call',  // Case conversion
      expiry: leg.expiry_type || 'weekly',
      
      stop_loss_enabled: leg.is_stoploss || false,
      stop_loss_mode: oneOf(formatTypeForUI(leg.stoploss_type), LEG_UNITS, 'points', 'stop loss unit'),
      stop_loss_value: leg.stoploss_value || '',
      
      trail_enabled: leg.is_trail_sl || false,
      trail_mode: oneOf(formatTypeForUI(leg.trail_sl_type), TRAIL_UNITS, 'points', 'trail SL unit'),
      trail_value: leg.instrument_moves || '',  // Fixed: instrument_moves (plural)
      trail_lock_value: leg.stoploss_moves || '',  // Fixed: stoploss_moves (plural)
      
      target_enabled: leg.is_target || false,
      target_mode: oneOf(formatTypeForUI(leg.target_type), LEG_UNITS, 'points', 'target unit'),
      target_value: leg.target_value || '',
      
      reentry_sl_enabled: leg.is_reentry_sl || false,
      reentry_sl_mode: leg.reentry_sl_type?.toUpperCase() === 'LAZY_LEG' 
        ? 'LAZY_LEG' 
        : leg.reentry_sl_type?.toLowerCase() || 're_asap',
      reentry_sl_count: leg.reentry_sl_value || '',
      reentry_sl_lazy_leg_id: leg.reentry_sl_type?.toUpperCase() === 'LAZY_LEG' ? leg.reentry_sl_value : null, // Store the leg_id reference
      
      reentry_tgt_enabled: leg.is_reentry_target || false,
      reentry_tgt_mode: leg.reentry_target_type?.toUpperCase() === 'LAZY_LEG' 
        ? 'LAZY_LEG' 
        : leg.reentry_target_type?.toLowerCase() || 're_asap',
      reentry_tgt_count: leg.reentry_target_value || '',
      reentry_tgt_lazy_leg_id: leg.reentry_target_type?.toUpperCase() === 'LAZY_LEG' ? leg.reentry_target_value : null, // Store the leg_id reference
      
      momentum_enabled: leg.is_simple_momentum || false,
      momentum_mode: momentumModeForUI(leg.momentum_type),
      momentum_value: leg.momentum_value || '',
      
      ...(!leg.is_lazy_leg && {
        range_enabled: leg.is_range_breakout || false,
        range_instrument: leg.range_breakout_type?.toLowerCase() || 'instrument',
        range_time: toHHMM(leg.range_end_time),
        // Sent by buildSaveStrategyPayload as "today"/"tomorrow" (BTST) or a
        // DTE count as a string (positional); it was never read back, so a
        // reopened strategy showed the default end of the window.
        range_end_day: leg.range_end_day ?? undefined,
        range_direction: leg.range_on?.toLowerCase() || 'high',
      }),
      
      strike_criteria: strikeCriteriaForUI(leg.strike_criteria),
      atm_strike: leg.atm_strike || 'ATM',  // Keep backend format "ITM-17"
      strike_value: leg.premium_value || '',
      closest_premium_value: leg.premium_value || '',  // For "Based On Closest Premium"
      lower_range: leg.lower_range || '',  // For "Based On premium range"
      upper_range: leg.upper_range || '',  // For "Based On premium range"
      atm_percent_direction: leg.strike_sign || '+',
      atm_percent_value: leg.multiplier_percentage || '',
    };
    
    
    return transformed;
  });

  // Build lazy leg ID map: leg_id → frontend id
  const lazyLegIdMap = {};
  transformedLegs.forEach(leg => {
    if (leg.isLazyLeg && leg.leg_id) {
      lazyLegIdMap[leg.leg_id] = leg.id;
    }
  });

  // Convert LAZY_LEG references to lazy_leg_${id} format
  transformedLegs.forEach(leg => {
    if (leg.reentry_sl_mode === 'LAZY_LEG' && leg.reentry_sl_lazy_leg_id) {
      const frontendLazyLegId = lazyLegIdMap[leg.reentry_sl_lazy_leg_id];
      if (frontendLazyLegId) {
        leg.reentry_sl_mode = `lazy_leg_${frontendLazyLegId}`;
      }
    }
    if (leg.reentry_tgt_mode === 'LAZY_LEG' && leg.reentry_tgt_lazy_leg_id) {
      const frontendLazyLegId = lazyLegIdMap[leg.reentry_tgt_lazy_leg_id];
      if (frontendLazyLegId) {
        leg.reentry_tgt_mode = `lazy_leg_${frontendLazyLegId}`;
      }
    }
  });

  
  const extractedLazyLegs = [];
  // identity -> frontend id, for lazy legs already pulled out of the tree.
  const extractedLazyLegIdByIdentity = new Map();

  const extractNestedLazyLeg = (parentLeg, originalParentLeg) => {
    if (originalParentLeg && originalParentLeg.lazy_leg) {
      const lazyLeg = originalParentLeg.lazy_leg;

      const pointParentAt = (id) => {
        if (parentLeg.reentry_sl_mode === 'LAZY_LEG') {
          parentLeg.reentry_sl_mode = `lazy_leg_${id}`;
        }
        if (parentLeg.reentry_tgt_mode === 'LAZY_LEG') {
          parentLeg.reentry_tgt_mode = `lazy_leg_${id}`;
        }
      };

      // leg_id alone is not a reliable identity for a nested lazy leg:
      // some responses omit it (so every leg keys on `undefined`) and some
      // repeat it. Either way the old Set swallowed every lazy leg after
      // the first, leaving later parents with an unresolved 'LAZY_LEG'
      // that renders as "Select". Pairing it with the leg name keeps two
      // genuinely different lazy legs apart even when their ids collide.
      // An EMPTY name is as absent as a missing one — `?? ` only catches
      // null/undefined, so several nameless lazy legs all hashed to the same
      // identity and every one after the first was swallowed. Falling back to
      // the parent keeps them apart.
      const lazyName = lazyLeg.leg_name || null;
      const identity = `${lazyLeg.leg_id ?? 'noid'}::${lazyName ?? `of_${parentLeg.id}`}`;

      // The same lazy leg reached twice — reuse it instead of duplicating.
      const alreadyExtractedId = extractedLazyLegIdByIdentity.get(identity);
      if (alreadyExtractedId !== undefined) {
        pointParentAt(alreadyExtractedId);
        return;
      }

      // The frontend id must be unique AND numeric — it is written as
      // `lazy_leg_${id}` and read back with /lazy_leg_(\d+)/.
      const idUnusable =
        lazyLeg.leg_id === null ||
        lazyLeg.leg_id === undefined ||
        transformedLegs.some((l) => l.id === lazyLeg.leg_id) ||
        extractedLazyLegs.some((l) => l.id === lazyLeg.leg_id);
      const lazyLegFrontendId = idUnusable
        ? nextGeneratedLegId()
        : lazyLeg.leg_id;

      const transformedLazyLeg = {
        ...lazyLeg,
        id: lazyLegFrontendId, // Frontend uses 'id'
        isLazyLeg: true,
        customName: lazyLeg.leg_name || '',
        is_selected: true, // Nested lazy legs are always selected
        
        lots: String(lazyLeg.lot_size || 1),
        position: lazyLeg.position_type?.toLowerCase() || 'buy',
        option_type: lazyLeg.option_type?.toLowerCase() || 'call',
        expiry: lazyLeg.expiry_type || 'weekly',
        
        stop_loss_enabled: lazyLeg.is_stoploss || false,
        stop_loss_mode: oneOf(formatTypeForUI(lazyLeg.stoploss_type), LEG_UNITS, 'points', 'stop loss unit'),
        stop_loss_value: lazyLeg.stoploss_value || '',
        
        trail_enabled: lazyLeg.is_trail_sl || false,
        trail_mode: oneOf(formatTypeForUI(lazyLeg.trail_sl_type), TRAIL_UNITS, 'points', 'trail SL unit'),
        trail_value: lazyLeg.instrument_moves || '',
        trail_lock_value: lazyLeg.stoploss_moves || '',
        
        target_enabled: lazyLeg.is_target || false,
        target_mode: oneOf(formatTypeForUI(lazyLeg.target_type), LEG_UNITS, 'points', 'target unit'),
        target_value: lazyLeg.target_value || '',
        
        reentry_sl_enabled: lazyLeg.is_reentry_sl || false,
        reentry_sl_mode: lazyLeg.reentry_sl_type?.toUpperCase() === 'LAZY_LEG' 
          ? 'LAZY_LEG'  // Will be converted to lazy_leg_${id} later if nested
          : lazyLeg.reentry_sl_type?.toLowerCase() || 're_asap',
        reentry_sl_count: lazyLeg.reentry_sl_value || '',
        
        reentry_tgt_enabled: lazyLeg.is_reentry_target || false,
        reentry_tgt_mode: lazyLeg.reentry_target_type?.toUpperCase() === 'LAZY_LEG'
          ? 'LAZY_LEG'  // Will be converted to lazy_leg_${id} later if nested
          : lazyLeg.reentry_target_type?.toLowerCase() || 're_asap',
        reentry_tgt_count: lazyLeg.reentry_target_value || '',
        
        momentum_enabled: lazyLeg.is_simple_momentum || false,
        momentum_mode: momentumModeForUI(lazyLeg.momentum_type),
        momentum_value: lazyLeg.momentum_value || '',
        
        strike_criteria: strikeCriteriaForUI(lazyLeg.strike_criteria),
        atm_strike: lazyLeg.atm_strike || 'ATM',
        strike_value: lazyLeg.premium_value || '',
        closest_premium_value: lazyLeg.premium_value || '',  // For "Based On Closest Premium"
        lower_range: lazyLeg.lower_range || '',  // For "Based On premium range"
        upper_range: lazyLeg.upper_range || '',  // For "Based On premium range"
        atm_percent_direction: lazyLeg.strike_sign || '+',
        atm_percent_value: lazyLeg.multiplier_percentage || '',
      };
      
      extractedLazyLegs.push(transformedLazyLeg);
      extractedLazyLegIdByIdentity.set(identity, transformedLazyLeg.id);

      pointParentAt(transformedLazyLeg.id);

      extractNestedLazyLeg(transformedLazyLeg, lazyLeg);
    }
  };
  
  selectedOriginalLegs.forEach((originalLeg, index) => {
    if (transformedLegs[index]) {
      extractNestedLazyLeg(transformedLegs[index], originalLeg);
    }
  });
  
  if (extractedLazyLegs.length > 0) {
    transformedLegs.push(...extractedLazyLegs);
  }
  
  transformedLegs.forEach((leg, legIndex) => {
    if (leg.reentry_sl_enabled && leg.reentry_sl_mode === 'LAZY_LEG') {
      const linkedLegId = leg.reentry_sl_count || selectedOriginalLegs[legIndex]?.reentry_sl_value;
      if (linkedLegId) {
        leg.reentry_sl_mode = `lazy_leg_${linkedLegId}`;
      }
    }

    if (leg.reentry_tgt_enabled && leg.reentry_tgt_mode === 'LAZY_LEG') {
      const linkedLegId = leg.reentry_tgt_count || selectedOriginalLegs[legIndex]?.reentry_target_value;
      if (linkedLegId) {
        leg.reentry_tgt_mode = `lazy_leg_${linkedLegId}`;
      }
    }
  });
  
  const extractedSequentialLegs = [];
  
  const extractSequentialLeg = (parentLeg, originalParentLeg, parentIndex) => {
    if (originalParentLeg && originalParentLeg.sequential_leg) {
      const seqLeg = originalParentLeg.sequential_leg;
      
      
      // Numbers are blanked when the feature is OFF, exactly as the main-leg
      // path above does (`value || ''`). Guarding only on null/undefined left a
      // disabled Target showing 0 here while the same leg as a MAIN leg showed
      // an empty box — the backend writes 0 for every unset number.
      const transformedSeqLeg = {
        ...seqLeg,
        // Integer, not Date.now()+Math.random(): a float id stringifies with
        // a decimal point, which /lazy_leg_(\d+)/ truncates to a value that
        // then matches no leg.
        id: seqLeg.leg_id || nextGeneratedLegId(),
        isSequentialLeg: true,
        customName: seqLeg.leg_name || '',
        // Names are saved as SEQ1/SEQ2 today and SEQ#1/SEQ#2 by older builds.
        sequentialLegNumber: parseSequentialLegNumber(seqLeg.leg_name),
        // Stable link to the parent main leg. The builder pairs on
        // parentLegId to place each sequential leg directly after its main
        // leg; parentLegIndex is kept only for older saved configs.
        parentLegId: parentLeg.id,
        parentLegIndex: parentIndex,
        
        lots: String(seqLeg.lot_size || 1),
        position: seqLeg.position_type?.toLowerCase() || 'buy',
        option_type: seqLeg.option_type?.toLowerCase() || 'call',
        expiry: seqLeg.expiry_type || 'weekly',
        
        stop_loss_enabled: seqLeg.is_stoploss || false,
        stop_loss_mode: oneOf(formatTypeForUI(seqLeg.stoploss_type), LEG_UNITS, 'points', 'stop loss unit'),
        stop_loss_value: blankIfUnset(seqLeg.stoploss_value),
        
        trail_enabled: seqLeg.is_trail_sl || false,
        trail_mode: oneOf(formatTypeForUI(seqLeg.trail_sl_type), TRAIL_UNITS, 'points', 'trail SL unit'),
        trail_value: blankIfUnset(seqLeg.instrument_moves),
        trail_lock_value: blankIfUnset(seqLeg.stoploss_moves),
        
        target_enabled: seqLeg.is_target || false,
        target_mode: oneOf(formatTypeForUI(seqLeg.target_type), LEG_UNITS, 'points', 'target unit'),
        target_value: blankIfUnset(seqLeg.target_value),
        
        reentry_sl_enabled: seqLeg.is_reentry_sl || false,
        reentry_sl_mode: seqLeg.reentry_sl_type?.toLowerCase() || 're_asap',
        reentry_sl_count: blankIfUnset(seqLeg.reentry_sl_value),
        
        reentry_tgt_enabled: seqLeg.is_reentry_target || false,
        reentry_tgt_mode: seqLeg.reentry_target_type?.toLowerCase() || 're_asap',
        reentry_tgt_count: blankIfUnset(seqLeg.reentry_target_value),
        
        momentum_enabled: seqLeg.is_simple_momentum || false,
        momentum_mode: momentumModeForUI(seqLeg.momentum_type),
        momentum_value: blankIfUnset(seqLeg.momentum_value),
        
        range_enabled: seqLeg.is_range_breakout || false,
        range_instrument: seqLeg.range_breakout_type?.toLowerCase() || 'instrument',
        range_time: toHHMM(seqLeg.range_end_time),
        // Sent by buildSaveStrategyPayload as "today"/"tomorrow" (BTST) or a
        // DTE count as a string (positional); it was never read back, so a
        // reopened strategy showed the default end of the window.
        range_end_day: seqLeg.range_end_day ?? undefined,
        range_direction: seqLeg.range_on?.toLowerCase() || 'high',
        
        strike_criteria: strikeCriteriaForUI(seqLeg.strike_criteria),
        atm_strike: seqLeg.atm_strike || 'ATM',
        strike_value: seqLeg.premium_value !== null && seqLeg.premium_value !== undefined 
          ? String(seqLeg.premium_value) 
          : '',
        closest_premium_value: seqLeg.premium_value !== null && seqLeg.premium_value !== undefined 
          ? String(seqLeg.premium_value) 
          : '',  // For "Based On Closest Premium"
        lower_range: seqLeg.lower_range !== null && seqLeg.lower_range !== undefined 
          ? String(seqLeg.lower_range) 
          : '',  // For "Based On premium range"
        upper_range: seqLeg.upper_range !== null && seqLeg.upper_range !== undefined 
          ? String(seqLeg.upper_range) 
          : '',  // For "Based On premium range"
        atm_percent_direction: seqLeg.strike_sign || '+',
        atm_percent_value: blankIfUnset(seqLeg.multiplier_percentage),
      };
      
      extractedSequentialLegs.push(transformedSeqLeg);
    }
  };
  
  (legs || []).forEach((originalLeg, index) => {
    if (transformedLegs[index] && !transformedLegs[index].isLazyLeg) {
      extractSequentialLeg(transformedLegs[index], originalLeg, index);
    }
  });
  
  if (extractedSequentialLegs.length > 0) {
    transformedLegs.push(...extractedSequentialLegs);
  }

  // Sequential legs that arrived as plain entries in `legs` (rather than
  // nested under their parent as `sequential_leg`) have no parentLegId, so
  // the builder can't tell which main leg they belong to and renders them
  // all in a clump at the end. Adopt each one here: by its SEQn number when
  // that points at a real main leg, otherwise in order into the first main
  // leg still without a child. Legs already linked above are left alone.
  {
    const mainLegs = transformedLegs.filter(l => !l.isLazyLeg && !l.isSequentialLeg);
    const taken = new Set(
      transformedLegs.filter(l => l.isSequentialLeg && l.parentLegId).map(l => l.parentLegId)
    );

    transformedLegs
      .filter(l => l.isSequentialLeg && !l.parentLegId)
      .forEach(seqLeg => {
        const byNumber = mainLegs[(seqLeg.sequentialLegNumber ?? 0) - 1];
        const parent = byNumber && !taken.has(byNumber.id)
          ? byNumber
          : mainLegs.find(m => !taken.has(m.id));

        if (parent) {
          seqLeg.parentLegId = parent.id;
          seqLeg.sequentialLegNumber = mainLegs.findIndex(m => m.id === parent.id) + 1;
          taken.add(parent.id);
        }
      });
  }
  
  
  const unselectedLazyLegs = (unselected_legs || []).map((leg) => {

    const transformed = {
      ...leg,

      // unselected_legs are serialised WITHOUT a leg_id, so this was
      // always undefined. Picking such a lazy leg then wrote the reference
      // "lazy_leg_undefined", which /lazy_leg_(\d+)/ cannot match — on the
      // next save the link resolved to nothing, reentry_sl_value went to 0
      // and the lazy leg was written back out as unselected. Must be
      // numeric so the reference round-trips.
      id: leg.leg_id ?? nextGeneratedLegId(),
      isLazyLeg: true, // All unselected legs are lazy legs
      customName: leg.leg_name || '',
      is_selected: false, // All unselected legs have is_selected = false
      
      lots: String(leg.lot_size || 1),
      position: leg.position_type?.toLowerCase() || 'buy',
      option_type: leg.option_type?.toLowerCase() || 'call',
      expiry: leg.expiry_type || 'weekly',
      
      /*
        formatTypeForUI, NOT a bare toLowerCase. The backend says PERCENT and
        the dropdown's option value is "percentage", so lowercasing produced
        "percent" -- a value matching no option, which a <select> renders as
        its FIRST option. A percent stop loss, trail or target on one of these
        legs therefore reopened as POINTS, silently. The three branches above
        already go through formatTypeForUI; this one was missed.
      */
      stop_loss_enabled: leg.is_stoploss || false,
      stop_loss_mode: oneOf(formatTypeForUI(leg.stoploss_type), LEG_UNITS, 'points', 'stop loss unit'),
      stop_loss_value: leg.stoploss_value || '',

      trail_enabled: leg.is_trail_sl || false,
      trail_mode: oneOf(formatTypeForUI(leg.trail_sl_type), TRAIL_UNITS, 'points', 'trail SL unit'),
      trail_value: leg.instrument_moves || '',
      trail_lock_value: leg.stoploss_moves || '',

      target_enabled: leg.is_target || false,
      target_mode: oneOf(formatTypeForUI(leg.target_type), LEG_UNITS, 'points', 'target unit'),
      target_value: leg.target_value || '',
      
      reentry_sl_enabled: leg.is_reentry_sl || false,
      reentry_sl_mode: leg.reentry_sl_type?.toUpperCase() === 'LAZY_LEG' 
        ? 'LAZY_LEG' 
        : leg.reentry_sl_type?.toLowerCase() || 're_asap',
      reentry_sl_count: leg.reentry_sl_value || '',
      
      reentry_tgt_enabled: leg.is_reentry_target || false,
      reentry_tgt_mode: leg.reentry_target_type?.toUpperCase() === 'LAZY_LEG' 
        ? 'LAZY_LEG' 
        : leg.reentry_target_type?.toLowerCase() || 're_asap',
      reentry_tgt_count: leg.reentry_target_value || '',
      
      momentum_enabled: leg.is_simple_momentum || false,
      momentum_mode: momentumModeForUI(leg.momentum_type),
      momentum_value: leg.momentum_value || '',
      
      ...(!leg.is_lazy_leg && {
        range_enabled: leg.is_range_breakout || false,
        range_instrument: leg.range_breakout_type?.toLowerCase() || 'instrument',
        range_time: toHHMM(leg.range_end_time),
        // Sent by buildSaveStrategyPayload as "today"/"tomorrow" (BTST) or a
        // DTE count as a string (positional); it was never read back, so a
        // reopened strategy showed the default end of the window.
        range_end_day: leg.range_end_day ?? undefined,
        range_direction: leg.range_on?.toLowerCase() || 'high',
      }),
      
      strike_criteria: strikeCriteriaForUI(leg.strike_criteria),
      atm_strike: leg.atm_strike || 'ATM',
      strike_value: leg.premium_value || '',
      atm_percent_direction: leg.strike_sign || '+',
      atm_percent_value: leg.multiplier_percentage || '',
    };
    
    return transformed;
  });
  
  
  
  const selectedLazyLegs = transformedLegs.filter(leg => leg.isLazyLeg && leg.is_selected);
  
  
  
  
  const allLazyLegNames = new Set();
  const uniqueSelectedLazyLegs = [];
  const seenSelectedNames = new Set();
  
  selectedLazyLegs.forEach(leg => {
    allLazyLegNames.add(leg.customName);
    
    if (!seenSelectedNames.has(leg.customName)) {
      uniqueSelectedLazyLegs.push(leg);
      seenSelectedNames.add(leg.customName);
    }
  });
  
  
  const filteredUnselectedLazyLegs = unselectedLazyLegs.filter(leg => {
    const isDuplicate = allLazyLegNames.has(leg.customName);
    if (isDuplicate) {
      return false;
    }
    return true;
  });
  
  
  transformedLegs.push(...filteredUnselectedLazyLegs);

  // A lazy leg can itself reference another lazy leg (lazy3 -> lazy1). The
  // save side nests that child under the parent in unselected_legs, but the
  // extraction above only ran for MAIN legs — so the child was never pulled
  // out and the parent's reference stayed the literal string 'LAZY_LEG',
  // leaving its picker empty. Run the same extraction over the unselected
  // legs. Anything already extracted is matched by identity inside
  // extractNestedLazyLeg and reused rather than duplicated.
  const extractedCountBeforeUnselected = extractedLazyLegs.length;
  unselectedLazyLegs.forEach((transformedUnselectedLeg, index) => {
    const originalUnselectedLeg = (unselected_legs || [])[index];
    if (originalUnselectedLeg) {
      extractNestedLazyLeg(transformedUnselectedLeg, originalUnselectedLeg);
    }
  });
  const lazyLegsFromUnselected = extractedLazyLegs.slice(extractedCountBeforeUnselected);
  if (lazyLegsFromUnselected.length > 0) {
    transformedLegs.push(...lazyLegsFromUnselected);
  }


  
  for (let i = 0; i < transformedLegs.length; i++) {
    const currentLeg = transformedLegs[i];
    
    if (currentLeg.isLazyLeg) continue;
    
    // Keyed off the current MODE, not the original backend type: the type
    // stays 'LAZY_LEG' forever, so this position-based fallback re-fired
    // AFTER extraction had already resolved the reference by identity and
    // rewired every main leg to whichever lazy leg sat next in the array —
    // that is what made both main legs show lazy1. The mode is the live
    // truth: once it reads lazy_leg_<id>, nothing here may touch it.
    const hasLazyLegInReentrySL = currentLeg.reentry_sl_mode === 'LAZY_LEG';
    const hasLazyLegInReentryTgt = currentLeg.reentry_tgt_mode === 'LAZY_LEG';
    
    if (!hasLazyLegInReentrySL && !hasLazyLegInReentryTgt) {
      continue;
    }
    
    const nextLeg = transformedLegs[i + 1];
    if (nextLeg && nextLeg.isLazyLeg && nextLeg.is_selected) {
      
      if (hasLazyLegInReentrySL) {
        currentLeg.reentry_sl_mode = `lazy_leg_${nextLeg.id}`;
      }
      
      if (hasLazyLegInReentryTgt) {
        currentLeg.reentry_tgt_mode = `lazy_leg_${nextLeg.id}`;
      }
    }
  }
  
  // Build lazyLegNameToId map ONCE for efficiency (avoid O(n²))
  const lazyLegNameToId = {};
  transformedLegs.forEach(leg => {
    if (leg.isLazyLeg && leg.customName && !lazyLegNameToId[leg.customName]) {
      lazyLegNameToId[leg.customName] = leg.id;
    }
  });
  
  // Process lazy leg re-entry references efficiently (reuse map)
  transformedLegs.forEach((leg, index) => {
    if (!leg.isLazyLeg) return;
    
    // Same rule as the main-leg loop above: act only while the mode is the
    // unresolved sentinel, never on top of an extraction-resolved id.
    const hasNestedLazyLegInReentrySL = leg.reentry_sl_mode === 'LAZY_LEG';
    const hasNestedLazyLegInReentryTgt = leg.reentry_tgt_mode === 'LAZY_LEG';
    
    if (!hasNestedLazyLegInReentrySL && !hasNestedLazyLegInReentryTgt) {
      return;
    }
    
    
    const hasNextLazyLeg = hasNestedLazyLegInReentrySL && (leg.reentry_sl_count > 0);
    
    if (hasNextLazyLeg) {
      const nextLeg = transformedLegs[index + 1];
      if (nextLeg && nextLeg.isLazyLeg && nextLeg.customName) {
        const targetLegId = lazyLegNameToId[nextLeg.customName];
        if (targetLegId) {
          leg.reentry_sl_mode = `lazy_leg_${targetLegId}`;
        }
      } else {
        
        const backendLegIndex = legs.findIndex(l => l.leg_id === leg.leg_id);
        
        if (backendLegIndex !== -1 && backendLegIndex + 1 < legs.length) {
          const backendNextLeg = legs[backendLegIndex + 1];
          
          if (backendNextLeg.is_lazy_leg && backendNextLeg.leg_name) {
            const targetLegId = lazyLegNameToId[backendNextLeg.leg_name];
            
            if (targetLegId) {
              leg.reentry_sl_mode = `lazy_leg_${targetLegId}`;
            }
          }
        }
      }
    } else if (hasNestedLazyLegInReentrySL && (leg.reentry_sl_count === 0 || leg.reentry_sl_count === '' || leg.reentry_sl_count === '0')) {
      // Reuse existing map instead of rebuilding
      const allLazyLegNames = Object.keys(lazyLegNameToId);
      const otherLazyLegName = allLazyLegNames.find(name => name !== leg.customName);
      
      if (otherLazyLegName && lazyLegNameToId[otherLazyLegName]) {
        leg.reentry_sl_mode = `lazy_leg_${lazyLegNameToId[otherLazyLegName]}`;
      }
    }
    
    const hasNextLazyLegTgt = hasNestedLazyLegInReentryTgt && (leg.reentry_tgt_count > 0);
    if (hasNextLazyLegTgt) {
      const nextLeg = transformedLegs[index + 1];
      if (nextLeg && nextLeg.isLazyLeg) {
        leg.reentry_tgt_mode = `lazy_leg_${nextLeg.id}`;
      }
    } else if (hasNestedLazyLegInReentryTgt && leg.reentry_tgt_count === 0) {
      // Reuse existing map instead of rebuilding
      // Reuse existing map instead of rebuilding
      const allLazyLegNames = Object.keys(lazyLegNameToId);
      const otherLazyLegName = allLazyLegNames.find(name => name !== leg.customName);
      
      if (otherLazyLegName && lazyLegNameToId[otherLazyLegName]) {
        leg.reentry_tgt_mode = `lazy_leg_${lazyLegNameToId[otherLazyLegName]}`;
      }
    }
  });
  
  
  const linkedMainLegs = transformedLegs.filter(leg => !leg.isLazyLeg);
  
  const linkedSelectedLazyLegs = transformedLegs.filter(leg => leg.isLazyLeg && leg.is_selected);
  
  const seenNamesAfterLinking = new Set();
  const deduplicatedLinkedSelectedLazyLegs = linkedSelectedLazyLegs.filter(leg => {
    if (!seenNamesAfterLinking.has(leg.customName)) {
      seenNamesAfterLinking.add(leg.customName);
      return true;
    }
    return false;
  });
  
  const linkedUnselectedLazyLegs = transformedLegs.filter(leg => leg.isLazyLeg && !leg.is_selected);
  const filteredLinkedUnselectedLazyLegs = linkedUnselectedLazyLegs.filter(leg => {
    return !seenNamesAfterLinking.has(leg.customName);
  });
  
  const finalLegs = [
    ...linkedMainLegs,                           // Main legs (with linked lazy leg references)
    ...deduplicatedLinkedSelectedLazyLegs,       // Selected lazy legs (deduplicated, with nested linking)
    ...filteredLinkedUnselectedLazyLegs          // Unselected lazy legs (filtered)
  ];
  
  
  finalLegs.forEach(leg => {
    if (!leg.isSequentialLeg && !leg.isLazyLeg) {
      const reentryInfo = [];
      if (leg.reentry_sl_mode) reentryInfo.push(`SL→${leg.reentry_sl_mode}`);
      if (leg.reentry_tgt_mode) reentryInfo.push(`TGT→${leg.reentry_tgt_mode}`);
    } else {
      const nestedInfo = [];
      if (leg.reentry_sl_mode) nestedInfo.push(`SL→${leg.reentry_sl_mode}`);
      if (leg.reentry_tgt_mode) nestedInfo.push(`TGT→${leg.reentry_tgt_mode}`);
    }
  });

  const convertBackendStrikeToUI = (backendStrike) => {
    if (!backendStrike || backendStrike === 'ATM' || backendStrike === '0') return 'atm';
    
    const strike = String(backendStrike).trim();
    
    if (strike.toUpperCase().startsWith('ITM')) {
      const num = strike.replace(/ITM[+-]?/i, '');
      return `itm_${num}`;
    }
    
    if (strike.toUpperCase().startsWith('OTM')) {
      const num = strike.replace(/OTM[+-]?/i, '');
      return `otm_${num}`;
    }
    
    const numOnly = strike.replace(/[+-]/g, '');
    if (!isNaN(numOnly) && numOnly !== '0') {
      if (strike.includes('-')) {
        return `itm_${numOnly}`;
      } else if (strike.includes('+')) {
        return `otm_${numOnly}`;
      }
    }
    
    return 'atm';
  };

  // A 'lazy_leg_<id>' that points at no leg in this list is a dangling
  // reference. It happens when the record says LAZY_LEG but carries no nested
  // lazy leg: the fallback above then builds the pointer out of the BACKEND's
  // id, which is not one of the ids minted here. Exporting such a config wrote
  // a NextLegRef into a file whose IdleLegConfigs was empty, and importing that
  // file failed. A re-entry that cannot name its lazy leg is a plain re-entry.
  const lazyLegIds = new Set(finalLegs.filter(l => l.isLazyLeg).map(l => String(l.id)));
  finalLegs.forEach((leg) => {
    ['reentry_sl_mode', 'reentry_tgt_mode'].forEach((field) => {
      const value = leg[field];
      if (typeof value !== 'string' || !value.startsWith('lazy_leg_')) return;
      if (lazyLegIds.has(value.slice('lazy_leg_'.length))) return;
      leg[field] = 're_asap';
    });
  });

  const finalLegsWithStrike = finalLegs.map(leg => {
    const convertedStrikeType = convertBackendStrikeToUI(leg.atm_strike);
    return {
      ...leg,
      strike_type: convertedStrikeType
    };
  });


  const loadedConfig = {
    symbol: strategy.symbol || 'sensex',
    start_date: strategy.start_date || '',
    end_date: strategy.end_date || '',
    start_month: strategy.start_month || '',
    start_year: strategy.start_year || '',
    end_month: strategy.end_month || '',
    end_year: strategy.end_year || '',
    // config.dte_filter now backs the Index dropdown (Data Selection) and
    // is sent as `symbol` — the strategy's own dte_filter is always null.
    // Restoring from strategy.dte_filter yielded '0', which matches no
    // Index option, so the field looked like SENSEX but saved as "0".
    // Rows written while that bug was live still hold '0' (or legacy
    // '1'/'combine_dte'), so anything that isn't a real index name is
    // discarded rather than fed back into the dropdown.
    dte_filter: (() => {
      const sym = strategy.symbol;
      if (!sym || /^\d+$/.test(String(sym)) || sym === 'combine_dte') return 'sensex';
      return String(sym).toLowerCase();
    })(),
    instrument_index: strategy.instrument_index || 'sensex',
    underlying_from: strategy.underlying_from || 'cash',
    underlying_type: strategy.underlying_type || 'cash',
    square_off: strategy.is_squareoff ? 'complete' : 'partial',  // Convert bool to string
    is_squareoff: strategy.is_squareoff || false,
    trail_to_be: strategy.is_trail_sl_break_even || false,  // Field name conversion
    trail_to_be_scope: strategy.trail_to_be_scope || 'all_legs',
    is_trail_sl_break_even: strategy.is_trail_sl_break_even || false,
    trail_sl_break_even_type: strategy.trail_sl_break_even_type?.toLowerCase() || 'na',  // Case conversion
    strategy_type: strategy.strategy_type?.toLowerCase() || 'intraday',  // Case conversion
    sequential_position_type: strategy.sequential_position_type || 'BUY',
    sequential_main_leg: strategy.sequential_main_leg || 'CALL',
    entry_time: strategy.entry_time ? strategy.entry_time.substring(0, 5) : '09:16', // Strip seconds: "HH:MM:SS" -> "HH:MM"
    exit_time: strategy.exit_time ? strategy.exit_time.substring(0, 5) : '15:40', // Strip seconds: "HH:MM:SS" -> "HH:MM"
    // BTST "Delay restart". These MUST be restored explicitly: the builder
    // seeds its state from this object as-is (no merge with defaults), so
    // any key missing here is undefined in config — which is how the toggle
    // came back off and the time went out as "00:00:00" on the next save.
    delay_restart_enabled: strategy.is_delay_restart || false,
    delay_restart_time: strategy.delay_restart_time
      ? strategy.delay_restart_time.substring(0, 5)
      : '09:16',
    // Positional. Same reason as delay restart: the builder seeds from this
    // object, so a key missing here comes back as the default (0/0) no
    // matter what the backend actually returned.
    positional_expiry: strategy.positional_expire_on || 'weekly',
    positional_entry_day: String(strategy.positional_entry_day ?? '0'),
    positional_exit_day: String(strategy.positional_exit_day ?? '0'),
    lot_size: strategy.lot_size || 1,

    is_strategy_sl: strategy.is_strategy_sl || false,
    strategy_sl_type: strategy.strategy_sl_type?.toLowerCase() || 'points',  // Case conversion
    strategy_sl_value: strategy.strategy_sl_value || 0,
    is_strategy_target: strategy.is_strategy_target || false,
    strategy_target_type: strategy.strategy_target_type?.toLowerCase() || 'points',  // Case conversion
    strategy_target_value: strategy.strategy_target_value || 0,
    
    /*
      Reported ONLY when the switch is on. A strategy that never used Overall
      Stop Loss still carries a unit, and the backend's default for it is
      POINTS -- which this control does not offer (it has MTM and Percent).
      That is not a problem to fix: the control is disabled, the value is
      unused, and MTM is the right thing to show. Logging it anyway put two
      ERROR lines in the terminal for every such strategy loaded.

      With the switch ON, the same mismatch is worth knowing about, because
      then the unit is one the strategy actually trades on.
    */
    overall_stop_loss_enabled: isOn(strategy.is_strategy_sl),
    overall_stop_loss_mode: oneOf(
      strategy.strategy_sl_type?.toLowerCase() || 'mtm',
      OVERALL_UNITS, 'mtm', 'overall stop loss unit',
      { report: isOn(strategy.is_strategy_sl) },
    ),
    overall_stop_loss_value: strategy.strategy_sl_value || '',
    overall_target_enabled: isOn(strategy.is_strategy_target),
    overall_target_mode: oneOf(
      strategy.strategy_target_type?.toLowerCase() || 'mtm',
      OVERALL_UNITS, 'mtm', 'overall target unit',
      { report: isOn(strategy.is_strategy_target) },
    ),
    overall_target_value: strategy.strategy_target_value || '',
    
    // NOTE: lock_profit_enabled / mode / value1 / value2 are set further down
    // from the overall_trail_sl_* fields the backend actually sends. They were
    // ALSO assigned here from lock_profit_* keys that do not exist on the
    // response — dead entries that the later (correct) ones overwrote anyway.
    lock_profit_value: strategy.lock_profit_value || 0,
    lock_profit_lock_value: strategy.lock_profit_lock_value || 1,
    
    is_overall_reentry_sl: strategy.is_overall_reentry_sl || false,
    overall_reentry_sl_enabled: strategy.is_overall_reentry_sl || false,
    overall_reentry_sl_mode: strategy.overall_reentry_sl_type?.toLowerCase() || 're_asap',  // Case conversion
    overall_reentry_sl_type: strategy.overall_reentry_sl_type?.toLowerCase() || 're_asap',  // Case conversion
    overall_reentry_sl_count: strategy.overall_reentry_sl_value || '',
    overall_reentry_sl_value: strategy.overall_reentry_sl_value || 0,
    overall_reentry_sl_cost_mode: strategy.overall_reentry_sl_cost_mode || 'same_capital',
    overall_reentry_sl_multiplier: strategy.overall_reentry_sl_multiplier || 2,
    overall_reentry_sl_cost_value: strategy.overall_reentry_sl_cost_value || 1,
    
    is_overall_reentry_target: strategy.is_overall_reentry_target || false,
    overall_reentry_tgt_enabled: strategy.is_overall_reentry_target || false,
    overall_reentry_tgt_mode: strategy.overall_reentry_target_type?.toLowerCase() || 're_asap',  // Case conversion
    overall_reentry_target_type: strategy.overall_reentry_target_type?.toLowerCase() || 're_asap',  // Case conversion
    overall_reentry_tgt_count: strategy.overall_reentry_target_value || '',
    overall_reentry_target_value: strategy.overall_reentry_target_value || 0,
    overall_reentry_tgt_cost_mode: strategy.overall_reentry_tgt_cost_mode || 'profit_percentage',
    overall_reentry_tgt_cost_value: strategy.overall_reentry_tgt_cost_value || 1,
    
    /*
      'POINTS' MEANS MTM HERE. Overall Trail SL always reports its MTM option
      to the backend as POINTS -- see the note beside overall_trail_sl_type in
      buildSaveStrategyPayload -- so POINTS coming back can only have been MTM.
      Percent is sent and returned as PERCENT, so nothing else is ambiguous.

      Nothing undid that on the way in, so 'points' sat in the config for a
      control that offers only MTM and Percent. It displayed as MTM by luck,
      MTM being the first option, while the stored value named no option at
      all. The request body does not change: 'mtm' and 'points' both leave as
      'POINTS' on the next save.
    */
    lock_profit_enabled: isOn(strategy.is_overall_trail_sl),
    lock_profit_mode: oneOf(
      strategy.overall_trail_sl_type?.toLowerCase() === 'points'
        ? 'mtm'
        : (strategy.overall_trail_sl_type?.toLowerCase() || 'mtm'),
      OVERALL_UNITS, 'mtm', 'overall trail SL unit',
      { report: isOn(strategy.is_overall_trail_sl) },
    ),
    lock_profit_value1: strategy.is_overall_trail_sl ? (strategy.overall_instrument_move || 0) : '',
    lock_profit_value2: strategy.is_overall_trail_sl ? (strategy.overall_stoploss_move || 0) : '',
    
    ...((() => {
      return {};
    })()),
    
    legs: finalLegsWithStrike,
    
    strategy_name: strategyName,
    // A saved strategy carries its dates, but no historical data has been
    // fetched for this session — the button stays in its "Load Data" state
    // until the user actually loads it.
    dataLoaded: false,
  };

  return loadedConfig;
};
