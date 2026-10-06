// Control-plane contracts shared by UI. Server-side rules (RLS + DB triggers) are the authority;
// these types/labels only describe them.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TradingMode = Database["public"]["Enums"]["trading_mode"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const TRADING_MODES: { value: TradingMode; label: string; hint: string; locked?: boolean }[] = [
  { value: "data_only", label: "Data only", hint: "Receive market data. No analysis, no orders." },
  { value: "analysis", label: "Analysis", hint: "AI may analyze. No signals, no orders." },
  { value: "signal", label: "Signal", hint: "AI may propose trade plans. You approve every order." },
  { value: "auto_trade", label: "Auto trade", hint: "Locked until execution plane is verified.", locked: true },
  { value: "ultimate_auto", label: "Ultimate auto", hint: "Locked until execution plane is verified.", locked: true },
];

export type HealthState = "HEALTHY" | "DEGRADED" | "OFFLINE" | "UNKNOWN";

export const controlStateQuery = (userId: string) =>
  queryOptions({
    queryKey: ["control_state", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("control_state")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const rolesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["roles", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.role);
    },
  });

export const auditQuery = (userId: string, limit = 20) =>
  queryOptions({
    queryKey: ["audit", userId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export function friendlyDbError(message: string) {
  if (message.includes("AUTO_TRADE_LOCKED"))
    return "Auto modes stay locked until the MT5 connection and safety checks are verified.";
  if (message.includes("HALTED")) return "AI trading is stopped. Resume it before changing to auto modes.";
  if (message.toLowerCase().includes("row-level security") || message.includes("permission"))
    return "Your role does not allow this action.";
  return message;
}
