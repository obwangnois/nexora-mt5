import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Archive, Boxes, Play, Plus, ShieldCheck, Tags, Trash2, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  accountsQuery, brokersQuery, RISK_FIELDS, riskProfilesQuery,
  symbolAliasesQuery, ACCOUNT_STATUS_LABEL,
  type AccountWithBroker, type BrokerAccount, type RiskProfile, type RiskField,
} from "@/lib/accounts";
import { friendlyDbError, rolesQuery } from "@/lib/control-plane";
import { PageHeader } from "@/components/workstream-placeholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — NEXORA MT5" },
      { name: "description", content: "Link MT5 accounts, map broker symbols and set per-account risk limits." },
    ],
  }),
  component: AccountsPage,
});

const LOGIN_RE = /^[0-9]{3,12}$/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const CANONICAL_RE = /^[A-Z0-9]{1,12}$/;
const BROKER_SYMBOL_RE = /^[A-Za-z0-9_.#]{1,16}$/;

function statusClass(s: BrokerAccount["status"]) {
  return s === "active" ? "bg-success" : s === "paused" ? "bg-warning" : "bg-muted-foreground";
}

function AccountsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: accounts = [], isLoading } = useQuery(accountsQuery(user.id));
  const { data: roles = [] } = useQuery(rolesQuery(user.id));
  const readOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const active = accounts.find((a) => a.id === selected) ?? accounts.find((a) => a.status !== "archived") ?? accounts[0];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["accounts", user.id] });
    qc.invalidateQueries({ queryKey: ["audit", user.id] });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Accounts"
        subtitle="Link MT5 accounts, map broker symbol names and set the limits this account may trade under."
      >
        <Button onClick={() => setAddOpen(true)} disabled={readOnly}>
          <Plus className="mr-2 h-4 w-4" />Add account
        </Button>
      </PageHeader>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/40 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Nothing linked yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add an MT5 account to start. Linking an account only registers it here — it does not place or change any trade,
            and no password is ever stored.
          </p>
          <Button className="mt-4" onClick={() => setAddOpen(true)} disabled={readOnly}>
            <Plus className="mr-2 h-4 w-4" />Add account
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <section className="space-y-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={cn(
                  "w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40",
                  active?.id === a.id && "border-primary/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{a.label}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusClass(a.status))} />
                    {ACCOUNT_STATUS_LABEL[a.status]}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {a.brokers?.name ?? "Broker"} · {a.mt5_login} · {a.currency}
                </p>
                <div className="mt-2 flex gap-1.5">
                  {a.is_demo ? <Badge variant="outline">Demo</Badge> : <Badge variant="outline">Live</Badge>}
                  {a.status === "archived" && <Badge variant="outline">Archived</Badge>}
                </div>
              </button>
            ))}
          </section>

          {active ? (
            <AccountDetail
              key={active.id}
              account={active}
              userId={user.id}
              readOnly={readOnly}
              onChanged={refresh}
            />
          ) : null}
        </div>
      )}

      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        userId={user.id}
        onCreated={(id) => {
          refresh();
          setSelected(id);
        }}
      />
    </div>
  );
}

function AccountDetail({
  account, userId, readOnly, onChanged,
}: {
  account: AccountWithBroker;
  userId: string;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery(riskProfilesQuery(userId, account.id));
  const profile = profiles.find((p) => p.is_active) ?? profiles[0];
  const [busy, setBusy] = useState(false);

  async function setStatus(status: BrokerAccount["status"], ok: string) {
    setBusy(true);
    const { error } = await supabase.from("broker_accounts").update({ status }).eq("id", account.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(ok);
    onChanged();
    qc.invalidateQueries({ queryKey: ["risk_profiles", userId, account.id] });
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">{account.label}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {account.brokers?.name} · login {account.mt5_login}
              {account.mt5_server ? ` · ${account.mt5_server}` : ""} · {account.currency}
              {account.leverage ? ` · leverage 1:${account.leverage}` : ""}
            </p>
          </div>
          <Badge variant="outline">{ACCOUNT_STATUS_LABEL[account.status]}</Badge>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          No password or broker credential is stored here. The MT5 bridge on your machine keeps them and only reports back
          the account number and server you entered.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {account.status !== "active" && (
            <Button size="sm" variant="outline" disabled={busy || readOnly} onClick={() => setStatus("active", "Account set active")}>
              <Play className="mr-2 h-4 w-4" />Set active
            </Button>
          )}
          {account.status === "active" && (
            <Button size="sm" variant="outline" disabled={busy || readOnly} onClick={() => setStatus("paused", "Account paused")}>
              <XCircle className="mr-2 h-4 w-4" />Pause
            </Button>
          )}
          {account.status !== "archived" && (
            <Button size="sm" variant="outline" disabled={busy || readOnly} onClick={() => setStatus("archived", "Account archived")}>
              <Archive className="mr-2 h-4 w-4" />Archive
            </Button>
          )}
        </div>
      </div>

      <RiskPanel
        profile={profile}
        userId={userId}
        account={account}
        readOnly={readOnly}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["risk_profiles", userId, account.id] });
          onChanged();
        }}
      />

      <SymbolPanel
        userId={userId}
        brokerId={account.broker_id}
        brokerName={account.brokers?.name ?? "this broker"}
        readOnly={readOnly}
      />
    </section>
  );
}

