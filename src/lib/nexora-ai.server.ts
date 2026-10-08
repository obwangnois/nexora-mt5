// NEXORA AI abstraction (server-only). Swap the provider here for the external NEXORA AI
// service later; callers only see analyzeMarket(). The AI never sends orders and never
// receives broker credentials — only prices, candles and the canonical symbol.
import { z } from "zod";

export const tradePlanSchema = z.object({
  decision: z.enum(["BUY", "SELL", "WAIT", "NO_TRADE"]),
  entry: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  invalidation: z.string().max(800),
  expiry_minutes: z.number().int().min(1).max(1440),
  confidence: z.number().min(0).max(100),
  scenario: z.string().max(1200),
  reasons: z.array(z.string().max(600)).max(8),
  evidence: z.array(z.string().max(600)).max(8),
  assumptions: z.array(z.string().max(600)).max(8),
  warnings: z.array(z.string().max(600)).max(8),
});
export type TradePlan = z.infer<typeof tradePlanSchema>;

export type MarketInput = {
  symbol: string;
  digits: number;
  bid: number;
  ask: number;
  spread_points: number;
  candles: { t: string; o: number; h: number; l: number; c: number }[];
  language: "en" | "th";
};

export const NEXORA_AI_MODEL = "openai/gpt-6-astra";

const SYSTEM = `You are NEXORA AI, a disciplined market analyst for MT5.
You produce ONE structured trade plan proposal. You never execute trades; a deterministic risk engine and the user decide.
Rules: prefer WAIT or NO_TRADE when evidence is weak. For BUY: stop_loss < entry < take_profit. For SELL: take_profit < entry < stop_loss.
For WAIT/NO_TRADE set entry, stop_loss, take_profit to null. "confidence" is your analytical confidence (0-100), NOT a win probability.
Only use the data given; never invent news or indicators you cannot compute from the candles.`;

const str = { type: "string" };
const arr = { type: "array", items: str };
const num = { type: ["number", "null"] };
const PLAN_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["BUY", "SELL", "WAIT", "NO_TRADE"] },
    entry: num, stop_loss: num, take_profit: num, invalidation: str,
    expiry_minutes: { type: "integer" }, confidence: { type: "number" }, scenario: str,
    reasons: arr, evidence: arr, assumptions: arr, warnings: arr,
  },
  required: ["decision", "entry", "stop_loss", "take_profit", "invalidation", "expiry_minutes", "confidence", "scenario", "reasons", "evidence", "assumptions", "warnings"],
};

export async function analyzeMarket(input: MarketInput): Promise<TradePlan> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI_NOT_CONFIGURED");
  const lang = input.language === "th"
    ? "Write all free-text fields in Thai, but keep trading terms (BUY, SELL, Stop Loss, Take Profit, Entry, Spread, R:R) in English."
    : "Write all free-text fields in English.";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NEXORA_AI_MODEL, stream: true, store: false,
      reasoning: { effort: "low" },
      instructions: `${SYSTEM}\n${lang}\nKeep each text field short (max 2 sentences, max 4 list items).`,
      input: [{ role: "user", content: JSON.stringify({ ...input, candles_timeframe: "M1 (bid)", language: undefined }) }],
      text: { format: { type: "json_schema", name: "trade_plan", strict: true, schema: PLAN_JSON_SCHEMA } },
    }),
  });
  if (res.status === 429) throw new Error("AI_RATE_LIMITED");
  if (res.status === 402) throw new Error("AI_CREDITS_EXHAUSTED");
  if (res.status === 403) throw new Error("AI_ACCESS_DENIED");
  if (!res.ok || !res.body) throw new Error(`AI_ERROR_${res.status}`);
  // Consume SSE; collect output_text deltas.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let n;
    while ((n = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error("AI_FAILED");
      } catch (e) { if (e instanceof Error && e.message === "AI_FAILED") throw e; }
    }
  }
  if (!text) throw new Error("AI_NO_PLAN");
  const p = tradePlanSchema.safeParse(JSON.parse(text));
  if (!p.success) throw new Error("AI_BAD_PLAN");
  return p.data;
}
