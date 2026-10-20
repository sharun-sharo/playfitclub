import { describe, expect, it } from "vitest";
import { createJoinCode } from "./join-code";
import { resolvePublicAppUrl } from "./public-url";

describe("pairing helpers", () => {
  it("builds an unambiguous join code", () => {
    const code = createJoinCode(new Uint8Array([0, 1, 2, 3, 4, 5]));
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(code.includes("O")).toBe(false);
    expect(code.includes("I")).toBe(false);
  });

  it("refuses to bake localhost into a production QR code", () => {
    expect(() =>
      resolvePublicAppUrl({
        configuredUrl: "http://localhost:3000",
        production: true,
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(
      resolvePublicAppUrl({
        configuredUrl: "https://play.fitplay.example",
        requestOrigin: "http://localhost:3000",
        production: true,
      }),
    ).toBe("https://play.fitplay.example");
  });

  it("uses the browser origin during development when the configured URL is local", () => {
    expect(
      resolvePublicAppUrl({
        configuredUrl: "http://localhost:3000",
        requestOrigin: "http://192.168.1.20:3000",
        production: false,
      }),
    ).toBe("http://192.168.1.20:3000");
  });
});
