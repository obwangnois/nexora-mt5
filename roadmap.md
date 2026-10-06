# NEXORA MT5 — Project State (single source of truth)

Master Command: LOCKED (received 2026-10-06). Architecture changes require human approval.

## Architecture lock (summary)
- NEXORA AI = brain, never sends broker orders. NEXORA MT5 = control/risk/execution. MT5 EA = thin bridge. Broker = execution.
- Deterministic Risk Engine is final authority; AI cannot bypass.
- Cloud control plane and local execution plane are separate; cloud down ≠ positions unprotected.
- Execution state machine, idempotency, no blind resend on UNKNOWN, reconciliation = core.
- Multi-user / multi-broker / multi-account from foundation. Credentials never reach AI, logs or client.
- Default trading mode DATA ONLY; AUTO TRADE needs explicit activation.

## Workstreams (dependency order)
1. [WAITING_APPROVAL] PROJECT FOUNDATION — enable Lovable Cloud, design system, app shell (HOME/MARKETS/ACCOUNTS/TRADING/AI/JOURNAL/MORE)
2. [QUEUED] AUTH & MULTI-USER — roles OWNER/ADMIN/TRADER/VIEWER, tenant isolation
3. [QUEUED] BROKER & ACCOUNT MANAGER — broker capability profiles, canonical symbols, per-account risk profiles
4. [BLOCKED: needs MT5 EA/connector decision] MT5 CONNECTOR & MARKET DATA + quality gate
5. [QUEUED] MARKET ANALYSIS & CHART SNAPSHOT
6. [BLOCKED: needs NEXORA AI endpoint/contract] NEXORA AI INTEGRATION
7. [QUEUED] SIGNAL & VERSIONED TRADE PLAN ENGINE
8. [QUEUED] RISK, EXPOSURE, NEWS/SESSION, CIRCUIT BREAKER
9. [QUEUED] EXECUTION ENGINE — safety gate, state machine, idempotency, slippage
10. [QUEUED] POSITIONS / JOURNAL / RECONCILIATION
11. [QUEUED] NOTIFICATIONS (LINE/Telegram/Push/In-App) & HEALTH MONITOR
12. [QUEUED] TESTING / SIMULATION / RELEASE (test matrix §72)

## Open decisions (human)
- D1: Enable Lovable Cloud for auth/database (required for workstream 1–2).
- D2: Local execution plane: the MT5 EA (MQL5) and local runtime run on the user's machine/VPS, outside this web app. Does an EA exist, or should we provide an MQL5 EA + API contract?
- D3: NEXORA AI: existing service with an API, or should NEXORA MT5 use a built-in AI adapter behind the NEXORA AI contract for now?

## Backlog (deferred §73)
AI Marketplace, AI Tournament, Strategy Evolution, Autonomous Strategy Creation, Advanced Backtesting, Copy/Social Trading, Subscription/Strategy Marketplaces, Advanced Portfolio Optimization, Complex Quant Models.

## Checkpoint
- CP0: Project state + architecture lock recorded. No code built yet. Next: D1–D3, then Workstream 1.
