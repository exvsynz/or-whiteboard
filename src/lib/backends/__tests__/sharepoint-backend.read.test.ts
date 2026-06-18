import { describe, it, expect, vi } from "vitest";
import type { GraphClient, GraphListItem } from "@/lib/graph-client";
import { createSharePointBackend } from "@/lib/backends/sharepoint-backend";

function mockGraph(items: Record<string, GraphListItem[]>): GraphClient {
  return {
    listItems: vi.fn(async (listId: string) => items[listId] ?? []),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  };
}

const CONFIG = { assignmentsListId: "assign", areaStatusListId: "areas" };

describe("SharePointBackend (read, mocked Graph)", () => {
  it("conforms: kind, remote writer present, no realtime, server ids", () => {
    const b = createSharePointBackend(mockGraph({}), CONFIG);
    expect(b.kind).toBe("sharepoint");
    expect(b.remote).not.toBeNull();
    expect(b.capabilities.realtime).toBe(false);
    expect(b.capabilities.serverGeneratedIds).toBe(true);
  });

  it("fetchRoster maps assignment items to BoardPerson, filtered by board date", async () => {
    const graph = mockGraph({
      assign: [
        {
          id: "item-1",
          fields: {
            PersonId: "p1",
            PersonName: "王小明",
            Role: "麻醉護理師",
            Color: "bg-amber-100",
            Area: "R1",
            Status: "assigned",
            BoardDate: "2026-06-16",
          },
        },
      ],
    });
    const roster = await createSharePointBackend(graph, CONFIG).fetchRoster(
      "2026-06-16",
    );
    expect(roster).toEqual([
      {
        id: "p1",
        name: "王小明",
        role: "麻醉護理師",
        color: "bg-amber-100",
        area: "R1",
        status: "assigned",
      },
    ]);
    expect(graph.listItems).toHaveBeenCalledWith("assign", {
      filter: "fields/BoardDate eq '2026-06-16'",
    });
  });

  it("fetchRoster treats a blank area as unassigned (null)", async () => {
    const graph = mockGraph({
      assign: [
        {
          id: "i2",
          fields: {
            PersonId: "p2",
            PersonName: "林怡君",
            Role: "Leader",
            Color: "bg-pink-100",
            Area: "",
            Status: "assigned",
            BoardDate: "2026-06-16",
          },
        },
      ],
    });
    const roster = await createSharePointBackend(graph, CONFIG).fetchRoster(
      "2026-06-16",
    );
    expect(roster[0].area).toBeNull();
  });

  it("fetchAreaStatuses maps the area-status list into a Map", async () => {
    const graph = mockGraph({
      areas: [
        { id: "a1", fields: { AreaName: "R1", Status: "surgery", Note: "急刀" } },
      ],
    });
    const m = await createSharePointBackend(graph, CONFIG).fetchAreaStatuses();
    expect(m.get("R1")).toEqual({ status: "surgery", note: "急刀" });
  });

  // Write behaviour (P4a, JOS-202) is covered against an in-memory Graph in
  // sharepoint-backend.write.test.ts. Here we only assert the writer is wired
  // up — it no longer rejects as not-implemented.
  it("exposes a live remote writer (no P4 not-implemented stub)", async () => {
    const b = createSharePointBackend(mockGraph({}), CONFIG);
    await expect(
      b.remote!.upsertAssignment("p1", "R1", "2026-06-16"),
    ).resolves.toBeUndefined();
  });
});
