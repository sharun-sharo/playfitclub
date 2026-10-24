import { describe, expect, it } from "vitest";
import { devCertificateHost, devRealtimeProxyOrigin, GAME_SERVER_DISCONNECTED, resolveBrowserRealtimeConnection, resolveBrowserRealtimeUrl } from "./env";

describe("resolveBrowserRealtimeUrl", () => {
  it("keeps a separate production realtime host", () => {
    expect(
      resolveBrowserRealtimeUrl({
        pageOrigin: "https://play.example.com",
        configuredUrl: "https://realtime.example.com",
        production: true,
      }),
    ).toBe("https://realtime.example.com");
  });

  it("does not copy the page hostname onto a production realtime url", () => {
    expect(
      resolveBrowserRealtimeUrl({
        pageOrigin: "https://localhost:3000",
        configuredUrl: "https://192.168.0.3:3001/",
        production: true,
      }),
    ).toBe("https://192.168.0.3:3001");
  });

  it("uses the page origin in local dev", () => {
    expect(
      resolveBrowserRealtimeUrl({
        pageOrigin: "https://localhost:3000/dev/fitrunner-v2",
        configuredUrl: "https://192.168.0.3:3001",
        production: false,
      }),
    ).toBe("https://localhost:3000");
  });

  it("keeps local dev on the page origin when the configured realtime url is loopback", () => {
    expect(
      resolveBrowserRealtimeUrl({
        pageOrigin: "http://localhost:3000",
        configuredUrl: "http://127.0.0.1:3001",
        production: false,
      }),
    ).toBe("http://localhost:3000");
  });
});

describe("resolveBrowserRealtimeConnection", () => {
  it("connects production to the public https realtime host", () => {
    expect(
      resolveBrowserRealtimeConnection({
        pageOrigin: "https://playfitclub.com",
        configuredUrl: "https://realtime.example.com/",
        production: true,
      }),
    ).toEqual({ ok: true, url: "https://realtime.example.com" });
  });

  it("does not rewrite that host onto the website", () => {
    const decision = resolveBrowserRealtimeConnection({
      pageOrigin: "https://playfitclub.com",
      configuredUrl: "https://realtime.example.com",
      production: true,
    });
    expect(decision).toEqual({ ok: true, url: "https://realtime.example.com" });
  });

  it("refuses a missing or loopback realtime url in production", () => {
    expect(
      resolveBrowserRealtimeConnection({
        pageOrigin: "https://playfitclub.com",
        configuredUrl: "",
        production: true,
      }),
    ).toEqual({ ok: false, reason: "unconfigured" });
    expect(
      resolveBrowserRealtimeConnection({
        pageOrigin: "https://playfitclub.com",
        configuredUrl: "http://127.0.0.1:3001",
        production: true,
      }),
    ).toEqual({ ok: false, reason: "unconfigured" });
    expect(
      resolveBrowserRealtimeConnection({
        pageOrigin: "https://playfitclub.com",
        configuredUrl: "http://localhost:3001",
        production: true,
      }),
    ).toEqual({ ok: false, reason: "unconfigured" });
    expect(() =>
      resolveBrowserRealtimeUrl({
        pageOrigin: "https://playfitclub.com",
        configuredUrl: "http://127.0.0.1:3001",
        production: true,
      }),
    ).toThrow(/NEXT_PUBLIC_REALTIME_URL/);
  });
});

describe("devCertificateHost", () => {
  it("asks for a security check only on a private dev host", () => {
    expect(devCertificateHost("https://192.168.0.3:3001")).toBe(true);
    expect(devCertificateHost("http://127.0.0.1:3001")).toBe(true);
    expect(devCertificateHost("https://realtime.example.com")).toBe(false);
  });
});

describe("GAME_SERVER_DISCONNECTED", () => {
  it("does not mention a local port", () => {
    expect(GAME_SERVER_DISCONNECTED).toBe("The game server is not connected.");
    expect(GAME_SERVER_DISCONNECTED).not.toMatch(/127\.0\.0\.1|localhost/);
  });
});

describe("devRealtimeProxyOrigin", () => {
  it("dials a private realtime host on loopback", () => {
    expect(devRealtimeProxyOrigin("https://192.168.0.3:3001")).toBe("https://127.0.0.1:3001");
    expect(devRealtimeProxyOrigin("http://localhost:3001")).toBe("http://127.0.0.1:3001");
  });

  it("leaves a public realtime host alone", () => {
    expect(devRealtimeProxyOrigin("https://realtime.example.com:3001")).toBe("https://realtime.example.com:3001");
  });
});
