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
