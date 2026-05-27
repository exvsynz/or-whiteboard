import type { BoardPerson } from "./board-constants";
import { ALL_AREAS_SET, COLOR_PALETTE } from "./board-constants";

export interface ColumnMapping {
  name: number;
  role: number;
  area: number;
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const namePatterns = ["姓名", "name", "護理師", "人員", "員工"];
  const rolePatterns = ["角色", "role", "職稱", "職位", "班別"];
  const areaPatterns = ["位置", "area", "room", "刀房", "房間", "區域", "地點"];

  function findCol(patterns: string[]): number {
    for (const p of patterns) {
      const idx = headers.findIndex((h) =>
        h.toLowerCase().includes(p.toLowerCase()),
      );
      if (idx !== -1) return idx;
    }
    return -1;
  }

  return {
    name: Math.max(findCol(namePatterns), 0),
    role: Math.max(findCol(rolePatterns), 1),
    area: Math.max(findCol(areaPatterns), 2),
  };
}

export function mapRowsToPeople(
  rows: string[][],
  mapping: ColumnMapping,
): BoardPerson[] {
  let colorIdx = 0;
  return rows
    .filter((row) => row[mapping.name]?.trim())
    .map((row) => {
      const name = row[mapping.name]?.trim() ?? "";
      const role = row[mapping.role]?.trim() || "未設定";
      const rawArea = row[mapping.area]?.trim() ?? "";
      const area = rawArea && ALL_AREAS_SET.has(rawArea) ? rawArea : null;
      const color = COLOR_PALETTE[colorIdx % COLOR_PALETTE.length];
      colorIdx++;
      return {
        id: crypto.randomUUID(),
        name,
        role,
        color,
        area,
      };
    });
}
