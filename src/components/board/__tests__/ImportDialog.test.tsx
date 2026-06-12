import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  parseFile: vi.fn(),
  autoDetectMapping: vi.fn(),
  mapRowsToPeople: vi.fn(),
}));

vi.mock("@/lib/sheet-parser", () => ({
  parseFile: mocks.parseFile,
}));

// Keep the real normalizeAreaName — the preview must use the same
// normalization as the actual import (r01 → R1).
vi.mock("@/lib/board-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/board-import")>()),
  autoDetectMapping: mocks.autoDetectMapping,
  mapRowsToPeople: mocks.mapRowsToPeople,
}));

import { ImportDialog } from "../ImportDialog";

const singleSheet = {
  headers: ["姓名", "角色", "位置"],
  rows: [
    ["王小明", "護理師", "R1"],
    ["林怡君", "護理師", "外站"],
  ],
  rowNumbers: [2, 3],
  sheetNames: ["Sheet1"],
  activeSheet: "Sheet1",
};

const defaultResult = {
  people: [
    { id: "p1", name: "王小明", role: "護理師", color: "bg-amber-100", area: "R1" },
    { id: "p2", name: "林怡君", role: "護理師", color: "bg-sky-100", area: null },
  ],
  issues: [
    // rowIndex is ALREADY the 1-based spreadsheet row (header = row 1).
    { rowIndex: 3, name: "林怡君", rawArea: "外站", reason: "unknown-area" },
  ],
  duplicateNames: [],
  matchedCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseFile.mockResolvedValue(singleSheet);
  mocks.autoDetectMapping.mockReturnValue({ name: 0, role: 1, area: 2 });
  mocks.mapRowsToPeople.mockReturnValue(defaultResult);
});

async function selectFile() {
  const file = new File(["dummy"], "班表.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("選擇檔案"), {
    target: { files: [file] },
  });
  await screen.findByText("欄位對應");
  return file;
}

