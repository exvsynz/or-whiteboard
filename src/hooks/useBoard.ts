"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ALL_AREAS,
  ALL_AREAS_SET,
  COLOR_PALETTE,
  DEMO_PEOPLE,
} from "@/lib/board-constants";
import type { BoardPerson } from "@/lib/board-constants";
import type { AssignmentStatus, RoomStatus } from "@/lib/database.types";
import {
  loadBoard,
  saveBoard,
  clearBoard,
  loadAreaStatuses,
  saveAreaStatuses,
} from "@/lib/board-storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase-client";
import { useDebouncedCallback } from "@/lib/use-debounce";
import { logAuditEntry } from "@/lib/audit-client";
import { localDateString } from "@/lib/board-export";
import {
  fetchRoster,
  upsertAssignment,
  addPersonToRoster,
  removeFromRoster,
  replaceBoard,
  fetchAreaStatuses,
  setAreaStatus as persistAreaStatus,
  setAssignmentStatus,
  type AreaStatusInfo,
} from "@/lib/board-data";

export type { BoardPerson };

export type ConnectionStatus =
  | "local"
  | "connecting"
  | "connected"
  | "disconnected";

export type SaveState = "idle" | "saving" | "saved";

export interface MovePersonOptions {
  /** Skip DB persistence (used during playback animation, where the DB
   *  already holds the imported end state). */
  persist?: boolean;
}

export interface UseBoardReturn {
  people: BoardPerson[];
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: Date | null;
  connectionStatus: ConnectionStatus;
  saveState: SaveState;
  /** True when showing cached data because the server is unreachable. */
  isStale: boolean;
  boardDate: string;
  setBoardDate: (date: string) => void;
  movePerson: (
    personId: string,
    targetArea: string | null,
    opts?: MovePersonOptions,
  ) => void;
  addPerson: (name: string) => void;
  removePerson: (personId: string) => void;
  setPersonStatus: (personId: string, status: AssignmentStatus) => void;
  /** Replace the whole board (import). Returns the adopted roster — with
   *  DB-generated person ids when Supabase is configured. With
   *  displayUnassigned the DB receives the final state but the local board
   *  shows everyone unassigned, ready for playback animation. */
  importPeople: (
    newPeople: BoardPerson[],
    opts?: { displayUnassigned?: boolean },
  ) => Promise<BoardPerson[]>;
  resetBoard: () => void;
  saveNow: () => Promise<void>;
  /** Suppress realtime refetches while a playback animation drives the
   *  board locally. */
  setPlaybackActive: (active: boolean) => void;
  searchFilter: string;
  setSearchFilter: (query: string) => void;
  filteredPeople: BoardPerson[];
  peopleByArea: Record<string, BoardPerson[]>;
  areaStatuses: Map<string, AreaStatusInfo>;
  updateAreaStatus: (
    areaName: string,
    status: RoomStatus,
    note: string,
  ) => void;
}

// ---------- colour helper ----------

let colorIndex = 0;

function nextColor(): string {
  const c = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
  colorIndex++;
  return c;
}

// ---------- pending write queue (per person) ----------

interface PendingWrite {
  timer: ReturnType<typeof setTimeout>;
  /** Area to restore on failure — captured at the FIRST enqueue since the
   *  last successful flush, so rapid successive moves roll back to the
   *  last server-confirmed position, not an intermediate one. */
  prevArea: string | null;
  targetArea: string | null;
  boardDate: string;
}

const WRITE_DEBOUNCE_MS = 400;
const REFETCH_DEBOUNCE_MS = 300;
const KIOSK_POLL_MS = 60_000;

// ---------- hook ----------

