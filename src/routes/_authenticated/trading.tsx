import { createFileRoute } from "@tanstack/react-router";
import { NotYetBuilt, PageHeader } from "@/components/workstream-placeholder";

export const Route = createFileRoute("/_authenticated/trading")({
  head: () => ({ meta: [{ title: "Trading — NEXORA MT5" }, { name: "description", content: "Signals, trade plans, approvals and positions." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Trading" subtitle="Signals, trade plans, approvals and positions." />
      <NotYetBuilt phase="Phase 5–6" items={["Signal lifecycle", "Versioned trade plans", "Execution safety gate", "Positions & protection"]} />
    </div>
  ),
});
