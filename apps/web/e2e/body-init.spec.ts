import { expect, test } from "@playwright/test";
import { PROTOCOL_VERSION } from "@fitplay/shared";
import { io, type Socket } from "socket.io-client";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * Drives a socket the way the phone does. No physical phone and no camera.
 * The countdown digit must come from the server after player:ready, not from a timer.
 */
test.use({ viewport: { width: 1920, height: 1080 } });

test("TV init follows the phone and waits for the server countdown", async ({ page }) => {
  const sockets: Socket[] = [];
  try {
    await page.goto("/dev/fitrunner-v2", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continue" }).click();
    const code = (await page.locator("[data-join-code]").innerText()).replace(/\s+/g, "");
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const phone = io("https://localhost:3000", {
      transports: ["websocket"],
      reconnection: false,
      rejectUnauthorized: false,
    });
    sockets.push(phone);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("phone socket did not connect")), 20_000);
      phone.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      phone.on("connect_error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const joined = await new Promise<{ ok?: boolean; message?: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("session:join timed out")), 15_000);
      phone.emit(
        "session:join",
        { v: PROTOCOL_VERSION, joinCode: code, displayName: "Player" },
        (response: { ok?: boolean; message?: string }) => {
          clearTimeout(timer);
          resolve(response ?? {});
        },
      );
    });
    expect(joined.ok, joined.message).toBe(true);

    const title = page.locator("[data-body-init-title]");
    await expect(title).toHaveText("CONNECTING YOUR PHONE...");
    await expect(page.getByRole("img", { name: "PlayFit Club" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play with keyboard" })).toBeVisible();

    const steps: Array<{ status: string; title: string; message?: string; detail?: string; joints: string; scan: string }> = [
      { status: "camera_starting", title: "STARTING BODY TRACKING...", joints: "dim", scan: "on" },
      {
        status: "searching",
        title: "READING YOUR BODY...",
        message: "Looking for player...",
        detail: "Make sure your body is visible to your phone camera.",
        joints: "dim",
        scan: "on",
      },
      { status: "body_detected", title: "BODY DETECTED", message: "Player detected", joints: "lit", scan: "off" },
      {
        status: "calibrating",
        title: "CALIBRATING YOUR MOVEMENTS...",
        message: "Great! Stay still while we calibrate.",
        joints: "lit",
        scan: "off",
      },
      { status: "ready", title: "YOU'RE READY!", message: "Motion tracking active", joints: "lit", scan: "off" },
    ];

    for (const step of steps) {
      phone.emit("player:status", {
        v: PROTOCOL_VERSION,
        status: step.status,
        confidence: step.status === "searching" || step.status === "camera_starting" ? 0 : 0.9,
        message: step.message ?? "",
      });
      await expect(title).toHaveText(step.title);
      await expect(page.locator("[data-body-init]")).toHaveAttribute("data-joints", step.joints);
      await expect(page.locator("[data-body-init]")).toHaveAttribute("data-scan", step.scan);
      if (step.detail) await expect(page.locator("[data-body-init-detail]")).toHaveText(step.detail);
    }

    await expect(page.locator("[data-countdown]")).toHaveCount(0);
    await page.waitForTimeout(1200);
    await expect(page.locator("[data-countdown]")).toHaveCount(0);
    await expect(title).toHaveText("YOU'RE READY!");

    phone.emit("player:ready", { v: PROTOCOL_VERSION, ready: true });
    const countdown = page.locator("[data-body-init='countdown'] [data-countdown]");
    await expect(countdown).toHaveText(/^[123]$/);
    await expect(page.locator("[data-body-init-title]")).toHaveCount(0);
  } finally {
    for (const socket of sockets) socket.close();
  }
});
