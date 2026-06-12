"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuditLogForPerson, type AuditEntry } from "@/lib/audit-client";
import { supabase, isSupabaseConfigured } from "@/lib/supabase-client";
import { getAreaMaps } from "@/lib/board-data";
import type { ActionType } from "@/lib/database.types";

export interface UseAuditLogReturn {
  entries: AuditEntry[];
  isLoading: boolean;
  refresh: () => void;
}

export function useAuditLog(personId: string | null): UseAuditLogReturn {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Cancellation guard: switching person while a fetch is in flight must
    // not let the stale response overwrite the new person's entries.
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (!personId) {
        setEntries([]);
        return;
      }

      if (!isSupabaseConfigured || !supabase) {
        setEntries(getAuditLogForPerson(personId));
        return;
      }

      setIsLoading(true);
      try {
        const maps = await getAreaMaps(supabase);
        const { data, error } = await supabase
          .from("audit_log")
          .select(
            "id, timestamp, person_id, from_area_id, to_area_id, action_type, user_id, people(name)",
          )
          .eq("person_id", personId)
          .order("timestamp", { ascending: false })
          .limit(100);
        if (cancelled) return;

        if (error || !data) {
          setEntries(getAuditLogForPerson(personId));
        } else {
          setEntries(
            data.map((row) => ({
              personId: row.person_id,
              personName: row.people?.name ?? "",
              fromArea: row.from_area_id
                ? (maps.nameById.get(row.from_area_id) ?? row.from_area_id)
                : null,
              toArea: row.to_area_id
                ? (maps.nameById.get(row.to_area_id) ?? row.to_area_id)
                : null,
              actionType: row.action_type as ActionType,
              userId: row.user_id,
              timestamp: new Date(row.timestamp),
            })),
          );
        }
      } catch {
        if (!cancelled) setEntries(getAuditLogForPerson(personId));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [personId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  return { entries, isLoading, refresh };
}
