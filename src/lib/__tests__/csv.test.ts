import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsvRow } from "../csv";

describe("escapeCsvField", () => {
  it("leaves a plain value untouched", () => {
    expect(escapeCsvField("王小明")).toBe("王小明");
  });

  it("quotes a field containing a comma", () => {
    expect(escapeCsvField("張,大明")).toBe('"張,大明"');
  });

  it("quotes a field containing a double quote and doubles the quote", () => {
    expect(escapeCsvField('角色"特殊')).toBe('"角色""特殊"');
  });

  it("quotes a field containing a newline so it cannot break rows", () => {
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
  });

  it("quotes a field containing a carriage return", () => {
    expect(escapeCsvField("a\rb")).toBe('"a\rb"');
  });

  it("neutralizes formula injection: leading =", () => {
    expect(escapeCsvField("=A1")).toBe("'=A1");
  });

  it("neutralizes formula injection: leading +, -, @", () => {
    expect(escapeCsvField("+WEBSERVICE(1)")).toBe("'+WEBSERVICE(1)");
    expect(escapeCsvField("-2+3")).toBe("'-2+3");
    expect(escapeCsvField("@SUM(1)")).toBe("'@SUM(1)");
  });

  it("neutralizes formula injection: leading tab", () => {
    expect(escapeCsvField("\t=1+1")).toBe("'\t=1+1");
  });

  it("neutralizes a leading CR formula and quotes it (CR also forces quoting)", () => {
    expect(escapeCsvField("\r=cmd")).toBe("\"'\r=cmd\"");
  });

  it("neutralizes and quotes a formula payload that also contains commas/quotes", () => {
    expect(escapeCsvField('=HYPERLINK("http://evil.example","R1")')).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""R1"")"',
    );
  });

  it("does not alter = / + that are not in leading position", () => {
    expect(escapeCsvField("A=B")).toBe("A=B");
    expect(escapeCsvField("P+R")).toBe("P+R");
  });
});

describe("toCsvRow", () => {
  it("joins plain fields with commas", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("escapes each field before joining (comma-bearing field stays one cell)", () => {
    expect(toCsvRow(["張,大明", "x"])).toBe('"張,大明",x');
  });

  it("neutralizes a leading-formula field within a row", () => {
    expect(toCsvRow(["=A1", "b"])).toBe("'=A1,b");
  });

  it("produces an empty string for no fields", () => {
    expect(toCsvRow([])).toBe("");
  });
});
