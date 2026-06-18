import type { BoardPerson } from "../board-constants";
import type { AssignmentStatus } from "../database.types";
import type { AreaStatusInfo } from "../board-types";
import type { BoardBackend, RemoteBoardWriter } from "../board-backend";
import type { GraphClient, GraphListItem } from "../graph-client";
import { GraphConflictError } from "../graph-client";

export interface SharePointConfig {
  /** SharePoint list id holding per-(person, date) assignment rows. */
  assignmentsListId: string;
  /** SharePoint list id holding per-area operational status. */
  areaStatusListId: string;
}

// Column names on the (denormalised) Assignments list. The app owns this
// schema and creates the list itself via Graph, so these are our definitions.
const F = {
  personId: "PersonId",
  name: "PersonName",
  role: "Role",
  color: "Color",
  area: "Area",
  status: "Status",
  boardDate: "BoardDate",
} as const;

const AREA_F = { name: "AreaName", status: "Status", note: "Note" } as const;

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** True for a Graph "item gone" error — tolerated when a co-racer beat us to it. */
function is404(err: unknown): boolean {
  return err instanceof Error && err.message.includes("404");
}

// Bounded retries when an If-Match PATCH loses to a concurrent writer.
const MAX_CONFLICT_RETRIES = 3;

/** Map an Assignments list item to the domain BoardPerson. Exported for tests. */
export function assignmentItemToPerson(item: GraphListItem): BoardPerson {
  const f = item.fields;
  const area = str(f[F.area]);
  const status = str(f[F.status]);
  return {
    id: str(f[F.personId]),
    name: str(f[F.name]),
    role: str(f[F.role]),
    color: str(f[F.color]),
    area: area === "" ? null : area,
    status: (status || "assigned") as AssignmentStatus,
  };
}

/**
 * Inverse of assignmentItemToPerson: a domain person on a date -> the
 * Assignments list fields. `area: null` is stored as "" (the read maps "" back
 * to null), and an absent status defaults to "assigned". Exported for tests.
 */
export function personToAssignmentFields(
  person: BoardPerson,
  boardDate: string,
): Record<string, unknown> {
  return {
    [F.personId]: person.id,
    [F.name]: person.name,
    [F.role]: person.role,
    [F.color]: person.color,
    [F.area]: person.area ?? "",
    [F.status]: person.status ?? "assigned",
    [F.boardDate]: boardDate,
  };
}

