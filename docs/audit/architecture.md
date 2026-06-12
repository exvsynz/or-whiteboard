# OR Whiteboard (`C:/Users/exvsy/or-whiteboard`) — Architecture Map

Next.js 16.2.6 App Router, React 19, TS, Tailwind 4, dnd-kit, Supabase JS v2, SheetJS (`package.json:16-32`). Single page app: `src/app/page.tsx:6-12` renders `<AuthGuard><Board/></AuthGuard>`; root layout wraps everything in `AuthProvider` (`src/app/layout.tsx:32`, `src/components/Providers.tsx:5-7`).

---

## 1. Data model

### Client-side board state (the real working model)

The entire board is one flat array of `BoardPerson`:

```ts
// src/lib/board-constants.ts:1-7
interface BoardPerson { id: string; name: string; role: string; color: string; area: string | null }
```

- `area` is an **area name string** (e.g. `"R1"`, `"小夜A1"`) or `null` = unassigned. There is no separate assignment entity client-side.
- Valid areas are hardcoded constants, 67 total: `LEADER_AREA` (`board-constants.ts:9`), 7 `FIXED_TASKS` (`:11-19`), 31 `ROOMS` R1–R31 (`:21`), 6+6+6 shift slots (`:23-48`), 5 `ANESTHESIA_OUTSIDE` (`:50-56`), 2 `RECOVERY_ROOMS` (`:58`), 3 `CASE_MANAGEMENT` (`:60`), unioned into `ALL_AREAS`/`ALL_AREAS_SET` (`:62-74`).
- `useBoard` holds `people: BoardPerson[]` (`src/hooks/useBoard.ts:47`) and derives `filteredPeople` (search, `:248-257`) and `peopleByArea: Record<areaName, BoardPerson[]>` (`:259-270`).
- 6 hardcoded `DEMO_PEOPLE` with non-UUID ids `"demo-1"…"demo-6"` (`board-constants.ts:85-128`).

### DB schema (`supabase/migrations/001_initial_schema.sql`)

| Table | Key columns | Notes |
|---|---|---|
| `areas` | `id UUID PK`, `name TEXT UNIQUE`, `category` (9-value CHECK), `sort_order` (`001:2-12`) | Seeded with the same 67 areas as the constants file (`supabase/seed.sql:1-66`) |
| `people` | `id UUID PK`, `name`, `role` default `'未設定'`, `color`, `is_active` (`001:15-22`) | Seeded with the same 6 demo people (`seed.sql:69-75`) |
| `assignments` | `person_id UUID FK→people`, `area_id UUID FK→areas (nullable)`, `board_date DATE`, `version INT`, `updated_by FK→auth.users`, `UNIQUE(person_id, board_date)` (`001:25-34`) | Per-date normalized assignment; in realtime publication (`001:54`) |
| `audit_log` | `person_id FK→people`, `from_area_id`/`to_area_id FK→areas`, `action_type` CHECK in 5 values, `user_id FK→auth.users` (`001:37-47`) | |

TS mirror in `src/lib/database.types.ts:19-101` (hand-written, matches the SQL).

### How they relate — **they don't, structurally**

The DB is normalized on **UUIDs**; the client uses **area name strings** and **locally generated person ids**. Every Supabase write sends incompatible values:

- `persistMove` upserts `{ person_id: <client id>, area_id: <area NAME string> }` into `assignments` (`useBoard.ts:112-120`), but `assignments.area_id` is a `UUID FK → areas(id)` (`001:28`). A name like `"R1"` fails UUID parsing → every move write **errors and triggers rollback** (`useBoard.ts:121-128`).
- `person_id` is `crypto.randomUUID()` minted client-side at import/add (`src/lib/board-import.ts:47`, `useBoard.ts:174`) or `"demo-1"`; none exist in the DB `people` table, so even with a valid UUID the FK fails. `addPerson`'s DB insert (`useBoard.ts:191-202`) lets Postgres generate a *different* id and never reads it back, so local id ≠ DB id permanently.
- Same mismatch in audit writes: `from_area_id`/`to_area_id` get area names (`src/lib/audit-client.ts:21-32`).
- No code anywhere reads `areas` or `people` from the DB to translate names→UUIDs. The only `.select()` in the whole app is on `audit_log` (`src/hooks/useAuditLog.ts:27`).

**Conclusion: the Supabase schema is deployable but the client cannot correctly write to (or read from) it. The two data models are parallel, not connected.**

---

## 2. Data flow

### Import → state → persistence → render

