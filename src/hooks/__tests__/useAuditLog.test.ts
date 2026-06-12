import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useAuditLog } from "../useAuditLog";
import {
  logAuditEntry,
  clearLocalAuditLog,
} from "@/lib/audit-client";

describe("useAuditLog", () => {
  beforeEach(() => {
    clearLocalAuditLog();
  });

  it("returns empty entries when personId is null", () => {
    const { result } = renderHook(() => useAuditLog(null));
    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("returns entries for a specific personId from local log", async () => {
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

    const { result } = renderHook(() => useAuditLog("p-1"));

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(2);
    });
    expect(result.current.entries.every((e) => e.personId === "p-1")).toBe(true);
  });

  it("refresh re-reads the log", async () => {
    const { result } = renderHook(() => useAuditLog("p-1"));
    expect(result.current.entries).toHaveLength(0);

    // Add an entry after hook initialized
    logAuditEntry({
      personId: "p-1",
      personName: "Alice",
      fromArea: null,
      toArea: "R1",
      actionType: "assign",
    });

    // Refresh should pick up new entry
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    expect(result.current.entries[0].personName).toBe("Alice");
  });
});
