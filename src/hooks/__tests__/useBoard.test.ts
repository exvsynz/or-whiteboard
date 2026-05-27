import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useBoard } from "../useBoard";
import { ALL_AREAS, DEMO_PEOPLE } from "@/lib/board-constants";
import { clearLocalAuditLog, getLocalAuditLog } from "@/lib/audit-client";

describe("useBoard", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLocalAuditLog();
  });

  it("initializes with demo people when no localStorage data", () => {
    const { result } = renderHook(() => useBoard());
    expect(result.current.people).toEqual(DEMO_PEOPLE);
    expect(result.current.isLoading).toBe(false);
  });

  it("movePerson updates person's area", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.movePerson("demo-1", "R2");
    });

    const moved = result.current.people.find((p) => p.id === "demo-1");
    expect(moved?.area).toBe("R2");
  });

  it("movePerson validates target area exists (rejects invalid areas)", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.movePerson("demo-1", "INVALID_AREA");
    });

    // Person should not have moved
    const person = result.current.people.find((p) => p.id === "demo-1");
    expect(person?.area).toBe("R1");
    expect(result.current.error).toContain("無效的區域");
  });

  it("addPerson creates person with UUID, '未設定' role, null area", () => {
    const { result } = renderHook(() => useBoard());
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

  it("removePerson removes from people array", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.removePerson("demo-1");
    });

    expect(result.current.people.find((p) => p.id === "demo-1")).toBeUndefined();
    expect(result.current.people).toHaveLength(DEMO_PEOPLE.length - 1);
  });

  it("resetBoard restores demo data", () => {
    const { result } = renderHook(() => useBoard());

    // Modify state
    act(() => {
      result.current.removePerson("demo-1");
      result.current.addPerson("Extra");
    });

    // Reset
    act(() => {
      result.current.resetBoard();
    });

    expect(result.current.people).toEqual(DEMO_PEOPLE);
  });

  it("searchFilter filters by name (case-insensitive)", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.setSearchFilter("王小");
    });

    expect(result.current.filteredPeople).toHaveLength(1);
    expect(result.current.filteredPeople[0].name).toBe("王小明");
  });

  it("searchFilter filters by role", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.setSearchFilter("leader");
    });

    expect(result.current.filteredPeople).toHaveLength(1);
    expect(result.current.filteredPeople[0].role).toBe("Leader");
  });

  it("searchFilter filters by area", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.setSearchFilter("opd");
    });

    expect(result.current.filteredPeople).toHaveLength(1);
    expect(result.current.filteredPeople[0].area).toBe("OPD前台");
  });

  it("peopleByArea groups people correctly", () => {
    const { result } = renderHook(() => useBoard());

    const r1People = result.current.peopleByArea["R1"];
    expect(r1People).toHaveLength(1);
    expect(r1People[0].id).toBe("demo-1");
  });

  it("peopleByArea includes empty areas", () => {
    const { result } = renderHook(() => useBoard());

    // R5 has no one assigned in demo data
    expect(result.current.peopleByArea["R5"]).toEqual([]);

    // All areas should be present
    for (const area of ALL_AREAS) {
      expect(result.current.peopleByArea[area]).toBeDefined();
    }
  });

  it("empty search returns all people", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.setSearchFilter("");
    });

    expect(result.current.filteredPeople).toEqual(result.current.people);
  });

  it("movePerson creates an audit log entry", () => {
    const { result } = renderHook(() => useBoard());

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

  it("addPerson creates an audit log entry", () => {
    const { result } = renderHook(() => useBoard());

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
