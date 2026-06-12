import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseFile } from "../sheet-parser";

// Big5 (CP950) bytes, verified against TextDecoder("big5"):
// "姓名,角色,位置"
const BIG5_HEADER = [
  0xa9, 0x6d, 0xa6, 0x57, 0x2c, 0xa8, 0xa4, 0xa6, 0xe2, 0x2c, 0xa6, 0xec,
  0xb8, 0x6d,
];
// "王小明,護理師,R1"
const BIG5_ROW_1 = [
  0xa4, 0xfd, 0xa4, 0x70, 0xa9, 0xfa, 0x2c, 0xc5, 0x40, 0xb2, 0x7a, 0xae,
  0x76, 0x2c, 0x52, 0x31,
];
// "林怡君,Leader,小夜A1"
const BIG5_ROW_2 = [
  0xaa, 0x4c, 0xa9, 0xc9, 0xa7, 0x67, 0x2c, 0x4c, 0x65, 0x61, 0x64, 0x65,
  0x72, 0x2c, 0xa4, 0x70, 0xa9, 0x5d, 0x41, 0x31,
];

function big5CsvBytes(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...BIG5_HEADER, 0x0a, ...BIG5_ROW_1, 0x0a, ...BIG5_ROW_2]);
}

function utf16Bytes(text: string, endian: "le" | "be"): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length * 2 + 2);
  if (endian === "le") {
    out[0] = 0xff;
    out[1] = 0xfe;
  } else {
    out[0] = 0xfe;
    out[1] = 0xff;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[2 + i * 2] = endian === "le" ? code & 0xff : code >> 8;
    out[3 + i * 2] = endian === "le" ? code >> 8 : code & 0xff;
  }
  return out;
}

const UTF8_CSV = "姓名,角色,位置\n王小明,護理師,R1\n林怡君,Leader,小夜A1";

describe("parseFile — CSV detection", () => {
  it("treats uppercase .CSV extension as CSV (Windows/HIS exports)", async () => {
    // Windows with Excel installed reports CSVs as application/vnd.ms-excel,
    // so only the (case-insensitive) extension check can catch this file.
    const file = new File([UTF8_CSV], "SCHEDULE.CSV", {
      type: "application/vnd.ms-excel",
    });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
    expect(parsed.rows[0]).toEqual(["王小明", "護理師", "R1"]);
  });

  it("treats text/csv MIME as CSV regardless of extension", async () => {
    const file = new File([UTF8_CSV], "schedule.txt", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
  });

  it("still parses lowercase .csv files", async () => {
    const file = new File([UTF8_CSV], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
    expect(parsed.rows).toHaveLength(2);
  });
});

describe("parseFile — CSV encoding detection", () => {
  it("decodes Big5-encoded CSV bytes (Taiwanese HIS exports)", async () => {
    const file = new File([big5CsvBytes()], "班表.csv", {
      type: "application/vnd.ms-excel",
    });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
    expect(parsed.rows).toEqual([
      ["王小明", "護理師", "R1"],
      ["林怡君", "Leader", "小夜A1"],
    ]);
  });

  it("decodes UTF-8 CSV with BOM, stripping the BOM from the first header", async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const body = new Uint8Array(new TextEncoder().encode(UTF8_CSV));
    const file = new File([bom, body], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
    expect(parsed.rows[1]).toEqual(["林怡君", "Leader", "小夜A1"]);
  });

  it("decodes UTF-16LE CSV with BOM", async () => {
    const file = new File([utf16Bytes(UTF8_CSV, "le")], "班表.csv", {
      type: "text/csv",
    });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
    expect(parsed.rows[0]).toEqual(["王小明", "護理師", "R1"]);
  });

  it("decodes UTF-16BE CSV with BOM", async () => {
    const file = new File([utf16Bytes(UTF8_CSV, "be")], "班表.csv", {
      type: "text/csv",
    });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
  });

  it("decodes plain UTF-8 CSV without BOM", async () => {
    const bytes = new Uint8Array(new TextEncoder().encode(UTF8_CSV));
    const file = new File([bytes], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "角色", "位置"]);
  });
});

describe("parseFile — multi-sheet support", () => {
  function makeXlsxFile(): File {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["姓名", "角色", "位置"],
        ["王小明", "護理師", "R1"],
      ]),
      "六月",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["姓名", "角色", "位置"],
        ["林怡君", "Leader", "Leader"],
      ]),
      "七月",
    );
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new File([buffer], "班表.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  it("lists all sheet names and defaults to the first sheet", async () => {
    const parsed = await parseFile(makeXlsxFile());
    expect(parsed.sheetNames).toEqual(["六月", "七月"]);
    expect(parsed.activeSheet).toBe("六月");
    expect(parsed.rows[0]).toEqual(["王小明", "護理師", "R1"]);
  });

  it("parses the requested sheet and echoes it as activeSheet", async () => {
    const parsed = await parseFile(makeXlsxFile(), "七月");
    expect(parsed.activeSheet).toBe("七月");
    expect(parsed.rows[0]).toEqual(["林怡君", "Leader", "Leader"]);
    expect(parsed.sheetNames).toEqual(["六月", "七月"]);
  });

  it("falls back to the first sheet when the requested sheet does not exist", async () => {
    const parsed = await parseFile(makeXlsxFile(), "八月");
    expect(parsed.activeSheet).toBe("六月");
    expect(parsed.rows[0]).toEqual(["王小明", "護理師", "R1"]);
  });

  it("reports the single synthetic sheet for CSV files", async () => {
    const file = new File([UTF8_CSV], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.sheetNames).toHaveLength(1);
    expect(parsed.activeSheet).toBe(parsed.sheetNames[0]);
  });
});

describe("parseFile — edge cases", () => {
  it("returns empty headers and rows for an empty CSV", async () => {
    const file = new File([""], "empty.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual([]);
    expect(parsed.rows).toEqual([]);
    expect(parsed.rowNumbers).toEqual([]);
  });

  it("filters out blank rows", async () => {
    const csv = "姓名,角色,位置\n王小明,護理師,R1\n,,\n林怡君,Leader,Leader";
    const file = new File([csv], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.rows).toHaveLength(2);
  });

  it("densifies sparse header and data cells (empty CSV header cell)", async () => {
    // XLSX stores nothing for empty cells, so sheet_to_json({ header: 1 })
    // returns arrays with real holes. They must come back as "" — toEqual
    // distinguishes holes (undefined) from "", so this fails on sparse output.
    const csv = "姓名,,位置\n王小明,,R1";
    const file = new File([csv], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(["姓名", "", "位置"]);
    expect(parsed.rows[0]).toEqual(["王小明", "", "R1"]);
  });
});

describe("parseFile — rowNumbers", () => {
  it("reports 1-based original spreadsheet row numbers (header = row 1)", async () => {
    const file = new File([UTF8_CSV], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.rowNumbers).toEqual([2, 3]);
  });

  it("keeps original row numbers when interior blank rows are filtered", async () => {
    const csv = "姓名,角色,位置\n王小明,護理師,R1\n,,\n林怡君,Leader,R99";
    const file = new File([csv], "班表.csv", { type: "text/csv" });
    const parsed = await parseFile(file);
    expect(parsed.rows).toEqual([
      ["王小明", "護理師", "R1"],
      ["林怡君", "Leader", "R99"],
    ]);
    // 林怡君 sits on spreadsheet row 4 — blank row 3 was dropped from rows
    // but must not shift her original row number.
    expect(parsed.rowNumbers).toEqual([2, 4]);
  });
});
