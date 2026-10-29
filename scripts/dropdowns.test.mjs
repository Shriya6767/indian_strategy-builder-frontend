/**
 * EVERY dropdown option in the builder, swept through save -> reopen.
 *
 * Run with:  npm run test:roundtrip   (this file runs after roundtrip.test.mjs)
 *
 * WHY THIS EXISTS, and why it is not just more cases in the other file:
 *
 * roundtrip.test.mjs checks lists that a person typed. That is exactly how the
 * "closest premium" bug happened -- the Strike Criteria control offers four
 * options, the guard's allow-list named three, and every leg saved with the
 * fourth reopened as "Based On Strike". A hand-written test could not catch a
 * hand-written list being wrong, because both were written from the same
 * mistaken memory.
 *
 * So this file does not contain a list of options. It READS THE <option>
 * VALUES OUT OF THE COMPONENT SOURCE and sweeps whatever it finds. Add an
 * option to a <select> and it is covered on the next run, with no second place
 * to remember.
 *
 * THE COVERAGE RULE: every dropdown found in the source must either be swept
 * here or be named in SKIP below with a reason. A new control that is neither
 * fails the run. That is what stops the next gap being silent.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => JSON.stringify(join(ROOT, p));

const ENTRY = `
  export { buildSaveStrategyPayload } from ${src('src/services/strategyApi.js')};
  export { decodeBackendStrategy } from ${src('src/utils/backendStrategyDecode.js')};
`;

const dir = mkdtempSync(join(tmpdir(), 'dropdowns-'));
const entry = join(dir, 'entry.js');
const bundle = join(dir, 'bundle.mjs');

let mod;
try {
  writeFileSync(entry, ENTRY);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', `--outfile=${bundle}`, '--log-level=error'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  mod = await import(pathToFileURL(bundle).href);
} catch (err) {
  console.error('Could not build the modules under test:\n', err.message);
  process.exit(1);
}
const { buildSaveStrategyPayload, decodeBackendStrategy } = mod;

/* ------------------------------------------------------------------ *
 * 1. Read every <select> out of the source
 * ------------------------------------------------------------------ */

const SOURCES = ['src/components/LegCard.jsx', 'src/components/StrategyBuilder.jsx'];

/** The state object a control writes to decides how it must be tested. */
const scopeOf = (bound) => {
  if (/^leg\./.test(bound) || /^currentLeg\./.test(bound)) return 'leg';
  if (/^config\./.test(bound)) return 'config';
  if (/^lazyLegConfig\./.test(bound)) return 'lazy';
  if (/^sequentialLegConfig\./.test(bound)) return 'sequential';
  return 'other';
};

const controls = new Map();   // `${scope}.${field}` -> { scope, field, options:Set }
/** Selects whose bound field this script could not read — never ignored. */
const unreadable = [];

for (const file of SOURCES) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const m of text.matchAll(/<select\b/g)) {
    const window = text.slice(m.index, m.index + 2600);
    const end = window.indexOf('</select>');
    if (end < 0) continue;
    const seg = window.slice(0, end);

    const options = [...seg.matchAll(/<option value="([^"]*)"/g)].map((o) => o[1]);
    if (!options.length) continue;

    /*
      `value={leg.target_mode || 'points'}` -> leg.target_mode

      A control whose binding cannot be read is RECORDED, not skipped. Dropping
      it quietly is how this file would lie: it would report a clean sweep while
      two re-entry dropdowns were never tested at all, which is exactly the
      shape of bug it was written to catch.
    */
    // The whole `value={...}` expression, matched by counting braces. A lazy
    // regex stops at the first `}`, which for these controls is the end of an
    // inner object or template, not the end of the attribute.
    const valueExpr = (() => {
      const at = seg.indexOf('value={');
      if (at < 0) return '';
      let depth = 0;
      for (let i = at + 'value='.length; i < seg.length; i += 1) {
        if (seg[i] === '{') depth += 1;
        else if (seg[i] === '}') {
          depth -= 1;
          if (depth === 0) return seg.slice(at + 'value={'.length, i);
        }
      }
      return '';
    })();
    // Plain `value={leg.target_mode || 'points'}` first; failing that, the
    // first state path anywhere in the expression, which is what finds the
    // re-entry controls -- they open with a ternary testing for 'lazy_leg'.
    const path = (/^\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)+)/.exec(valueExpr)
      || /\b(leg|currentLeg|config|lazyLegConfig|sequentialLegConfig|uiRangeDraft)\.(\w+)/
        .exec(valueExpr))?.slice(1).join('.');

    if (!path) {
      const line = text.slice(0, m.index).split('\n').length;
      unreadable.push(`${file}:${line}  options: ${JSON.stringify(options)}`);
      continue;
    }
    const field = path.split('.').pop();
    const scope = scopeOf(path);
    const key = `${scope}.${field}`;

    if (!controls.has(key)) controls.set(key, { scope, field, options: new Set() });
    options.forEach((o) => controls.get(key).options.add(o));
  }
}

