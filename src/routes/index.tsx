import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShieldCheck, Activity, Cpu, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXORA MT5 — Trading control, risk and execution" },
      { name: "description", content: "Control, risk and execution platform for MT5 with deterministic safety gates." },
      { property: "og:title", content: "NEXORA MT5" },
      { property: "og:description", content: "Control, risk and execution platform for MT5 with deterministic safety gates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && session) navigate({ to: "/home", replace: true });
  }, [loading, session, navigate]);

  const pillars = [
    { icon: Cpu, t: "AI proposes", d: "NEXORA AI analyzes and returns structured trade plans." },
    { icon: ShieldCheck, t: "Risk decides", d: "Deterministic rules are the final authority before any order." },
    { icon: Activity, t: "MT5 executes", d: "Every order is tracked, reconciled and journaled." },
    { icon: Lock, t: "Safe by default", d: "New accounts start in Data only. Auto trading is opt-in." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-mono text-sm font-semibold tracking-[0.2em] text-primary">NEXORA·MT5</span>
        <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Control · Risk · Execution</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-foreground md:text-6xl">
          AI intelligence. <span className="text-primary">Hard risk boundaries.</span>
        </h1>
        <p className="mt-6 max-w-xl text-muted-foreground">
          NEXORA MT5 sits between your AI and your broker. No AI decision reaches the market without passing every safety gate.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Get started</Link></Button>
        </div>
        <div className="mt-20 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.t} className="bg-card p-6">
              <p.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-medium text-foreground">{p.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
