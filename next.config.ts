import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_EXPORT=1 produces a fully static build in out/ (the app is
  // entirely client-side) — used for drag-and-drop demo hosting like
  // Netlify Drop. Normal builds/dev are unaffected.
  ...(process.env.NEXT_EXPORT === "1" ? { output: "export" as const } : {}),
};

export default nextConfig;
