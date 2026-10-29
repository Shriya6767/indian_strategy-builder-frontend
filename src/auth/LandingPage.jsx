import { authTheme } from './authTheme';

/**
 * What a visitor sees before signing in: a headline and a line about the
 * product, over the arc of light.
 *
 * The arc is two blurred elements and nothing else -- a thick ring half below
 * the fold and a soft haze under it. No image, no canvas, no animation loop.
 *
 * Deliberately free of invented numbers: "40M backtests run" and similar are
 * claims about a business, not decoration.
 */

const { landing } = authTheme;

/** The arc and the haze inside it. */
const Glow = () => (
  <div
    className="absolute inset-0 overflow-hidden pointer-events-none"
    aria-hidden="true"
 
    style={{
      WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent 96%)',
      maskImage: 'linear-gradient(to bottom, #000 62%, transparent 96%)',
    }}
  >
    {/* The wide bleed stays a blurred ring — that one IS meant to be vapour. */}
    <div
      className="absolute left-1/2 -translate-x-1/2 rounded-full"
      style={{
        top: '18%',
        width: 'min(1520px, 142vw)',
        height: 'min(1520px, 142vw)',
        border: 'clamp(70px, 9vw, 130px) solid',
        borderColor: landing.arcBleed,
        filter: 'blur(80px)',
      }}
    />
    <svg
      className="absolute left-1/2 -translate-x-1/2"
      style={{ top: '18%', width: 'min(1520px, 142vw)', filter: 'blur(10px)' }}
      viewBox="0 0 1240 660"
      fill="none"
    >
      <defs>
        <linearGradient id="sd-arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={landing.arcDeep} stopOpacity="0.30" />
          <stop offset="10%" stopColor={landing.arcDeep} stopOpacity="0.95" />
          <stop offset="19%" stopColor={landing.arc} stopOpacity="0.40" />
          <stop offset="30%" stopColor={landing.arc} stopOpacity="0.10" />
          <stop offset="50%" stopColor={landing.arc} stopOpacity="0.05" />
          <stop offset="70%" stopColor={landing.arc} stopOpacity="0.10" />
          <stop offset="81%" stopColor={landing.arc} stopOpacity="0.40" />
          <stop offset="90%" stopColor={landing.arcDeep} stopOpacity="0.95" />
          <stop offset="100%" stopColor={landing.arcDeep} stopOpacity="0.30" />
        </linearGradient>
        <linearGradient id="sd-arc-inner" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={landing.arc} stopOpacity="0" />
          <stop offset="16%" stopColor={landing.arc} stopOpacity="0.34" />
          <stop offset="34%" stopColor={landing.arc} stopOpacity="0.06" />
          <stop offset="66%" stopColor={landing.arc} stopOpacity="0.06" />
          <stop offset="84%" stopColor={landing.arc} stopOpacity="0.34" />
          <stop offset="100%" stopColor={landing.arc} stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="620" cy="620" r="576" stroke="url(#sd-arc)" strokeWidth="58" />
      {/* A second, thinner arc inside the first — the reference has this echo
          and without it the band looks like a single flat stripe. */}
      <circle cx="620" cy="620" r="486" stroke="url(#sd-arc-inner)" strokeWidth="26" />
    </svg>

    {/* A wash inside the arc so the middle of the page is not a flat white. */}
    <div
      className="absolute left-1/2 -translate-x-1/2 rounded-full"
      style={{
        top: '30%',
        width: 'min(820px, 84vw)',
        height: 'min(460px, 48vw)',
        background: landing.haze,
        filter: 'blur(60px)',
      }}
    />

    {/* The trails: two thin lines above the crown, each carrying a marker,
        placed as the reference places them. Hidden on small screens, where
        there is no room above the arc. */}
    <svg
      className="absolute left-1/2 -translate-x-1/2 hidden sm:block"
      style={{ top: '6%', width: 'min(1180px, 104vw)' }}
      viewBox="0 0 1180 160"
      fill="none"
    >
      <path d="M100 152 C 240 96, 380 60, 520 46" stroke={landing.trail} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1080 148 C 950 92, 820 52, 660 40" stroke={landing.trail} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="394" cy="65" r="5" fill={landing.trailDot} />
      <circle cx="942" cy="96" r="5" fill={landing.trailDot} />
      <circle cx="660" cy="40" r="5" fill={landing.trailDot} />
    </svg>
  </div>
);

const LandingPage = () => (
  <section className="relative w-full min-h-[78vh] sm:min-h-[80vh] flex items-center justify-center">
    <Glow />

    <div className="relative w-full max-w-5xl mx-auto px-6 py-10 text-center">
      <h1
        className="text-[38px] sm:text-[52px] font-semibold leading-[1.1] tracking-tight"
        style={{ color: landing.heading }}
      >
        Know how your strategy behaves
        <br className="hidden sm:block" />
        {' '}before the market tells you.
      </h1>

      <p
        className="mt-6 text-[16px] sm:text-[18px] leading-relaxed max-w-2xl mx-auto"
        style={{ color: landing.body }}
      >
        Build multi-leg options strategies, test them across years of historical
        data, and see every entry, exit and drawdown in detail — no code, no
        spreadsheets.
      </p>

      <p className="mt-8 text-[14px]" style={{ color: landing.muted }}>
        Sign up to start, or log in to pick up where you left off.
      </p>
    </div>
  </section>
);

export default LandingPage;
