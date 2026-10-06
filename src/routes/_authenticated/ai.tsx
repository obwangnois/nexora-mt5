import { createFileRoute } from "@tanstack/react-router";
import { NotYetBuilt, PageHeader } from "@/components/workstream-placeholder";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "AI — NEXORA MT5" }, { name: "description", content: "NEXORA AI analysis and structured trade plans." }] }),
  component: () => (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="AI" subtitle="NEXORA AI analysis and structured trade plans." />
      <NotYetBuilt phase="Phase 4" items={["Analyze market", "Analyze chart", "Create trade plan", "Post-trade review"]} />
    </div>
  ),
});
