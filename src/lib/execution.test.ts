import { describe, expect, it } from "vitest";
import { canCancel, canTransition, isTerminal, ordersToLines } from "./execution";

describe("execution state machine", () => {
  it("follows the happy path REQUESTED → VALIDATING → APPROVED → SENT → ACKNOWLEDGED → FILLED", () => {
    expect(canTransition("REQUESTED", "VALIDATING")).toBe(true);
    expect(canTransition("VALIDATING", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "SENT")).toBe(true);
    expect(canTransition("SENT", "ACKNOWLEDGED")).toBe(true);
    expect(canTransition("ACKNOWLEDGED", "FILLED")).toBe(true);
  });
  it("never resends: SENT and UNKNOWN cannot go back to APPROVED or SENT", () => {
    expect(canTransition("SENT", "APPROVED")).toBe(false);
    expect(canTransition("UNKNOWN", "SENT")).toBe(false);
    expect(canTransition("UNKNOWN", "APPROVED")).toBe(false);
  });
  it("UNKNOWN resolves only through broker reconciliation", () => {
    expect(canTransition("UNKNOWN", "FILLED")).toBe(true);
    expect(canTransition("UNKNOWN", "CANCELLED")).toBe(false);
  });
  it("sent orders cannot be cancelled", () => {
    expect(canCancel("APPROVED")).toBe(true);
    expect(canCancel("SENT")).toBe(false);
  });
  it("FILLED, REJECTED, CANCELLED are terminal", () => {
    expect(isTerminal("FILLED") && isTerminal("REJECTED") && isTerminal("CANCELLED")).toBe(true);
  });
  it("serializes orders for the EA", () => {
    expect(ordersToLines([{ mode: "X", id: "a", broker_symbol: "XAUUSD", direction: "BUY", volume: 0.01, stop_loss: 2340, take_profit: 2360, max_slippage_points: 30 }]))
      .toBe("X|a|XAUUSD|BUY|0.01|2340|2360|30");
  });
});
