# OR Whiteboard — Hospital Deployment Readiness Assessment

**TL;DR:** This is a polished single-browser demo, not yet a multi-client system. The Supabase layer exists in schema but the write path is broken (name strings sent to UUID FK columns), realtime never applies remote changes, and localStorage is the actual source of truth. The board has no concept of date. A viewer can self-escalate to editor via `user_metadata`. None of these are huge fixes individually, but together they mean no two screens currently show the same data.

---

## 1. Multi-client sync — **BROKEN (illusion of sync)**

**Current state:**
- A realtime subscription exists, but its callback only updates a timestamp — it never refetches or applies remote data: `useBoard.ts:84-103` (`() => { setLastSyncedAt(new Date()); }`).
- There is **no initial fetch from Supabase anywhere**. Board state loads from localStorage or hardcoded demo people: `useBoard.ts:72-81`. The only `.select()` in the entire app is for the audit log (`useAuditLog.ts:27`).
- The write path cannot succeed against the real schema: `persistMove` sends `area_id: targetArea` where `targetArea` is an area *name* string like `"R1"` (`useBoard.ts:112-120`), but `assignments.area_id` is a `UUID REFERENCES areas(id)` (`001_initial_schema.sql:28`). Same for `person_id`: client-generated `crypto.randomUUID()` (`useBoard.ts:174`, `board-import.ts:47`) that never exists in `people` — `addPerson` inserts without an id, letting the DB mint a different one (`useBoard.ts:193-194`). Every upsert is an FK/type error.
- Debounce bug compounds it: `persistMove` shares one timer regardless of arguments (`use-debounce.ts:26-32`), so moving person A then person B within 300ms silently drops A's write.
- Bulk import never persists at all — `loadPeople` is local-only (`useBoard.ts:234-237`).
- The "儲存" (Save) toolbar button is a no-op: `BoardToolbar.tsx:119-122` (`onClick={() => {}}`).

**Why it matters:** The core product promise — wall display reflects what the nurse station edits — does not work. The wall shows whatever was in *its own* localStorage. The green "Synced" dot (`SyncIndicator.tsx:35-39`) actively misleads staff into trusting stale data, which in an OR is a patient-safety issue.

**Effort: L** — requires an ID-resolution layer (name→UUID for areas, DB-backed people IDs), initial fetch, realtime payload application, and per-person write queueing.

## 2. Date/shift handling — **MISSING**

**Current state:**
- Schema supports it: `assignments.board_date DATE` with `UNIQUE(person_id, board_date)` (`001_initial_schema.sql:29,33`). The UI does not: localStorage payload is a bare `BoardPerson[]` with no date (`board-storage.ts:18-21`), so today's board silently persists forever past midnight.
- No date picker, no "tomorrow" view, no day rollover — nothing references `board_date` on read anywhere.
- Timezone bug in the (already broken) write path: `new Date().toISOString().slice(0, 10)` (`useBoard.ts:110`) is UTC. In Taiwan (UTC+8), edits between 00:00–08:00 local stamp the *previous* day.

**Why it matters:** A charge nurse plans tomorrow's assignments the afternoon before. With no date dimension, importing tomorrow's 班表 destroys today's live board. At 07:00 the wall still shows yesterday's staff.

**Effort: M** — date selector + date-keyed storage/queries; rollover display logic. (Schema already done.)

## 3. Data durability — **localStorage is the database**

**Current state:**
- Source of truth is `localStorage["or-whiteboard-board"]` (`board-storage.ts:3-21`), debounced-saved on every change (`useBoard.ts:61-69`). DB writes fail silently (see §1) or are rolled back per-row.
- Clearing browser data, a kiosk OS reset, or Windows update = board gone, falls back to 6 hardcoded demo people (`useBoard.ts:74-77`, `board-constants.ts:85-128`).
- "重置" resets to demo people with no confirmation dialog (`useBoard.ts:239-244`, wired at `Board.tsx:239-243`).
- Audit history in demo/error mode is an in-memory array lost on refresh (`audit-client.ts:15`).

**Why it matters:** A wall kiosk that auto-clears cache on reboot loses the entire day's assignments and displays fake demo names (王小明 et al.) to OR staff — worse than a blank screen.

**Effort: M** — falls out of fixing §1; plus a guarded reset.

## 4. Import workflow — **good UX shell, thin validation**

