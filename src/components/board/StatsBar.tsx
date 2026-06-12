"use client";

import { memo, useMemo } from "react";
import type { BoardPerson } from "@/lib/board-constants";
import {
  ROOMS,
  SHIFT_12_20,
  SHIFT_EVENING,
  SHIFT_NIGHT,
} from "@/lib/board-constants";

interface StatsBarProps {
  people: BoardPerson[];
}

function countIn(people: BoardPerson[], areas: string[]): number {
  const set = new Set(areas);
  return people.filter((p) => p.area !== null && set.has(p.area)).length;
}

// At-a-glance staffing numbers for the wall display, plus a duplicate-name
// warning — two cards with the same name is how a double-booking shows up
// after an import.
export const StatsBar = memo(function StatsBar({ people }: StatsBarProps) {
  const stats = useMemo(() => {
    const assigned = people.filter((p) => p.area !== null).length;
    const onBreak = people.filter((p) => p.status === "break").length;
    const nameCounts = new Map<string, number>();
    for (const p of people) {
      nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
    }
    const duplicates = [...nameCounts.entries()]
      .filter(([, n]) => n > 1)
      .map(([name]) => name);
    return {
      total: people.length,
      assigned,
      unassigned: people.length - assigned,
      onBreak,
      rooms: countIn(people, ROOMS),
      shift1220: countIn(people, SHIFT_12_20),
      evening: countIn(people, SHIFT_EVENING),
      night: countIn(people, SHIFT_NIGHT),
      duplicates,
    };
  }, [people]);

  return (
    <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-white/70 px-3 py-1 text-xs text-slate-600">
      <span>
        總人數 <b className="text-slate-800">{stats.total}</b>
      </span>
      <span>
        已分派 <b className="text-slate-800">{stats.assigned}</b>
      </span>
      <span>
        未分派{" "}
        <b className={stats.unassigned > 0 ? "text-amber-600" : "text-slate-800"}>
          {stats.unassigned}
        </b>
      </span>
      <span>
        刀房 <b className="text-slate-800">{stats.rooms}</b>
      </span>
      <span>
        12-20 <b className="text-slate-800">{stats.shift1220}</b>
      </span>
      <span>
        小夜 <b className="text-slate-800">{stats.evening}</b>
      </span>
      <span>
        大夜 <b className="text-slate-800">{stats.night}</b>
      </span>
      {stats.onBreak > 0 && (
        <span className="rounded-full bg-amber-100 px-2 font-semibold text-amber-700">
          休息中 {stats.onBreak}
        </span>
      )}
      {stats.duplicates.length > 0 && (
        <span
          className="rounded-full bg-red-100 px-2 font-semibold text-red-700"
          title={stats.duplicates.join("、")}
        >
          ⚠ 重複姓名 {stats.duplicates.length} 組：
          {stats.duplicates.slice(0, 3).join("、")}
          {stats.duplicates.length > 3 ? "…" : ""}
        </span>
      )}
    </div>
  );
});
