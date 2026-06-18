import { describe, it, expect } from "vitest";
import { createControllableGraphClient } from "@/test/in-memory-graph";
import { createSharePointBackend } from "@/lib/backends/sharepoint-backend";

const CONFIG = { assignmentsListId: "assign", areaStatusListId: "areas" };
const DAY = "2026-06-16";
const KEY_FILTER = "fields/PersonId eq 'p1' and fields/BoardDate eq '2026-06-16'";
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("SharePointBackend concurrency (controllable Graph)", () => {
  it("two interleaved upserts of the same (PersonId, BoardDate) converge to one row", async () => {
    const { client, control } = createControllableGraphClient();
    const b = createSharePointBackend(client, CONFIG);

    const gate = control.gateNextWrite(); // gate writer-1's insert POST
    const w1 = b.remote!.upsertAssignment("p1", "R1", DAY);
    await tick(); // w1 parks at its createItem
    const w2 = b.remote!.upsertAssignment("p1", "R2", DAY); // inserts immediately
    await tick();
    gate.release(); // w1 inserts a duplicate, then reconciles it away
    await Promise.all([w1, w2]);

    const rows = await client.listItems(CONFIG.assignmentsListId, {
      filter: KEY_FILTER,
    });
    expect(rows).toHaveLength(1);
  });

  it("a PATCH that loses the If-Match race re-reads and re-applies (no lost update, no duplicate)", async () => {
    const { client, control } = createControllableGraphClient();
    const b = createSharePointBackend(client, CONFIG);
    await b.remote!.addPerson("林", "Leader", "bg-pink-100", DAY); // creates the row
    const pid = (await b.fetchRoster(DAY))[0].id;

    const gate = control.gateNextWrite(); // gate writer-1's PATCH
    const w1 = b.remote!.upsertAssignment(pid, "R2", DAY);
    await tick(); // w1 read the row (etag eN) and parks at its PATCH
    const w2 = b.remote!.upsertAssignment(pid, "R3", DAY); // PATCHes first, bumps etag
    await tick();
    gate.release(); // w1's PATCH now hits a stale etag -> conflict -> re-read + retry
    await Promise.all([w1, w2]);

    const rows = await b.fetchRoster(DAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].area).toBe("R2"); // writer-1 committed last; converged, no crash
  });
});
