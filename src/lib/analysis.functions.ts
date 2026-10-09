import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { connectionState, quoteQuality } from "@/lib/market-data";
import { validatePlan, validateReasoning } from "@/lib/trade-plan";

// Analyze one symbol on one account. Order of gates: ownership (RLS) → mode (DB trigger)
// → market-data quality gate → AI → deterministic plan validation → immutable versioned record.
export const analyzeSymbol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().uuid(), brokerSymbol: z.string().max(16), language: z.enum(["en", "th"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: cs } = await sb.from("control_state").select("trading_mode").eq("user_id", context.userId).maybeSingle();
    if (!cs || cs.trading_mode === "data_only") return { ok: false as const, error: "MODE_DATA_ONLY" };

    const [{ data: q }, { data: h }, { data: candles }] = await Promise.all([
      sb.from("market_quotes").select("*").eq("account_id", data.accountId).eq("broker_symbol", data.brokerSymbol).maybeSingle(),
      sb.from("account_health").select("*").eq("account_id", data.accountId).maybeSingle(),
      sb.from("market_candles").select("bucket,open,high,low,close").eq("account_id", data.accountId)
        .eq("broker_symbol", data.brokerSymbol).order("bucket", { ascending: false }).limit(120),
    ]);
    if (!q) return { ok: false as const, error: "NO_QUOTE" };

    const conn = connectionState(h);
    const verdict = quoteQuality(q, conn);
    const series = (candles ?? []).reverse().map((c) => ({ t: c.bucket, o: +c.open, h: +c.high, l: +c.low, c: +c.close }));
    const snapshot = { bid: +q.bid, ask: +q.ask, spread_points: q.spread_points, digits: q.digits ?? 5, tick_time: q.tick_time, connection: conn, candles: series };
    const base = { account_id: data.accountId, canonical_symbol: q.canonical_symbol, broker_symbol: q.broker_symbol, snapshot, user_id: context.userId };

    if (!verdict.ok) {
      const { data: row, error } = await sb.from("ai_analyses")
        .insert({ ...base, status: "blocked", decision: "NO_TRADE", gate: { ok: false, reasons: verdict.reasons } })
        .select("id").single();
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const, id: row.id };
    }

    const { analyzeMarket, NEXORA_AI_MODEL, NEXORA_PROMPT_STANDARD } = await import("@/lib/nexora-ai.server");
    try {
      const plan = await analyzeMarket({
        symbol: q.canonical_symbol, digits: snapshot.digits, bid: snapshot.bid, ask: snapshot.ask,
        spread_points: q.spread_points, candles: series, language: data.language,
      });
      const g = validatePlan(plan);
      const r = validateReasoning(plan);
      const issue = !g.ok ? g.issue : !r.ok ? r.issue : undefined;
      const valid = !issue;
      const finalPlan = valid ? { ...plan, rr: g.rr, standard: NEXORA_PROMPT_STANDARD } : { ...plan, standard: NEXORA_PROMPT_STANDARD, original_decision: plan.decision, decision: "NO_TRADE" as const, rr: null, warnings: [...plan.warnings, `VALIDATION: ${issue}`] };
      const { data: row, error } = await sb.from("ai_analyses")
        .insert({ ...base, status: "completed", decision: finalPlan.decision, plan: finalPlan, gate: { ok: true, reasons: [], plan_valid: valid, issue: issue ?? null }, model: NEXORA_AI_MODEL })
        .select("id").single();
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const, id: row.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI_ERROR";
      await sb.from("ai_analyses").insert({ ...base, status: "error", decision: "NO_TRADE", gate: { ok: true, reasons: [], ai_error: msg }, model: NEXORA_AI_MODEL });
      return { ok: false as const, error: msg };
    }
  });
