/**
 * Portfolio statistics, recomputed in the browser from trades.
 *
 * WHY THIS EXISTS. The Strategy-wise Report lets a strategy be unticked, and
 * everything downstream -- the Aggregate column, Year-wise Returns, the
 * cumulative chart, the Full Report -- must then describe only the strategies
 * still ticked. The backend's `aggregate` block answers for ALL of them, so
 * there is nothing to filter: it has to be worked out again from the trades.
 *
 * NOT BY ADDING UP THE PER-STRATEGY SUMMARIES. Overall Profit would survive
 * that, but Win %, Max Drawdown, the streaks and every ratio would not -- a
 * portfolio's drawdown is not the sum of its strategies' drawdowns, because
 * they do not all fall on the same day.
 *
 * Every formula here was checked against this backend's own aggregate for the
 * all-ticked case; see scripts/portfolioStats.test.mjs, which asserts the
 * recomputed numbers equal the ones the server sent.
 */

/** A finite number, or 0. Backend numbers arrive as strings. */
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** "2025-10-28 09:33:00" / "2025-10-28T09:33:00+05:30" -> "2025-10-28". */
export const dayOf = (value) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? '').trim());
  return m ? m[1] : '';
};

/**
 * Root trades -> one flat list of { day, pnl, strategyId } legs.
 *
 * The response carries trades at the root with each LEG naming its strategy,
 * so a trade can belong to several strategies at once. Splitting at the leg
 * is what makes "only the ticked strategies" answerable at all.
 */
export const legRows = (rootTrades = []) => {
  const rows = [];
  for (const trade of rootTrades) {
    const day = dayOf(trade?.trade_date || trade?.entry_datetime);
    if (!day) continue;
    for (const leg of trade?.legs || []) {
      rows.push({ day, pnl: num(leg?.pnl), strategyId: String(leg?.strategy_id ?? '') });
    }
  }
  return rows;
};

/**
 * One P/L per DAY, in date order.
 *
 * The report counts "Periods", not legs: a day is one observation however many
 * legs traded in it. Win % and both streaks are wrong by an order of magnitude
 * if legs are counted instead.
 */
export const dailySeries = (rows = []) => {
  const byDay = new Map();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) || 0) + r.pnl);
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([day, pnl]) => ({ day, pnl }));
};

/**
 * Running total and the drawdown from its own peak, per day.
 *
 * THE PEAK STARTS AT THE FIRST DAY'S TOTAL, not at zero. Starting from zero
 * treats an opening loss as drawdown, which it is not -- there was no high to
 * fall from. On this backend's own data that difference was ₹5.4 lakh of
 * invented drawdown, and it also counted the first day as a day spent below a
 * peak, overstating "Max days in any drawdown" by one.
 */
export const cumulativeSeries = (daily = []) => {
  let total = 0;
  let peak = null;
  return daily.map(({ day, pnl }) => {
    total += pnl;
    if (peak === null || total > peak) peak = total;
    return { day, pnl, cumulative: total, drawdown: total - peak };
  });
};

/** The longest run for which `test` holds. */
const longestRun = (items, test) => {
  let best = 0;
  let run = 0;
  for (const item of items) {
    if (test(item)) { run += 1; if (run > best) best = run; } else run = 0;
  }
  return best;
};

/**
 * Every figure the Strategy-wise Report shows, from a day series.
 *
 * Returns the SAME keys the table already reads, so the caller can hand this
 * to the existing rows unchanged.
 */
