-- Areas: all assignable locations (rooms, shifts, special areas)
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN (
    'leader', 'fixed_task', 'room',
    'shift_12_20', 'shift_evening', 'shift_night',
    'special_anesthesia', 'special_recovery', 'special_case_mgmt'
  )),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- People: all staff members
CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '未設定',
  color TEXT NOT NULL DEFAULT 'bg-amber-100',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assignments: who is assigned where on which date
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  board_date DATE NOT NULL DEFAULT CURRENT_DATE,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(person_id, board_date)
);

-- Audit log: track all assignment changes
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  from_area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  to_area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'assign', 'unassign', 'reassign', 'add_person', 'remove_person'
  ))
);

CREATE INDEX idx_assignments_board_date ON assignments(board_date);
CREATE INDEX idx_assignments_person_id ON assignments(person_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_person_id ON audit_log(person_id);

ALTER PUBLICATION supabase_realtime ADD TABLE assignments;
