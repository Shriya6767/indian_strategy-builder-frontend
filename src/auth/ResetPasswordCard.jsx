import { useState, useRef, useEffect } from 'react';
import { authTheme } from './authTheme';
import { EmailField, PasswordField, PrimaryButton } from './AuthFields';
import { validateEmail, validatePassword, validateOtp, firstError } from './validation';
import { resetPasswordRequest, forgotPasswordRequest, resendOtpRequest } from './authApi';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * src/auth/ResetPasswordCard.jsx
 *
 * Forgot-password, in the two steps the reference screens show:
 *
 *   'email' — just the address and Get OTP, which posts to
 *              /api/auth/forgot-password.
 *   'verify' — the same card grows an OTP row, a new password and a
 *              confirmation, with "Change Password" at the bottom.
 *
 * "Change Password" posts to /api/auth/reset-password; a success signs the
 * user in, the same ending as the OTP flow.
 */
const ResetPasswordCard = ({ onBackToLogin, onNotify, onPasswordReset }) => {
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef([]);

  useEffect(() => {
    if (step !== 'verify' || secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, secondsLeft]);

  const handleGetOtp = async () => {
    setEmailTouched(true);
    if (validateEmail(email)) return;      // shown under the field

    if (busy) return;
    setBusy(true);
    try {
      const result = await forgotPasswordRequest({ email });
      if (!result.ok) { onNotify?.(result.message, 'error'); return; }

      // Only advance once the backend confirms the code went out — otherwise
      // the card would ask for an OTP nobody was sent.
      setStep('verify');
      setSecondsLeft(RESEND_SECONDS);
      onNotify?.(result.message || 'sent OTP for confirmation', 'success');
    } finally {
      setBusy(false);
    }
  };

  // Same endpoint and purpose as the signup card — the backend takes "signup"
  // for both flows. The countdown restarts only on a confirmed resend.
  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      const result = await resendOtpRequest({ email, purpose: 'signup' });
      if (!result.ok) { onNotify?.(result.message, 'error'); return; }
      setSecondsLeft(RESEND_SECONDS);
      onNotify?.(result.message || 'sent OTP for confirmation', 'success');
    } finally {
      setResending(false);
    }
  };

  const passwordsMismatch = Boolean(password) && Boolean(confirmPassword) && password !== confirmPassword;

  const handleDigitChange = (index, raw) => {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      setDigits((prev) => { const next = [...prev]; next[index] = ''; return next; });
      return;
    }

    const chars = value.slice(0, OTP_LENGTH - index).split('');
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => { next[index + i] = c; });
      return next;
    });
    inputsRef.current[Math.min(index + chars.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleChangePassword = async () => {
    setPasswordTouched(true);
    const error = firstError(
      validateOtp(digits.join(''), OTP_LENGTH),
      validatePassword(password, { label: 'new password' }),
      !confirmPassword ? 'Please confirm your new password' : null,
      password && confirmPassword && password !== confirmPassword ? 'Passwords do not match' : null,
    );
    if (error) { onNotify?.(error, 'error'); return; }

    if (busy) return;
    setBusy(true);
    try {
      const result = await resetPasswordRequest({ email, newPassword: password, otp: digits.join('') });
      if (!result.ok) { onNotify?.(result.message, 'error'); return; }
      onPasswordReset?.({ email, user: result.data, message: result.message });
    } finally {
      setBusy(false);
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
        Reset Password
      </h1>

      {step === 'email' ? (
        <>
          <EmailField
            value={email}
            onChange={setEmail}
            onBlur={() => setEmailTouched(true)}
            error={emailTouched ? validateEmail(email) : null}
          />
          <div className="mt-5">
            <PrimaryButton onClick={handleGetOtp} disabled={busy}>
              {busy ? 'Sending OTP…' : 'Get OTP'}
            </PrimaryButton>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 mb-5">
            <p className="text-[14px] leading-5" style={{ color: authTheme.card.label }}>
              OTP sent successfully to {email}
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

          <div className="flex items-center justify-between gap-2 mb-4">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputsRef.current[index] = el; }}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digits[index] && index > 0) {
                    inputsRef.current[index - 1]?.focus();
                  }
                }}
                inputMode="numeric"
                placeholder="-"
                className="w-12 h-12 rounded-md border text-center text-[16px] outline-none transition-colors"
                style={{ borderColor: digit ? authTheme.card.fieldFocusBorder : authTheme.card.fieldBorder }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <PasswordField
              value={password}
              onChange={setPassword}
              onBlur={() => setPasswordTouched(true)}
              error={passwordTouched ? validatePassword(password, { label: 'new password' }) : null}
            />
            {/* The mismatch line waits until BOTH fields have content: warning
                while the confirmation is still being typed would flag every
                half-entered password. */}
            <PasswordField
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm Password"
              error={passwordsMismatch ? 'Passwords do not match' : null}
            />
          </div>

          <div className="mt-5">
            <PrimaryButton onClick={handleChangePassword} disabled={busy}>
              {busy ? 'Changing password…' : 'Change Password'}
            </PrimaryButton>
          </div>
        </>
      )}

      <p className="text-center text-[14px] mt-8" style={{ color: authTheme.card.label }}>
        Already have an account?{' '}
        <button
          type="button"
          onClick={onBackToLogin}
          className="font-medium hover:underline"
          style={{ color: authTheme.accent }}
        >
          Login
        </button>
      </p>
    </div>
  );
};

export default ResetPasswordCard;
