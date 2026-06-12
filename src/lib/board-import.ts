import type { BoardPerson } from "./board-constants";
import { ALL_AREAS, ALL_AREAS_SET, COLOR_PALETTE } from "./board-constants";

export interface ColumnMapping {
  name: number;
  role: number;
  area: number;
}

export interface ImportRowIssue {
  rowIndex: number;
  name: string;
  rawArea: string;
  reason: "unknown-area";
}

export interface ImportResult {
  people: BoardPerson[];
  issues: ImportRowIssue[];
  duplicateNames: string[];
  matchedCount: number;
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

/**
 * Mechanical normalization for area lookup keys: full-width → half-width
 * (Ｒ１ → R1, full-width space → space), strip all whitespace, uppercase,
 * and strip leading zeros in room numbers (R01 → R1).
 * Deliberately NO fuzzy matching — a wrong assignment is worse than
 * an unassigned person on a hospital board.
 */
function normalizeAreaKey(value: string): string {
  let key = value
    .replace(/[！-～]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, " ")
    .replace(/\s+/g, "")
    .toUpperCase();
  const room = key.match(/^R0*([1-9]\d*)$/);
  if (room) key = `R${room[1]}`;
  return key;
}

const NORMALIZED_AREA_LOOKUP = new Map<string, string>(
  ALL_AREAS.map((area) => [normalizeAreaKey(area), area]),
);

export function normalizeAreaName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (ALL_AREAS_SET.has(trimmed)) return trimmed;
  return NORMALIZED_AREA_LOOKUP.get(normalizeAreaKey(trimmed)) ?? null;
}

export function mapRowsToPeople(
  rows: string[][],
  mapping: ColumnMapping,
): ImportResult {
  let colorIdx = 0;
  const people: BoardPerson[] = [];
  const issues: ImportRowIssue[] = [];
  const nameCounts = new Map<string, number>();
  let matchedCount = 0;

  rows.forEach((row, i) => {
    const name = row[mapping.name]?.trim() ?? "";
    if (!name) return;

    const role = row[mapping.role]?.trim() || "未設定";
    const rawArea = row[mapping.area]?.trim() ?? "";
    const area = rawArea ? normalizeAreaName(rawArea) : null;

    if (rawArea && area === null) {
      // Header is spreadsheet row 1, so data row i maps to row i + 2.
      issues.push({ rowIndex: i + 2, name, rawArea, reason: "unknown-area" });
    }
    if (area !== null) matchedCount++;
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

    const color = COLOR_PALETTE[colorIdx % COLOR_PALETTE.length];
    colorIdx++;
    people.push({
      id: crypto.randomUUID(),
      name,
      role,
      color,
      area,
    });
  });

  const duplicateNames = Array.from(nameCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([name]) => name);

  return { people, issues, duplicateNames, matchedCount };
}
