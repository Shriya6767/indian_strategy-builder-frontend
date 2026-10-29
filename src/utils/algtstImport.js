import { getDefaultConfig, getDefaultLeg } from '../config/defaultStrategyConfig';
import { SUPPORTED_INDEXES } from '../config/constants';
import { EXTRAS_KEY, applyExtras } from './algtstExtras';

/**
 * Reads a `.algtst` back into a builder config — the inverse of
 * buildAlgtstExport. KEEP THE TWO IN STEP: an enum added there falls back to a
 * default here, silently. The round trip is the test.
 *
 * WHAT CANNOT COME BACK: premium strike criteria, per-leg times, range
 * breakout, gap filters, sequential legs and the date window have no place in
 * the format. Lazy legs (IdleLegConfigs) are read only far enough to refuse
 * the file -- there is no populated example to map against.
 */

/**
 * Versions this importer understands. The `version` field exists precisely so a
 * later format can be refused instead of silently misread — a v0.8 file with a
 * renamed field would otherwise import as a strategy that is quietly wrong,
 * which is worse than not importing at all.
 */
const SUPPORTED_VERSIONS = ['0.7'];

/** Reverse of a { key: 'Enum.Name' } table. */
const invert = (table) => Object.fromEntries(
  Object.entries(table).map(([key, value]) => [value, key]),
);

const STRATEGY_TYPE = {
  ...invert({
    intraday: 'StrategyType.IntradaySameDay',
    btst: 'StrategyType.IntradayBTST',
    sequential: 'StrategyType.Sequential',
    positional: 'StrategyType.Positional',
  }),
  // What this app's own exporter wrote before it was corrected to the
  // reference spelling. Files already on disk still say this.
  'StrategyType.BTST': 'btst',
};

const EXPIRY = invert({
  weekly: 'ExpiryType.Weekly',
  next_weekly: 'ExpiryType.NextWeekly',
  monthly: 'ExpiryType.Monthly',
  next_monthly: 'ExpiryType.NextMonthly',
});

const TGT_SL_TYPE = invert({
  points: 'LegTgtSLType.Points',
  percentage: 'LegTgtSLType.Percentage',
  underlying_points: 'LegTgtSLType.UnderlyingPoints',
  underlying_percentage: 'LegTgtSLType.UnderlyingPercentage',
});

/**
 * OVERALL Stop Loss / Target units, which are NOT the leg units above:
 *   the reference product's max loss / max profit == this app's "MTM"
 *   the reference product's "total premium"       == this app's "Percent"
 * (See the matching table in algtstExport.) The UI keeps its own labels; this
 * only decides which dropdown value a file lands on.
 */
const OVERALL_TYPE = {
  'OverallTgtSLType.MTM': 'mtm',
  'OverallTgtSLType.TotalPremium': 'percent',
  // Leg-style spellings, in case a file carries them here: absolute money is
  // this app's MTM, a percentage is its Percent.
  'LegTgtSLType.Points': 'mtm',
  'LegTgtSLType.Percentage': 'percent',
};

const MOMENTUM = invert({
  points: 'MomentumType.PointsUp',
  points_down: 'MomentumType.PointsDown',
  percentage: 'MomentumType.PercentageUp',
  percentage_down: 'MomentumType.PercentageDown',
  underlying_points_up: 'MomentumType.UnderlyingPointsUp',
  underlying_points_down: 'MomentumType.UnderlyingPointsDown',
  underlying_percentage_up: 'MomentumType.UnderlyingPercentageUp',
  underlying_percentage_down: 'MomentumType.UnderlyingPercentageDown',
});

/**
 * Range Breakout, which the reference format stores in LegMomentum rather than
 * a field of its own — the two are alternatives for the same leg, so they share
 * the slot. The name encodes two of the three choices:
 *
 *   Delayed…Breadth…   the range window (as opposed to a plain momentum type)
 *   …Underlying…       tracking: present = Underlying, absent = their "Strike
 *                      Price", which is this app's "Instrument"
 *   …High / …Low       entry on the high or the low of the range
 *
 * What the window itself is — their End DTE / End Day and End Time — is not in
 * the node; see where this is used for how that is handled.
 */
