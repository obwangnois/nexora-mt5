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
1. [DONE] PROJECT FOUNDATION — enable Lovable Cloud, design system, app shell (HOME/MARKETS/ACCOUNTS/TRADING/AI/JOURNAL/MORE)
2. [DONE] AUTH & MULTI-USER (Phase 1; team sharing → later) — roles OWNER/ADMIN/TRADER/VIEWER, tenant isolation
3. [IN PROGRESS] BROKER & ACCOUNT MANAGER — broker capability profiles, canonical symbols, per-account risk profiles
4. [READY: approved — we supply MQL5 EA] MT5 CONNECTOR & MARKET DATA + quality gate
5. [QUEUED] MARKET ANALYSIS & CHART SNAPSHOT
6. [READY: approved — built-in AI behind abstraction] NEXORA AI INTEGRATION
7. [QUEUED] SIGNAL & VERSIONED TRADE PLAN ENGINE
8. [QUEUED] RISK, EXPOSURE, NEWS/SESSION, CIRCUIT BREAKER
9. [QUEUED] EXECUTION ENGINE — safety gate, state machine, idempotency, slippage
10. [QUEUED] POSITIONS / JOURNAL / RECONCILIATION
11. [QUEUED] NOTIFICATIONS (LINE/Telegram/Push/In-App) & HEALTH MONITOR
12. [QUEUED] TESTING / SIMULATION / RELEASE (test matrix §72)

## Open decisions (human)
- D1–D3 APPROVED 2026-10-06: Cloud on; we provide MQL5 EA; built-in AI via abstraction.
- Pending: real broker/account to test against (needed in Phase 3).

## Backlog (deferred §73)
AI Marketplace, AI Tournament, Strategy Evolution, Autonomous Strategy Creation, Advanced Backtesting, Copy/Social Trading, Subscription/Strategy Marketplaces, Advanced Portfolio Optimization, Complex Quant Models.

## Checkpoint
- CP0: State + architecture lock recorded.
- CP1 (Phase 1 DONE): email+Google sign-in; profiles, user_roles (OWNER default), control_state (DATA_ONLY default), audit_log; DB trigger locks AUTO/ULTIMATE modes, STOP AI TRADING never closes positions and is audited; shell nav HOME/MARKETS/ACCOUNTS/TRADING/AI/JOURNAL/MORE (desktop sidebar, mobile bottom bar).
- NEXT: Phase 2 Broker & Account Manager (broker capability profiles, symbol mapping, per-account risk profiles).
