import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useBoard } from "../useBoard";
import { ALL_AREAS, DEMO_PEOPLE } from "@/lib/board-constants";
import { clearLocalAuditLog, getLocalAuditLog } from "@/lib/audit-client";

// Without Supabase env vars these tests exercise demo mode (localStorage
// source of truth). Initial load is async (microtask), so every test
// awaits the loaded state first.
async function renderLoadedBoard() {
  const rendered = renderHook(() => useBoard());
  await waitFor(() => {
    expect(rendered.result.current.isLoading).toBe(false);
  });
  return rendered;
}

describe("useBoard", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLocalAuditLog();
  });

  it("initializes with demo people when no localStorage data", async () => {
    const { result } = await renderLoadedBoard();
    expect(result.current.people).toEqual(DEMO_PEOPLE);
    expect(result.current.connectionStatus).toBe("local");
  });

  it("boardDate defaults to today (local time)", async () => {
    const { result } = await renderLoadedBoard();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(result.current.boardDate).toBe(expected);
  });

  it("movePerson updates person's area", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.movePerson("demo-1", "R2");
    });

    const moved = result.current.people.find((p) => p.id === "demo-1");
    expect(moved?.area).toBe("R2");
  });

  it("movePerson validates target area exists (rejects invalid areas)", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.movePerson("demo-1", "INVALID_AREA");
    });

    const person = result.current.people.find((p) => p.id === "demo-1");
    expect(person?.area).toBe("R1");
    expect(result.current.error).toContain("無效的區域");
  });

  it("addPerson creates person with UUID, '未設定' role, null area", async () => {
    const { result } = await renderLoadedBoard();
    const initialLength = result.current.people.length;

    act(() => {
      result.current.addPerson("新人員");
    });

    expect(result.current.people).toHaveLength(initialLength + 1);
    const added = result.current.people[result.current.people.length - 1];
    expect(added.name).toBe("新人員");
    expect(added.role).toBe("未設定");
    expect(added.area).toBeNull();
    expect(added.id).toBeTruthy();
    expect(added.color).toBeTruthy();
  });

  it("removePerson removes from people array", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.removePerson("demo-1");
    });

    expect(
      result.current.people.find((p) => p.id === "demo-1"),
    ).toBeUndefined();
    expect(result.current.people).toHaveLength(DEMO_PEOPLE.length - 1);
  });

  it("setPersonStatus marks a person on break", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.setPersonStatus("demo-1", "break");
    });

    const person = result.current.people.find((p) => p.id === "demo-1");
    expect(person?.status).toBe("break");
  });

  it("importPeople replaces the board", async () => {
    const { result } = await renderLoadedBoard();
    const imported = [
      {
        id: "i-1",
        name: "匯入者",
        role: "麻醉護理師",
        color: "bg-blue-100",
        area: "R3",
      },
    ];

    await act(async () => {
      await result.current.importPeople(imported);
    });

    expect(result.current.people).toEqual(imported);
  });

  it("importPeople with displayUnassigned shows everyone unassigned", async () => {
    const { result } = await renderLoadedBoard();
    const imported: import("@/lib/board-constants").BoardPerson[] = [
      {
        id: "i-1",
        name: "匯入者",
        role: "麻醉護理師",
        color: "bg-blue-100",
        area: "R3",
      },
    ];

    let adopted: typeof imported = [];
    await act(async () => {
      adopted = await result.current.importPeople(imported, {
        displayUnassigned: true,
      });
    });

    // Returned roster keeps final areas (for playback steps)…
    expect(adopted[0].area).toBe("R3");
    // …but the displayed board starts unassigned.
    expect(result.current.people[0].area).toBeNull();
  });

  it("resetBoard restores demo data", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.removePerson("demo-1");
      result.current.addPerson("Extra");
    });

    act(() => {
      result.current.resetBoard();
    });

    expect(result.current.people).toEqual(DEMO_PEOPLE);
  });

  it("setBoardDate switches to an empty board for another day", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.setBoardDate("2099-01-01");
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.boardDate).toBe("2099-01-01");
    // Not today → no demo fallback, just an empty roster.
    expect(result.current.people).toEqual([]);
  });

  it("a deliberately emptied board stays empty on reload", async () => {
    const first = await renderLoadedBoard();
    act(() => {
      for (const p of DEMO_PEOPLE) first.result.current.removePerson(p.id);
    });
    await act(async () => {
      await first.result.current.saveNow();
    });
    first.unmount();

    const second = await renderLoadedBoard();
    expect(second.result.current.people).toEqual([]);
  });

  it("resetBoard on a non-today date clears instead of seeding demo people", async () => {
    const { result } = await renderLoadedBoard();
    act(() => {
      result.current.setBoardDate("2099-01-01");
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    act(() => {
      result.current.addPerson("臨時");
    });
    act(() => {
      result.current.resetBoard();
    });
    expect(result.current.people).toEqual([]);
  });

  it("area statuses persist across reload in demo mode", async () => {
    const first = await renderLoadedBoard();
    act(() => {
      first.result.current.updateAreaStatus("R1", "surgery", "急刀");
    });
    first.unmount();

    const second = await renderLoadedBoard();
    expect(second.result.current.areaStatuses.get("R1")).toEqual({
      status: "surgery",
      note: "急刀",
    });
  });

  it("switching date immediately after an edit does not lose the edit", async () => {
    const first = await renderLoadedBoard();
    act(() => {
      first.result.current.movePerson("demo-1", "R7");
    });
    // Switch inside the 500ms save-debounce window — the old date must be
    // flushed synchronously, not dropped.
    act(() => {
      first.result.current.setBoardDate("2099-01-01");
    });
    await waitFor(() => {
      expect(first.result.current.isLoading).toBe(false);
    });
    first.unmount();

    const second = await renderLoadedBoard();
    const moved = second.result.current.people.find((p) => p.id === "demo-1");
    expect(moved?.area).toBe("R7");
  });

  it("boards persist per date across hook instances", async () => {
    const first = await renderLoadedBoard();

    act(() => {
      first.result.current.movePerson("demo-1", "R9");
    });
    await act(async () => {
      await first.result.current.saveNow();
    });
    first.unmount();

    const second = await renderLoadedBoard();
    const moved = second.result.current.people.find((p) => p.id === "demo-1");
    expect(moved?.area).toBe("R9");
  });

  it("searchFilter filters by name (case-insensitive)", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.setSearchFilter("王小");
    });

    expect(result.current.filteredPeople).toHaveLength(1);
    expect(result.current.filteredPeople[0].name).toBe("王小明");
  });

  it("searchFilter filters by role", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.setSearchFilter("leader");
    });

    expect(result.current.filteredPeople).toHaveLength(1);
    expect(result.current.filteredPeople[0].role).toBe("Leader");
  });

  it("searchFilter filters by area", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.setSearchFilter("opd");
    });

    expect(result.current.filteredPeople).toHaveLength(1);
    expect(result.current.filteredPeople[0].area).toBe("OPD前台");
  });

  it("peopleByArea groups people correctly", async () => {
    const { result } = await renderLoadedBoard();

    const r1People = result.current.peopleByArea["R1"];
    expect(r1People).toHaveLength(1);
    expect(r1People[0].id).toBe("demo-1");
  });

  it("peopleByArea includes empty areas", async () => {
    const { result } = await renderLoadedBoard();

    expect(result.current.peopleByArea["R5"]).toEqual([]);
    for (const area of ALL_AREAS) {
      expect(result.current.peopleByArea[area]).toBeDefined();
    }
  });

  it("empty search returns all people", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.setSearchFilter("");
    });

    expect(result.current.filteredPeople).toEqual(result.current.people);
  });

  it("movePerson creates an audit log entry (demo mode)", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.movePerson("demo-1", "R2");
    });

    const log = getLocalAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(1);
    const entry = log.find(
      (e) => e.personId === "demo-1" && e.actionType === "reassign",
    );
    expect(entry).toBeDefined();
    expect(entry?.fromArea).toBe("R1");
    expect(entry?.toArea).toBe("R2");
    expect(entry?.personName).toBe("王小明");
  });

  it("addPerson creates an audit log entry (demo mode)", async () => {
    const { result } = await renderLoadedBoard();

    act(() => {
      result.current.addPerson("新人員");
    });

    const log = getLocalAuditLog();
    const entry = log.find((e) => e.actionType === "add_person");
    expect(entry).toBeDefined();
    expect(entry?.personName).toBe("新人員");
    expect(entry?.fromArea).toBeNull();
    expect(entry?.toArea).toBeNull();
  });
});
