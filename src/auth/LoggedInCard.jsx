import { useEffect } from 'react';
import { authTheme } from './authTheme';

const REDIRECT_SECONDS = 1;

/**
 * src/auth/LoggedInCard.jsx
 *
 * Shown once the OTP is accepted. It moves on to the Strategy Builder by itself
 * after a second; the button is for anyone who gets there first.
 *
 * The timer is cleared on unmount, so pressing the button does not leave a
 * second redirect queued behind it.
 */
const LoggedInCard = ({ onContinue }) => {
  useEffect(() => {
    const timer = setTimeout(() => onContinue?.(), REDIRECT_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <div
      className="w-full rounded-lg border shadow-sm px-8 py-10 text-center"
      style={{ backgroundColor: authTheme.card.background, borderColor: authTheme.card.border }}
    >
      <p className="text-[17px] font-semibold mb-6" style={{ color: authTheme.card.heading }}>
        You are already logged in.
      </p>

      <button
        type="button"
        onClick={onContinue}
        className="w-full h-11 rounded-md text-[14px] font-medium transition-colors"
        style={{ backgroundColor: authTheme.actionBg, color: authTheme.actionText }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = authTheme.actionHoverBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = authTheme.actionBg; }}
      >
        Go Back to Dashboard
      </button>

      <p className="text-[13px] mt-4" style={{ color: authTheme.card.mutedText }}>
        Taking you to the Strategy Builder…
      </p>
    </div>
  );
};

export default LoggedInCard;
