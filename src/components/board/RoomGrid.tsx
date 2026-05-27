"use client";

import { memo } from "react";
import { ROOMS } from "@/lib/board-constants";
import type { BoardPerson } from "@/lib/board-constants";
import { PersonCard } from "./PersonCard";
import { AreaBox } from "./AreaBox";

interface RoomGridProps {
  peopleByArea: Record<string, BoardPerson[]>;
  allCount: (areaId: string) => number;
  hiddenCount: (areaId: string) => number;
  onPersonClick?: (person: BoardPerson) => void;
}

export const RoomGrid = memo(function RoomGrid({
  peopleByArea,
  allCount,
  hiddenCount,
  onPersonClick,
}: RoomGridProps) {
  return (
    <section aria-label="手術室 R1-R31">
      <h2 className="mb-1 text-sm font-bold text-slate-500">手術室 R1-R31</h2>
      <div className="grid grid-cols-4 gap-1.5 2xl:grid-cols-5">
        {ROOMS.map((room) => (
          <AreaBox
            key={room}
            id={room}
            title={room}
            count={allCount(room)}
            hiddenCount={hiddenCount(room)}
            compact
          >
            {(peopleByArea[room] ?? []).map((p) => (
              <PersonCard key={p.id} person={p} onClick={onPersonClick ? () => onPersonClick(p) : undefined} />
            ))}
          </AreaBox>
        ))}
      </div>
    </section>
  );
});
