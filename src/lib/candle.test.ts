import { describe, expect, it } from "vitest";
import { aggregateCandles, findGaps, validateCandle, type Candle, type Timeframe } from "./candles";

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

describe("aggregateCandles", () => {
  const base = Date.parse("2026-10-15T10:00:00Z");
  const t = (i: number) => new Date(base + i * 60_000).toISOString().replace(".000Z", "Z");
  const flat = (i: number, price = 100, volume = 1): Candle => ({
    time: t(i),
    open: price,
    high: price,
    low: price,
    close: price,
    volume,
  });
  const run = (i: number, count: number) => Array.from({ length: count }, (_, k) => flat(i + k));

  // Five real-looking M1 candles for 10:00-10:04
  const m = (i: number, open: number, high: number, low: number, close: number, volume: number): Candle => ({
    time: t(i),
    open,
    high,
    low,
    close,
    volume,
  });
  const five = [
    m(0, 100, 105, 99, 101, 10),
    m(1, 101, 108, 100, 107, 20),
    m(2, 107, 109, 95, 96, 30),
    m(3, 96, 98, 94, 97, 40),
    m(4, 97, 103, 96, 102, 50),
  ];
  const expectedM5 = { time: "2026-10-15T10:00:00Z", open: 100, high: 109, low: 94, close: 102, volume: 150 };

  it("combines five M1 candles into one M5 candle", () =>
    expect(aggregateCandles(five, "M5")).toEqual([expectedM5]));

  it("aligns buckets to the clock, not to the first candle", () => {
    const r = aggregateCandles([flat(3), flat(4), flat(5)], "M5");
    expect(r.map((c) => c.time)).toEqual(["2026-10-15T10:00:00Z", "2026-10-15T10:05:00Z"]);
    expect(r[0].volume).toBe(2);
  });

  it("handles unsorted input", () =>
    expect(aggregateCandles([five[4], five[0], five[2], five[1], five[3]], "M5")).toEqual([expectedM5]));

  it("lets the later duplicate win", () =>
    expect(aggregateCandles([flat(0, 100), flat(0, 105)], "M5")[0].open).toBe(105));

  it("skips invalid candles", () => {
    const bad: Candle = { ...flat(1, 100), high: 50 };
    const r = aggregateCandles([flat(0, 100), bad, flat(2, 101)], "M5");
    expect(r).toHaveLength(1);
    expect(r[0].volume).toBe(2);
    expect(r[0].close).toBe(101);
  });

  it("returns an empty array for empty input", () => expect(aggregateCandles([], "H1")).toEqual([]));

  it("returns M1 candles unchanged for M1", () => {
    const list = run(0, 3);
    expect(aggregateCandles(list, "M1")).toEqual(list);
  });

  it("aggregates 61 minutes into two H1 candles", () => {
    const r = aggregateCandles(run(0, 61), "H1");
    expect(r).toHaveLength(2);
    expect(r[0].volume).toBe(60);
    expect(r[1].volume).toBe(1);
  });

  it("aligns H4 to 00/04/08 UTC", () =>
    expect(
      aggregateCandles(
        [{ ...flat(0), time: "2026-10-15T07:59:00Z" }, { ...flat(0), time: "2026-10-15T08:00:00Z" }],
        "H4",
      ).map((c) => c.time),
    ).toEqual(["2026-10-15T04:00:00Z", "2026-10-15T08:00:00Z"]));

  it("aligns D1 to midnight UTC", () =>
    expect(
      aggregateCandles(
        [{ ...flat(0), time: "2026-10-15T23:59:00Z" }, { ...flat(0), time: "2026-10-16T00:00:00Z" }],
        "D1",
      ).map((c) => c.time),
    ).toEqual(["2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z"]));

  it("keeps the forming last candle by default", () =>
    expect(aggregateCandles(run(0, 7), "M5")).toHaveLength(2));

  it("drops the forming last candle with dropIncompleteLast", () =>
    expect(aggregateCandles(run(0, 7), "M5", { dropIncompleteLast: true })).toHaveLength(1));

  it("keeps a complete last candle with dropIncompleteLast", () =>
    expect(aggregateCandles(run(0, 10), "M5", { dropIncompleteLast: true })).toHaveLength(2));

  it("throws on an unknown timeframe", () =>
    expect(() => aggregateCandles([], "M7" as Timeframe)).toThrow());
});
