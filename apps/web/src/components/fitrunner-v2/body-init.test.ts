import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bodyInitView } from "./body-init";

const lobby = {
  phase: "lobby",
  countdown: 0,
  countdownPurpose: null as "start" | "resume" | null,
  phoneConnected: true,
  tracking: null as { status?: string; message?: string } | null,
  stall: "",
};

describe("TV body init", () => {
  it("shows reading your body only while the phone is searching", () => {
    const searching = bodyInitView({ ...lobby, tracking: { status: "searching", message: "Looking for player..." } });
    expect(searching?.title).toBe("READING YOUR BODY...");
    expect(searching?.detail).toBe("Make sure your body is visible to your phone camera.");
    expect(searching?.scan).toBe(true);
    expect(searching?.joints).toBe("dim");
    expect(searching?.countdown).toBeNull();

    const found = bodyInitView({ ...lobby, tracking: { status: "body_detected", message: "Player detected" } });
    expect(found?.title).toBe("BODY DETECTED");
    expect(found?.joints).toBe("lit");
    expect(found?.scan).toBe(false);

    const coarse = bodyInitView({ ...lobby, tracking: { status: "calibrating", message: "Looking for player..." } });
    expect(coarse?.title).toBe("READING YOUR BODY...");
    expect(coarse?.key).toBe("searching");
  });

  it("walks the real phone stages and does not invent a countdown", () => {
    expect(bodyInitView(lobby)?.title).toBe("CONNECTING YOUR PHONE...");
    expect(bodyInitView({ ...lobby, tracking: { status: "camera_starting" } })?.title).toBe("STARTING BODY TRACKING...");
    expect(bodyInitView({ ...lobby, tracking: { status: "calibrating", message: "Great! Stay still while we calibrate." } })?.title).toBe(
      "CALIBRATING YOUR MOVEMENTS...",
    );
    const ready = bodyInitView({ ...lobby, tracking: { status: "ready", message: "Motion tracking active" } });
    expect(ready?.title).toBe("YOU'RE READY!");
    expect(ready?.countdown).toBeNull();
    expect(ready?.scan).toBe(false);
  });

  it("shows the server digit only after the countdown phase", () => {
    const ready = bodyInitView({ ...lobby, countdown: 3, tracking: { status: "ready" } });
    expect(ready?.countdown).toBeNull();
    const counting = bodyInitView({
      ...lobby,
      phase: "countdown",
      countdown: 3,
      countdownPurpose: "start",
      tracking: { status: "ready" },
    });
    expect(counting?.key).toBe("countdown");
    expect(counting?.countdown).toBe(3);
    expect(counting?.title).toBe("");
    expect(bodyInitView({ ...lobby, phase: "countdown", countdown: 0, countdownPurpose: "start" })?.countdown).toBeNull();
    expect(bodyInitView({ ...lobby, phase: "running" })).toBeNull();
    expect(bodyInitView({ ...lobby, phase: "countdown", countdownPurpose: "resume", countdown: 2 })).toBeNull();
  });

  it("stops the scan when the phone cannot finish", () => {
    const denied = bodyInitView({ ...lobby, tracking: { status: "camera_error", message: "Camera permission denied" } });
    expect(denied?.key).toBe("retry");
    expect(denied?.scan).toBe(false);
    expect(denied?.title).toMatch(/camera/i);
    const stalled = bodyInitView({
      ...lobby,
      tracking: { status: "searching", message: "Looking for player..." },
      stall: "Still getting you in view.",
    });
    expect(stalled?.title).toBe("READING YOUR BODY...");
    expect(stalled?.scan).toBe(false);
    expect(stalled?.retry).toBe("Still getting you in view.");
    expect(bodyInitView({ ...lobby, phoneConnected: false, tracking: { status: "searching" } })?.key).toBe("retry");
  });

  it("does not render this screen on the phone", () => {
    const phone = readFileSync(new URL("../join/phone-session.tsx", import.meta.url), "utf8");
    expect(phone).not.toContain("BodyInitScreen");
    expect(phone).not.toContain("READING YOUR BODY");
    expect(phone).toContain("phoneBodyStatus");
    expect(phone).toContain("readinessInProgress");
  });
});
