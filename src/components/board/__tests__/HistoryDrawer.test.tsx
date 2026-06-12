import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BoardPerson } from "@/lib/board-constants";
import type { AuditEntry } from "@/lib/audit-client";

const auditState = vi.hoisted(() => ({
  entries: [] as unknown[],
  isLoading: false,
}));

vi.mock("@/hooks/useAuditLog", () => ({
  useAuditLog: () => ({
    entries: auditState.entries,
    isLoading: auditState.isLoading,
    refresh: () => {},
  }),
}));

import { HistoryDrawer } from "../HistoryDrawer";

const person: BoardPerson = {
  id: "p1",
  name: "王小明",
  role: "麻醉護理師",
  color: "bg-amber-100",
  area: "R1",
};

const personEntries: AuditEntry[] = [
  {
    personId: "p1",
    personName: "王小明",
    fromArea: "R1",
    toArea: "R2",
    actionType: "reassign",
    userId: null,
    timestamp: new Date("2026-06-12T01:00:00Z"),
  },
  {
    personId: "p1",
    personName: "",
    fromArea: null,
    toArea: "R1",
    actionType: "assign",
    userId: null,
    timestamp: new Date("2026-06-12T00:00:00Z"),
  },
];

beforeEach(() => {
  auditState.entries = [];
  auditState.isLoading = false;
});

describe("HistoryDrawer", () => {
  it("renders nothing without a person", () => {
    const { container } = render(
      <HistoryDrawer person={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows 載入中… while loading", () => {
    auditState.isLoading = true;
    render(<HistoryDrawer person={person} onClose={() => {}} />);
    expect(screen.getByText("載入中…")).toBeInTheDocument();
  });

  it("shows 尚無歷史紀錄 when there are no entries", () => {
    render(<HistoryDrawer person={person} onClose={() => {}} />);
    expect(screen.getByText("尚無歷史紀錄")).toBeInTheDocument();
  });

  it("exports only the displayed person's entries as CSV with a UTF-8 BOM", async () => {
    auditState.entries = personEntries;

    let capturedBlob: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return "blob:mock";
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<HistoryDrawer person={person} onClose={() => {}} />);

    const realCreateElement = document.createElement.bind(document);
    let anchor: HTMLAnchorElement | undefined;
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const el = realCreateElement(tagName);
        if (tagName === "a") anchor = el as HTMLAnchorElement;
        return el;
      });

    fireEvent.click(screen.getByRole("button", { name: "匯出 CSV" }));

    expect(capturedBlob).not.toBeNull();
    // Check raw bytes for the UTF-8 BOM (so Chinese renders correctly in
    // Excel) - Blob.text() strips a leading BOM per the UTF-8 decode spec
    const bytes = new Uint8Array(
      await (capturedBlob as unknown as Blob).arrayBuffer(),
    );
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const text = new TextDecoder().decode(bytes.slice(3));
    const lines = text.split("\n");
    expect(lines[0]).toBe("Timestamp,Person,From,To,Action,User");
    // Only this person's 2 entries — not the global audit log
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      "2026-06-12T01:00:00.000Z,王小明,R1,R2,reassign,demo",
    );
    // DB-sourced entries without personName fall back to the drawer's person
    expect(lines[2]).toBe(
      "2026-06-12T00:00:00.000Z,王小明,未分派,R1,assign,demo",
    );

    expect(anchor?.download).toBe("audit-log-王小明.csv");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
