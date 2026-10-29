/**
 * src/components/algotrade/palette.js
 *
 * The Algo Trade screens' colours, in one place so the main view, the Pro view
 * and the broker screens cannot drift apart. Values are read off the reference
 * product; see the comments for what each one dresses.
 */
export const INK = '#3A3A3A';          // headings, values, button text
export const MUTED = '#6B7280';        // column labels, placeholders
export const BORDER = '#E3E3E3';       // control and table borders
export const RULE = '#E5E7EB';         // hairlines beside section headings
export const BLUE = '#0782DA';         // links and the selected tab
export const BLUE_TINT = '#ECF6FF';    // hover tints, dialog segments
export const TINT_SELECTED = '#D9EDFF';
export const DEEP = '#0C4A6E';         // solid Activate, outlined Setup Execution
export const ACTIVATE_HOVER = '#3D6E8B';
export const NAVY = '#0C4A6E';
// The app's own theme blue — what a primary button in the execution dialog
// rests at before hovering to ACTIVATE_HOVER.
export const THEME = '#0B619B';
export const CARD_BLUE = '#EAF5FD';    // the MTM card's fill
export const CARD_EDGE = '#9EC9EC';    // the MTM card's border
export const HEAD_BG = '#F8F8F8';      // table header fill (sampled)
export const GREEN = '#008537';        // MTM amount
export const PENDING_BG = '#F5EFE7';
export const PENDING_EDGE = '#9C6011'; // border and label share this brown-amber
export const PENDING_TEXT = '#9C6011';
export const SOFT_BG = '#F5F5F5';      // grey marker chips (sampled)
export const DANGER = '#DC2626';       // validation toasts

/** The shared outlined-control look: white fill, soft border, 13px label. */
export const PILL =
  'inline-flex items-center gap-1.5 h-[27px] px-2.5 rounded-md border text-[12px] whitespace-nowrap bg-white';

export const READONLY_WARN = '#7D4D0E';
export const WARN_EDGE = '#F0A6A6';
export const WARN_TEXT = '#D32F2F';
export const TOGGLE_OFF = '#808080';

export const fillOnHover = {
  onMouseEnter: (e) => {
    e.currentTarget.style.backgroundColor = THEME;
    e.currentTarget.style.borderColor = THEME;
    e.currentTarget.style.color = '#FFFFFF';
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.backgroundColor = '#FFFFFF';
    e.currentTarget.style.borderColor = BORDER;
    e.currentTarget.style.color = DEEP;
  },
};

export const COUNT_BG = BLUE_TINT;
export const COUNT_TEXT = BLUE;

export const NOTICE_TEXT = '#4A6377';
