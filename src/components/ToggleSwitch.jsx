import React from 'react';
import { colors } from '../theme/colors';

// Rendered ONCE for the whole app, not per-instance and not per-render.
// Animation is pure CSS transitions (AlgoTest-style): the thumb and track always
// glide between states — no JS animation state, no startup grace period.
const ToggleSwitchStyles = () => (
  <style>{`
    /* 36x20 track, matching AlgoTest's own switch (h-5 w-9); this was 40px wide. */
    .toggle-container { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
    /* Larger AlgoTest-style variant (settings panels). */
    .toggle-container.toggle-lg { transform: scale(1.18); transform-origin: center; }
    .toggle-container.toggle-sm { transform: scale(0.8); transform-origin: center; }
    /* Smaller again, for switches that sit beside body text rather than in a
       settings panel — at 'sm' they out-weigh the label next to them. */
    .toggle-container.toggle-xs { transform: scale(0.65); transform-origin: center; }
    /* Not interactive: the input is also disabled, so no click can flip it. */
    .toggle-container.toggle-disabled { cursor: not-allowed; opacity: 0.45; }
    .toggle-input { display: none; }
    /* No box-shadow on either the track or the thumb: AlgoTest's own switch
       reports "shadow none" for both, where this carried an inset shadow plus
       an outer glow. The glow was the most visible difference between the two. */
    .toggle-background {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%;
      background-color: ${colors.toggleSwitch.trackOff};
      border-radius: 9999px;
      transition: background-color 0.25s ease;
    }
    .toggle-background.state-open {
      background-color: ${colors.primary.gradientStart};
    }
    /* 12px thumb, not 16px, matching AlgoTest's. Inset 4px keeps it centred in
       the 20px track ((20 - 12) / 2), and travel is 16px, which is what the
       36px track leaves: 4 + 12 + 16 = 32, with the same 4px margin at the far
       end as at the near one. Travel has to be re-derived whenever the track
       width changes, or the thumb stops short of (or overruns) the end. */
    .toggle-slider {
      position: absolute; top: 4px; left: 4px; width: 12px; height: 12px;
      background-color: ${colors.toggleSwitch.thumb};
      border-radius: 9999px;
      transform: translateX(0px);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .toggle-slider.state-open {
      transform: translateX(16px);
    }
  `}</style>
);

const ToggleSwitch = ({ checked, onChange, id, size, disabled = false }) => (
  <label
    className={`toggle-container${size === 'lg' ? ' toggle-lg' : size === 'sm' ? ' toggle-sm' : size === 'xs' ? ' toggle-xs' : ''}${disabled ? ' toggle-disabled' : ''}`}
  >
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="toggle-input"
    />
    <div className={`toggle-background ${checked ? 'state-open' : ''}`}></div>
    <div className={`toggle-slider ${checked ? 'state-open' : ''}`}></div>
  </label>
);

export { ToggleSwitchStyles };
export default React.memo(ToggleSwitch);
