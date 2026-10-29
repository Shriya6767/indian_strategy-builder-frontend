/**
 * Builds a single-strategy `.algtst` export from the builder config, mirroring
 * the reference shape: { version, name, strategy, attributes }, where
 * `strategy` uses dotted enum names ("LegType.CE", "MomentumType.PointsUp").
 *
 * ENUM COVERAGE: the reference files exercise only a subset. PE, Buy, ITM/OTM
 * strikes, non-weekly expiries, BTST/Positional, trail SL and re-entry follow
 * the same PascalCase convention but have NOT been seen in a real file --
 * verify them against an import before relying on them.
 */

import { EXTRAS_KEY, buildExtras, mainLegsOf } from './algtstExtras';

const bool = (v) => (v ? 'True' : 'False');

const num = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

const NONE = { Type: 'None', Value: {} };
const NONE_NUM = { Type: 'None', Value: 0 };

const STRATEGY_TYPE = {
  intraday: 'StrategyType.IntradaySameDay',
  // The reference product's spelling, confirmed against a real export of
  // theirs. This used to read 'StrategyType.BTST', which their import would
  // not have recognised.
  btst: 'StrategyType.IntradayBTST',
  sequential: 'StrategyType.Sequential',
  positional: 'StrategyType.Positional',
};

const EXPIRY = {
  weekly: 'ExpiryType.Weekly',
  next_weekly: 'ExpiryType.NextWeekly',
  monthly: 'ExpiryType.Monthly',
  next_monthly: 'ExpiryType.NextMonthly',
};

/**
 * OVERALL Stop Loss / Target units — NOT the leg table above.
 *
 * The two products name the same two things differently:
 *   this app's "MTM"      == the reference product's max loss / max profit
 *   this app's "Percent"  == the reference product's "total premium"
 *
 * Both are carried in the file's typed-value vocabulary, absolute as Points and
 * relative as Percentage. The UI's own labels are untouched: this mapping
 * exists only so a file written by either product lands on the right dropdown
 * in the other.
 */
const OVERALL_TYPE = {
  // OverallTgtSLType.MTM is confirmed from real exports of theirs. TotalPremium
  // is the other option their overall section offers ("total premium"), which
  // is what this app calls Percent — its spelling follows the same convention
  // but has not been seen in a file yet.
  mtm: 'OverallTgtSLType.MTM',
  percent: 'OverallTgtSLType.TotalPremium',
  // Tolerated spellings of the same two, from older saved configs.
  points: 'OverallTgtSLType.MTM',
  percentage: 'OverallTgtSLType.TotalPremium',
};

// Leg Target / Stop Loss / Trail SL units.
const TGT_SL_TYPE = {
  points: 'LegTgtSLType.Points',
  percentage: 'LegTgtSLType.Percentage',
  underlying_points: 'LegTgtSLType.UnderlyingPoints',
  underlying_percentage: 'LegTgtSLType.UnderlyingPercentage',
};

// Dropdown value -> momentum enum. The dropdown stores 'points' for "Points up"
// and 'percentage' for "Percent up" (see StrategyBuilder's momentum options).
const MOMENTUM = {
  points: 'MomentumType.PointsUp',
  points_down: 'MomentumType.PointsDown',
  percentage: 'MomentumType.PercentageUp',
  percentage_down: 'MomentumType.PercentageDown',
  underlying_points_up: 'MomentumType.UnderlyingPointsUp',
  underlying_points_down: 'MomentumType.UnderlyingPointsDown',
  underlying_percentage_up: 'MomentumType.UnderlyingPercentageUp',
  underlying_percentage_down: 'MomentumType.UnderlyingPercentageDown',
};

// A re-entry that opens a LAZY LEG instead of re-entering this one. The leg it
// opens is named by key into IdleLegConfigs.
const NEXT_LEG = 'ReentryType.NextLeg';

