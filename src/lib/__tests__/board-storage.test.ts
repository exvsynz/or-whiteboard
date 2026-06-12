import { describe, it, expect, beforeEach } from "vitest";
import { loadBoard, saveBoard, clearBoard } from "../board-storage";
import type { BoardPerson } from "../board-constants";

const DATE = "2026-06-12";
const KEY = `or-whiteboard-board:${DATE}`;

const mockPeople: BoardPerson[] = [
  {
    id: "t-1",
    name: "Test",
    role: "Nurse",
    color: "bg-amber-100",
    area: "R1",
  },
];

describe("board-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saveBoard writes a date-keyed StoredBoard", () => {
    saveBoard(DATE, mockPeople);
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.people).toEqual(mockPeople);
    expect(typeof parsed.savedAt).toBe("string");
  });

  it("loadBoard reads the date's board", () => {
    saveBoard(DATE, mockPeople);
    const result = loadBoard(DATE);
    expect(result?.people).toEqual(mockPeople);
  });

  it("boards for different dates are independent", () => {
    saveBoard(DATE, mockPeople);
    expect(loadBoard("2026-06-13")).toBeNull();
  });

  it("loadBoard returns null when empty", () => {
    expect(loadBoard(DATE)).toBeNull();
  });

  it("loadBoard returns null on invalid JSON", () => {
    localStorage.setItem(KEY, "{bad json!!!");
    expect(loadBoard(DATE)).toBeNull();
  });

  it("loadBoard returns null on a non-StoredBoard shape", () => {
    localStorage.setItem(KEY, JSON.stringify({ nope: true }));
    expect(loadBoard(DATE)).toBeNull();
  });

  it("migrates the legacy undated key into the requested date", () => {
    localStorage.setItem("or-whiteboard-board", JSON.stringify(mockPeople));
    const result = loadBoard(DATE);
    expect(result?.people).toEqual(mockPeople);
    // legacy key consumed, new key written
    expect(localStorage.getItem("or-whiteboard-board")).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("clearBoard removes only the date's board", () => {
    saveBoard(DATE, mockPeople);
    saveBoard("2026-06-13", mockPeople);
    clearBoard(DATE);
    expect(loadBoard(DATE)).toBeNull();
    expect(loadBoard("2026-06-13")).not.toBeNull();
  });
});
