import { describe, expect, it } from "vitest";
import { rowToCandle } from "./candle-rows";

const row = { bucket: "2026-10-15T10:00:00+00:00", open: 100, high: 105, low: 99, close: 101, ticks: 42 };

describe("rowToCandle", () => {
  it("maps bucket to time and ticks to volume", () =>
    expect(rowToCandle(row)).toEqual({
      time: "2026-10-15T10:00:00Z",
      open: 100,
      high: 105,
      low: 99,
      close: 101,
      volume: 42,
    }));
  it("normalizes a Z timestamp with milliseconds", () =>
    expect(rowToCandle({ ...row, bucket: "2026-10-15T10:00:00.000Z" }).time).toBe("2026-10-15T10:00:00Z"));
  it("keeps an unparseable bucket so it can be rejected later", () =>
    expect(rowToCandle({ ...row, bucket: "bad" }).time).toBe("bad"));
});
