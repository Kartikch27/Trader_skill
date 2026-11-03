# Arthly

A research and paper-trading workspace for the
[day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill) tools.
It covers US-listed stocks only, and every order goes to a paper account.

It follows one journey per trade, **find setup → understand context → plan
trade → replay outcomes → size and check → review order**, in two views of the
same data (Beginner and Pro), in English or Hinglish, light or dark.

> Education and tooling, not financial advice. Most people who day trade lose money.

## Run it

Requires Node 18 or newer.

```bash
cd arthly
npm install
npm run dev          # http://127.0.0.1:5173
npm test             # unit tests for sizing, exit plan, rules check, fingerprint, order states, entry watch
npm run build        # production build in dist/
```

Browser smoke test (desktop and phone width, the full demo journey). It needs
an installed Chrome or Edge:

```bash
npm run build && npx vite preview --port 4173 &
node scripts/e2e-smoke.mjs http://127.0.0.1:4173
```

Rebuild the demo data from the repository's own tools (Python 3.8+, no network):

```bash
npm run fixtures     # runs ../day-trader-skill tools offline on their test fixtures
```

## Where each module lives

| repository module | in Arthly |
| --- | --- |
| trader-scanner | Find Stocks |
| trader-news | Trade Workspace → Understand → News & Catalysts |
| trader-entry | Trade Workspace → Entry Watch |
| trader-exit | Trade Workspace → Exit Plan |
| trader-timemachine | Trade Workspace → Trade Replay |
| trader-budget | Trade Workspace → Size & Rules → Position Size |
| trader-risk | Trade Workspace → Size & Rules → Trading Rules Check |
| trader-broker | Trade Workspace → Review Order, and Orders & Positions |
| trader-alerts | Alerts |
| trader-analyst | Research → Company Results |
| trader-pelosi | Research → Public Trade Disclosures |

## How it is built

```
src/domain/      types, and ports of the Python logic (tested against its output)
  exitPlan.ts    trader-exit compute(): stop rounds down, target half up, same refusals
  sizing.ts      trader-budget size_trade() + bracket_order()
  risk.ts        trader-risk checks for one order (browser preview)
  fingerprint.ts check.py / ticket.py fingerprint (pure-JS SHA-256)
  orderState.ts  proposed → checked/blocked → approved → submitted → partially filled/filled/rejected/cancelled; edits supersede
  entryWatch.ts  first COMPLETED candle closing above the level
  alerts.ts      trader-alerts rule types, ring once
  market.ts      NYSE clock, 2026–2027 holidays and early closes, New York time
src/i18n/        English + Hinglish dictionary
src/services/    ArthlyService interface, DemoAdapter (fixtures), HttpAdapter (proposed API)
src/state/       zustand store (persisted in localStorage), journey derivation
src/fixtures/    real tool output, built by scripts/build_fixtures.py
src/pages/       the screens
docs/BACKEND_CONTRACT.md   the proposed server API
```

**Data source and account mode are separate.** The data source is *Demo*
(saved real data, clearly labelled) or *Connected* (a local server). The
account mode is *Paper*. *Live* is shown but disabled.

## Integration checklist

What works now, with demo data:

- [x] Opening-range and daily scan results: real scanner output for Mon 2026-10-19, with search, sort, filters and coverage (1 of 234 charts failed, and the app says so)
- [x] TSLA chart, the entry watch replayed bar by bar with the demo clock (10:12 waiting on a forming candle, 10:15 triggered)
- [x] Exit plan editing and validation, sizing, the rules check and fingerprints. They match the Python tools exactly (unit tests)
- [x] Trade Replay: the saved 10,000-replay run and its history, verdict printed as the tool wrote it
- [x] A complete demo paper-order journey into a browser ledger: positions, realized and unrealized P&L, decision history
- [x] Alerts: create, edit, remove, reset, "from plan"; checks run only while the tab is open, and the app says so
- [x] Company results (AAPL, KO) and public trade disclosures (four PTRs), from the tools' offline runs
- [x] Loading, empty, partial, stale, disconnected and error states (Settings → Preview data states)

What needs a backend or a broker connection:

- [ ] A local server implementing `docs/BACKEND_CONTRACT.md` (none exists yet)
- [ ] Live scans, bars, news and quotes for any symbol (demo has TSLA bars only)
- [ ] New Trade Replays for a changed plan (needs `timemachine.py`; demo has one saved run)
- [ ] The authoritative rules check (`check.py`). The browser check is a preview
- [ ] Paper orders to Alpaca: server-side fingerprint + PASS + approval, then `place_stock_order`
- [ ] Background alerts that keep running after the app closes (needs a server or a scheduled task)
- [ ] Live trading: intentionally unavailable

## Credits

Logic ported from day-trader-skill (MIT). Charts: TradingView Lightweight Charts (Apache-2.0). Icons: Lucide (ISC).
