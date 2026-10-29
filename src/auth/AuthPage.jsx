import { useState, useCallback } from 'react';
import Toast from '../components/Toast';
import { authTheme } from './authTheme';
import StrategyDeskLogo from './StrategyDeskLogo';
import LoginCard from './LoginCard';
import SignupCard from './SignupCard';
import OtpCard from './OtpCard';
import ResetPasswordCard from './ResetPasswordCard';
import LoggedInCard from './LoggedInCard';
import LandingPage from './LandingPage';
import { startSession, rememberAccountName, recallAccountName } from './authSession';

/**
 * The signed-out screen. Opens on the landing page and swaps its centre slot
 * for whichever card is chosen.
 *
 *   login  --POST /auth/login--> done --3s--> app
 *   signup --POST /auth/signup--> otp --verify-otp--> done --> app
 *   login  --Forgot Password--> reset --reset-password--> login
 *
 * Every step is wired except the reset card's Get OTP -- see ResetPasswordCard.
 */
const AuthPage = ({ onEnter, initialView = 'landing' }) => {
  const [view, setView] = useState(initialView);
  const [email, setEmail] = useState('');
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = 'success') => {
    // Re-keyed on every call so the same message twice in a row still replays
    // the slide-in rather than sitting there looking unchanged.
    setToast({ message, type, key: Date.now() });
  }, []);

  const onLanding = view === 'landing';

  const enterApp = useCallback(() => {
    onEnter?.();
  }, [onEnter]);
  const completeSignIn = useCallback((identity, message, auth) => {
    // The name shown in the account menu: what the backend sent if it sent one,
    // otherwise the name this person typed at signup.
    const name = identity?.user?.name || recallAccountName(identity?.email);
    rememberAccountName(identity?.email, name);
    startSession('credentials', { ...identity, name }, auth);
    notify(message || 'Successfully logged in', 'success');
    setView('done');
  }, [notify]);

  // Both login and verify-otp answer with the same token block.
  const authFrom = (payload) => ({
    token: payload?.access_token || null,
    tokenType: payload?.token_type || 'bearer',
    expiresIn: payload?.expires_in || null,
  });

  // Both of these arrive only after the backend has accepted the request.
  // `user` here is the whole verify-otp body — the token sits at its top level.
  const handleOtpVerified = ({ user, message } = {}) =>
    completeSignIn({ email, user: user?.user || user }, message || 'Successfully logged in', authFrom(user));

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      // The landing page is light with the arc doing the colour; the cards keep
      // the blue gradient they were designed against.
      style={{ background: onLanding ? authTheme.landing.pageBg : authTheme.pageGradient }}
    >
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Brand on the left; the two ways in on the right, on the landing page
          only — once a card is open the buttons would just repeat its links. */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-5 sm:py-6">
        <button
          type="button"
          onClick={() => setView('landing')}
          title="Back to home"
          className="cursor-pointer shrink-0 h-9 sm:h-12 [&>svg]:h-full [&>svg]:w-auto"
        >
          <StrategyDeskLogo height={48} onDark={!onLanding} />
        </button>

        {onLanding && (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setView('login')}
              className="h-10 px-4 sm:px-5 rounded-md border text-[14px] font-medium whitespace-nowrap transition-colors"
              style={{ borderColor: '#D5DFE8', backgroundColor: '#FFFFFF', color: authTheme.appNavy }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = authTheme.appNavy;
                e.currentTarget.style.borderColor = authTheme.appNavy;
                e.currentTarget.style.color = authTheme.actionText;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.borderColor = '#D5DFE8';
                e.currentTarget.style.color = authTheme.appNavy;
              }}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setView('signup')}
              className="h-10 px-4 sm:px-5 rounded-md text-[14px] font-medium whitespace-nowrap transition-colors"
              style={{ backgroundColor: authTheme.appNavy, color: authTheme.actionText }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = authTheme.appNavyHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = authTheme.appNavy; }}
            >
              Sign Up
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className={onLanding ? 'w-full' : 'w-full max-w-[26rem]'}>
          {view === 'landing' && <LandingPage />}

          {view === 'login' && (
            <LoginCard
              onSwitchToSignup={() => setView('signup')}
              onForgotPassword={() => setView('reset')}
              onGoogle={() => {}}
              onNotify={notify}
              onLoggedIn={({ email: entered, user, message }) =>
                completeSignIn(
                  { email: entered, user: user?.user || user },
                  message || 'Successfully logged in',
                  authFrom(user),
                )}
            />
          )}

          {view === 'signup' && (
            <SignupCard
              onSwitchToLogin={() => setView('login')}
              onGetOtp={({ email: entered, name, message }) => {
                // Held now so the account menu has it after verify-otp, which
                // does not necessarily echo the name back.
                rememberAccountName(entered, name);
                setEmail(entered);
                setView('otp');
                notify(message || 'sent OTP for confirmation', 'success');
              }}
              onGoogle={() => {}}
              onNotify={notify}
            />
          )}

          {view === 'otp' && (
            <OtpCard
              email={email}
              onSubmit={handleOtpVerified}
              onResend={(message) => notify(message || 'sent OTP for confirmation', 'success')}
              onBack={() => setView('signup')}
              onNotify={notify}
            />
          )}

          {view === 'reset' && (
            <ResetPasswordCard
              onBackToLogin={() => setView('login')}
              onNotify={notify}
              onPasswordReset={({ message }) => {
                notify(message || 'Password updated. Please login with your new password.', 'success');
                setView('login');
              }}
            />
          )}

          {view === 'done' && <LoggedInCard onContinue={enterApp} />}
        </div>
      </main>
    </div>
  );
};

export default AuthPage;
