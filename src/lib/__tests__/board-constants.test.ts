import { describe, it, expect } from "vitest";
import {
  ALL_AREAS,
  ALL_AREAS_SET,
  DEMO_PEOPLE,
  FIXED_TASKS,
} from "../board-constants";

describe("board-constants", () => {
  it("ALL_AREAS contains exactly 68 entries", () => {
    // 1 Leader + 8 fixed + 31 rooms + 6 shift_12_20 + 6 evening + 6 night
    // + 5 anesthesia_outside + 2 recovery + 3 case_management = 68
    expect(ALL_AREAS).toHaveLength(68);
  });

  it("FIXED_TASKS includes 流動 as the last fixed task", () => {
    expect(FIXED_TASKS).toContain("流動");
    expect(FIXED_TASKS[FIXED_TASKS.length - 1]).toBe("流動");
  });

  it("ALL_AREAS_SET has same size as ALL_AREAS (no duplicates)", () => {
    expect(ALL_AREAS_SET.size).toBe(ALL_AREAS.length);
  });

  it("DEMO_PEOPLE has 6 entries", () => {
    expect(DEMO_PEOPLE).toHaveLength(6);
  });

  it("every DEMO_PEOPLE area is in ALL_AREAS or null", () => {
    for (const person of DEMO_PEOPLE) {
      if (person.area !== null) {
        expect(ALL_AREAS_SET.has(person.area)).toBe(true);
      }
    }
  });
});
