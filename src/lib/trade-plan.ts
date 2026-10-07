// Deterministic validation of AI trade-plan geometry. AI output is advisory; anything
// inconsistent is downgraded to NO_TRADE here, before it can be stored as a proposal.
export type PlanCore = {
  decision: "BUY" | "SELL" | "WAIT" | "NO_TRADE";
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
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
