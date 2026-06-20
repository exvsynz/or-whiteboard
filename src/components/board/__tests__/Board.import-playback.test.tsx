import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BoardPerson } from "@/lib/board-constants";

// Demo mode so AuthProvider resolves to an editor without async auth.
vi.mock("@/lib/supabase-client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  isDemoMode: true,
}));

// Capture the playback-flag toggles + import calls Board makes. The refetch
// "stuck disabled" symptom only manifests in remote mode (demo refetch no-ops),
// so we assert handleImport's contract directly via a mocked useBoard.
const mocks = vi.hoisted(() => ({
  setPlaybackActive: vi.fn(),
  importPeople: vi.fn(async (): Promise<BoardPerson[]> => []),
}));

vi.mock("@/hooks/useBoard", () => {
  // A single stable return value so Board's effects don't churn on identity.
  const value = {
    people: [] as BoardPerson[],
    filteredPeople: [] as BoardPerson[],
    peopleByArea: {} as Record<string, BoardPerson[]>,
    movePerson: () => {},
    addPerson: () => {},
    removePerson: () => {},
    setPersonStatus: () => {},
    importPeople: mocks.importPeople,
    resetBoard: () => {},
    saveNow: async () => {},
    saveState: "idle" as const,
    setPlaybackActive: mocks.setPlaybackActive,
    searchFilter: "",
    setSearchFilter: () => {},
    error: null,
    isStale: false,
    isLoading: false,
    lastSyncedAt: null,
    connectionStatus: "local" as const,
    boardDate: "2099-01-01",
    setBoardDate: () => {},
    areaStatuses: new Map(),
    updateAreaStatus: () => {},
  };
  return { useBoard: () => value };
});

// Stub the import dialog so a test can fire onImport(people, animated) directly,
// without driving file upload + the animated toggle.
vi.mock("../ImportDialog", () => ({
  ImportDialog: ({
    onImport,
  }: {
    onImport: (people: BoardPerson[], animated: boolean) => void;
  }) => (
    <div>
      <button onClick={() => onImport([], false)}>trigger-plain-import</button>
      <button onClick={() => onImport([], true)}>
        trigger-animated-import
      </button>
    </div>
  ),
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
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Board import × playback (JOS-207 bug 4)", () => {
  it("a non-animated import clears playback-active so refetch is re-enabled", async () => {
    // A prior animated import may have left playbackActive true; a plain import
    // must reset it, else refetch early-returns forever.
    const user = userEvent.setup();
    renderBoard();
    await user.click(await screen.findByText("trigger-plain-import"));
    expect(mocks.setPlaybackActive).toHaveBeenCalledWith(false);
  });

  it("an animated import enables playback-active", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(await screen.findByText("trigger-animated-import"));
    expect(mocks.setPlaybackActive).toHaveBeenCalledWith(true);
  });
});
