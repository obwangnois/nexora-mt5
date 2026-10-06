import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Read-only platform view. Database rules only allow SELECT for admins; nothing here can edit other users.
function useAdminData() {
  return useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const [profiles, roles, accounts, controls] = await Promise.all([
        supabase.from("profiles").select("id, display_name, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("broker_accounts").select("id, user_id, label, status, is_demo"),
        supabase.from("control_state").select("user_id, trading_mode, ai_trading_halted"),
      ]);
      for (const r of [profiles, roles, accounts, controls]) if (r.error) throw r.error;
      return {
        profiles: profiles.data ?? [],
        roles: roles.data ?? [],
        accounts: accounts.data ?? [],
        controls: controls.data ?? [],
      };
    },
  });
}

export function AdminOverview() {
  const { data, error, isLoading } = useAdminData();
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="font-medium">Super-Admin — all users (read-only)</h2>
      <p className="mt-1 text-sm text-muted-foreground">View only. Each user's data can only be changed by that user.</p>
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>}
      {data && (
        <ul className="mt-4 divide-y">
          {data.profiles.map((p) => {
            const roles = data.roles.filter((r) => r.user_id === p.id).map((r) => r.role.toUpperCase());
            const accts = data.accounts.filter((a) => a.user_id === p.id);
            const ctl = data.controls.find((c) => c.user_id === p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{p.display_name ?? "—"}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{roles.join(", ")}</p>
                </div>
                <div className="text-right font-mono text-xs text-muted-foreground">
                  <p>{accts.length} account(s) · {accts.filter((a) => a.status === "active").length} active</p>
                  <p>{ctl ? `${ctl.trading_mode}${ctl.ai_trading_halted ? " · AI STOPPED" : ""}` : "—"}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
