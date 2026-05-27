import { describe, it, expect } from "vitest";
import {
  autoDetectMapping,
  mapRowsToPeople,
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

describe("mapRowsToPeople", () => {
  const mapping = { name: 0, role: 1, area: 2 };

  it("creates correct BoardPerson entries", () => {
    const rows = [["王小明", "麻醉護理師", "R1"]];
    const people = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("王小明");
    expect(people[0].role).toBe("麻醉護理師");
    expect(people[0].area).toBe("R1");
    expect(people[0].id).toBeTruthy();
    expect(people[0].color).toBe(COLOR_PALETTE[0]);
  });

  it("sets area to null for unknown areas", () => {
    const rows = [["張三", "護理師", "不存在的區域"]];
    const people = mapRowsToPeople(rows, mapping);
    expect(people[0].area).toBeNull();
  });

  it("assigns rotating colors from COLOR_PALETTE", () => {
    const rows = COLOR_PALETTE.map((_, i) => [`Person${i}`, "role", "R1"]);
    // Add one extra to test wrap-around
    rows.push(["Extra", "role", "R1"]);
    const people = mapRowsToPeople(rows, mapping);

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
    const people = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(2);
    expect(people[0].name).toBe("王小明");
    expect(people[1].name).toBe("林怡君");
  });

  it("sets role to '未設定' when role column is empty", () => {
    const rows = [["王小明", "", "R1"]];
    const people = mapRowsToPeople(rows, mapping);
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
    const people = mapRowsToPeople(rows, mapping);
    expect(people[0].area).toBe("Leader");
    expect(people[1].area).toBe("OPD前台");
    expect(people[2].area).toBe("R15");
    expect(people[3].area).toBe("小夜A3");
    expect(people[4].area).toBeNull();
  });

  it("handles rows shorter than mapping indices gracefully", () => {
    const rows = [["王小明"]]; // only one column, mapping expects 3
    const people = mapRowsToPeople(rows, mapping);
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("王小明");
    expect(people[0].role).toBe("未設定");
    expect(people[0].area).toBeNull();
  });
});
