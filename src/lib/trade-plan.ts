// Deterministic validation of AI trade plans (Universal AI Master Prompt v3.0 framework).
// AI output is advisory; anything inconsistent is downgraded to NO_TRADE here, before it
// can be stored as a proposal. Risk rules downstream remain the final authority.
export type PlanCore = {
  decision: "BUY" | "SELL" | "WAIT" | "NO_TRADE";
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
};

export type PlanReasoning = {
  facts?: string[]; observations?: string[]; evidence?: string[]; inferences?: string[];
  assumptions?: string[]; reasons?: string[]; warnings?: string[]; scenario?: string; invalidation?: string;
};

export function validatePlan(p: PlanCore): { ok: boolean; rr: number | null; issue?: string } {
  if (p.decision === "WAIT" || p.decision === "NO_TRADE") return { ok: true, rr: null };
  const { entry: e, stop_loss: sl, take_profit: tp } = p;
  if (e == null || sl == null || tp == null || !(e > 0 && sl > 0 && tp > 0)) return { ok: false, rr: null, issue: "MISSING_LEVELS" };
  const good = p.decision === "BUY" ? sl < e && e < tp : tp < e && e < sl;
  if (!good) return { ok: false, rr: null, issue: "LEVELS_WRONG_SIDE" };
  const rr = Math.abs(tp - e) / Math.abs(e - sl);
  return { ok: true, rr: Math.round(rr * 100) / 100 };
}

// Phrases that present confidence as a win/profit probability (EN + TH).
const WIN_PROB = [/win\s*(rate|probability|chance)/i, /probability\s+of\s+(winning|profit|success)/i,
  /chance\s+of\s+(winning|profit|success)/i, /โอกาส(ชนะ|กำไร|สำเร็จ)/, /อัตราชนะ/];

// Epistemic checks: a directional plan must carry facts, evidence and inferences, and no
// text may describe confidence as a win probability.
export function validateReasoning(p: PlanCore & PlanReasoning): { ok: boolean; issue?: string } {
  const text = [p.scenario ?? "", p.invalidation ?? "", ...(p.facts ?? []), ...(p.observations ?? []), ...(p.evidence ?? []),
    ...(p.inferences ?? []), ...(p.assumptions ?? []), ...(p.reasons ?? [])].join("\n");
  if (WIN_PROB.some((r) => r.test(text))) return { ok: false, issue: "CONFIDENCE_AS_WIN_PROBABILITY" };
  if (p.decision === "BUY" || p.decision === "SELL") {
    if (!p.facts?.length) return { ok: false, issue: "NO_FACTS" };
    if (!p.evidence?.length) return { ok: false, issue: "NO_EVIDENCE" };
    if (!p.inferences?.length) return { ok: false, issue: "NO_INFERENCES" };
  }
  return { ok: true };
}
