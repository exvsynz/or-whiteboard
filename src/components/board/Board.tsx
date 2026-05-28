"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  MouseSensor,
  KeyboardSensor,
  TouchSensor,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useBoard } from "@/hooks/useBoard";
import { useAuthContext } from "@/components/auth";
import {
  useDemoPlayback,
  generatePlaybackSteps,
} from "@/hooks/useDemoPlayback";
import type { BoardPerson } from "@/lib/board-constants";
import {
  LEADER_AREA,
  FIXED_TASKS,
  ALL_AREAS,
} from "@/lib/board-constants";
import { exportToCSV, exportToXLSX, downloadCSV, downloadBlob } from "@/lib/board-export";
import { PersonCard } from "./PersonCard";
import { AreaBox } from "./AreaBox";
import { BoardToolbar } from "./BoardToolbar";
import { RoomGrid } from "./RoomGrid";
import { ShiftColumns } from "./ShiftColumns";
import { SpecialAreaPanel } from "./SpecialAreaPanel";
import { UnassignedPool } from "./UnassignedPool";
import { SyncIndicator } from "./SyncIndicator";
import { HistoryDrawer } from "./HistoryDrawer";
import { ImportDialog } from "./ImportDialog";
import { PlaybackBar } from "./PlaybackBar";

const UNASSIGNED_DROP_ID = "未分派";

