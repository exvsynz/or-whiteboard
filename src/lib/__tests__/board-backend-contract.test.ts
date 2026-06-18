import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BoardPerson } from "@/lib/board-constants";
import { DEMO_PEOPLE } from "@/lib/board-constants";
import { saveBoard, saveAreaStatuses } from "@/lib/board-storage";
import { localDateString } from "@/lib/board-export";

// board-data is the Supabase data layer. Mock it so the SupabaseBackend
// contract can be verified without a live DB — we assert it delegates to
// board-data with the captured client (the seam that lets SharePoint slot in
// the same way later).
vi.mock("@/lib/board-data", () => ({
  fetchRoster: vi.fn(async () => []),
  fetchAreaStatuses: vi.fn(async () => new Map()),
  upsertAssignment: vi.fn(async () => {}),
  setAssignmentStatus: vi.fn(async () => {}),
  addPersonToRoster: vi.fn(async () => ({})),
  removeFromRoster: vi.fn(async () => {}),
  replaceBoard: vi.fn(async () => []),
  setAreaStatus: vi.fn(async () => {}),
}));

import { createDemoBackend } from "@/lib/backends/demo-backend";
import { createSupabaseBackend } from "@/lib/backends/supabase-backend";
import { createSharePointBackend } from "@/lib/backends/sharepoint-backend";
import { createInMemoryGraphClient } from "@/test/in-memory-graph";
import * as boardData from "@/lib/board-data";

const TODAY = localDateString();
const OTHER = "2099-01-01";
// SupabaseBackend only captures + forwards the client; its shape is irrelevant.
const fakeClient = {} as never;

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

