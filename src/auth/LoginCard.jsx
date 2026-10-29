import { useState } from 'react';
import { authTheme } from './authTheme';
import { EmailField, PasswordField, PrimaryButton, OrDivider, SocialRow } from './AuthFields';
import { validateEmail, validatePasswordPresent, firstError } from './validation';
import { loginRequest } from './authApi';
import { lockTimeLeft, recordFailure, resetAttempts, formatWait } from './loginAttempts';
import GoogleSignInButton from './GoogleSignInButton';

/**
 * src/auth/LoginCard.jsx
 *
 * Email + password sign-in against POST /api/auth/login. Wrong passwords are
 * capped at five attempts before a timed lockout — see loginAttempts. The Google button is
 * still a placeholder, and the broker list from the reference screen is
 * deliberately absent.
 */
const LoginCard = ({ onSwitchToSignup, onForgotPassword, onGoogle, onNotify, onLoggedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // The format rule appears once the field has been left or the form submitted,
  // never mid-typing.
  const [emailTouched, setEmailTouched] = useState(false);

  const handleLogin = async () => {
    setEmailTouched(true);
    if (validateEmail(email)) return;

    const error = firstError(validatePasswordPresent(password));
    if (error) { onNotify?.(error, 'error'); return; }

    // Still locked out from earlier failures: say how long is left and do not
    // spend a request on a password the user cannot submit yet.
    const locked = lockTimeLeft(email);
    if (locked > 0) {
      onNotify?.(`Too many login attempts. Please try again in ${formatWait(locked)}.`, 'error');
      return;
    }

    // Guarded rather than relying on the disabled attribute alone: Enter on a
    // focused field can fire a second time before the first reply lands.
    if (busy) return;
    setBusy(true);
    try {
      const result = await loginRequest({ email, password });

      if (!result.ok) {
        const { remaining, lockedMs } = recordFailure(email);
        onNotify?.(
          lockedMs > 0
            ? `Too many login attempts. Please try again in ${formatWait(lockedMs)}.`
            : `${result.message} ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          'error',
        );
        return;
      }

      resetAttempts(email);   // a correct password wipes the slate
      onLoggedIn?.({ email, user: result.data, message: result.message });
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
        Login
      </h1>

      {/* A real form, so Enter from any field submits exactly what the button
          submits — same checks, same warnings, same request. noValidate keeps
          the browser's own bubble out of the way: the email input is
          type="email", and Chrome's popup would otherwise pre-empt the inline
          message this card shows under the field. */}
      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
      >
        <div className="flex flex-col gap-4">
          <EmailField
            value={email}
            onChange={setEmail}
            onBlur={() => setEmailTouched(true)}
            error={emailTouched ? validateEmail(email) : null}
          />
          <PasswordField value={password} onChange={setPassword} />
        </div>

        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-[13px] font-medium hover:underline"
            style={{ color: authTheme.accent }}
          >
            Forgot Password?
          </button>
        </div>

        <div className="mt-6">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Login'}
          </PrimaryButton>
        </div>
      </form>

      <OrDivider />

      <SocialRow label="Login with">
        <GoogleSignInButton onClick={onGoogle} />
      </SocialRow>

      <p className="text-center text-[14px] mt-8" style={{ color: authTheme.card.label }}>
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="font-medium hover:underline"
          style={{ color: authTheme.accent }}
        >
          Signup
        </button>
      </p>
    </div>
  );
};

export default LoginCard;