1. **File parse**: `ImportDialog` accepts `.csv/.xlsx/.xls` via drop zone or picker (`src/components/board/ImportDialog.tsx:21,86-124`); `parseFile` reads CSV as text / Excel as ArrayBuffer through SheetJS, first sheet only, row 0 = headers (`src/lib/sheet-parser.ts:12-33`).
2. **Column mapping**: `autoDetectMapping` matches header substrings (姓名/name…, 角色/role…, 位置/area…) with positional fallback 0/1/2 (`src/lib/board-import.ts:10-30`); user can override via three `<select>`s (`ImportDialog.tsx:209-226`), with a 5-row preview that flags unmatched areas as 未分派 (`ImportDialog.tsx:230-287`).
3. **Mapping → people**: `mapRowsToPeople` drops empty-name rows, defaults role to `"未設定"`, validates area against `ALL_AREAS_SET` (unknown → `null`), cycles 6 pastel colors, mints `crypto.randomUUID()` (`board-import.ts:32-54`).
4. **Load**: `Board.handleImport` either replaces state directly via `loadPeople` or, if 動畫播放模式 checked, loads everyone unassigned and queues playback steps (`src/components/board/Board.tsx:152-165`). **Import never writes to Supabase** — `loadPeople` is a pure `setPeople` (`useBoard.ts:234-237`).
5. **Persist**: any `people` change is debounce-saved (500 ms) to localStorage key `or-whiteboard-board` (`useBoard.ts:60-69`, `src/lib/board-storage.ts:3,18-21`).
6. **Initial load**: localStorage if non-empty, else `DEMO_PEOPLE` (`useBoard.ts:72-81`). **Never loads from Supabase.**
7. **Render**: `Board` lays out a fixed 4-column grid — fixed tasks / `RoomGrid` (R1–R31, auto-fill 110px) / `ShiftColumns` / `SpecialAreaPanel` — plus Leader strip in the header and `UnassignedPool` at the bottom (`Board.tsx:276-377`, `RoomGrid.tsx:27`). DnD: `DndContext` with mouse/touch/keyboard sensors (`Board.tsx:70-74`), droppable `AreaBox` per area (`AreaBox.tsx:30-33`), draggable `PersonCard` (`PersonCard.tsx:95-99`), drop → `movePerson(personId, areaName)` (`Board.tsx:112-132`); area id `"未分派"` maps to `null` (`Board.tsx:42,122-123`). Optimistic update + 300 ms-debounced Supabase upsert with rollback-on-error (`useBoard.ts:106-131,160-167`). Fit-to-screen wall-display mode computes a CSS `zoom` factor (`Board.tsx:246-265,279`).

### Auth flow

- `useAuth`: Supabase email/password (`signInWithPassword`, `src/hooks/useAuth.ts:92-108`), session fetch on mount + `onAuthStateChange` subscription (`useAuth.ts:44-90`), role read from `user_metadata.role` → `editor`/`viewer`, default `viewer` (`useAuth.ts:31-35`). Shared app-wide via `AuthProvider` context (`src/components/auth/AuthProvider.tsx:6-17`).
- `AuthGuard`: demo mode bypasses entirely (`AuthGuard.tsx:67`); otherwise unauthenticated users get an **inline** `LoginPrompt` (`AuthGuard.tsx:13-62,77`) — it does not redirect to `/login`.
- `/login` page is a second, duplicate login form (`src/app/login/page.tsx`) that nothing links to (no `"/login"` reference anywhere in src) — reachable only by typing the URL; it self-redirects to `/` when unconfigured or authenticated (`login/page.tsx:15-20`).
- Role enforcement client-side: non-editors get no DnD sensors, no toolbar, a 唯讀模式 banner, no remove/context-menu (`Board.tsx:269,316-332,94,146-149`). Server-side: RLS `is_editor()` reads the same JWT `user_metadata.role` (`supabase/migrations/002_rls_policies.sql:6-12`); reads for any authenticated user, writes editor-only (`002:15-28`); `audit_log` select editor-only, insert any authenticated (`002:31-32`).

### Audit flow

- Every `movePerson` / `addPerson` / `removePerson` calls `logAuditEntry` *before* mutating (`useBoard.ts:144-158,181-187,206-215`), classifying assign/unassign/reassign/add_person/remove_person.
- `logAuditEntry` always appends to a **module-level in-memory array** (lost on refresh), and if Supabase is configured also fire-and-forgets an insert into `audit_log` with errors swallowed (`audit-client.ts:15-32`).
- Read path: clicking a `PersonCard` opens `HistoryDrawer` (`Board.tsx:140-142,387`), which uses `useAuditLog(personId)`: Supabase-configured → query `audit_log` by `person_id` desc, merge with local entries via a 1-second-timestamp+action dedupe heuristic, fall back to local on error (`useAuditLog.ts:23-84`); unconfigured → local log only (`useAuditLog.ts:81-84`). DB rows come back with empty `personName` (`useAuditLog.ts:52`).
- Drawer's "Export CSV" button exports the **entire in-memory log for all people** (not the displayed person, not DB history) (`src/components/board/HistoryDrawer.tsx:72-81`, `audit-client.ts:47-60`).

