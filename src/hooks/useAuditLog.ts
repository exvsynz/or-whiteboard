"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuditLogForPerson, type AuditEntry } from "@/lib/audit-client";
import { supabase, isSupabaseConfigured } from "@/lib/supabase-client";

export interface UseAuditLogReturn {
  entries: AuditEntry[];
  isLoading: boolean;
  refresh: () => void;
}

export function useAuditLog(personId: string | null): UseAuditLogReturn {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEntries = useCallback(() => {
    if (!personId) {
      setEntries([]);
      return;
    }

    if (isSupabaseConfigured && supabase) {
      setIsLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("audit_log") as any)
        .select("*")
        .eq("person_id", personId)
        .order("timestamp", { ascending: false })
        .then(
          ({
            data,
            error,
          }: {
            data: Array<{
              id: string;
              timestamp: string;
              person_id: string;
              from_area_id: string | null;
              to_area_id: string | null;
              action_type: string;
              user_id: string | null;
            }> | null;
            error: { message: string } | null;
          }) => {
            if (error || !data) {
              // Fall back to local log on error
              setEntries(getAuditLogForPerson(personId));
            } else {
              const mapped: AuditEntry[] = data.map((row) => ({
                personId: row.person_id,
                personName: "", // DB rows don't have person name
                fromArea: row.from_area_id,
                toArea: row.to_area_id,
                actionType: row.action_type as AuditEntry["actionType"],
                userId: row.user_id,
                timestamp: new Date(row.timestamp),
              }));
              // Merge with local entries that may not have synced yet
              const localEntries = getAuditLogForPerson(personId);
              const merged = [...mapped];
              for (const local of localEntries) {
                const isDuplicate = mapped.some(
                  (m) =>
                    Math.abs(m.timestamp.getTime() - local.timestamp.getTime()) <
                      1000 &&
                    m.actionType === local.actionType,
                );
                if (!isDuplicate) {
                  merged.push(local);
                }
              }
              merged.sort(
                (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
              );
              setEntries(merged);
            }
            setIsLoading(false);
          },
        );
    } else {
      // Demo mode: read from local log
      setEntries(getAuditLogForPerson(personId));
    }
  }, [personId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, isLoading, refresh: fetchEntries };
}
