import type { BoardPerson } from "./board-constants";
import type { AreaStatusInfo } from "./board-types";

// Boards are stored per date so planning tomorrow's 班表 can't destroy
// today's. When Supabase is configured this is only an offline fallback
// cache; in demo mode it is the source of truth.
const STORAGE_PREFIX = "or-whiteboard-board";
const LEGACY_KEY = "or-whiteboard-board";

function keyFor(boardDate: string): string {
  return `${STORAGE_PREFIX}:${boardDate}`;
}

export interface StoredBoard {
  savedAt: string;
  people: BoardPerson[];
}

export function loadBoard(boardDate: string): StoredBoard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyFor(boardDate));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        Array.isArray((parsed as StoredBoard).people)
      ) {
        return parsed as StoredBoard;
      }
      return null;
    }
    // Migrate the legacy undated key (pre-date-keyed format: a bare array)
    // into today's board, then remove it.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy);
      localStorage.removeItem(LEGACY_KEY);
      if (Array.isArray(parsed)) {
        const migrated: StoredBoard = {
          savedAt: new Date().toISOString(),
          people: parsed as BoardPerson[],
        };
        localStorage.setItem(keyFor(boardDate), JSON.stringify(migrated));
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveBoard(boardDate: string, people: BoardPerson[]): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredBoard = {
      savedAt: new Date().toISOString(),
      people,
    };
    localStorage.setItem(keyFor(boardDate), JSON.stringify(stored));
  } catch {
    // Quota/private-mode failures are non-fatal: the board still works
    // in memory and (when configured) in Supabase.
  }
}

export function clearBoard(boardDate: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(keyFor(boardDate));
}

// Area/room statuses are live operational state (not per-date). In demo
// mode they live here; with Supabase they live in the area_status table.
const AREA_STATUS_KEY = "or-whiteboard-area-status";

export function loadAreaStatuses(): Map<string, AreaStatusInfo> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(AREA_STATUS_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();
    const entries = parsed.filter(
      (e): e is [string, AreaStatusInfo] =>
        Array.isArray(e) &&
        typeof e[0] === "string" &&
        e[1] !== null &&
        typeof e[1] === "object" &&
        typeof (e[1] as AreaStatusInfo).status === "string" &&
        typeof (e[1] as AreaStatusInfo).note === "string",
    );
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function saveAreaStatuses(statuses: Map<string, AreaStatusInfo>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AREA_STATUS_KEY, JSON.stringify([...statuses]));
  } catch {
    // Non-fatal: statuses still live in memory for this session.
  }
}
