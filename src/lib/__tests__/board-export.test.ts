import { describe, it, expect } from "vitest";
import { exportToCSV } from "../board-export";
import type { BoardPerson } from "../board-constants";

function makePerson(overrides: Partial<BoardPerson> = {}): BoardPerson {
  return {
    id: "test-1",
    name: "王小明",
    role: "麻醉護理師",
    color: "bg-amber-100",
    area: "R1",
    ...overrides,
  };
}

describe("exportToCSV", () => {
  it("produces correct headers", () => {
    const csv = exportToCSV([]);
    expect(csv).toBe("姓名,角色,位置");
  });

  it("handles Chinese characters", () => {
    const csv = exportToCSV([makePerson()]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("王小明,麻醉護理師,R1");
  });

  it("escapes commas in fields", () => {
    const csv = exportToCSV([makePerson({ name: "張,大明" })]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"張,大明"');
  });

  it("escapes quotes in fields", () => {
    const csv = exportToCSV([makePerson({ role: '角色"特殊' })]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"角色""特殊"');
  });

  it('uses "未分派" for null areas', () => {
    const csv = exportToCSV([makePerson({ area: null })]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("王小明,麻醉護理師,未分派");
  });
});
