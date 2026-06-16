import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { BoardBackend } from "../board-backend";
import {
  fetchRoster,
  fetchAreaStatuses,
  upsertAssignment,
  setAssignmentStatus,
  addPersonToRoster,
  removeFromRoster,
  replaceBoard,
  setAreaStatus,
} from "../board-data";

type Client = SupabaseClient<Database>;

/**
 * Supabase backend — a thin wrapper over the stateless board-data CRUD
 * functions that captures the client so callers never pass it. Shelved at
 * cutover (P8); the SharePoint backend implements the same BoardBackend shape.
 */
export function createSupabaseBackend(client: Client): BoardBackend {
  return {
    kind: "supabase",
    capabilities: {
      realtime: true,
      serverGeneratedIds: true,
      serverAudit: true,
    },

    fetchRoster: (boardDate) => fetchRoster(client, boardDate),
    fetchAreaStatuses: () => fetchAreaStatuses(client),

    remote: {
      upsertAssignment: (personId, areaName, boardDate, status) =>
        upsertAssignment(client, personId, areaName, boardDate, status),
      setAssignmentStatus: (personId, boardDate, status) =>
        setAssignmentStatus(client, personId, boardDate, status),
      addPerson: (name, role, color, boardDate) =>
        addPersonToRoster(client, name, role, color, boardDate),
      removePerson: (personId, boardDate) =>
        removeFromRoster(client, personId, boardDate),
      replaceBoard: (boardDate, people) =>
        replaceBoard(client, boardDate, people),
      setAreaStatus: (areaName, status, note) =>
        setAreaStatus(client, areaName, status, note),
    },
  };
}
