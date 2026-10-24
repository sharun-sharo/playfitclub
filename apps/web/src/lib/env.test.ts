import { describe, expect, it } from "vitest";
import { devRealtimeProxyOrigin, resolveBrowserRealtimeUrl } from "./env";

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
