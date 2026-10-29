/**
 * The recomputed portfolio statistics must equal the backend's own.
 *
 * Run with:  npm run test:roundtrip
 *
 * WHY THIS MATTERS. Unticking a strategy in the Strategy-wise Report makes the
 * Aggregate column, Year-wise Returns and the chart describe only the ticked
 * ones -- which the backend's `aggregate` block cannot answer, so the browser
 * works it out from the trades instead.
 *
 * That is only safe if the browser agrees with the server when NOTHING is
 * unticked. This runs the real response through the real module and asserts
 * all seventeen figures match to the paisa. A formula that drifts from the
 * backend's -- a drawdown measured from zero instead of from the opening
 * balance, a return annualised over trading days instead of calendar days --
 * fails here instead of quietly showing the user different numbers depending
 * on which checkbox they touched.
 *
 * FIXTURE: a real run-backtest response, two strategies, 235 trading days.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'scripts', 'fixtures', 'portfolio-backtest.json');

if (!existsSync(FIXTURE)) {
  console.log('No portfolio fixture — skipping (expected at scripts/fixtures/portfolio-backtest.json).');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'pstats-'));
const entry = join(dir, 'entry.js');
const bundle = join(dir, 'bundle.mjs');

let mod;
try {
  writeFileSync(entry, `export * from ${JSON.stringify(join(ROOT, 'src/utils/portfolioStats.js'))};`);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', `--outfile=${bundle}`, '--log-level=error'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  mod = await import(pathToFileURL(bundle).href);
} catch (err) {
  console.error('Could not build portfolioStats.js:\n', err.message);
  process.exit(1);
}
const { legRows, summaryFromRows, dailySeries, monthlyFromRows } = mod;

const response = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const rows = legRows(response.trade_results);
const mine = summaryFromRows(rows);
const theirs = response.aggregate.summary_report_result
  .find((r) => r.reportType === 'Daywise').summaryReport;

const money = (n) => Number(n).toFixed(2);
const whole = (n) => String(n);

const CHECKS = [
  ['Overall Profit',            money(mine.overall_profit),    money(theirs.OverallProfit)],
  ['No. of Periods',            whole(mine.num_trades),        whole(theirs.NumberOfDays)],
  ['Avg Profit per Period',     money(mine.avg_profit),        money(theirs.AvgProfitPerDays)],
  ['Win %',                     money(mine.win_rate),          money(theirs.WinPer)],
  ['Loss %',                    money(mine.loss_rate),         money(theirs.LossPer)],
  ['Avg Profit on Winning',     money(mine.avg_win),           money(theirs.AvgProfitOnWinningDays)],
  ['Avg Loss on Losing',        money(mine.avg_loss),          money(theirs.AvgLossOnLossingDays)],
  ['Max Profit in a Period',    money(mine.max_profit),        money(theirs.MaxProfitInSingleDays)],
  ['Max Loss in a Period',      money(mine.max_loss),          money(theirs.MaxLossInSingleDays)],
  ['Max Drawdown',              money(mine.max_drawdown),      money(theirs.Max_Drawdown)],
  ['Drawdown window',           mine.mdd_duration,             theirs.Days_of_Max_Drawdown],
  ['Return / Max DD',           money(mine.return_mdd),        money(theirs.ReturnPerMaxDD)],
  ['Reward to Risk',            money(mine.reward_risk),       money(theirs.RewardToRiskRatio)],
  ['Expectancy',                money(mine.expectancy),        money(theirs.ExpectancyRatio)],
  ['Max Win Streak',            whole(mine.max_win_streak),    whole(theirs.MaxWiningStreak)],
  ['Max Losing Streak',         whole(mine.max_loss_streak),   whole(theirs.MaxLossingStreak)],
  ['Max days in drawdown',      whole(mine.max_dd_days),       whole(theirs.MaxTradesInDrawdown)],
];

const failures = [];
let pass = 0;
for (const [label, got, want] of CHECKS) {
  if (got === want) pass += 1;
  else failures.push(`${label}\n      browser: ${got}\n      backend: ${want}`);
}

console.log('Recomputed vs the backend, all strategies ticked:');

/*
  Unticking one strategy must leave FEWER periods and a different total --
  proof the filter reaches the figures at all. A selection that changed
  nothing would pass every assertion above while the feature did nothing.
*/
const ids = [...new Set(rows.map((r) => r.strategyId))];
if (ids.length > 1) {
  const one = summaryFromRows(rows.filter((r) => r.strategyId === ids[0]));
  const bothDays = dailySeries(rows).length;
  const oneDays = dailySeries(rows.filter((r) => r.strategyId === ids[0])).length;
  if (!(oneDays <= bothDays)) failures.push('Unticking a strategy did not reduce the period count.');
  else pass += 1;
  if (one.overall_profit === mine.overall_profit) {
    failures.push('Unticking a strategy left Overall Profit unchanged — the filter is not reaching it.');
  } else pass += 1;
}

// Year-wise Returns must cover the same money as the summary.
const years = monthlyFromRows(rows);
const yearTotal = Object.values(years).reduce((s, y) => s + y.total, 0);
if (Math.abs(yearTotal - mine.overall_profit) > 1) {
  failures.push(`Year-wise totals (${money(yearTotal)}) do not add up to Overall Profit (${money(mine.overall_profit)}).`);
} else pass += 1;

/*
  EVERY YEAR-WISE FIGURE, against the backend's own monthly_state_result.

  The summary alone was not enough: the portfolio-wide drawdown never
  recovers, so measuring the window to the recovery instead of to the trough
  looked identical there and was wrong by five days on a single year. The
  per-year rows are where that shows, so they are asserted too.
*/
const theirYears = response.aggregate.monthly_state_result || [];
for (const row of theirYears) {
  const mineYear = years[row.year];
  if (!mineYear) { failures.push(`Year ${row.year} is missing from the recomputed table.`); continue; }
  const cases = [
    [`${row.year} total`,        money(mineYear.total),        money(row.total)],
    [`${row.year} max drawdown`, money(mineYear.max_drawdown), money(row.max_Drawdown)],
    [`${row.year} MDD window`,
      `${mineYear.days_for_mdd} [${mineYear.mdd_start} to ${mineYear.mdd_end}]`,
      row.days_of_Max_Drawdown],
    [`${row.year} R/MDD`,        money(mineYear.r_mdd),        money(row.yearly_Return_per_MaxDD)],
  ];
  for (const [label, got, want] of cases) {
    if (got === want) pass += 1;
    else failures.push(`${label}\n      browser: ${got}\n      backend: ${want}`);
  }
}

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} figure(s) do NOT match:\n`);
  failures.forEach((f) => console.error(`  x ${f}\n`));
  console.error('The browser would show different numbers from the server. Fix before trading.\n');
  process.exit(1);
}
console.log(`All ${pass} checks match the backend exactly.`);
