"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  RotateCcw,
  Save,
  Upload,
  Download,
  Check,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BoardToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddPerson: (name: string) => void;
  onReset: () => void;
  onImportClick?: () => void;
  onExportCSV?: () => void;
  onExportXLSX?: () => void;
  onSave?: () => void;
  saveState?: "idle" | "saving" | "saved";
}

export function BoardToolbar({
  searchQuery,
  onSearchChange,
  onAddPerson,
  onReset,
  onImportClick,
  onExportCSV,
  onExportXLSX,
  onSave,
  saveState = "idle",
}: BoardToolbarProps) {
  const [newName, setNewName] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const handle = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showExportMenu]);

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
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
      {onImportClick && (
        <Button variant="outline" className="rounded-2xl" onClick={onImportClick}>
          <Upload className="mr-1 h-4 w-4" />
          匯入班表
        </Button>
      )}
      {(onExportCSV || onExportXLSX) && (
        <div className="relative" ref={exportMenuRef}>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => setShowExportMenu((v) => !v)}
          >
            <Download className="mr-1 h-4 w-4" />
            匯出班表
          </Button>
          {showExportMenu && (
            <div
              className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              role="menu"
            >
              {onExportCSV && (
                <button
                  role="menuitem"
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    onExportCSV();
                    setShowExportMenu(false);
                  }}
                >
                  CSV (.csv)
                </button>
              )}
              {onExportXLSX && (
                <button
                  role="menuitem"
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    onExportXLSX();
                    setShowExportMenu(false);
                  }}
                >
                  Excel (.xlsx)
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <Button variant="outline" className="rounded-2xl" onClick={onReset}>
        <RotateCcw className="mr-1 h-4 w-4" />
        重置
      </Button>
      {onSave && (
        <Button
          className="rounded-2xl"
          onClick={onSave}
          disabled={saveState === "saving"}
        >
          {saveState === "saving" ? (
            <>
              <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
              儲存中…
            </>
          ) : saveState === "saved" ? (
            <>
              <Check className="mr-1 h-4 w-4" />
              已儲存
            </>
          ) : (
            <>
              <Save className="mr-1 h-4 w-4" />
              儲存
            </>
          )}
        </Button>
      )}
    </div>
  );
}
