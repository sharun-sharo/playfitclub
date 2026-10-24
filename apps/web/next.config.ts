import path from "node:path";
import type { NextConfig } from "next";
import { trustLocalDevCertificate } from "./dev-realtime-proxy";
import { devRealtimeProxyOrigin } from "./src/lib/env";

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

export default nextConfig;
