import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase-client before importing useAuth
vi.mock("@/lib/supabase-client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  isDemoMode: true,
}));

import { useAuth } from "../useAuth";

describe("useAuth (demo mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns demo user when Supabase not configured", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toEqual({
      id: "demo",
      email: "demo@local",
      role: "editor",
    });
  });

  it("demo user has editor role", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user?.role).toBe("editor");
  });

  it("isAuthenticated is true in demo mode", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("isEditor is true in demo mode", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isEditor).toBe(true);
  });

  it("isViewer is false in demo mode", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isViewer).toBe(false);
  });

  it("isLoading is false in demo mode", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  it("error is null in demo mode", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.error).toBeNull();
  });

  it("login is a no-op in demo mode", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login("test@test.com", "password");
    });

    // User should remain the demo user
    expect(result.current.user).toEqual({
      id: "demo",
      email: "demo@local",
      role: "editor",
    });
  });

  it("logout is a no-op in demo mode", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    // User should remain the demo user
    expect(result.current.user).toEqual({
      id: "demo",
      email: "demo@local",
      role: "editor",
    });
  });
});
