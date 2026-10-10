// Execution state machine contract (§ execution engine). The database trigger
// execution_transition_guard enforces the same map; this copy drives the UI and tests.
import { z } from "zod";

export const EXEC_STATES = ["REQUESTED", "VALIDATING", "APPROVED", "SENT", "ACKNOWLEDGED", "FILLED", "REJECTED", "CANCELLED", "UNKNOWN"] as const;
export type ExecState = (typeof EXEC_STATES)[number];

export const TRANSITIONS: Record<ExecState, ExecState[]> = {
  REQUESTED: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["APPROVED", "REJECTED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["ACKNOWLEDGED", "FILLED", "REJECTED", "UNKNOWN"],
  ACKNOWLEDGED: ["FILLED", "REJECTED", "UNKNOWN"],
  UNKNOWN: ["ACKNOWLEDGED", "FILLED", "REJECTED"],
  FILLED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const canTransition = (from: ExecState, to: ExecState) => TRANSITIONS[from].includes(to);
export const isTerminal = (s: ExecState) => TRANSITIONS[s].length === 0;
/** Only orders not yet handed to the bridge may be cancelled; nothing is ever resent. */
export const canCancel = (s: ExecState) => s === "REQUESTED" || s === "APPROVED";
export const IN_QUEUE: ExecState[] = ["APPROVED", "SENT", "ACKNOWLEDGED", "UNKNOWN"];

export const reportSchema = z.object({
  order_id: z.string().uuid(),
  state: z.enum(["ACKNOWLEDGED", "FILLED", "REJECTED"]),
  ticket: z.string().regex(/^[0-9]{1,20}$/).optional(),
  price: z.number().positive().optional(),
  volume: z.number().positive().optional(),
  retcode: z.number().int().optional(),
  message: z.string().max(200).optional(),
});

/** Line format the EA can split without a JSON parser: mode|id|symbol|dir|volume|sl|tp|deviation */
export function ordersToLines(orders: Array<Record<string, unknown>>): string {
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return orders
    .map((o) => ["mode", "id", "broker_symbol", "direction", "volume", "stop_loss", "take_profit", "max_slippage_points"].map((k) => o[k]).map(v).join("|"))
    .join("\n");
}
