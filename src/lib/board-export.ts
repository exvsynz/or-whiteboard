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
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
