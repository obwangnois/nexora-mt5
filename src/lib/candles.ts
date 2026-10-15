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
    if (c.high 