/* ------------------------------------------------------------------ *
 * 2. Controls that cannot be swept, each with the reason
 * ------------------------------------------------------------------ */

const SKIP = {
  'other.range_end_day':
    'uiRangeDraft — a local draft in the Range Breakout popup, not part of config.',
  'lazy.position': 'Lazy-leg MODAL DRAFT. It is copied into a real leg on save, and the '
    + 'leg it produces is swept under its own scope.',
  'sequential.position': 'Sequential-leg modal draft; same reason as the lazy draft.',
  'config.positional_expiry':
    'Positional entry/exit expiry. Carried in the indicator tree, not as a leg or '
    + 'strategy enum, so the save/decode sweep below cannot express it.',
};
// The draft scopes are skipped wholesale — one reason covers each control.
const SKIP_SCOPES = { lazy: SKIP['lazy.position'], sequential: SKIP['sequential.position'] };

/* ------------------------------------------------------------------ *
 * 3. What each field needs switched on before its value is sent
 * ------------------------------------------------------------------ */

const ENABLERS = {
  target_mode:      { target_enabled: true, target_value: '10' },
  stop_loss_mode:   { stop_loss_enabled: true, stop_loss_value: '10' },
  trail_mode:       { stop_loss_enabled: true, stop_loss_mode: 'points', stop_loss_value: '10',
                      trail_enabled: true, trail_value: '5', trail_lock_value: '2' },
  momentum_mode:    { momentum_enabled: true, momentum_value: '25' },
  reentry_sl_mode:  { stop_loss_enabled: true, stop_loss_mode: 'points', stop_loss_value: '10',
                      reentry_sl_enabled: true, reentry_sl_count: '2' },
  reentry_tgt_mode: { target_enabled: true, target_mode: 'points', target_value: '10',
                      reentry_tgt_enabled: true, reentry_tgt_count: '2' },
  range_instrument: { range_enabled: true, range_time: '09:45', range_direction: 'high' },
  range_end_day:    { range_enabled: true, range_time: '09:45', range_direction: 'high' },
  atm_percent_direction: { strike_criteria: 'based on atm percent', atm_percent_value: '2' },
  strike_criteria:  { atm_percent_value: '2', closest_premium_value: '100',
                      lower_range: '50', upper_range: '150' },

  overall_stop_loss_mode:   { overall_stop_loss_enabled: true, overall_stop_loss_value: '100' },
  overall_target_mode:      { overall_target_enabled: true, overall_target_value: '100' },
  overall_reentry_sl_mode:  { overall_stop_loss_enabled: true, overall_stop_loss_mode: 'mtm',
                              overall_stop_loss_value: '100',
                              overall_reentry_sl_enabled: true, overall_reentry_sl_count: '2' },
  overall_reentry_tgt_mode: { overall_target_enabled: true, overall_target_mode: 'mtm',
                              overall_target_value: '100',
                              overall_reentry_tgt_enabled: true, overall_reentry_tgt_count: '2' },
  lock_profit_mode:         { lock_profit_enabled: true, lock_profit_value: '100',
                              lock_profit_reach: '50' },
};

