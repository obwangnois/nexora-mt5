import { supabase } from "@/integrations/supabase/client";

export type PasswordIssue = "TOO_SHORT" | "NO_LOWER" | "NO_UPPER" | "NO_DIGIT" | "NO_SYMBOL" | "CONTAINS_EMAIL";

/** Password policy: ≥10 chars, lower, upper, digit, symbol, must not contain the email name. */
export function checkPassword(pw: string, email = ""): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (pw.length < 10) issues.push("TOO_SHORT");
  if (!/[a-z]/.test(pw)) issues.push("NO_LOWER");
  if (!/[A-Z]/.test(pw)) issues.push("NO_UPPER");
  if (!/\d/.test(pw)) issues.push("NO_DIGIT");
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push("NO_SYMBOL");
  const name = email.split("@")[0]?.toLowerCase() ?? "";
  if (name.length >= 3 && pw.toLowerCase().includes(name)) issues.push("CONTAINS_EMAIL");
  return issues;
}

/** Generic message for sign-in failures — never reveal whether an account exists. */
export const GENERIC_AUTH_ERROR = "Invalid email or password";

export type SecurityEvent =
  | "AUTH_LOGIN" | "AUTH_LOGOUT" | "AUTH_LOGOUT_ALL" | "AUTH_PASSWORD_CHANGED" | "AUTH_PASSWORD_RESET_COMPLETED";

/** Best-effort audit write; must never block the auth flow. */
export async function logSecurityEvent(action: SecurityEvent, method?: string) {
  try {
    await supabase.rpc("log_security_event", { p_action: action, p_details: method ? { method } : {} });
  } catch {
    /* ignore */
  }
}
