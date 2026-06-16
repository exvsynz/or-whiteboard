"use client";

import { memo } from "react";
import { ROOMS } from "@/lib/board-constants";
import type { BoardPerson } from "@/lib/board-constants";
import { PersonCard } from "./PersonCard";
import { AreaBox } from "./AreaBox";

import type { AreaStatusInfo } from "@/lib/board-types";
import type { AssignmentStatus } from "@/lib/database.types";

interface RoomGridProps {
  peopleByArea: Record<string, BoardPerson[]>;
  allCount: (areaId: string) => number;
  hiddenCount: (areaId: string) => number;
  onPersonClick?: (person: BoardPerson) => void;
  onRemovePerson?: (personId: string) => void;
  areaStatuses?: Map<string, AreaStatusInfo>;
  /** Editors: open the status/note editor for a room. */
  onStatusEdit?: (areaName: string) => void;
  onSetPersonStatus?: (personId: string, status: AssignmentStatus) => void;
}

export const RoomGrid = memo(function RoomGrid({
  peopleByArea,
  allCount,
  hiddenCount,
  onPersonClick,
  onRemovePerson,
  areaStatuses,
  onStatusEdit,
  onSetPersonStatus,
}: RoomGridProps) {
  return (
    <section aria-label="手術室 R1-R31">
      <h2 className="mb-1 text-sm font-bold text-slate-500">手術室 R1-R31</h2>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
        {ROOMS.map((room) => (
          <AreaBox
            key={room}
            id={room}
            title={room}
            count={allCount(room)}
            hiddenCount={hiddenCount(room)}
            compact
            statusInfo={areaStatuses?.get(room)}
            onStatusEdit={onStatusEdit ? () => onStatusEdit(room) : undefined}
          >
            {(peopleByArea[room] ?? []).map((p) => (
              <PersonCard key={p.id} person={p} onClick={onPersonClick ? () => onPersonClick(p) : undefined} onRemove={onRemovePerson ? () => onRemovePerson(p.id) : undefined} onSetStatus={onSetPersonStatus ? (s) => onSetPersonStatus(p.id, s) : undefined} />
            ))}
          </AreaBox>
        ))}
      </div>
    </section>
  );
});
