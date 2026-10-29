/**
 * Save -> backend shape -> decode -> what the dropdown shows.
 *
 * Run with:  npm run test:roundtrip
 *
 * WHY THIS EXISTS. Every enum in this app is written in two places and read in
 * a third: buildSaveStrategyPayload maps the UI value to a backend one,
 * StrategyBuilder's own buildLegObject does the same for backtests, and
 * backendStrategyDecode maps it back. Change one and the others still compile,
 * still run, and still render -- a <select> handed a value matching no option
 * silently draws its FIRST option. So the strategy reopens showing Points when
 * it was saved as Percent, with nothing logged and nothing on screen.
 *
 * That is a money bug, and it cannot be caught by reading the code. This sweeps
 * every option of every dropdown through the real modules and fails on any that
 * does not come back as itself.
 *
 * ADDING AN OPTION TO A DROPDOWN? Add it to src/utils/decodeGuards.js and it is
 * covered here automatically.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => JSON.stringify(join(ROOT, p));

// Absolute paths: the entry file is written to a temp directory, so anything
// relative would resolve against /tmp rather than the project.
const ENTRY = `
  export { buildSaveStrategyPayload } from ${src('src/services/strategyApi.js')};
  export { decodeBackendStrategy } from ${src('src/utils/backendStrategyDecode.js')};
  export * from ${src('src/utils/decodeGuards.js')};
`;

const dir = mkdtempSync(join(tmpdir(), 'roundtrip-'));
const entry = join(dir, 'entry.js');
const bundle = join(dir, 'bundle.mjs');

let mod;
try {
  // The real source, bundled the way Vite resolves it. Importing the files
  // directly would fail on the import graph and on Vite-only syntax.
  writeFileSync(entry, ENTRY);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', `--outfile=${bundle}`, '--log-level=error'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  mod = await import(pathToFileURL(bundle).href);
} catch (err) {
  console.error('Could not build the modules under test:\n', err.message);
  process.exit(1);
}

const {
  buildSaveStrategyPayload, decodeBackendStrategy,
  LEG_UNITS, TRAIL_UNITS, MOMENTUM_MODES, OVERALL_UNITS,
} = mod;

let pass = 0;
const failures = [];
const check = (got, want, what) => {
  if (got === want) { pass += 1; return; }
  failures.push(`${what}\n      saved: ${JSON.stringify(want)}\n      shown: ${JSON.stringify(got)}`);
};

const STRATEGY = {
  strategy_name: 'roundtrip', symbol: 'sensex', dte_filter: 'sensex',
  strategy_type: 'intraday', entry_time: '09:16', exit_time: '15:30',
  start_date: '2024-01-01', end_date: '2026-10-23',
};
const LEG = {
  id: 1, lots: '1', position: 'sell', option_type: 'call',
  expiry: 'weekly', strike_type: 'atm',
  // "Based On Strike" in the UI. Spelled exactly as the <option> value, which
  // is what decides whether the payload carries atm_strike at all -- anything
  // else and the strike is sent as null and reopens as ATM.
  strike_criteria: 'based on points',
};

/** One leg through save -> decode, returned as the builder would see it. */
const trip = (legExtra, strategyExtra = {}) => {
  const payload = buildSaveStrategyPayload(
    { ...STRATEGY, ...strategyExtra, legs: [{ ...LEG, ...legExtra }] }, 1,
  );
  const back = decodeBackendStrategy({ strategy: payload.strategy, legs: payload.legs }, 'roundtrip');
  return { leg: back.legs[0], config: back };
};

/*
  SAVED TWICE. Reopening a strategy and saving it again is the ordinary way to
  edit one, and it is where a decode fallback does its damage: the first save
  is fine, the reopen quietly substitutes a value no control offers, and the
  SECOND save writes that substitute to the database. An ITM strike became ATM
  exactly this way, and a "closest premium" leg became "Based On Strike".
*/
const twice = (legExtra) => {
  const once = trip(legExtra).leg;
  const payload = buildSaveStrategyPayload({ ...STRATEGY, legs: [once] }, 1);
  return decodeBackendStrategy({ strategy: payload.strategy, legs: payload.legs }, 'roundtrip').legs[0];
};

console.log('Target unit');
for (const u of LEG_UNITS) {
  check(trip({ target_enabled: true, target_mode: u, target_value: '10' }).leg.target_mode, u, `target = ${u}`);
}

console.log('Stop loss unit');
for (const u of LEG_UNITS) {
  check(trip({ stop_loss_enabled: true, stop_loss_mode: u, stop_loss_value: '10' }).leg.stop_loss_mode, u, `stop loss = ${u}`);
}

console.log('Trail SL unit');
for (const u of TRAIL_UNITS) {
  check(trip({
    stop_loss_enabled: true, stop_loss_mode: 'points', stop_loss_value: '10',
    trail_enabled: true, trail_mode: u, trail_value: '5', trail_lock_value: '2',
  }).leg.trail_mode, u, `trail = ${u}`);
}

