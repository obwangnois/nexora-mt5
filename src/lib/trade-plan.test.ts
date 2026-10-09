import { describe, expect, it } from "vitest";
import { validatePlan, validateReasoning } from "./trade-plan";

describe("validatePlan", () => {
  it("accepts a correct BUY and computes R:R", () => {
    expect(validatePlan({ decision: "BUY", entry: 100, stop_loss: 99, take_profit: 102 })).toEqual({ ok: true, rr: 2 });
  });
  it("rejects SELL with levels on the wrong side", () => {
    expect(validatePlan({ decision: "SELL", entry: 100, stop_loss: 99, take_profit: 102 }).ok).toBe(false);
  });
  it("rejects missing levels", () => {
    expect(validatePlan({ decision: "BUY", entry: 100, stop_loss: null, take_profit: 101 }).ok).toBe(false);
  });
  it("WAIT needs no levels", () => {
    expect(validatePlan({ decision: "WAIT", entry: null, stop_loss: null, take_profit: null })).toEqual({ ok: true, rr: null });
  });
});

const buy = { decision: "BUY" as const, entry: 100, stop_loss: 99, take_profit: 102 };
const full = { facts: ["bid 100"], evidence: ["higher lows"], inferences: ["suggests uptrend"] };

describe("validateReasoning", () => {
  it("accepts a BUY with facts, evidence and inferences", () => {
    expect(validateReasoning({ ...buy, ...full }).ok).toBe(true);
  });
  it("rejects a BUY without evidence", () => {
    expect(validateReasoning({ ...buy, ...full, evidence: [] }).issue).toBe("NO_EVIDENCE");
  });
  it("rejects a BUY without facts", () => {
    expect(validateReasoning({ ...buy, ...full, facts: [] }).issue).toBe("NO_FACTS");
  });
  it("rejects confidence described as win probability (EN)", () => {
    expect(validateReasoning({ ...buy, ...full, scenario: "70% win probability" }).issue).toBe("CONFIDENCE_AS_WIN_PROBABILITY");
  });
  it("rejects confidence described as win probability (TH)", () => {
    expect(validateReasoning({ ...buy, ...full, reasons: ["โอกาสชนะ 80%"] }).issue).toBe("CONFIDENCE_AS_WIN_PROBABILITY");
  });
  it("WAIT may have empty reasoning lists", () => {
    expect(validateReasoning({ decision: "WAIT", entry: null, stop_loss: null, take_profit: null }).ok).toBe(true);
  });
});
