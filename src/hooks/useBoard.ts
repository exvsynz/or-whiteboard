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
  loadAreaStatuses,
  saveBoard,
  clearBoard,
  saveAreaStatuses,
} from "@/lib/board-storage";
import { useDebouncedCallback } from "@/lib/use-debounce";
import { logAuditEntry } from "@/lib/audit-client";
import { localDateString } from "@/lib/board-export";
import { getBackend } from "@/lib/backend-config";
import type { ConnectionStatus } from "@/lib/board-backend";
import type { AreaStatusInfo } from "@/lib/board-types";

export type { BoardPerson };

// The active persistence backend (demo or Supabase) is fixed for the session,
// like the supabase-client singleton. `remote` is null in demo mode — every
// server write is gated on it, so demo never enters the optimistic queue.
const backend = getBackend();
const remote = backend.remote;

export type { ConnectionStatus };

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
    backend.capabilities.realtime ? "connecting" : "local",
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
  // Promises of writes currently on the network, so a destructive op can await
  // them before mutating server state (drainWrites).
  const inFlightPromisesRef = useRef(new Map<string, Promise<boolean>>());
  const playbackActiveRef = useRef(false);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    loadedKeyRef.current = loadedKey;
  }, [loadedKey]);

  // ---- pending-write helpers ----

  // Resolves true when the write succeeded (or there was nothing to send),
  // false when the upsert failed and rolled back — saveNow uses this so it
  // never reports "已儲存" after a failed write.
  const flushWrite = useCallback(async (personId: string): Promise<boolean> => {
    const entry = pendingRef.current.get(personId);
    if (!entry) return true;
    pendingRef.current.delete(personId);
    clearTimeout(entry.timer);
    if (!remote) return true;
    inFlightRef.current.set(personId, entry);
    try {
      await remote.upsertAssignment(
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
      return true;
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
      return false;
    } finally {
      // A newer enqueue for the same person may have landed while this
      // write was in flight — only clear our own entry.
      if (inFlightRef.current.get(personId) === entry) {
        inFlightRef.current.delete(personId);
      }
    }
  }, []);

  // Flush a pending write and record its in-flight promise so destructive ops
  // can await it (drainWrites). Self-clears from the map on completion.
  const flushAndTrack = useCallback(
    (personId: string): Promise<boolean> => {
      const pr = flushWrite(personId);
      inFlightPromisesRef.current.set(personId, pr);
      void pr.finally(() => {
        if (inFlightPromisesRef.current.get(personId) === pr) {
          inFlightPromisesRef.current.delete(personId);
        }
      });
      return pr;
    },
    [flushWrite],
  );

  // True when every flushed write succeeded (vacuously true with none pending).
  const flushAllWrites = useCallback(async (): Promise<boolean> => {
    const ids = [...pendingRef.current.keys()];
    const results = await Promise.all(ids.map((id) => flushAndTrack(id)));
    return results.every(Boolean);
  }, [flushAndTrack]);

  // Settle the optimistic move queue WITHOUT sending anything new, so a
  // destructive server op (remove/import/reset) can't be overtaken by a stale
  // upsert: cancel any still-pending (debounced) writes, then await any already
  // in flight. Scope to one person, or drain everything when omitted.
  const drainWrites = useCallback(
    async (personId?: string): Promise<void> => {
      const cancelIds = personId ? [personId] : [...pendingRef.current.keys()];
      for (const id of cancelIds) {
        const pending = pendingRef.current.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRef.current.delete(id);
        }
      }
      const proms = personId
        ? ([inFlightPromisesRef.current.get(personId)].filter(
            Boolean,
          ) as Promise<boolean>[])
        : [...inFlightPromisesRef.current.values()];
      await Promise.allSettled(proms);
    },
    [],
  );

  const enqueueWrite = useCallback(
    (personId: string, prevArea: string | null, targetArea: string | null) => {
      const existing = pendingRef.current.get(personId);
      if (existing) clearTimeout(existing.timer);
      // Anchor the rollback to the last server-confirmed area: an earlier
      // pending/in-flight entry's prevArea wins over the current optimistic
      // position — but ONLY when it belongs to the current board date. Person
      // ids are global across dates, so a stale date-A anchor would otherwise
      // roll a failed date-B move back to a date-A area.
      const candidate = existing ?? inFlightRef.current.get(personId);
      const anchor =
        candidate && candidate.boardDate === boardDateRef.current
          ? candidate
          : undefined;
      pendingRef.current.set(personId, {
        prevArea: anchor ? anchor.prevArea : prevArea,
        targetArea,
        boardDate: boardDateRef.current,
        timer: setTimeout(
          () => void flushAndTrack(personId),
          WRITE_DEBOUNCE_MS,
        ),
      });
    },
    [flushAndTrack],
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
      if (!remote) {
        // Demo: the backend reads the local cache (or the seeded roster for
        // today); statuses likewise come from local storage.
        const [roster, statuses] = await Promise.all([
          backend.fetchRoster(boardDate),
          backend.fetchAreaStatuses(),
        ]);
        if (cancelled) return;
        setPeople(roster);
        setAreaStatuses(statuses);
      } else {
        try {
          const [roster, statuses] = await Promise.all([
            backend.fetchRoster(boardDate),
            backend.fetchAreaStatuses(),
          ]);
          if (cancelled) return;
          setPeople(applyPending(roster));
          setAreaStatuses(statuses);
          setLastSyncedAt(new Date());
          setIsStale(false);
          setError(null);
        } catch (err) {
          if (cancelled) return;
          // Offline fallback: show the cached board + statuses, clearly marked
          // stale. Area statuses are cached separately, so restore them too —
          // otherwise room badges/notes vanish on a reconnect failure even
          // though they're sitting in local storage.
          const stored = loadBoard(boardDate);
          setPeople(stored?.people ?? []);
          setAreaStatuses(loadAreaStatuses());
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
    if (!remote) return;
    if (playbackActiveRef.current) return;
    const date = boardDateRef.current;
    try {
      const [roster, statuses] = await Promise.all([
        backend.fetchRoster(date),
        backend.fetchAreaStatuses(),
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
    if (!remote) return;
    const unsubscribe = backend.subscribe(boardDate, {
      onChange: scheduleRefetch,
      onStatus: setConnectionStatus,
    });

    // Kiosk safety net (backend-neutral): realtime can silently die behind
    // hospital proxies, and the tab may be backgrounded for hours.
    const onOnline = () => scheduleRefetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefetch();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(scheduleRefetch, KIOSK_POLL_MS);

    return () => {
      unsubscribe();
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
      for (const id of pendingRef.current.keys()) void flushAndTrack(id);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [loadedKey, flushAndTrack]);

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

      if (!remote) {
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
      if (remote) {
        enqueueWrite(personId, person.area, targetArea);
      }
    },
    [enqueueWrite],
  );

  const addPerson = useCallback((name: string) => {
    const color = nextColor();
    if (remote) {
      const date = boardDateRef.current;
      remote.addPerson(name, "未設定", color, date)
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

  const removePerson = useCallback(
    (personId: string) => {
      const person = peopleRef.current.find((p) => p.id === personId);
      if (!person) return;

      setPeople((prev) => prev.filter((p) => p.id !== personId));

      if (remote) {
        const date = boardDateRef.current;
        void (async () => {
          // Cancel this person's queued move and let any in-flight one land
          // first, so a stale upsert can't resurrect the row after the delete.
          await drainWrites(personId);
          try {
            await remote.removePerson(personId, date);
            setLastSyncedAt(new Date());
          } catch (err: unknown) {
            // Restore the card — the server still has it — but only while we're
            // still on that person's date (ids are global across dates).
            if (boardDateRef.current === date) {
              setPeople((prev) =>
                prev.some((p) => p.id === personId) ? prev : [...prev, person],
              );
            }
            setError(
              `移除人員失敗: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        })();
        return;
      }
      logAuditEntry({
        personId,
        personName: person.name,
        fromArea: person.area,
        toArea: null,
        actionType: "remove_person",
      });
    },
    [drainWrites],
  );

  const setPersonStatus = useCallback(
    (personId: string, status: AssignmentStatus) => {
      const person = peopleRef.current.find((p) => p.id === personId);
      if (!person) return;
      const prevStatus = person.status ?? "assigned";
      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, status } : p)),
      );
      if (remote) {
        const date = boardDateRef.current;
        remote.setAssignmentStatus(personId, date, status)
          .then(() => setLastSyncedAt(new Date()))
          .catch((err: unknown) => {
            // Roll back only while we're still on that write's date AND our
            // optimistic status is still current — never touch another date's
            // board (ids are global) or clobber a newer change.
            if (boardDateRef.current === date) {
              setPeople((prev) =>
                prev.map((p) =>
                  p.id === personId && p.status === status
                    ? { ...p, status: prevStatus }
                    : p,
                ),
              );
            }
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
      if (remote) {
        const date = boardDateRef.current;
        await drainWrites(); // settle the move queue before replacing the board
        adopted = await remote.replaceBoard(date, newPeople);
        // The user may have switched dates while replaceBoard was on the
        // network — never render/cache date A's roster under date B.
        if (boardDateRef.current !== date) return adopted;
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
    [drainWrites],
  );

  const resetBoard = useCallback(() => {
    if (remote) {
      const date = boardDateRef.current;
      // Clearing the date's roster server-side keeps every client in sync
      // (and the deletion is audited by the assignments trigger).
      clearBoard(date);
      void (async () => {
        await drainWrites(); // settle the move queue before replacing the board
        try {
          await remote.replaceBoard(date, []);
          // Only clear the visible board if we're still on the date we reset.
          if (boardDateRef.current === date) {
            setPeople([]);
            setLastSyncedAt(new Date());
          }
        } catch (err: unknown) {
          setError(
            `重置失敗: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      })();
      return;
    }
    clearBoard(boardDateRef.current);
    // Demo roster belongs to today only — resetting another date clears it.
    setPeople(
      boardDateRef.current === localDateString() ? DEMO_PEOPLE : [],
    );
    setError(null);
    setLastSyncedAt(null);
  }, [drainWrites]);

  const saveNow = useCallback(async (): Promise<void> => {
    setSaveState("saving");
    // Same guard as the debounced save: never write a roster that belongs
    // to a different (still-loading) date under this date's cache key.
    if (loadedKeyRef.current === boardDateRef.current) {
      saveBoard(boardDateRef.current, peopleRef.current);
    }
    const ok = await flushAllWrites();
    // Only claim "已儲存" when every flushed write actually succeeded — a failed
    // upsert sets `error` and rolls back, so reporting "saved" would be a lie.
    if (!ok) {
      setSaveState("idle");
      return;
    }
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
    if (!remote && loadedKey !== null) {
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
      if (remote) {
        remote.setAreaStatus(areaName, status, note).catch(
          (err: unknown) => {
            setAreaStatuses((current) => {
              const cur = current.get(areaName);
              // Roll back only if our optimistic value is still current — a
              // newer area-status change must not be clobbered by this failure.
              if (!cur || cur.status !== status || cur.note !== note) {
                return current;
              }
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

  // A remote poll-backend (SharePoint) has no realtime channel to report
  // status, so derive it from poll health: "connecting" until the first load,
  // then "connected"/"disconnected" by whether the latest refetch is stale.
  // Realtime backends keep their channel-driven status. Demo and SharePoint
  // are both realtime:false, so `remote` (not `realtime`) is what tells them
  // apart — demo (remote === null) stays "local".
  const pollAwareConnectionStatus: ConnectionStatus = backend.capabilities
    .realtime
    ? connectionStatus
    : remote
      ? loadedKey === null
        ? "connecting"
        : isStale
          ? "disconnected"
          : "connected"
      : "local";

  return {
    people,
    isLoading,
    error,
    lastSyncedAt,
    connectionStatus: pollAwareConnectionStatus,
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
