// EA ← NEXORA MT5 order queue. Authenticated by the per-account connector token (verified in the DB).
// Each APPROVED order is handed out exactly once (APPROVED → SENT); UNKNOWN orders come back as
// reconcile-only lines ("R") so the EA inspects broker state instead of resending.
import { createFileRoute } from "@tanstack/react-router";
import { ordersToLines } from "@/lib/execution";

export const Route = createFileRoute("/api/public/mt5/orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-nexora-token") ?? "";
        if (!/^nxr_[0-9a-f]{64}$/.test(token)) return new Response("ERR INVALID_TOKEN", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("connector_pull_orders", { p_token: token });
        if (error) return new Response("ERR PULL_FAILED", { status: 500 });
        const r = data as { ok: boolean; error?: string; orders?: Array<Record<string, unknown>> };
        if (!r.ok) return new Response(`ERR ${r.error}`, { status: 401 });
        return new Response(`OK\n${ordersToLines(r.orders ?? [])}`, { headers: { "content-type": "text/plain" } });
      },
    },
  },
});
