# StrategyDesk — Options Strategy Builder & Backtester

React 19 + Vite frontend for building multi-leg options strategies, backtesting
them over historical data, and running them as portfolios.

---

## 1. Requirements

| | Version | Why |
|---|---|---|
| **Node** | **20.19+** or **22.13+** | Vite 8 needs `^20.19 \|\| >=22.12`; ESLint 10 needs `^20.19 \|\| ^22.13`. The stricter of the two wins. |
| **npm** | 7 or newer | `package-lock.json` is lockfileVersion 3. |
| Python | 3.10+ | Only if you run the bundled reference backend (`main.py`). |

Check before you start:

```bash
node -v
```

If it prints anything below `v20.19`, or `v22.0`–`v22.12`, install Node 22 LTS
first. With nvm:

```bash
nvm install 22 && nvm use 22
```

---

## 2. Clone

```bash
git clone <repository-url>
```

```bash
cd ind_strategy_frontend_builder_version_2
```

---

## 3. Install dependencies

```bash
npm ci
```

Use `npm ci`, **not** `npm install`. It installs exactly the versions pinned in
`package-lock.json`, so every machine gets an identical tree. `npm install`
resolves the `^` ranges afresh and would quietly give you a different React or
Vite minor than everyone else is running.

(`npm install` is the right command only when you are *adding* or *upgrading* a
package — commit the resulting `package-lock.json` change.)

---

## 4. Point it at your backend — REQUIRED

The backend address is **hardcoded in four places** in `vite.config.js`. Out of
the box they point at `192.168.1.5`, which will not exist on your machine, and
the symptom is unhelpful: the page loads fine and every API call fails.

Edit all four `target:` lines:

| Line | Path | Change to |
|---|---|---|
| 33 | `/api` (preview) | your API host, e.g. `http://127.0.0.1:8000` |
| 41 | `/ws` (preview) | your WebSocket host, e.g. `http://127.0.0.1:8001` |
| 58 | `/api` (dev) | same as line 33 |
| 66 | `/ws` (dev) | same as line 41 |

`src/services/api.js` needs no change — `BASE_URL` is `""`, so requests go
through the proxy above.

---

## 5. Run

```bash
npm run dev
```

Opens on **http://localhost:5174** (not Vite's usual 5173 — the port is set in
`vite.config.js`). `host: true` also exposes it on your LAN.

---

## 6. Verify your setup

```bash
npm run build
```

```bash
npm run lint
```

> ESLint currently reports **130 problems (115 errors, 15 warnings)**. That is
> the known baseline on a clean checkout, not something you broke. Compare
> against 130 after your changes rather than expecting zero.

```bash
npm run test:roundtrip
```

Three suites, all offline — no backend needed:

- **74** strategy values survive save → reopen unchanged
- **62** dropdown values survive save → reopen unchanged
- **28** portfolio statistics match the backend's own figures exactly

---

## The reference backend (optional)

`main.py` is a small FastAPI stub with in-memory storage, useful for working on
the Strategy Builder without the real backend.

```bash
python3 -m venv venv
```

```bash
source venv/bin/activate
```

```bash
pip install fastapi uvicorn pydantic
```

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**It implements only a subset:** `/api/load-data`, `save-strategy`,
`get-strategies-list`, `get-strategy/{id}`, `run-backtest`, `health` and
`reports/save`.

Portfolio, compare-backtest, slippage and export endpoints exist **only on the
real backend** — so the Portfolios pages will not work against `main.py` alone.

---

## All scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR on :5174 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built app on :4173 |
| `npm run serve` | Build, then preview on :4173 |
| `npm run lint` | ESLint (flat config in `eslint.config.js`) |
| `npm run test:roundtrip` | The three offline suites above |

---

## Troubleshooting

**`vite: not found`** — dependencies are not installed. `node_modules/` is
gitignored, so a fresh clone has none. Run `npm ci`.

**`Unsupported engine` on install** — your Node is below the floor in §1.

**Page loads but all data is missing** — step 4 was skipped, or the backend is
not running.

**Port 5174 already in use** — Vite will offer the next free port; take it, or
change `server.port` in `vite.config.js`.

---

## Before you commit

`node_modules/`, `dist/`, `venv/`, `__pycache__/` and `src/logs/` are all
gitignored. If `git status` ever shows them as modified, they were tracked
before the ignore rules existed — untrack them without deleting anything local:

```bash
git rm -r --cached node_modules dist venv __pycache__ src/logs
```

Pull requests target the **`development`** branch.

See `CLAUDE.md` for architecture notes — in particular the two independent
request-payload builders that must be kept in sync.
