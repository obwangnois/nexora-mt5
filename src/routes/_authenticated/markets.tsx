import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/workstream-placeholder";
import { Badge } from "@/components/ui/badge";
import { accountsQuery } from "@/lib/accounts";
import { connectionState, healthQuery, quoteQuality, quotesQuery } from "@/lib/market-data";
import type { HealthState } from "@/lib/control-plane";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/markets")({
  head: () => ({
    meta: [
      { title: "Markets — NEXORA MT5" },
      { name: "description", content: "Live bid, ask and spread from your MT5 terminals, checked by the data quality gate." },
      { property: "og:title", content: "Markets — NEXORA MT5" },
      { property: "og:description", content: "Live MT5 prices with a data quality gate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketsPage,
});

function stateClass(s: HealthState) {
  return {
    HEALTHY: "border-primary/40 text-primary",
    DEGRADED: "border-accent-foreground/40 text-accent-foreground",
    OFFLINE: "border-destructive/50 text-destructive",
    UNKNOWN: "text-muted-foreground",
  }[s];
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function MarketsPage() {
  const { user } = Route.useRouteContext();
  const now = useNow();
  const { data: accounts = [] } = useQuery(accountsQuery(user.id));
  const { data: health = [] } = useQuery(healthQuery(user.id));
  const { data: quotes = [] } = useQuery(quotesQuery(user.id));
  const active = accounts.filter((a) => a.status !== "archived");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Markets" subtitle="Prices reported by the bridge on your MT5 terminals. Anything not fresh is marked not live." />

      {active.length === 0 && (
        <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          No accounts yet. <Link to="/accounts" className="underline">Link an MT5 account</Link> and install the bridge.
        </p>
      )}

      {active.map((a) => {
        const h = health.find((x) => x.account_id === a.id);
        const conn = connectionState(h, now);
        const rows = quotes.filter((q) => q.account_id === a.id);
        return (
          <section key={a.id} className="rounded-lg border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h2 className="font-medium">{a.label}</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  {a.brokers?.name} · {a.mt5_login}
                  {h ? ` · last heartbeat ${Math.round((now - new Date(h.last_heartbeat_at).getTime()) / 1000)}s ago` : " · never connected"}
                </p>
              </div>
              <Badge variant="outline" className={cn("font-mono", stateClass(conn))}>{conn}</Badge>
            </header>

            {rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No prices received yet. Install the bridge from the Accounts page and attach it to a chart.
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map((q) => {
                  const v = quoteQuality(q, conn, { now });
                  const d = q.digits ?? 5;
                  return (
                    <li key={q.id} className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-center">
                      <div>
                        <div className="font-medium">{q.canonical_symbol}</div>
                        <div className="font-mono text-xs text-muted-foreground">{q.broker_symbol}</div>
                      </div>
                      <div className={cn("font-mono tabular-nums", !v.ok && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                        <span className="text-xs text-muted-foreground">Bid </span>{Number(q.bid).toFixed(d)}
                      </div>
                      <div className={cn("font-mono tabular-nums", !v.ok && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                        <span className="text-xs text-muted-foreground">Ask </span>{Number(q.ask).toFixed(d)}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">spread {q.spread_points}</div>
                      <div className="col-span-2 sm:col-span-1">
                        {v.ok ? (
                          <Badge variant="outline" className={stateClass("HEALTHY")}>LIVE</Badge>
                        ) : (
                          <Badge variant="outline" className={stateClass("OFFLINE")} title={v.reasons.join(", ")}>
                            NOT LIVE · {v.reasons[0]}
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
