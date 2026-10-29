import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { authTheme } from './authTheme';

/**
 * src/auth/AuthFields.jsx
 *
 * The field shapes the sign-in cards share, kept here so Login, Signup and the
 * reset card cannot drift apart: the email box, a plain text field and a
 * password field with the eye toggle. Both the email and password fields carry
 * their own inline error line.
 */

export const ERROR_TEXT = '#DC2626';

const FIELD_BASE =
  'w-full h-12 px-4 text-[14px] outline-none bg-white transition-colors placeholder:text-[#9CA3AF]';

/**
 * Email address. `error` is the red line under the field — the caller decides
 * WHEN to pass it (on blur and on submit, not on every keystroke) so a rule is
 * not thrown at someone halfway through typing.
 */
export const EmailField = ({ value, onChange, onFocus, onBlur, error = null, autoFocus = false }) => {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? ERROR_TEXT
    : focused ? authTheme.card.fieldFocusBorder : authTheme.card.fieldBorder;

  return (
    <div>
      <div className="rounded-md border transition-colors" style={{ borderColor }}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          // Trimmed on the way in: a leading space from a paste or autofill is
          // invisible in the field but would fail the format check.
          onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          placeholder="Email"
          className={`${FIELD_BASE} rounded-md`}
        />
      </div>

      {error && (
        <p className="text-[13px] mt-1.5" style={{ color: ERROR_TEXT }}>{error}</p>
      )}
    </div>
  );
};

export const TextField = ({ value, onChange, placeholder, type = 'text' }) => {
  const [focused, setFocused] = useState(false);

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      className={`${FIELD_BASE} rounded-md border`}
      style={{ borderColor: focused ? authTheme.card.fieldFocusBorder : authTheme.card.fieldBorder }}
    />
  );
};

/**
 * `error` is the red line under the field. The caller decides WHEN to pass it —
 * on blur rather than on every keystroke, so a rule is not thrown at someone
 * halfway through typing.
 */
export const PasswordField = ({ value, onChange, placeholder = 'Password', error = null, onBlur }) => {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? ERROR_TEXT
    : focused ? authTheme.card.fieldFocusBorder : authTheme.card.fieldBorder;

  return (
    <div>
      <div className="relative rounded-md border transition-colors" style={{ borderColor }}>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          placeholder={placeholder}
          className={`${FIELD_BASE} pr-12 rounded-md`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: authTheme.card.placeholder }}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {error && (
        <p className="text-[13px] mt-1.5" style={{ color: ERROR_TEXT }}>{error}</p>
      )}
    </div>
  );
};

/** Full-width primary button — Login, Get OTP, Get Started. */
export const PrimaryButton = ({ children, onClick, type = 'button', disabled = false }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className="w-full h-12 rounded-md text-[15px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    style={{ backgroundColor: authTheme.actionBg, color: authTheme.actionText }}
    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = authTheme.actionHoverBg; }}
    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = authTheme.actionBg; }}
  >
    {children}
  </button>
);

/** The dashed "or" separator between the form and the Google option. */
export const OrDivider = () => (
  <div className="flex items-center gap-3 my-5">
    <span className="flex-1 border-t border-dashed" style={{ borderColor: authTheme.card.divider }} />
    <span className="text-[13px]" style={{ color: authTheme.card.mutedText }}>or</span>
    <span className="flex-1 border-t border-dashed" style={{ borderColor: authTheme.card.divider }} />
  </div>
);

export const SocialRow = ({ label, children }) => (
  <div className="flex items-center gap-3">
    <span className="text-[14px] whitespace-nowrap" style={{ color: authTheme.card.label }}>{label}</span>
    <span className="flex-1 border-t" style={{ borderColor: authTheme.card.divider }} />
    {children}
  </div>
);