describe("BoardBackend contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ---- interface conformance ----

  it("demo backend conforms and has no remote writer", () => {
    const b = createDemoBackend();
    expect(b.kind).toBe("demo");
    expect(b.remote).toBeNull();
    expect(b.capabilities.serverGeneratedIds).toBe(false);
    expect(b.capabilities.realtime).toBe(false);
    expect(typeof b.fetchRoster).toBe("function");
  });

  it("supabase backend conforms and has a remote writer", () => {
    const b = createSupabaseBackend(fakeClient);
    expect(b.kind).toBe("supabase");
    expect(b.remote).not.toBeNull();
    expect(b.capabilities.serverGeneratedIds).toBe(true);
    expect(b.capabilities.realtime).toBe(true);
  });

  it("sharepoint backend conforms and has a remote writer", () => {
    const b = createSharePointBackend(createInMemoryGraphClient(), {
      assignmentsListId: "assign",
      areaStatusListId: "areas",
    });
    expect(b.kind).toBe("sharepoint");
    expect(b.remote).not.toBeNull();
    expect(b.capabilities.serverGeneratedIds).toBe(true);
    expect(b.capabilities.realtime).toBe(false);
  });

  // ---- sharepoint write round-trip (real adapter, in-memory Graph) ----
  // The supabase writer is delegation-only above; SharePoint is the adapter
  // whose write behaviour we can verify end-to-end without a tenant, so the
  // cross-adapter contract's "writes persist and read back" lives here.

  it("sharepoint writes persist and read back across the date filter", async () => {
    const b = createSharePointBackend(createInMemoryGraphClient(), {
      assignmentsListId: "assign",
      areaStatusListId: "areas",
    });
    const added = await b.remote!.addPerson("王小明", "麻醉護理師", "bg-amber-100", TODAY);
    await b.remote!.upsertAssignment(added.id, "R2", TODAY);

    const roster = await b.fetchRoster(TODAY);
    expect(roster).toEqual([
      { id: added.id, name: "王小明", role: "麻醉護理師", color: "bg-amber-100", area: "R2", status: "assigned" },
    ]);
    // a write on one date does not leak onto another
    expect(await b.fetchRoster(OTHER)).toEqual([]);
  });

  it("sharepoint upsert is idempotent — same (person, date) never duplicates a card", async () => {
    const b = createSharePointBackend(createInMemoryGraphClient(), {
      assignmentsListId: "assign",
      areaStatusListId: "areas",
    });
    const added = await b.remote!.addPerson("林", "Leader", "bg-pink-100", TODAY);
    await b.remote!.upsertAssignment(added.id, "R1", TODAY);
    await b.remote!.upsertAssignment(added.id, "R1", TODAY);
    expect(await b.fetchRoster(TODAY)).toHaveLength(1);
  });

  it("sharepoint replaceBoard adopts the roster and removing a missing row throws", async () => {
    const b = createSharePointBackend(createInMemoryGraphClient(), {
      assignmentsListId: "assign",
      areaStatusListId: "areas",
    });
    const adopted = await b.remote!.replaceBoard(TODAY, [person("ignored", "R1")]);
    expect(adopted).toHaveLength(1);
    expect(adopted[0].id).not.toBe("ignored");
    await expect(b.remote!.removePerson("ghost", TODAY)).rejects.toThrow();
  });

  // ---- demo read behavior (real localStorage) ----

  it("demo fetchRoster returns the seeded people for a fresh today", async () => {
    const b = createDemoBackend();
    expect(await b.fetchRoster(TODAY)).toEqual(DEMO_PEOPLE);
  });

  it("demo fetchRoster returns a stored board even when empty (no resurrection)", async () => {
    saveBoard(TODAY, []);
    const b = createDemoBackend();
    expect(await b.fetchRoster(TODAY)).toEqual([]);
  });

  it("demo fetchRoster returns the stored people for a given date", async () => {
    saveBoard(OTHER, [person("p1", "R1")]);
    const roster = await createDemoBackend().fetchRoster(OTHER);
    expect(roster).toHaveLength(1);
    expect(roster[0].area).toBe("R1");
  });

  it("demo fetchRoster returns empty for a fresh non-today date", async () => {
    expect(await createDemoBackend().fetchRoster(OTHER)).toEqual([]);
  });

  it("demo fetchAreaStatuses reflects stored statuses", async () => {
    saveAreaStatuses(new Map([["R1", { status: "surgery", note: "x" }]]));
    const m = await createDemoBackend().fetchAreaStatuses();
    expect(m.get("R1")).toEqual({ status: "surgery", note: "x" });
  });

  // ---- supabase delegation (mocked board-data) ----

  it("supabase fetchRoster delegates to board-data with the captured client", async () => {
    await createSupabaseBackend(fakeClient).fetchRoster(TODAY);
    expect(boardData.fetchRoster).toHaveBeenCalledWith(fakeClient, TODAY);
  });

  it("supabase remote.upsertAssignment forwards the client + args", async () => {
    await createSupabaseBackend(fakeClient).remote!.upsertAssignment(
      "p1",
      "R2",
      TODAY,
      "assigned",
    );
    expect(boardData.upsertAssignment).toHaveBeenCalledWith(
      fakeClient,
      "p1",
      "R2",
      TODAY,
      "assigned",
    );
  });

  it("supabase remote.addPerson delegates to addPersonToRoster", async () => {
    await createSupabaseBackend(fakeClient).remote!.addPerson(
      "新人",
      "未設定",
      "bg-amber-100",
      TODAY,
    );
    expect(boardData.addPersonToRoster).toHaveBeenCalledWith(
      fakeClient,
      "新人",
      "未設定",
      "bg-amber-100",
      TODAY,
    );
  });

  it("supabase remote.replaceBoard delegates with the captured client", async () => {
    const people = [person("p1", "R1")];
    await createSupabaseBackend(fakeClient).remote!.replaceBoard(TODAY, people);
    expect(boardData.replaceBoard).toHaveBeenCalledWith(fakeClient, TODAY, people);
  });

  // ---- subscribe ----

  it("demo subscribe is a no-op returning an unsubscribe function", () => {
    const onChange = vi.fn();
    const onStatus = vi.fn();
    const unsubscribe = createDemoBackend().subscribe(TODAY, {
      onChange,
      onStatus,
    });
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
    expect(onChange).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("supabase subscribe wires a channel and unsubscribe removes it", () => {
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const unsubscribe = createSupabaseBackend(client as never).subscribe(TODAY, {
      onChange: vi.fn(),
      onStatus: vi.fn(),
    });
    expect(client.channel).toHaveBeenCalled();
    expect(channel.subscribe).toHaveBeenCalled();
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("supabase subscribe reports connected + refetches on SUBSCRIBED, disconnected on CLOSED", () => {
    let statusCb: (s: string) => void = () => {};
    const channel = {
      on: vi.fn(),
      subscribe: vi.fn((cb: (s: string) => void) => {
        statusCb = cb;
        return channel;
      }),
    };
    channel.on.mockReturnValue(channel);
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const onChange = vi.fn();
    const onStatus = vi.fn();
    createSupabaseBackend(client as never).subscribe(TODAY, { onChange, onStatus });

    statusCb("SUBSCRIBED");
    expect(onStatus).toHaveBeenCalledWith("connected");
    expect(onChange).toHaveBeenCalledTimes(1);

    statusCb("CLOSED");
    expect(onStatus).toHaveBeenCalledWith("disconnected");
  });
});
