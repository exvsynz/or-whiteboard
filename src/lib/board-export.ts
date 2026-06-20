import * as XLSX from "xlsx";
import type { BoardPerson } from "./board-constants";
import { toCsvRow } from "./csv";

export function exportToCSV(people: BoardPerson[]): string {
  const headers = "姓名,角色,位置";
  const rows = people.map((p) => toCsvRow([p.name, p.role, p.area ?? "未分派"]));
  return [headers, ...rows].join("\n");
}

export function exportToXLSX(people: BoardPerson[]): Blob {
  const data = [
    ["姓名", "角色", "位置"],
    ...people.map((p) => [p.name, p.role, p.area ?? "未分派"]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "班表");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * YYYY-MM-DD in LOCAL time. Replaces `new Date().toISOString().slice(0, 10)`
 * (UTC — yields yesterday's date before 08:00 in Taiwan) for export filenames.
 */
export function localDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(blob, filename);
}