### Playback flow (animated demo)

- Import with 動畫播放模式 → everyone loaded unassigned, `generatePlaybackSteps` builds steps with 300–800 ms randomized delays (`src/hooks/useDemoPlayback.ts:23-30`, `Board.tsx:155-160`).
- Auto-start via a render-time ref check + `queueMicrotask(playback.play)` (`Board.tsx:187-194`).
- `useDemoPlayback` runs a self-rescheduling `setTimeout` chain (`useDemoPlayback.ts:60-81`); each step calls `movePerson(person.id, person.area)` (`Board.tsx:167-174`) — so steps flow through the normal audit + persistence path.
- `PlaybackBar` shows progress %, current person, pause/resume/stop (`src/components/board/PlaybackBar.tsx:27-73`, mounted `Board.tsx:300-314`).

---

## 3. Feature inventory

| Feature | Status | Evidence |
|---|---|---|
| Drag-and-drop assignment (mouse/touch/keyboard, a11y live region) | **Complete** (local) | `Board.tsx:70-74,92-137,382-386`; `PersonCard.tsx:95-139`; `AreaBox.tsx:30-42` |
| Board layout: Leader strip, fixed tasks, R1–R31 grid, 3 shift groups, special areas, unassigned pool | **Complete** | `Board.tsx:282-377`; `RoomGrid.tsx`; `ShiftColumns.tsx`; `SpecialAreaPanel.tsx`; `UnassignedPool.tsx` |
| Search filter (name/role/area) with "+N hidden" badges per area | **Complete** | `useBoard.ts:248-257`; `Board.tsx:209-237`; `AreaBox.tsx:57-59` |
| Add person (toolbar input) | **Complete locally / broken DB sync** | `BoardToolbar.tsx:29-64`; `useBoard.ts:172-203` — DB insert never links returned id |
| Remove person (right-click context menu) | **Complete locally / DB soft-delete is a no-op** | `PersonCard.tsx:37-114`; `useBoard.ts:205-232` — `update is_active=false` matches no row (local id ≠ DB id) |
| Reset board (重置) | **Complete** | `BoardToolbar.tsx:115-118`; `Board.tsx:239-243`; `useBoard.ts:239-244` |
| **Save button (儲存)** | **Stub — does nothing** | `onClick={() => {}}` `BoardToolbar.tsx:119-122` |
| CSV/XLSX import with auto column mapping, manual override, 5-row preview, area validation | **Complete** | `ImportDialog.tsx`; `sheet-parser.ts`; `board-import.ts` |
| Export CSV (UTF-8 BOM) / XLSX | **Complete** | `board-export.ts:4-50`; `Board.tsx:196-206`; `BoardToolbar.tsx:72-114` |
| Animated playback of imported schedule (pause/resume/stop, progress) | **Complete** | `useDemoPlayback.ts`; `PlaybackBar.tsx`; `Board.tsx:152-194` |
| Per-person audit history drawer | **Partial** | Works in demo (in-memory only, lost on refresh); DB path queries by local UUID that never matches DB rows (`useAuditLog.ts:27-28`); drawer export ignores person filter (`HistoryDrawer.tsx:73`) |
| localStorage persistence | **Complete** | `board-storage.ts`; `useBoard.ts:60-81` |
| Supabase persistence (assignments/people/audit writes) | **Wired but broken** | Writes send area *names* into UUID FK columns and client-only person ids — see §1. Upsert/insert/update at `useBoard.ts:119-120,193-194,221-223`; `audit-client.ts:21-32` |
| Supabase **read**/initial load of board | **Missing entirely** | Only `.select()` in app is audit_log (`useAuditLog.ts:27`); board never fetched from DB |
| Supabase Realtime | **Subscription exists, sync doesn't** | Subscribes to `assignments` postgres_changes but the handler only does `setLastSyncedAt(new Date())` — no refetch, no state apply (`useBoard.ts:84-103`). Publication is configured DB-side (`001:54`). Multi-display live sync **does not work** |
| Sync status indicator | **Complete (cosmetic)** | `SyncIndicator.tsx:21-55`; yellow "Offline mode" when unconfigured |
| Auth (login, session, role editor/viewer) | **Complete** | `useAuth.ts`; `AuthGuard.tsx`; RLS `002_rls_policies.sql` |
| Viewer read-only mode | **Complete** | `Board.tsx:269,316-332` |
| `/login` route | **Dead/duplicate** | Unreferenced; AuthGuard renders its own inline form instead (`AuthGuard.tsx:77`) |
| Demo mode (no Supabase, auto-editor) | **Complete** | `supabase-client.ts:13-15`; `useAuth.ts:25-29,38-40`; `AuthGuard.tsx:67` |
| Fit-to-screen wall display zoom | **Complete** (uses non-standard CSS `zoom`) | `Board.tsx:246-265,279,290-297` |
| Tests | Unit suite present (vitest, 13 test files); e2e is a single smoke test (`e2e/board.spec.ts:3-6`) | `package.json:10-12` |

