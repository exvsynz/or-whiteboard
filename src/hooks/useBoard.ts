"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ALL_AREAS,
  ALL_AREAS_SET,
  COLOR_PALETTE,
  DEMO_PEOPLE,
} from "@/lib/board-constants";
import type { BoardPerson } from "@/lib/board-constants";
import { loadBoard, saveBoard, clearBoard } from "@/lib/board-storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase-client";
import { useDebouncedCallback } from "@/lib/use-debounce";
import { logAuditEntry } from "@/lib/audit-client";

export type { BoardPerson };

export interface UseBoardReturn {
  people: BoardPerson[];
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: Date | null;
  movePerson: (personId: string, targetArea: string | null) => void;
  addPerson: (name: string) => void;
  removePerson: (personId: string) => void;
  resetBoard: () => void;
  searchFilter: string;
  setSearchFilter: (query: string) => void;
  filteredPeople: BoardPerson[];
  peopleByArea: Record<string, BoardPerson[]>;
}

// ---------- colour helper ----------

let colorIndex = 0;

function nextColor(): string {
  const c = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
  colorIndex++;
  return c;
}

// ---------- hook ----------

export function useBoard(): UseBoardReturn {
  const [people, setPeople] = useState<BoardPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  // Keep a ref to people for rollback inside async callbacks.
  const peopleRef = useRef(people);
  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  // ---- persist to localStorage (debounced to avoid thrashing on rapid drags) ----
  const isInitialised = useRef(false);
  const debouncedSave = useDebouncedCallback(
    (data: BoardPerson[]) => saveBoard(data),
    500,
  );
  useEffect(() => {
    if (isInitialised.current) {
      debouncedSave(people);
    }
  }, [people, debouncedSave]);

  // ---- initial load ----
  useEffect(() => {
    const stored = loadBoard();
    if (stored && stored.length > 0) {
      setPeople(stored);
    } else {
      setPeople(DEMO_PEOPLE);
    }
    isInitialised.current = true;
    setIsLoading(false);
  }, []);

  // ---- Supabase Realtime subscription ----
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const client = supabase;
    const channel = client
      .channel("assignments-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignments" },
        () => {
          // On external change, signal a sync event
          setLastSyncedAt(new Date());
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  // ---- debounced Supabase write for movePerson ----
  const persistMove = useDebouncedCallback(
    (personId: string, targetArea: string | null, rollback: BoardPerson[]) => {
      if (!isSupabaseConfigured || !supabase) return;

      const today = new Date().toISOString().slice(0, 10);

      const assignmentData = {
        person_id: personId,
        area_id: targetArea,
        board_date: today,
        updated_by: null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase v2.106 GenericSchema resolution bug
      (supabase.from("assignments") as any)
        .upsert(assignmentData, { onConflict: "person_id,board_date" })
        .then(({ error: err }: { error: { message: string } | null }) => {
          if (err) {
            setPeople(rollback);
            setError(`移動失敗: ${err.message}`);
          } else {
            setLastSyncedAt(new Date());
          }
        });
    },
    300,
  );

  // ---- actions ----

  const movePerson = useCallback(
    (personId: string, targetArea: string | null) => {
      // Validate area
      if (targetArea !== null && !ALL_AREAS_SET.has(targetArea)) {
        setError(`無效的區域: ${targetArea}`);
        return;
      }

      // Audit log before mutation
      const person = peopleRef.current.find((p) => p.id === personId);
      if (person) {
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

      // Save rollback state before mutation
      const rollback = peopleRef.current;

      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, area: targetArea } : p)),
      );

      persistMove(personId, targetArea, rollback);
    },
    [persistMove],
  );

  const addPerson = useCallback((name: string) => {
    const person: BoardPerson = {
      id: crypto.randomUUID(),
      name,
      role: "未設定",
      color: nextColor(),
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

    if (isSupabaseConfigured && supabase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase v2.106 GenericSchema resolution bug
      (supabase.from("people") as any)
        .insert({ name: person.name, role: person.role, color: person.color })
        .then(({ error: err }: { error: { message: string } | null }) => {
          if (err) {
            setError(`新增人員失敗: ${err.message}`);
          } else {
            setLastSyncedAt(new Date());
          }
        });
    }
  }, []);

  const removePerson = useCallback((personId: string) => {
    const person = peopleRef.current.find((p) => p.id === personId);
    if (person) {
      logAuditEntry({
        personId,
        personName: person.name,
        fromArea: person.area,
        toArea: null,
        actionType: "remove_person",
      });
    }

    setPeople((prev) => prev.filter((p) => p.id !== personId));

    if (isSupabaseConfigured && supabase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase v2.106 GenericSchema resolution bug
      (supabase.from("people") as any)
        .update({ is_active: false })
        .eq("id", personId)
        .then(({ error: err }: { error: { message: string } | null }) => {
          if (err) {
            setError(`移除人員失敗: ${err.message}`);
          } else {
            setLastSyncedAt(new Date());
          }
        });
    }
  }, []);

  const resetBoard = useCallback(() => {
    clearBoard();
    setPeople(DEMO_PEOPLE);
    setError(null);
    setLastSyncedAt(null);
  }, []);

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
    movePerson,
    addPerson,
    removePerson,
    resetBoard,
    searchFilter,
    setSearchFilter,
    filteredPeople,
    peopleByArea,
  };
}
