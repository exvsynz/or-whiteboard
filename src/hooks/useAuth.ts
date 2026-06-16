"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAuthAdapter,
  type AuthUser,
  type UserRole,
} from "@/lib/auth-adapter";

export type { AuthUser, UserRole };

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

const adapter = getAuthAdapter();

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(adapter.initialUser);
  const [isLoading, setIsLoading] = useState(adapter.initialLoading);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return adapter.subscribe({
      onUser: setUser,
      onError: setError,
      onResolved: () => setIsLoading(false),
    });
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setError(null);
      setIsLoading(true);
      const { error: loginError } = await adapter.login(email, password);
      setError(loginError);
      setIsLoading(false);
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    setError(null);
    const { error: logoutError } = await adapter.logout();
    if (logoutError) setError(logoutError);
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
