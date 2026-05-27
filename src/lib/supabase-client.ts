import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

function createSupabaseClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key);
}

export const supabase = createSupabaseClient();
export const isSupabaseConfigured = supabase !== null;
export const isDemoMode =
  !isSupabaseConfigured &&
  process.env.NEXT_PUBLIC_DEMO_MODE === "true";
