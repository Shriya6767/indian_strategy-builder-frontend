/**
 * src/components/algotrade/SymphonyLogo.jsx
 *
 * Symphony's bull mark, drawn inline rather than fetched from their servers: the
 * card must render offline, and hotlinking someone else's asset is not ours to
 * do. One flat green, so it stays legible down to 24px.
 *
 * Geometry, checked against a rasterised render rather than guessed: each horn
 * is a crescent whose outer and inner edges MEET at the tip (so it comes to a
 * point instead of a blunt stub), sweeping down and inward to the brow. The head
 * is a broad brow that pinches at the shoulders into a straight muzzle column
 * and closes with a rounded chin.
 */
const SymphonyLogo = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 220 220" role="img" aria-label="Symphony">
    <g fill="#0E8A4D">
      <path d="M30 36C22 76 44 100 78 106L82 86C54 80 46 62 30 36Z" />
      <path d="M190 36C198 76 176 100 142 106L138 86C166 80 174 62 190 36Z" />
      <path d="M74 80C74 73 80 68 88 68L132 68C140 68 146 73 146 80L146 110C146 121 132 121 130 134L130 156C130 175 121 187 110 187C99 187 90 175 90 156L90 134C88 121 74 121 74 110Z" />
    </g>
  </svg>
);

export default SymphonyLogo;