describe("ImportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportDialog open={false} onClose={() => {}} onImport={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("resets all parsed state when reopened (fresh state on every open)", async () => {
    const { rerender } = render(
      <ImportDialog open onClose={() => {}} onImport={() => {}} />,
    );
    await selectFile();
    expect(screen.getByText("欄位對應")).toBeInTheDocument();

    rerender(<ImportDialog open={false} onClose={() => {}} onImport={() => {}} />);
    rerender(<ImportDialog open onClose={() => {}} onImport={() => {}} />);

    // Old parsed sheet must not leak into the new session
    expect(screen.queryByText("欄位對應")).not.toBeInTheDocument();
    expect(screen.getByText("拖放 CSV / XLSX 檔案到此處")).toBeInTheDocument();
  });

  describe("backdrop close", () => {
    it("closes only when the mousedown started on the backdrop", () => {
      const onClose = vi.fn();
      const { container } = render(
        <ImportDialog open onClose={onClose} onImport={() => {}} />,
      );
      const backdrop = container.firstElementChild as HTMLElement;
      fireEvent.mouseDown(backdrop);
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when a gesture merely ends on the backdrop", () => {
      const onClose = vi.fn();
      const { container } = render(
        <ImportDialog open onClose={onClose} onImport={() => {}} />,
      );
      const backdrop = container.firstElementChild as HTMLElement;
      const panel = screen.getByRole("dialog");
      // e.g. text selection started inside the panel, released over the
      // backdrop: the click event lands on the backdrop (common ancestor)
      fireEvent.mouseDown(panel);
      fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("shows a sheet selector for multi-sheet workbooks and re-parses on change", async () => {
    mocks.parseFile.mockResolvedValue({
      ...singleSheet,
      sheetNames: ["五月班表", "六月班表"],
      activeSheet: "五月班表",
    });
    render(<ImportDialog open onClose={() => {}} onImport={() => {}} />);
    const file = await selectFile();

    const select = screen.getByLabelText("選擇工作表");
    expect(select).toBeInTheDocument();

    mocks.parseFile.mockResolvedValue({
      ...singleSheet,
      sheetNames: ["五月班表", "六月班表"],
      activeSheet: "六月班表",
    });
    fireEvent.change(select, { target: { value: "六月班表" } });

    await waitFor(() => {
      expect(mocks.parseFile).toHaveBeenLastCalledWith(file, "六月班表");
    });
    expect(screen.getByLabelText("選擇工作表")).toHaveValue("六月班表");
  });

  it("hides the sheet selector for single-sheet files", async () => {
    render(<ImportDialog open onClose={() => {}} onImport={() => {}} />);
    await selectFile();
    expect(screen.queryByLabelText("選擇工作表")).not.toBeInTheDocument();
  });

  it("shows the full import report: counts, unmatched-area issues, duplicates, replacement warning", async () => {
    mocks.mapRowsToPeople.mockReturnValue({
      ...defaultResult,
      duplicateNames: ["王小明"],
    });
    render(
      <ImportDialog
        open
        onClose={() => {}}
        onImport={() => {}}
        currentCount={12}
      />,
    );
    await selectFile();

    const summary = screen.getByText(/人已匹配位置/);
    expect(summary.textContent?.replace(/\s+/g, "")).toBe(
      "找到2人，其中1人已匹配位置",
    );
    // Unmatched-area issue list (complete, not just the 5-row preview).
    // rowIndex 3 IS the spreadsheet row — rendered verbatim, no off-by-one.
    expect(
      screen.getByText(/位置無法辨識（1），將列為未分派/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/第 3 列 林怡君：位置「外站」/),
    ).toBeInTheDocument();
    // Duplicate-name warning
    expect(screen.getByText(/重複姓名（1）/)).toBeInTheDocument();
    // Replacement count must be visible before confirming
    expect(
      screen.getByText(/匯入將取代目前白板上的 12 人/),
    ).toBeInTheDocument();
  });

  it("omits the replacement warning when currentCount is not provided", async () => {
    render(<ImportDialog open onClose={() => {}} onImport={() => {}} />);
    await selectFile();
    expect(screen.queryByText(/匯入將取代/)).not.toBeInTheDocument();
  });

  it("passes the sheet's original rowNumbers through to mapRowsToPeople", async () => {
    render(<ImportDialog open onClose={() => {}} onImport={() => {}} />);
    await selectFile();
    expect(mocks.mapRowsToPeople).toHaveBeenCalledWith(
      singleSheet.rows,
      { name: 0, role: 1, area: 2 },
      singleSheet.rowNumbers,
    );
  });

  it("previews areas with the same normalization as the import: r01 → R1, no warning", async () => {
    mocks.parseFile.mockResolvedValue({
      ...singleSheet,
      rows: [["王小明", "護理師", "r01"]],
      rowNumbers: [2],
    });
    mocks.mapRowsToPeople.mockReturnValue({
      people: [defaultResult.people[0]],
      issues: [],
      duplicateNames: [],
      matchedCount: 1,
    });
    render(<ImportDialog open onClose={() => {}} onImport={() => {}} />);
    await selectFile();

    // Preview shows the CANONICAL area the cell will become, matched (green)
    expect(screen.getByText("R1")).toBeInTheDocument();
    expect(screen.queryByText("r01")).not.toBeInTheDocument();
    expect(screen.queryByText(/未分派/)).not.toBeInTheDocument();
  });

  it("previews truly unknown areas with the unmatched warning", async () => {
    mocks.parseFile.mockResolvedValue({
      ...singleSheet,
      rows: [["林怡君", "護理師", "外站"]],
      rowNumbers: [2],
    });
    render(<ImportDialog open onClose={() => {}} onImport={() => {}} />);
    await selectFile();
    expect(screen.getByText("外站")).toBeInTheDocument();
    expect(screen.getByText("(未分派)")).toBeInTheDocument();
  });

  it("imports the mapped people via onImport and closes", async () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    render(<ImportDialog open onClose={onClose} onImport={onImport} />);
    await selectFile();

    fireEvent.click(screen.getByRole("button", { name: /匯入 2 人/ }));
    expect(onImport).toHaveBeenCalledWith(defaultResult.people, false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
