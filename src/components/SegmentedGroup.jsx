import { colors } from '../theme/colors';

/**
 * AlgoTest-style segmented button group. Pure presentation — selection state
 * stays with the caller.
 *
 * Props: options [{value,label}], value, onChange, padX, firstRef/onFirstKeyDown
 * (first button only, for the Strategy Type group's keyboard nav), `muted` for
 * the disabled look, `accent` to outline the group in the selected blue.
 *
 * `equal` gives every segment the same width, via equal GRID columns -- not
 * flex-1, whose automatic minimum size is the label width, so the wider label
 * refuses to give ground and the pair stays uneven.
 */
const SegmentedGroup = ({
  options,
  value,
  onChange,
  muted = false,
  tint = false,
  accent = false,
  padX = 'px-4',
  equal = false,
  textSize = 'text-[13px]',
  className = '',
  firstRef,
  onFirstKeyDown,
}) => {
  const sp = colors.settingsPanel;
  const borderColor = accent
    ? sp.activeBg
    : tint ? sp.fieldBorder : muted ? sp.mutedGroupBorder : sp.groupBorder;
  return (
    <div className={`${equal ? 'inline-grid grid-flow-col auto-cols-fr' : 'inline-flex'} max-w-full rounded-md overflow-x-auto overflow-y-hidden no-scrollbar border transition-colors ${className}`} style={{ borderColor }}>
      {options.map((opt, idx) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={idx === 0 ? firstRef : undefined}
            onKeyDown={idx === 0 ? onFirstKeyDown : undefined}
            onClick={() => onChange(opt.value)}
            className={`${padX} ${equal ? '' : 'shrink-0'} py-2 flex items-center justify-center ${textSize} font-normal transition-colors ${idx > 0 ? 'border-l' : ''} ${active ? '' : 'bg-white hover:bg-gray-50'}`}
            style={{
              borderLeftColor: idx > 0 ? borderColor : undefined,
              ...(active
                ? (tint
                    ? { backgroundColor: sp.tintSelectedBg, color: sp.tintSelectedTextActive, fontWeight: 500 }
                    : { backgroundColor: muted ? sp.mutedActiveBg : sp.activeBg, color: sp.activeText, fontWeight: 500 })
                : { color: muted ? sp.mutedInactiveText : sp.inactiveText }),
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedGroup;
