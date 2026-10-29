import { useState, useRef, useEffect } from 'react';
import { authTheme } from './authTheme';
import { PrimaryButton } from './AuthFields';
import { validateOtp } from './validation';
import { verifyOtpRequest, resendOtpRequest } from './authApi';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * src/auth/OtpCard.jsx
 *
 * The six-box OTP step, verified against POST /api/auth/verify-otp. Typing
 * advances to the next box, Backspace on an empty box steps back, and pasting a
 * six-digit code fills the row in one go. After the 30s countdown, Resend posts
 * to /api/auth/resend-otp with purpose "signup".
 */
const OtpCard = ({ email, onSubmit, onResend, onBack, onNotify }) => {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputsRef = useRef([]);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const setDigitAt = (index, value) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleChange = (index, raw) => {
    const value = raw.replace(/\D/g, '');
    if (!value) { setDigitAt(index, ''); return; }

    // A paste lands in one box as the whole code — spread it across the row.
    if (value.length > 1) {
      const chars = value.slice(0, OTP_LENGTH - index).split('');
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((c, i) => { next[index + i] = c; });
        return next;
      });
      inputsRef.current[Math.min(index + chars.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    setDigitAt(index, value);
    if (index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  };

  const code = digits.join('');

  const handleSubmit = async () => {
    const error = validateOtp(code, OTP_LENGTH);
    if (error) { onNotify?.(error, 'error'); return; }

    if (busy) return;
    setBusy(true);
    try {
      const result = await verifyOtpRequest({ email, otp: code });
      if (!result.ok) { onNotify?.(result.message, 'error'); return; }
      onSubmit?.({ otp: code, user: result.data, message: result.message });
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
      return;
    }
    // Enter from any of the six boxes submits, so the code can be typed and
    // confirmed without reaching for the mouse.
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // The countdown only restarts once the backend confirms a new code went out,
  // so a failed resend does not hide the link behind another 30 seconds.
  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      const result = await resendOtpRequest({ email, purpose: 'signup' });
      if (!result.ok) { onNotify?.(result.message, 'error'); return; }
      setSecondsLeft(RESEND_SECONDS);
      onResend?.(result.message);
    } finally {
      setResending(false);
    }
  };


  return (
    <div
      className="w-full rounded-lg border shadow-sm px-8 py-9"
      style={{ backgroundColor: authTheme.card.background, borderColor: authTheme.card.border }}
    >
      <h1
        className="text-[26px] font-semibold text-center mb-7"
        style={{ color: authTheme.card.heading }}
      >
        Enter OTP
      </h1>

      {/* One row, as the reference screen has it: the message on the left and
          either the countdown or the Resend link on the right. */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <p className="text-[14px] leading-5" style={{ color: authTheme.card.label }}>
          OTP sent successfully to {email || '—'}
        </p>

        {secondsLeft > 0 ? (
          <p className="text-[14px] leading-5 text-right whitespace-nowrap" style={{ color: authTheme.card.mutedText }}>
            Resend in {secondsLeft}s
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-[14px] font-medium hover:underline whitespace-nowrap disabled:opacity-60"
            style={{ color: authTheme.accent }}
          >
            {resending ? 'Sending…' : 'Resend'}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mb-7">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputsRef.current[index] = el; }}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            inputMode="numeric"
            // Not maxLength=1: that would drop a pasted code to its first
            // character before handleChange ever sees the rest.
            className="w-12 h-12 rounded-md border text-center text-[16px] outline-none transition-colors"
            style={{ borderColor: digit ? authTheme.card.fieldFocusBorder : authTheme.card.fieldBorder }}
            placeholder="-"
          />
        ))}
      </div>

      <PrimaryButton onClick={handleSubmit} disabled={busy}>
        {busy ? 'Verifying…' : 'Get Started'}
      </PrimaryButton>

      <p className="text-center text-[14px] mt-8" style={{ color: authTheme.card.label }}>
        Entered a wrong email?{' '}
        <button
          type="button"
          onClick={onBack}
          className="font-medium hover:underline"
          style={{ color: authTheme.accent }}
        >
          Go back
        </button>
      </p>
    </div>
  );
};

export default OtpCard;