/** Options that are a UI sentinel rather than a storable value. */
const SENTINELS = {
  reentry_sl_mode: ['lazy_leg'],
  reentry_tgt_mode: ['lazy_leg'],
};

/**
 * Fields whose control only exists under a particular strategy type.
 *
 * Range Breakout's end-day is Today/Tomorrow on a BTST strategy and a DTE
 * number on a positional one; an intraday strategy has no such field and the
 * payload sends null for it. Sweeping it as intraday asked for a value the
 * app is right not to send.
 */
const STRATEGY_FOR_FIELD = {
  range_end_day: { strategy_type: 'btst' },
};

/* ------------------------------------------------------------------ *
 * 4. Sweep
 * ------------------------------------------------------------------ */

const STRATEGY = {
  strategy_name: 'dropdowns', symbol: 'sensex', dte_filter: 'sensex',
  strategy_type: 'intraday', entry_time: '09:16', exit_time: '15:30',
  start_date: '2024-01-01', end_date: '2026-10-23',
};
const LEG = {
  id: 1, lots: '1', position: 'sell', option_type: 'call',
  expiry: 'weekly', strike_type: 'atm', strike_criteria: 'based on points',
};

const roundTrip = (legExtra, strategyExtra = {}) => {
  const payload = buildSaveStrategyPayload(
    { ...STRATEGY, ...strategyExtra, legs: [{ ...LEG, ...legExtra }] }, 1,
  );
  const back = decodeBackendStrategy({ strategy: payload.strategy, legs: payload.legs }, 'dropdowns');
  return { leg: back.legs[0], config: back };
};

let pass = 0;
const failures = [];
const swept = [];
const skipped = [];

for (const [key, { scope, field, options }] of [...controls].sort()) {
  const reason = SKIP[key] || SKIP_SCOPES[scope];
  if (reason) { skipped.push([key, reason]); continue; }
  if (scope === 'other') {
    failures.push(`${key}\n      This control is not swept and not listed in SKIP.\n`
      + '      Add it to the sweep, or to SKIP with the reason it cannot be.');
    continue;
  }

  const base = ENABLERS[field] || {};
  const sentinels = SENTINELS[field] || [];
  const values = [...options].filter((o) => !sentinels.includes(o));

  for (const value of values) {
    let got;
    try {
      const strategyExtra = STRATEGY_FOR_FIELD[field] || {};
      got = scope === 'config'
        ? roundTrip({}, { ...strategyExtra, ...base, [field]: value }).config[field]
        : roundTrip({ ...base, [field]: value }, strategyExtra).leg[field];
    } catch (err) {
      failures.push(`${key} = ${JSON.stringify(value)}\n      threw: ${err.message}`);
      continue;
    }
    if (got === value) { pass += 1; continue; }
    failures.push(`${key} = ${JSON.stringify(value)}\n`
      + `      saved: ${JSON.stringify(value)}\n      shown: ${JSON.stringify(got)}`);
  }
  swept.push(`${key} (${values.length})`);
}

rmSync(dir, { recursive: true, force: true });

console.log(`Read ${controls.size} distinct dropdowns out of the component source.\n`);
console.log('Swept:');
swept.forEach((s) => console.log(`  ${s}`));
if (skipped.length) {
  console.log('\nNot swept, by declaration:');
  skipped.forEach(([k, r]) => console.log(`  ${k}\n    ${r}`));
}

if (unreadable.length) {
  console.error(`\n${unreadable.length} dropdown(s) whose bound field could not be read:\n`);
  unreadable.forEach((u) => console.error(`  ? ${u}`));
  console.error('\nThese are NOT covered. Teach the extractor to read them, or bind them\n'
    + 'the way the others are, so they cannot go untested in silence.\n');
}

if (failures.length || unreadable.length) {
  if (failures.length) console.error(`\n${failures.length} dropdown value(s) do NOT survive save -> reopen:\n`);
  failures.forEach((f) => console.error(`  x ${f}\n`));
  console.error('A control will show the wrong value for these. Fix before trading.\n');
  process.exit(1);
}
console.log(`\nAll ${pass} dropdown values survive save -> reopen unchanged.`);
