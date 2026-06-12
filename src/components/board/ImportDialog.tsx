"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, X, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseFile, type ParsedSheet } from "@/lib/sheet-parser";
import {
  autoDetectMapping,
  mapRowsToPeople,
  normalizeAreaName,
  stripFormulaGuard,
  type ColumnMapping,
  type ImportResult,
} from "@/lib/board-import";
import type { BoardPerson } from "@/lib/board-constants";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (people: BoardPerson[], animated: boolean) => void;
  currentCount?: number;
}

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

// All dialog state lives in ImportDialogContent, which only mounts while the
// dialog is open — closing unmounts it, so every open starts from a fresh
// state without any reset-in-effect.
export function ImportDialog({ open, onClose, onImport, currentCount }: ImportDialogProps) {
  if (!open) return null;
  return (
    <ImportDialogContent
      onClose={onClose}
      onImport={onImport}
      currentCount={currentCount}
    />
  );
}

function ImportDialogContent({
  onClose,
  onImport,
  currentCount,
}: Omit<ImportDialogProps, "open">) {
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: 0,
    role: 1,
    area: 2,
  });
  const [animated, setAnimated] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Only close on backdrop interaction when the gesture STARTED on the
  // backdrop — releasing a drag/text-selection over it must not discard work.
  const mouseDownOnBackdrop = useRef(false);

  // Focus trap + Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Focus first focusable element
    requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    });

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError("不支援的檔案格式，請使用 CSV 或 XLSX 檔案");
      return;
    }
    try {
      const parsed = await parseFile(f);
      if (parsed.headers.length === 0) {
        setError("檔案為空或無法解析");
        return;
      }
      setFile(f);
      setSheet(parsed);
      setMapping(autoDetectMapping(parsed.headers));
    } catch {
      setError("檔案解析失敗，請確認檔案格式正確");
    }
  }, []);

  const handleSheetChange = useCallback(
    async (sheetName: string) => {
      if (!file) return;
      setError(null);
      try {
        const parsed = await parseFile(file, sheetName);
        setSheet(parsed);
        setMapping(autoDetectMapping(parsed.headers));
      } catch {
        setError("檔案解析失敗，請確認檔案格式正確");
      }
    },
    [file],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFile(selected);
      // Reset so same file can be re-selected
      e.target.value = "";
    },
    [handleFile],
  );

  const result: ImportResult | null = sheet
    ? mapRowsToPeople(sheet.rows, mapping, sheet.rowNumbers)
    : null;
  const people = result?.people ?? [];
  const matchedCount = result?.matchedCount ?? 0;
  const issues = result?.issues ?? [];
  const duplicateNames = result?.duplicateNames ?? [];
  const previewRows = sheet ? sheet.rows.slice(0, 5) : [];

  const handleImport = () => {
    if (people.length === 0) return;
    onImport(people, animated);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnBackdrop.current) {
          onClose();
        }
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="匯入班表"
        className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">匯入班表</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="關閉"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 bg-slate-50 hover:border-slate-300"
            }`}
          >
            <Upload
              className={`mb-2 h-8 w-8 ${dragOver ? "text-blue-400" : "text-slate-400"}`}
            />
            <p className="text-sm text-slate-600">
              拖放 CSV / XLSX 檔案到此處
            </p>
            <p className="text-xs text-slate-400">或點擊選擇檔案</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileInput}
              className="hidden"
              aria-label="選擇檔案"
            />
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-500">{error}</p>
          )}

          {sheet && (
            <>
              {/* Sheet selector (multi-sheet workbooks) */}
              {sheet.sheetNames.length > 1 && (
                <div className="mb-4 flex items-center gap-3">
                  <span className="w-12 text-sm text-slate-600">工作表:</span>
                  <select
                    value={sheet.activeSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    aria-label="選擇工作表"
                  >
                    {sheet.sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Column Mapping */}
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-medium text-slate-700">
                  欄位對應
                </h3>
                <MappingSelect
                  label="姓名"
                  headers={sheet.headers}
                  value={mapping.name}
                  onChange={(v) => setMapping((m) => ({ ...m, name: v }))}
                />
                <MappingSelect
                  label="角色"
                  headers={sheet.headers}
                  value={mapping.role}
                  onChange={(v) => setMapping((m) => ({ ...m, role: v }))}
                />
                <MappingSelect
                  label="位置"
                  headers={sheet.headers}
                  value={mapping.area}
                  onChange={(v) => setMapping((m) => ({ ...m, area: v }))}
                />
              </div>

              {/* Preview */}
              {previewRows.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    預覽（前 5 列）
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">姓名</th>
                          <th className="px-3 py-2">角色</th>
                          <th className="px-3 py-2">位置</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => {
                          // Mirror the real import exactly: the guard
                          // apostrophe from exported CSVs is stripped, so
                          // the preview shows what will actually import.
                          const name = stripFormulaGuard(
                            row[mapping.name]?.trim() ?? "",
                          );
                          const role =
                            stripFormulaGuard(
                              row[mapping.role]?.trim() ?? "",
                            ) || "未設定";
                          const rawArea = stripFormulaGuard(
                            row[mapping.area]?.trim() ?? "",
                          );
                          // Same normalization as the real import — show the
                          // CANONICAL area name the cell will become.
                          const canonicalArea =
                            rawArea === "" ? null : normalizeAreaName(rawArea);
                          return (
                            <tr
                              key={i}
                              className="border-t border-slate-100"
                            >
                              <td className="px-3 py-2 text-slate-800">
                                {name || (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {role}
                              </td>
                              <td className="px-3 py-2">
                                {rawArea === "" ? (
                                  <span className="text-slate-300">-</span>
                                ) : canonicalArea !== null ? (
                                  <span className="inline-flex items-center gap-1 text-green-700">
                                    {canonicalArea}
                                    <Check className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-amber-600">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {rawArea}
                                    <span className="text-xs">(未分派)</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import report */}
              <div className="mb-4 space-y-2">
                <p className="text-sm text-slate-500">
                  找到 <strong className="text-slate-800">{people.length}</strong>{" "}
                  人，其中{" "}
                  <strong className="text-slate-800">{matchedCount}</strong>{" "}
                  人已匹配位置
                </p>
                {currentCount !== undefined && currentCount > 0 && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    匯入將取代目前白板上的 {currentCount} 人
                  </p>
                )}
                {duplicateNames.length > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    重複姓名（{duplicateNames.length}）：
                    {duplicateNames.join("、")}
                  </p>
                )}
                {issues.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-sm font-medium text-amber-700">
                      位置無法辨識（{issues.length}），將列為未分派
                    </h3>
                    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {issues.map((issue) => (
                        <li key={`${issue.rowIndex}-${issue.name}`}>
                          第 {issue.rowIndex} 列 {issue.name}：位置「
                          {issue.rawArea}」
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Animated checkbox */}
              <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={animated}
                  onChange={(e) => setAnimated(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                動畫播放模式（逐一分配）
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            className="rounded-2xl"
            onClick={handleImport}
            disabled={people.length === 0}
          >
            匯入 {people.length} 人
          </Button>
        </div>
      </div>
    </div>
  );
}

function MappingSelect({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-sm text-slate-600">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        aria-label={`${label} 欄位對應`}
      >
        {headers.map((h, idx) => (
          <option key={idx} value={idx}>
            {h || `(欄 ${idx + 1})`}
          </option>
        ))}
      </select>
    </div>
  );
}
