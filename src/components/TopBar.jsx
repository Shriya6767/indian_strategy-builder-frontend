import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Cable } from 'lucide-react';
// Heroicons, matching the reference exactly -- see NavIcons.jsx.
import { ChartBarSquare, BriefcaseIcon, ArrowTrendingUp } from './NavIcons';
import NavMenu from './NavMenu';
import StrategyDeskLogo from '../auth/StrategyDeskLogo';
import { readSession } from '../auth/authSession';
import { colors } from '../theme/colors';

const TOPBAR_CHARCOAL = '#3A3A3A';
const TOPBAR_GRADIENT = TOPBAR_CHARCOAL;

const initialsOf = (name, email) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = String(email || '').trim();
  return local ? local[0].toUpperCase() : '?';
};

/** The `pl-2` on NavMenu's label button, which the alignment has to cancel. */
const LABEL_PAD_LEFT = 8;

const useImportAlign = () => {
  const [left, setLeft] = useState(null);

  const measure = useCallback(() => {
    const icon = document.querySelector('[data-import-icon]');
  
    if (!icon) return;
    const left = icon.getBoundingClientRect().left;
   
    if (left > 0) setLeft(Math.round(left) - LABEL_PAD_LEFT);
  }, []);

  useEffect(() => {
  
    const first = setTimeout(measure, 0);
    window.addEventListener('resize', measure);

    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(first);
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [measure]);

  return left;
};

const TopBar = ({ onBrokerSetup, onLogout, onNavigate, onCreateStrategy }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const importAlign = useImportAlign();
  const menuRef = useRef(null);

  // Same source the strategy bar used before this moved up here.
  const identity = readSession()?.identity || {};
  const accountEmail = identity.email || identity.user?.email || '';
  const accountName = identity.name || identity.user?.name || '';
  const initials = initialsOf(accountName, accountEmail);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header
      className="relative h-[48px] shrink-0 flex items-center gap-3 px-4 sm:px-5"
      style={{ background: TOPBAR_GRADIENT, color: '#FFFFFF' }}
    >
      <div className="shrink-0 inline-flex items-center rounded px-1">
        {/* 38px, not 28: the mark and wordmark share one viewBox, so the
            wordmark only reads at a size that fills the 48px bar. */}
        <StrategyDeskLogo height={38} onDark />
      </div>

      <nav className="flex items-center gap-4 shrink-0"
           style={importAlign != null && importAlign < window.innerWidth - 420
             ? { marginLeft: 0, position: 'absolute', left: importAlign }
             : { marginLeft: 16 }}>
        <NavMenu
          label="Backtest"
          sections={[
            {
              icon: ChartBarSquare,
              title: 'Strategies',
              onGo: () => onCreateStrategy?.(),
              items: [
                { label: 'Create Strategies' },
                { label: 'Backtest Strategies' },
              ],
            },
            {
              icon: BriefcaseIcon,
              title: 'Portfolios',
              onGo: () => onNavigate?.('portfolios'),
              items: [
                { label: 'Backtest Portfolios' },
                { label: 'Optimise Portfolios' },
              ],
            },
          ]}
        />
        <NavMenu
          label="Algo Trade"
          sections={[
            {
              icon: ArrowTrendingUp,
              title: 'Algo Trade',
              onGo: () => onNavigate?.('algo-trade'),
              items: [
                { label: 'All Strategies + Portfolios' },
              ],
            },
          ]}
        />
      </nav>

      <button
        type="button"
        onClick={onBrokerSetup}
        title="Connect a broker for algo trading"
        className="ml-auto inline-flex items-center gap-1.5 h-[36px] px-2 text-[13px] font-medium text-white transition-colors"
        style={{ backgroundColor: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2A2A2A'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <Cable size={15} strokeWidth={2} />
        Broker Setup
      </button>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          title={accountEmail || 'Account'}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-colors text-[11px] font-semibold tracking-[0.02em]"
          style={{
            backgroundColor: menuOpen ? 'rgba(255,255,255,0.22)' : '#FFFFFF',
            color: menuOpen ? '#FFFFFF' : TOPBAR_CHARCOAL,
            boxShadow: menuOpen ? 'inset 0 0 0 1px rgba(255,255,255,0.75)' : 'none',
          }}
        >
          {initials}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full min-w-[12rem] bg-white border rounded-md shadow-lg py-1 z-50"
            style={{ borderColor: '#e3e3e3', marginTop: '6px' }}
          >
            {(accountName || accountEmail) && (
              <div className="px-3 py-2.5 border-b" style={{ borderColor: '#F3F3F3' }}>
                {accountName && (
                  <p className="text-[13px] font-semibold truncate" style={{ color: '#2a2a2a' }}>
                    {accountName}
                  </p>
                )}
                {accountEmail && (
                  <p className="text-[12px] truncate" style={{ color: '#6B7280' }}>{accountEmail}</p>
                )}
              </div>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onLogout?.(); }}
              className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 transition-colors"
              style={{ color: colors.actionBar.secondaryText, backgroundColor: 'transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.actionBar.secondaryHoverBg;
                e.currentTarget.style.color = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = colors.actionBar.secondaryText;
              }}
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TopBar;
