"use client";

import { useState } from "react";
import { useAuthContext } from "./AuthProvider";
import { getAuthAdapter } from "@/lib/auth-adapter";
import { Button } from "@/components/ui/button";

const authAdapter = getAuthAdapter();

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

  if (authAdapter.bypassAuth) return <>{children}</>;

  // Misconfigured deployment: without env vars the login form could never
  // succeed — show what's wrong instead of a dead form.
  if (!authAdapter.configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-800 shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">系統尚未設定</h1>
          <p className="text-sm leading-relaxed">
            找不到 Supabase 連線設定。請在環境變數中設定{" "}
            <code className="rounded bg-amber-100 px-1">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            與{" "}
            <code className="rounded bg-amber-100 px-1">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>
            ，或設定{" "}
            <code className="rounded bg-amber-100 px-1">
              NEXT_PUBLIC_DEMO_MODE=true
            </code>{" "}
            以示範模式執行。
          </p>
        </div>
      </div>
    );
  }

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
