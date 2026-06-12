-- Security hardening:
--  1. Roles move from user_metadata (self-service writable via
--     supabase.auth.updateUser -> privilege escalation) to app_metadata
--     (admin-only). Existing editors must be re-granted via the dashboard
--     or admin API: auth.admin.updateUserById(id, { app_metadata: { role: 'editor' } })
--  2. Audit log becomes server-generated (triggers), so it cannot be
--     spoofed or skipped by clients, and always records auth.uid().
--  3. assignments.updated_at / updated_by / version are stamped server-side.

CREATE OR REPLACE FUNCTION is_editor()
RETURNS BOOLEAN AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor',
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Audit rows are written exclusively by the SECURITY DEFINER trigger below;
-- clients can no longer insert (previous policy was WITH CHECK (true), which
-- allowed any authenticated user to forge entries).
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;

-- History is staffing data, not clinical data: let viewers read it too
-- (the HistoryDrawer is reachable in read-only mode).
DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
CREATE POLICY "audit_log_select" ON audit_log
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION set_assignment_meta()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_assignments_meta ON assignments;
CREATE TRIGGER trg_assignments_meta
  BEFORE INSERT OR UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION set_assignment_meta();

-- Assignment lifecycle -> audit trail, attributed to auth.uid():
--   INSERT with area      -> assign
--   INSERT without area   -> add_person (joined the roster unassigned)
--   UPDATE area change    -> assign / unassign / reassign
--   DELETE                -> remove_person (left the date's roster)
CREATE OR REPLACE FUNCTION log_assignment_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, person_id, from_area_id, to_area_id, action_type)
    VALUES (
      auth.uid(), NEW.person_id, NULL, NEW.area_id,
      CASE WHEN NEW.area_id IS NULL THEN 'add_person' ELSE 'assign' END
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.area_id IS DISTINCT FROM OLD.area_id THEN
      INSERT INTO audit_log (user_id, person_id, from_area_id, to_area_id, action_type)
      VALUES (
        auth.uid(), NEW.person_id, OLD.area_id, NEW.area_id,
        CASE
          WHEN OLD.area_id IS NULL THEN 'assign'
          WHEN NEW.area_id IS NULL THEN 'unassign'
          ELSE 'reassign'
        END
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, person_id, from_area_id, to_area_id, action_type)
    VALUES (auth.uid(), OLD.person_id, OLD.area_id, NULL, 'remove_person');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_assignments_audit ON assignments;
CREATE TRIGGER trg_assignments_audit
  AFTER INSERT OR UPDATE OR DELETE ON assignments
  FOR EACH ROW EXECUTE FUNCTION log_assignment_change();
