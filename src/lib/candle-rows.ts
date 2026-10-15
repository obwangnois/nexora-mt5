// src/lib/candle-rows.ts
import type { Candle } from "./candles";

/** The columns we read from the market_candles table. */
export interface CandleRow {
  bucket: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number;
}

/** Converts a market_candles row to a Candle (bucket -> time, ticks -> volume). */
export function rowToCandle(row: CandleRow): Candle {
  const ms = Date.parse(row.bucket);
  return {
    // An unparseable bucket is kept as-is so validateCandle can reject it
    time: Number.isNaN(ms) ? row.bucket : new Date(ms).toISOString().replace(".000Z", "Z"),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.ticks,
  };
}
