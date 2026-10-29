import { useEffect, useState } from 'react';
import { X, Funnel, Info } from 'lucide-react';
import {
  INK, MUTED, BORDER, GREEN, THEME, ACTIVATE_HOVER, SOFT_BG, BLUE, BLUE_TINT, NOTICE_TEXT,
} from './palette';
import { DEFAULT_RESTART_TIME } from './restartSchedule';
import RestartTimeField from './RestartTimeField';
import Toggle from './Toggle';

/**
 * Restart ONE paused deployment: the broker, a Scheduled Restart switch, the
 * restart time, and the warning that this replaces any existing schedule.
 *
 * THE SWITCH DOES NOT GATE THE REQUEST. Off means "use the default", not "do
 * not schedule" -- it resets the field to 09:15:15 and greys it, and that
 * default still goes out. So there is exactly one value to send.
 *
 * `onConfirm(time)` receives "HH:MM:SS".
 */
const RestartDialog = ({ brokerName, brokerLive = false, onClose, onConfirm }) => {
  const [scheduled, setScheduled] = useState(true);
  const [time, setTime] = useState(DEFAULT_RESTART_TIME);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Turning the switch OFF discards whatever was typed and goes back to the
   * default. Turning it back ON leaves that default in place rather than
   * restoring the old edit -- a value silently coming back after being
   * dismissed is worse than retyping it.
   */
  const toggleScheduled = () => setScheduled((was) => {
    if (was) setTime(DEFAULT_RESTART_TIME);
    return !was;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}>
      <div className="w-full max-w-[400px] rounded-lg bg-white shadow-2xl"
           role="dialog" aria-modal="true" aria-label="Restart strategy">

        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Restart Strategy</h2>
          <button type="button" onClick={onClose} title="Close" style={{ color: MUTED }}>
            <X size={18} />
          </button>
        </div>

        {/* The broker leads: it is what the restart will actually run on, and
            whether it is logged in decides whether it can run at all. */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-t"
             style={{ borderColor: BORDER }}>
          <span className="inline-flex items-center gap-2 text-[13px] font-medium"
                style={{ color: INK }}>
            <Funnel size={13} style={{ color: GREEN }} />
            {brokerName || 'Broker'}
          </span>
          <span className="inline-flex items-center h-[19px] px-2 rounded text-[10px] font-semibold"
                style={brokerLive
                  ? { color: GREEN, backgroundColor: '#E6F3EB' }
                  : { color: MUTED, backgroundColor: SOFT_BG }}>
            {brokerLive ? 'LOGGED IN' : 'LOGGED OUT'}
          </span>
        </div>

        <div className="px-5 pt-1 pb-4">
          <div className="flex items-center justify-between gap-4 py-2">
            <span className="inline-flex items-center gap-2.5 text-[13px]" style={{ color: INK }}>
              <Toggle on={scheduled} onClick={toggleScheduled} title="Scheduled Restart" />
              Scheduled Restart
            </span>
            <RestartTimeField value={time} onChange={setTime} disabled={!scheduled} />
          </div>

          {/* A tinted NOTICE BAR, as the reference draws it -- not a bare
              line of grey text, which read as a caption rather than as
              something the user needs to have taken in before pressing
              Schedule. */}
          <p className="mt-2 flex items-start gap-1.5 px-2.5 py-2 rounded text-[11px] leading-snug"
             style={{ color: NOTICE_TEXT, backgroundColor: BLUE_TINT }}>
            <Info size={12} className="mt-px shrink-0" style={{ color: BLUE }} />
            This will overwrite any restarts scheduled in the strategy
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t"
             style={{ borderColor: BORDER }}>
          <button type="button" onClick={onClose}
                  className="px-3 py-1.5 rounded text-[13px] font-medium transition-colors hover:bg-gray-50"
                  style={{ color: INK }}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm?.(scheduled ? time : DEFAULT_RESTART_TIME)}
                  className="h-[32px] px-6 rounded text-[13px] font-semibold text-white transition-colors"
                  style={{ backgroundColor: THEME }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACTIVATE_HOVER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME; }}>
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestartDialog;
