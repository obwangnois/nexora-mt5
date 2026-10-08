import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/workstream-placeholder";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { quotesQuery } from "@/lib/market-data";
import { analyzeSymbol } from "@/lib/analysis.functions";
import { useI18n, type TKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "AI — NEXORA MT5" },
      { name: "description", content: "NEXORA AI analysis and structured trade plans." },
      { property: "og:title", content: "AI — NEXORA MT5" },
      { property: "og:description", content: "Structured, versioned AI trade plans gated by data quality." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiPage,
});

type Plan = {
  decision?: string; entry?: number | null; stop_loss?: number | null; take_profit?: number | null; rr?: number | null;
  confidence?: number; scenario?: string; invalidation?: string; expiry_minutes?: number;
  reasons?: string[]; evidence?: string[]; warnings?: string[];
};

function Chart({ accountId, symbol }: { accountId: string; symbol: string }) {
  const { t } = useI18n();
  const { data = [] } = useQuery({
    queryKey: ["candles", accountId, symbol],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("market_candles").select("bucket,open,high,low,close")
        .eq("account_id", accountId).eq("broker_symbol", symbol).order("bucket", { ascending: false }).limit(90);
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });
  if (!data.length) return <p className="text-sm text-muted-foreground">{t("ai.chart")}: —</p>;
  const hi = Math.max(...data.map((c) => +c.high)), lo = Math.min(...data.map((c) => +c.low));
  const W = 600, H = 200, w = W / data.length, y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="mb-2 font-mono text-xs text-muted-foreground">{t("ai.chart")} · {symbol}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" preserveAspectRatio="none">
        {data.map((c, i) => {
          const up = +c.close >= +c.open;
          const cls = up ? "fill-primary stroke-primary" : "fill-destructive stroke-destructive";
          return (
            <g key={c.bucket} className={cls}>
              <line x1={i * w + w / 2} x2={i * w + w / 2} y1={y(+c.high)} y2={y(+c.low)} strokeWidth={1} />
              <rect x={i * w + w * 0.15} width={w * 0.7} y={Math.min(y(+c.open), y(+c.close))}
                height={Math.max(1, Math.abs(y(+c.open) - y(+c.close)))} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function List({ title, items }: { title: string; items?: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div><p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="mt-1 list-disc pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  );
}

function AiPage() {
  const { user } = Route.useRouteContext();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const run = useServerFn(analyzeSymbol);
  const { data: quotes = [] } = useQuery(quotesQuery(user.id));
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const cur = useMemo(() => quotes.find((q) => `${q.account_id}|${q.broker_symbol}` === sel) ?? quotes[0], [quotes, sel]);

  const { data: history = [] } = useQuery({
    queryKey: ["ai_analyses", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_analyses").select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function analyze() {
    if (!cur) return;
    setBusy(true);
    try {
      const r = await run({ data: { accountId: cur.account_id, brokerSymbol: cur.broker_symbol, language: lang } });
      if (r.ok) toast.success(t("ai.done"));
      else {
        const k = `ai.err.${r.error}` as TKey;
        toast.error(k === "ai.err.MODE_DATA_ONLY" || k === "ai.err.NO_QUOTE" ? t(k) : r.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["ai_analyses", user.id] });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="NEXORA AI" subtitle={t("ai.subtitle")} />
      {!quotes.length ? <p className="text-sm text-muted-foreground">{t("ai.noQuotes")}</p> : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">{t("ai.symbol")}
              <select className="mt-1 block rounded-md border bg-background px-3 py-2 text-sm"
                value={cur ? `${cur.account_id}|${cur.broker_symbol}` : ""} onChange={(e) => setSel(e.target.value)}>
                {quotes.map((q) => (
                  <option key={q.id} value={`${q.account_id}|${q.broker_symbol}`}>{q.canonical_symbol} ({q.broker_symbol})</option>
                ))}
              </select>
            </label>
            <Button onClick={analyze} disabled={busy}>{busy ? t("ai.running") : t("ai.analyze").toUpperCase()}</Button>
          </div>
          {cur && <Chart accountId={cur.account_id} symbol={cur.broker_symbol} />}
        </>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("ai.history")}</h2>
        {!history.length && <p className="text-sm text-muted-foreground">{t("ai.none")}</p>}
        <div className="space-y-3">
          {history.map((a) => {
            const p = (a.plan ?? {}) as Plan;
            const gate = (a.gate ?? {}) as { reasons?: string[]; ai_error?: string };
            return (
              <article key={a.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.decision === "BUY" || a.decision === "SELL" ? "default" : "secondary"}>{a.decision}</Badge>
                  <span className="font-mono text-sm">{a.canonical_symbol}</span>
                  <span className="text-xs text-muted-foreground">v{a.version} · {a.status} · {new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.status === "blocked" && <p className="mt-2 text-sm text-destructive">{t("ai.blocked")}: {(gate.reasons ?? []).join(", ")}</p>}
                {a.status === "error" && <p className="mt-2 text-sm text-destructive">{gate.ai_error}</p>}
                {a.status === "completed" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">
                      <span>Entry: {p.entry ?? "—"}</span><span>Stop Loss: {p.stop_loss ?? "—"}</span>
                      <span>Take Profit: {p.take_profit ?? "—"}</span><span>R:R: {p.rr ?? "—"}</span>
                      <span>{t("ai.expiry")}: {p.expiry_minutes}</span>
                    </div>
                    <p className="text-sm">{t("ai.confidence")}: <b>{p.confidence}</b></p>
                    {p.scenario && <p className="text-sm"><span className="text-muted-foreground">{t("ai.scenario")}: </span>{p.scenario}</p>}
                    {p.invalidation && <p className="text-sm"><span className="text-muted-foreground">{t("ai.invalidation")}: </span>{p.invalidation}</p>}
                    <List title={t("ai.reasons")} items={p.reasons} />
                    <List title={t("ai.evidence")} items={p.evidence} />
                    <List title={t("ai.warnings")} items={p.warnings} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
