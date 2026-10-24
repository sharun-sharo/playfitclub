import fs from "node:fs";
import tls from "node:tls";
import { isPrivateDevHost } from "./src/lib/env";

const installed = Symbol.for("fitplay.trustDevCert");

/**
 * The dev realtime server uses the FitPlay certificate. Add that certificate as a
 * trust anchor for loopback and private hosts so the Next proxy can complete TLS.
 * Public hosts keep the default trust store.
 */
export function trustLocalDevCertificate(candidates: string[]) {
  const marked = tls as typeof tls & { [installed]?: boolean };
  if (marked[installed] || process.env.NODE_ENV === "production") return;
  const certPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!certPath) return;
  const extra = fs.readFileSync(certPath);
  const nativeConnect = tls.connect;
  tls.connect = ((...args: unknown[]) => {
    const [first, ...rest] = args;
    if (!isConnectOptions(first)) return nativeConnect(...(args as Parameters<typeof tls.connect>));
    const host = String(first.servername || first.host || "");
    if (!isPrivateDevHost(host)) return nativeConnect(...(args as Parameters<typeof tls.connect>));
    const current = first.ca == null ? tls.rootCertificates : Array.isArray(first.ca) ? first.ca : [first.ca];
    const options: tls.ConnectionOptions = { ...first, ca: [...current, extra] };
    return nativeConnect(options, ...(rest as []));
  }) as typeof tls.connect;
  marked[installed] = true;
}

function isConnectOptions(value: unknown): value is tls.ConnectionOptions {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
