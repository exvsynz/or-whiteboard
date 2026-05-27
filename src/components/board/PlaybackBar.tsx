"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";

interface PlaybackBarProps {
  isPlaying: boolean;
  isPaused: boolean;
  progress: number;
  total: number;
  currentPerson: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const PlaybackBar = memo(function PlaybackBar({
  isPlaying,
  isPaused,
  progress,
  total,
  currentPerson,
  onPause,
  onResume,
  onStop,
}: PlaybackBarProps) {
  if (!isPlaying) return null;

  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {isPaused ? "⏸ 已暫停" : "▶ 正在匯入班表..."}
          </span>
          {currentPerson && (
            <span className="text-muted-foreground">{currentPerson}</span>
          )}
          <span className="text-muted-foreground">
            [{progress}/{total}]
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isPaused ? (
            <Button variant="ghost" size="icon-xs" onClick={onResume}>
              ▶
            </Button>
          ) : (
            <Button variant="ghost" size="icon-xs" onClick={onPause}>
              ⏸
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={onStop}>
            ⏹
          </Button>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {percentage}%
      </div>
    </div>
  );
});

export { PlaybackBar };
