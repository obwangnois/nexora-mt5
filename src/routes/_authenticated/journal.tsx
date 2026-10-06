import { createFileRoute } from "@tanstack/react-router";
import { NotYetBuilt, PageHeader } from "@/components/workstream-placeholder";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({ meta: [{ title: "Journal — NEXORA MT5" }, { name: "description", content: "Complete trade lifecycle records and reviews." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Journal" subtitle="Complete trade lifecycle records and reviews." />
      <NotYetBuilt phase="Phase 6" items={["Before / during / after records", "MFE / MAE", "Intended vs actual", "Post-trade review"]} />
    </div>
  ),
});
