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
  removeFromRoster,
  replaceBoard,
  setAssignmentStatus,
  setAreaStatus,
} from "@/lib/board-data";
import { localDateString } from "@/lib/board-export";

const mockFetchRoster = vi.mocked(fetchRoster);
const mockUpsert = vi.mocked(upsertAssignment);
const mockAddPerson = vi.mocked(addPersonToRoster);
const mockRemove = vi.mocked(removeFromRoster);
const mockReplace = vi.mocked(replaceBoard);
const mockSetStatus = vi.mocked(setAssignmentStatus);
const mockSetAreaStatus = vi.mocked(setAreaStatus);

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

describe("useBoard guards (JOS-204): non-move mutation correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeChannel.on.mockReturnValue(fakeChannel);
    subscribeCallbacks.length = 0;
    localStorage.clear();
  });

  // ---- defect 1: stale move write must not resurrect a removed/replaced row ----

  it("removePerson cancels a pending move write so it can't resurrect the row", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);
    act(() => result.current.movePerson("p1", "R2")); // enqueues a debounced write
    act(() => result.current.removePerson("p1")); // must cancel the pending write
    mockRemove.mockResolvedValueOnce(undefined);
    let saved!: Promise<void>;
    act(() => {
      saved = result.current.saveNow();
    });
    await act(async () => {
      await saved;
    });
    expect(mockUpsert).not.toHaveBeenCalled(); // the pending write was never sent
  });

  it("removePerson issues its delete only after an in-flight move write settles", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);
    const upsert = deferred<void>();
    mockUpsert.mockReturnValueOnce(upsert.promise);
    act(() => result.current.movePerson("p1", "R2"));
    let saved!: Promise<void>;
    act(() => {
      saved = result.current.saveNow(); // upsert now in flight
    });
    const remove = deferred<void>();
    mockRemove.mockReturnValueOnce(remove.promise);
    act(() => result.current.removePerson("p1"));

    // While the upsert is still in flight, the delete must NOT have been issued
    // — drainWrites is awaiting the in-flight write. (A plain wait here, with
    // the upsert unresolved, is what gives this assertion teeth: a drain that
    // failed to await would have let the delete through by now.)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockRemove).not.toHaveBeenCalled();

    // Once the upsert settles, the delete proceeds.
    act(() => upsert.resolve());
    await act(async () => {
      await saved;
    });
    await waitFor(() => expect(mockRemove).toHaveBeenCalled());
    act(() => remove.resolve());
  });

  // ---- defect 2: async callbacks must not land date A's result on date B ----

  it("importPeople does not render date A's roster after a mid-flight date switch", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);
    const replace = deferred<BoardPerson[]>();
    mockReplace.mockReturnValueOnce(replace.promise);
    let imp!: Promise<BoardPerson[]>;
    act(() => {
      imp = result.current.importPeople([person("x", "R5")]);
    });
    mockFetchRoster.mockResolvedValueOnce([]);
    act(() => result.current.setBoardDate(TOMORROW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => replace.resolve([person("x", "R5")]));
    await act(async () => {
      await imp;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.people).toHaveLength(0); // date B board untouched
  });

  it("resetBoard does not clear date B after a mid-flight date switch", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);
    const replace = deferred<BoardPerson[]>();
    mockReplace.mockReturnValueOnce(replace.promise);
    act(() => result.current.resetBoard());
    mockFetchRoster.mockResolvedValueOnce([person("p2", "R9")]);
    act(() => result.current.setBoardDate(TOMORROW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.people[0]?.id).toBe("p2");
    act(() => replace.resolve([]));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.people[0]?.id).toBe("p2"); // not cleared by date A's reset
  });

  it("a failed removePerson does not restore the person onto another date", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);
    const remove = deferred<void>();
    mockRemove.mockReturnValueOnce(remove.promise);
    act(() => result.current.removePerson("p1"));
    mockFetchRoster.mockResolvedValueOnce([person("p2", "R9")]); // date B is distinct
    act(() => result.current.setBoardDate(TOMORROW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => remove.reject(new Error("boom")));
    await new Promise((r) => setTimeout(r, 20));
    // date A's p1 must NOT be restored onto date B's board
    expect(result.current.people.map((p) => p.id)).toEqual(["p2"]);
  });

  // ---- defect 3: a failed status write must not clobber a newer status ----

  it("a failed setPersonStatus does not revert a newer status change", async () => {
    const { result } = await renderLoaded([person("p1", "R1")]);
    const first = deferred<void>();
    mockSetStatus.mockReturnValueOnce(first.promise);
    act(() => result.current.setPersonStatus("p1", "relief")); // req1 in flight
    mockSetStatus.mockResolvedValueOnce(undefined);
    act(() => result.current.setPersonStatus("p1", "break")); // req2 wins
    act(() => first.reject(new Error("boom")));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.people[0].status).toBe("break"); // not reverted to assigned
  });

  it("a failed updateAreaStatus does not revert a newer area status", async () => {
    const { result } = await renderLoaded([]);
    const first = deferred<void>();
    mockSetAreaStatus.mockReturnValueOnce(first.promise);
    act(() => result.current.updateAreaStatus("R1", "surgery", "a")); // req1 in flight
    mockSetAreaStatus.mockResolvedValueOnce(undefined);
    act(() => result.current.updateAreaStatus("R1", "cleaning", "b")); // req2 wins
    act(() => first.reject(new Error("boom")));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.areaStatuses.get("R1")).toEqual({
      status: "cleaning",
      note: "b",
    });
  });

  it("a failed setPersonStatus does not roll back the same person on another date", async () => {
    // p1 is rostered on BOTH dates (ids are global); on date B p1 already holds
    // the SAME status value the failed date-A write was optimistically setting.
    const { result } = await renderLoaded([person("p1", "R1")]); // date A, "assigned"
    const first = deferred<void>();
    mockSetStatus.mockReturnValueOnce(first.promise);
    act(() => result.current.setPersonStatus("p1", "relief")); // date A write in flight
    mockFetchRoster.mockResolvedValueOnce([
      { ...person("p1", "R3"), status: "relief" }, // date B p1 legitimately "relief"
    ]);
    act(() => result.current.setBoardDate(TOMORROW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => first.reject(new Error("boom"))); // date A write fails
    await new Promise((r) => setTimeout(r, 20));
    // date B's p1 must keep its own status — the date-A failure must not touch it
    expect(result.current.people[0].status).toBe("relief");
  });
});
