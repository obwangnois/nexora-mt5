// EA → NEXORA MT5 broker result for one order. Only valid state-machine transitions are accepted (DB).
import { createFileRoute } from "@tanstack/react-router";
import { reportSchema } from "@/lib/execution";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const Route = createFileRoute("/api/public/mt5/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-nexora-token") ?? "";
        if (!/^nxr_[0-9a-f]{64}$/.test(token)) return json({ ok: false, error: "INVALID_TOKEN" }, 401);
        const raw = await request.text();
        if (raw.length > 4_000) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "BAD_JSON" }, 400); }
        const parsed = reportSchema.safeParse(body);
        if (!parsed.success) return json({ ok: false, error: "BAD_PAYLOAD" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("connector_report_order", { p_token: token, p_payload: parsed.data });
        if (error) return json({ ok: false, error: "REPORT_FAILED" }, 500);
        const r = data as { ok: boolean; error?: string };
        return json(r, r.ok ? 200 : r.error === "INVALID_TOKEN" ? 401 : 409);
      },
    },
  },
});
