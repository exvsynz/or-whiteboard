import { describe, it, expect } from "vitest";
import {
  autoDetectMapping,
  mapRowsToPeople,
  normalizeAreaName,
} from "../board-import";
import { COLOR_PALETTE } from "../board-constants";

describe("autoDetectMapping", () => {
  it("finds Chinese header '姓名'", () => {
    const headers = ["編號", "姓名", "角色", "位置"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.name).toBe(1);
    expect(mapping.role).toBe(2);
    expect(mapping.area).toBe(3);
  });

  it("finds English header 'name'", () => {
    const headers = ["id", "Name", "Role", "Area"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.name).toBe(1);
    expect(mapping.role).toBe(2);
    expect(mapping.area).toBe(3);
  });

  it("defaults to 0, 1, 2 when no match", () => {
    const headers = ["A", "B", "C"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.name).toBe(0);
    expect(mapping.role).toBe(1);
    expect(mapping.area).toBe(2);
  });

  it("detects '刀房' as area column", () => {
    const headers = ["人員", "班別", "刀房"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.name).toBe(0);
    expect(mapping.role).toBe(1);
    expect(mapping.area).toBe(2);
  });
});

describe("normalizeAreaName", () => {
  it("returns exact matches unchanged", () => {
    expect(normalizeAreaName("R1")).toBe("R1");
    expect(normalizeAreaName("Leader")).toBe("Leader");
    expect(normalizeAreaName("小夜A3")).toBe("小夜A3");
    expect(normalizeAreaName("OPD前台")).toBe("OPD前台");
  });

  it("converts full-width characters: Ｒ１ → R1", () => {
    expect(normalizeAreaName("Ｒ１")).toBe("R1");
  });

  it("strips leading zeros in room numbers: R01 / Ｒ０１ → R1", () => {
    expect(normalizeAreaName("R01")).toBe("R1");
    expect(normalizeAreaName("Ｒ０１")).toBe("R1");
    expect(normalizeAreaName("R031")).toBe("R31");
  });

  it("trims surrounding whitespace: 'R1 ' → R1", () => {
    expect(normalizeAreaName("R1 ")).toBe("R1");
    expect(normalizeAreaName(" R1")).toBe("R1");
  });

  it("is case-insensitive: r1 → R1, leader → Leader", () => {
    expect(normalizeAreaName("r1")).toBe("R1");
    expect(normalizeAreaName("leader")).toBe("Leader");
    expect(normalizeAreaName("12-20a1")).toBe("12-20A1");
    expect(normalizeAreaName("鏡檢par")).toBe("鏡檢PAR");
  });

  it("removes internal and full-width spaces: '小夜　A1' → 小夜A1", () => {
    expect(normalizeAreaName("小夜　A1")).toBe("小夜A1");
    expect(normalizeAreaName("小夜 A1")).toBe("小夜A1");
    expect(normalizeAreaName("OPD 前台")).toBe("OPD前台");
  });

  it("does NOT match non-existent rooms: R32 → null", () => {
    expect(normalizeAreaName("R32")).toBeNull();
    expect(normalizeAreaName("R0")).toBeNull();
  });

  it("does NOT fuzzy-match misspelled areas", () => {
    expect(normalizeAreaName("小夜A7")).toBeNull();
    expect(normalizeAreaName("Leaderr")).toBeNull();
    expect(normalizeAreaName("不存在的區域")).toBeNull();
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(normalizeAreaName("")).toBeNull();
    expect(normalizeAreaName("   ")).toBeNull();
  });
});

