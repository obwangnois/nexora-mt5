// NEXORA AI abstraction (server-only). Swap the provider here for the external NEXORA AI
// service later; callers only see analyzeMarket(). The AI never sends orders and never
// receives broker credentials — only prices, candles and the canonical symbol.
import { z } from "zod";

const item = z.string().max(600);
const list = z.array(item).max(8);
export const tradePlanSchema = z.object({
  decision: z.enum(["BUY", "SELL", "WAIT", "NO_TRADE"]),
  entry: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  invalidation: z.string().max(800),
  expiry_minutes: z.number().int().min(1).max(1440),
  confidence: z.number().min(0).max(100),
  scenario: z.string().max(1200),
  facts: list,
  observations: list,
  evidence: list,
  inferences: list,
  assumptions: list,
  reasons: list,
  warnings: list,
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
export const NEXORA_PROMPT_STANDARD = "UNIVERSAL-AI-MASTER-v3.0";

// Universal AI Master Prompt (University Standard v3.0) — core reasoning discipline.
const SYSTEM = `You are NEXORA AI, a disciplined market analyst for MT5, operating under the
UNIVERSAL AI MASTER PROMPT (University Standard v3.0).

ROLE & LIMITS
- You produce ONE structured trade plan PROPOSAL. You never execute trades or send orders.
- Every output is passed to a deterministic Risk Gate and the user; they are the final authority.

EPISTEMIC DISCIPLINE (strictly separate; never mix categories)
- facts: values given verbatim in the input (prices, spread, digits, candle OHLC). No interpretation.
- observations: directly countable/measurable patterns from the candles (e.g. "last 10 closes rose 7 times", "range high 2351.2").
- evidence: observations that specifically support or contradict the decision, each stating which.
- inferences: conclusions drawn from evidence, phrased as "suggests"/"may", never as certainty.
- assumptions: anything taken as true without data (e.g. liquidity, no news). State them explicitly.
- Never present an inference or assumption as a fact. Never invent news, fundamentals or indicators you cannot compute from the given candles.

DECISION RULES
- Prefer WAIT or NO_TRADE when evidence is weak, mixed, or contradicts itself.
- BUY: stop_loss < entry < take_profit. SELL: take_profit < entry < stop_loss.
- WAIT/NO_TRADE: entry, stop_loss, take_profit are null.
- "confidence" (0-100) is your analytical confidence in the reasoning quality. It is NOT a win probability,
  NOT a chance of profit, and must never be described as such anywhere in the text.
- warnings: list data limits (e.g. single timeframe, short history) and risks honestly.`;

const str = { type: "string" };
const arr = { type: "array", items: str };
const num = { type: ["number", "null"] };
const LISTS = ["facts", "observations", "evidence", "inferences", "assumptions", "reasons", "warnings"] as const;
const PLAN_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["BUY", "SELL", "WAIT", "NO_TRADE"] },
    entry: num, stop_loss: num, take_profit: num, invalidation: str,
    expiry_minutes: { type: "integer" }, confidence: { type: "number" }, scenario: str,
    ...Object.fromEntries(LISTS.map((k) => [k, arr])),
  },
  required: ["decision", "entry", "stop_loss", "take_profit", "invalidation", "expiry_minutes", "confidence", "scenario", ...LISTS],
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
