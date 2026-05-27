"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";

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
}: AreaBoxProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: "area", areaName: id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border bg-white/90 shadow-sm motion-safe:transition-colors ${
        compact ? "min-h-[38px] p-1" : "min-h-[56px] p-2"
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
        <div className="flex items-center gap-1">
          {hiddenCount != null && hiddenCount > 0 && (
            <span className="text-xs text-slate-500">+{hiddenCount} hidden</span>
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
