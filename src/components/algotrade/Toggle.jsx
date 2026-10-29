import { BLUE, TOGGLE_OFF } from './palette';

/**
 * The one switch every Algo Trade screen uses. 24x12 track, 9px thumb, both
 * measured off the reference.
 *
 * The thumb moves by `transform: translateX`, NOT by flipping justify-content
 * -- that cannot be transitioned, so the earlier version snapped between ends
 * with no animation. Timings match the builder's own ToggleSwitch.
 *
 * `as="span"` renders a non-interactive copy: a <button> nested inside another
 * control is invalid HTML.
 */

// 24px track, 1.5px inset each side, 9px thumb -> 12px of travel.
const TRAVEL = 12;

const Toggle = ({ on = false, onClick, title, as = 'button' }) => {
  const Tag = as;
  const interactive = as === 'button';

  return (
    <Tag
      {...(interactive ? { type: 'button', onClick } : {})}
      title={title}
      aria-pressed={interactive ? on : undefined}
      className="inline-flex items-center w-[24px] h-[12px] rounded-full px-[1.5px] shrink-0"
      style={{
        backgroundColor: on ? BLUE : TOGGLE_OFF,
        transition: 'background-color 0.25s ease',
      }}
    >
      <span
        className="w-[9px] h-[9px] rounded-full bg-white"
        style={{
          transform: `translateX(${on ? TRAVEL : 0}px)`,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </Tag>
  );
};

export default Toggle;
