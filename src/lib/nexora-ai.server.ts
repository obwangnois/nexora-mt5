// NEXORA AI abstraction (server-only). Swap the provider here for the external NEXORA AI
// service later; callers only see analyzeMarket(). The AI never sends orders and never
// receives broker credentials — only prices, candles and the canonical symbol.
import { z } from "zod";

export const tradePlanSchema = z.object({
  decision: z.enum(["BUY", "SELL", "WAIT", "NO_TRADE"]),
  entry: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  invalidation: z.string().max(400),
  expiry_minutes: z.number().int().min(1).max(1440),
  confidence: z.number().min(0).max(100),
  scenario: z.string().max(600),
  reasons: z.array(z.string().max(300)).max(6),
  evidence: z.array(z.string().max(300)).max(6),
  assumptions: z.array(z.string().max(300)).max(6),
  warnings: z.array(z.string().max(300)).max(6),
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

export const NEXORA_AI_MODEL = "google/gemini-3-flash-preview";

const SYSTEM = `You are NEXORA AI, a disciplined market analyst for MT5.
You produce ONE structured trade plan proposal. You never execute trades; a deterministic risk engine and the user decide.
Rules: prefer WAIT or NO_TRADE when evidence is weak. For BUY: stop_loss < entry < take_profit. For SELL: take_profit < entry < stop_loss.
For WAIT/NO_TRADE set entry, stop_loss, take_profit to null. "confidence" is your analytical confidence (0-100), NOT a win probability.
Only use the data given; never invent news or indicators you cannot compute from the candles.`;

export async function analyzeMarket(input: MarketInput): Promise<TradePlan> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI_NOT_CONFIGURED");
  const lang = input.language === "th"
    ? "Write all free-text fields in Thai, but keep trading terms (BUY, SELL, Stop Loss, Take Profit, Entry, Spread, R:R) in English."
    : "Write all free-text fields in English.";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NEXORA_AI_MODEL,
      messages: [
        { role: "system", content: `${SYSTEM}\n${lang}` },
        { role: "user", content: JSON.stringify({ ...input, candles_timeframe: "M1 (bid)", language: undefined }) },
      ],
      tools: [{
        type: "function",
        function: {
          name: "propose_trade_plan",
          description: "Return the structured trade plan.",
          parameters: {
            type: "object",
            properties: {
              decision: { type: "string", enum: ["BUY", "SELL", "WAIT", "NO_TRADE"] },
              entry: { type: ["number", "null"] }, stop_loss: { type: ["number", "null"] }, take_profit: { type: ["number", "null"] },
              invalidation: { type: "string" }, expiry_minutes: { type: "integer" }, confidence: { type: "number" },
              scenario: { type: "string" },
              reasons: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } },
              assumptions: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } },
            },
            required: ["decision", "entry", "stop_loss", "take_profit", "invalidation", "expiry_minutes", "confidence", "scenario", "reasons", "evidence", "assumptions", "warnings"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "propose_trade_plan" } },
    }),
  });
  if (res.status === 429) throw new Error("AI_RATE_LIMITED");
  if (res.status === 402) throw new Error("AI_CREDITS_EXHAUSTED");
  if (!res.ok) throw new Error(`AI_ERROR_${res.status}`);
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI_NO_PLAN");
  return tradePlanSchema.parse(JSON.parse(args));
}
