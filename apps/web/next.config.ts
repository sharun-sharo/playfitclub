import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { trustLocalDevCertificate } from "./dev-realtime-proxy";
import { devRealtimeProxyOrigin } from "./src/lib/env";

function webRoot() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "scripts/fetch-vision-assets.mjs"))) return cwd;
  const nested = path.join(cwd, "apps/web");
  if (existsSync(path.join(nested, "scripts/fetch-vision-assets.mjs"))) return nested;
  throw new Error("Could not find scripts/fetch-vision-assets.mjs");
}

function ensureVisionAssets() {
  const root = webRoot();
  execFileSync(process.execPath, [path.join(root, "scripts/fetch-vision-assets.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
}

trustLocalDevCertificate([
  path.resolve(process.cwd(), "certs/dev-cert.pem"),
  path.resolve(process.cwd(), "../../certs/dev-cert.pem"),
]);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.0.3"],
  transpilePackages: ["@fitplay/shared", "@fitplay/game", "@fitplay/db"],
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs"],
  // Engine.IO requests /socket.io/ with a trailing slash. In dev, keep that slash so
  // the Socket.IO proxy is not turned into a redirect before it reaches the realtime server.
  skipTrailingSlashRedirect: process.env.NODE_ENV !== "production",
  async redirects() {
    return [
      { source: "/tv", destination: "/", permanent: true },
      { source: "/tv/:path*", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const configured = process.env.REALTIME_URL || process.env.NEXT_PUBLIC_REALTIME_URL || "http://127.0.0.1:3001";
    const origin = devRealtimeProxyOrigin(configured);
    return {
      beforeFiles: [
        // Engine.IO only answers /socket.io/ with the trailing slash. Next strips that
        // slash before rewrites, so the proxy target puts it back.
        { source: "/socket.io", destination: `${origin}/socket.io/` },
        { source: "/socket.io/:path*", destination: `${origin}/socket.io/:path*` },
      ],
    };
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) ensureVisionAssets();
  return nextConfig;
}
