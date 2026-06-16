import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { BoardBackend, SubscribeHandlers } from "../board-backend";
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

    subscribe(
      boardDate: string,
      { onChange, onStatus }: SubscribeHandlers,
    ): () => void {
      // removeChannel fires the subscribe callback with CLOSED during cleanup —
      // without this flag every date switch flashes 連線中斷.
      let active = true;
      const channel = client
        .channel(`board-${boardDate}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "assignments",
            filter: `board_date=eq.${boardDate}`,
          },
          onChange,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "people" },
          onChange,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "area_status" },
          onChange,
        )
        .subscribe((status) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            onStatus("connected");
            // Catch up on anything missed while the channel was down.
            onChange();
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            onStatus("disconnected");
          }
        });
      return () => {
        active = false;
        void client.removeChannel(channel);
      };
    },
  };
}
