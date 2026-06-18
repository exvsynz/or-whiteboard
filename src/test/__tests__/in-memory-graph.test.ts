import { describe, it, expect } from "vitest";
import { createInMemoryGraphClient } from "@/test/in-memory-graph";

describe("in-memory GraphClient fake", () => {
  it("createItem mints an id and listItems returns the row", async () => {
    const g = createInMemoryGraphClient();
    const created = await g.createItem("L", { PersonId: "p1", BoardDate: "d1" });
    expect(created.id).toBeTruthy();
    const items = await g.listItems("L");
    expect(items).toHaveLength(1);
    expect(items[0].fields.PersonId).toBe("p1");
  });

  it("createItem assigns a unique id per row", async () => {
    const g = createInMemoryGraphClient();
    const a = await g.createItem("L", { x: 1 });
    const b = await g.createItem("L", { x: 2 });
    expect(a.id).not.toBe(b.id);
  });

  it("updateItem merges fields, leaving others intact", async () => {
    const g = createInMemoryGraphClient();
    const c = await g.createItem("L", { Area: "R1", Status: "assigned" });
    await g.updateItem("L", c.id, { Area: "R2" });
    const [item] = await g.listItems("L");
    expect(item.fields.Area).toBe("R2");
    expect(item.fields.Status).toBe("assigned");
  });

  it("deleteItem removes the row", async () => {
    const g = createInMemoryGraphClient();
    const c = await g.createItem("L", { x: 1 });
    await g.deleteItem("L", c.id);
    expect(await g.listItems("L")).toHaveLength(0);
  });

  it("isolates items by listId", async () => {
    const g = createInMemoryGraphClient();
    await g.createItem("A", { x: 1 });
    expect(await g.listItems("B")).toHaveLength(0);
  });

  it("filters by a single fields/<col> eq '<v>' clause", async () => {
    const g = createInMemoryGraphClient();
    await g.createItem("L", { BoardDate: "2026-06-16" });
    await g.createItem("L", { BoardDate: "2026-06-17" });
    const items = await g.listItems("L", {
      filter: "fields/BoardDate eq '2026-06-16'",
    });
    expect(items).toHaveLength(1);
    expect(items[0].fields.BoardDate).toBe("2026-06-16");
  });

  it("filters by a two-clause 'and' conjunction", async () => {
    const g = createInMemoryGraphClient();
    await g.createItem("L", { PersonId: "p1", BoardDate: "d1" });
    await g.createItem("L", { PersonId: "p2", BoardDate: "d1" });
    await g.createItem("L", { PersonId: "p1", BoardDate: "d2" });
    const items = await g.listItems("L", {
      filter: "fields/PersonId eq 'p1' and fields/BoardDate eq 'd1'",
    });
    expect(items).toHaveLength(1);
    expect(items[0].fields.PersonId).toBe("p1");
    expect(items[0].fields.BoardDate).toBe("d1");
  });

  it("returns copies so callers cannot mutate the store directly", async () => {
    const g = createInMemoryGraphClient();
    const c = await g.createItem("L", { Area: "R1" });
    const [first] = await g.listItems("L");
    first.fields.Area = "TAMPERED";
    const [again] = await g.listItems("L");
    expect(again.fields.Area).toBe("R1");
    expect(c.id).toBe(again.id);
  });

  it("throws on updateItem for a missing id (like Graph 404)", async () => {
    const g = createInMemoryGraphClient();
    await expect(g.updateItem("L", "nope", { x: 1 })).rejects.toThrow();
  });

  it("throws on deleteItem for a missing id (like Graph 404)", async () => {
    const g = createInMemoryGraphClient();
    await expect(g.deleteItem("L", "nope")).rejects.toThrow();
  });
});
