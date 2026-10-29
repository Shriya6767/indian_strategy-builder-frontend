/**
 * src/auth/authTheme.js
 *
 * Colors for the sign-in surface, all taken from the app's existing palette so
 * the page reads as the same product:
 *   #0B619B  settingsPanel.activeBg  — every primary button in the builder
 *   #0782DA  saveButton.enabled      — the accent blue (links, focus rings)
 *   #0064AB  saveButton.hoverBackground
 *   #12233F  the logo's navy
 */

export const authTheme = {
  actionBg: '#0C4A6E',
  actionHoverBg: '#0A3D5C',
  actionText: '#FFFFFF',

  // Links and anything that should read as interactive text.
  accent: '#0782DA',

  navy: '#12233F',
  appNavy: '#0C4A6E',
  appNavyHover: '#0A3D5C',


  pageGradient: 'linear-gradient(135deg, #0B2A45 0%, #0A4A75 55%, #0B619B 100%)',

  landing: {
    pageBg: 'linear-gradient(180deg, #FFFFFF 0%, #F5F8FB 100%)',
    // #0B619B at full strength for the band, so the arc reads as the product's
    // blue rather than a grey-blue wash; the bleed and haze are the same two
    // palette blues, just thinner.
    arc: '#0B619B',                          // the band itself
    arcDeep: '#0A4C7A',                      // its shoulders, where it is densest
    arcBleed: 'rgba(7, 130, 218, 0.32)',     // the light spilling off it
    trail: 'rgba(11, 97, 155, 0.35)',
    trailDot: 'rgba(11, 97, 155, 0.60)',
    haze: 'radial-gradient(closest-side, rgba(7, 130, 218, 0.22), rgba(7, 130, 218, 0))',
    heading: '#0B619B',
    body: '#3A4A5F',
    muted: '#6B7280',
  },

  card: {
    background: '#FFFFFF',
    border: '#E3E3E3',
    heading: '#12233F',
    label: '#3A3A3A',
    mutedText: '#6B7280',
    placeholder: '#9CA3AF',
    fieldBorder: '#E3E3E3',
    fieldFocusBorder: '#0782DA',
    divider: '#E3E3E3',
  },
};

export default authTheme;
