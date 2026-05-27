"use client";

import { memo, useMemo } from "react";
import { isSupabaseConfigured } from "@/lib/supabase-client";

interface SyncIndicatorProps {
  lastSyncedAt: Date | null;
  error: string | null;
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function SyncIndicatorInner({ lastSyncedAt, error }: SyncIndicatorProps) {
  const content = useMemo(() => {
    if (error) {
      return {
        dotClass: "bg-red-500",
        text: error,
      };
    }
    if (!isSupabaseConfigured) {
      return {
        dotClass: "bg-yellow-500",
        text: "Offline mode",
      };
    }
    if (lastSyncedAt) {
      return {
        dotClass: "bg-green-500",
        text: `Synced ${formatRelativeTime(lastSyncedAt)}`,
      };
    }
    return {
      dotClass: "bg-gray-400",
      text: "Not synced",
    };
  }, [lastSyncedAt, error]);

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span
        className={`inline-block size-2 rounded-full ${content.dotClass}`}
        aria-hidden="true"
      />
      <span>{content.text}</span>
    </div>
  );
}

export const SyncIndicator = memo(SyncIndicatorInner);
