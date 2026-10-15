import { describe, expect, it } from "vitest";
import { findGaps, validateCandle, type Candle } from "./candles";

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

describe("findGaps", () => {
  const at = (time: string): Candle => ({ ...good, time });

  it("returns nothing for consecutive candles", () =>
    expect(
      findGaps([at("2026-10-15T10:00:00Z"), at("2026-10-15T10:01:00Z"), at("2026-10-15T10:02:00Z")]),
    ).toEqual([]));

  it("returns nothing for empty or single-candle input", () => {
    expect(findGaps([])).toEqual([]);
    expect(findGaps([at("2026-10-15T10:00:00Z")])).toEqual([]);
  });

  it("finds a gap and counts missing candles", () =>
    expect(
      findGaps([at("2026-10-15T10:00:00Z"), at("2026-10-15T10:01:00Z"), at("2026-10-15T10:05:00Z")]),
    ).toEqual([{ from: "2026-10-15T10:01:00Z", to: "2026-10-15T10:05:00Z", missing: 3 }]));

  it("handles unsorted input and duplicates", () =>
    expect(
      findGaps([
        at("2026-10-15T10:02:00Z"),
        at("2026-10-15T10:00:00Z"),
        at("2026-10-15T10:00:00Z"),
        at("2026-10-15T10:01:00Z"),
      ]),
    ).toEqual([]));

  it("ignores candles with an invalid time", () =>
    expect(findGaps([at("2026-10-15T10:00:00Z"), at("bad"), at("2026-10-15T10:01:00Z")])).toEqual([]));

  it("respects minMissing", () =>
    expect(
      findGaps([at("2026-10-15T10:00:00Z"), at("2026-10-15T10:04:00Z")], { minMissing: 5 }),
    ).toEqual([]));

  describe("weekends (2026-10-17 is a Saturday)", () => {
    const fri = at("2026-10-16T21:59:00Z");
    const sun = at("2026-10-18T22:00:00Z");

    it("reports a weekend gap by default", () => expect(findGaps([fri, sun])).toHaveLength(1));
    it("skips a full-Saturday gap with ignoreWeekends", () =>
      expect(findGaps([fri, sun], { ignoreWeekends: true })).toEqual([]));
    it("still reports a weekday gap with ignoreWeekends", () =>
      expect(
        findGaps([at("2026-10-14T10:00:00Z"), at("2026-10-14T10:30:00Z")], { ignoreWeekends: true }),
      ).toHaveLength(1));
    it("still reports a partial-Saturday gap with ignoreWeekends", () =>
      expect(
        findGaps([at("2026-10-16T22:00:00Z"), at("2026-10-17T12:00:00Z")], { ignoreWeekends: true }),
      ).toHaveLength(1));
  });
});
