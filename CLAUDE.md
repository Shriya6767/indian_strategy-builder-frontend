# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server on port 5173
npm run build      # Production build to dist/
npm run lint       # ESLint (flat config in eslint.config.js)
npm run preview    # Preview the production build
```

There is no test suite.

The mock/reference backend lives in `main.py` (FastAPI, in-memory stores):

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

`main.py` implements only a subset of what the frontend calls (`/api/load-data`, `save-strategy`, `get-strategies-list`, `get-strategy/{id}`, `run-backtest`, `health`, `reports/save`). Portfolio, compare-backtest, slippage, export, and reports-list endpoints exist only on the real backend.

**Backend URL is hardcoded in two places** and currently points at `http://192.168.0.125:8000`: `BASE_URL` in `src/services/api.js` (most requests use this absolute URL, not the proxy) and the `/api` proxy target in `vite.config.js`. Change both to point at a different backend (e.g. localhost).

## Stack

React 19 + Vite, plain JSX (no TypeScript), Tailwind CSS 4 via the `@tailwindcss/vite` plugin (no tailwind.config file). Charts use recharts; drag-and-drop uses @hello-pangea/dnd; PDF/screenshot export uses jspdf + html2canvas/modern-screenshot.

## Architecture

Options-strategy backtesting frontend (this branch, `feature/indian_version`, is adapting it for Indian markets — NIFTY etc.; defaults in `src/config/constants.js` are still US-style, e.g. `SPXW`).

**No router.** `src/App.jsx` (~1600 lines) is the single hub: an `activeTab` string (`"builder"`, `"reports"`, `"live-dashboard"`, `"portfolios"`, `"live-settings"`, `"settings"`, `"save-strategy"`) selects which top-level view renders, and App owns almost all cross-cutting state (backtest results, strategy config, save/toast status, refresh counters) and passes it down via props. Several props are integer "counters" (`saveCompletedCounter`, `backtestCompletedCounter`, `versionLoadCounter`, `strategiesRefreshKey`) that parent components increment to signal events to children — follow that pattern rather than adding new event systems. Top-level views are `React.lazy` imports behind a `Suspense`; `BacktestResults` is deliberately eager because StrategyBuilder renders it inline.

**Core component:** `src/components/StrategyBuilder.jsx` (~3900 lines) — the strategy form, leg management (`LegCard.jsx`), and backtest launch. It owns the `config` object (the app's central data structure: strategy-level settings plus `config.legs`) and pushes it up via `onConfigChange`. Some Indian-version UI in it is intentionally placeholder-only: state prefixed `ui*` (e.g. `uiIndexPlaceholder`, `uiNoReentryEnabled`) is not wired into config/save/backtest payloads yet.

### Legs model

- Leg ids come from `nextLegId()` in StrategyBuilder (`Date.now() * 1000 + counter`). They must stay **numeric** — `strategyApi.js` parses lazy-leg references with a numeric regex. Edits are routed by `config.legs.findIndex(l => l.id === leg.id)`, so duplicate ids silently misroute edits.
- **Lazy legs** are ordinary entries in `config.legs` that another leg references by storing the string `lazy_leg_<id>` in its `reentry_sl_mode` / `reentry_tgt_mode`. At payload time they are resolved and nested as `legObject.lazy_leg` (with cycle detection).
- **Sequential legs** hang off a parent leg (`isSequentialLeg`) and are nested as `legObject.sequential_leg`.

### Payload building — two implementations, keep them in sync

This is the main trap in the codebase. The backend leg/strategy shape is built in **two independent places**:

- `src/services/strategyApi.js` → `buildSaveStrategyPayload(config, version)` — used by `App.jsx` for **save**.
- `src/components/StrategyBuilder.jsx` → its own local `buildLegObject` (~line 1500) — used for the **run-backtest** payload.

Both do the same enum/format mapping (`ATM`/`ITM-n`/`OTM+n`, `POINTS`/`PERCENT`/`UNDERLYING_*`, `HH:MM:00` times, string→number coercion). A change to the request shape must be applied to both or save and backtest will disagree. `buildRunBacktestPayload` in `strategyApi.js` is currently **unused dead code** — don't assume it's the live path.

### Contexts and localStorage

`src/context/StrategyContext` holds `strategy_id`/`strategy_name`/`version`, mirrored to localStorage under `strategy_session_data` plus a name→version map in `strategy_versions_map`; it also tracks `sessionTouched` so a name restored from storage alone still shows "Unsaved Strategy". `PortfolioContext` keeps the portfolio list in localStorage under `portfolios`. Everything else flows through App props.

### Networking

Two coexisting access paths — check which one a file uses before adding a call:
- The axios instance in `src/services/api.js` (`baseURL = API_URL`, plus status-code interceptors).
- Raw `fetch(\`${API_URL}/...\`)` scattered across App.jsx, StrategyBuilder, Reports, PortfolioDetails, LiveTrading*, MultiStrategyManager, SavedStrategies*, and the service modules themselves.

`src/utils/apiLogger.js` covers both: `installFetchLogger()` (called from `main.jsx` before render) monkey-patches `window.fetch`, and `attachAxiosLogger()` adds interceptors. It only logs URLs containing `/api/`, reads a *clone* of the response, and swallows its own errors — preserve those properties if you touch it.

Other services: `versionConfigApi.js` for strategy persistence endpoints.

Use `src/utils/logger.js` instead of raw `console.*`.

## Styling

Two coexisting approaches — match whichever the file you're editing uses:
- Seven components use inline styles with colors from `src/theme/colors.js` (StrategyBuilder, LegCard, TimeSegmentInput, DateSegmentInput, ToggleSwitch, Tooltip, BackgroundLoadingScreen). Take color values from `colors.js`, don't hardcode new hex values.
- Everything else (Portfolios, SavedStrategies*, Header, Toast, etc.) uses Tailwind utility classes only.

## Stray files (not source)

`src/components/LegCard.jsx.bak`, `src/theme/colors.js.bak` are backups; `src/components/STRATEGYBUILDER.MD` is a stale copy of StrategyBuilder.jsx, not documentation; `src/components/{migrate,icon,text}.py` are one-off color-migration scripts. None are imported by the app. `dist/` is committed but generated.

## Git

PRs target the `development` branch.