Unused DB features: `assignments.version` (optimistic-concurrency column, `001:30`) and `updated_by` (always sent `null`, `useBoard.ts:116`) are never used by any client code.

---

## 4. What persists where, and env-var behavior

### Persistence

- **localStorage** — single key `or-whiteboard-board` = JSON `BoardPerson[]` (`board-storage.ts:3-21`). This is the **only working persistence**, always active (even with Supabase configured), debounced 500 ms.
- **In-memory** — `localAuditLog` array in `audit-client.ts:15`; lost on refresh.
- **Supabase tables** — `areas`, `people`, `assignments`, `audit_log` (`001_initial_schema.sql`), seeded by `seed.sql`. Client write attempts: `assignments` upsert, `people` insert/update, `audit_log` insert — all malformed per §1. Nothing else is ever stored (no Supabase storage, no cookies).

### Env matrix (`.env.example:1-5`; logic in `supabase-client.ts:4-15`)

| Env state | Behavior |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `ANON_KEY` set | `supabase` client created, `isSupabaseConfigured=true`, `isDemoMode=false` regardless of `DEMO_MODE` (`supabase-client.ts:13-15`). Login required (AuthGuard inline form). Board still loads from localStorage only; writes fire and **fail** (UUID mismatch) → moves roll back with `移動失敗:` errors (`useBoard.ts:121-127`) |
| Only `NEXT_PUBLIC_DEMO_MODE=true` (current `.env.local` — it contains exactly this one key) | `supabase=null`, demo mode: auto-auth as editor `demo@local` (`useAuth.ts:25-29`), AuthGuard bypassed, all Supabase branches skipped, SyncIndicator "Offline mode", audit in-memory only. **This is the mode the app actually works in** |
| Nothing set | Not configured, not demo → `AuthGuard` shows LoginPrompt, but `login()` early-returns when unconfigured (`useAuth.ts:94`) — **soft-locked**: the form silently does nothing |

Note: env loss does **not** crash, because the live client is the null-safe `supabase-client.ts`; the crash-prone variant (`supabase.ts`, non-null `!` assertions at `supabase.ts:4-5`) is dead code (next item).

---

## 5. Dead code, unused exports, debug artifacts

- **`src/lib/supabase.ts`** (whole file) — duplicate Supabase client with `!` env assertions; imported by **nothing** (grep over src/e2e/scripts: zero hits). Would throw at import time without env. Superseded by `supabase-client.ts`.
- **`src/components/board/index.ts`** barrel — never imported (page imports `@/components/board/Board` directly, `page.tsx:3`; Board uses relative imports).
- **`src/components/ui/card.tsx`** (103 lines) — zero imports anywhere.
- **`BoardToolbar` 儲存 (Save) button** — `onClick={() => {}}` stub (`BoardToolbar.tsx:119-122`); misleading UI since saving is actually automatic.
- **`getLocalAuditLog`, `clearLocalAuditLog`** (`audit-client.ts:35-37,43-45`) — used only by tests, never by app code.
- **`src/app/login/page.tsx`** — functionally dead duplicate of AuthGuard's LoginPrompt; no route/link points at it.
- **Debug artifacts**: 18 `screenshot-*.png` files at repo root (720p/1080p/4K/scroll-debug iterations) and 8 one-off Playwright scripts in `scripts/` (`debug-scroll.mjs`, `screenshot*.mjs`, `run-demo.mjs`) — leftovers from the wall-display layout debugging visible in git history.
- **`assignments.version` / `updated_by`** — schema affordances with no client implementation (see §3).
- Minor smells: module-level `colorIndex` in `useBoard.ts:36` (color sequence shared across hook instances/HMR, never reset by `resetBoard`); `(supabase.from(...) as any)` casts in three files acknowledging a typing workaround (`useBoard.ts:118-119,192-193,220-221`, `audit-client.ts:22-23`, `useAuditLog.ts:26`); render-phase side effect for playback auto-start (`Board.tsx:188-194`); no `console.log`/`debugger` statements in src.

### Bottom line

A polished, fully functional **local-only** whiteboard (localStorage + demo mode) with a complete but **disconnected** Supabase backend: schema, RLS, seed, auth, and realtime publication all exist, and the client has write calls and a realtime subscription — but writes use names/local-ids against UUID FK columns, there is no initial fetch or name→UUID resolution, and the realtime handler only updates a timestamp. Bridging the client model to the DB (id mapping + initial load + realtime apply) is the missing layer.
