// Account-manager contracts shared by UI. RLS + DB triggers remain the authority;
// these helpers only describe and fetch what the database already enforces.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Broker = Database["public"]["Tables"]["brokers"]["Row"];
export type BrokerAccount = Database["public"]["Tables"]["broker_accounts"]["Row"];
export type RiskProfile = Database["public"]["Tables"]["risk_profiles"]["Row"];
export type RiskProfileUpdate = Database["public"]["Tables"]["risk_profiles"]["Update"];
export type SymbolAlias = Database["public"]["Tables"]["symbol_aliases"]["Row"];
export type AccountStatus = BrokerAccount["status"];

export type BrokerSummary = Pick<
  Broker,
  "id" | "code" | "name" | "min_lot" | "lot_step" | "max_lot" | "supports_hedging" | "default_currency"
>;

export type AccountWithBroker = Omit<BrokerAccount, "broker_id"> & { broker_id: string; brokers: BrokerSummary | null };

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export const brokersQuery = () =>
  queryOptions({
    queryKey: ["brokers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("brokers").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Broker[];
    },
  });

export const accountsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broker_accounts")
        .select(
          "*, brokers(id, code, name, min_lot, lot_step, max_lot, supports_hedging, default_currency)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AccountWithBroker[];
    },
  });

export const riskProfilesQuery = (userId: string, accountId: string) =>
  queryOptions({
    queryKey: ["risk_profiles", userId, accountId],
    enabled: Boolean(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_profiles")
        .select("*")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RiskProfile[];
    },
  });

export const symbolAliasesQuery = (userId: string, brokerId: string) =>
  queryOptions({
    queryKey: ["symbol_aliases", userId, brokerId],
    enabled: Boolean(brokerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("symbol_aliases")
        .select("*")
        .eq("user_id", userId)
        .eq("broker_id", brokerId)
        .order("canonical_symbol");
      if (error) throw error;
      return (data ?? []) as SymbolAlias[];
    },
  });

// Field metadata for the risk editor. Every bound maps to a database CHECK constraint,
// so the UI never lets a value through that the trigger layer would reject.
export type RiskField = {
  key: keyof Pick<
    RiskProfile,
    | "max_lot"
    | "max_open_positions"
    | "max_daily_loss"
    | "max_drawdown_pct"
    | "max_exposure_pct"
    | "min_stop_distance_points"
    | "news_lock_minutes"
  >;
  label: string;
  hint: string;
  step: string;
  min: number;
  max: number;
};

export const RISK_FIELDS: RiskField[] = [
  { key: "max_lot", label: "Max lot per order", hint: "Hard cap the executor may ever send.", step: "0.01", min: 0.01, max: 1000 },
  { key: "max_open_positions", label: "Max open positions", hint: "Concurrent positions allowed on this account.", step: "1", min: 1, max: 200 },
  { key: "max_daily_loss", label: "Max daily loss", hint: "In account currency. Breach blocks new entries for the day.", step: "10", min: 1, max: 1_000_000 },
  { key: "max_drawdown_pct", label: "Max drawdown %", hint: "From account peak. Breach halts execution.", step: "0.5", min: 0.5, max: 100 },
  { key: "max_exposure_pct", label: "Max exposure %", hint: "Total open volume as share of equity.", step: "1", min: 1, max: 100 },
  { key: "min_stop_distance_points", label: "Min stop distance (points)", hint: "Rejects plans with a stop closer than this.", step: "10", min: 0, max: 100000 },
  { key: "news_lock_minutes", label: "News lock (minutes)", hint: "No new entries around scheduled news.", step: "5", min: 0, max: 240 },
];

export function formatMoney(v: number | string | null | undefined, currency = "USD") {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}
