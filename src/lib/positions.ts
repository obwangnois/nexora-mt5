// Positions snapshot contract (EA → /api/public/mt5/positions) and the single definition of
// "reconciled". Reconciliation itself runs in the DB function connector_sync_positions.
import { z } from "zod";

const num = z.number().finite();
export const positionSchema = z.object({
  ticket: z.string().regex(/^[0-9]{1,20}$/),
  symbol: z.string().min(1).max(32),
  type: z.enum(["BUY", "SELL"]),
  volume: num.positive(),
  price_open: num.positive(),
  price_current: num.nonnegative(),
  sl: num.nonnegative(),
  tp: num.nonnegative(),
  profit: num,
  swap: num,
  magic: z.string().max(20),
  comment: z.string().max(64),
  time: z.string().datetime(),
});

export const snapshotSchema = z.object({
  login: z.string().regex(/^[0-9]{1,20}$/),
  seq: z.number().int().positive(),
  /** false when the EA could not read every position — the server then never infers closures. */
  complete: z.boolean(),
  terminal_connected: z.boolean(),
  positions: z.array(positionSchema).max(200),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export type SyncStatus = "SYNCED" | "PENDING" | "STALE" | "UNKNOWN";
export const SNAPSHOT_FRESH_MS = 15_000;

/**
 * SYNCED only when the last *complete* snapshot is fresh and the latest snapshot was complete.
 * A successful HTTP request alone never makes it green; a stale feed never means "all closed".
 */
export function syncStatus(
  s: { last_complete_at: string | null; last_snapshot_at: string | null; last_status: string } | null | undefined,
  now = Date.now(),
): SyncStatus {
  if (!s || !s.last_snapshot_at) return "UNKNOWN";
  const fresh = (t: string | null) => !!t && now - new Date(t).getTime() <= SNAPSHOT_FRESH_MS;
  if (!fresh(s.last_snapshot_at)) return "STALE";
  if (s.last_status !== "COMPLETE" || !fresh(s.last_complete_at)) return "PENDING";
  return "SYNCED";
}
