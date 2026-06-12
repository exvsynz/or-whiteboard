import { describe, it, expect } from "vitest";
import { exportToCSV, localDateString } from "../board-export";
import { parseFile } from "../sheet-parser";
import { autoDetectMapping, mapRowsToPeople } from "../board-import";
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

  it("neutralizes formula injection: leading =", () => {
    const csv = exportToCSV([
      makePerson({ name: '=HYPERLINK("http://evil.example","R1")' }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1].startsWith("=")).toBe(false);
    expect(lines[1]).toContain('"\'=HYPERLINK(""http://evil.example"",""R1"")"');
  });

  it("neutralizes formula injection: leading + - @", () => {
    const csv = exportToCSV([
      makePerson({ name: "+WEBSERVICE(1)" }),
      makePerson({ name: "-2+3" }),
      makePerson({ name: "@SUM(1)" }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("'+WEBSERVICE(1),麻醉護理師,R1");
    expect(lines[2]).toBe("'-2+3,麻醉護理師,R1");
    expect(lines[3]).toBe("'@SUM(1),麻醉護理師,R1");
  });

  it("neutralizes formula injection: leading tab and CR", () => {
    const csv = exportToCSV([
      makePerson({ name: "\t=1+1" }),
      makePerson({ role: "\r=cmd" }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1].startsWith("'\t")).toBe(true);
    // CR-prefixed field is neutralized and quoted so it cannot break rows
    expect(lines[2]).toContain("\"'\r=cmd\"");
  });

  it("neutralizes formula injection in the role field too", () => {
    const csv = exportToCSV([makePerson({ role: "=A1" })]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("王小明,'=A1,R1");
  });

  it("does not alter normal values", () => {
    const csv = exportToCSV([makePerson({ name: "A=B", role: "P+R" })]);
    const lines = csv.split("\n");
    // = and + not in leading position are untouched
    expect(lines[1]).toBe("A=B,P+R,R1");
  });
});

describe("CSV round-trip (import(export(people)))", () => {
  it("preserves name, role, and area through export → parse → import", async () => {
    const original: BoardPerson[] = [
      makePerson({ id: "p1", name: "王小明", role: "麻醉護理師", area: "R1" }),
      makePerson({ id: "p2", name: "林怡君", role: "Leader", area: "Leader" }),
      makePerson({ id: "p3", name: "張,大明", role: '角色"特殊', area: "小夜A3" }),
      makePerson({ id: "p4", name: "陳美玲", role: "前台", area: null }),
    ];

    const csv = exportToCSV(original);
    const file = new File([csv], "round-trip.csv", { type: "text/csv" });
    const parsed = await parseFile(file);

    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);

    const mapping = autoDetectMapping(parsed.headers);
    const { people, matchedCount } = mapRowsToPeople(parsed.rows, mapping);

    expect(people).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(people[i].name).toBe(original[i].name);
      expect(people[i].role).toBe(original[i].role);
      // null area exports as 未分派, which is not a known area → null again
      expect(people[i].area).toBe(original[i].area);
    }
    expect(matchedCount).toBe(3);
  });
});

describe("localDateString", () => {
  it("formats explicit local dates as YYYY-MM-DD", () => {
    // Constructed with local components, so expectations are
    // timezone-independent (constructor and getters are both local).
    expect(localDateString(new Date(2026, 5, 12, 7, 30))).toBe("2026-06-12");
    expect(localDateString(new Date(2026, 0, 5, 0, 0, 1))).toBe("2026-01-05");
    expect(localDateString(new Date(2026, 11, 31, 23, 59, 59))).toBe(
      "2026-12-31",
    );
  });

  it("zero-pads single-digit month and day", () => {
    expect(localDateString(new Date(2026, 2, 9))).toBe("2026-03-09");
  });

  it("uses local getters, not UTC", () => {
    // For any instant, the result must equal the same Date's local
    // components — even when the UTC date differs.
    const d = new Date(Date.UTC(2026, 5, 11, 23, 30)); // 2026-06-12 07:30 in Taipei
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(localDateString(d)).toBe(expected);
  });

  it("defaults to the current date", () => {
    expect(localDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
