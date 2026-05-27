import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase-client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  isDemoMode: true,
}));

import Home from "./page";
import { AuthProvider } from "@/components/auth";

describe("Home page", () => {
  it("renders the board heading", () => {
    render(
      <AuthProvider>
        <Home />
      </AuthProvider>,
    );
    expect(screen.getByText("手術室人力白板")).toBeInTheDocument();
  });
});
