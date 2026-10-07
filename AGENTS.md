<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# NEXORA MT5 engineering rules
- Project state, workstreams and checkpoints live in `roadmap.md` — it is the single source of truth for continuation.
- Safety rules (mode locks, halt semantics, audit) are enforced in database triggers/RLS, never only in UI — UI cannot be trusted as a safety gate.
- Every user-scoped table keys on `user_id = auth.uid()` with RLS; roles live in `user_roles` via `has_role()` — prevents privilege escalation and cross-tenant reads.
- Audit rows are written by SECURITY DEFINER triggers and are read-only for clients — keeps the trace tamper-proof.
- Signed-in app pages live under `src/routes/_authenticated/` (client-only, `getUser()` gate); public pages at top level.
- AI access goes through a NEXORA AI abstraction (server-only) so the built-in model can be swapped for the external NEXORA AI service.
- Health tiles must show UNKNOWN/OFFLINE until a real heartbeat exists — never display stale or fake data as live.
- Every table's primary key is a database-generated `uuid`; the auth user id doubles as `profiles.id`. Broker-side identifiers (MT5 login, ticket, broker symbol text) are ordinary scoped-unique text columns, never primary keys or join keys — internal keys stay unguessable and broker data stays comparable across accounts.
- Broker credentials (passwords, API keys) are never stored in the database, logs or client state — they stay on the user's own machine running the EA.
- Platform `admin` role is read-only across all tenants: SELECT-only RLS policies via `has_role(auth.uid(),'admin')`, no cross-tenant write policies — oversight without weakening per-user control. Admin is granted only by direct role insert, never from the UI.

- The MT5 EA authenticates with a per-account connector token whose SHA-256 hash alone is stored; ingest validation and ownership checks run in a SECURITY DEFINER function callable only by service_role — the EA has no user session and the token must never be recoverable from the database.
- The market-data quality gate lives in pure functions in `src/lib/market-data.ts` — one definition of "live" shared by every consumer and unit-tested.
- UI text goes through `src/lib/i18n.tsx` (`useI18n().t(key)`), one typed dictionary per language — a missing translation is a type error, not a silent fallback.
