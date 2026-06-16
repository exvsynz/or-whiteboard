import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabase, isSupabaseConfigured, isDemoMode } from "./supabase-client";

export type UserRole = "editor" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthSubscribeHandlers {
  onUser: (user: AuthUser | null) => void;
  onError: (error: string | null) => void;
  /** Fired once the initial session check resolves (clears the loading state). */
  onResolved: () => void;
}

export interface AuthAdapter {
  readonly kind: "demo" | "supabase" | "unconfigured";
  /** Demo bypasses the login gate entirely. */
  readonly bypassAuth: boolean;
  /** false → the deployment is misconfigured (show the setup panel). */
  readonly configured: boolean;
  readonly initialUser: AuthUser | null;
  readonly initialLoading: boolean;
  /** Subscribe to auth-state changes; returns unsubscribe. Demo/unconfigured = no-op. */
  subscribe(handlers: AuthSubscribeHandlers): () => void;
  login(email: string, password: string): Promise<{ error: string | null }>;
  logout(): Promise<{ error: string | null }>;
}

type Client = SupabaseClient<Database>;

const DEMO_USER: AuthUser = { id: "demo", email: "demo@local", role: "editor" };

const NOOP_UNSUBSCRIBE = () => {};

// Roles live in app_metadata (admin-controlled). user_metadata is self-service
// writable via auth.updateUser(), so reading the role from there allowed
// privilege escalation — RLS is_editor() was hardened the same way (migration 003).
function parseRole(metadata: Record<string, unknown> | undefined): UserRole {
  const raw = metadata?.role;
  if (raw === "editor" || raw === "viewer") return raw;
  return "viewer";
}

export function createDemoAuthAdapter(): AuthAdapter {
  return {
    kind: "demo",
    bypassAuth: true,
    configured: true,
    initialUser: DEMO_USER,
    initialLoading: false,
    subscribe: () => NOOP_UNSUBSCRIBE,
    login: async () => ({ error: null }),
    logout: async () => ({ error: null }),
  };
}

export function createUnconfiguredAuthAdapter(): AuthAdapter {
  return {
    kind: "unconfigured",
    bypassAuth: false,
    configured: false,
    initialUser: null,
    initialLoading: false,
    subscribe: () => NOOP_UNSUBSCRIBE,
    // Missing env vars: say so instead of silently no-opping a login form that
    // can never succeed.
    login: async () => ({
      error:
        "Supabase 未設定 — 請檢查 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY 環境變數",
    }),
    logout: async () => ({ error: null }),
  };
}

export function createSupabaseAuthAdapter(client: Client): AuthAdapter {
  return {
    kind: "supabase",
    bypassAuth: false,
    configured: true,
    initialUser: null,
    initialLoading: true,

    subscribe({ onUser, onError, onResolved }) {
      let cancelled = false;

      client.auth.getSession().then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          onError(error.message);
          onResolved();
          return;
        }
        if (data.session?.user) {
          const u = data.session.user;
          onUser({
            id: u.id,
            email: u.email ?? "",
            role: parseRole(u.app_metadata),
          });
        }
        onResolved();
      });

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        if (session?.user) {
          const u = session.user;
          onUser({
            id: u.id,
            email: u.email ?? "",
            role: parseRole(u.app_metadata),
          });
        } else {
          onUser(null);
        }
        onError(null);
      });

      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    },

    login: async (email, password) => {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error ? error.message : null };
    },

    logout: async () => {
      const { error } = await client.auth.signOut();
      return { error: error ? error.message : null };
    },
  };
}

// Fixed for the session by build-time configuration, mirroring backend-config.
// MSAL (P1) adds a fourth branch here once the Entra client exists.
const authAdapter: AuthAdapter = isDemoMode
  ? createDemoAuthAdapter()
  : isSupabaseConfigured && supabase
    ? createSupabaseAuthAdapter(supabase)
    : createUnconfiguredAuthAdapter();

export function getAuthAdapter(): AuthAdapter {
  return authAdapter;
}
