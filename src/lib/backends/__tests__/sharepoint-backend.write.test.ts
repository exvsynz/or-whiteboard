import { describe, it, expect } from "vitest";
import type { BoardPerson } from "@/lib/board-constants";
import { createInMemoryGraphClient } from "@/test/in-memory-graph";
import { createSharePointBackend } from "@/lib/backends/sharepoint-backend";

const CONFIG = { assignmentsListId: "assign", areaStatusListId: "areas" };
const DAY = "2026-06-16";
const NEXT = "2026-06-17";

function setup() {
  const graph = createInMemoryGraphClient();
  const backend = createSharePointBackend(graph, CONFIG);
  return { graph, backend, writer: backend.remote! };
}

function incoming(name: string, area: string | null): BoardPerson {
  // ids/status are intentionally "wrong" — replaceBoard must mint fresh ids and
  // reset status, so callers can't smuggle either through.
  return { id: "smuggled", name, role: "麻醉護理師", color: "bg-amber-100", area, status: "break" };
}

describe("SharePointBackend write path (in-memory Graph)", () => {
  // ---- addPerson ----

  it("addPerson persists one unassigned row and returns a BoardPerson with an id", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王小明", "麻醉護理師", "bg-amber-100", DAY);
    expect(p.id).toBeTruthy();
    expect(p).toMatchObject({
      name: "王小明",
      role: "麻醉護理師",
      color: "bg-amber-100",
      area: null,
      status: "assigned",
    });
    expect(await backend.fetchRoster(DAY)).toEqual([
      { id: p.id, name: "王小明", role: "麻醉護理師", color: "bg-amber-100", area: null, status: "assigned" },
    ]);
  });

  it("addPerson does not place the person on another date", async () => {
    const { backend, writer } = setup();
    await writer.addPerson("王小明", "麻醉護理師", "bg-amber-100", DAY);
    expect(await backend.fetchRoster(NEXT)).toEqual([]);
  });

  // ---- upsertAssignment ----

  it("upsertAssignment moves an existing person to a new area (one row)", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王", "r", "c", DAY);
    await writer.upsertAssignment(p.id, "R2", DAY);
    const roster = await backend.fetchRoster(DAY);
    expect(roster).toHaveLength(1);
    expect(roster[0].area).toBe("R2");
  });

  it("upsertAssignment is idempotent — calling twice yields one row", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王", "r", "c", DAY);
    await writer.upsertAssignment(p.id, "R2", DAY);
    await writer.upsertAssignment(p.id, "R2", DAY);
    expect(await backend.fetchRoster(DAY)).toHaveLength(1);
  });

  it("upsertAssignment unassigns when areaName is null", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王", "r", "c", DAY);
    await writer.upsertAssignment(p.id, "R1", DAY);
    await writer.upsertAssignment(p.id, null, DAY);
    expect((await backend.fetchRoster(DAY))[0].area).toBeNull();
  });

  it("upsertAssignment preserves status when the status arg is omitted", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王", "r", "c", DAY);
    await writer.setAssignmentStatus(p.id, DAY, "break");
    await writer.upsertAssignment(p.id, "R3", DAY); // no status -> must keep "break"
    const [row] = await backend.fetchRoster(DAY);
    expect(row.area).toBe("R3");
    expect(row.status).toBe("break");
  });

  it("upsertAssignment sets status when one is provided", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王", "r", "c", DAY);
    await writer.upsertAssignment(p.id, "R1", DAY, "relief");
    expect((await backend.fetchRoster(DAY))[0].status).toBe("relief");
  });

  it("upsertAssignment creates a row for a new date, carrying the person's identity", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("林怡君", "Leader", "bg-pink-100", DAY);
    await writer.upsertAssignment(p.id, "R5", NEXT); // no row on NEXT yet
    const [row] = await backend.fetchRoster(NEXT);
    expect(row).toMatchObject({
      id: p.id,
      name: "林怡君",
      role: "Leader",
      color: "bg-pink-100",
      area: "R5",
      status: "assigned",
    });
  });

  // ---- setAssignmentStatus ----

  it("setAssignmentStatus updates the status of an existing assignment", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王", "r", "c", DAY);
    await writer.setAssignmentStatus(p.id, DAY, "relief");
    expect((await backend.fetchRoster(DAY))[0].status).toBe("relief");
  });

  it("setAssignmentStatus is a silent no-op when no assignment matches (mirrors Supabase)", async () => {
    const { backend, writer } = setup();
    await expect(writer.setAssignmentStatus("ghost", DAY, "break")).resolves.toBeUndefined();
    expect(await backend.fetchRoster(DAY)).toEqual([]);
  });

  // ---- removePerson ----

  it("removePerson deletes the assignment row", async () => {
    const { backend, writer } = setup();
    const p = await writer.addPerson("王", "r", "c", DAY);
    await writer.removePerson(p.id, DAY);
    expect(await backend.fetchRoster(DAY)).toEqual([]);
  });

  it("removePerson throws when no row matches (loud, mirrors removeFromRoster)", async () => {
    const { writer } = setup();
    await expect(writer.removePerson("ghost", DAY)).rejects.toThrow();
  });

  // ---- replaceBoard ----

  it("replaceBoard clears the date and recreates rows with fresh ids, area kept, status reset", async () => {
    const { graph, backend, writer } = setup();
    const old = await writer.addPerson("舊人", "r", "c", DAY);
    await writer.setAssignmentStatus(old.id, DAY, "break");

    const result = await writer.replaceBoard(DAY, [incoming("A", "R1"), incoming("B", null)]);

    expect(result).toHaveLength(2);
    // fresh ids: not the smuggled input id, not the replaced person's id
    expect(result.every((r) => r.id && r.id !== "smuggled" && r.id !== old.id)).toBe(true);
    // area kept, status reset to assigned
    expect(result[0]).toMatchObject({ name: "A", area: "R1", status: "assigned" });
    expect(result[1]).toMatchObject({ name: "B", area: null, status: "assigned" });

    const roster = await backend.fetchRoster(DAY);
    expect(roster).toHaveLength(2);
    expect(roster.map((r) => r.name).sort()).toEqual(["A", "B"]);
    // exactly two stored rows for the date — the old person is gone, no leftovers
    expect(await graph.listItems(CONFIG.assignmentsListId)).toHaveLength(2);
  });

  it("replaceBoard only affects its own date", async () => {
    const { backend, writer } = setup();
    await writer.addPerson("他日", "r", "c", NEXT);
    await writer.replaceBoard(DAY, [incoming("A", null)]);
    expect(await backend.fetchRoster(NEXT)).toHaveLength(1);
  });

  // ---- setAreaStatus ----

  it("setAreaStatus creates then updates a single area-status row", async () => {
    const { graph, backend, writer } = setup();
    await writer.setAreaStatus("R1", "surgery", "急刀");
    expect((await backend.fetchAreaStatuses()).get("R1")).toEqual({ status: "surgery", note: "急刀" });

    await writer.setAreaStatus("R1", "cleaning", "清潔中");
    expect((await backend.fetchAreaStatuses()).get("R1")).toEqual({ status: "cleaning", note: "清潔中" });
    // updated in place, not appended
    expect(await graph.listItems(CONFIG.areaStatusListId)).toHaveLength(1);
  });
});
