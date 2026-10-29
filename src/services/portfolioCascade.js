import { fetchPortfolios } from './libraryApi';
import { buildSavePortfolioPayload, savePortfolio } from './portfolioApi';
import { deletePortfolioAPI } from './api';
import logger from '../utils/logger';

/**
 * What deleting a strategy does to the portfolios that hold it.
 *
 * A portfolio keeps a list of strategies. Delete one and every list naming it
 * is left pointing at something the backend no longer has -- which fails the
 * moment that portfolio is backtested. This removes it, and deletes the
 * portfolio outright when it was the only strategy in it.
 *
 * WHY THIS LIVES HERE and not in the delete handler: it is four endpoints and
 * an ordering rule, and the next screen that deletes a strategy must do
 * exactly the same thing rather than reinvent half of it.
 */

const normalise = (name) => String(name || '').trim().toLowerCase();

/** Does this portfolio row refer to the strategy being deleted? */
const isTheOne = (entry, { id, name }) => {
  const rowId = entry?.strategy_id ?? entry?.id;
  if (id != null && rowId != null && String(rowId) === String(id)) return true;
  const rowName = normalise(entry?.strategy_name || entry?.name);
  return Boolean(name) && rowName === normalise(name);
};

/**
 * The portfolios holding this strategy, each with what would be left.
 *
 * Pure, so the warning the dialog shows and the work that follows are decided
 * by the same function rather than two readings of the same list.
 */
export const findAffected = (portfolios = [], target = {}) => portfolios
  .map((p) => {
    const list = Array.isArray(p?.strategies) ? p.strategies : [];
    const remaining = list.filter((e) => !isTheOne(e, target));
    return remaining.length === list.length ? null : { portfolio: p, remaining };
  })
  .filter(Boolean);

/**
 * The line added under "You will not have access to this strategy anymore."
 * Null when the strategy is in no portfolio -- then the dialog says nothing
 * extra, because there is nothing extra to warn about.
 */
export const impactMessage = (affected = [], strategyName = '') => {
  if (affected.length === 0) return null;

  const emptied = affected.filter((a) => a.remaining.length === 0);
  const reduced = affected.length - emptied.length;
  const parts = [];

  if (reduced > 0) {
    parts.push(`It will also be removed from ${reduced} portfolio${reduced === 1 ? '' : 's'}.`);
  }
  if (emptied.length === 1) {
    parts.push(`Portfolio "${emptied[0].portfolio.name}" will be deleted — ${strategyName} is its only strategy.`);
  } else if (emptied.length > 1) {
    const names = emptied.map((a) => `"${a.portfolio.name}"`).join(', ');
    parts.push(`Portfolios ${names} will be deleted — ${strategyName} is the only strategy in each.`);
  }
  return parts.join(' ');
};

/** GET /api/portfolios, fresh. Never throws: see the caller's note. */
export const loadPortfolios = async () => {
  try {
    return await fetchPortfolios();
  } catch (err) {
    logger.error('[cascade] could not read the portfolios:', err);
    return null;          // null means "unknown", which is NOT the same as []
  }
};

/**
 * Apply the cascade. Call this only AFTER the strategy itself is gone --
 * stripping it out of portfolios first would, on a failed delete, leave the
 * strategy alive and the portfolios already edited.
 *
 * Each portfolio is handled on its own and a failure does not stop the rest:
 * one that cannot be updated is worse company for the others than for itself.
 * Returns what actually happened, so the caller can say so.
 */
export const applyCascade = async (affected = []) => {
  const updated = [];
  const deleted = [];
  const failed = [];

  for (const { portfolio, remaining } of affected) {
    try {
      if (remaining.length === 0) {
        await deletePortfolioAPI(portfolio.id);
        deleted.push(portfolio.name);
      } else {
        /*
          portfolio_id IS THE WHOLE POINT. save-portfolio is an upsert: with
          the id it updates, without it creates. Omit it here and the user
          ends up with a second portfolio under the same name, one holding the
          old list -- and the response is a success either way.

          The rest comes off `raw`, the server's own row, so settings this
          screen never loaded are not quietly reset to defaults.
        */
        const raw = portfolio.raw || {};
        await savePortfolio(buildSavePortfolioPayload({
          portfolioId: portfolio.id,
          portfolioName: portfolio.name,
          index: raw.index,
          qtyMultiplier: raw.qty_multiplier,
          slippage: raw.slippage,
          period: raw.period_selection,
          strategies: remaining,
        }));
        updated.push(portfolio.name);
      }
    } catch (err) {
      logger.error(`[cascade] portfolio "${portfolio.name}" could not be updated:`, err);
      failed.push(portfolio.name);
    }
  }

  return { updated, deleted, failed };
};
