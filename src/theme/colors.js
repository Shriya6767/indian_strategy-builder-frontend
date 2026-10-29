/**
 * Centralised values for the colours that were hardcoded as inline styles.
 *
 * SCOPE: only the files that actually had them -- StrategyBuilder, LegCard,
 * TimeSegmentInput, DateSegmentInput, ToggleSwitch, Tooltip. The rest of the
 * UI is styled with Tailwind utilities and has no hex to migrate.
 *
 * Every value below was verified against its real usage; see each entry.
 */

export const colors = {
  // Primary brand blue. Used for: active/selected toggle buttons (buy/sell,
  // call/put, NSE/BSE, square-off type, strategy type, range direction),
  // section heading text + icon color, and the default "Add Leg" / lazy-leg
  // buttons. 41 occurrences in StrategyBuilder.jsx, several in LegCard.jsx,
  // and TimeSegmentInput.jsx's local THEME_COLOR constant.
  primary: {
    main: '#4682b4',

    // Lighter blue used for the active-segment highlight / focus ring in
    // DateSegmentInput.jsx (day/month/year segment selection).
    hover: '#60a5fa',

    // The two stops of the "toggle ON" gradient in ToggleSwitch.jsx
    // (background: linear-gradient(135deg, gradientStart 0%, gradientEnd 100%)).
    // gradientStart's RGB (7, 130, 218) is also reused directly as the glow
    // shadow color at different opacities — see toggleSwitch.glowStrong/glowSoft,
    // which must be kept in step with this value.
    // Both stops equal, so the "gradient" renders as a solid fill.
    //
    // AlgoTest --secondaryBlue-500, read off their Strategy Builder's own
    // design tokens. This was #2196F3 — Material Blue 500, which is not an
    // AlgoTest colour at all: the Algo Trade toggle (algotrade/Toggle.jsx) was
    // already on #0782DA, so the two switches in this product disagreed on
    // their ON colour while already agreeing on OFF (#808080).
    gradientStart: '#0782DA',
    gradientEnd: '#0782DA',
  },

  // Page background for the Strategy Builder page (StrategyBuilder.jsx).
  // AlgoTest grey — the white settings cards stand out against it, so the
  // card borders can stay soft.
  page: {
    background: '#FAFAFA',  // AlgoTest --primaryBlack-50 (exact, from their compiled CSS)
  },

  // "Save Strategy" outline button in StrategyBuilder.jsx. Colors are set via
  // onMouseEnter/onMouseLeave DOM style mutation (not React state), so these
  // constants get referenced directly inside those handlers.
  saveButton: {
    enabled: '#0782DA',           // border + text — AlgoTest --secondaryBlue-500
    disabled: '#9ca3af',          // border + text color when disabled
    hoverBackground: '#0064AB',   // hover fill — AlgoTest --secondaryBlue-600 (text turns white)
  },

  // Bottom action bar, matched to AlgoTest.
  // AlgoTest uses ONE filled primary plus outline secondaries whose label is
  // DARK, not the bright blue this app used. Which button is primary depends on
  // state: a fresh strategy shows an outline "Save Strategy"; once a saved
  // strategy is open that button becomes the filled "Update".
  actionBar: {
    primaryBg: '#0C4A6E',        // "Update" resting fill
    primaryHoverBg: '#0A3D5C',   // "Update" hover — a shade darker
    secondaryText: '#0C4A6E',    // outline-button label — the UI navy, as AlgoTest's read
    // Outline-button border. AlgoTest's action-bar buttons (Update, Save As
    // New, Compare Backtest) are outlined in the SAME navy as their label --
    // border 1px solid rgb(12,74,110) -- not a neutral grey. This was #d0d5dd,
    // which read as a faint grey outline against their crisp navy one.
    secondaryBorder: '#0C4A6E',
    secondaryHoverBg: '#0C4A6E', // outline buttons fill navy (white label) on hover

    /*
      "Recent Backtests" is the ONE GREEN outline button in this bar.

      AlgoTest draws it in the same green as the Backtest button beside it --
      green label, green border, and on hover/press it fills that green with a
      white label. Save As New and Update Portfolio stay navy; only this one
      is green, which is what sets it apart as the button that opens past runs
      rather than changing the portfolio.

      #008537 is their --green-500, taken from their compiled CSS -- the same
      exact value `backtestButton.background` below already uses, so the two
      buttons cannot drift to slightly different greens.
    */
    recentText: '#008537',
    recentBorder: '#008537',
    recentHoverBg: '#008537',
  },

  // "Start Backtest" solid button in StrategyBuilder.jsx.
  backtestButton: {
    background: '#008537',        // AlgoTest --green-500 (exact, from their compiled CSS)
    hoverBackground: '#006A2C',   // AlgoTest --green-600
  },

  // "Select" confirm button inside the time-picker modal in StrategyBuilder.jsx.
  timePickerSelectButton: {
    background: '#1565A0',
  },

  // Tooltip.jsx
  tooltip: {
    background: '#1f2937',
    text: '#fff',
    // Kept as a single combined shadow string since that's how it's used today
    // (one boxShadow value with two stacked shadows).
    shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },


  // <select> dropdown background across StrategyBuilder.jsx. Previously the
  // Tailwind class `bg-white`; migrated to an inline style so it can be
  // changed from here instead of hunting through className strings.
  // <select> dropdowns with NO toggle next to them (Expiry, Strike Criteria)
  dropdownPlain: {
    background: '#FFFFFF',
  },

  dropdown: {
    background: '#FFFFF',
  },
  

  // ToggleSwitch.jsx — all colors live inside a raw CSS template literal
  // (a global <style> tag), so these get interpolated with ${colors.toggleSwitch.x}
  // rather than used as JSX style props.
  toggleSwitch: {
    trackOff: '#808080',   // background when switch is OFF
    thumb: '#FFFFFF',      // the round slider knob (both ON and OFF states)

    // Neutral (black) shadows at different opacities.
    shadowSoft: 'rgba(0, 0, 0, 0.05)',    // inset shadow, OFF state / resting
    shadowMedium: 'rgba(0, 0, 0, 0.1)',   // inset shadow, ON state
    shadowThumb: 'rgba(0, 0, 0, 0.2)',    // slider knob drop shadow, resting

    // The ON-state glow, which is primary.gradientStart at two opacities and
    // has to track it: these were rgb(33, 150, 243) to match the old #2196F3,
    // and are now rgb(7, 130, 218) to match #0782DA. Opacities and the shadow
    // geometry in ToggleSwitch.jsx are unchanged — only the hue moves.
    glowStrong: 'rgba(7, 130, 218, 0.4)',
    glowSoft: 'rgba(7, 130, 218, 0.2)',
  },

  // Dropdowns that sit next to a ToggleSwitch (Stop Loss, Trail SL, Target,
  // Re-entry, Momentum, Range Breakout, Lock Profit type selectors, etc.)
  // switch to this dark background + white text while their toggle is ON.
  // Matches the browser's native dark-mode <select> popup color so the
  // closed box and the open list look like one consistent theme.
  dropdownActive: {
    background: '#13619A',
    text: '#FFFFFF',
  },

  // AlgoTest-style settings panels (Instrument settings / Legwise settings /
  // Entry settings) at the top of StrategyBuilder.jsx. Matched against the
  // AlgoTest backtest page reference screenshot. activeBg is #0B619B, AlgoTest
  // --tertiaryBlue-500 — their segmented-button blue. It is NOT the same value
  // as primary.gradientStart (the toggle's ON colour, --secondaryBlue-500):
  // this comment used to claim they were deliberately equal and named a third
  // value, #26619C, that neither of them has held for some time.
  settingsPanel: {
    heading: '#3A3A3A',            // section titles — flat dark grey (AlgoTest spec: one text color)
    cardBorder: '#F3F3F3',         // AlgoTest --primaryBlack-250 (exact, from their compiled CSS)
    // Soft outer shadow so card edges fade instead of ending on a hard line.
    cardShadow: 'none',  // AlgoTest cards are flat — only their sticky bottom bar has a shadow
    label: '#3A3A3A',              // field labels — 14px medium, flat dark grey
    sentence: '#3A3A3A',           // inline sentence text — same flat grey (no lighter secondary grey)
    inputValue: '#3A3A3A',         // input/dropdown values — flat dark grey
    groupBorder: '#E3E3E3',        // segmented button-group outline + separators — neutral grey, not blue
    activeBg: '#0B619B',           // selected segment fill (AlgoTest cyan-blue)
    activeText: '#FFFFFF',
    inactiveText: '#2A2A2A',
    fieldBorder: '#E3E3E3',        // plain input/select/time-picker borders — soft neutral
    disabledFieldBg: '#F9FAFB',    // "No re-entry after" time box when its toggle is OFF
    disabledFieldBorder: '#E3E3E3',
    divider: '#E3E3E3',            // vertical rule between No re-entry and Overall Momentum
    // Trail SL "All Legs / SL Legs" group while its checkbox is UNCHECKED:
    // solid muted steel-blue fill on the selected segment (not an opacity wash),
    // gray group border, grayed inactive text — AlgoTest's disabled look.
    mutedActiveBg: '#6098BE',
    checkboxBorder: '#0782DA',     // unchecked checkbox outline — blue, per AlgoTest
    // Range Breakout OFF state (AlgoTest): the selected High/Low keeps a soft
    // blue tint instead of an opacity wash.
    tintSelectedBg: '#ECF6FF',          // AlgoTest --secondaryBlue-25 (exact)
    tintSelectedText: '#93B3D4',        // muted variant (control disabled)
    tintSelectedTextActive: '#0782DA',  // active variant — AlgoTest --secondaryBlue-500
    mutedInactiveText: '#9CA3AF',
    mutedGroupBorder: '#E3E3E3',
  },

  // Leg Builder card (AlgoTest-style) in StrategyBuilder.jsx.
  legBuilder: {
    addLegBg: '#0C4A6E',        // "Add Leg" resting fill — AlgoTest --primaryBlue-500
    // "Add Leg" hover fill — AlgoTest --primaryBlue-800, what a solid navy
    // button lifts to. Confirmed twice over: sampled off their hovered Activate
    // button (the same #0C4A6E navy at rest), and present in their design
    // tokens as --primaryBlue-800/--primaryBlue-400. This was #4A7BA6, a steel
    // blue matching no AlgoTest colour.
    addLegHoverBg: '#3D6E8B',
    collapseLink: '#0782DA',    // "Collapse" link in the header row
  },
};