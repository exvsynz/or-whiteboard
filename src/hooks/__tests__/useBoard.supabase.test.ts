import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BoardPerson } from "@/lib/board-constants";

// ---- controllable async helpers ----

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---- fake supabase client (channel plumbing only — data layer is mocked) ----

// Hoisted so the mock factory below (and backend-config, which now builds the
// backend at module load) can reach fakeClient at import time without a TDZ.
const { fakeClient, fakeChannel, subscribeCallbacks } = vi.hoisted(() => {
  const subscribeCallbacks: Array<(status: string) => void> = [];
  const fakeChannel = {
    on: vi.fn(),
    subscribe: vi.fn((cb: (status: string) => void) => {
      subscribeCallbacks.push(cb);
      return fakeChannel;
    }),
  };
  fakeChannel.on.mockReturnValue(fakeChannel);
  const fakeClient = {
    channel: vi.fn(() => fakeChannel),
    removeChannel: vi.fn(),
  };
  return { fakeClient, fakeChannel, subscribeCallbacks };
});

vi.mock("@/lib/supabase-client", () => ({
  get supabase() {
    return fakeClient;
  },
  isSupabaseConfigured: true,
  isDemoMode: false,
}));

vi.mock("@/lib/board-data", () => ({
  fetchRoster: vi.fn(),
  fetchAreaStatuses: vi.fn(async () => new Map()),
  upsertAssignment: vi.fn(async () => {}),
  addPersonToRoster: vi.fn(),
  removeFromRoster: vi.fn(async () => {}),
  replaceBoard: vi.fn(),
  setAreaStatus: vi.fn(async () => {}),
  setAssignmentStatus: vi.fn(async () => {}),
}));

import { useBoard } from "../useBoard";
import {
  fetchRoster,
  upsertAssignment,
  addPersonToRoster,
} from "@/lib/board-data";
import { localDateString } from "@/lib/board-export";

const mockFetchRoster = vi.mocked(fetchRoster);
const mockUpsert = vi.mocked(upsertAssignment);
const mockAddPerson = vi.mocked(addPersonToRoster);

function person(id: string, area: string | null): BoardPerson {
  return {
    id,
    name: `護理師${id}`,
    role: "麻醉護理師",
    color: "bg-amber-100",
    area,
    status: "assigned",
  };
}

const TODAY = localDateString();
const TOMORROW = "2099-01-01";

async function renderLoaded(initialRoster: BoardPerson[]) {
  mockFetchRoster.mockResolvedValueOnce(initialRoster);
  const rendered = renderHook(() => useBoard());
  await waitFor(() => {
    expect(rendered.result.current.isLoading).toBe(false);
  });
  return rendered;
}

describe("useBoard (Supabase mode, mocked data layer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeChannel.on.mockReturnValue(fakeChannel);
    subscribeCallbacks.length = 0;
    localStorage.clear();
  });

  it("loads the roster from the server, not localStorage", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);
    expect(result.current.people).toHaveLength(1);
    expect(result.current.people[0].area).toBe("R1");
    expect(mockFetchRoster).toHaveBeenCalledWith(fakeClient, TODAY);
    expect(result.current.lastSyncedAt).not.toBeNull();
  });

  it("a stale refetch from the previous date never lands on the new date", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);

    // Refetch for TODAY goes in flight (triggered by reconnect callback)
    // and stalls on the network.
    const stale = deferred<BoardPerson[]>();
    mockFetchRoster.mockReturnValueOnce(stale.promise);
    act(() => {
      subscribeCallbacks.at(-1)?.("SUBSCRIBED");
    });
    await waitFor(() => {
      // debounce (300ms) has fired and the stale fetch is in flight
      expect(mockFetchRoster).toHaveBeenCalledTimes(2);
    });

    // Switch dates; the new date's load resolves immediately.
    mockFetchRoster.mockResolvedValueOnce([person("p2", "R5")]);
    act(() => {
      result.current.setBoardDate(TOMORROW);
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.people[0]?.id).toBe("p2");

    // The stale TODAY response finally arrives — it must be discarded.
    act(() => {
      stale.resolve([person("p1", "R31")]);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.people).toHaveLength(1);
    expect(result.current.people[0].id).toBe("p2");
    expect(result.current.people[0].area).toBe("R5");
  });

  it("an in-flight write for date A does not reposition the person on date B", async () => {
    // p1 is rostered on BOTH dates (person ids are global).
    const { result } = await renderLoaded([person("p1", "R1")]);

    const upsert = deferred<void>();
    mockUpsert.mockReturnValueOnce(upsert.promise);

    act(() => {
      result.current.movePerson("p1", "R2");
    });
    // Date switch flushes the pending write into its network flight…
    mockFetchRoster.mockResolvedValueOnce([person("p1", "R9")]);
    act(() => {
      result.current.setBoardDate(TOMORROW);
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    // …and date B's roster must show date B's area, not date A's target.
    expect(result.current.people[0].area).toBe("R9");

    act(() => {
      upsert.resolve();
    });
  });

  it("a failed write rolls back only on its own date and only from its target position", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);

    const upsert = deferred<void>();
    mockUpsert.mockReturnValueOnce(upsert.promise);

    act(() => {
      result.current.movePerson("p1", "R2");
    });
    // saveNow flushes deterministically (no debounce timer reliance).
    let saved!: Promise<void>;
    act(() => {
      saved = result.current.saveNow();
    });
    act(() => {
      upsert.reject(new Error("network down"));
    });
    await act(async () => {
      await saved;
    });

    await waitFor(() => {
      expect(result.current.error).toContain("移動失敗");
    });
    expect(result.current.people[0].area).toBe("R1");
  });

  it("a failed write does NOT roll back if the person has since moved again", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);

    const first = deferred<void>();
    mockUpsert.mockReturnValueOnce(first.promise);

    act(() => {
      result.current.movePerson("p1", "R2");
    });
    let saved!: Promise<void>;
    act(() => {
      saved = result.current.saveNow(); // R2 write goes in flight
    });
    act(() => {
      result.current.movePerson("p1", "R3"); // newer position
    });
    act(() => {
      first.reject(new Error("boom"));
    });
    await act(async () => {
      await saved;
    });

    // R2's failure must not clobber the newer R3 position.
    expect(result.current.people[0].area).toBe("R3");
  });

  it("addPerson does not append to another date's board", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);

    const add = deferred<BoardPerson>();
    mockAddPerson.mockReturnValueOnce(add.promise);
    act(() => {
      result.current.addPerson("新人");
    });

    mockFetchRoster.mockResolvedValueOnce([]);
    act(() => {
      result.current.setBoardDate(TOMORROW);
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      add.resolve(person("p-new", null));
    });
    await new Promise((r) => setTimeout(r, 20));
    // The person belongs to TODAY's roster, not TOMORROW's board.
    expect(result.current.people).toHaveLength(0);
  });

  it("addPerson dedupes when the realtime echo already delivered the person", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);

    const add = deferred<BoardPerson>();
    mockAddPerson.mockReturnValueOnce(add.promise);
    act(() => {
      result.current.addPerson("新人");
    });

    // Simulate the realtime-echo refetch landing first, already
    // containing the new person.
    const echoed = [person("p1", "R1"), person("p-new", null)];
    mockFetchRoster.mockResolvedValueOnce(echoed);
    act(() => {
      subscribeCallbacks.at(-1)?.("SUBSCRIBED");
    });
    await waitFor(() => {
      expect(result.current.people).toHaveLength(2);
    });

    act(() => {
      add.resolve(person("p-new", null));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.people).toHaveLength(2);
  });
});
