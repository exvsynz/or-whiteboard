"use client";

import { memo } from "react";
import {
  SHIFT_12_20,
  SHIFT_EVENING,
  SHIFT_NIGHT,
} from "@/lib/board-constants";
import type { BoardPerson } from "@/lib/board-constants";
import { PersonCard } from "./PersonCard";
import { AreaBox } from "./AreaBox";

interface ShiftColumnsProps {
  peopleByArea: Record<string, BoardPerson[]>;
  allCount: (areaId: string) => number;
  hiddenCount: (areaId: string) => number;
  onPersonClick?: (person: BoardPerson) => void;
}

export const ShiftColumns = memo(function ShiftColumns({
  peopleByArea,
  allCount,
  hiddenCount,
  onPersonClick,
}: ShiftColumnsProps) {
  const renderGroup = (label: string, areas: readonly string[]) => (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-slate-500">{label}</h3>
      <div className="space-y-1">
        {areas.map((s) => (
          <AreaBox
            key={s}
            id={s}
            title={s}
            count={allCount(s)}
            hiddenCount={hiddenCount(s)}
            compact
          >
            {(peopleByArea[s] ?? []).map((p) => (
              <PersonCard key={p.id} person={p} onClick={onPersonClick ? () => onPersonClick(p) : undefined} />
            ))}
          </AreaBox>
        ))}
      </div>
    </div>
  );

  return (
    <section aria-label="班別">
      <h2 className="mb-1 text-sm font-bold text-slate-500">班別</h2>
      <div className="space-y-2">
        {renderGroup("12-20", SHIFT_12_20)}
        {renderGroup("小夜", SHIFT_EVENING)}
        {renderGroup("大夜", SHIFT_NIGHT)}
      </div>
    </section>
  );
});
