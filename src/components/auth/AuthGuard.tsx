"use client";

import { useState } from "react";
import { useAuthContext } from "./AuthProvider";
import { isDemoMode } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function LoginPrompt() {
  const { login, error, isLoading } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-center text-lg font-semibold">
          手術室人力白板
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">請登入以繼續</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isLoading}>
            {isLoading ? "登入中..." : "登入"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isDemoMode) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) return <>{fallback ?? <LoginPrompt />}</>;

  return <>{children}</>;
}