const RANGE_BREAKOUT = {
  'MomentumType.DelayedBreadthHigh': { range_instrument: 'instrument', range_direction: 'high' },
  'MomentumType.DelayedBreadthLow': { range_instrument: 'instrument', range_direction: 'low' },
  'MomentumType.DelayedUnderlyingBreadthHigh': { range_instrument: 'underlying', range_direction: 'high' },
  'MomentumType.DelayedUnderlyingBreadthLow': { range_instrument: 'underlying', range_direction: 'low' },
};

const REENTRY = {
  ...invert({
    re_asap: 'ReentryType.ReAsap',
    re_asap_reverse: 'ReentryType.ReAsapReverse',
    re_momentum: 'ReentryType.ReMomentum',
    re_momentum_reverse: 'ReentryType.ReMomentumReverse',
    re_cost: 'ReentryType.ReCost',
    re_cost_reverse: 'ReentryType.ReCostReverse',
  }),
  // Confirmed from a real BTST export of theirs: RE ASAP is spelled
  // "Immediate" over there. The six names above were guesses made before any
  // file showed a re-entry; they stay so files this app already wrote still
  // read, but Immediate is the one their own exports use.
  'ReentryType.Immediate': 're_asap',
};

/**
 * How many re-entries. Their files carry this as { ReentryCount: n }; ours
 * wrote a bare number. String(an object) is "[object Object]", which is what
 * used to land in the count field — so both shapes are read here.
 */
const reentryCount = (value) => {
  if (value && typeof value === 'object') return str(value.ReentryCount ?? '');
  return str(value);
};

const NEXT_LEG = 'ReentryType.NextLeg';
/** Marks a reference that still names a FILE id rather than one of ours. */
const REF_PREFIX = '@nextleg:';

const isTrue = (v) => v === true || String(v) === 'True';

/** A set value comes back as a string, since every input in the form is one. */
const str = (v) => (v === null || v === undefined ? '' : String(v));

/** "StrikeType.ITM3" -> "itm_3"; "StrikeType.ATM" -> "atm". */
const strikeType = (parameter) => {
  const name = String(parameter || '').replace('StrikeType.', '');
  if (!name || name === 'ATM') return 'atm';
  const m = name.match(/^(ITM|OTM)(\d+)$/i);
  return m ? `${m[1].toLowerCase()}_${m[2]}` : 'atm';
};

/** The parameters of one named indicator inside an Entry/Exit tree. */
const indicatorParams = (node, indicatorName) => node?.Value?.find(
  (child) => child?.Value?.IndicatorName === indicatorName,
)?.Value?.Parameters || null;

/**
 * Digs { Hour, Minute } out of the indicator tree and returns "HH:MM".
 * Searched by name rather than taken from position: a positional strategy puts
 * a second node in this list, and it is not always the time one that is first.
 */
/**
 * Every leg key this reader consumes. Used only to spot the ones it does not,
 * so an unknown setting is reported instead of dropped in silence.
 */
const KNOWN_LEG_KEYS = new Set([
  'EntryType', 'ExpiryKind', 'InstrumentKind', 'LotConfig', 'PositionType',
  'StrikeParameter', 'StrikeParameters', 'id',
  'LegTarget', 'LegStopLoss', 'LegTrailSL', 'LegMomentum',
  'LegReentrySL', 'LegReentryTP',
]);

