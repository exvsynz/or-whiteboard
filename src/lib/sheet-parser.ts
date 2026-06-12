import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  sheetNames: string[];
  activeSheet: string;
}

function isCSV(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

/**
 * Decode CSV bytes with encoding detection:
 * 1. UTF-8 / UTF-16 BOM wins if present.
 * 2. Otherwise try strict UTF-8.
 * 3. On failure fall back to Big5 (common for Taiwanese HIS / zh-TW Excel exports).
 */
function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("big5").decode(bytes);
  }
}

export async function parseFile(
  file: File,
  sheetName?: string,
): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;

  if (isCSV(file)) {
    workbook = XLSX.read(decodeCsvBuffer(buffer), { type: "string" });
  } else {
    workbook = XLSX.read(buffer, { type: "array" });
  }

  const sheetNames = workbook.SheetNames;
  const activeSheet =
    sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];

  if (!activeSheet) {
    return { headers: [], rows: [], sheetNames, activeSheet: "" };
  }

  const sheet = workbook.Sheets[activeSheet];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  if (data.length === 0) return { headers: [], rows: [], sheetNames, activeSheet };

  const headers = data[0].map((h) => String(h ?? "").trim());
  const rows = data
    .slice(1)
    .filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ""))
    .map((row) => row.map((cell) => String(cell ?? "").trim()));

  return { headers, rows, sheetNames, activeSheet };
}
