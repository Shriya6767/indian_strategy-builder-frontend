import { useState } from 'react';
import { Clock } from 'lucide-react';
import { INK, MUTED, BORDER, SOFT_BG } from './palette';
import { parse } from './timeValue';
import TimePicker from './TimePicker';

/**
 * src/components/algotrade/RestartTimeField.jsx
 *
 * One restart time: "09:15:15" with a clock icon that opens the product's own
 * TimePicker.
 *
 * SHARED by the single Restart dialog, every row of Restart All and the
 * "apply to all" panel -- all three draw the same control, and three copies of
 * it is three chances for one to stop matching the others.
 *
 * `disabled` greys it and takes the clock away: that is the Scheduled Restart
 * switch turned off, where the field still SHOWS the default being sent but
 * can no longer be edited.
 */

/**
 * The value exactly as it is sent: "09:15:15", 24-hour, no meridiem.
 *
 * It carried " AM"/" PM" before, which pushed the text past the width of its
 * box and wrapped onto a second line -- and the suffix was never part of what
 * goes to the API anyway, so it was decoration that broke the layout.
 */
const label = (value) => {
  const { minute, second } = parse(value, false);
  const [hh] = String(value || '').split(':');
  return `${String(hh || '09').padStart(2, '0')}:${minute}:${second}`;
};

const RestartTimeField = ({ value, onChange, disabled = false, width = 108 }) => {
  const [open, setOpen] = useState(false);
  /**
   * The trigger element itself, in STATE rather than a ref: TimePicker
   * positions from its rect during render, and reading `ref.current` while
   * rendering is both a lint error and genuinely unreliable -- the first open
   * would read null. A callback ref into state re-renders once the node
   * exists, so the panel always has a rect to measure.
   */
  const [anchor, setAnchor] = useState(null);

  /**
   * WHAT IS BEING TYPED, kept apart from the committed value.
   *
   * Half-typed text ("09:1") is not a time, and pushing it upward would hand
   * the dialog a value it cannot send. So keystrokes land here, and only a
   * complete, valid time reaches `onChange`. `null` means "not typing" -- the
   * field then shows the real value, including one picked from the dropdown.
   */
  const [draft, setDraft] = useState(null);

  /**
   * Valid text is pushed up THE MOMENT IT PARSES, not on blur.
   *
   * Committing on blur looked fine and was quietly wrong: typing a time and
   * going straight for the Restart button submits before the field has lost
   * focus, so the dialog sent the OLD time while the box showed the new one.
   * With real money and a restart schedule that is not a cosmetic bug.
   *
   * Intermediate states are harmless -- "11:22" commits as 11:22:00 and is
   * superseded a keystroke later by 11:22:33 -- and nothing is sent until
   * Restart is pressed anyway.
   */
  const commit = (text) => {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(text).trim());
    if (!m) return false;
    const [, h, mi, se] = m;
    // 24-hour, and out-of-range digits are rejected rather than clamped: a
    // silent 25:00 -> 23:00 would send a time nobody chose.
    if (Number(h) > 23 || Number(mi) > 59 || Number(se || 0) > 59) return false;
    onChange?.(`${h.padStart(2, '0')}:${mi}:${(se || '00').padStart(2, '0')}`);
    return true;
  };

  return (
    <>
      {/*
        TYPE IT OR PICK IT.

        The digits are a real text input, so a time can be typed straight in;
        the clock button opens the dropdown. The whole box used to open the
        picker, which made typing impossible -- every click landed on the
        toggle.
      */}
      <span ref={setAnchor}
            className="inline-flex items-center gap-1 h-[26px] px-2 rounded border text-[12px] whitespace-nowrap"
            style={{
              width,
              borderColor: BORDER,
              backgroundColor: disabled ? SOFT_BG : '#FFFFFF',
            }}>
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={draft ?? label(value)}
          placeholder="HH:MM:SS"
          aria-label="Restart time"
          title={disabled ? 'Scheduled Restart is off' : 'Type a time, or pick one from the clock'}
          /*
            CLICKING A SEGMENT SELECTS IT — the blue highlight on "09" in the
            builder's own time field. The caret position says which of HH, MM
            or SS was clicked, and that pair of digits is selected, so typing
            replaces it instead of landing mid-number.

            Deferred by a timeout because the browser sets its own caret from
            the click AFTER this handler returns; selecting now would simply be
            undone. A timeout rather than requestAnimationFrame: rAF is paused
            whenever the page is not painting (a background tab, a window that
            is not compositing), and the selection would then never happen.
          */
          onClick={(e) => {
            const el = e.currentTarget;
            setTimeout(() => {
              const at = el.selectionStart ?? 0;
              // "09:15:15" -> segments at 0-2, 3-5, 6-8.
              const start = at <= 2 ? 0 : (at <= 5 ? 3 : 6);
              el.setSelectionRange(start, start + 2);
            }, 0);
          }}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            commit(text);              // valid -> up immediately; invalid -> ignored
          }}
          onBlur={() => {
            // Drop the draft so the box shows what is actually held. Anything
            // half-typed therefore snaps back rather than lingering as a time
            // that was never committed.
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); setDraft(null); }
            if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
          }}
          className="w-full min-w-0 bg-transparent outline-none tabular-nums"
          style={{ color: disabled ? MUTED : INK }}
        />
        <button type="button"
                disabled={disabled}
                onClick={() => setOpen((was) => !was)}
                title={disabled ? 'Scheduled Restart is off' : 'Pick a time'}
                aria-label="Pick a time"
                className={`shrink-0 inline-flex items-center${disabled ? '' : ' cursor-pointer'}`}>
          <Clock size={13} style={{ color: disabled ? MUTED : INK }} />
        </button>
      </span>

      {open && !disabled && (
        <>
          {/* Click-away. Transparent and behind the panel, so the first click
              outside closes rather than landing on whatever is underneath. */}
          <span className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <TimePicker value={value}
                      onChange={(v) => { setDraft(null); onChange?.(v); }}
                      onClose={() => setOpen(false)}
                      anchor={anchor}
                      hour24 />
        </>
      )}
    </>
  );
};

export default RestartTimeField;