console.log('Simple Momentum unit');
for (const m of MOMENTUM_MODES) {
  check(trip({ momentum_enabled: true, momentum_mode: m, momentum_value: '25' }).leg.momentum_mode, m, `momentum = ${m}`);
}

console.log('Re-entry on SL / Target');
for (const r of ['re_asap', 're_asap_reverse', 're_momentum', 're_momentum_reverse', 're_cost', 're_cost_reverse']) {
  check(trip({
    stop_loss_enabled: true, stop_loss_mode: 'points', stop_loss_value: '10',
    reentry_sl_enabled: true, reentry_sl_mode: r, reentry_sl_count: '2',
  }).leg.reentry_sl_mode, r, `re-entry on SL = ${r}`);
  check(trip({
    target_enabled: true, target_mode: 'points', target_value: '10',
    reentry_tgt_enabled: true, reentry_tgt_mode: r, reentry_tgt_count: '2',
  }).leg.reentry_tgt_mode, r, `re-entry on target = ${r}`);
}

console.log('Overall SL / Target unit');
for (const u of OVERALL_UNITS) {
  check(trip({}, { overall_stop_loss_enabled: true, overall_stop_loss_mode: u, overall_stop_loss_value: '100' })
    .config.overall_stop_loss_mode, u, `overall stop loss = ${u}`);
  check(trip({}, { overall_target_enabled: true, overall_target_mode: u, overall_target_value: '100' })
    .config.overall_target_mode, u, `overall target = ${u}`);
}

console.log('Leg shape');
for (const p of ['buy', 'sell']) {
  check(trip({ position: p }).leg.position, p, `position = ${p}`);
}
for (const o of ['call', 'put']) {
  check(trip({ option_type: o }).leg.option_type, o, `option type = ${o}`);
}
for (const e of ['weekly', 'next_weekly', 'monthly', 'next_monthly']) {
  check(trip({ expiry: e }).leg.expiry, e, `expiry = ${e}`);
}
for (const s of ['atm', 'itm_3', 'otm_5']) {
  check(trip({ strike_type: s }).leg.strike_type, s, `strike = ${s}`);
}
/*
  ALL FOUR criteria the dropdown offers. "closest premium" was missing from
  the decode guard's allow-list at first, so a leg saved with it reopened as
  "Based On Strike" -- which then decides whether the next save sends
  premium_value or atm_strike. Every option the control offers belongs here.
*/
for (const c of ['based on points', 'based on atm percent', 'based on premium range', 'closest premium']) {
  const legExtra = { strike_criteria: c, atm_percent_value: '2', closest_premium_value: '100',
                     lower_range: '50', upper_range: '150' };
  check(trip(legExtra).leg.strike_criteria, c, `strike criteria = ${c}`);
  check(twice(legExtra).strike_criteria, c, `strike criteria ${c} survives a second save`);
}

/*
  SAVED TWICE. Reopening a strategy and saving it again is the ordinary way to
  edit one, and it is where a decode fallback does its damage: the first save
  is fine, the reopen quietly substitutes a value no control offers, and the
  SECOND save writes that substitute to the database. An ITM strike became ATM
  exactly this way. One trip proves the mapping; two prove it is stable.
*/
console.log('Saved, reopened, saved again');
for (const s of ['atm', 'itm_3', 'otm_5']) {
  check(twice({ strike_type: s }).strike_type, s, `strike ${s} survives a second save`);
}
for (const m of MOMENTUM_MODES) {
  check(twice({ momentum_enabled: true, momentum_mode: m, momentum_value: '25' }).momentum_mode,
    m, `momentum ${m} survives a second save`);
}
for (const u of LEG_UNITS) {
  check(twice({ target_enabled: true, target_mode: u, target_value: '10' }).target_mode,
    u, `target ${u} survives a second save`);
  check(twice({ stop_loss_enabled: true, stop_loss_mode: u, stop_loss_value: '10' }).stop_loss_mode,
    u, `stop loss ${u} survives a second save`);
}

/*
  A leg built by "Add Leg" spells its modes *_type, while the controls and the
  payload builders read *_mode. That mismatch is what made a points momentum
  save as PERCENT_DOWN, so it is pinned here: an unset mode must come back as
  points, never as a percent.
*/
console.log('A leg with no *_mode fields set at all');
check(trip({ momentum_enabled: true, momentum_type: 'points', momentum_value: '25' }).leg.momentum_mode,
  'points', 'momentum_type with no momentum_mode');
check(trip({ momentum_enabled: true, momentum_value: '25' }).leg.momentum_mode,
  'points', 'nothing set at all');

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} value(s) do NOT survive save -> reopen:\n`);
  failures.forEach((f) => console.error(`  x ${f}\n`));
  console.error('A dropdown will show the wrong unit for these. Fix before trading.\n');
  process.exit(1);
}
console.log(`\nAll ${pass} values survive save -> reopen unchanged.`);
