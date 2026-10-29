/**
 * ONE status vocabulary: what each deployment state is CALLED and its colour.
 *
 * Shared by the Deployed rows and the View Trades strip. They had separate
 * copies and drifted -- the board drew SQUARED OFF in blue while the detail
 * page drew it grey.
 *
 * A plain .js module, not an export on DeployedRow.jsx: a file exporting both
 * components and constants loses fast refresh for the components.
 */
import { MUTED, DANGER, SOFT_BG, COUNT_BG, COUNT_TEXT } from './palette';

/** Spelled out, not abbreviated: SQD OFF had to be decoded. */
export const STATUS_LABELS = {
  squared_off: 'SQUARED OFF',
  sq_off: 'SQUARED OFF',
};

/**
 * One colour per state, so a glance down the column separates them without
 * reading a word.
 *
 * Everything that CLOSED ITS POSITIONS -- squared off, completed, and a
 * scheduled restart waiting to begin -- shares the countdown pill's blue, from
 * the same two tokens it uses, because the reference draws them identically.
 *
 * CANCELLED is grey, not blue, and that difference is the point: the others
 * ran and finished, a cancelled deployment never ran at all. Grey reads as
 * "nothing happened here", which is exactly what it means.
 */
export const STATUS_TONES = {
  running: { color: '#008537', backgroundColor: '#E6F3EB' },   // green
  completed: { color: COUNT_TEXT, backgroundColor: COUNT_BG },
  squared_off: { color: COUNT_TEXT, backgroundColor: COUNT_BG },
  sq_off: { color: COUNT_TEXT, backgroundColor: COUNT_BG },
  scheduled: { color: COUNT_TEXT, backgroundColor: COUNT_BG },
  cancelled: { color: MUTED, backgroundColor: SOFT_BG },       // grey on grey
  paused: { color: '#9A6700', backgroundColor: '#FBF6EE' },    // amber
  error: { color: DANGER, backgroundColor: '#FBF3F3' },        // red
  failed: { color: DANGER, backgroundColor: '#FBF3F3' },
  default: { color: MUTED, backgroundColor: SOFT_BG },
};

/** The chip's colours for a state, falling back to neutral grey. */
export const toneFor = (state) => STATUS_TONES[String(state || '').toLowerCase()]
  || STATUS_TONES.default;

/** The chip's words for a state: "squared_off" -> "SQUARED OFF". */
export const labelFor = (state) => {
  const key = String(state || '').toLowerCase();
  return STATUS_LABELS[key] || (key || 'unknown').toUpperCase().replace(/_/g, ' ');
};
