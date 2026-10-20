/**
 * Resolves the base URL embedded in QR codes.
 * Production refuses a missing or localhost URL so phones never receive a dead link.
 */
export function resolvePublicAppUrl(input: {
  configuredUrl?: string | null;
  requestOrigin?: string | null;
  production: boolean;
}): string {
  const configured = input.configuredUrl?.trim().replace(/\/$/, "") ?? "";
  const requestOrigin = input.requestOrigin?.trim().replace(/\/$/, "") ?? "";
  const localhost = (value: string) => /:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value);

  if (input.production) {
    if (!configured || localhost(configured)) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must be the public https origin in production. Refusing to encode localhost into a QR code.",
      );
    }
    return configured;
  }

  if (configured && !localhost(configured)) return configured;
  if (requestOrigin) return requestOrigin;
  if (configured) return configured;
  throw new Error("Set NEXT_PUBLIC_APP_URL or open the TV client from a browser origin.");
}
