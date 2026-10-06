import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function NotYetBuilt({ phase, items }: { phase: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/40 p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Planned · {phase}</p>
      <p className="mt-2 text-sm text-muted-foreground">This area is not active yet. Nothing here can place or change trades.</p>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {items.map((i) => (
          <li key={i} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />{i}</li>
        ))}
      </ul>
    </div>
  );
}
