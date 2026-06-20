import { toCsvRow } from "./csv";
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

// In-memory log for demo mode. When Supabase is configured the audit trail
// is generated server-side by triggers on `assignments` (see migration
// 003_security_hardening.sql) — clients can no longer insert audit rows,
// which also means they can no longer forge or skip them.
const localAuditLog: AuditEntry[] = [];

export function logAuditEntry(entry: Omit<AuditEntry, "timestamp">): void {
  localAuditLog.push({ ...entry, timestamp: new Date() });
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

export function exportAuditLogCSV(entries?: AuditEntry[]): string {
  const source = entries ?? localAuditLog;
  const headers = "Timestamp,Person,From,To,Action,User";
  const rows = source.map((e) =>
    toCsvRow([
      e.timestamp.toISOString(),
      e.personName,
      e.fromArea ?? "(未分派)",
      e.toArea ?? "(未分派)",
      e.actionType,
      e.userId ?? "demo",
    ]),
  );
  return [headers, ...rows].join("\n");
}
