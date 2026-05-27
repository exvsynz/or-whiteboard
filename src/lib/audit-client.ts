import { supabase, isSupabaseConfigured } from "./supabase-client";
import type { ActionType } from "./database.types";

export interface AuditEntry {
  personId: string;
  personName: string;
  fromArea: string | null;
  toArea: string | null;
  actionType: ActionType;
  userId?: string | null;
  timestamp: Date;
}

// In-memory log for demo mode
const localAuditLog: AuditEntry[] = [];

export function logAuditEntry(entry: Omit<AuditEntry, "timestamp">): void {
  const fullEntry = { ...entry, timestamp: new Date() };
  localAuditLog.push(fullEntry);

  if (isSupabaseConfigured && supabase) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("audit_log") as any)
      .insert({
        person_id: entry.personId,
        from_area_id: entry.fromArea,
        to_area_id: entry.toArea,
        action_type: entry.actionType,
        user_id: entry.userId ?? null,
      })
      .then(() => {}); // fire-and-forget
  }
}

export function getLocalAuditLog(): AuditEntry[] {
  return [...localAuditLog];
}

export function getAuditLogForPerson(personId: string): AuditEntry[] {
  return localAuditLog.filter((e) => e.personId === personId);
}

export function clearLocalAuditLog(): void {
  localAuditLog.length = 0;
}

export function exportAuditLogCSV(): string {
  const headers = "Timestamp,Person,From,To,Action,User";
  const rows = localAuditLog.map((e) =>
    [
      e.timestamp.toISOString(),
      e.personName,
      e.fromArea ?? "(unassigned)",
      e.toArea ?? "(unassigned)",
      e.actionType,
      e.userId ?? "demo",
    ].join(","),
  );
  return [headers, ...rows].join("\n");
}