const REENTRY = {
  // "Immediate" is their spelling for RE ASAP, confirmed from a real export of
  // theirs. The rest have never been seen in one of their files; the names
  // below follow the same convention but remain unverified.
  re_asap: 'ReentryType.Immediate',
  re_asap_reverse: 'ReentryType.ReAsapReverse',
  re_momentum: 'ReentryType.ReMomentum',
  re_momentum_reverse: 'ReentryType.ReMomentumReverse',
  re_cost: 'ReentryType.ReCost',
  re_cost_reverse: 'ReentryType.ReCostReverse',
};

// 'atm' -> StrikeType.ATM, 'itm_3' -> StrikeType.ITM3, 'otm_2' -> StrikeType.OTM2
const strikeParameter = (strikeType) => {
  const s = String(strikeType || 'atm').toLowerCase();
  if (s === 'atm') return 'StrikeType.ATM';
  const m = s.match(/^(itm|otm)_(\d+)$/);
  return m ? `StrikeType.${m[1].toUpperCase()}${m[2]}` : 'StrikeType.ATM';
};

/**
 * "HH:MM" -> the indicator tree the format expects, plus the positional node
 * when there is one.
 *
 * Positional is NOT a StrategyType in the reference format — a real positional
 * export of theirs still says IntradaySameDay. It is expressed as a second
 * DataNode in Entry and Exit (how many days before expiry, and whether the
 * expiry is weekly), with attributes.positional naming the kind. That is what
 * is written here, so their importer reads our positional strategies the same
 * way it reads its own.
 */
/**
 * A bare clock field: "HH:MM:SS" when the setting is on, else the string "None"
 * the reference format uses for an unset one. Seconds are included to match how
 * every other time crosses this app's own backend boundary.
 */
const clockField = (enabled, time) => {
  if (!enabled) return 'None';
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || '').trim());
  if (!match) return 'None';
  return `${match[1].padStart(2, '0')}:${match[2]}:00`;
};

const timeIndicator = (time, positionalDays = null, isWeekly = true) => {
  const [h, m] = String(time || '00:00').split(':').map((p) => parseInt(p, 10) || 0);
  const nodes = [
    {
      Type: 'IndicatorTreeNodeType.DataNode',
      Value: {
        IndicatorName: 'IndicatorType.TimeIndicator',
        Parameters: { Hour: h, Minute: m },
      },
    },
  ];

  if (positionalDays !== null) {
    nodes.push({
      Type: 'IndicatorTreeNodeType.DataNode',
      Value: {
        IndicatorName: 'IndicatorType.PositionalIndicator',
        Parameters: { IsWeekly: bool(isWeekly), BeforeDays: num(positionalDays) },
      },
    });
  }

  return {
    Type: 'IndicatorTreeNodeType.OperandNode',
    OperandType: 'OperandType.And',
    Value: nodes,
  };
};

const typedValue = (enabled, type, value) =>
  (enabled && type ? { Type: type, Value: num(value) } : NONE_NUM);

/**
 * A leg's re-entry node. Our mode string carries the lazy leg's id when one is
 * chosen ('lazy_leg_1790…'), which becomes a NextLegRef into IdleLegConfigs.
 */
const reentryNode = (enabled, mode, count, lazyLegIds) => {
  if (!enabled) return NONE;
  const lazy = String(mode || '').match(/^lazy_leg_(\d+)$/);
  // Only if the lazy leg is actually in this file. A NextLegRef with nothing
  // behind it makes a file that cannot be imported — by us or by them.
  if (lazy && lazyLegIds?.has(lazy[1])) return { Type: NEXT_LEG, Value: { NextLegRef: lazy[1] } };
  // { ReentryCount: n }, as their own exports carry it — not a bare number.
  return {
    Type: REENTRY[String(mode || '').toLowerCase()] || REENTRY.re_asap,
    Value: { ReentryCount: num(count) },
  };
};

