import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { authorizeGymSession, createPrismaRepository } from "@fitplay/db";
import { attachGameServer } from "./server";
import { log } from "./logger";

loadEnv();

const secret = process.env.AUTH_SECRET ?? "";
if (secret.length < 32) {
  log("error", "AUTH_SECRET must be at least 32 characters");
  process.exit(1);
}

const port = Number(process.env.REALTIME_PORT || 3001);
const origins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function handleRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "fitplay-realtime", uptime: process.uptime() }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false }));
}

const keyPath = process.env.TLS_KEY_PATH ? resolve(process.env.TLS_KEY_PATH) : "";
const certPath = process.env.TLS_CERT_PATH ? resolve(process.env.TLS_CERT_PATH) : "";
const httpServer =
  keyPath && certPath && existsSync(keyPath) && existsSync(certPath)
    ? createHttpsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, handleRequest)
    : createHttpServer(handleRequest);

attachGameServer(httpServer, {
  repository: createPrismaRepository(),
  secret,
  corsOrigins: origins,
  allowShortSessions: process.env.ALLOW_SHORT_SESSIONS === "true",
  resolveGym: (userId, gymSlug) => authorizeGymSession(userId, gymSlug),
});

httpServer.listen(port, "0.0.0.0", () => {
  log("info", "realtime server listening", { port, origins });
});

function loadEnv() {
  for (const file of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env"), resolve(process.cwd(), "apps/realtime/.env")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
