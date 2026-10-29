/**
 * src/auth/validation.js
 *
 * Field checks shared by every card, so the same wording comes back no matter
 * which form the user is on. Each returns an error string, or null when the
 * value is fine — the caller renders it under the field or as a toast.
 */

/**
 * Deliberately permissive: one @, something before it, and a dotted domain
 * after it with a 2+ letter last label. Tighter patterns reject addresses that
 * are perfectly valid (plus tags, new TLDs, subdomains), and the server is the
 * only thing that can truly say whether an address exists.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export const validateEmail = (email) => {
  const value = String(email || '').trim();

  if (!value) return 'Please enter your email';
  if (/\s/.test(value)) return 'Email cannot contain spaces';
  if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email address';

  return null;
};

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Length only — any mix of letters, digits or symbols is fine, so this is the
 * whole rule. `label` names the field in the message ("password", "new
 * password").
 */
export const validatePassword = (password, { label = 'password' } = {}) => {
  if (!password) return `Please enter your ${label}`;
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  return null;
};

/**
 * Sign-in only: the password already exists, so the length rule does not apply
 * to it — an account made before the rule would be locked out by a check the
 * server never made. The server decides whether the pair is right.
 */
export const validatePasswordPresent = (password) =>
  (password ? null : 'Please enter your password');

export const validateName = (name) => {
  if (!String(name || '').trim()) return 'Please enter your name';
  return null;
};

export const validateOtp = (code, length = 6) => {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return 'Please enter the OTP sent to your email';
  if (digits.length < length) return `Please enter all ${length} digits of the OTP`;
  return null;
};

/** Runs checks in order and returns the FIRST problem, so one toast shows at a time. */
export const firstError = (...errors) => errors.find((e) => e) || null;
