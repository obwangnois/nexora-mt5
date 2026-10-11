// EA → NEXORA MT5 open-positions snapshot. Authenticated by the per-account connector token (verified in the DB).
// Reconciliation is observe-and-record only: it never sends, modifies or closes broker positions.
import { createFileRoute } from "@tanstack/react-router";
import { snapshotSchema } from "@/lib/positions";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const Route = createFileRoute("/api/public/mt5/positions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-nexora-token") ?? "";
        if (!/^nxr_[0-9a-f]{64}$/.test(token)) return json({ ok: false, error: "INVALID_TOKEN" }, 401);
        const raw = await request.text();
        if (raw.length > 64_000) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "BAD_JSON" }, 400); }
        const parsed = snapshotSchema.safeParse(body);
        if (!parsed.success) return json({ ok: false, error: "BAD_PAYLOAD", issues: parsed.error.issues.slice(0, 5) }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("connector_sync_positions", { p_token: token, p_payload: parsed.data });
        if (error) return json({ ok: false, error: "SYNC_FAILED" }, 500);
        const r = data as { ok: boolean; error?: string };
        return json(r, r.ok ? 200 : r.error === "INVALID_TOKEN" ? 401 : 403);
      },
    },
  },
});
