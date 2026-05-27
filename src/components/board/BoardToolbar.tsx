"use client";

import { useState } from "react";
import { Search, Plus, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BoardToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddPerson: (name: string) => void;
  onReset: () => void;
}

export function BoardToolbar({
  searchQuery,
  onSearchChange,
  onAddPerson,
  onReset,
}: BoardToolbarProps) {
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddPerson(trimmed);
    setNewName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          placeholder="搜尋姓名／角色／位置"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-slate-400 sm:w-64"
          aria-label="搜尋姓名／角色／位置"
        />
      </div>
      <div className="flex gap-2">
        <input
          placeholder="新增人名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 sm:w-36"
          aria-label="新增人名"
        />
        <Button className="rounded-2xl" onClick={handleAdd}>
          <Plus className="mr-1 h-4 w-4" />
          新增
        </Button>
      </div>
      <Button variant="outline" className="rounded-2xl" onClick={onReset}>
        <RotateCcw className="mr-1 h-4 w-4" />
        重置
      </Button>
      <Button className="rounded-2xl" onClick={() => { /* no-op for Phase 1 */ }}>
        <Save className="mr-1 h-4 w-4" />
        儲存
      </Button>
    </div>
  );
}
