// src/lib/candles.ts

export interface Candle {
  time: string; // ISO 8601, e.g. "2026-10-15T10:00:00Z"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleValidation {
  ok: boolean;
  errors: string[];
}

export interface CandleGap {
  from: string; // last candle before the gap
  to: string; // first candle after the gap
  missing: number; // number of missing M1 candles in between
}

export interface FindGapsOptions {
  /** Ignore gaps smaller than this many missing candles. Default 1. */
  minMissing?: number;
  /** Skip gaps that cover a whole Saturday (UTC), i.e. normal forex/gold weekend close. Default false. */
  ignoreWeekends?: boolean;
}

export type Timeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";

export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
};

export interface AggregateOptions {
  /**
   * Drop the last candle if it is still forming (its final minute has not arrived yet).
   * Default false.
   */
  dropIncompleteLast?: boolean;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

const isPrice = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** Checks one M1 candle for bad time, bad numbers, or impossible high/low. */
export function validateCandle(c: Candle): CandleValidation {
  const errors: string[] = [];

  const t = Date.parse(c.time);
  if (Number.isNaN(t)) errors.push("time is not a valid date");
  else if (t % MINUTE !== 0) errors.push("time is not aligned to a minute");

  const pricesOk = [c.open, c.high, c.low, c.close].every(isPrice);
  if (!pricesOk) errors.push("open/high/low/close must be positive numbers");

  if (typeof c.volume !== "number" || !Number.isFinite(c.volume) || c.volume < 0) {
    errors.push("volume must be zero or more");
  }

  // Only compare prices with each other once we know they are valid numbers
  if (pricesOk) {
    if (c.high < Math.max(c.open, c.close, c.low)) {
      errors.push("high is lower than open/close/low");
    }
    if (c.low > Math.min(c.open, c.close, c.high)) {
      errors.push("low is higher than open/close/high");
    }
  }

  return { ok: errors.length === 0, errors };
}

/** True when the missing range [firstMissing, lastMissing] contains an entire UTC Saturday. */
function coversFullSaturday(firstMissing: number, lastMissing: number): boolean {
  for (
    let day = Math.ceil(firstMissing / DAY) * DAY;
    day + DAY - MINUTE <= lastMissing;
    day += DAY
  ) {
    if (new Date(day).getUTCDay() === 6) return true;
  }
  return false;
}

/**
 * Finds missing M1 candles. Input may be unsorted and may contain duplicates;
 * candles with an invalid time are ignored.
 */
export function findGaps(candles: Candle[], options: FindGapsOptions = {}): CandleGap[] {
  const minMissing = Math.max(1, options.minMissing ?? 1);
  const ignoreWeekends = options.ignoreWeekends ?? false;

  const times = [...new Set(candles.map((c) => Date.parse(c.time)))]
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  const gaps: CandleGap[] = [];
  for (let i = 1; i < times.length; i++) {
    const prev = times[i - 1];
    const next = times[i];
    const missing = Math.floor((next - prev) / MINUTE) - 1;
    if (missing < minMissing) continue;
    if (ignoreWeekends && coversFullSaturday(prev + MINUTE, next - MINUTE)) continue;
    gaps.push({ from: iso(prev), to: iso(next), missing });
  }
  return gaps;
}

/**
 * Aggregates M1 candles into a higher timeframe.
 * - Buckets are aligned to the UTC clock (M5 -> :00, :05, ..., H4 -> 00:00, 04:00, ..., D1 -> 00:00 UTC).
 * - Input may be unsorted. For duplicate timestamps the later item wins.
 * - Candles that fail validateCandle are skipped.
 * - A bucket with missing minutes is still returned, built from the candles that exist.
 * - open = first candle's open, close = last candle's close, high/low = extremes, volume = sum.
 */
export function aggregateCandles(
  candles: Candle[],
  timeframe: Timeframe,
  options: AggregateOptions = {},
): Candle[] {
  const minutes = TIMEFRAME_MINUTES[timeframe];
  if (!minutes) throw new Error(`Unknown timeframe: ${String(timeframe)}`);
  const size = minutes * MINUTE;

  const byTime = new Map<number, Candle>();
  for (const c of candles) {
    if (!validateCandle(c).ok) continue;
    byTime.set(Date.parse(c.time), c);
  }
  const sorted = [...byTime.entries()].sort((a, b) => a[0] - b[0]);

  const out: Candle[] = [];
  let cur: Candle | null = null;
  let bucketStart = 0;
  let lastTime = 0;

  for (const [t, c] of sorted) {
    const start = Math.floor(t / size) * size;
    if (cur === null || start !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = start;
      cur = { time: iso(start), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
    lastTime = t;
  }

  if (cur) {
    const complete = lastTime >= bucketStart + size - MINUTE;
    if (complete || !options.dropIncompleteLast) out.push(cur);
  }
  return out;
}