const buildLeg = (leg, lazyLegIds) => ({
  EntryType: 'EntryType.EntryByStrikeType',
  ExpiryKind: EXPIRY[String(leg.expiry || 'weekly').toLowerCase()] || EXPIRY.weekly,
  InstrumentKind: String(leg.option_type || 'call').toLowerCase() === 'put' ? 'LegType.PE' : 'LegType.CE',

  LegMomentum: leg.momentum_enabled
    ? { Type: MOMENTUM[String(leg.momentum_mode || '').toLowerCase()] || MOMENTUM.points, Value: num(leg.momentum_value) }
    : NONE_NUM,

  LegReentrySL: reentryNode(leg.reentry_sl_enabled, leg.reentry_sl_mode, leg.reentry_sl_count, lazyLegIds),
  LegReentryTP: reentryNode(leg.reentry_tgt_enabled, leg.reentry_tgt_mode, leg.reentry_tgt_count, lazyLegIds),

  LegStopLoss: typedValue(leg.stop_loss_enabled, TGT_SL_TYPE[String(leg.stop_loss_mode || 'points').toLowerCase()], leg.stop_loss_value),
  LegTarget: typedValue(leg.target_enabled, TGT_SL_TYPE[String(leg.target_mode || 'points').toLowerCase()], leg.target_value),

  LegTrailSL: leg.trail_enabled
    ? {
        Type: TGT_SL_TYPE[String(leg.trail_mode || 'points').toLowerCase()] || TGT_SL_TYPE.points,
        Value: { InstrumentMove: num(leg.trail_value), StopLossMove: num(leg.trail_lock_value) },
      }
    : NONE,

  LotConfig: { Type: 'LotType.Quantity', Value: num(leg.lots) || 1 },
  PositionType: String(leg.position || 'buy').toLowerCase() === 'sell' ? 'PositionType.Sell' : 'PositionType.Buy',
  StrikeParameter: strikeParameter(leg.strike_type),
  id: String(leg.id ?? ''),
});

/**
 * "Delay restart" as the reference stores it: whole minutes after the 09:15
 * SESSION OPEN (the field is named "skip initial candles").
 * Only BTST and positional carry one — the other types show "No re-entry after"
 * in that slot instead, and their SkipInitialCandles stays 0.
 */
const SESSION_OPEN_MINUTES = 9 * 60 + 15;

const delayRestartMinutes = (config, strategyType) => {
  if (!['btst', 'positional'].includes(strategyType)) return 0;
  if (!config.delay_restart_enabled) return 0;
  const at = /^(\d{1,2}):(\d{2})/.exec(String(config.delay_restart_time || '').trim());
  if (!at) return 0;
  const minutes = (Number(at[1]) * 60 + Number(at[2])) - SESSION_OPEN_MINUTES;
  return minutes > 0 ? minutes : 0;
};

