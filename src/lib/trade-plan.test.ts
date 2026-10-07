import { describe, expect, it } from "vitest";
import { validatePlan } from "./trade-plan";

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
