import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, KeyRound, PlugZap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyDbError } from "@/lib/control-plane";
import { connectionState, healthQuery, tokenQuery } from "@/lib/market-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const stateClass = {
  HEALTHY: "border-primary/40 text-primary",
  DEGRADED: "border-accent-foreground/40 text-accent-foreground",
  OFFLINE: "border-destructive/50 text-destructive",
  UNKNOWN: "text-muted-foreground",
} as const;

export function ConnectorPanel({ userId, accountId, readOnly }: { userId: string; accountId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data: token } = useQuery(tokenQuery(userId, accountId));
  const { data: health = [] } = useQuery(healthQuery(userId));
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setFresh(null), [accountId]);

  const h = health.find((x) => x.account_id === accountId);
  const conn = connectionState(h);

  async function issue() {
    if (token && !confirm(t("bridge.replaceQ"))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("issue_connector_token", { p_account_id: accountId });
    setBusy(false);
    if (error) { toast.error(friendlyDbError(error.message)); return; }
    setFresh(data);
    qc.invalidateQueries({ queryKey: ["connector_token", userId, accountId] });
  }

  async function revoke() {
    if (!confirm(t("bridge.revokeQ"))) return;
    setBusy(true);
    const { error } = await supabase.rpc("revoke_connector_token", { p_account_id: accountId });
    setBusy(false);
    if (error) { toast.error(friendlyDbError(error.message)); return; }
    setFresh(null);
    toast.success(t("bridge.revoked"));
    qc.invalidateQueries({ queryKey: ["connector_token", userId, accountId] });
  }

  const endpoint = `${origin}/api/public/mt5/ingest`;

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-medium"><PlugZap className="h-4 w-4" />{t("bridge.title")}</h3>
        <Badge variant="outline" className={cn("font-mono", stateClass[conn])}>{conn}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {h
          ? `${t("bridge.last")} ${new Date(h.last_heartbeat_at).toLocaleTimeString()} · EA ${h.ea_version ?? "?"} · ${t("bridge.terminal")} ${t(h.terminal_connected ? "bridge.connected" : "bridge.disconnected")} · ${t("bridge.trading")} ${t(h.trade_allowed ? "bridge.allowed" : "bridge.notAllowed")}`
          : t("bridge.never")}
      </p>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{t("bridge.token")}:</span>
          <span className="font-mono text-xs">{token ? `${token.token_prefix}…` : t("bridge.none")}</span>
          <Button size="sm" variant="outline" disabled={busy || readOnly} onClick={issue}>
            <KeyRound className="mr-2 h-4 w-4" />{t(token ? "bridge.replace" : "bridge.create")}
          </Button>
          {token && (
            <Button size="sm" variant="ghost" disabled={busy || readOnly} onClick={revoke}>{t("bridge.revoke")}</Button>
          )}
        </div>

        {fresh && (
          <div className="rounded-md border border-primary/40 bg-muted p-3">
            <p className="text-xs font-medium">{t("bridge.copyNow")}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{fresh}</code>
              <Button size="icon" variant="ghost" aria-label="Copy token"
                onClick={() => { navigator.clipboard.writeText(fresh); toast.success(t("bridge.copied")); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>{t("bridge.step1")}</li>
          <li>{t("bridge.step2")} <code className="break-all font-mono">{origin}</code>.</li>
          <li>{t("bridge.step3")} <code className="break-all font-mono">{endpoint}</code></li>
        </ol>
        <Button size="sm" variant="outline" asChild>
          <a href="/ea/NexoraBridge.mq5" download><Download className="mr-2 h-4 w-4" />{t("bridge.download")}</a>
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("bridge.safety")}
        </p>
      </div>
    </div>
  );
}