export function createSharePointBackend(
  graph: GraphClient,
  config: SharePointConfig,
): BoardBackend {
  const assignFilter = (personId: string, boardDate: string) =>
    `fields/${F.personId} eq '${personId}' and fields/${F.boardDate} eq '${boardDate}'`;

  // The single (person, date) assignment row, or null. BoardDate is the indexed
  // column, so this stays under SharePoint's 5000-item view threshold.
  async function findAssignment(
    personId: string,
    boardDate: string,
  ): Promise<GraphListItem | null> {
    const items = await graph.listItems(config.assignmentsListId, {
      filter: assignFilter(personId, boardDate),
    });
    return items[0] ?? null;
  }

  // Any existing row for this person (any date) — the identity source when an
  // upsert has to create a row on a date the person isn't on yet.
  async function findAnyByPerson(
    personId: string,
  ): Promise<GraphListItem | null> {
    const items = await graph.listItems(config.assignmentsListId, {
      filter: `fields/${F.personId} eq '${personId}'`,
    });
    return items[0] ?? null;
  }

  // SharePoint Lists have no composite-unique on (PersonId, BoardDate) — that
  // enforcement is the tenant-side indexed column at P2/JOS-166. Offline, a
  // concurrent insert race can briefly leave two rows for one key; collapse
  // them deterministically (keep the lowest item id) so the board never shows
  // a duplicate card. Idempotent: a co-racer's delete (404) is fine.
  async function reconcileDuplicates(
    personId: string,
    boardDate: string,
  ): Promise<void> {
    const rows = await graph.listItems(config.assignmentsListId, {
      filter: assignFilter(personId, boardDate),
    });
    if (rows.length <= 1) return;
    const keep = rows.reduce((a, b) => (a.id <= b.id ? a : b));
    for (const row of rows) {
      if (row.id === keep.id) continue;
      try {
        await graph.deleteItem(config.assignmentsListId, row.id);
      } catch (err) {
        if (!is404(err)) throw err;
      }
    }
  }

  const remote: RemoteBoardWriter = {
    async upsertAssignment(personId, areaName, boardDate, status) {
      const area = areaName ?? "";
      const buildFields = () => {
        // Set Area; touch Status only when supplied, so a plain move never
        // resets a break/relief person (mirrors board-data's upsert, which
        // omits status from the payload when undefined).
        const f: Record<string, unknown> = { [F.area]: area };
        if (status !== undefined) f[F.status] = status;
        return f;
      };

      // Update path with optimistic concurrency: PATCH under the row's If-Match
      // etag; if a concurrent writer won, re-read the latest and re-apply our
      // change (bounded retries) rather than clobbering it.
      for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
        const existing = await findAssignment(personId, boardDate);
        if (!existing) break; // no row yet -> insert path below
        try {
          await graph.updateItem(
            config.assignmentsListId,
            existing.id,
            buildFields(),
            existing.etag,
          );
          return;
        } catch (err) {
          if (err instanceof GraphConflictError && attempt < MAX_CONFLICT_RETRIES) {
            continue; // re-read on the next loop and retry
          }
          throw err;
        }
      }

      // Insert path: the denormalised row also needs the identity columns, so
      // copy them from another date's row for this person when one exists.
      const idf = (await findAnyByPerson(personId))?.fields ?? {};
      await graph.createItem(config.assignmentsListId, {
        [F.personId]: personId,
        [F.name]: str(idf[F.name]),
        [F.role]: str(idf[F.role]),
        [F.color]: str(idf[F.color]),
        [F.area]: area,
        [F.status]: status ?? "assigned",
        [F.boardDate]: boardDate,
      });
      // A concurrent insert for the same key may have raced us — collapse.
      await reconcileDuplicates(personId, boardDate);
    },

    async setAssignmentStatus(personId, boardDate, status) {
      const existing = await findAssignment(personId, boardDate);
      // A miss is a silent no-op, matching board-data's 0-row update.
      if (!existing) return;
      await graph.updateItem(config.assignmentsListId, existing.id, {
        [F.status]: status,
      });
    },

    async addPerson(name, role, color, boardDate) {
      // PersonId is app-minted into the column the read maps `id` from. The
      // awaited call returns it, so it satisfies serverGeneratedIds semantics
      // without a second round-trip or changing the read path.
      const person: BoardPerson = {
        id: crypto.randomUUID(),
        name,
        role,
        color,
        area: null,
        status: "assigned",
      };
      await graph.createItem(
        config.assignmentsListId,
        personToAssignmentFields(person, boardDate),
      );
      return person;
    },

    async removePerson(personId, boardDate) {
      const existing = await findAssignment(personId, boardDate);
      // Surface a 0-row delete loudly (the old client-UUID bug hid it).
      if (!existing) throw new Error("找不到該人員的班表記錄");
      await graph.deleteItem(config.assignmentsListId, existing.id);
    },

    async replaceBoard(boardDate, people) {
      // No server-side transaction exists, so clear the date's rows then
      // recreate. Per-item failures are surfaced loudly, not swallowed.
      const existing = await graph.listItems(config.assignmentsListId, {
        filter: `fields/${F.boardDate} eq '${boardDate}'`,
      });
      for (const item of existing) {
        await graph.deleteItem(config.assignmentsListId, item.id);
      }
      const adopted: BoardPerson[] = [];
      for (const p of people) {
        // Fresh server-side id; status resets to "assigned" (an import defines
        // the roster, not the duty state) — same as board-data.replaceBoard.
        const person: BoardPerson = {
          id: crypto.randomUUID(),
          name: p.name,
          role: p.role,
          color: p.color,
          area: p.area,
          status: "assigned",
        };
        try {
          await graph.createItem(
            config.assignmentsListId,
            personToAssignmentFields(person, boardDate),
          );
        } catch (err) {
          throw new Error(
            `匯入失敗 (${p.name}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        adopted.push(person);
      }
      return adopted;
    },

    async setAreaStatus(areaName, status, note) {
      const items = await graph.listItems(config.areaStatusListId, {
        filter: `fields/${AREA_F.name} eq '${areaName}'`,
      });
      const fields = { [AREA_F.status]: status, [AREA_F.note]: note };
      const existing = items[0];
      if (existing) {
        await graph.updateItem(config.areaStatusListId, existing.id, fields);
      } else {
        await graph.createItem(config.areaStatusListId, {
          [AREA_F.name]: areaName,
          ...fields,
        });
      }
    },
  };

  return {
    kind: "sharepoint",
    capabilities: {
      // No realtime push; freshness comes from polling (wired in P3).
      realtime: false,
      serverGeneratedIds: true,
      serverAudit: false,
    },
    remote,

    async fetchRoster(boardDate: string): Promise<BoardPerson[]> {
      // Filter on the indexed BoardDate column so a single growing list stays
      // under SharePoint's 5000-item view threshold.
      const items = await graph.listItems(config.assignmentsListId, {
        filter: `fields/${F.boardDate} eq '${boardDate}'`,
      });
      return items.map(assignmentItemToPerson);
    },

    async fetchAreaStatuses(): Promise<Map<string, AreaStatusInfo>> {
      const items = await graph.listItems(config.areaStatusListId);
      const result = new Map<string, AreaStatusInfo>();
      for (const item of items) {
        const name = str(item.fields[AREA_F.name]);
        if (!name) continue;
        result.set(name, {
          status: str(item.fields[AREA_F.status]) as AreaStatusInfo["status"],
          note: str(item.fields[AREA_F.note]),
        });
      }
      return result;
    },

    // Polling subscribe lands in P3; no-op until then.
    subscribe(): () => void {
      return () => {};
    },
  };
}
