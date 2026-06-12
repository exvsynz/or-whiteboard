-- Board features:
--  1. assignments.status — duty status per card (break/relief tracking).
--  2. area_status — live operational state + note per area (room lifecycle
--     on the wall display).
--  3. replace_board() — atomic 班表 import: resolves people by name,
--     replaces one date's roster as a diff (so the audit trail records
--     real reassignments instead of a delete/insert flood).
--  4. people + area_status added to the realtime publication so other
--     clients converge.

ALTER TABLE assignments
  ADD COLUMN status TEXT NOT NULL DEFAULT 'assigned'
  CHECK (status IN ('assigned', 'break', 'relief'));

CREATE TABLE area_status (
  area_id UUID PRIMARY KEY REFERENCES areas(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'induction', 'surgery', 'cleaning', 'ready')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE area_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "area_status_select" ON area_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "area_status_insert" ON area_status
  FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "area_status_update" ON area_status
  FOR UPDATE TO authenticated USING (is_editor());
CREATE POLICY "area_status_delete" ON area_status
  FOR DELETE TO authenticated USING (is_editor());

CREATE OR REPLACE FUNCTION set_area_status_meta()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_area_status_meta
  BEFORE INSERT OR UPDATE ON area_status
  FOR EACH ROW EXECUTE FUNCTION set_area_status_meta();

ALTER PUBLICATION supabase_realtime ADD TABLE area_status;
ALTER PUBLICATION supabase_realtime ADD TABLE people;

-- Atomic import. p_people: [{ name, role, color, area }] where area is an
-- area NAME or null. Duplicate names within one import map to the N oldest
-- active people of that name (stable across re-imports), creating rows as
-- needed. Returns the resolved roster with DB person ids so the client can
-- adopt them.
CREATE OR REPLACE FUNCTION replace_board(p_board_date DATE, p_people JSONB)
RETURNS JSONB AS $$
DECLARE
  entry JSONB;
  v_name TEXT;
  v_role TEXT;
  v_color TEXT;
  v_area_name TEXT;
  v_person_id UUID;
  v_area_id UUID;
  v_occurrence INT;
  v_seen JSONB := '{}'::jsonb;
  v_keep UUID[] := '{}';
  v_result JSONB := '[]'::jsonb;
BEGIN
  IF NOT is_editor() THEN
    RAISE EXCEPTION 'permission denied: editor role required';
  END IF;

  IF p_people IS NULL OR jsonb_typeof(p_people) <> 'array' THEN
    RAISE EXCEPTION 'p_people must be a JSON array';
  END IF;

  FOR entry IN SELECT * FROM jsonb_array_elements(p_people) LOOP
    v_name := trim(entry->>'name');
    CONTINUE WHEN v_name IS NULL OR v_name = '';
    v_role := nullif(trim(coalesce(entry->>'role', '')), '');
    v_color := nullif(trim(coalesce(entry->>'color', '')), '');
    v_area_name := nullif(trim(coalesce(entry->>'area', '')), '');

    v_occurrence := coalesce((v_seen->>v_name)::int, 0) + 1;
    v_seen := jsonb_set(v_seen, ARRAY[v_name], to_jsonb(v_occurrence));

    SELECT id INTO v_person_id FROM people
      WHERE name = v_name AND is_active
      ORDER BY created_at, id
      OFFSET v_occurrence - 1 LIMIT 1;

    IF v_person_id IS NULL THEN
      INSERT INTO people (name, role, color)
      VALUES (v_name, coalesce(v_role, '未設定'), coalesce(v_color, 'bg-amber-100'))
      RETURNING id INTO v_person_id;
    ELSE
      UPDATE people
        SET role = coalesce(v_role, role), color = coalesce(v_color, color)
        WHERE id = v_person_id;
    END IF;

    v_area_id := NULL;
    IF v_area_name IS NOT NULL THEN
      SELECT id INTO v_area_id FROM areas WHERE name = v_area_name;
    END IF;

    INSERT INTO assignments (person_id, area_id, board_date)
    VALUES (v_person_id, v_area_id, p_board_date)
    ON CONFLICT (person_id, board_date)
      DO UPDATE SET area_id = EXCLUDED.area_id;

    v_keep := array_append(v_keep, v_person_id);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'person_id', v_person_id,
      'name', v_name,
      'role', coalesce(v_role, '未設定'),
      'color', coalesce(v_color, 'bg-amber-100'),
      'area', v_area_name
    ));
  END LOOP;

  -- People absent from the import leave this date's roster (audited by the
  -- assignments DELETE trigger as remove_person).
  DELETE FROM assignments
    WHERE board_date = p_board_date
      AND NOT (person_id = ANY (v_keep));

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
