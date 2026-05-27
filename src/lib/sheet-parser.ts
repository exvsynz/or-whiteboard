import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

export async function parseFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  if (data.length === 0) return { headers: [], rows: [] };

  const headers = data[0].map((h) => String(h ?? "").trim());
  const rows = data
    .slice(1)
    .filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ""))
    .map((row) => row.map((cell) => String(cell ?? "").trim()));

  return { headers, rows };
}
