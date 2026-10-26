import { describe, expect, it } from "vitest";
import {
  fitRunnerDrawingBuffer,
  fitRunnerPixelRatio,
  fitRunnerQuality,
  graphicsFailureMessage,
  isTelevisionBrowser,
  isTelevisionUserAgent,
} from "./tv-graphics";

describe("television graphics limits", () => {
  it("recognizes Tizen and other TV browsers", () => {
    expect(isTelevisionUserAgent("Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 Chrome/85.0 TV Safari/537.36")).toBe(true);
    expect(isTelevisionUserAgent("Mozilla/5.0 (Linux; Android 12; Samsung Smart TV) AppleWebKit/537.36 Safari/537.36")).toBe(true);
    expect(isTelevisionUserAgent("Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/79.0 Safari/537.36")).toBe(true);
    expect(isTelevisionUserAgent("Mozilla/5.0 (Linux; Android 10; BRAVIA 4K) AppleWebKit/537.36 Chrome/84.0 Safari/537.36")).toBe(true);
    expect(isTelevisionUserAgent("Mozilla/5.0 (Linux; Android 9; AFTSSS) AppleWebKit/537.36 Chrome/88.0 Safari/537.36")).toBe(true);
    expect(isTelevisionUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe(false);
    expect(isTelevisionUserAgent("Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 SamsungBrowser/20.0 Chrome/106.0 Mobile Safari/537.36")).toBe(false);
  });

  it("uses a coarse pointer on a living-room screen without treating a laptop as a television", () => {
    expect(isTelevisionBrowser({
      userAgent: "Mozilla/5.0 Chrome/120.0",
      pointerCoarse: true,
      screenWidth: 3840,
      screenHeight: 2160,
    })).toBe(true);
    expect(isTelevisionBrowser({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
      pointerCoarse: false,
      screenWidth: 1440,
      screenHeight: 900,
    })).toBe(false);
    expect(isTelevisionBrowser({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
      pointerCoarse: true,
      screenWidth: 1440,
      screenHeight: 900,
    })).toBe(false);
    expect(isTelevisionBrowser({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0",
      pointerCoarse: false,
      screenWidth: 3840,
      screenHeight: 2160,
    })).toBe(false);
  });

  it("caps a 4K television drawing buffer at 960×540 and leaves a 1440×900 laptop uncapped", () => {
    const television = fitRunnerDrawingBuffer(3840, 2160, 2, true);
    expect(television.width).toBeLessThanOrEqual(960);
    expect(television.height).toBeLessThanOrEqual(540);
    expect(television).toEqual({ width: 960, height: 540, pixelRatio: 1 });
    expect(television.width / television.height).toBeCloseTo(3840 / 2160, 5);

    const wide = fitRunnerDrawingBuffer(2560, 1080, 1, true);
    expect(wide.width).toBeLessThanOrEqual(960);
    expect(wide.height).toBeLessThanOrEqual(540);
    expect(wide.width / wide.height).toBeCloseTo(2560 / 1080, 2);

    const laptop = fitRunnerDrawingBuffer(1440, 900, 1, false);
    expect(laptop).toEqual({ width: 1440, height: 900, pixelRatio: 1 });
    expect(laptop.width).toBeGreaterThan(960);
    expect(laptop.height).toBeGreaterThan(540);

    const laptopRetina = fitRunnerDrawingBuffer(1440, 900, 2, false);
    expect(laptopRetina).toEqual({ width: 2880, height: 1800, pixelRatio: 2 });
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
