import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GraphListItem } from "@/lib/graph-client";
import { localDateString } from "@/lib/board-export";

// useBoard reads getBackend() ONCE at module load, so the SharePoint backend
// must exist before useBoard imports. An async vi.mock factory builds a
// controllable-Graph-backed SharePoint backend and stashes its control handle
// (via a hoisted holder) for the tests to reseed/gate.
const h = vi.hoisted(() => ({ control: null as unknown, backend: null as unknown }));

vi.mock("@/lib/backend-config", async () => {
  const { createControllableGraphClient } = await import("@/test/in-memory-graph");
  const { createSharePointBackend } = await import("@/lib/backends/sharepoint-backend");
  const { client, control } = createControllableGraphClient();
  const backend = createSharePointBackend(client, {
    assignmentsListId: "assign",
    areaStatusListId: "areas",
  });
  h.control = control;
  h.backend = backend;
  return { getBackend: () => backend };
});

import { useBoard } from "@/hooks/useBoard";
import type { GraphControl } from "@/test/in-memory-graph";

const control = () => h.control as GraphControl;
const TODAY = localDateString();
const TOMORROW = "2099-01-01";

function row(id: string, personId: string, area: string | null, date: string): GraphListItem {
  return {
    id,
    etag: `e-${id}`,
    fields: {
      PersonId: personId,
      PersonName: `護理師${personId}`,
      Role: "麻醉護理師",
      Color: "bg-amber-100",
      Area: area ?? "",
      Status: "assigned",
      BoardDate: date,
    },
  };
}

function seed(rows: GraphListItem[]) {
  control().reset({ assign: rows, areas: [] });
}

async function renderLoaded() {
  const rendered = renderHook(() => useBoard());
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
  return rendered;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("useBoard against the SharePoint adapter — write-queue/rollback invariants", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("an in-flight write for date A does not reposition the person on date B", async () => {
    seed([row("a1", "p1", "R1", TODAY), row("a2", "p1", "R9", TOMORROW)]);
    const { result } = await renderLoaded();
    expect(result.current.people[0].area).toBe("R1");

    act(() => result.current.movePerson("p1", "R2"));
    const gate = control().gateNextWrite(); // park the upsert PATCH in flight
    act(() => result.current.setBoardDate(TOMORROW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // date B shows date B's area, not date A's optimistic target
    expect(result.current.people[0].area).toBe("R9");

    gate.release();
    await act(async () => {
      await tick();
    });
  });

  it("a failed write rolls back only on its own date and only from its target", async () => {
    seed([row("a1", "p1", "R1", TODAY)]);
    const { result } = await renderLoaded();

    act(() => result.current.movePerson("p1", "R2"));
    const gate = control().gateNextWrite();
    let saved!: Promise<void>;
    act(() => {
      saved = result.current.saveNow();
    });
    gate.fail(new Error("network down"));
    await act(async () => {
      await saved;
    });

    await waitFor(() => expect(result.current.error).toContain("移動失敗"));
    expect(result.current.people[0].area).toBe("R1");
  });

  it("a failed write does NOT roll back if the person has since moved again", async () => {
    seed([row("a1", "p1", "R1", TODAY)]);
    const { result } = await renderLoaded();

    act(() => result.current.movePerson("p1", "R2"));
    const gate = control().gateNextWrite();
    let saved!: Promise<void>;
    act(() => {
      saved = result.current.saveNow(); // R2 write parks in flight
    });
    act(() => result.current.movePerson("p1", "R3")); // newer position
    gate.fail(new Error("boom"));
    await act(async () => {
      await saved;
    });

    // R2's failure must not clobber the newer R3 position
    expect(result.current.people[0].area).toBe("R3");
  });

  it("addPerson does not append to another date's board", async () => {
    seed([row("a1", "p1", "R1", TODAY)]); // TOMORROW seeded empty
    const { result } = await renderLoaded();

    const gate = control().gateNextWrite(); // park addPerson's createItem
    act(() => result.current.addPerson("新人"));
    act(() => result.current.setBoardDate(TOMORROW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    gate.release(); // the insert resolves after the date switch
    await act(async () => {
      await tick();
    });

    // the new person belongs to TODAY's roster, not TOMORROW's board
    expect(result.current.people).toHaveLength(0);
  });
});
