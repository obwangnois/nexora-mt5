import { describe, expect, it } from "vitest";
import { connectionState, quoteQuality } from "./market-data";

const now = Date.parse("2026-10-06T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("connectionState", () => {
  it("is UNKNOWN without a heartbeat", () => expect(connectionState(null, now)).toBe("UNKNOWN"));
  it("is HEALTHY when fresh and connected", () =>
    expect(connectionState({ last_heartbeat_at: ago(3000), terminal_connected: true }, now)).toBe("HEALTHY"));
  it("is DEGRADED when terminal disconnected", () =>
    expect(connectionState({ last_heartbeat_at: ago(3000), terminal_connected: false }, now)).toBe("DEGRADED"));
  it("is OFFLINE after 60s", () =>
    expect(connectionState({ last_heartbeat_at: ago(61_000), terminal_connected: true }, now)).toBe("OFFLINE"));
});

describe("quoteQuality", () => {
  const good = { bid: 2400.1, ask: 2400.3, spread_points: 20, received_at: ago(1000), tick_time: ago(1000) };
  it("passes a fresh quote", () => expect(quoteQuality(good, "HEALTHY", { now }).ok).toBe(true));
  it("fails stale price", () => expect(quoteQuality({ ...good, received_at: ago(20_000) }, "HEALTHY", { now }).ok).toBe(false));
  // DEFAULT_MAX_SPREAD_POINTS is 3000, so use a value above it
  it("fails wide spread", () => expect(quoteQuality({ ...good, spread_points: 3001 }, "HEALTHY", { now }).ok).toBe(false));
  it("fails when connection not healthy", () => expect(quoteQuality(good, "OFFLINE", { now }).ok).toBe(false));
  it("fails inverted bid/ask", () => expect(quoteQuality({ ...good, ask: 2399 }, "HEALTHY", { now }).ok).toBe(false));
});
