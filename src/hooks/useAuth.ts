"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured, isDemoMode } from "@/lib/supabase-client";

export type UserRole = "editor" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isEditor: boolean;
  isViewer: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DEMO_USER: AuthUser = {
  id: "demo",
  email: "demo@local",
  role: "editor",
};

function parseRole(metadata: Record<string, unknown> | undefined): UserRole {
  const raw = metadata?.role;
  if (raw === "editor" || raw === "viewer") return raw;
  return "viewer";
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(
    isDemoMode ? DEMO_USER : null,
  );
  const [isLoading, setIsLoading] = useState(!isDemoMode && isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let cancelled = false;

    // Fetch current session on mount
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError) {
        setError(sessionError.message);
        setIsLoading(false);
        return;
      }
      if (data.session?.user) {
        const u = data.session.user;
        setUser({
          id: u.id,
          email: u.email ?? "",
          role: parseRole(u.user_metadata),
        });
      }
      setIsLoading(false);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        const u = session.user;
        setUser({
          id: u.id,
          email: u.email ?? "",
          role: parseRole(u.user_metadata),
        });
      } else {
        setUser(null);
      }
      setError(null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      if (!isSupabaseConfigured || !supabase) return;

      setError(null);
      setIsLoading(true);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
      }
      setIsLoading(false);
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured || !supabase) return;

    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
  }, []);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: user !== null,
    isEditor: user?.role === "editor",
    isViewer: user?.role === "viewer",
    login,
    logout,
  };
}
