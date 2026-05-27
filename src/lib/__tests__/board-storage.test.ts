import { describe, it, expect, beforeEach } from "vitest";
import { loadBoard, saveBoard, clearBoard } from "../board-storage";
import type { BoardPerson } from "../board-constants";

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

  it("saveBoard writes to localStorage", () => {
    saveBoard(mockPeople);
    const raw = localStorage.getItem("or-whiteboard-board");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(mockPeople);
  });

  it("loadBoard reads from localStorage", () => {
    localStorage.setItem("or-whiteboard-board", JSON.stringify(mockPeople));
    const result = loadBoard();
    expect(result).toEqual(mockPeople);
  });

  it("loadBoard returns null when empty", () => {
    expect(loadBoard()).toBeNull();
  });

  it("loadBoard returns null on invalid JSON", () => {
    localStorage.setItem("or-whiteboard-board", "{bad json!!!");
    expect(loadBoard()).toBeNull();
  });

  it("clearBoard removes from localStorage", () => {
    saveBoard(mockPeople);
    clearBoard();
    expect(localStorage.getItem("or-whiteboard-board")).toBeNull();
  });
});
