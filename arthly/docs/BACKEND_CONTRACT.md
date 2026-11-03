# Arthly backend contract (PROPOSED)

**Status: proposal. None of these endpoints exist yet.** The day-trader-skill
repository ships Python command-line tools that read and write `trader/*.json`.
It has no web API. Arthly's `HttpAdapter` (`src/services/httpAdapter.ts`)
calls the endpoints below; until a server implements them, every call fails
and the app shows "Backend not reachable" instead of old numbers.

## Why a server at all

- **The browser never runs Python and never holds broker keys.** A small local
  server (for example FastAPI on `127.0.0.1:8765`) runs the repository's tools
  and reads `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` from its own environment.
- **The exact-order gates stay on the server.** An order may reach Alpaca only
  if `trader-risk/check.py` passed that exact order (by fingerprint) today and
  the user approved that same fingerprint. The server must re-check both; it
  must not trust the browser's preview.
- **Paper only** until an authorized live-execution integration exists. The
  server should refuse any request when `ALPACA_PAPER_TRADE` is not `true`.

Bind to `127.0.0.1` only, and allow CORS for the Arthly origin only.

## Endpoints

Responses use the JSON the tools already write. Types are in `src/domain/types.ts`.

| method | path | runs | returns |
| --- | --- | --- | --- |
| GET | `/api/info` | — | `ProviderInfo`: `{source:"connected", provider, delayed:true, asOf, clock:"real"}` |
| GET | `/api/account` | Alpaca `get_account_info` (read only) | `Account` (paper flag, cash, equity, status) |
| GET | `/api/scan/orb` | `scan.py orb --json --no-write` | `ScanResult` (`trader/watchlist.json` shape) |
| GET | `/api/scan/daily` | `scan.py daily --json --no-write` (cache it: about 2.5 minutes for the whole universe) | `ScanResult` |
| GET | `/api/bars/{symbol}?interval=5m` | Yahoo chart `range=2d&interval=5m`, completed bars only | `{bars: Bar[], complete_through}` or `null` |
| GET | `/api/news/{symbol}` | `news.py --tickers SYM --json --dry-run` | `NewsResult` |
| GET | `/api/quotes?symbols=A,B` | `alerts.py quote A B --write` | `{SYM: Quote}`, each with its quote time |
| GET | `/api/plan/{symbol}` | reads `trader/plan.json` | `Plan` or `null` |
| POST | `/api/replay` | `timemachine.py run --symbol ... --entry ... --stop ... --target ... --until FLAT_BY --json` | `ReplayResult` or `null` (fewer than 20 full sessions) |
| POST | `/api/risk/check` | writes the order to a temp `orders.json`, runs `check.py --json` | `RiskReport` with `source:"check.py"` and the tool's fingerprint |
| POST | `/api/orders/paper` | see below | `{brokerOrderId}` |
| GET | `/api/company-results?tickers=A,B` | `facts.py A B --json` (needs `SEC_USER_AGENT`) | `AnalystResult[]` |
| GET | `/api/disclosures` | `ptr.py index --member pelosi --json` + `ptr.py parse` per report | `{index, reports}` |

### `POST /api/orders/paper`

Request:

```json
{ "order": { "symbol": "TSLA", "side": "buy", "qty": "8", "type": "market", "time_in_force": "day",
             "order_class": "bracket", "take_profit_limit_price": "370.04", "stop_loss_stop_price": "358.32" },
  "fingerprint": "c38dc9bf3e621b26",
  "approval": { "at": "2026-10-19T14:15:30Z", "fingerprint": "c38dc9bf3e621b26", "method": "button" } }
```

The server must:

1. Recompute the fingerprint from `order` (same function as `check.py`) and
   refuse if it differs from `fingerprint` or `approval.fingerprint`.
2. Find a PASS for that fingerprint in `trader/state/risk.json` dated today in
   New York. If there is none, run `check.py` itself. A BLOCK refuses.
3. Record the approval with `ticket.py approve --index N --reply "yes"`, so the
   repository's own log has it.
4. Call Alpaca `place_stock_order` with exactly the Alpaca fields (never `why`
   or `plan`), on the paper account.
5. Record the result with `ticket.py result ...` (placed, failed, filled).

Never retry a failed order without a new check and a new approval.

## Not in the contract

Live trading, options, crypto, margin, short selling and "close all" are left
out on purpose. Markets other than US-listed stocks (NSE, BSE and others) would
need their own data and broker integrations behind new endpoints.
