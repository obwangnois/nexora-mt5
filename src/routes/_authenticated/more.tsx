import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { auditQuery, profileQuery, rolesQuery } from "@/lib/control-plane";
import { PageHeader } from "@/components/workstream-placeholder";
import { AdminOverview } from "@/components/admin-overview";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logSecurityEvent } from "@/lib/security";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/more")({
  head: () => ({ meta: [{ title: "More — NEXORA MT5" }, { name: "description", content: "Profile, roles and audit trail." }] }),
  component: MorePage,
});

function MorePage() {
  const { user } = Route.useRouteContext();
  const { t } = useI18n();
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const { data: profile } = useQuery(profileQuery(user.id));
  const { data: roles = [] } = useQuery(rolesQuery(user.id));
  const { data: audit = [] } = useQuery(auditQuery(user.id, 50));

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logSecurityEvent("AUTH_LOGOUT");
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      await router.invalidate();
      navigate({ to: "/auth", replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={t("nav.more")} subtitle="Profile, permissions and audit trail" />
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
        {[
          ["Name", profile?.display_name ?? "—"],
          ["Email", user.email ?? "—"],
          ["Role", roles.map((r) => r.toUpperCase()).join(", ") || "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="mt-2 truncate text-sm">{v}</p>
          </div>
        ))}
      </section>

      {/* ปุ่มออกจากระบบสำหรับ iPad และมือถือ */}
      <div className="flex justify-end">
        <Button
          variant="destructive"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "กำลังออกจากระบบ..." : t("nav.signOut")}
        </Button>
      </div>

      {roles.includes("admin") && <AdminOverview />}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-medium">Audit trail</h2>
        <p className="mt-1 text-sm text-muted-foreground">Every control change is recorded automatically and cannot be edited.</p>
        <ul className="mt-4 divide-y">
          {audit.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="font-mono text-xs text-muted-foreground">{new Date(a.created_at).toISOString()}</span>
              </div>
              <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-muted-foreground">{JSON.stringify(a.details)}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
