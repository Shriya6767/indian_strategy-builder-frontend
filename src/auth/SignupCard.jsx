import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { authTheme } from './authTheme';
import { EmailField, TextField, PasswordField, PrimaryButton, OrDivider, SocialRow } from './AuthFields';
import { validateEmail, validateName, validatePassword, firstError } from './validation';
import { signupRequest } from './authApi';
import GoogleSignInButton from './GoogleSignInButton';

/**
 * src/auth/SignupCard.jsx
 *
 * Two states, matching the reference screens:
 *
 *   collapsed — email address, Get OTP, then "Signup with" + Google inline.
 *   expanded  — the moment the email field is touched, Name and Password
 *               appear and the Google option folds away behind "More ways to
 *               Sign Up", which opens it again on click.
 *
 * Once expanded it stays expanded: collapsing again while someone is filling
 * the form would pull fields out from under them.
 */
const SignupCard = ({ onSwitchToLogin, onGetOtp, onGoogle, onNotify }) => {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The length rule only surfaces once the field has been left (or the form
  // submitted) — warning mid-word would flag every password on its first
  // keystroke.
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [moreWaysOpen, setMoreWaysOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  // Before the card is expanded only the number exists, so only the number is
  // checked. The signup call needs a name and password, so an unexpanded card
  // opens the rest of the form instead of posting a half-filled request.
  const handleGetOtp = async () => {
    setEmailTouched(true);
    if (validateEmail(email)) return;      // shown under the field

    if (!expanded) {
      setExpanded(true);
      return;
    }

    setPasswordTouched(true);
    const error = firstError(validateName(name), validatePassword(password));
    if (error) { onNotify?.(error, 'error'); return; }

    if (busy) return;
    setBusy(true);
    try {
      const result = await signupRequest({ email, name, password });
      if (!result.ok) { onNotify?.(result.message, 'error'); return; }
      onGetOtp?.({ email, name, password, user: result.data, message: result.message });
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
        Signup
      </h1>

      {/* A real form, so Enter from any field submits exactly what the button
          submits — same checks, same warnings, same request. noValidate keeps
          the browser's own bubble out of the way: the email input is
          type="email", and Chrome's popup would otherwise pre-empt the inline
          message this card shows under the field. */}
      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); handleGetOtp(); }}
      >
        <div className="flex flex-col gap-4">
          <EmailField
            value={email}
            onChange={setEmail}
            onFocus={() => setExpanded(true)}
            onBlur={() => setEmailTouched(true)}
            error={emailTouched ? validateEmail(email) : null}
          />

          {expanded && (
            <>
              <TextField value={name} onChange={setName} placeholder="Name" />
              <PasswordField
                value={password}
                onChange={setPassword}
                onBlur={() => setPasswordTouched(true)}
                error={passwordTouched ? validatePassword(password) : null}
              />
            </>
          )}
        </div>

        <div className="mt-6">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? 'Signing up…' : 'Get OTP'}
          </PrimaryButton>
        </div>
      </form>

      <OrDivider />

      {!expanded ? (
        <SocialRow label="Signup with">
          <GoogleSignInButton onClick={onGoogle} />
        </SocialRow>
      ) : (
        <>
          {/* The revealed row is the SAME plain row the collapsed card shows —
              no surrounding box, exactly as the reference screen has it. Only
              the toggle below carries a border, so opening the panel does not
              wrap the Google option in a frame the other state doesn't have. */}
          {moreWaysOpen && (
            <div className="mb-4">
              <SocialRow label="Signup with">
                <GoogleSignInButton onClick={onGoogle} />
              </SocialRow>
            </div>
          )}

          <div className="rounded-md border" style={{ borderColor: authTheme.card.fieldBorder }}>
            <button
              type="button"
              onClick={() => setMoreWaysOpen((open) => !open)}
              className="w-full h-12 px-4 flex items-center justify-center gap-2 text-[14px] font-medium"
              style={{ color: authTheme.card.label }}
            >
              More ways to Sign Up
              <ChevronDown
                size={16}
                className={`transition-transform ${moreWaysOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </>
      )}

      <p className="text-center text-[14px] mt-8" style={{ color: authTheme.card.label }}>
        Have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-medium hover:underline"
          style={{ color: authTheme.accent }}
        >
          Login.
        </button>
      </p>
    </div>
  );
};

export default SignupCard;