**Current state:**
- Solid for a demo: auto-detect of name/role/area columns with zh-TW + English patterns (`board-import.ts:10-30`), manual remapping selects, 5-row preview with per-cell match indicators (`ImportDialog.tsx:230-287`), match-count summary (`ImportDialog.tsx:301-306`), BOM-safe CSV decode (`sheet-parser.ts:15-18`, commit `bf8f434`).
- Gaps:
  - Unmatched areas silently become unassigned (`board-import.ts:43`); the warning is only visible for the first 5 preview rows (`ImportDialog.tsx:128`) — row 40's typo `"R32"` imports without anyone noticing. No post-import report of unmatched values, no fuzzy/alias matching (e.g. `R01` vs `R1`, full-width characters).
  - Auto-detect failure falls back to positional columns 0/1/2 (`Math.max(findCol(...), 0|1|2)`, `board-import.ts:26-28`) — a sheet with different column order silently mis-maps.
  - No duplicate handling: the same name twice produces two cards (`mapRowsToPeople` has no dedup, `board-import.ts:37-53`).
  - Import **replaces the entire current board with no confirmation** (`Board.tsx:152-165` → `loadPeople` → `setPeople`, `useBoard.ts:234-237`), and is never persisted to the DB.
  - Only the first sheet of a workbook is read (`sheet-parser.ts:23`); real hospital 班表 files are usually multi-sheet/matrix-shaped (date columns × staff rows), not the 3-column long format this assumes.

**Why it matters:** Import is the daily entry point. Silent data loss (unmatched areas, replaced board) erodes trust fastest.

**Effort: S** for validation report + confirm-replace + dedup; **M-L** for matrix-format 班表 parsing.

## 5. Wall-display concerns — **several gaps**

**Current state:**
- **No auto-refresh / recovery:** data is fetched exactly once (from localStorage); no polling, no `visibilitychange`/reconnect handler anywhere (grep across `src/` returns nothing). The realtime `.subscribe()` ignores its status callback (`useBoard.ts:98`) — a dropped websocket is never detected or surfaced.
- **Stale sync indicator:** `formatRelativeTime` is computed inside a `useMemo` keyed only on props (`SyncIndicator.tsx:22-45`) — "5s ago" stays frozen until the next event, so the display can't distinguish "fresh" from "disconnected for 3 hours."
- **Font size at distance:** person name is `text-xs` and role is `text-[10px]` (`PersonCard.tsx:128,142`); section headers `text-xs`/`text-sm` (`Board.tsx:345`, `RoomGrid.tsx:26`). The screenshot (`screenshot-real.png`) confirms cards are unreadable beyond ~1.5m on a 720p TV. Git history shows the layout was tuned to *fit* 720p, which drove fonts down, not up.
- **Kiosk/auth:** viewer mode still requires interactive email/password login (`AuthGuard.tsx:64-79`); when the Supabase session eventually fails to refresh (network blip overnight), the wall strands on a login form. No `/display` token-based kiosk route, no fullscreen mode.
- **Fit-to-screen** is a manual toggle using non-standard CSS `zoom` (`Board.tsx:246-265,279`), not persisted across reloads.
- **Burn-in:** static white `bg-slate-100` layout (`Board.tsx:278`) with fixed grid lines, no pixel-shift or dark mode.

**Why it matters:** A wall display that requires a human with a keyboard after every reboot/network blip is not deployable. Readability is the product.

**Effort: S** each for reconnection+refetch-on-focus, live sync clock, larger viewer-mode typography; **M** for a kiosk route.

## 6. Operational features (charge-nurse expectations) — **ABSENT**

**Current state:** The data model is exactly `{id, name, role, color, area}` (`board-constants.ts:1-7`). `AreaBox` renders a title and headcount only. There are no tables, fields, or UI for room status (麻醉中/手術中/清潔中/Ready), case/procedure info, scheduled vs actual times, per-room notes, or relief/break tracking (`001_initial_schema.sql` has only areas/people/assignments/audit_log).
- Conflict warnings: the model makes one-person-in-two-rooms impossible per card (single `area` field), but nothing prevents two cards with the same name (no unique constraint — `001_initial_schema.sql:15-22`; no client check), which is exactly how a double-booking would manifest after import.

**Why it matters:** This determines whether the board replaces the physical whiteboard or merely duplicates the roster sheet. Room status is typically the first thing charge nurses ask for. Notes-per-room and duplicate-name warnings are cheap wins.

**Effort: S** for duplicate-name warning + per-room note field; **M** for room status lifecycle; **L** for case info/time tracking (borders on EHR territory — scope decision needed).

## 7. Auth/roles — **works, but with a privilege-escalation hole**

**Current state:**
- Editor/viewer distinction is real and enforced both in UI (`Board.tsx:60,269,316-332` — sensors disabled, toolbar hidden, 唯讀模式 banner) and in RLS (`002_rls_policies.sql:15-28`).
- **Critical flaw:** `is_editor()` reads `auth.jwt() -> 'user_metadata' ->> 'role'` (`002_rls_policies.sql:8-11`), and the client mirrors it (`useAuth.ts:31-35`). In Supabase, `user_metadata` (`raw_user_meta_data`) is **self-service writable** via `supabase.auth.updateUser({ data: { role: 'editor' } })`. Any viewer can promote themselves to editor with one console call. Roles must live in `app_metadata` or a `profiles` table.
- `audit_log` insert allows any authenticated user with no check that `user_id` matches the JWT (`002_rls_policies.sql:32`) — audit entries are spoofable; and the client sends `user_id: null` anyway (`useBoard.ts:116`, `audit-client.ts:29`), so the audit trail never records *who*.
- Demo mode silently grants editor with no auth (`useAuth.ts:25-29`, `AuthGuard.tsx:67`) — fine for dev, dangerous if the env var leaks to prod.

