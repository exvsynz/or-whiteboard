import type { BoardPerson } from "./board-constants";

const STORAGE_KEY = "or-whiteboard-board";

export function loadBoard(): BoardPerson[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as BoardPerson[];
  } catch {
    return null;
  }
}

export function saveBoard(people: BoardPerson[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
}

export function clearBoard(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
