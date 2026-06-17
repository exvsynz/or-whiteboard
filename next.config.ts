import type { NextConfig } from "next";

// NEXT_EXPORT=1 produces a fully static build in out/ (the app is entirely
// client-side) — used for demo hosting. Normal builds/dev are unaffected.
// GH_PAGES=1 additionally sets the project-site base path so assets resolve
// under https://<user>.github.io/or-whiteboard/. Local/dev/Netlify omit it.
const base = process.env.GH_PAGES === "1" ? "/or-whiteboard" : undefined;

const nextConfig: NextConfig = {
  ...(process.env.NEXT_EXPORT === "1" ? { output: "export" as const } : {}),
  ...(base ? { basePath: base, assetPrefix: base } : {}),
};

export default nextConfig;