export const buildAlgtstExport = (config = {}, strategyName = '') => {
  const legs = mainLegsOf(config.legs);
  const strategyType = String(config.strategy_type || 'intraday').toLowerCase();
  const isPositional = strategyType === 'positional';
  // The lazy legs this file will contain; a reference to anything else is not
  // written (see reentryNode).
  const lazyLegIds = new Set((config.legs || []).filter((l) => l.isLazyLeg).map((l) => String(l.id)));
  const positionalWeekly = String(config.positional_expiry || 'weekly').toLowerCase() !== 'monthly';

  // Everything the reference fields cannot express (see algtstExtras). Left off
  // entirely when there is nothing to carry, so a plain strategy still exports
  // a file identical to the reference format.
  const extras = buildExtras(config);

  return {
    version: '0.7',
    name: strategyName || config.strategy_name || 'Unsaved Strategy',
    strategy: {
      // The Index dropdown writes to config.dte_filter, not config.symbol.
      Ticker: String(config.dte_filter || config.symbol || '').toUpperCase(),
      TakeUnderlyingFromCashOrNot: bool(String(config.underlying_from || 'cash') !== 'futures'),
      TrailSLtoBreakeven: bool(config.trail_to_be),
      SquareOffAllLegs: bool(String(config.square_off) === 'complete'),

      EntryIndicators: timeIndicator(config.entry_time, isPositional ? config.positional_entry_day : null, positionalWeekly),
      ExitIndicators: timeIndicator(config.exit_time, isPositional ? config.positional_exit_day : null, positionalWeekly),

      // A positional strategy keeps IntradaySameDay here, as the reference
      // product's own positional export does; the indicators above and the
      // attribute below are what make it positional.
      StrategyType: isPositional
        ? STRATEGY_TYPE.intraday
        : (STRATEGY_TYPE[strategyType] || STRATEGY_TYPE.intraday),
      MaxPositionInADay: 1,
      // "No re-entry after" — intraday/sequential only. The BTST/positional
      // "Delay restart" is a DIFFERENT setting and goes in SkipInitialCandles
      // below; see the note in algtstImport.
      ReentryTimeRestriction: clockField(config.no_reentry_after_enabled, config.no_reentry_after_time),
      // "Delay restart", as minutes after entry — the offset convention this
      // format uses. 0 when off or when the type has no such control, which is
      // how the reference writes an unset one.
      SkipInitialCandles: delayRestartMinutes(config, strategyType),
      // "None" when off, which is how the reference format spells an unset one.
      // Written as a real field as well as in strategydesk so a reader of their
      // format alone still sees it.
      StopMonitoringTime: clockField(config.stop_monitoring_enabled, config.stop_monitoring_time),

      ListOfLegConfigs: legs.map((leg) => buildLeg(leg, lazyLegIds)),
      // Lazy legs, keyed by id — the key a NextLegRef points at. They are
      // written whole, so one that itself opens another lazy leg keeps that
      // reference too.
      IdleLegConfigs: Object.fromEntries(
        (config.legs || [])
          .filter((l) => l.isLazyLeg)
          .map((l) => [String(l.id), buildLeg(l, lazyLegIds)]),
      ),

      OverallSL: typedValue(config.overall_stop_loss_enabled, OVERALL_TYPE[String(config.overall_stop_loss_mode || 'mtm').toLowerCase()], config.overall_stop_loss_value),
      OverallTgt: typedValue(config.overall_target_enabled, OVERALL_TYPE[String(config.overall_target_mode || 'mtm').toLowerCase()], config.overall_target_value),
      // Overall Trail SL: the same control on both sides — their MTM is this
      // app's MTM, and their "Premium %" is this app's "Percent". The unit
      // lives on the Type (same family as the overall SL / target), and the two
      // numbers keep LockAndTrail's field names, which is the only shape ever
      // seen for a trailing pair in one of their files.
      OverallTrailSL: config.lock_profit_enabled
        ? {
            Type: OVERALL_TYPE[String(config.lock_profit_mode || 'mtm').toLowerCase()] || OVERALL_TYPE.mtm,
            Value: {
              IfProfitReaches: num(config.lock_profit_value1),
              LockProfit: num(config.lock_profit_value2),
            },
          }
        : NONE,
      LockAndTrail: NONE,
      OverallReentrySL: config.overall_reentry_sl_enabled
        ? {
            Type: REENTRY[String(config.overall_reentry_sl_mode || '').toLowerCase()] || REENTRY.re_asap,
            Value: { ReentryCount: num(config.overall_reentry_sl_count) },
          }
        : NONE,
      OverallReentryTgt: config.overall_reentry_tgt_enabled
        ? {
            Type: REENTRY[String(config.overall_reentry_tgt_mode || '').toLowerCase()] || REENTRY.re_asap,
            Value: { ReentryCount: num(config.overall_reentry_tgt_count) },
          }
        : NONE,
      OverallMomentum: NONE_NUM,

      WeeklyOldRegime: true,
    },
    attributes: {
      template: 'Straddle920',
      // 'Positional.Weekly' / 'Positional.Monthly' / 'False' — their spelling.
      positional: isPositional
        ? `Positional.${positionalWeekly ? 'Weekly' : 'Monthly'}`
        : 'False',
    },
    ...(extras ? { [EXTRAS_KEY]: extras } : {}),
  };
};

/**
 * Download name: "<strategy name>_<date>", and for an unsaved one the very name
 * the header shows it under — "Unsaved Strategy_<date>". -999 is the
 * placeholder id an unsaved strategy carries, so it does not count as saved.
 *
 * No extension, by request. Import does not rely on one — it reads the file's
 * contents — so a name without it still comes back in.
 */
export const algtstFileName = (strategyName) => {
  const name = String(strategyName || '').trim();
  const safe = name.replace(/[\\/:*?"<>|]/g, '_');
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${safe || 'Unsaved Strategy'}_${today}`;
};
