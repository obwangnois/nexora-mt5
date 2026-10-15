// src/lib/candles-db.ts
import { supabase } from "@/integrations/supabase/client";
import type { Candle } from "./candles";
import { rowToCandle } from "./candle-rows";

export interface FetchCandlesParams {
  accountId: string;
  canonicalSymbol: string; // e.g. "XAUUSD"
  from: string; // inclusive, ISO 8601
  to: string; // exclusive, ISO 8601
  maxRows?: number; // safety cap, default 100,000
}

const PAGE = 1000; // Supabase returns at most 1000 rows per request

/** Reads candles from market_candles in time order, paging past the 1000-row limit. */
export async function fetchCandles(p: FetchCandlesParams): Promise<Candle[]> {
  const maxRows = p.maxRows ?? 100_000;
  const candles: Candle[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("market_candles")
      .select("bucket, open, high, low, close, ticks")
      .eq("account_id", p.accountId)
      .eq("canonical_symbol", p.canonicalSymbol)
      .gte("bucket", p.from)
      .lt("bucket", p.to)
      .order("bucket", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`fetchCandles failed: ${error.message}`);
    candles.push(...data.map(rowToCandle));
    if (data.length < PAGE || candles.length >= maxRows) break;
  }
  return candles;
}
