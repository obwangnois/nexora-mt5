import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { OctagonX, Play, ScanSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  auditQuery, controlStateQuery, friendlyDbError, rolesQuery, TRADING_MODES, type HealthState, type TradingMode,
} from "@/lib/control-plane";
import { PageHeader } from "@/components/workstream-placeholder";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — NEXORA MT5" }, { name: "description", content: "Connection, account, and AI trading status." }] }),
  component: HomePage,
});

// Phase 1: no connector exists yet, so every live component is honestly UNKNOWN/OFFLINE.
const HEALTH: { name: string; state: HealthState }[] = [
  { name: "Cloud", state: "HEALTHY" },
  { name: "MT5 / EA", state: "OFFLINE" },
  { name: "Broker", state: "UNKNOWN" },
  { name: "Market data", state: "UNKNOWN" },
  { name: "NEXORA AI", state: "UNKNOWN" },
];

function Dot({ s }: { s: HealthState }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full",
    s === "HEALTHY" && "bg-success", s === "DEGRADED" && "bg-warning",
    s === "OFFLINE" && "bg-destructive", s === "UNKNOWN" && "bg-muted-foreground")} />;
}

function HomePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: cs } = useQuery(controlStateQuery(user.id));
  const { data: roles = [] } = useQuery(rolesQuery(user.id));
  const { data: audit = [] } = useQuery(auditQuery(user.id, 8));
  const [busy, setBusy] = useState(false);
  const readOnly = roles.includes("viewer") && !roles.some((r) => r !== "viewer");

  async function update(patch: { trading_mode?: TradingMode; ai_trading_halted?: boolean }, ok: string) {
    setBusy(true);
    const { error } = await supabase.from("control_state").update(patch).eq("user_id", user.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(ok);
    qc.invalidateQueries({ queryKey: ["control_state", user.id] });
    qc.invalidateQueries({ queryKey: ["audit", user.id] });
  }

  const halted = cs?.ai_trading_halted ?? false;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Home" subtitle="Live status of your trading system">
        <div className="flex gap-2">
          <Button variant="outline" disabled title="Available after MT5 connection and AI integration">
            <ScanSearch className="mr-2 h-4 w-4" />Analyze
          </Button>
          {halted ? (
            <Button disabled={busy || readOnly} onClick={() => update({ ai_trading_halted: false }, "AI trading resumed")}>
              <Play className="mr-2 h-4 w-4" />Resume AI trading
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={busy || readOnly}><OctagonX className="mr-2 h-4 w-4" />Stop AI trading</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Stop AI trading?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Blocks all new AI-driven entries. Open positions stay open and their stop loss and take profit are kept.
                    This does not close anything.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => update({ ai_trading_halted: true }, "AI trading stopped")}>Stop AI trading</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </PageHeader>

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Account", "No account linked"],
          ["Equity", "—"],
          ["Daily P/L", "—"],
          ["Open positions", "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="mt-2 font-mono text-xl">{v}</p>
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
          <h2 className="font-medium">Trading mode</h2>
          <p className="mt-1 text-sm text-muted-foreground">Starts in Data only. Auto modes unlock only after MT5 and safety checks pass.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {TRADING_MODES.map((m) => {
              const active = cs?.trading_mode === m.value;
              return (
                <button key={m.value}
                  disabled={busy || readOnly || m.locked || active}
                  onClick={() => update({ trading_mode: m.value }, `Mode set to ${m.label}`)}
                  className={cn("rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed",
                    active ? "border-primary bg-primary/10" : "hover:bg-accent",
                    m.locked && "opacity-50")}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{m.label}</span>
                    {active && <span className="font-mono text-[10px] text-primary">ACTIVE</span>}
                    {m.locked && <span className="font-mono text-[10px] text-muted-foreground">LOCKED</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-medium">System health</h2>
          <ul className="mt-4 space-y-3">
            {HEALTH.map((h) => (
              <li key={h.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><Dot s={h.state} />{h.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{h.state}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">Signal: none · AI: not connected</p>
        </section>
      </div>

      <section className="mt-6 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Recent activity</h2>
        <ul className="mt-3 divide-y text-sm">
          {audit.length === 0 && <li className="py-2 text-muted-foreground">No activity yet.</li>}
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="font-mono text-xs">{a.action}</span>
              <span className="font-mono text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
