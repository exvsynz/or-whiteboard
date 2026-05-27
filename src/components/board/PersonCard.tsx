"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { BoardPerson } from "@/lib/board-constants";

interface PersonCardProps {
  person: BoardPerson;
  overlay?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

export const PersonCard = memo(function PersonCard({
  person,
  overlay,
  onClick,
  onRemove,
}: PersonCardProps) {
  if (overlay) {
    return (
      <div
        className={`rounded-xl border border-slate-300 ${person.color} px-3 py-2 text-sm shadow-lg scale-105`}
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
      >
        <div className="font-semibold text-slate-800">{person.name}</div>
        <div className="text-xs text-slate-500">{person.role}</div>
      </div>
    );
  }

  return <DraggablePersonCard person={person} onClick={onClick} onRemove={onRemove} />;
});

function ContextMenu({
  x,
  y,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  onRemove: () => void;
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

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      style={{ top: y, left: x }}
    >
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
    </div>
  );
}

const DraggablePersonCard = memo(function DraggablePersonCard({
  person,
  onClick,
  onRemove,
}: {
  person: BoardPerson;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: person.id,
      data: { type: "person", person },
    });

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onRemove) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [onRemove],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ") && !e.defaultPrevented) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`rounded-xl border border-slate-300 ${person.color} px-3 py-2 text-sm shadow-sm cursor-grab motion-safe:transition-opacity ${
          isDragging ? "opacity-30 scale-95" : ""
        }`}
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
        aria-describedby="dnd-instructions"
        onClick={onClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
      >
        <div className="font-semibold text-slate-800">{person.name}</div>
        <div className="text-xs text-slate-500">{person.role}</div>
      </div>
      {menu && onRemove && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onRemove={onRemove}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
});
