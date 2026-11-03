# Trader_skill

My setup for the [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill)
Claude skills, plus **Arthly**, a frontend for them.

- [`arthly/`](arthly/README.md): the research and paper-trading web app (React, TypeScript, Tailwind).
  It runs on demo data built from the upstream tools' own test fixtures.
- `.mcp.json`: Alpaca's MCP server in **paper** mode. Keys come from the
  `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` environment variables, never from this repo.
- `.claude/settings.json`: order tools set to ask first; options, crypto, close-all and cancel-all blocked.

## Setup

```bash
git clone https://github.com/Kartikch27/Trader_skill.git
cd Trader_skill
git clone https://github.com/Jakeschincariol/day-trader-skill.git   # the Python tools (MIT)
cd arthly && npm install && npm run dev
```

Education and tooling, not financial advice. Paper trading only.