describe("mapRowsToPeople", () => {
  const mapping = { name: 0, role: 1, area: 2 };

  it("creates correct BoardPerson entries", () => {
    const rows = [["王小明", "麻醉護理師", "R1"]];
    const { people } = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("王小明");
    expect(people[0].role).toBe("麻醉護理師");
    expect(people[0].area).toBe("R1");
    expect(people[0].id).toBeTruthy();
    expect(people[0].color).toBe(COLOR_PALETTE[0]);
  });

  it("sets area to null for unknown areas", () => {
    const rows = [["張三", "護理師", "不存在的區域"]];
    const { people } = mapRowsToPeople(rows, mapping);
    expect(people[0].area).toBeNull();
  });

  it("normalizes full-width and zero-padded areas", () => {
    const rows = [
      ["A", "role", "Ｒ０１"],
      ["B", "role", "r5"],
      ["C", "role", "小夜　A1"],
    ];
    const { people, matchedCount, issues } = mapRowsToPeople(rows, mapping);
    expect(people[0].area).toBe("R1");
    expect(people[1].area).toBe("R5");
    expect(people[2].area).toBe("小夜A1");
    expect(matchedCount).toBe(3);
    expect(issues).toHaveLength(0);
  });

  it("assigns rotating colors from COLOR_PALETTE", () => {
    const rows = COLOR_PALETTE.map((_, i) => [`Person${i}`, "role", "R1"]);
    // Add one extra to test wrap-around
    rows.push(["Extra", "role", "R1"]);
    const { people } = mapRowsToPeople(rows, mapping);

    for (let i = 0; i < COLOR_PALETTE.length; i++) {
      expect(people[i].color).toBe(COLOR_PALETTE[i]);
    }
    // Wrap-around
    expect(people[COLOR_PALETTE.length].color).toBe(COLOR_PALETTE[0]);
  });

  it("skips rows with empty names", () => {
    const rows = [
      ["王小明", "護理師", "R1"],
      ["", "未設定", ""],
      ["  ", "未設定", ""],
      ["林怡君", "Leader", "Leader"],
    ];
    const { people } = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(2);
    expect(people[0].name).toBe("王小明");
    expect(people[1].name).toBe("林怡君");
  });

  it("sets role to '未設定' when role column is empty", () => {
    const rows = [["王小明", "", "R1"]];
    const { people } = mapRowsToPeople(rows, mapping);
    expect(people[0].role).toBe("未設定");
  });

  it("matches known areas from ALL_AREAS_SET", () => {
    const rows = [
      ["A", "role", "Leader"],
      ["B", "role", "OPD前台"],
      ["C", "role", "R15"],
      ["D", "role", "小夜A3"],
      ["E", "role", "Unknown"],
    ];
    const { people } = mapRowsToPeople(rows, mapping);
    expect(people[0].area).toBe("Leader");
    expect(people[1].area).toBe("OPD前台");
    expect(people[2].area).toBe("R15");
    expect(people[3].area).toBe("小夜A3");
    expect(people[4].area).toBeNull();
  });

  it("handles rows shorter than mapping indices gracefully", () => {
    const rows = [["王小明"]]; // only one column, mapping expects 3
    const { people } = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("王小明");
    expect(people[0].role).toBe("未設定");
    expect(people[0].area).toBeNull();
  });

  it("reports unmatched areas as issues with spreadsheet row numbers", () => {
    const rows = [
      ["王小明", "護理師", "R1"], // spreadsheet row 2 — matched
      ["張三", "護理師", "R99"], // spreadsheet row 3 — unmatched
      ["李四", "護理師", ""], // spreadsheet row 4 — empty area, no issue
      ["陳五", "護理師", "不存在"], // spreadsheet row 5 — unmatched
    ];
    const { issues, matchedCount } = mapRowsToPeople(rows, mapping);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      rowIndex: 3,
      name: "張三",
      rawArea: "R99",
      reason: "unknown-area",
    });
    expect(issues[1]).toEqual({
      rowIndex: 5,
      name: "陳五",
      rawArea: "不存在",
      reason: "unknown-area",
    });
    expect(matchedCount).toBe(1);
  });

  it("does not report issues for skipped empty-name rows", () => {
    const rows = [
      ["", "護理師", "R99"], // empty name → dropped, no issue
      ["王小明", "護理師", "R99"], // spreadsheet row 3
    ];
    const { issues, people } = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0].rowIndex).toBe(3);
  });

  it("detects duplicate names", () => {
    const rows = [
      ["王小明", "護理師", "R1"],
      ["林怡君", "Leader", "Leader"],
      ["王小明", "麻醉護理師", "R2"],
      ["王小明", "護理師", "R3"],
      ["林怡君", "Leader", "R4"],
    ];
    const { people, duplicateNames } = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(5);
    expect(duplicateNames).toEqual(["王小明", "林怡君"]);
  });

  it("returns empty duplicateNames when all names are unique", () => {
    const rows = [
      ["王小明", "護理師", "R1"],
      ["林怡君", "Leader", "Leader"],
    ];
    const { duplicateNames } = mapRowsToPeople(rows, mapping);
    expect(duplicateNames).toEqual([]);
  });

  it("counts matchedCount as people whose area resolved non-null", () => {
    const rows = [
      ["A", "role", "R1"],
      ["B", "role", "Ｒ２"], // normalizes to R2 — counts
      ["C", "role", ""], // empty area — does not count
      ["D", "role", "R99"], // unmatched — does not count
    ];
    const { matchedCount } = mapRowsToPeople(rows, mapping);
    expect(matchedCount).toBe(2);
  });
});
