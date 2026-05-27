ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_editor()
RETURNS BOOLEAN AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'editor',
    false
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Areas: authenticated read, editors write
CREATE POLICY "areas_select" ON areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "areas_insert" ON areas FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "areas_update" ON areas FOR UPDATE TO authenticated USING (is_editor());

-- People: authenticated read, editors write
CREATE POLICY "people_select" ON people FOR SELECT TO authenticated USING (true);
CREATE POLICY "people_insert" ON people FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "people_update" ON people FOR UPDATE TO authenticated USING (is_editor());

-- Assignments: authenticated read, editors write
CREATE POLICY "assignments_select" ON assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignments_insert" ON assignments FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "assignments_update" ON assignments FOR UPDATE TO authenticated USING (is_editor());
CREATE POLICY "assignments_delete" ON assignments FOR DELETE TO authenticated USING (is_editor());

-- Audit log: editors read, any authenticated insert
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT TO authenticated USING (is_editor());
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
