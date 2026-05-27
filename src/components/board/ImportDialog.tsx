"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, X, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseFile, type ParsedSheet } from "@/lib/sheet-parser";
import {
  autoDetectMapping,
  mapRowsToPeople,
  type ColumnMapping,
} from "@/lib/board-import";
import { ALL_AREAS_SET } from "@/lib/board-constants";
import type { BoardPerson } from "@/lib/board-constants";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (people: BoardPerson[], animated: boolean) => void;
}

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export function ImportDialog({ open, onClose, onImport }: ImportDialogProps) {
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

  // Focus trap + Escape handler
  useEffect(() => {
    if (!open) return;

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
  }, [open, onClose]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSheet(null);
      setMapping({ name: 0, role: 1, area: 2 });
      setAnimated(false);
      setError(null);
      setDragOver(false);
    }
  }, [open]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError("不支援的檔案格式，請使用 CSV 或 XLSX 檔案");
      return;
    }
    try {
      const parsed = await parseFile(file);
      if (parsed.headers.length === 0) {
        setError("檔案為空或無法解析");
        return;
      }
      setSheet(parsed);
      setMapping(autoDetectMapping(parsed.headers));
    } catch {
      setError("檔案解析失敗，請確認檔案格式正確");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so same file can be re-selected
      e.target.value = "";
    },
    [handleFile],
  );

  const people = sheet ? mapRowsToPeople(sheet.rows, mapping) : [];
  const matchedAreas = people.filter((p) => p.area !== null).length;
  const previewRows = sheet ? sheet.rows.slice(0, 5) : [];

  const handleImport = () => {
    if (people.length === 0) return;
    onImport(people, animated);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
                          const name = row[mapping.name]?.trim() ?? "";
                          const role = row[mapping.role]?.trim() ?? "未設定";
                          const rawArea = row[mapping.area]?.trim() ?? "";
                          const areaMatched =
                            rawArea !== "" && ALL_AREAS_SET.has(rawArea);
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
                                ) : areaMatched ? (
                                  <span className="inline-flex items-center gap-1 text-green-700">
                                    {rawArea}
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

              {/* Summary */}
              <p className="mb-2 text-sm text-slate-500">
                找到 <strong className="text-slate-800">{people.length}</strong>{" "}
                人，其中{" "}
                <strong className="text-slate-800">{matchedAreas}</strong>{" "}
                人已匹配位置
              </p>
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
