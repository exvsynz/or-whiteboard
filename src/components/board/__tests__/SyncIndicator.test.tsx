import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { SyncIndicator } from "../SyncIndicator";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SyncIndicator", () => {
  it("shows 離線模式 in local (demo) mode", () => {
    render(
      <SyncIndicator
        lastSyncedAt={null}
        error={null}
        connectionStatus="local"
      />,
    );
    expect(screen.getByText("離線模式")).toBeInTheDocument();
  });

  it("shows 尚未同步 when connected but never synced", () => {
    render(
      <SyncIndicator
        lastSyncedAt={null}
        error={null}
        connectionStatus="connected"
      />,
    );
    expect(screen.getByText("尚未同步")).toBeInTheDocument();
  });

  it("shows the error text with a red dot when an error is present", () => {
    render(<SyncIndicator lastSyncedAt={null} error="同步失敗" />);
    expect(screen.getByText("同步失敗")).toBeInTheDocument();
  });

  it("ticks the relative sync age as time passes", () => {
    const lastSyncedAt = new Date(Date.now() - 10_000);
    render(<SyncIndicator lastSyncedAt={lastSyncedAt} error={null} />);
    expect(screen.getByText("10 秒前同步")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("40 秒前同步")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("1 分鐘前同步")).toBeInTheDocument();
  });

  it("shows a visually distinct stale state after 2 minutes", () => {
    const lastSyncedAt = new Date(Date.now());
    const { container } = render(
      <SyncIndicator lastSyncedAt={lastSyncedAt} error={null} />,
    );
    expect(screen.getByText("剛剛同步")).toBeInTheDocument();
    expect(container.querySelector(".bg-green-500")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    const text = screen.getByText("3 分鐘前同步");
    expect(text.className).toContain("text-orange-600");
    expect(container.querySelector(".bg-orange-500")).not.toBeNull();
  });

  it("connectionStatus=disconnected takes priority and shows 連線中斷", () => {
    const { container } = render(
      <SyncIndicator
        lastSyncedAt={new Date()}
        error={null}
        connectionStatus="disconnected"
      />,
    );
    expect(screen.getByText("連線中斷")).toBeInTheDocument();
    expect(container.querySelector(".bg-red-500")).not.toBeNull();
  });

  it("connectionStatus=connecting shows 連線中…", () => {
    render(
      <SyncIndicator
        lastSyncedAt={null}
        error={null}
        connectionStatus="connecting"
      />,
    );
    expect(screen.getByText("連線中…")).toBeInTheDocument();
  });

  it("connectionStatus=connected falls through to the sync-age display", () => {
    render(
      <SyncIndicator
        lastSyncedAt={new Date(Date.now() - 30_000)}
        error={null}
        connectionStatus="connected"
      />,
    );
    expect(screen.getByText("30 秒前同步")).toBeInTheDocument();
  });
});
