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
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
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
import { LEADER_AREA, FIXED_TASKS, ALL_AREAS } from "@/lib/board-constants";
import {
  exportToCSV,
  exportToXLSX,
  downloadCSV,
  downloadBlob,
  localDateString,
} from "@/lib/board-export";
import { PersonCard } from "./PersonCard";
import { AreaBox } from "./AreaBox";
import { AreaStatusDialog } from "./AreaStatusDialog";
import { BoardToolbar } from "./BoardToolbar";
import { RoomGrid } from "./RoomGrid";
import { StatsBar } from "./StatsBar";
import { ShiftColumns } from "./ShiftColumns";
import { SpecialAreaPanel } from "./SpecialAreaPanel";
import { UnassignedPool } from "./UnassignedPool";
import { SyncIndicator } from "./SyncIndicator";
import { HistoryDrawer } from "./HistoryDrawer";
import { ImportDialog } from "./ImportDialog";
import { PlaybackBar } from "./PlaybackBar";

const UNASSIGNED_DROP_ID = "未分派";

// Pointer drags cancel when released outside any droppable; keyboard drags
// (no pointer coordinates) fall back to rectangle intersection.
const dropCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return localDateString(next);
}

export default function Board() {
  const {
    people,
    filteredPeople,
    peopleByArea,
    movePerson,
    addPerson,
    removePerson,
    setPersonStatus,
    importPeople,
    resetBoard,
    saveNow,
    saveState,
    setPlaybackActive,
    searchFilter,
    setSearchFilter,
    error,
    isStale,
    isLoading,
    lastSyncedAt,
    connectionStatus,
    boardDate,
    setBoardDate,
    areaStatuses,
    updateAreaStatus,
  } = useBoard();

  const { isEditor } = useAuthContext();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyPerson, setHistoryPerson] = useState<BoardPerson | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [statusEditArea, setStatusEditArea] = useState<string | null>(null);
  const [playbackSteps, setPlaybackSteps] = useState<
    ReturnType<typeof generatePlaybackSteps>
  >([]);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 10 },
    }),
    useSensor(KeyboardSensor),
  );
  // Read-only clients get NO sensors: leaving the prop undefined would
  // activate dnd-kit's built-in defaults and let viewers drag cards.
  const noSensors = useSensors();

  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) liveRegionRef.current.textContent = message;
  }, []);

  const peopleMap = useMemo(() => {
    const map = new Map<string, BoardPerson>();
    for (const p of people) map.set(p.id, p);
    return map;
  }, [people]);

  const activePerson = useMemo(
    () => (activeId ? (peopleMap.get(activeId) ?? null) : null),
    [activeId, peopleMap],
  );

  // ---- DnD handlers ----
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!isEditor) return;
      const id = event.active.id as string;
      setActiveId(id);
      const person = peopleMap.get(id);
      if (person) announce(`已拿起 ${person.name}`);
    },
    [peopleMap, announce, isEditor],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!event.over) return;
      const person = peopleMap.get(event.active.id as string);
      if (person)
        announce(`${person.name} 移到 ${event.over.id as string} 上方`);
    },
    [peopleMap, announce],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      // Defense in depth — viewers have no sensors, but never mutate
      // unless the role allows it.
      if (!isEditor) return;
      if (!over) {
        announce("已取消拖曳");
        return;
      }
      const personId = active.id as string;
      const dropId = over.id as string;
      const targetArea = dropId === UNASSIGNED_DROP_ID ? null : dropId;
      const person = peopleMap.get(personId);
      if (person && person.area !== targetArea) {
        movePerson(personId, targetArea);
      }
      if (person) announce(`${person.name} 已放到 ${dropId}`);
    },
    [peopleMap, movePerson, announce, isEditor],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    announce("已取消拖曳");
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
  const playbackStepsRef = useRef(playbackSteps);
  useEffect(() => {
    playbackStepsRef.current = playbackSteps;
  }, [playbackSteps]);

  const handlePlaybackStep = useCallback(
    (person: BoardPerson) => {
      if (person.area !== null) {
        // The DB already holds the imported end state — animate locally only.
        movePerson(person.id, person.area, { persist: false });
      }
    },
    [movePerson],
  );

  const handlePlaybackComplete = useCallback(() => {
    setPlaybackSteps([]);
    setPlaybackActive(false);
  }, [setPlaybackActive]);

  const playback = useDemoPlayback(
    playbackSteps,
    handlePlaybackStep,
    handlePlaybackComplete,
  );

  const playbackRef = useRef(playback);
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const handleImport = useCallback(
    async (imported: BoardPerson[], animated: boolean) => {
      setImportOpen(false);
      setImportError(null);
      // A still-running playback would keep firing stale steps over the
      // fresh import — stop it first.
      playbackRef.current.stop();
      setPlaybackSteps([]);
      if (animated) setPlaybackActive(true);
      try {
        const adopted = await importPeople(imported, {
          displayUnassigned: animated,
        });
        if (animated) {
          setPlaybackSteps(generatePlaybackSteps(adopted));
        }
      } catch (err) {
        setPlaybackActive(false);
        const message = `匯入失敗: ${err instanceof Error ? err.message : String(err)}`;
        setImportError(message);
        announce(message);
      }
    },
    [importPeople, setPlaybackActive, announce],
  );

  // Auto-start playback when new steps land (effect, not render-phase refs).
  useEffect(() => {
    if (playbackSteps.length > 0) {
      playbackRef.current.play();
    }
  }, [playbackSteps]);

  const handleStopPlayback = useCallback(() => {
    playbackRef.current.stop();
    setPlaybackSteps([]);
    setPlaybackActive(false);
  }, [setPlaybackActive]);

  const handleExportCSV = useCallback(() => {
    const csv = exportToCSV(people);
    downloadCSV(csv, `班表-${boardDate}.csv`);
  }, [people, boardDate]);

  const handleExportXLSX = useCallback(() => {
    const blob = exportToXLSX(people);
    downloadBlob(blob, `班表-${boardDate}.xlsx`);
  }, [people, boardDate]);

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
      (allPeopleByArea[areaId]?.length ?? 0) -
      (peopleByArea[areaId]?.length ?? 0),
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
    if (
      !window.confirm(
        `確定要重置 ${boardDate} 的白板嗎？此操作會清除當日所有排班。`,
      )
    ) {
      return;
    }
    handleStopPlayback();
    resetBoard();
    setSearchFilter("");
  }, [resetBoard, setSearchFilter, handleStopPlayback, boardDate]);

  // ---- Fullscreen for wall displays / kiosk ----
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, []);

  // ---- Fit-to-screen zoom for wall displays ----
  const [fitToScreen, setFitToScreen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const toggleFitToScreen = useCallback(() => {
    setFitToScreen((v) => !v);
    // Reset on either direction: turning off restores 1:1, turning on
    // starts from neutral before the effect measures.
    setZoomLevel(1);
  }, []);

  useEffect(() => {
    if (!fitToScreen) return;
    // The board root clips overflow, so measuring it is useless (its
    // scroll size equals its client size — the old no-op bug). Measure at
    // neutral zoom by temporarily clearing the inline scale, reading the
    // scrollable columns, and restoring — all synchronously within one
    // frame, so nothing paints in between. Measuring fresh each time also
    // fixes the old one-way ratchet: content shrinking or the window
    // growing scales the board back up.
    const recalc = () => {
      const root = boardRef.current;
      if (!root) return;
      const prev = {
        zoom: root.style.zoom,
        height: root.style.height,
        width: root.style.width,
      };
      root.style.zoom = "1";
      root.style.height = "";
      root.style.width = "";
      const columns = root.querySelectorAll<HTMLElement>("[data-scroll-col]");
      let scale = 1;
      for (const col of columns) {
        if (col.scrollHeight > col.clientHeight) {
          scale = Math.min(scale, col.clientHeight / col.scrollHeight);
        }
      }
      root.style.zoom = prev.zoom;
      root.style.height = prev.height;
      root.style.width = prev.width;
      setZoomLevel(Math.max(0.5, scale));
    };
    const raf = requestAnimationFrame(recalc);
    window.addEventListener("resize", recalc);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", recalc);
    };
    // searchFilter changes column contents without changing `people`.
  }, [fitToScreen, people, searchFilter]);

  const today = localDateString();

  return (
    <DndContext
      sensors={isEditor ? sensors : noSensors}
      collisionDetection={dropCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={boardRef}
        className="flex h-dvh flex-col overflow-hidden bg-slate-100 p-2 text-slate-900"
        // CSS zoom scales the container AND its content equally, which
        // leaves overflow ratios unchanged — compensating the height by
        // 1/zoom keeps the box viewport-sized so only the content shrinks.
        // Height only: viewport units (dvh) are multiplied by zoom, but
        // percentage widths already resolve to the full parent, so a
        // width compensation would overshoot by 1/zoom and push the right
        // columns off-screen.
        style={
          zoomLevel !== 1
            ? {
                zoom: zoomLevel,
                height: `calc(100dvh / ${zoomLevel})`,
              }
            : undefined
        }
      >
        <div className="mx-auto flex w-full max-w-[1900px] flex-1 flex-col gap-1.5 overflow-hidden">
          <div className="flex flex-none items-center gap-2">
            <h1 className="text-lg font-black tracking-tight">
              手術室人力白板
            </h1>
            <div className="flex items-center gap-1 rounded-lg bg-white px-1.5 py-0.5 shadow-sm">
              <button
                onClick={() => setBoardDate(shiftDate(boardDate, -1))}
                className="rounded px-1.5 py-0.5 text-sm text-slate-500 hover:bg-slate-100"
                aria-label="前一天"
              >
                ◀
              </button>
              <input
                type="date"
                value={boardDate}
                onChange={(e) => {
                  if (e.target.value) setBoardDate(e.target.value);
                }}
                className="bg-transparent text-sm font-semibold outline-none"
                aria-label="看板日期"
              />
              <button
                onClick={() => setBoardDate(shiftDate(boardDate, 1))}
                className="rounded px-1.5 py-0.5 text-sm text-slate-500 hover:bg-slate-100"
                aria-label="後一天"
              >
                ▶
              </button>
              {boardDate !== today && (
                <button
                  onClick={() => setBoardDate(today)}
                  className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                >
                  今天
                </button>
              )}
            </div>
            <div className="flex-1" />
            <AreaBox
              id={LEADER_AREA}
              title="Leader"
              count={allCount(LEADER_AREA)}
              hiddenCount={hiddenCount(LEADER_AREA)}
              horizontal
              compact
            >
              {(peopleByArea[LEADER_AREA] ?? []).map((p) => (
                <PersonCard
                  key={p.id}
                  person={p}
                  onClick={() => handlePersonClick(p)}
                  onRemove={
                    isEditor ? () => handleRemovePerson(p.id) : undefined
                  }
                  onSetStatus={
                    isEditor ? (s) => setPersonStatus(p.id, s) : undefined
                  }
                />
              ))}
            </AreaBox>
            <button
              onClick={toggleFitToScreen}
              className={`rounded-lg px-2 py-1 text-xs ${fitToScreen ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}
              title={fitToScreen ? "結束自動縮放" : "自動縮放至螢幕大小"}
            >
              {fitToScreen ? "🔍 縮放中" : "🔍 縮放"}
            </button>
            <button
              onClick={toggleFullscreen}
              className={`rounded-lg px-2 py-1 text-xs ${isFullscreen ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}
              title={isFullscreen ? "離開全螢幕" : "全螢幕顯示"}
            >
              ⛶ 全螢幕
            </button>
            <SyncIndicator
              lastSyncedAt={lastSyncedAt}
              error={error}
              connectionStatus={connectionStatus}
            />
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
              onStop={handleStopPlayback}
            />
          ) : null}

          {isEditor && (
            <div className="flex-none">
              <BoardToolbar
                searchQuery={searchFilter}
                onSearchChange={setSearchFilter}
                onAddPerson={addPerson}
                onReset={handleReset}
                onImportClick={() => setImportOpen(true)}
                onExportCSV={handleExportCSV}
                onExportXLSX={handleExportXLSX}
                onSave={() => void saveNow()}
                saveState={saveState}
              />
            </div>
          )}

          {!isEditor && (
            <div className="flex-none rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-700">
              唯讀模式 — 僅限查看
            </div>
          )}

          {isStale && (
            <div className="flex-none rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-700">
              ⚠ 無法連線到伺服器 — 顯示的是本機快取資料，可能不是最新狀態
            </div>
          )}

          {(importError || (error && !isStale)) && (
            <div className="flex-none rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-600">
              {importError ?? error}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              載入中…
            </div>
          ) : (
            <>
              <StatsBar people={people} />
              <div
                className="grid min-h-0 flex-1 gap-2"
                style={{
                  gridTemplateColumns:
                    "minmax(140px, 200px) 1fr minmax(200px, 260px) minmax(160px, 220px)",
                }}
              >
                <section
                  aria-label="左側固定任務"
                  className="overflow-y-auto"
                  data-scroll-col
                >
                  <h2 className="mb-0.5 text-xs font-bold text-slate-500">
                    左側固定任務
                  </h2>
                  <div className="space-y-1">
                    {FIXED_TASKS.map((task) => (
                      <AreaBox
                        key={task}
                        id={task}
                        title={task}
                        count={allCount(task)}
                        hiddenCount={hiddenCount(task)}
                        compact
                      >
                        {(peopleByArea[task] ?? []).map((p) => (
                          <PersonCard
                            key={p.id}
                            person={p}
                            onClick={() => handlePersonClick(p)}
                            onRemove={
                              isEditor
                                ? () => handleRemovePerson(p.id)
                                : undefined
                            }
                            onSetStatus={
                              isEditor
                                ? (s) => setPersonStatus(p.id, s)
                                : undefined
                            }
                          />
                        ))}
                      </AreaBox>
                    ))}
                  </div>
                </section>

                <div className="overflow-y-auto" data-scroll-col>
                  <RoomGrid
                    peopleByArea={peopleByArea}
                    allCount={allCount}
                    hiddenCount={hiddenCount}
                    onPersonClick={handlePersonClick}
                    onRemovePerson={isEditor ? handleRemovePerson : undefined}
                    areaStatuses={areaStatuses}
                    onStatusEdit={isEditor ? setStatusEditArea : undefined}
                    onSetPersonStatus={isEditor ? setPersonStatus : undefined}
                  />
                </div>
                <div className="overflow-y-auto" data-scroll-col>
                  <ShiftColumns
                    peopleByArea={peopleByArea}
                    allCount={allCount}
                    hiddenCount={hiddenCount}
                    onPersonClick={handlePersonClick}
                    onRemovePerson={isEditor ? handleRemovePerson : undefined}
                    onSetPersonStatus={isEditor ? setPersonStatus : undefined}
                  />
                </div>
                <div className="overflow-y-auto" data-scroll-col>
                  <SpecialAreaPanel
                    peopleByArea={peopleByArea}
                    allCount={allCount}
                    hiddenCount={hiddenCount}
                    onPersonClick={handlePersonClick}
                    onRemovePerson={isEditor ? handleRemovePerson : undefined}
                    onSetPersonStatus={isEditor ? setPersonStatus : undefined}
                  />
                </div>
              </div>

              <div className="max-h-[22dvh] flex-none overflow-y-auto">
                <UnassignedPool
                  unassignedPeople={unassignedFiltered}
                  totalUnassigned={totalUnassigned}
                  hiddenUnassigned={hiddenUnassigned}
                  onPersonClick={handlePersonClick}
                  onRemovePerson={isEditor ? handleRemovePerson : undefined}
                  onSetPersonStatus={isEditor ? setPersonStatus : undefined}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <DragOverlay>
        {activePerson ? <PersonCard person={activePerson} overlay /> : null}
      </DragOverlay>

      <div id="dnd-instructions" className="sr-only">
        按空白鍵或 Enter 拿起人員卡片，使用方向鍵移動，再按一次空白鍵或 Enter
        放置到新位置，按 Esc 取消。
      </div>
      <div
        ref={liveRegionRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <AreaStatusDialog
        areaName={statusEditArea}
        current={
          statusEditArea ? areaStatuses.get(statusEditArea) : undefined
        }
        onSave={updateAreaStatus}
        onClose={() => setStatusEditArea(null)}
      />
      <HistoryDrawer
        person={historyPerson}
        onClose={() => setHistoryPerson(null)}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        currentCount={people.length}
      />
    </DndContext>
  );
}
