export { API_URL, BASE_URL } from "../services/api";

export const DEFAULT_SYMBOL      = 'sensex';
// 09:16 is the first tradable minute of the Indian session (see utils/timeRules).
export const DEFAULT_ENTRY_TIME  = '09:16';
export const DEFAULT_EXIT_TIME   = '15:30';
export const DEFAULT_LOT_SIZE    = 1;

// Backtest window shown on a fresh strategy (the user can change both).
// Stored as YYYY-MM-DD, which is the format config/payloads use; the Data
// Selection fields render them as DD / MM / YYYY.
export const DEFAULT_START_DATE = '2024-01-01';  // 01/01/2024
export const DEFAULT_END_DATE   = '2026-10-23';  // 23/10/2026

/**
 * The indexes this build supports. The Index dropdown renders from this list,
 * and the .algtst importer refuses a file for anything not in it — a file for
 * an index we do not offer used to load anyway, leaving the dropdown showing
 * SENSEX while the config carried the other ticker into every request.
 */
export const SUPPORTED_INDEXES = [
  { value: 'sensex', label: 'SENSEX' },
];

export const DTE_OPTIONS = [
  { value: '0', label: '0DTE' },
  { value: '1', label: '1DTE' },
];

export const STRATEGY_TYPES = [
  { id: 'intraday',   label: 'Intraday'   },
  { id: 'btst',       label: 'BTST'       },
  { id: 'positional', label: 'Positional' },
  { id: 'sequential', label: 'Sequential' },
];

export const MONTHS = [
  { value: '01', label: 'January'   },
  { value: '02', label: 'February'  },
  { value: '03', label: 'March'     },
  { value: '04', label: 'April'     },
  { value: '05', label: 'May'       },
  { value: '06', label: 'June'      },
  { value: '07', label: 'July'      },
  { value: '08', label: 'August'    },
  { value: '09', label: 'September' },
  { value: '10', label: 'October'   },
  { value: '11', label: 'November'  },
  { value: '12', label: 'December'  },
];

export const YEARS = ['2022', '2023', '2024', '2025','2026'];