**Why it matters:** The audit log is the feature a hospital asks about in procurement; right now it neither attributes actions nor resists tampering, and the role boundary is cosmetic.

**Effort: S** — move role to `app_metadata`, fix `is_editor()`, pass the real `user_id`, add `WITH CHECK (user_id = auth.uid())`.

## 8. i18n / locale / print-export — **inconsistent**

**Current state:**
- UI is zh-TW but with stray English: "Loading...", "No history entries yet", "Export CSV" (`HistoryDrawer.tsx:120,123,146`), "Offline mode"/"Synced Xs ago"/"Not synced" (`SyncIndicator.tsx:13-44`), screen-reader announcements all English (`Board.tsx:98,107,117,383`), fit button "Fit ON" (`Board.tsx:295`).
- `<html lang="en">` (`layout.tsx:28`) and only Latin font subsets loaded (`layout.tsx:6-14`) — CJK renders in fallback system fonts (visible in screenshot), suboptimal on a wall display.
- CSV export correctly prepends a UTF-8 BOM (verified bytes `EF BB BF` at `board-export.ts:46`) — Excel-safe. But the audit-log CSV export omits the BOM (`HistoryDrawer.tsx:74`) → garbled Chinese in Excel.
- Export carries no date inside the file (only the filename, `Board.tsx:198-199`) and no print stylesheet exists anywhere (no `@media print` / `print:` classes in `src/`). Charge nurses routinely need a paper fallback.

**Why it matters:** Mostly polish, but the audit-CSV mojibake and missing print view will surface in week one of real use.

**Effort: S** across the board.

---

## Top 8 by value-to-effort

| # | Gap | Why first | Effort |
|---|-----|-----------|--------|
| 1 | **Fix role escalation: move role to `app_metadata` + fix `is_editor()`** (`002_rls_policies.sql:8-11`) | Security hole; ~20 lines of SQL + auth admin change | S |
| 2 | **Fix the Supabase write path (name→UUID resolution, DB-owned person IDs) + initial fetch from DB** (`useBoard.ts:110-120,72-81`) | Unblocks everything: sync, durability, audit. Nothing else matters until writes succeed | L (the one unavoidable big rock) |
| 3 | **Apply realtime payloads to state (or refetch on event) + refetch on reconnect/`visibilitychange`** (`useBoard.ts:93-96`) | Cheap once #2 lands; delivers the actual product promise | S after #2 |
| 4 | **Per-person write queue (fix shared debounce drop)** (`use-debounce.ts:26-32`, `useBoard.ts:106-131`) | Silent data loss on rapid edits; small targeted fix | S |
| 5 | **Date-keyed board + date picker + UTC+8 fix** (`useBoard.ts:110`, `board-storage.ts`) | Enables tomorrow-planning and midnight correctness; schema already supports it | M |
| 6 | **Import hardening: full unmatched-area report, dedup warning, confirm-before-replace, persist to DB** (`board-import.ts:43`, `Board.tsx:152-165`) | Daily entry point; mostly UI work on an existing dialog | S–M |
| 7 | **Kiosk hardening: viewer typography scale-up, live sync-age clock, larger fonts, fullscreen/display route** (`PersonCard.tsx:128,142`, `SyncIndicator.tsx:22-45`, `AuthGuard.tsx:64-79`) | The wall display is the product surface; each item small | S–M |
| 8 | **Audit attribution: real `user_id` in writes + `WITH CHECK (user_id = auth.uid())` + BOM on audit CSV** (`useBoard.ts:116`, `002_rls_policies.sql:32`, `HistoryDrawer.tsx:74`) | Makes the compliance feature actually compliant | S |

Deliberately deferred: room status lifecycle and case info (§6, M–L) — high value but needs a product conversation about whether this board stays a staffing tool or becomes a case-tracking surface; building it before sync works would be sequencing backwards.

**Key files:** `C:\Users\exvsy\or-whiteboard\src\hooks\useBoard.ts`, `C:\Users\exvsy\or-whiteboard\src\lib\board-storage.ts`, `C:\Users\exvsy\or-whiteboard\src\lib\use-debounce.ts`, `C:\Users\exvsy\or-whiteboard\src\lib\audit-client.ts`, `C:\Users\exvsy\or-whiteboard\src\lib\board-import.ts`, `C:\Users\exvsy\or-whiteboard\src\components\board\Board.tsx`, `C:\Users\exvsy\or-whiteboard\src\components\board\ImportDialog.tsx`, `C:\Users\exvsy\or-whiteboard\src\components\board\SyncIndicator.tsx`, `C:\Users\exvsy\or-whiteboard\src\components\board\BoardToolbar.tsx`, `C:\Users\exvsy\or-whiteboard\supabase\migrations\001_initial_schema.sql`, `C:\Users\exvsy\or-whiteboard\supabase\migrations\002_rls_policies.sql`
