import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.goto("https://localhost:3000/dev/fitrunner-v2", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => document.querySelector("canvas")?.dataset.ready === "true", null, { timeout: 30000 });
await page.waitForTimeout(600);

const sample = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { colored: 0, total: 0, width: 0, height: 0 };
  const probe = document.createElement("canvas");
  probe.width = 48;
  probe.height = 48;
  const context = probe.getContext("2d");
  context.drawImage(canvas, 0, 0, 48, 48);
  const pixels = context.getImageData(0, 0, 48, 48).data;
  let colored = 0;
  let bright = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const sum = pixels[index] + pixels[index + 1] + pixels[index + 2];
    if (sum > 24) colored += 1;
    if (sum > 180) bright += 1;
  }
  return {
    colored,
    bright,
    total: pixels.length / 4,
    width: canvas.width,
    height: canvas.height,
    clip: canvas.dataset.clip,
    lane: canvas.dataset.lane,
    motion: canvas.dataset.motion,
  };
});

await page.screenshot({ path: "/tmp/fitrunner-v2-run.png" });

async function waitDataset(field, value, timeout = 2500) {
  await page.waitForFunction(
    ([key, expected]) => document.querySelector("canvas")?.dataset[key] === expected,
    [field, value],
    { timeout },
  );
}

await page.keyboard.press("ArrowLeft");
await waitDataset("lane", "left");
await page.waitForTimeout(250);
await page.screenshot({ path: "/tmp/fitrunner-v2-left.png" });

await page.keyboard.press("ArrowRight");
await waitDataset("lane", "center");

await page.keyboard.press("Space");
await waitDataset("motion", "jump");
await page.waitForTimeout(180);
await page.screenshot({ path: "/tmp/fitrunner-v2-jump.png" });
await waitDataset("motion", "run", 3000);

await page.keyboard.press("ArrowDown");
await waitDataset("motion", "roll");
await page.waitForTimeout(200);
await page.screenshot({ path: "/tmp/fitrunner-v2-roll.png" });
await waitDataset("motion", "run", 4000);

await page.keyboard.press("KeyC");
await waitDataset("clip", "WipeSweat");
await page.waitForTimeout(250);
const celebrate = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  return { clip: canvas?.dataset.clip, motion: canvas?.dataset.motion, lane: canvas?.dataset.lane };
});

await page.goto("https://localhost:3000/play", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.getByRole("heading", { name: "The game is being rebuilt" }).waitFor({ timeout: 20000 });
const play = await page.evaluate(() => ({
  prototype: document.querySelector("[data-fitrunner-v2]") !== null,
  canvas: document.querySelectorAll("canvas").length,
  heading: document.querySelector("h1")?.textContent ?? "",
}));

console.log(JSON.stringify({ sample, celebrate, play, errors }, null, 2));
await browser.close();
