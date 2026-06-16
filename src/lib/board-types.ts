import type { RoomStatus } from "./database.types";

/**
 * Backend-neutral domain type for a room/area's live operational status.
 * Lives here (not in board-data) so the demo path and the UI never depend
 * on the Supabase data module — and so board-data can be removed at cutover
 * (P8) without breaking them.
 */
export interface AreaStatusInfo {
  status: RoomStatus;
  note: string;
}
