import { describe, it, expect, vi } from "vitest";

// Plain-value mock (demo): drives the getAuthAdapter() default selection.
vi.mock("@/lib/supabase-client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  isDemoMode: true,
}));

import {
  createDemoAuthAdapter,
  createUnconfiguredAuthAdapter,
  getAuthAdapter,
} from "@/lib/auth-adapter";

describe("AuthAdapter", () => {
  it("demo adapter bypasses auth with an editor demo user", () => {
    const a = createDemoAuthAdapter();
    expect(a.kind).toBe("demo");
    expect(a.bypassAuth).toBe(true);
    expect(a.configured).toBe(true);
    expect(a.initialUser).toEqual({
      id: "demo",
      email: "demo@local",
      role: "editor",
    });
    expect(a.initialLoading).toBe(false);
  });

  it("demo adapter login/logout are no-ops with no error", async () => {
    const a = createDemoAuthAdapter();
    expect(await a.login("x", "y")).toEqual({ error: null });
    expect(await a.logout()).toEqual({ error: null });
  });

  it("unconfigured adapter is not configured and login reports the misconfig", async () => {
    const a = createUnconfiguredAuthAdapter();
    expect(a.kind).toBe("unconfigured");
    expect(a.bypassAuth).toBe(false);
    expect(a.configured).toBe(false);
    expect(a.initialUser).toBeNull();
    const { error } = await a.login("x", "y");
    expect(error).toContain("Supabase 未設定");
  });

  it("getAuthAdapter selects the demo adapter when isDemoMode", () => {
    expect(getAuthAdapter().kind).toBe("demo");
  });
});
