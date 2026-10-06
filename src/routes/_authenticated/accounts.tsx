import { createFileRoute } from "@tanstack/react-router";
import { NotYetBuilt, PageHeader } from "@/components/workstream-placeholder";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "Accounts — NEXORA MT5" }, { name: "description", content: "Brokers, MT5 accounts and per-account risk profiles." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Accounts" subtitle="Brokers, MT5 accounts and per-account risk profiles." />
      <NotYetBuilt phase="Phase 2" items={["Broker capability profiles", "Symbol mapping (GOLD → XAUUSD)", "Per-account risk limits", "Account groups"]} />
    </div>
  ),
});
