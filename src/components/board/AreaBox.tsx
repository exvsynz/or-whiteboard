"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ROOM_STATUS_META } from "@/lib/board-constants";
import type { AreaStatusInfo } from "@/lib/board-data";

interface AreaBoxProps {
  id: string;
  title: string;
  count: number;
  hiddenCount?: number;
  children?: React.ReactNode;
  /** Smaller padding/sizing for compact layouts */
  compact?: boolean;
  /** Horizontal inline layout */
  horizontal?: boolean;
  /** Dashed border style (for unassigned area) */
  dashed?: boolean;
  /** Live operational status (room lifecycle) shown as a colored chip */
  statusInfo?: AreaStatusInfo;
  /** Editors get a click target on the chip to change status/note */
  onStatusEdit?: () => void;
}

export const AreaBox = memo(function AreaBox({
  id,
  title,
  count,
  hiddenCount,
  children,
  compact,
  horizontal,
  dashed,
  statusInfo,
  onStatusEdit,
}: AreaBoxProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: "area", areaName: id },
  });

  const statusChip =
    statusInfo && (statusInfo.status !== "idle" || statusInfo.note) ? (
      <span
        className={`inline-flex max-w-[90px] items-center gap-0.5 truncate rounded-full px-1.5 text-[10px] font-semibold leading-4 ${ROOM_STATUS_META[statusInfo.status].className}`}
        title={statusInfo.note || ROOM_STATUS_META[statusInfo.status].label}
      >
        {ROOM_STATUS_META[statusInfo.status].label}
        {statusInfo.note ? `・${statusInfo.note}` : ""}
      </span>
    ) : null;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border bg-white/90 shadow-sm motion-safe:transition-colors ${
        compact ? "min-h-[28px] p-0.5" : "min-h-[44px] p-1"
      } ${dashed ? "border-dashed border-slate-300" : "border-slate-200"} ${
        isOver ? "border-blue-400 bg-blue-50/60 ring-2 ring-blue-200" : ""
      }`}
    >
      <div
        className={`flex items-center justify-between gap-2 ${
          compact ? "mb-1" : "mb-2"
        }`}
      >
        <div
          className={`font-bold text-slate-700 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {title}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          {onStatusEdit ? (
            <button
              type="button"
              onClick={onStatusEdit}
              aria-label={`設定 ${title} 狀態`}
              className="flex min-w-0 items-center rounded-full hover:ring-2 hover:ring-blue-200"
            >
              {statusChip ?? (
                <span className="rounded-full px-1 text-[10px] leading-4 text-slate-300 hover:text-slate-500">
                  ⊕
                </span>
              )}
            </button>
          ) : (
            statusChip
          )}
          {hiddenCount != null && hiddenCount > 0 && (
            <span className="text-xs text-slate-500">+{hiddenCount} 隱藏</span>
          )}
          {count > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-semibold text-slate-600">
              {count}
            </span>
          )}
        </div>
      </div>
      <div
        className={`flex flex-1 gap-2 ${
          horizontal ? "flex-nowrap overflow-x-auto" : "flex-wrap"
        }`}
      >
        {children}
      </div>
    </div>
  );
});