export function useBoard(): UseBoardReturn {
  const [people, setPeople] = useState<BoardPerson[]>([]);
  const [boardDate, setBoardDateState] = useState<string>(() =>
    localDateString(),
  );
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    isSupabaseConfigured ? "connecting" : "local",
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isStale, setIsStale] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [areaStatuses, setAreaStatuses] = useState<Map<string, AreaStatusInfo>>(
    () => new Map(),
  );

  const isLoading = loadedKey !== boardDate;

  const peopleRef = useRef(people);
  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  const boardDateRef = useRef(boardDate);
  useEffect(() => {
    boardDateRef.current = boardDate;
  }, [boardDate]);

  const pendingRef = useRef(new Map<string, PendingWrite>());
  // Writes whose upsert is on the network right now. Kept separate from
  // pendingRef so applyPending can overlay them — otherwise a refetch
  // racing the upsert snaps the card back to its old area for a moment.
  const inFlightRef = useRef(new Map<string, PendingWrite>());
  const playbackActiveRef = useRef(false);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    loadedKeyRef.current = loadedKey;
  }, [loadedKey]);

  // ---- pending-write helpers ----

  const flushWrite = useCallback(async (personId: string): Promise<void> => {
    const entry = pendingRef.current.get(personId);
    if (!entry) return;
    pendingRef.current.delete(personId);
    clearTimeout(entry.timer);
    if (!supabase) return;
    inFlightRef.current.set(personId, entry);
    try {
      await upsertAssignment(
        supabase,
        personId,
        entry.targetArea,
        entry.boardDate,
      );
      // This area is now server-confirmed — re-anchor any newer pending
      // write so a later failure rolls back here, not to a pre-success
      // position older than what the server holds.
      const newer = pendingRef.current.get(personId);
      if (newer && newer.boardDate === entry.boardDate) {
        newer.prevArea = entry.targetArea;
      }
      setLastSyncedAt(new Date());
      setError(null);
    } catch (err) {
      // Roll back ONLY this person — restoring a whole-board snapshot
      // would wipe unrelated edits made in the meantime. Guard against:
      // the board having switched dates (person ids are global, so the
      // rollback would move their card on the WRONG date's board), and a
      // newer local move (only revert if still at this write's target).
      if (boardDateRef.current === entry.boardDate) {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === personId && p.area === entry.targetArea
              ? { ...p, area: entry.prevArea }
              : p,
          ),
        );
      }
      setError(
        `移動失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      // A newer enqueue for the same person may have landed while this
      // write was in flight — only clear our own entry.
      if (inFlightRef.current.get(personId) === entry) {
        inFlightRef.current.delete(personId);
      }
    }
  }, []);

  const flushAllWrites = useCallback(async (): Promise<void> => {
    const ids = [...pendingRef.current.keys()];
    await Promise.all(ids.map((id) => flushWrite(id)));
  }, [flushWrite]);

  const enqueueWrite = useCallback(
    (personId: string, prevArea: string | null, targetArea: string | null) => {
      const existing = pendingRef.current.get(personId);
      if (existing) clearTimeout(existing.timer);
      // Anchor the rollback to the last server-confirmed area: an earlier
      // pending/in-flight entry's prevArea wins over the current optimistic
      // position.
      const anchor =
        existing ?? inFlightRef.current.get(personId) ?? undefined;
      pendingRef.current.set(personId, {
        prevArea: anchor ? anchor.prevArea : prevArea,
        targetArea,
        boardDate: boardDateRef.current,
        timer: setTimeout(() => void flushWrite(personId), WRITE_DEBOUNCE_MS),
      });
    },
    [flushWrite],
  );

  /** Overlay optimistic positions of pending and in-flight writes onto a
   *  fetched roster (pending is newer, so it wins). Entries from another
   *  board date are skipped — person ids are global across dates, so a
   *  date-A write must not reposition the person's card on date B. */
  const applyPending = useCallback((roster: BoardPerson[]): BoardPerson[] => {
    const pending = pendingRef.current;
    const inFlight = inFlightRef.current;
    if (pending.size === 0 && inFlight.size === 0) return roster;
    const date = boardDateRef.current;
    return roster.map((p) => {
      const pw = pending.get(p.id) ?? inFlight.get(p.id);
      return pw && pw.boardDate === date ? { ...p, area: pw.targetArea } : p;
    });
  }, []);

  // ---- initial / per-date load ----

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Yield a microtask so state updates never run synchronously inside
      // the effect body (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      if (!isSupabaseConfigured || !supabase) {
        const stored = loadBoard(boardDate);
        if (stored) {
          // A stored board wins even when empty — a deliberately cleared
          // roster must not resurrect the demo people on reload.
          setPeople(stored.people);
        } else if (boardDate === localDateString()) {
          setPeople(DEMO_PEOPLE);
        } else {
          setPeople([]);
        }
        setAreaStatuses(loadAreaStatuses());
      } else {
        try {
          const [roster, statuses] = await Promise.all([
            fetchRoster(supabase, boardDate),
            fetchAreaStatuses(supabase),
          ]);
          if (cancelled) return;
          setPeople(applyPending(roster));
          setAreaStatuses(statuses);
          setLastSyncedAt(new Date());
          setIsStale(false);
          setError(null);
        } catch (err) {
          if (cancelled) return;
          // Offline fallback: show the cached board, clearly marked stale.
          const stored = loadBoard(boardDate);
          setPeople(stored?.people ?? []);
          setIsStale(true);
          setError(
            `無法連線到伺服器，顯示快取資料 (${err instanceof Error ? err.message : String(err)})`,
          );
        }
      }
      if (!cancelled) setLoadedKey(boardDate);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [boardDate, applyPending]);

  // ---- refetch (realtime / reconnect / focus / poll) ----

  const refetch = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured || !supabase) return;
    if (playbackActiveRef.current) return;
    const date = boardDateRef.current;
    try {
      const [roster, statuses] = await Promise.all([
        fetchRoster(supabase, date),
        fetchAreaStatuses(supabase),
      ]);
      if (playbackActiveRef.current) return;
      // The user may have switched dates while this was on the network —
      // landing the stale roster would display (and cache) date A's board
      // under date B.
      if (boardDateRef.current !== date) return;
      setPeople(applyPending(roster));
      setAreaStatuses(statuses);
      setLastSyncedAt(new Date());
      setIsStale(false);
    } catch {
      setIsStale(true);
    }
  }, [applyPending]);

  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      void refetch();
    }, REFETCH_DEBOUNCE_MS);
  }, [refetch]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    // removeChannel fires the subscribe callback with CLOSED during
    // cleanup — without this flag every date switch flashes 連線中斷.
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
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "people" },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "area_status" },
        scheduleRefetch,
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
          // Catch up on anything missed while the channel was down.
          scheduleRefetch();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConnectionStatus("disconnected");
        }
      });

    const onOnline = () => scheduleRefetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefetch();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    // Kiosk safety net: realtime can silently die behind hospital proxies.
    const poll = setInterval(scheduleRefetch, KIOSK_POLL_MS);

    return () => {
      active = false;
      void client.removeChannel(channel);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, [boardDate, scheduleRefetch]);

  // ---- local cache persistence ----

  const debouncedSave = useDebouncedCallback(
    (date: string, data: BoardPerson[]) => saveBoard(date, data),
    500,
  );
  useEffect(() => {
    if (loadedKey === boardDate) {
      debouncedSave(boardDate, people);
    }
  }, [people, boardDate, loadedKey, debouncedSave]);

  // Flush on tab close/navigation — the debounce above would otherwise
  // drop the last 500ms of edits.
  useEffect(() => {
    const flush = () => {
      if (loadedKey === boardDateRef.current) {
        saveBoard(boardDateRef.current, peopleRef.current);
      }
      for (const id of pendingRef.current.keys()) void flushWrite(id);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [loadedKey, flushWrite]);

  // ---- actions ----

  const setBoardDate = useCallback(
    (date: string) => {
      // Settle the old date's writes before switching context — including
      // the localStorage cache: the 500ms debounced save would otherwise
      // be cancelled by the new date's first save and silently drop the
      // last edit.
      if (loadedKeyRef.current === boardDateRef.current) {
        saveBoard(boardDateRef.current, peopleRef.current);
      }
      void flushAllWrites();
      setBoardDateState(date);
    },
    [flushAllWrites],
  );

  const movePerson = useCallback(
    (personId: string, targetArea: string | null, opts?: MovePersonOptions) => {
      if (targetArea !== null && !ALL_AREAS_SET.has(targetArea)) {
        setError(`無效的區域: ${targetArea}`);
        return;
      }
      const person = peopleRef.current.find((p) => p.id === personId);
      if (!person || person.area === targetArea) return;

      if (!isSupabaseConfigured) {
        logAuditEntry({
          personId,
          personName: person.name,
          fromArea: person.area,
          toArea: targetArea,
          actionType:
            person.area === null
              ? "assign"
              : targetArea === null
                ? "unassign"
                : "reassign",
        });
      }

      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, area: targetArea } : p)),
      );

      if (opts?.persist === false) return;
      if (isSupabaseConfigured && supabase) {
        enqueueWrite(personId, person.area, targetArea);
      }
    },
    [enqueueWrite],
  );

  const addPerson = useCallback((name: string) => {
    const color = nextColor();
    if (isSupabaseConfigured && supabase) {
      const date = boardDateRef.current;
      addPersonToRoster(supabase, name, "未設定", color, date)
        .then((person) => {
          // The board may have switched dates while the insert was on the
          // network — the person belongs to the original date's roster.
          if (boardDateRef.current !== date) return;
          // The realtime echo of the insert may have refetched the roster
          // (already containing this person) before we append.
          setPeople((prev) =>
            prev.some((p) => p.id === person.id) ? prev : [...prev, person],
          );
          setLastSyncedAt(new Date());
        })
        .catch((err: unknown) => {
          setError(
            `新增人員失敗: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      return;
    }
    const person: BoardPerson = {
      id: crypto.randomUUID(),
      name,
      role: "未設定",
      color,
      area: null,
    };
    logAuditEntry({
      personId: person.id,
      personName: person.name,
      fromArea: null,
      toArea: null,
      actionType: "add_person",
    });
    setPeople((prev) => [...prev, person]);
  }, []);

  const removePerson = useCallback((personId: string) => {
    const person = peopleRef.current.find((p) => p.id === personId);
    if (!person) return;

    setPeople((prev) => prev.filter((p) => p.id !== personId));

    if (isSupabaseConfigured && supabase) {
      removeFromRoster(supabase, personId, boardDateRef.current)
        .then(() => {
          setLastSyncedAt(new Date());
        })
        .catch((err: unknown) => {
          // Restore the card — the server still has it.
          setPeople((prev) =>
            prev.some((p) => p.id === personId) ? prev : [...prev, person],
          );
          setError(
            `移除人員失敗: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      return;
    }
    logAuditEntry({
      personId,
      personName: person.name,
      fromArea: person.area,
      toArea: null,
      actionType: "remove_person",
    });
  }, []);

  const setPersonStatus = useCallback(
    (personId: string, status: AssignmentStatus) => {
      const person = peopleRef.current.find((p) => p.id === personId);
      if (!person) return;
      const prevStatus = person.status ?? "assigned";
      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, status } : p)),
      );
      if (isSupabaseConfigured && supabase) {
        setAssignmentStatus(supabase, personId, boardDateRef.current, status)
          .then(() => setLastSyncedAt(new Date()))
          .catch((err: unknown) => {
            setPeople((prev) =>
              prev.map((p) =>
                p.id === personId ? { ...p, status: prevStatus } : p,
              ),
            );
            setError(
              `狀態更新失敗: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }
    },
    [],
  );

  const importPeople = useCallback(
    async (
      newPeople: BoardPerson[],
      opts?: { displayUnassigned?: boolean },
    ): Promise<BoardPerson[]> => {
      let adopted = newPeople;
      if (isSupabaseConfigured && supabase) {
        adopted = await replaceBoard(supabase, boardDateRef.current, newPeople);
        setLastSyncedAt(new Date());
      }
      setPeople(
        opts?.displayUnassigned
          ? adopted.map((p) => ({ ...p, area: null }))
          : adopted,
      );
      setError(null);
      return adopted;
    },
    [],
  );

  const resetBoard = useCallback(() => {
    if (isSupabaseConfigured && supabase) {
      // Clearing the date's roster server-side keeps every client in sync
      // (and the deletion is audited by the assignments trigger).
      replaceBoard(supabase, boardDateRef.current, [])
        .then(() => {
          setPeople([]);
          setLastSyncedAt(new Date());
        })
        .catch((err: unknown) => {
          setError(
            `重置失敗: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      clearBoard(boardDateRef.current);
      return;
    }
    clearBoard(boardDateRef.current);
    // Demo roster belongs to today only — resetting another date clears it.
    setPeople(
      boardDateRef.current === localDateString() ? DEMO_PEOPLE : [],
    );
    setError(null);
    setLastSyncedAt(null);
  }, []);

  const saveNow = useCallback(async (): Promise<void> => {
    setSaveState("saving");
    // Same guard as the debounced save: never write a roster that belongs
    // to a different (still-loading) date under this date's cache key.
    if (loadedKeyRef.current === boardDateRef.current) {
      saveBoard(boardDateRef.current, peopleRef.current);
    }
    await flushAllWrites();
    setSaveState("saved");
    if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
    saveStateTimerRef.current = setTimeout(() => setSaveState("idle"), 2000);
  }, [flushAllWrites]);

  useEffect(() => {
    return () => {
      if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
    };
  }, []);

  const setPlaybackActive = useCallback(
    (active: boolean) => {
      playbackActiveRef.current = active;
      if (!active) scheduleRefetch();
    },
    [scheduleRefetch],
  );

  // Demo mode: persist statuses whenever they change — they would
  // otherwise vanish on reload. (Effect-based so updateAreaStatus can use
  // a functional update without losing batched changes.)
  useEffect(() => {
    if (!isSupabaseConfigured && loadedKey !== null) {
      saveAreaStatuses(areaStatuses);
    }
  }, [areaStatuses, loadedKey]);

  const updateAreaStatus = useCallback(
    (areaName: string, status: RoomStatus, note: string) => {
      const prev = areaStatuses.get(areaName);
      setAreaStatuses((current) => {
        const next = new Map(current);
        next.set(areaName, { status, note });
        return next;
      });
      if (isSupabaseConfigured && supabase) {
        persistAreaStatus(supabase, areaName, status, note).catch(
          (err: unknown) => {
            setAreaStatuses((current) => {
              const reverted = new Map(current);
              if (prev) reverted.set(areaName, prev);
              else reverted.delete(areaName);
              return reverted;
            });
            setError(
              `區域狀態更新失敗: ${err instanceof Error ? err.message : String(err)}`,
            );
          },
        );
      }
    },
    [areaStatuses],
  );

  // ---- derived state ----

  const filteredPeople = useMemo(() => {
    if (!searchFilter) return people;
    const q = searchFilter.toLowerCase();
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        (p.area !== null && p.area.toLowerCase().includes(q)),
    );
  }, [people, searchFilter]);

  const peopleByArea = useMemo(() => {
    const map: Record<string, BoardPerson[]> = {};
    for (const area of ALL_AREAS) {
      map[area] = [];
    }
    for (const p of filteredPeople) {
      if (p.area !== null && map[p.area] !== undefined) {
        map[p.area].push(p);
      }
    }
    return map;
  }, [filteredPeople]);

  return {
    people,
    isLoading,
    error,
    lastSyncedAt,
    connectionStatus,
    saveState,
    isStale,
    boardDate,
    setBoardDate,
    movePerson,
    addPerson,
    removePerson,
    setPersonStatus,
    importPeople,
    resetBoard,
    saveNow,
    setPlaybackActive,
    searchFilter,
    setSearchFilter,
    filteredPeople,
    peopleByArea,
    areaStatuses,
    updateAreaStatus,
  };
}
