import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));

describe("join player line", () => {
  it("does not show a two-player count after the phone scans", () => {
    const panels = readFileSync(join(dir, "phone-panels.tsx"), "utf8");
    const line = panels.match(/export function joinPlayerLine\(\) \{\s*return "([^"]+)";/)?.[1];
    expect(line).toBe("One phone is the controller. The TV or laptop is the screen.");
    expect(line).not.toMatch(/\/2/);
    expect(line).not.toMatch(/of 2/);

    const panelStart = panels.indexOf("export function JoinPanel");
    const panelEnd = panels.indexOf("export function CameraSetup");
    const panel = panels.slice(panelStart, panelEnd);
    expect(panel).toContain("Ready to Play?");
    expect(panel).toContain("/marketing/playfit-club-logo.png");
    expect(panel).not.toContain("playfit-club-logo-footer");
    expect(panel).not.toContain("joinPlayerLine");
    expect(panel).not.toContain("Code ");
    expect(panel).not.toMatch(/\/2/);

    const source = readFileSync(join(dir, "phone-session.tsx"), "utf8");
    expect(source).not.toContain("joinPlayerLine()");
    expect(source).not.toContain("of ${session.maxPlayers}");
    expect(source).not.toContain("of ${session.playerCount}");
    expect(source).toContain("joinCode: code.toUpperCase()");
  });
});
