import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — NEXORA MT5" },
      { name: "description", content: "Sign in to your NEXORA MT5 control panel." },
      { property: "og:title", content: "Sign in — NEXORA MT5" },
      { property: "og:description", content: "Sign in to your NEXORA MT5 control panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { session } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate({ to: "/home", replace: true });
  }, [session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin + "/home" },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign in failed");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8">
        <span className="font-mono text-xs font-semibold tracking-[0.2em] text-primary">NEXORA·MT5</span>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        {sent ? (
          <p className="mt-6 text-sm text-muted-foreground">Check your email to confirm your account, then sign in.</p>
        ) : (
          <>
            <Button variant="outline" className="mt-6 w-full" onClick={google}>Continue with Google</Button>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </>
        )}
        <button
          className="mt-6 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setSent(false); }}
        >
          {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
