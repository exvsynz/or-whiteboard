"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { BoardPerson } from "@/lib/board-constants";

interface PersonCardProps {
  person: BoardPerson;
  overlay?: boolean;
  onClick?: () => void;
}

export const PersonCard = memo(function PersonCard({
  person,
  overlay,
  onClick,
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

  return <DraggablePersonCard person={person} onClick={onClick} />;
});

const DraggablePersonCard = memo(function DraggablePersonCard({
  person,
  onClick,
}: {
  person: BoardPerson;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: person.id,
      data: { type: "person", person },
    });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ") && !e.defaultPrevented) {
      e.preventDefault();
      onClick();
    }
  };

  return (
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
    >
      <div className="font-semibold text-slate-800">{person.name}</div>
      <div className="text-xs text-slate-500">{person.role}</div>
    </div>
  );
});
