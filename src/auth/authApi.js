import { API_URL } from '../services/api';
import logger from '../utils/logger';

/**
 * Calls behind the sign-in screens, addressed through the same relative `/api`
 * the rest of the app uses -- no host is hardcoded.
 *
 *   POST /api/auth/signup | login | verify-otp | resend-otp
 *                         | forgot-password | reset-password
 *
 * All normalised to { ok, message, data }. This backend reports failures as
 * HTTP 200 with `status: false`, so an HTTP check alone would read a rejected
 * login as a success.
 */

const request = async (path, body, label) => {
  const url = `${API_URL}${path}`;
  logger.request(`[${label}] Request`, { method: 'POST', url });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Network-level failure: no response at all.
    logger.error(`[${label}] Network error`, error.message);
    return { ok: false, message: 'Cannot reach the server. Please try again.', data: null };
  }

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    logger.error(`[${label}] Response was not JSON`, raw.slice(0, 200));
    return { ok: false, message: `Server returned an unexpected response (HTTP ${response.status})`, data: null };
  }

  logger.response(`[${label}] Response`, { status: response.status, data: payload });
  const detail = payload?.detail;
  const detailMessage = Array.isArray(detail)
    ? detail.map((d) => d?.msg || d?.message).filter(Boolean).join(', ')
    : typeof detail === 'string'
      ? detail
      : (detail?.message || detail?.msg || null);

  const message =
    detailMessage ||
    payload?.message ||
    payload?.error ||
    (response.ok ? null : `Request failed (HTTP ${response.status})`);

  // `status: false` / `success: false` marks a failure even on HTTP 200 — and
  // this backend sometimes nests that flag inside `detail`.
  const flaggedFailure =
    payload?.status === false ||
    payload?.success === false ||
    detail?.status === false;
  const ok = response.ok && !flaggedFailure;

  return {
    ok,
    message: ok ? payload?.message || null : message || 'Something went wrong. Please try again.',
    data: payload?.data ?? payload ?? null,
  };
};

export const signupRequest = ({ email, name, password }) =>
  request('/auth/signup', { email, name, password }, 'SIGNUP');

export const loginRequest = ({ email, password }) =>
  request('/auth/login', { email, password }, 'LOGIN');

export const verifyOtpRequest = ({ email, otp }) =>
  request('/auth/verify-otp', { email, otp }, 'VERIFY OTP');

// `purpose` tells the backend which flow the code belongs to.
export const resendOtpRequest = ({ email, purpose = 'signup' }) =>
  request('/auth/resend-otp', { purpose, email }, 'RESEND OTP');

export const forgotPasswordRequest = ({ email }) =>
  request('/auth/forgot-password', { email }, 'FORGOT PASSWORD');

// The field is new_password on the wire; the UI calls it newPassword.
export const resetPasswordRequest = ({ email, newPassword, otp }) =>
  request('/auth/reset-password', { email, new_password: newPassword, otp }, 'RESET PASSWORD');
