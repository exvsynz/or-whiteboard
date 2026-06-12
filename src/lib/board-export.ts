import * as XLSX from "xlsx";
import type { BoardPerson } from "./board-constants";

export function exportToCSV(people: BoardPerson[]): string {
  const headers = "姓名,角色,位置";
  const rows = people.map((p) => {
    const name = escapeCsvField(p.name);
    const role = escapeCsvField(p.role);
    const area = escapeCsvField(p.area ?? "未分派");
    return `${name},${role},${area}`;
  });
  return [headers, ...rows].join("\n");
}

function escapeCsvField(value: string): string {
  // Neutralize formula injection (CWE-1236): Excel treats leading
  // = + - @ (and tab/CR variants) as formulas. Prefix with a single
  // quote per OWASP guidance. Only the CSV path needs this — SheetJS
  // writes typed string cells in the XLSX path.
  const escaped = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (
    escaped.includes(",") ||
    escaped.includes('"') ||
    escaped.includes("\n") ||
    escaped.includes("\r")
  ) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
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
