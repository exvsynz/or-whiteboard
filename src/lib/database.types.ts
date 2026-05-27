export type AreaCategory =
  | "leader"
  | "fixed_task"
  | "room"
  | "shift_12_20"
  | "shift_evening"
  | "shift_night"
  | "special_anesthesia"
  | "special_recovery"
  | "special_case_mgmt";

export type ActionType =
  | "assign"
  | "unassign"
  | "reassign"
  | "add_person"
  | "remove_person";

export interface Area {
  id: string;
  name: string;
  category: AreaCategory;
  sort_order: number;
  created_at: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface Assignment {
  id: string;
  person_id: string;
  area_id: string | null;
  board_date: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string | null;
  person_id: string;
  from_area_id: string | null;
  to_area_id: string | null;
  action_type: ActionType;
}

export interface Database {
  public: {
    Views: {};
    Functions: {};
    Tables: {
      areas: {
        Row: Area;
        Insert: Omit<Area, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Area, "id">>;
        Relationships: [];
      };
      people: {
        Row: Person;
        Insert: Omit<Person, "id" | "created_at" | "is_active"> & {
          id?: string;
          created_at?: string;
          is_active?: boolean;
        };
        Update: Partial<Omit<Person, "id">>;
        Relationships: [];
      };
      assignments: {
        Row: Assignment;
        Insert: Omit<Assignment, "id" | "version" | "updated_at"> & {
          id?: string;
          version?: number;
          updated_at?: string;
        };
        Update: Partial<Omit<Assignment, "id">>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogEntry;
        Insert: Omit<AuditLogEntry, "id" | "timestamp"> & {
          id?: string;
          timestamp?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
  };
}
