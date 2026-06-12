import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  isDemoMode: true,
}));

import { AuthProvider } from "@/components/auth";
import Board from "../Board";

function renderBoard() {
  return render(
    <AuthProvider>
      <Board />
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "test-new-id" as ReturnType<typeof crypto.randomUUID>,
  );
  // Board's reset asks for confirmation; jsdom's confirm is a no-op stub.
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("Board", () => {
  it("renders all section headings", async () => {
    renderBoard();
    expect(screen.getByText("手術室人力白板")).toBeInTheDocument();
    // The board body renders after the async initial load.
    expect(await screen.findByText("左側固定任務")).toBeInTheDocument();
    expect(screen.getByText("手術室 R1-R31")).toBeInTheDocument();
    expect(screen.getByText("班別")).toBeInTheDocument();
    expect(screen.getByText("特殊區域")).toBeInTheDocument();
    expect(screen.getByText("未分派", { selector: "h2" })).toBeInTheDocument();
  });

  it("renders initial demo people", async () => {
    renderBoard();
    expect(await screen.findByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("林怡君")).toBeInTheDocument();
    expect(screen.getByText("陳美玲")).toBeInTheDocument();
    expect(screen.getByText("張志宏")).toBeInTheDocument();
    expect(screen.getByText("黃雅婷")).toBeInTheDocument();
    expect(screen.getByText("蔡宗翰")).toBeInTheDocument();
  });

  it("renders sync indicator", () => {
    renderBoard();
    expect(screen.getByText("離線模式")).toBeInTheDocument();
  });

  it("search filters people by name", async () => {
    const user = userEvent.setup();
    renderBoard();
    const searchInput = screen.getByPlaceholderText("搜尋姓名／角色／位置");

    await user.type(searchInput, "王小明");

    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.queryByText("林怡君")).not.toBeInTheDocument();
  });

  it("add person creates new person in 未分派", async () => {
    const user = userEvent.setup();
    renderBoard();
    const nameInput = screen.getByPlaceholderText("新增人名");
    const addButton = screen.getByRole("button", { name: /新增/ });

    await user.type(nameInput, "新人測試");
    await user.click(addButton);

    expect(screen.getByText("新人測試")).toBeInTheDocument();
  });

  it("reset restores initial state", async () => {
    const user = userEvent.setup();
    renderBoard();

    const nameInput = screen.getByPlaceholderText("新增人名");
    const addButton = screen.getByRole("button", { name: /新增/ });
    await user.type(nameInput, "臨時人員");
    await user.click(addButton);
    expect(screen.getByText("臨時人員")).toBeInTheDocument();

    const resetButton = screen.getByRole("button", { name: /重置/ });
    await user.click(resetButton);

    expect(screen.queryByText("臨時人員")).not.toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
  });
});