export default function Board() {
  const {
    people,
    filteredPeople,
    peopleByArea,
    movePerson,
    addPerson,
    removePerson,
    loadPeople,
    resetBoard,
    searchFilter,
    setSearchFilter,
    error,
    lastSyncedAt,
  } = useBoard();

  const { isEditor } = useAuthContext();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyPerson, setHistoryPerson] = useState<BoardPerson | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [playbackSteps, setPlaybackSteps] = useState<
    ReturnType<typeof generatePlaybackSteps>
  >([]);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 10 } }),
    useSensor(KeyboardSensor),
  );

  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) liveRegionRef.current.textContent = message;
  }, []);

  const peopleMap = useMemo(() => {
    const map = new Map<string, BoardPerson>();
    for (const p of people) map.set(p.id, p);
    return map;
  }, [people]);

  const activePerson = useMemo(
    () => (activeId ? peopleMap.get(activeId) ?? null : null),
    [activeId, peopleMap],
  );

  // ---- DnD handlers ----
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!isEditor) return;
      const id = event.active.id as string;
      setActiveId(id);
      const person = peopleMap.get(id);
      if (person) announce(`Picked up ${person.name}`);
    },
    [peopleMap, announce, isEditor],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!event.over) return;
      const person = peopleMap.get(event.active.id as string);
      if (person) announce(`Moved ${person.name} over ${event.over.id as string}`);
    },
    [peopleMap, announce],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) {
        announce("Drag cancelled");
        return;
      }
      const personId = active.id as string;
      const dropId = over.id as string;
      const targetArea = dropId === UNASSIGNED_DROP_ID ? null : dropId;
      const person = peopleMap.get(personId);
      if (person && person.area !== targetArea) {
        movePerson(personId, targetArea);
        announce(`Dropped ${person.name} in ${dropId}`);
      } else if (person) {
        announce(`Dropped ${person.name} in ${dropId}`);
      }
    },
    [peopleMap, movePerson, announce],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    announce("Drag cancelled");
  }, [announce]);

  // ---- Person actions ----
  const handlePersonClick = useCallback((person: BoardPerson) => {
    setHistoryPerson(person);
  }, []);

  const handleRemovePerson = useCallback(
    (personId: string) => {
      if (isEditor) removePerson(personId);
    },
    [isEditor, removePerson],
  );

  // ---- Import / Export / Playback ----
  const handleImport = useCallback(
    (imported: BoardPerson[], animated: boolean) => {
      setImportOpen(false);
      if (animated) {
        const unassigned = imported.map((p) => ({ ...p, area: null as string | null }));
        loadPeople(unassigned);
        const steps = generatePlaybackSteps(imported);
        setPlaybackSteps(steps);
      } else {
        loadPeople(imported);
      }
    },
    [loadPeople],
  );

  const handlePlaybackStep = useCallback(
    (person: BoardPerson) => {
      if (person.area !== null) {
        movePerson(person.id, person.area);
      }
    },
    [movePerson],
  );

  const handlePlaybackComplete = useCallback(() => {
    setPlaybackSteps([]);
  }, []);

  const playback = useDemoPlayback(
    playbackSteps,
    handlePlaybackStep,
    handlePlaybackComplete,
  );

  // Auto-start playback when steps are loaded
  const prevStepsLen = useRef(0);
  if (playbackSteps.length > 0 && prevStepsLen.current === 0) {
    prevStepsLen.current = playbackSteps.length;
    queueMicrotask(() => playback.play());
  }
  if (playbackSteps.length === 0) {
    prevStepsLen.current = 0;
  }

  const handleExportCSV = useCallback(() => {
    const csv = exportToCSV(people);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `班表-${date}.csv`);
  }, [people]);

  const handleExportXLSX = useCallback(() => {
    const blob = exportToXLSX(people);
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `班表-${date}.xlsx`);
  }, [people]);

  // ---- Hidden count computation ----
  const allPeopleByArea = useMemo(() => {
    const map: Record<string, BoardPerson[]> = {};
    for (const area of ALL_AREAS) map[area] = [];
    for (const p of people) {
      if (p.area !== null && map[p.area]) map[p.area].push(p);
    }
    return map;
  }, [people]);

  const hiddenCount = useCallback(
    (areaId: string): number =>
      (allPeopleByArea[areaId]?.length ?? 0) - (peopleByArea[areaId]?.length ?? 0),
    [allPeopleByArea, peopleByArea],
  );

  const allCount = useCallback(
    (areaId: string): number => allPeopleByArea[areaId]?.length ?? 0,
    [allPeopleByArea],
  );

  const unassignedFiltered = useMemo(
    () => filteredPeople.filter((p) => p.area === null),
    [filteredPeople],
  );
  const totalUnassigned = useMemo(
    () => people.filter((p) => p.area === null).length,
    [people],
  );
  const hiddenUnassigned = totalUnassigned - unassignedFiltered.length;

  const handleReset = useCallback(() => {
    resetBoard();
    setSearchFilter("");
    setPlaybackSteps([]);
  }, [resetBoard, setSearchFilter]);

  // ---- Fit-to-screen zoom for wall displays ----
  const [fitToScreen, setFitToScreen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    if (!fitToScreen || !boardRef.current) {
      setZoomLevel(1);
      return;
    }
    const recalc = () => {
      if (!boardRef.current) return;
      const { scrollWidth, scrollHeight } = boardRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setZoomLevel(Math.min(vw / scrollWidth, vh / scrollHeight, 1));
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [fitToScreen, people]);

  return (
    <DndContext
      sensors={isEditor ? sensors : undefined}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={boardRef}
        className="min-h-screen bg-slate-100 p-3 text-slate-900"
        style={{ zoom: zoomLevel }}
      >
        <div className="mx-auto max-w-[1900px] space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black tracking-tight">手術室人力白板</h1>
            <div className="flex-1" />
            <AreaBox id={LEADER_AREA} title="Leader" count={allCount(LEADER_AREA)} hiddenCount={hiddenCount(LEADER_AREA)} horizontal compact>
              {(peopleByArea[LEADER_AREA] ?? []).map((p) => (
                <PersonCard key={p.id} person={p} onClick={() => handlePersonClick(p)} onRemove={isEditor ? () => handleRemovePerson(p.id) : undefined} />
              ))}
            </AreaBox>
            <button
              onClick={() => setFitToScreen((v) => !v)}
              className={`rounded-lg px-2 py-1 text-xs ${fitToScreen ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}
              title={fitToScreen ? "Exit fit-to-screen" : "Fit to screen"}
            >
              {fitToScreen ? "🔍 Fit ON" : "🔍 Fit"}
            </button>
            <SyncIndicator lastSyncedAt={lastSyncedAt} error={error} />
          </div>

          {playback.isPlaying || playback.isPaused ? (
            <PlaybackBar
              isPlaying={playback.isPlaying}
              isPaused={playback.isPaused}
              progress={playback.progress}
              total={playback.total}
              currentPerson={playback.currentPerson}
              onPause={playback.pause}
              onResume={playback.resume}
              onStop={() => {
                playback.stop();
                setPlaybackSteps([]);
              }}
            />
          ) : null}

          {isEditor && (
            <BoardToolbar
              searchQuery={searchFilter}
              onSearchChange={setSearchFilter}
              onAddPerson={addPerson}
              onReset={handleReset}
              onImportClick={() => setImportOpen(true)}
              onExportCSV={handleExportCSV}
              onExportXLSX={handleExportXLSX}
            />
          )}

          {!isEditor && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-700">
              唯讀模式 — 僅限查看
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-600">
              {error}
            </div>
          )}

          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "minmax(140px, 200px) 1fr minmax(200px, 260px) minmax(160px, 220px)" }}
          >
            <section aria-label="左側固定任務">
              <h2 className="mb-0.5 text-xs font-bold text-slate-500">左側固定任務</h2>
              <div className="space-y-1">
                {FIXED_TASKS.map((task) => (
                  <AreaBox key={task} id={task} title={task} count={allCount(task)} hiddenCount={hiddenCount(task)} compact>
                    {(peopleByArea[task] ?? []).map((p) => (
                      <PersonCard key={p.id} person={p} onClick={() => handlePersonClick(p)} onRemove={isEditor ? () => handleRemovePerson(p.id) : undefined} />
                    ))}
                  </AreaBox>
                ))}
              </div>
            </section>

            <RoomGrid peopleByArea={peopleByArea} allCount={allCount} hiddenCount={hiddenCount} onPersonClick={handlePersonClick} onRemovePerson={isEditor ? handleRemovePerson : undefined} />
            <ShiftColumns peopleByArea={peopleByArea} allCount={allCount} hiddenCount={hiddenCount} onPersonClick={handlePersonClick} onRemovePerson={isEditor ? handleRemovePerson : undefined} />
            <SpecialAreaPanel peopleByArea={peopleByArea} allCount={allCount} hiddenCount={hiddenCount} onPersonClick={handlePersonClick} onRemovePerson={isEditor ? handleRemovePerson : undefined} />
          </div>

          <UnassignedPool
            unassignedPeople={unassignedFiltered}
            totalUnassigned={totalUnassigned}
            hiddenUnassigned={hiddenUnassigned}
            onPersonClick={handlePersonClick}
            onRemovePerson={isEditor ? handleRemovePerson : undefined}
          />
        </div>
      </div>

      <DragOverlay>{activePerson ? <PersonCard person={activePerson} overlay /> : null}</DragOverlay>

      <div id="dnd-instructions" className="sr-only">
        Press Space or Enter to pick up a draggable item. Use the arrow keys to move it. Press Space or Enter again to drop it in a new position, or press Escape to cancel.
      </div>
      <div ref={liveRegionRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      <HistoryDrawer person={historyPerson} onClose={() => setHistoryPerson(null)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
    </DndContext>
  );
}
