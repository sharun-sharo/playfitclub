import { expect, test } from "@playwright/test";

test.describe("television browser compatibility", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("shows the hero and opens the real FitRunner session", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(".fp-hero-slide.is-active img");
    await expect(hero).toBeVisible();
    await expect.poll(async () => hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(100);
    const source = await hero.evaluate((image: HTMLImageElement) => image.currentSrc);
    expect(source).toContain("hero-run.jpg");
    const box = await hero.boundingBox();
    expect(box && box.height).toBeGreaterThan(200);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Play Now" })).toHaveAttribute("href", "/games");
    await expect(page.getByRole("link", { name: "Play at home", exact: true })).toHaveCount(0);
    await page.goto("/play/fit-run");
    await expect(page.getByRole("heading", { name: "Play on a big screen" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Scan with your phone" })).toBeVisible();
    await expect(page.locator("[data-fitrunner-graphics-error]")).toHaveCount(0);
  });

  test("does not overflow a phone-width homepage", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hero = page.locator(".fp-hero-slide.is-active img");
    await expect(hero).toBeVisible();
    const box = await hero.boundingBox();
    expect(box && box.height).toBeGreaterThan(120);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("names the WebGL 2 limit instead of showing a still", async ({ page }) => {
    await page.addInitScript(() => {
      const prototype = HTMLCanvasElement.prototype as unknown as {
        getContext: (this: HTMLCanvasElement, type: string, ...args: unknown[]) => unknown;
      };
      const original = prototype.getContext;
      prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type === "webgl2" || type === "webgl" || type === "experimental-webgl" || type === "experimental-webgl2") return null;
        return original.call(this, type, ...args);
      };
    });
    await page.goto("/play/fit-run");
    const alert = page.locator("[data-fitrunner-graphics-error]");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText("WebGL 2");
    await expect(alert).toContainText("Tizen packaged app");
    await expect(page.locator("canvas[data-fitrunner-v2]")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Play on a big screen" })).toBeVisible();
  });
});
