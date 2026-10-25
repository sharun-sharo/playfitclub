import { describe, expect, it } from "vitest";
import { fitRunnerPixelRatio, fitRunnerQuality, graphicsFailureMessage, isTelevisionUserAgent } from "./tv-graphics";

describe("television graphics limits", () => {
  it("recognizes Tizen and other TV browsers", () => {
    expect(isTelevisionUserAgent("Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 Chrome/85.0 TV Safari/537.36")).toBe(true);
    expect(isTelevisionUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe(false);
  });

  it("caps television pixel ratio at 1 and leaves the laptop cap at 2", () => {
    expect(fitRunnerPixelRatio(3, false)).toBe(2);
    expect(fitRunnerPixelRatio(1.25, false)).toBe(1.25);
    expect(fitRunnerPixelRatio(2.5, true)).toBe(1);
    expect(fitRunnerPixelRatio(Number.NaN, true)).toBe(1);
  });

  it("lowers quality only for a television", () => {
    expect(fitRunnerQuality(false)).toBe("high");
    expect(fitRunnerQuality(true)).toBe("low");
  });

  it("names the WebGL 2 limit and a packaged Tizen app as a different runtime", () => {
    const message = graphicsFailureMessage("no-webgl2");
    expect(message).toMatch(/WebGL 2/);
    expect(message).toMatch(/Tizen packaged app/);
    expect(message).toMatch(/will not substitute a screenshot/);
    expect(graphicsFailureMessage("context-lost")).toMatch(/graphics context/);
    expect(graphicsFailureMessage("shader")).toMatch(/shader/);
  });
});
