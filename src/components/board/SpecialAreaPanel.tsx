"use client";

import { memo } from "react";
import {
  ANESTHESIA_OUTSIDE,
  RECOVERY_ROOMS,
  CASE_MANAGEMENT,
} from "@/lib/board-constants";
import type { BoardPerson } from "@/lib/board-constants";
import { PersonCard } from "./PersonCard";
import { AreaBox } from "./AreaBox";

interface SpecialAreaPanelProps {
  peopleByArea: Record<string, BoardPerson[]>;
  allCount: (areaId: string) => number;
  hiddenCount: (areaId: string) => number;
  onPersonClick?: (person: BoardPerson) => void;
}

export const SpecialAreaPanel = memo(function SpecialAreaPanel({
  peopleByArea,
  allCount,
  hiddenCount,
  onPersonClick,
}: SpecialAreaPanelProps) {
  const renderGroup = (label: string, areas: readonly string[]) => (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-slate-500">{label}</h3>
      <div className="space-y-2">
        {areas.map((a) => (
          <AreaBox
            key={a}
            id={a}
            title={a}
            count={allCount(a)}
            hiddenCount={hiddenCount(a)}
            compact
          >
            {(peopleByArea[a] ?? []).map((p) => (
              <PersonCard key={p.id} person={p} onClick={onPersonClick ? () => onPersonClick(p) : undefined} />
            ))}
          </AreaBox>
        ))}
      </div>
    </div>
  );

  return (
    <section aria-label="特殊區域">
      <h2 className="mb-1 text-sm font-bold text-slate-500">特殊區域</h2>
      <div className="space-y-3">
        {renderGroup("科外麻醉", ANESTHESIA_OUTSIDE)}
        {renderGroup("恢復室", RECOVERY_ROOMS)}
        {renderGroup("個案管理", CASE_MANAGEMENT)}
      </div>
    </section>
  );
});
