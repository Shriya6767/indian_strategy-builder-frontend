import { BORDER, BLUE, BLUE_TINT, INK } from './palette';
import Toggle from './Toggle';

/**
 * src/components/algotrade/DeployedFilters.jsx
 *
 * The Deployed Strategies status chips and the Show archived switch, shared by
 * the main board and the Pro view so the two behave identically.
 *
 * Each chip toggles on its own — several statuses can be watched at once, which
 * is the point of having five of them. None selected means no narrowing at all.
 */

const DEPLOYED_FILTERS = ['Running', 'Paused', 'Sq Off', 'Error', 'Manual'];

/**
 * `only` narrows the list — the Positions view shows just Running and Sq Off,
 * because those are the only states that hold a position.
 */
const DeployedFilters = ({ selected, onToggle, archived, onArchived, only = null }) => (
  <>
    {(only || DEPLOYED_FILTERS).map((filter) => {
      const on = selected.has(filter);
      return (
        <button
          key={filter}
          type="button"
          onClick={() => onToggle(filter)}
          aria-pressed={on}
          className="inline-flex items-center h-[28px] px-3 rounded-full border text-[12px] transition-colors"
          style={on
            ? { backgroundColor: BLUE_TINT, borderColor: '#A9D4F2', color: BLUE }
            : { backgroundColor: '#FFFFFF', borderColor: BORDER, color: INK }}
        >
          {filter}
        </button>
      );
    })}

    <button
      type="button"
      onClick={() => onArchived(!archived)}
      aria-pressed={archived}
      className="inline-flex items-center gap-1.5 h-[28px] px-3 ml-1 rounded-full border text-[12px] bg-white"
      style={{ borderColor: BORDER, color: INK }}
    >
      <Toggle as="span" on={archived} />
      Show archived
    </button>
  </>
);

export default DeployedFilters;
