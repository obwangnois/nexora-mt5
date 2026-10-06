import { createFileRoute } from "@tanstack/react-router";
import { NotYetBuilt, PageHeader } from "@/components/workstream-placeholder";

export const Route = createFileRoute("/_authenticated/markets")({
  head: () => ({ meta: [{ title: "Markets — NEXORA MT5" }, { name: "description", content: "Live prices, spreads and charts from MT5." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Markets" subtitle="Live prices, spreads and charts from MT5." />
      <NotYetBuilt phase="Phase 3" items={["Bid / Ask / Spread", "Data quality gate", "Charts M1–D1", "Chart snapshots"]} />
    </div>
  ),
});
