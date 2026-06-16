import { DEMO_PEOPLE } from "../board-constants";
import type { BoardPerson } from "../board-constants";
import type { AreaStatusInfo } from "../board-types";
import { loadBoard, loadAreaStatuses } from "../board-storage";
import { localDateString } from "../board-export";
import type { BoardBackend } from "../board-backend";

/**
 * Demo / offline backend. Reads come from localStorage, falling back to the
 * seeded DEMO_PEOPLE for today only. There is no remote writer: persistence is
 * the whole-board localStorage cache owned by useBoard, so demo writes never
 * go through the optimistic queue.
 */
export function createDemoBackend(): BoardBackend {
  return {
    kind: "demo",
    capabilities: {
      realtime: false,
      serverGeneratedIds: false,
      serverAudit: false,
    },
    remote: null,

    async fetchRoster(boardDate: string): Promise<BoardPerson[]> {
      const stored = loadBoard(boardDate);
      // A stored board wins even when empty — a deliberately cleared roster
      // must not resurrect the demo people on reload.
      if (stored) return stored.people;
      if (boardDate === localDateString()) return [...DEMO_PEOPLE];
      return [];
    },

    async fetchAreaStatuses(): Promise<Map<string, AreaStatusInfo>> {
      return loadAreaStatuses();
    },

    subscribe(): () => void {
      // Demo has no realtime; a no-op unsubscribe keeps callers uniform.
      return () => {};
    },
  };
}