function RiskPanel({
  profile, userId, account, readOnly, onSaved,
}: {
  profile: RiskProfile | undefined;
  userId: string;
  account: AccountWithBroker;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!profile) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-medium">Risk limits</h2>
        <p className="mt-1 text-sm text-muted-foreground">No limits on this account yet.</p>
      </div>
    );
  }

  const valueFor = (f: RiskField) => draft[f.key] ?? String(profile[f.key]);

  async function save() {
    const patch: Record<string, number> = {};
    for (const f of RISK_FIELDS) {
      const raw = valueFor(f);
      const n = Number(raw);
      if (!raw.trim() || !Number.isFinite(n) || n < f.min || n > f.max) {
        toast.error(`${f.label} must be between ${f.min} and ${f.max}.`);
        return;
      }
      patch[f.key] = n;
    }
    setBusy(true);
    const { error } = await supabase.from("risk_profiles").update(patch).eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    setDraft({});
    toast.success("Risk limits saved");
    onSaved();
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium">Risk limits</h2>
        <Badge variant="outline" className="ml-auto">{profile.name}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        These limits apply to {account.label} only. The risk engine treats them as hard stops — AI cannot raise them.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {RISK_FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`risk-${f.key}`} className="text-xs uppercase tracking-wide text-muted-foreground">
              {f.label}
            </Label>
            <Input
              id={`risk-${f.key}`}
              className="mt-1 font-mono"
              inputMode="decimal"
              step={f.step}
              disabled={readOnly}
              value={valueFor(f)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>

      <Separator className="my-5" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Allow auto trading on this account</p>
          <p className="text-xs text-muted-foreground">
            Even when on, auto modes stay locked until the MT5 execution plane is verified.
          </p>
        </div>
        <Switch
          checked={profile.allow_auto_trade}
          disabled={readOnly || busy}
          onCheckedChange={async (v) => {
            setBusy(true);
            const { error } = await supabase.from("risk_profiles").update({ allow_auto_trade: v }).eq("id", profile.id);
            setBusy(false);
            if (error) {
              toast.error(friendlyDbError(error.message));
              return;
            }
            toast.success(v ? "Auto trading allowed for this account" : "Auto trading blocked for this account");
            onSaved();
          }}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={busy || readOnly}>Save limits</Button>
      </div>
    </div>
  );
}

