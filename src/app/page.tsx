"use client";

import Board from "@/components/board/Board";
import { AuthGuard } from "@/components/auth";

export default function Home() {
  return (
    <AuthGuard>
      <Board />
    </AuthGuard>
  );
}