const timeFromIndicator = (node, fallback) => {
  const params = indicatorParams(node, 'IndicatorType.TimeIndicator')
    // Older files of ours wrote a single node with no IndicatorName lookup.
    || node?.Value?.[0]?.Value?.Parameters;
  if (!params) return fallback;
  const h = parseInt(params.Hour, 10);
  const m = parseInt(params.Minute, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * A bare clock field -> "HH:MM", or null when it is off.
 *
 * The reference format writes the string "None" for an unset one. A set one has
 * only ever been seen as a clock string, but the shape is read loosely — "HH:MM",
 * "HH:MM:SS" and a { Hour, Minute } pair all land on the same answer — so a file
 * that words it differently still imports instead of silently losing the time.
 */
/**
 * "HH:MM" plus a number of minutes, or null when the result is not a time
 * inside the trading day. Used for the range-breakout window, which the
 * reference format stores as an offset from the strategy's entry time.
 */
// The session open. "Skip initial candles" counts from here.
const SESSION_OPEN = '09:15';

const addMinutes = (time, minutes) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || '').trim());
  const offset = Number(minutes);
  if (!match || !Number.isFinite(offset) || offset < 0) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + Math.round(offset);
  // Must still be on the same trading day, and after the entry it is measured
  // from. MARKET_CLOSE_MINUTES is 15:30.
  const MARKET_CLOSE_MINUTES = 15 * 60 + 30;
  if (total > MARKET_CLOSE_MINUTES) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const clockValue = (raw) => {
  if (raw === undefined || raw === null || raw === 'None' || raw === '') return null;
  if (typeof raw === 'object') {
    const h = parseInt(raw.Hour ?? raw.hour, 10);
    const m = parseInt(raw.Minute ?? raw.minute, 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(String(raw).trim());
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

/** { IsWeekly, BeforeDays } for a positional strategy, or null. */
const positionalParams = (node) => indicatorParams(node, 'IndicatorType.PositionalIndicator');

/**
 * { Type, Value } -> [enabled, mode, value] for Target / SL style fields.
 * A Type this app has no unit for is NOT guessed at: "25" means something
 * different in every unit, so the field comes back disabled and the caller is
 * told (via `warn`) what could not be carried. A silent fallback here is how a
 * strategy imports looking right and trading differently.
 */
const typedValue = (node, table, defaultMode, warn, label) => {
  const type = node?.Type;
  if (!type || type === 'None') return [false, defaultMode, ''];
  const mode = table[type];
  if (!mode) {
    warn?.(`${label} uses "${String(type).split('.').pop()}", which this app does not support — it was left off.`);
    return [false, defaultMode, ''];
  }
  return [true, mode, str(node.Value)];
};

/**
 * What a leg may say before we are willing to read it. A file from the
 * reference product can use vocabulary this builder has no control for —
 * premium-based entry, capital-sized lots, a strike picked by premium — and
 * mapping those onto the strike-type controls would produce a strategy that
 * looks imported but trades differently. Each one is named in the message so
 * the user knows what about their file we could not take.
 */
const legRejection = (raw, index) => {
  const at = `Leg ${index + 1}`;

  const entry = raw?.EntryType;
  if (entry && entry !== 'EntryType.EntryByStrikeType') {
    return `${at} selects its strike by ${String(entry).replace('EntryType.', '')}, which this app cannot import.`;
  }

  const lot = raw?.LotConfig?.Type;
  if (lot && lot !== 'LotType.Quantity') {
    return `${at} sizes its lots by ${String(lot).replace('LotType.', '')}, which this app cannot import.`;
  }

  const strike = String(raw?.StrikeParameter || '');
  if (strike && !/^StrikeType\.(ATM|ITM\d+|OTM\d+)$/i.test(strike)) {
    return `${at} uses strike ${strike.replace('StrikeType.', '')}, which this app cannot import.`;
  }

  return null;
};

/**
 * Fresh numeric leg ids, matching nextLegId() in StrategyBuilder. A counter,
 * not the index: sequential legs are minted after the main ones and two legs
 * sharing an id would silently misroute every edit to the first of them.
 */
let legIdCounter = 0;
const nextLegId = () => Date.now() * 1000 + (legIdCounter += 1);

const buildLeg = (raw, warn, label = 'A leg', entryTime = '', entryDte = null) => {
  const leg = getDefaultLeg();

  // Anything on the leg this reader does not know about. A key that is simply
  // absent from the list below is not "off" — it is unread, and a setting the
  // strategy trades on would disappear without a word. Naming the key in the
  // warning also means the first person to hit a new one can say exactly what
  // it was called.
  Object.keys(raw || {}).forEach((key) => {
    if (KNOWN_LEG_KEYS.has(key)) return;
    const value = raw[key];
    const meaningful = value && typeof value === 'object'
      ? value.Type !== undefined && value.Type !== 'None'
      : value !== null && value !== undefined && value !== '' && value !== 'None' && value !== false;
    if (meaningful) {
      warn?.(`${label} carries "${key}", which this app does not read yet — it was left off.`);
    }
  });

  leg.option_type = String(raw?.InstrumentKind) === 'LegType.PE' ? 'put' : 'call';
  leg.position = String(raw?.PositionType) === 'PositionType.Sell' ? 'sell' : 'buy';
  leg.expiry = EXPIRY[raw?.ExpiryKind] || 'weekly';
  leg.strike_type = strikeType(raw?.StrikeParameter);
  leg.lots = str(raw?.LotConfig?.Value ?? 1) || '1';

  [leg.target_enabled, leg.target_mode, leg.target_value] = typedValue(raw?.LegTarget, TGT_SL_TYPE, 'points', warn, `${label}'s target`);
  [leg.stop_loss_enabled, leg.stop_loss_mode, leg.stop_loss_value] = typedValue(raw?.LegStopLoss, TGT_SL_TYPE, 'points', warn, `${label}'s stop loss`);

  if (raw?.LegMomentum?.Type && raw.LegMomentum.Type !== 'None') {
    const range = RANGE_BREAKOUT[raw.LegMomentum.Type];
    const mode = MOMENTUM[raw.LegMomentum.Type];
    if (range) {
      // Range Breakout, not momentum — same slot, different meaning.
      leg.range_enabled = true;
      leg.range_instrument = range.range_instrument;
      leg.range_direction = range.range_direction;

      // Value is how long the range window runs for, in minutes from the
      // strategy's entry time: an export showing 09:45 against an entry of
      // 09:35 carries 10. Only accepted when it lands inside the trading day —
      // a number that does not is not a window, and inventing one out of it
      // would change when the strategy enters.
      const endTime = addMinutes(entryTime, raw.LegMomentum.Value);
      if (endTime) {
        leg.range_time = endTime;
      } else {
        warn?.(`${label}'s range breakout ends "${str(raw.LegMomentum.Value)}" after its entry time, which is not a `
          + `time within the trading day — its end time was left at the default.`);
      }

      // Their End DTE / End Day is genuinely not in the export: two legs set to
      // different values come out byte-identical here. A positional leg takes
      // the strategy's entry day, which is inside the window the backtest
      // requires; everything else keeps this app's default. Either way it is
      // called out rather than left to be discovered.
      if (entryDte !== null && entryDte !== undefined && entryDte !== '') {
        leg.range_end_day = String(entryDte);
      }
      warn?.(`${label}'s range breakout came in as ${range.range_direction === 'high' ? 'High' : 'Low'} on `
        + `${range.range_instrument === 'underlying' ? 'Underlying' : 'Instrument'}`
        + `${endTime ? ` ending ${endTime}` : ''}, but the file carries no end day for it`
        + `${leg.range_end_day ? ` — it was set to ${leg.range_end_day}` : ''}; check it before running a backtest.`);
    } else if (mode) {
      leg.momentum_enabled = true;
      leg.momentum_mode = mode;
      leg.momentum_value = str(raw.LegMomentum.Value);
    } else {
      warn?.(`${label}'s momentum uses "${String(raw.LegMomentum.Type).split('.').pop()}", which this app does not support — it was left off.`);
    }
  }

  // Trail SL carries two numbers in one node, not one.
  if (raw?.LegTrailSL?.Type && raw.LegTrailSL.Type !== 'None') {
    const mode = TGT_SL_TYPE[raw.LegTrailSL.Type];
    if (mode) {
      leg.trail_enabled = true;
      leg.trail_mode = mode;
      leg.trail_value = str(raw.LegTrailSL.Value?.InstrumentMove);
      leg.trail_lock_value = str(raw.LegTrailSL.Value?.StopLossMove);
    } else {
      warn?.(`${label}'s trail SL uses "${String(raw.LegTrailSL.Type).split('.').pop()}", which this app does not support — it was left off.`);
    }
  }

  // A re-entry that opens a lazy leg names it by key. The key cannot become our
  // 'lazy_leg_<id>' until every leg has its new id, so it is parked in a
  // placeholder and resolved in a second pass.
  if (raw?.LegReentrySL?.Type && raw.LegReentrySL.Type !== 'None') {
    leg.reentry_sl_enabled = true;
    if (raw.LegReentrySL.Type === NEXT_LEG) {
      leg.reentry_sl_mode = `${REF_PREFIX}${raw.LegReentrySL.Value?.NextLegRef}`;
      leg.reentry_sl_count = '';
    } else {
      leg.reentry_sl_mode = REENTRY[raw.LegReentrySL.Type]
        || (warn?.(`${label}'s re-entry on SL uses "${String(raw.LegReentrySL.Type).split('.').pop()}", which this app reads as RE ASAP.`), 're_asap');
      leg.reentry_sl_count = reentryCount(raw.LegReentrySL.Value);
    }
  }
  if (raw?.LegReentryTP?.Type && raw.LegReentryTP.Type !== 'None') {
    leg.reentry_tgt_enabled = true;
    if (raw.LegReentryTP.Type === NEXT_LEG) {
      leg.reentry_tgt_mode = `${REF_PREFIX}${raw.LegReentryTP.Value?.NextLegRef}`;
      leg.reentry_tgt_count = '';
    } else {
      leg.reentry_tgt_mode = REENTRY[raw.LegReentryTP.Type]
        || (warn?.(`${label}'s re-entry on target uses "${String(raw.LegReentryTP.Type).split('.').pop()}", which this app reads as RE ASAP.`), 're_asap');
      leg.reentry_tgt_count = reentryCount(raw.LegReentryTP.Value);
    }
  }

  // Leg ids must be numeric and unique — strategyApi parses lazy-leg references
  // with a numeric regex, and edits are routed by id. The file's own id is a
  // string from another session, so fresh ones are minted here.
  leg.id = nextLegId();
  leg.straddle_id = leg.id;

  return leg;
};

/**
 * Parses file text into { ok, error, name, config }.
 * Never throws: a bad file is a message for the user, not an exception.
 */
export const parseAlgtst = (text) => {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a valid .algtst file.' };
  }
  return parseStrategyJson(file);
};

/**
 * The half of parseAlgtst that works on already-parsed JSON. A portfolio file
 * carries one of these blocks per strategy, and it maps them with this — one
 * mapper, one set of gates, whichever kind of file it arrived in.
 */
export const parseStrategyJson = (file) => {
  // Everything the file asks for that this app cannot represent, in plain
  // words. The import still succeeds; the user is told what was left behind.
  const warnings = [];
  const warn = (message) => { warnings.push(message); };

  const version = String(file?.version ?? '').trim();
  if (!version) {
    return { ok: false, error: 'This file has no version in it, so it cannot be read safely.' };
  }
  if (!SUPPORTED_VERSIONS.includes(version)) {
    return {
      ok: false,
      error: `This file is version ${version}; this app reads version ${SUPPORTED_VERSIONS.join(', ')}.`,
    };
  }

  const strategy = file?.strategy;
  if (!strategy || typeof strategy !== 'object') {
    return { ok: false, error: 'This file has no strategy in it.' };
  }
  if (!Array.isArray(strategy.ListOfLegConfigs) || strategy.ListOfLegConfigs.length === 0) {
    return { ok: false, error: 'This strategy has no legs, so there is nothing to import.' };
  }

  const config = getDefaultConfig();

  // An index the dropdown does not offer cannot be shown, and loading it anyway
  // leaves the form reading SENSEX while every request carries the other
  // ticker. Refuse it instead, and say which index the file is for.
  const ticker = String(strategy.Ticker || '').toLowerCase();
  if (ticker) {
    if (!SUPPORTED_INDEXES.some((index) => index.value === ticker)) {
      const offered = SUPPORTED_INDEXES.map((index) => index.label).join(', ');
      return {
        ok: false,
        error: `This file is for ${String(strategy.Ticker).toUpperCase()}; this app supports ${offered}.`,
      };
    }
    config.dte_filter = ticker;
    config.instrument_index = ticker;
    config.symbol = ticker;
  }

  config.strategy_type = STRATEGY_TYPE[strategy.StrategyType] || 'intraday';
  config.underlying_from = isTrue(strategy.TakeUnderlyingFromCashOrNot) ? 'cash' : 'futures';
  config.underlying_type = config.underlying_from;
  config.trail_to_be = isTrue(strategy.TrailSLtoBreakeven);
  config.square_off = isTrue(strategy.SquareOffAllLegs) ? 'complete' : 'partial';
  config.is_squareoff = config.square_off === 'complete';

  // Reference-format settings with no control in this UI. Non-default values
  // would change how the strategy trades, so each one is called out.
  if (Number(strategy.MaxPositionInADay) > 1) {
    warn(`"Max positions in a day: ${strategy.MaxPositionInADay}" is not supported here — it was left off.`);
  }
  if (strategy.OverallMomentum?.Type && strategy.OverallMomentum.Type !== 'None') {
    warn('"Overall momentum" is not supported here — it was left off.');
  }


  config.entry_time = timeFromIndicator(strategy.EntryIndicators, config.entry_time);
  config.exit_time = timeFromIndicator(strategy.ExitIndicators, config.exit_time);

  // Both of these are read here but APPLIED further down, once the positional
  // check below has settled strategy_type — the form shows only ONE of the two
  // controls they feed, and which one depends on that type.
  const reentryRestriction = clockValue(strategy.ReentryTimeRestriction);
  const skipCandles = Number(strategy.SkipInitialCandles);

  const stopMonitoring = clockValue(strategy.StopMonitoringTime);
  if (stopMonitoring) {
    config.stop_monitoring_enabled = true;
    config.stop_monitoring_time = stopMonitoring;
  }

  // Positional is not a StrategyType in this format — a real positional export
  // still says IntradaySameDay. It shows up as a PositionalIndicator beside the
  // time in Entry and Exit, with attributes.positional naming the kind. Files
  // this app wrote before that was known say StrategyType.Positional, so both
  // are accepted.
  const entryPositional = positionalParams(strategy.EntryIndicators);
  const exitPositional = positionalParams(strategy.ExitIndicators);
  const attributePositional = String(file?.attributes?.positional ?? 'False');

  if (entryPositional || exitPositional || attributePositional.startsWith('Positional.')) {
    config.strategy_type = 'positional';
    const weekly = entryPositional
      ? isTrue(entryPositional.IsWeekly)
      : !attributePositional.endsWith('Monthly');
    config.positional_expiry = weekly ? 'weekly' : 'monthly';
    if (entryPositional?.BeforeDays !== undefined) {
      config.positional_entry_day = String(entryPositional.BeforeDays);
    }
    if (exitPositional?.BeforeDays !== undefined) {
      config.positional_exit_day = String(exitPositional.BeforeDays);
    }
  }

  // The builder's own default (MTM) is the fallback here, not 'points'. MTM has
  // no equivalent in the file's vocabulary, so a disabled overall SL says
  // nothing about its mode — and forcing 'points' would quietly move the
  // dropdown off MTM on every import.
  [config.overall_stop_loss_enabled, config.overall_stop_loss_mode, config.overall_stop_loss_value] =
    typedValue(strategy.OverallSL, OVERALL_TYPE, config.overall_stop_loss_mode, warn, 'The overall stop loss');
  [config.overall_target_enabled, config.overall_target_mode, config.overall_target_value] =
    typedValue(strategy.OverallTgt, OVERALL_TYPE, config.overall_target_mode, warn, 'The overall target');
  config.is_strategy_sl = config.overall_stop_loss_enabled;
  config.is_strategy_target = config.overall_target_enabled;

  // Overall Trail SL. Their MTM is this app's MTM and their "Premium %" is its
  // "Percent"; the two numbers are the same pair the control shows. Files that
  // put it under LockAndTrail (as this app used to) are read too, so nothing
  // already exported is left behind.
  const trail = strategy.OverallTrailSL?.Type && strategy.OverallTrailSL.Type !== 'None'
    ? strategy.OverallTrailSL
    : (strategy.LockAndTrail?.Type && strategy.LockAndTrail.Type !== 'None' ? strategy.LockAndTrail : null);

  if (trail) {
    config.lock_profit_enabled = true;
    config.overall_trail_sl_enabled = true;
    // LockAndTrailType.Lock carries no unit, so those files keep the default.
    config.lock_profit_mode = OVERALL_TYPE[trail.Type] || config.lock_profit_mode;
    config.lock_profit_value1 = str(trail.Value?.IfProfitReaches ?? trail.Value?.InstrumentMove);
    config.lock_profit_value2 = str(trail.Value?.LockProfit ?? trail.Value?.StopLossMove);
  }

  if (strategy.OverallReentrySL?.Type && strategy.OverallReentrySL.Type !== 'None') {
    config.overall_reentry_sl_enabled = true;
    config.is_overall_reentry_sl = true;
    config.overall_reentry_sl_mode = REENTRY[strategy.OverallReentrySL.Type] || 're_asap';
    config.overall_reentry_sl_type = config.overall_reentry_sl_mode;
    config.overall_reentry_sl_count = reentryCount(strategy.OverallReentrySL.Value);
  }
  if (strategy.OverallReentryTgt?.Type && strategy.OverallReentryTgt.Type !== 'None') {
    config.overall_reentry_tgt_enabled = true;
    config.is_overall_reentry_target = true;
    config.overall_reentry_tgt_mode = REENTRY[strategy.OverallReentryTgt.Type] || 're_asap';
    config.overall_reentry_target_type = config.overall_reentry_tgt_mode;
    config.overall_reentry_tgt_count = reentryCount(strategy.OverallReentryTgt.Value);
  }

  const idle = strategy.IdleLegConfigs && typeof strategy.IdleLegConfigs === 'object'
    ? Object.entries(strategy.IdleLegConfigs)
    : [];

  // Checked before any mapping: a file is either imported whole or not at all.
  for (let i = 0; i < strategy.ListOfLegConfigs.length; i += 1) {
    const rejection = legRejection(strategy.ListOfLegConfigs[i], i);
    if (rejection) return { ok: false, error: rejection };
  }
  for (let i = 0; i < idle.length; i += 1) {
    const rejection = legRejection(idle[i][1], i);
    if (rejection) return { ok: false, error: rejection.replace(/^Leg \d+/, `Lazy leg ${i + 1}`) };
  }

  // Lazy legs are ordinary entries in config.legs carrying isLazyLeg, kept
  // after the main ones.
  //
  // Positional End DTE is not in the file (two legs with different values
  // export identically), so an imported leg starts at the entry day -- the
  // first day the strategy actually holds. 0 would not be valid.
  //
  // ONE control fills this slot, by strategy type: intraday/sequential show
  // "No re-entry after" (ReentryTimeRestriction), BTST/positional show "Delay
  // restart" (SkipInitialCandles). Two DIFFERENT fields in the reference
  // format -- established by diffing two of its exports. Whichever the open
  // type cannot show is reported, not dropped in silence.
  const showsDelayRestart = ['btst', 'positional'].includes(config.strategy_type);

  if (reentryRestriction) {
    if (showsDelayRestart) {
      warn(`"No re-entry after ${reentryRestriction}" only applies to intraday and `
        + 'sequential strategies, so this one has no field for it — it was left off.');
    } else {
      config.no_reentry_after_enabled = true;
      config.no_reentry_after_time = reentryRestriction;
    }
  }

  if (Number.isFinite(skipCandles) && skipCandles > 0) {
    // Minutes from the 09:15 SESSION OPEN — the name means "skip the first N
    // candles of the day". NOT from entry time, and NOT from MARKET_OPEN_TIME
    // (09:16, which is the earliest time this app's own pickers allow, a
    // different thing). Checked against the reference's own screen: a file with
    // SkipInitialCandles 30 and a 09:35 entry shows 09:45 there, which is
    // 09:15 + 30, not 09:35 + 30.
    const at = addMinutes(SESSION_OPEN, skipCandles);
    if (!showsDelayRestart) {
      warn(`"Delay restart" only applies to BTST and positional strategies, so this `
        + 'one has no field for it — it was left off.');
    } else if (!at) {
      warn(`"Delay restart" is ${skipCandles} minutes after the ${SESSION_OPEN} open, `
        + 'which falls after the market closes — it was left off.');
    } else {
      config.delay_restart_enabled = true;
      config.delay_restart_time = at;
    }
  }

  const positionalEntryDte = config.strategy_type === 'positional'
    ? config.positional_entry_day
    : null;

  const mainLegs = strategy.ListOfLegConfigs.map((raw, i) => buildLeg(raw, warn, `Leg ${i + 1}`, config.entry_time, positionalEntryDte));
  const lazyByFileId = new Map();
  const lazyLegs = idle.map(([fileId, raw], i) => {
    const leg = buildLeg(raw, warn, `Lazy leg ${i + 1}`, config.entry_time, positionalEntryDte);
    leg.isLazyLeg = true;
    // The file's key becomes the leg's name ("lazy1" in their exports, an id in
    // ours). It has to be present and unique: saving nests a copy of the lazy
    // leg under each main leg that opens it, and the loader tells those copies
    // apart BY NAME. Nameless lazy legs all looked like the same one, so a
    // strategy with three came back with one and the other references dangled.
    leg.customName = String(raw?.leg_name || fileId);
    lazyByFileId.set(String(fileId), leg);
    return leg;
  });

  config.legs = [...mainLegs, ...lazyLegs];

  // Second pass: '@nextleg:<file id>' becomes 'lazy_leg_<our id>'.
  //
  // A reference the file cannot satisfy used to refuse the whole import. It no
  // longer does: files written before this app stopped emitting such references
  // are out there, and refusing them makes those portfolios unopenable for
  // good. The re-entry falls back to the plain one it would otherwise be, and
  // the user is told which leg lost its lazy leg — never silently.
  config.legs.forEach((leg, index) => {
    ['reentry_sl_mode', 'reentry_tgt_mode'].forEach((field) => {
      const value = leg[field];
      if (typeof value !== 'string' || !value.startsWith(REF_PREFIX)) return;
      const target = lazyByFileId.get(value.slice(REF_PREFIX.length));
      if (target) {
        leg[field] = `lazy_leg_${target.id}`;
        return;
      }
      leg[field] = 're_asap';
      const which = field === 'reentry_sl_mode' ? 'on SL' : 'on target';
      warn(`Leg ${index + 1}'s re-entry ${which} pointed at a lazy leg this file does not contain — it was set to RE ASAP.`);
    });
  });

  // Anything the reference fields could not carry, if the file was written by
  // this app. Applied AFTER the standard fields, since it exists precisely to
  // say what they could not.
  applyExtras(config, file[EXTRAS_KEY], { nextLegId, lazyByFileId });

  const name = String(file.name || '').trim();
  return { ok: true, name, config, warnings };
};

/**
 * True when a parsed file is a SINGLE STRATEGY export, as opposed to a
 * portfolio one. The two share the .algtst extension, so what is inside is the
 * only way to tell them apart — and telling them apart is what lets each Import
 * refuse the other kind instead of silently doing the wrong thing.
 */
export const isStrategyFile = (parsed) =>
  Array.isArray(parsed?.strategy?.ListOfLegConfigs);

/** The raw JSON of a picked file, or null when it is not JSON at all. */
export const readJsonFile = async (file) => {
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
};

/**
 * Reads a picked File and parses it. Both Import buttons (the strategy bar and
 * the Portfolio toolbar) go through here, so the two cannot drift on what they
 * accept or on what a failure reads like.
 */
export const readAlgtstFile = async (file) => {
  try {
    return parseAlgtst(await file.text());
  } catch {
    return { ok: false, error: 'This file could not be read.' };
  }
};

/** Strips the extension so "Straddle_2026-09-23.algtst" reads as a name. */
export const nameFromFile = (fileName) =>
  String(fileName || '').replace(/\.algtst$/i, '').trim();