function SymbolPanel({
  userId, brokerId, brokerName, readOnly,
}: {
  userId: string;
  brokerId: string;
  brokerName: string;
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const { data: aliases = [] } = useQuery(symbolAliasesQuery(userId, brokerId));
  const [canonical, setCanonical] = useState("");
  const [brokerSymbol, setBrokerSymbol] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const c = canonical.trim().toUpperCase();
    const b = brokerSymbol.trim();
    if (!CANONICAL_RE.test(c)) {
      toast.error("Use the standard name, e.g. XAUUSD (letters and numbers, max 12).");
      return;
    }
    if (!BROKER_SYMBOL_RE.test(b)) {
      toast.error("Broker symbol can use letters, numbers, dot, underscore, # and is max 16 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("symbol_aliases")
      .insert({ user_id: userId, broker_id: brokerId, canonical_symbol: c, broker_symbol: b });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    setCanonical("");
    setBrokerSymbol("");
    toast.success(`Added ${b} → ${c}`);
    qc.invalidateQueries({ queryKey: ["symbol_aliases", userId, brokerId] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("symbol_aliases").delete().eq("id", id);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    qc.invalidateQueries({ queryKey: ["symbol_aliases", userId, brokerId] });
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <Tags className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium">Symbol names</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell NEXORA what {brokerName} calls each instrument, so “GOLD” on this broker is understood as XAUUSD everywhere else.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label htmlFor="canonical" className="text-xs uppercase tracking-wide text-muted-foreground">Standard name</Label>
          <Input id="canonical" className="mt-1 font-mono" placeholder="XAUUSD" disabled={readOnly}
            value={canonical} onChange={(e) => setCanonical(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="broker_symbol" className="text-xs uppercase tracking-wide text-muted-foreground">Name at this broker</Label>
          <Input id="broker_symbol" className="mt-1 font-mono" placeholder="GOLD.a" disabled={readOnly}
            value={brokerSymbol} onChange={(e) => setBrokerSymbol(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={add} disabled={busy || readOnly}><Plus className="mr-2 h-4 w-4" />Add</Button>
        </div>
      </div>

      <div className="mt-4">
        {aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mappings yet. Add one for each instrument you plan to trade.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {aliases.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono">{a.broker_symbol}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono">{a.canonical_symbol}</span>
                <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => remove(a.id)} aria-label={`Remove ${a.broker_symbol}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddAccountDialog({
  open, onOpenChange, userId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onCreated: (id: string) => void;
}) {
  const { data: brokers = [] } = useQuery(brokersQuery());
  const [brokerId, setBrokerId] = useState("");
  const [label, setLabel] = useState("");
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [isDemo, setIsDemo] = useState(true);
  const [leverage, setLeverage] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setBrokerId("");
    setLabel("");
    setLogin("");
    setServer("");
    setCurrency("USD");
    setIsDemo(true);
    setLeverage("");
  }

  async function submit() {
    const broker = brokers.find((b) => b.id === brokerId);
    if (!broker) {
      toast.error("Choose a broker first.");
      return;
    }
    if (!LABEL_RE.test(label.trim())) {
      toast.error("Give the account a short name (letters, numbers, space, dot, dash or underscore).");
      return;
    }
    if (!LOGIN_RE.test(login.trim())) {
      toast.error("MT5 login must be 3–12 digits.");
      return;
    }
    if (!CURRENCY_RE.test(currency.trim().toUpperCase())) {
      toast.error("Currency must be three letters, e.g. USD.");
      return;
    }
    const lev = leverage.trim();
    if (lev && (!Number.isInteger(Number(lev)) || Number(lev) < 1 || Number(lev) > 3000)) {
      toast.error("Leverage must be a whole number between 1 and 3000.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase
      .from("broker_accounts")
      .insert({
        user_id: userId,
        broker_id: broker.id,
        label: label.trim(),
        mt5_login: login.trim(),
        mt5_server: server.trim() || null,
        currency: currency.trim().toUpperCase(),
        is_demo: isDemo,
        leverage: lev ? Number(lev) : null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    reset();
    onOpenChange(false);
    toast.success("Account linked");
    onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link an MT5 account</DialogTitle>
          <DialogDescription>
            Registers the account and its limits. Nothing is traded, and no broker password is stored here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="broker">Broker</Label>
            <Select value={brokerId} onValueChange={(v) => {
              setBrokerId(v);
              const b = brokers.find((x) => x.id === v);
              if (b) setCurrency(b.default_currency);
            }}>
              <SelectTrigger id="broker" className="mt-1"><SelectValue placeholder="Choose a broker" /></SelectTrigger>
              <SelectContent>
                {brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="label">Account name</Label>
            <Input id="label" className="mt-1" placeholder="Main demo" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="login">MT5 login</Label>
              <Input id="login" className="mt-1 font-mono" inputMode="numeric" placeholder="12345678"
                value={login} onChange={(e) => setLogin(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="server">Server</Label>
              <Input id="server" className="mt-1 font-mono" placeholder="ICMarkets-Demo"
                value={server} onChange={(e) => setServer(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" className="mt-1 font-mono" maxLength={3} value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </div>
            <div>
              <Label htmlFor="leverage">Leverage (optional)</Label>
              <Input id="leverage" className="mt-1 font-mono" inputMode="numeric" placeholder="500"
                value={leverage} onChange={(e) => setLeverage(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Demo account</span>
            </div>
            <Switch checked={isDemo} onCheckedChange={setIsDemo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Link account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