export const summaryFromRows = (rows = []) => {
  const daily = dailySeries(rows);
  const curve = cumulativeSeries(daily);

  const days = daily.length;
  const total = daily.reduce((sum, d) => sum + d.pnl, 0);
  const wins = daily.filter((d) => d.pnl > 0);
  const losses = daily.filter((d) => d.pnl < 0);

  const avgWin = wins.length ? wins.reduce((s, d) => s + d.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, d) => s + d.pnl, 0) / losses.length : 0;
  const winRate = days ? (wins.length / days) * 100 : 0;
  const lossRate = days ? (losses.length / days) * 100 : 0;

  // The deepest point below a previous peak, and the stretch it belongs to.
  let maxDrawdown = 0;
  let troughAt = -1;
  curve.forEach((p, i) => { if (p.drawdown < maxDrawdown) { maxDrawdown = p.drawdown; troughAt = i; } });

  let mddStart = null;
  let mddEnd = null;
  if (troughAt >= 0) {
    /*
      Back to the PEAK the fall started from -- one day further than the first
      day below it. The peak day is where the drawdown began, so the stretch
      is measured from there; stopping a day later reported 360 days from the
      29th where this backend says 361 from the 28th.
    */
    let i = troughAt;
    while (i > 0 && curve[i - 1].drawdown < 0) i -= 1;
    if (i > 0) i -= 1;
    mddStart = curve[i].day;
    /*
      THE TROUGH, not the recovery. The drawdown is measured to its deepest
      point; walking on to where the curve regained its peak reported a longer
      window than this backend does -- 14 days where it says 9, for the same
      fall. (The portfolio-wide case never recovers, so only the per-year
      figures exposed the difference.)
    */
    mddEnd = curve[troughAt].day;
  }

  /*
    ANNUALISED, as the report's own footnote says. The span is the calendar
    days BETWEEN the first and last trading day -- the elapsed time, not the
    count of dates, so no +1. (The Max Drawdown label below does count both
    ends, which is why the two differ by a day; both match this backend.)

    Trading days would be the wrong denominator: 235 of them over a year
    would overstate the annualised return by about a third.
  */
  const spanDays = daily.length
    ? Math.max(1, Math.round(
      (new Date(`${daily[daily.length - 1].day}T00:00:00`)
        - new Date(`${daily[0].day}T00:00:00`)) / 86400000,
    ))
    : 0;
  const years = spanDays ? spanDays / 365 : 0;
  const annualised = years ? total / years : 0;

  const absMaxDd = Math.abs(maxDrawdown);
  const absAvgLoss = Math.abs(avgLoss);

  return {
    overall_profit: total,
    num_trades: days,
    avg_profit: days ? total / days : 0,
    win_rate: winRate,
    loss_rate: lossRate,
    avg_win: avgWin,
    avg_loss: avgLoss,
    max_profit: daily.length ? Math.max(...daily.map((d) => d.pnl)) : 0,
    max_loss: daily.length ? Math.min(...daily.map((d) => d.pnl)) : 0,
    max_drawdown: maxDrawdown,
    mdd_duration: troughAt >= 0 && mddStart && mddEnd
      ? `${Math.round((new Date(`${mddEnd}T00:00:00`) - new Date(`${mddStart}T00:00:00`)) / 86400000) + 1}`
        + ` [${mddStart} to ${mddEnd}]`
      : '-',
    return_mdd: absMaxDd ? annualised / absMaxDd : 0,
    reward_risk: absAvgLoss ? Math.abs(avgWin) / absAvgLoss : 0,
    // (winRate*avgWin - lossRate*|avgLoss|) / |avgLoss|, rates as fractions.
    expectancy: absAvgLoss
      ? ((winRate / 100) * avgWin + (lossRate / 100) * avgLoss) / absAvgLoss
      : 0,
    max_win_streak: longestRun(daily, (d) => d.pnl > 0),
    max_loss_streak: longestRun(daily, (d) => d.pnl < 0),
    // Days spent below a previous peak, in the longest such stretch.
    max_dd_days: longestRun(curve, (p) => p.drawdown < 0),
  };
};

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Year-wise Returns, in the shape MonthlyStatsTable already renders.
 *
 * EACH YEAR IS MEASURED ON ITS OWN. The running total restarts at zero every
 * January and the peak resets with it, so a year's Max Drawdown is the worst
 * fall WITHIN that year -- which is what this backend reports and what the
 * column means. Carrying the portfolio-wide curve into each year instead
 * reported 2026's drawdown as -17.49 crore where the server says -14.75,
 * because the fall had begun the previous October.
 *
 * The window runs peak to TROUGH, and R/MDD is annualised over that year's
 * own span -- both as the summary does, and both verified against the
 * backend's monthly_state_result in scripts/portfolioStats.test.mjs.
 */
export const monthlyFromRows = (rows = []) => {
  const daily = dailySeries(rows);
  const byYear = new Map();
  for (const point of daily) {
    const year = point.day.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(point);
  }

  const years = {};
  for (const [year, points] of byYear) {
    const curve = cumulativeSeries(points);   // restarts at zero for this year

    const y = {
      ...Object.fromEntries(MONTH_KEYS.map((m) => [m, null])),
      total: 0,
      max_drawdown: 0,
      days_for_mdd: null,
      mdd_start: null,
      mdd_end: null,
      r_mdd: null,
    };

    for (const point of points) {
      const month = MONTH_KEYS[Number(point.day.slice(5, 7)) - 1];
      y[month] = (y[month] ?? 0) + point.pnl;
      y.total += point.pnl;
    }

    let worst = 0;
    let at = -1;
    curve.forEach((p, i) => { if (p.drawdown < worst) { worst = p.drawdown; at = i; } });
    y.max_drawdown = worst;

    if (at >= 0) {
      let i = at;
      while (i > 0 && curve[i - 1].drawdown < 0) i -= 1;
      if (i > 0) i -= 1;                       // the peak the fall started from
      y.mdd_start = curve[i].day;
      y.mdd_end = curve[at].day;               // the trough, not the recovery
      y.days_for_mdd = String(Math.round(
        (new Date(`${y.mdd_end}T00:00:00`) - new Date(`${y.mdd_start}T00:00:00`)) / 86400000,
      ) + 1);
    }

    const span = points.length > 1
      ? Math.max(1, Math.round(
        (new Date(`${points[points.length - 1].day}T00:00:00`)
          - new Date(`${points[0].day}T00:00:00`)) / 86400000,
      ))
      : 0;
    const annualYear = span ? y.total / (span / 365) : 0;
    y.r_mdd = worst ? annualYear / Math.abs(worst) : null;

    years[year] = y;
  }

  return years;
};
