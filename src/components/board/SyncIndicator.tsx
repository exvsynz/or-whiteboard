"use client";

import { memo, useEffect, useState } from "react";
import type { ConnectionStatus } from "@/lib/board-backend";

interface SyncIndicatorProps {
  lastSyncedAt: Date | null;
  error: string | null;
  connectionStatus?: ConnectionStatus;
}

const STALE_THRESHOLD_MS = 2 * 60 * 1000;
const TICK_INTERVAL_MS = 5000;

function formatRelativeTime(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 5) return "剛剛";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小時前`;
}

function SyncIndicatorInner({
  lastSyncedAt,
  error,
  connectionStatus,
}: SyncIndicatorProps) {
  // Re-render on an interval so the relative age stays current.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  let dotClass: string;
  let textClass = "";
  let text: string;

  if (connectionStatus === "disconnected") {
    dotClass = "bg-red-500";
    textClass = "text-red-600";
    text = "連線中斷";
  } else if (connectionStatus === "connecting") {
    dotClass = "bg-amber-500";
    textClass = "text-amber-600";
    text = "連線中…";
  } else if (error) {
    dotClass = "bg-red-500";
    text = error;
  } else if (connectionStatus === "local") {
    dotClass = "bg-yellow-500";
    text = "離線模式";
  } else if (lastSyncedAt) {
    const age = Math.max(0, now - lastSyncedAt.getTime());
    const isStale = age > STALE_THRESHOLD_MS;
    dotClass = isStale ? "bg-orange-500" : "bg-green-500";
    textClass = isStale ? "font-medium text-orange-600" : "";
    text = `${formatRelativeTime(age)}同步`;
  } else {
    dotClass = "bg-gray-400";
    text = "尚未同步";
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span
        className={`inline-block size-2 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span className={textClass}>{text}</span>
    </div>
  );
}

export const SyncIndicator = memo(SyncIndicatorInner);
