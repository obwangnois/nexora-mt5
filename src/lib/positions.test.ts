import { describe, expect, it } from "vitest";
import { snapshotSchema, syncStatus } from "./positions";

const now = Date.parse("2026-10-11T05:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const pos = { ticket: "123", symbol: "XAUUSD", type: "BUY", volume: 0.01, price_open: 2350, price_current: 2351, sl: 2340, tp: 2370, profit: 1, swap: 0, magic: "0", comment: "", time: ago(60_000) };

describe("position sync status", () => {
  it("is UNKNOWN before any snapshot", () => expect(syncStatus(null, now)).toBe("UNKNOWN"));
  it("is SYNCED with a fresh complete snapshot", () =>
    expect(syncStatus({ last_snapshot_at: ago(3000), last_complete_at: ago(3000), last_status: "COMPLETE" }, now)).toBe("SYNCED"));
  it("is STALE after 15 seconds without snapshots", () =>
    expect(syncStatus({ last_snapshot_at: ago(16_000), last_complete_at: ago(16_000), last_status: "COMPLETE" }, now)).toBe("STALE"));
  it("is PENDING when the latest snapshot was incomplete", () =>
    expect(syncStatus({ last_snapshot_at: ago(1000), last_complete_at: ago(1000), last_status: "INCOMPLETE" }, now)).toBe("PENDING"));
});

describe("snapshot contract", () => {
  it("accepts an empty but complete snapshot (zero positions)", () =>
    expect(snapshotSchema.safeParse({ login: "5057029588", seq: 1, complete: true, terminal_connected: true, positions: [] }).success).toBe(true));
  it("accepts a valid position", () =>
    expect(snapshotSchema.safeParse({ login: "1", seq: 2, complete: true, terminal_connected: true, positions: [pos] }).success).toBe(true));
  it("rejects a non-numeric ticket", () =>
    expect(snapshotSchema.safeParse({ login: "1", seq: 2, complete: true, terminal_connected: true, positions: [{ ...pos, ticket: "x1" }] }).success).toBe(false));
  it("rejects more than 200 positions", () =>
    expect(snapshotSchema.safeParse({ login: "1", seq: 2, complete: true, terminal_connected: true, positions: Array(201).fill(pos) }).success).toBe(false));
});
