import { supabase, isSupabaseConfigured } from "./supabase-client";
import { createDemoBackend } from "./backends/demo-backend";
import { createSupabaseBackend } from "./backends/supabase-backend";
import type { BoardBackend } from "./board-backend";

// The active backend is fixed for the session by build-time configuration,
// mirroring the existing supabase-client singleton. The SharePoint branch is
// added in P1 once the MSAL-authenticated Graph client exists; today this is a
// behavior-preserving demo|supabase switch identical to the prior inline
// isSupabaseConfigured checks.
const backend: BoardBackend =
  isSupabaseConfigured && supabase
    ? createSupabaseBackend(supabase)
    : createDemoBackend();

export function getBackend(): BoardBackend {
  return backend;
}
