"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useAuditLog } from "@/hooks/useAuditLog";
import type { BoardPerson } from "@/lib/board-constants";
import { downloadCSV } from "@/lib/board-export";
import { Button } from "@/components/ui/button";

interface HistoryDrawerProps {
  person: BoardPerson | null;
  onClose: () => void;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatAction(
  fromArea: string | null,
  toArea: string | null,
  actionType: string,
): string {
  if (actionType === "add_person") return "新增人員";
  if (actionType === "remove_person") return "移除人員";
  const from = fromArea ?? "—";
  const to = toArea ?? "—";
  return `${from} → ${to}`;
}

function HistoryDrawerInner({ person, onClose }: HistoryDrawerProps) {
  const { entries, isLoading } = useAuditLog(person?.id ?? null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!person) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
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
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [person, onClose]);

  // Export only the entries shown in this drawer (per-person), with a UTF-8
  // BOM (added by downloadCSV) so Chinese renders correctly in Excel.
  const handleExport = useCallback(() => {
    if (!person) return;
    const headers = "Timestamp,Person,From,To,Action,User";
    const rows = entries.map((e) =>
      [
        e.timestamp.toISOString(),
        e.personName || person.name,
        e.fromArea ?? "未分派",
        e.toArea ?? "未分派",
        e.actionType,
        e.userId ?? "demo",
      ].join(","),
    );
    downloadCSV([headers, ...rows].join("\n"), `audit-log-${person.name}.csv`);
  }, [entries, person]);

  if (!person) return null;

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name} 歷史紀錄`}
      className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-slate-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">
            {person.name}
          </h2>
          <p className="text-xs text-slate-600">{person.role}</p>
        </div>
        <Button ref={closeButtonRef} variant="ghost" size="sm" onClick={onClose} aria-label="關閉">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <p className="text-center text-xs text-slate-500">載入中…</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-xs text-slate-500">
            尚無歷史紀錄
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry, idx) => (
              <li
                key={`${entry.timestamp.getTime()}-${idx}`}
                className="rounded-md border border-slate-100 px-3 py-2 text-xs"
              >
                <span className="block text-slate-500">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="font-medium text-slate-700">
                  {formatAction(entry.fromArea, entry.toArea, entry.actionType)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        <Button variant="outline" size="sm" onClick={handleExport} className="w-full">
          匯出 CSV
        </Button>
      </div>
    </div>
  );
}

export const HistoryDrawer = memo(HistoryDrawerInner);
