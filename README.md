# 手術室人力白板 (OR Staffing Whiteboard)

A wall-display staffing whiteboard for a hospital anesthesia department:
drag-and-drop assignment of nurse anesthetists across 31 ORs, fixed tasks,
12-20/小夜/大夜 shift slots, endoscopy/health-check areas, PACU, and case
management — with per-date boards, CSV/Excel 班表 import, room status
tracking, break/relief marking, realtime multi-screen sync (Supabase), and a
server-generated audit trail.

## Quick start (demo mode)

```bash
npm install
npm run dev        # http://localhost:3000
```

With `NEXT_PUBLIC_DEMO_MODE=true` (the default in `.env.local`) the app runs
without a backend: you are auto-signed-in as an editor and the board persists
to `localStorage`, keyed per date.

## Production mode (Supabase)

1. Create a Supabase project, then set in `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

   (Remove `NEXT_PUBLIC_DEMO_MODE` or set it to anything but `true`.)

2. Apply migrations and seed in order:

   ```bash
   npx supabase db push          # applies supabase/migrations/001..004
   # then run supabase/seed.sql in the SQL editor (areas + sample people)
   ```

3. Create users and grant roles. **Roles live in `app_metadata`** (admin-only;
   `user_metadata` is self-service-writable and must never carry roles):

   ```js
   // server-side / dashboard Admin API
   await supabase.auth.admin.updateUserById(userId, {
     app_metadata: { role: "editor" },   // or "viewer"
   });
   ```

   Users without a role are viewers (read-only board, no toolbar).

4. Wall displays sign in with a viewer account. The board auto-refetches on
   reconnect, tab focus, realtime events, and a 60s polling safety net.

### Data model

- `areas` — the 67 assignable locations (seeded; names mirror
  `src/lib/board-constants.ts`)
- `people` — staff roster (DB-generated UUIDs are the canonical ids)
- `assignments` — one row per person per `board_date`; `area_id NULL` =
  on-roster but unassigned; `status` = `assigned | break | relief`
- `area_status` — live room lifecycle (`idle/induction/surgery/cleaning/ready`)
  plus a free-text note per area
- `audit_log` — written **only** by `SECURITY DEFINER` triggers on
  `assignments`, attributed to `auth.uid()`; clients cannot insert/forge rows
- `replace_board(date, people)` — atomic 班表 import RPC (diff-style, so the
  audit trail records real reassignments)

## 班表 import format

First worksheet row = headers; columns are auto-detected (姓名/name,
角色/role/職稱, 位置/area/刀房…) and can be remapped in the dialog. Area names
are matched mechanically (full-width→half-width, case, `R01`→`R1`); anything
that doesn't match a known area imports as 未分派 and is listed in the
pre-import report. CSV files may be UTF-8 (with/without BOM), UTF-16, or Big5.

## Scripts

| Command             | Purpose                       |
| ------------------- | ----------------------------- |
| `npm run dev`       | dev server                    |
| `npm run build`     | production build              |
| `npm run test:run`  | vitest unit/component tests   |
| `npm run test:e2e`  | Playwright e2e                |
| `npm run lint`      | eslint                        |
| `npm run typecheck` | tsc --noEmit                  |
