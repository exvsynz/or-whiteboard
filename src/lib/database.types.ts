export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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

export type AssignmentStatus = "assigned" | "break" | "relief";

export type RoomStatus =
  | "idle"
  | "induction"
  | "surgery"
  | "cleaning"
  | "ready";

// NOTE: Table row shapes are inline object types, NOT interfaces.
// supabase-js v2 GenericSchema requires Row types to satisfy
// Record<string, unknown>; interfaces lack the implicit index signature
// and collapse every query's Insert/Update types to `never`.
export type Database = {
  public: {
    Tables: {
      areas: {
        Row: {
          id: string;
          name: string;
          category: AreaCategory;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: AreaCategory;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          category?: AreaCategory;
          sort_order?: number;
        };
        Relationships: [];
      };
      people: {
        Row: {
          id: string;
          name: string;
          role: string;
          color: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          role?: string;
          color?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          role?: string;
          color?: string;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      assignments: {
        Row: {
          id: string;
          person_id: string;
          area_id: string | null;
          board_date: string;
          status: AssignmentStatus;
          version: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          person_id: string;
          area_id?: string | null;
          board_date?: string;
          status?: AssignmentStatus;
          version?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          area_id?: string | null;
          board_date?: string;
          status?: AssignmentStatus;
          version?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_area_id_fkey";
            columns: ["area_id"];
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      area_status: {
        Row: {
          area_id: string;
          status: RoomStatus;
          note: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          area_id: string;
          status?: RoomStatus;
          note?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          status?: RoomStatus;
          note?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "area_status_area_id_fkey";
            columns: ["area_id"];
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          timestamp: string;
          user_id: string | null;
          person_id: string;
          from_area_id: string | null;
          to_area_id: string | null;
          action_type: ActionType;
        };
        Insert: {
          id?: string;
          timestamp?: string;
          user_id?: string | null;
          person_id: string;
          from_area_id?: string | null;
          to_area_id?: string | null;
          action_type: ActionType;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "audit_log_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_editor: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      replace_board: {
        Args: { p_board_date: string; p_people: Json };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Area = Database["public"]["Tables"]["areas"]["Row"];
export type Person = Database["public"]["Tables"]["people"]["Row"];
export type Assignment = Database["public"]["Tables"]["assignments"]["Row"];
export type AreaStatusRow = Database["public"]["Tables"]["area_status"]["Row"];
export type AuditLogEntry = Database["public"]["Tables"]["audit_log"]["Row"];
