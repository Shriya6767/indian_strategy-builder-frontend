/**
 * The top-bar menu glyphs, inlined from Heroicons v2 (outline).
 *
 * NOT LUCIDE, unlike the rest of the app: the reference draws these in
 * Heroicons and the two sets differ visibly -- lucide's nearest bars run
 * horizontal where these rise. Paths were read off the reference directly.
 * Same 24x24 / 1.5 stroke / currentColor contract lucide uses.
 */

const Svg = ({ size = 16, strokeWidth = 1.5, children, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

/**
 * Heroicons `chevron-down` — the bar's own menu arrow.
 * Measured on the reference: 16x16, white, 1px stroke (lucide's is 2px).
 */
export const ChevronDownIcon = (props) => (
  <Svg size={16} strokeWidth={1} {...props}>
    <path d="M19 9l-7 7-7-7" />
  </Svg>
);

/** Heroicons `chart-bar-square` — rising bars inside a rounded square. */
export const ChartBarSquare = (props) => (
  <Svg {...props}>
    <path d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
  </Svg>
);

/** Heroicons `folder-plus` — the sidebar's create-folder control. */
export const FolderPlusIcon = (props) => (
  <Svg {...props}>
    <path d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
  </Svg>
);

/** Heroicons `briefcase`. */
export const BriefcaseIcon = (props) => (
  <Svg {...props}>
    <path d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
  </Svg>
);

/** Heroicons `arrow-trending-up` — the rising line with its arrowhead. */
export const ArrowTrendingUp = (props) => (
  <Svg {...props}>
    <path d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
  </Svg>
);
