import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole app ships as files so Capacitor can bundle it and
  // so it runs with no server (offline-first).
  output: "export",
  trailingSlash: true,
  // Capacitor serves the exported files directly; Next's image optimizer is a
  // server feature, so it is disabled here.
  images: { unoptimized: true },
  // Pin the workspace root. Without this, Turbopack walks up past the project
  // and picks up an unrelated `package-lock.json` in the parent directory,
  // which makes every build print a "outside the current Git repository"
  // warning and makes module resolution depend on that neighbour.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
