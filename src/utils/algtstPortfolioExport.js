import { buildAlgtstExport } from './algtstExport';
import { EXTRAS_KEY } from './algtstExtras';
import { decodeBackendStrategy } from './backendStrategyDecode';

/**
 * Writes a PORTFOLIO `.algtst` in the shape algtstPortfolio.js reads back.
 *
 * The hard part is `definition`: a portfolio row knows only which strategy it
 * points at, so export fetches each one from the backend and converts it.
 *
 * THIS DOES NOT DUPLICATE THE EXPORTER. It converts the backend's SPELLINGS
 * back to the builder's ('POINTS' -> 'points', 'OTM-2' -> 'otm_2') and hands
 * the result to buildAlgtstExport, which is the one place that knows the
 * file's vocabulary. Only the field mapping lives here.
 */

/**
 * The { definition, attributes, extras } for one strategy, from its backend
 * record — decoded by the SAME decoder the builder uses to open a strategy
 * (backendStrategyDecode), then encoded by the same exporter the builder's
 * Export button uses. Nothing strategy-shaped is mapped in this file any more:
 * its first version carried a hand-rolled subset of the decode and silently
 * dropped lazy and sequential legs from every portfolio export.
 */
export const definitionFromBackendStrategy = (data, strategyName) => {
  const config = decodeBackendStrategy(data, strategyName);
  const file = buildAlgtstExport(config, strategyName);
  return { definition: file.strategy, attributes: file.attributes, extras: file[EXTRAS_KEY] };
};

/** Our weekday keys -> the file's full day names. */
const FILE_WEEKDAY = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
};

const weekdaysForFile = (weekdays) => {
  const out = {};
  Object.entries(FILE_WEEKDAY).forEach(([ourKey, fileKey]) => {
    out[fileKey] = weekdays?.[ourKey] === true;
  });
  return out;
};

/**
 * Assembles the file.
 *
 * `rows` are the portfolio's strategy rows; `definitions` maps a row's index to
 * the { definition, attributes } that came back from its strategy. Ids are the
 * row's position, exactly as the reference file numbers them ("1", "2", …) —
 * they only have to agree between items and strategies within one file.
 */
export const buildPortfolioExport = ({ name, dteTab, rows, definitions }) => ({
  version: '0.7',
  data: {
    portfolio: {
      is_weekdays: dteTab === 'Weekdays',
      items: rows.map((row, index) => ({
        checked: row.selected !== false,
        dte: Array.isArray(row.selectedDTEs) ? row.selectedDTEs : [],
        id: String(index + 1),
        multiplier: Number(row.qty) > 0 ? Number(row.qty) : 1,
        weekdays: weekdaysForFile(row.weekdays),
      })),
      name,
    },
    strategies: Object.fromEntries(rows.map((row, index) => [
      String(index + 1),
      {
        attributes: definitions[index].attributes,
        definition: definitions[index].definition,
        name: row.name,
        // Whatever the reference fields cannot hold, same as a single export.
        ...(definitions[index].extras ? { [EXTRAS_KEY]: definitions[index].extras } : {}),
      },
    ])),
  },
});


