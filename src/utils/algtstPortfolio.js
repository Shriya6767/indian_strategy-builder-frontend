import { parseStrategyJson } from './algtstImport';
import { EXTRAS_KEY } from './algtstExtras';

/**
 * Reads a PORTFOLIO `.algtst`, in the reference product's shape:
 *   { version, data: { portfolio: { name, is_weekdays, items[] },
 *                      strategies: { "<id>": { name, attributes, definition } } } }
 *
 * `items[].id` keys into `strategies`, and each `definition` is exactly the
 * block a single-strategy export puts under `strategy` -- so they are mapped
 * by the very same parseStrategyJson, gates and all.
 *
 * Portfolio and strategy files share the .algtst extension, which is why
 * isPortfolioFile exists: the contents are the only way to tell them apart.
 */

const SUPPORTED_VERSIONS = ['0.7'];

/** Our weekday keys, in the order the portfolio table draws them. */
const WEEKDAY_KEY = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
};

export const isPortfolioFile = (json) =>
  !!(json && typeof json === 'object' && json.data?.portfolio && json.data?.strategies);

/** { monday: true, … } -> { mon: true, … }; unknown days are ignored. */
const weekdaysFromFile = (weekdays) => {
  const out = {};
  Object.entries(WEEKDAY_KEY).forEach(([fileKey, ourKey]) => {
    out[ourKey] = weekdays?.[fileKey] === true;
  });
  return out;
};

/**
 * Parses a portfolio file into everything the import needs:
 *   { ok, error, name, dteTab, strategies: [{ name, config, selected, qty, weekdays, selectedDTEs }] }
 * Never throws — a bad file is a message, not an exception.
 */
export const parsePortfolioFile = (json) => {
  const invalid = 'File upload failed due to tampering. Please import a valid file.';
  const warnings = [];

  if (!isPortfolioFile(json)) return { ok: false, error: invalid };

  const version = String(json.version ?? '').trim();
  if (!version || !SUPPORTED_VERSIONS.includes(version)) {
    return {
      ok: false,
      error: `This file is version ${version || 'unknown'}; this app reads version ${SUPPORTED_VERSIONS.join(', ')}.`,
    };
  }

  const { portfolio, strategies } = json.data;
  const name = String(portfolio.name || '').trim();
  if (!name) return { ok: false, error: 'This portfolio file has no name in it.' };

  const items = Array.isArray(portfolio.items) ? portfolio.items : [];
  if (items.length === 0) {
    return { ok: false, error: 'This portfolio has no strategies in it, so there is nothing to import.' };
  }

  const parsed = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const entry = strategies[String(item?.id)];
    if (!entry?.definition) {
      return { ok: false, error: `The file is missing the strategy for row ${i + 1}.` };
    }

    // Same mapper, same refusals (index, leg vocabulary, lazy legs) as a
    // single-strategy import; its message already names what it could not take.
    const strategy = parseStrategyJson({
      version,
      name: entry.name,
      strategy: entry.definition,
      attributes: entry.attributes,
      [EXTRAS_KEY]: entry[EXTRAS_KEY],
    });
    if (!strategy.ok) return { ok: false, error: strategy.error };
    (strategy.warnings || []).forEach((w) => warnings.push(`${entry.name}: ${w}`));

    parsed.push({
      name: String(entry.name || `Strategy ${i + 1}`).trim(),
      config: strategy.config,
      selected: item.checked !== false,
      qty: Number(item.multiplier) > 0 ? Number(item.multiplier) : 1,
      weekdays: weekdaysFromFile(item.weekdays),
      selectedDTEs: Array.isArray(item.dte) ? item.dte : [],
    });
  }

  return {
    ok: true,
    name,
    // The file records which period tab the portfolio was set up on.
    dteTab: portfolio.is_weekdays ? 'Weekdays' : 'DTE',
    strategies: parsed,
    warnings,
  };
};
