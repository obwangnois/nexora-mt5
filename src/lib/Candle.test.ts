import { describe, expect, it } from "vitest";
import { validateCandle, type Candle } from "./candles";

const good: Candle = {
  time: "2026-10-15T10:00:00Z",
  open: 2400.1,
  high: 2400.5,
  low: 2399.8,
  close: 2400.3,
  volume: 120,
};

describe("validateCandle", () => {
  it("passes a normal candle", () => {
    const r = validateCandle(good);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("passes a flat candle with zero volume", () =>
    expect(validateCandle({ ...good, open: 2400, high: 2400, low: 2400, close: 2400, volume: 0 }).ok).toBe(true));
  it("fails an invalid time", () => expect(validateCandle({ ...good, time: "not-a-date" }).ok).toBe(false));
  it("fails a time not aligned to the minute", () =>
    expect(validateCandle({ ...good, time: "2026-10-15T10:00:30Z" }).ok).toBe(false));
  it("fails when high is below close", () => expect(validateCandle({ ...good, high: 2400.2 }).ok).toBe(false));
  it("fails when low is above open", () => expect(validateCandle({ ...good, low: 2400.2 }).ok).toBe(false));
  it("fails a zero or negative price", () => expect(validateCandle({ ...good, open: 0 }).ok).toBe(false));
  it("fails a NaN price", () => expect(validateCandle({ ...good, close: NaN }).ok).toBe(false));
  it("fails negative volume", () => expect(validateCandle({ ...good, volume: -1 }).ok).toBe(false));
});
