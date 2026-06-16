"use client";

import {
  memo,
  useState,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import type { BoardPerson } from "@/lib/board-constants";
import { ASSIGNMENT_STATUS_META } from "@/lib/board-constants";
import type { AssignmentStatus } from "@/lib/database.types";

/**
 * On phones a single tap opens the status menu (thumb-friendly) instead of the
 * history drawer. Board provides `true` below lg via this context, so PersonCard
 * needn't be prop-drilled through every column component.
 */
export const MobileTapMenuContext = createContext(false);

interface PersonCardProps {
  person: BoardPerson;
  overlay?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  /** Editors: mark the person 休息/代班/正常 from the context menu. */
  onSetStatus?: (status: AssignmentStatus) => void;
}

function StatusBadge({ status }: { status?: AssignmentStatus }) {
  if (!status || status === "assigned") return null;
  const meta = ASSIGNMENT_STATUS_META[status];
  return (
    <span
      className={`ml-1 inline-block shrink-0 rounded-full px-1 text-[9px] font-bold leading-3 ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export const PersonCard = memo(function PersonCard({
  person,
  overlay,
  onClick,
  onRemove,
  onSetStatus,
}: PersonCardProps) {
  if (overlay) {
    return (
      <div
        className={`rounded-lg border border-slate-300 ${person.color} px-2 py-1 text-xs shadow-lg scale-105`}
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
      >
        <div className="truncate font-semibold text-slate-800">
          {person.name}
          <StatusBadge status={person.status} />
        </div>
        <div className="truncate text-[10px] leading-tight text-slate-500">{person.role}</div>
      </div>
    );
  }

  return (
    <DraggablePersonCard
      person={person}
      onClick={onClick}
      onRemove={onRemove}
      onSetStatus={onSetStatus}
    />
  );
});

function ContextMenu({
  x,
  y,
  person,
  onRemove,
  onSetStatus,
  onClose,
}: {
  x: number;
  y: number;
  person: BoardPerson;
  onRemove?: () => void;
  onSetStatus?: (status: AssignmentStatus) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const currentStatus = person.status ?? "assigned";
  const statusItems: Array<{ status: AssignmentStatus; label: string }> = [
    { status: "break", label: "標記休息" },
    { status: "relief", label: "標記代班" },
  ];

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      style={{ top: y, left: x }}
    >
      {onSetStatus &&
        statusItems.map(({ status, label }) =>
          currentStatus === status ? (
            <button
              key={status}
              role="menuitem"
              className="w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                onSetStatus("assigned");
                onClose();
              }}
            >
              取消{ASSIGNMENT_STATUS_META[status].label}
            </button>
          ) : (
            <button
              key={status}
              role="menuitem"
              className="w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                onSetStatus(status);
                onClose();
              }}
            >
              {label}
            </button>
          ),
        )}
      {onRemove && (
        <button
          role="menuitem"
          className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
          onClick={() => {
            onRemove();
            onClose();
          }}
        >
          移除人員
        </button>
      )}
    </div>
  );
}

const DraggablePersonCard = memo(function DraggablePersonCard({
  person,
  onClick,
  onRemove,
  onSetStatus,
}: {
  person: BoardPerson;
  onClick?: () => void;
  onRemove?: () => void;
  onSetStatus?: (status: AssignmentStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: person.id,
    data: { type: "person", person },
  });

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const tapOpensMenu = useContext(MobileTapMenuContext);

  // No translate transform here: Board renders a <DragOverlay> copy that
  // follows the cursor, so the original stays in place as the dimmed ghost.
  // touchAction "pan-y" when idle keeps touch scrolling working (see 80f5932).
  const style: React.CSSProperties = isDragging
    ? { touchAction: "none" }
    : { touchAction: "pan-y" };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onRemove && !onSetStatus) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [onRemove, onSetStatus],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Phones: a single tap opens the status menu (thumb-friendly). Desktop:
      // a tap opens history; right-click / long-press opens the menu. Clamp the
      // position so the menu can't render off the edge of a small screen.
      if (tapOpensMenu && (onSetStatus || onRemove)) {
        e.preventDefault();
        setMenu({
          x: Math.min(e.clientX, window.innerWidth - 140),
          y: Math.min(e.clientY, window.innerHeight - 120),
        });
        return;
      }
      onClick?.();
    },
    [tapOpensMenu, onSetStatus, onRemove, onClick],
  );

  // Compose with dnd-kit's KeyboardSensor activator (delivered via
  // {...listeners}): the sensor runs first, so Enter/Space picks the card up
  // for keyboard dragging (it calls preventDefault when it activates). Only
  // when no sensor claims the event do Enter/Space fall back to onClick;
  // opening the history drawer otherwise stays a mouse/touch affordance.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    listeners?.onKeyDown?.(e);
    if (onClick && (e.key === "Enter" || e.key === " ") && !e.defaultPrevented) {
      e.preventDefault();
      onClick();
    }
  };

  const dimmed =
    person.status === "break" ? "opacity-60 saturate-50" : "";

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`max-w-full rounded-lg border border-slate-300 ${person.color} px-2 py-1 text-xs shadow-sm cursor-grab motion-safe:transition-opacity ${
          isDragging ? "opacity-30 scale-95" : dimmed
        }`}
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
        aria-describedby="dnd-instructions"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
      >
        <div className="truncate font-semibold text-slate-800">
          {person.name}
          <StatusBadge status={person.status} />
        </div>
        <div className="truncate text-[10px] leading-tight text-slate-500">{person.role}</div>
      </div>
      {menu && (onRemove || onSetStatus) && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          person={person}
          onRemove={onRemove}
          onSetStatus={onSetStatus}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
});
