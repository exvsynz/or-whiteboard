"use client";

import { useState, useEffect } from "react";
import {
  ROOM_STATUS_META,
  ROOM_STATUS_ORDER,
} from "@/lib/board-constants";
import type { RoomStatus } from "@/lib/database.types";
import type { AreaStatusInfo } from "@/lib/board-data";
import { Button } from "@/components/ui/button";

interface AreaStatusDialogProps {
  /** Area (room) being edited; null = closed. */
  areaName: string | null;
  current?: AreaStatusInfo;
  onSave: (areaName: string, status: RoomStatus, note: string) => void;
  onClose: () => void;
}

export function AreaStatusDialog({
  areaName,
  current,
  onSave,
  onClose,
}: AreaStatusDialogProps) {
  const [status, setStatus] = useState<RoomStatus>(current?.status ?? "idle");
  const [note, setNote] = useState(current?.note ?? "");
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Re-seed local fields each time the dialog opens for a (new) area.
  if (areaName !== openedFor) {
    setOpenedFor(areaName);
    setStatus(current?.status ?? "idle");
    setNote(current?.note ?? "");
  }

  useEffect(() => {
    if (!areaName) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [areaName, onClose]);

  if (!areaName) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${areaName} 狀態設定`}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      >
        <h2 className="mb-3 text-base font-bold text-slate-800">
          {areaName} 狀態
        </h2>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {ROOM_STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${ROOM_STATUS_META[s].className} ${
                status === s
                  ? "ring-2 ring-blue-500 ring-offset-1"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {ROOM_STATUS_META[s].label}
            </button>
          ))}
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            備註
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={60}
            placeholder="例如：等待器械、Standby…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            取消
          </Button>
          <Button
            className="rounded-xl"
            onClick={() => {
              onSave(areaName, status, note.trim());
              onClose();
            }}
          >
            儲存
          </Button>
        </div>
      </div>
    </div>
  );
}
