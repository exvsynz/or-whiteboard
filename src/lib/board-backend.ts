import type { BoardPerson } from "./board-constants";
import type { AreaStatusInfo } from "./board-types";
import type { AssignmentStatus, RoomStatus } from "./database.types";

export type BackendKind = "demo" | "supabase" | "sharepoint";

export type ConnectionStatus =
  | "local"
  | "connecting"
  | "connected"
  | "disconnected";

export interface SubscribeHandlers {
  /** Fires when the board may have changed server-side; the caller refetches. */
  onChange: () => void;
  /** Reports realtime connection transitions. */
  onStatus: (status: ConnectionStatus) => void;
}

export interface BackendCapabilities {
  /** Server pushes changes (realtime). false → the client polls for freshness. */
  realtime: boolean;
  /** New people get their id from the server (async) vs minted locally (sync). */
  serverGeneratedIds: boolean;
  /** Mutations are audited server-side. false → the client logs audit locally. */
  serverAudit: boolean;
}

/** Read side — implemented by every backend, including demo. */
export interface BoardReader {
  fetchRoster(boardDate: string): Promise<BoardPerson[]>;
  fetchAreaStatuses(): Promise<Map<string, AreaStatusInfo>>;
}

/**
 * Write side — implemented only by remote backends (Supabase now, SharePoint
 * later). The demo backend has NO remote writer: its persistence is the local
 * whole-board cache, and it must never enter the optimistic write queue. So
 * BoardBackend.remote is null in demo mode, and the compiler forces callers to
 * narrow it before issuing a write.
 */
export interface RemoteBoardWriter {
  upsertAssignment(
    personId: string,
    areaName: string | null,
    boardDate: string,
    status?: AssignmentStatus,
  ): Promise<void>;
  setAssignmentStatus(
    personId: string,
    boardDate: string,
    status: AssignmentStatus,
  ): Promise<void>;
  addPerson(
    name: string,
    role: string,
    color: string,
    boardDate: string,
  ): Promise<BoardPerson>;
  removePerson(personId: string, boardDate: string): Promise<void>;
  replaceBoard(
    boardDate: string,
    people: BoardPerson[],
  ): Promise<BoardPerson[]>;
  setAreaStatus(
    areaName: string,
    status: RoomStatus,
    note: string,
  ): Promise<void>;
}

export interface BoardBackend extends BoardReader {
  readonly kind: BackendKind;
  readonly capabilities: BackendCapabilities;
  /** null in demo mode (no server persistence). */
  readonly remote: RemoteBoardWriter | null;
  /**
   * Subscribe to server-side changes for a board date. The demo backend
   * returns a no-op unsubscribe (no realtime). Returns the unsubscribe fn.
   */
  subscribe(boardDate: string, handlers: SubscribeHandlers): () => void;
}
