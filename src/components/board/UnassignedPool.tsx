"use client";

import { memo } from "react";
import type { BoardPerson } from "@/lib/board-constants";
import { PersonCard } from "./PersonCard";
import { AreaBox } from "./AreaBox";

interface UnassignedPoolProps {
  unassignedPeople: BoardPerson[];
  totalUnassigned: number;
  hiddenUnassigned: number;
  onPersonClick?: (person: BoardPerson) => void;
}

export const UnassignedPool = memo(function UnassignedPool({
  unassignedPeople,
  totalUnassigned,
  hiddenUnassigned,
  onPersonClick,
}: UnassignedPoolProps) {
  return (
    <section aria-label="未分派">
      <h2 className="mb-1 text-sm font-bold text-slate-500">未分派</h2>
      <AreaBox
        id="未分派"
        title="未分派"
        count={totalUnassigned}
        hiddenCount={hiddenUnassigned}
        dashed
      >
        {unassignedPeople.map((p) => (
          <PersonCard key={p.id} person={p} onClick={onPersonClick ? () => onPersonClick(p) : undefined} />
        ))}
      </AreaBox>
    </section>
  );
});
