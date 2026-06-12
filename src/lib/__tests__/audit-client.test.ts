import { describe, it, expect, beforeEach } from "vitest";
import {
  logAuditEntry,
  getLocalAuditLog,
  getAuditLogForPerson,
  clearLocalAuditLog,
  exportAuditLogCSV,
} from "../audit-client";

describe("audit-client", () => {
  beforeEach(() => {
    clearLocalAuditLog();
  });

  it("logAuditEntry adds entry to local log", () => {
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: "R1",
      toArea: "R2",
      actionType: "reassign",
    });

    const log = getLocalAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].personId).toBe("p-1");
    expect(log[0].personName).toBe("Alice");
    expect(log[0].fromArea).toBe("R1");
    expect(log[0].toArea).toBe("R2");
    expect(log[0].actionType).toBe("reassign");
    expect(log[0].timestamp).toBeInstanceOf(Date);
  });

  it("getAuditLogForPerson filters by personId", () => {
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: null,
      toArea: "R1",
      actionType: "assign",
    });
    logAuditEntry({
      personId: "p-2",
      personName: "Bob",
      fromArea: null,
      toArea: "R3",
      actionType: "assign",
    });
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: "R1",
      toArea: "R5",
      actionType: "reassign",
    });

    const aliceLog = getAuditLogForPerson("p-1");
    expect(aliceLog).toHaveLength(2);
    expect(aliceLog.every((e) => e.personId === "p-1")).toBe(true);

    const bobLog = getAuditLogForPerson("p-2");
    expect(bobLog).toHaveLength(1);
    expect(bobLog[0].personName).toBe("Bob");
  });

  it("clearLocalAuditLog empties the log", () => {
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: null,
      toArea: "R1",
      actionType: "assign",
    });

    expect(getLocalAuditLog()).toHaveLength(1);
    clearLocalAuditLog();
    expect(getLocalAuditLog()).toHaveLength(0);
  });

  it("exportAuditLogCSV produces valid CSV header + rows", () => {
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: null,
      toArea: "R1",
      actionType: "assign",
      userId: "user-1",
    });
    logAuditEntry({
      personId: "p-2",
      personName: "Bob",
      fromArea: "R3",
      toArea: null,
      actionType: "unassign",
    });

    const csv = exportAuditLogCSV();
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Timestamp,Person,From,To,Action,User");
    expect(lines).toHaveLength(3); // header + 2 rows

    // First row: Alice, assign
    const row1 = lines[1].split(",");
    expect(row1[1]).toBe("Alice");
    expect(row1[2]).toBe("(未分派)");
    expect(row1[3]).toBe("R1");
    expect(row1[4]).toBe("assign");
    expect(row1[5]).toBe("user-1");

    // Second row: Bob, unassign
    const row2 = lines[2].split(",");
    expect(row2[1]).toBe("Bob");
    expect(row2[2]).toBe("R3");
    expect(row2[3]).toBe("(未分派)");
    expect(row2[4]).toBe("unassign");
    expect(row2[5]).toBe("demo");
  });

  it("exportAuditLogCSV exports only the given entries when provided", () => {
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: null,
      toArea: "R1",
      actionType: "assign",
    });
    logAuditEntry({
      personId: "p-2",
      personName: "Bob",
      fromArea: "R3",
      toArea: null,
      actionType: "unassign",
    });

    const onlyBob = getAuditLogForPerson("p-2");
    const csv = exportAuditLogCSV(onlyBob);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toContain("Bob");
    expect(csv).not.toContain("Alice");
  });

  it("getLocalAuditLog returns a copy (not a reference)", () => {
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: null,
      toArea: "R1",
      actionType: "assign",
    });

    const log1 = getLocalAuditLog();
    const log2 = getLocalAuditLog();
    expect(log1).not.toBe(log2);
    expect(log1).toEqual(log2);
  });
});
