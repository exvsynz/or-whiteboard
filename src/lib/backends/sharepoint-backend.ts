import type { BoardPerson } from "../board-constants";
import type { AssignmentStatus } from "../database.types";
import type { AreaStatusInfo } from "../board-types";
import type { BoardBackend, RemoteBoardWriter } from "../board-backend";
import type { GraphClient, GraphListItem } from "../graph-client";

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

const notImplemented = (): Promise<never> =>
  Promise.reject(
    new Error("SharePoint write path not implemented yet (P4)"),
  );

export function createSharePointBackend(
  graph: GraphClient,
  config: SharePointConfig,
): BoardBackend {
  // Writes land in P4; until then they reject loudly so an early wiring can't
  // silently drop edits.
  const remote: RemoteBoardWriter = {
    upsertAssignment: notImplemented,
    setAssignmentStatus: notImplemented,
    addPerson: notImplemented,
    removePerson: notImplemented,
    replaceBoard: notImplemented,
    setAreaStatus: notImplemented,
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
