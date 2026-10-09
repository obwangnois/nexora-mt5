import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { checkPassword } from "./security";

describe("password policy", () => {
  it("accepts a strong password", () => expect(checkPassword("Strong#Pass12", "a@b.com")).toEqual([]));
  it("rejects under 10 chars", () => expect(checkPassword("Ab#1abcd")).toContain("TOO_SHORT"));
  it("requires uppercase", () => expect(checkPassword("lower#case12")).toContain("NO_UPPER"));
  it("requires a digit", () => expect(checkPassword("NoDigits#here")).toContain("NO_DIGIT"));
  it("requires a symbol", () => expect(checkPassword("NoSymbol1234A")).toContain("NO_SYMBOL"));
  it("rejects passwords containing the email name", () =>
    expect(checkPassword("Theeruth#2026", "theeruth@x.com")).toContain("CONTAINS_EMAIL"));
});
