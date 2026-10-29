import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameOverScreen } from "../../components/fitrunner-v2/game-over";
import { ResultsScreen, type RunResult } from "../../components/fitrunner-v2/rewards-ui";
import { resultsAccountLinks } from "./results-account";

const result: RunResult = {
  saved: false,
  durationMs: 2000,
  activeMs: 2000,
  distanceM: 13,
  score: 38,
  tokens: 1,
  jumps: 0,
  squats: 0,
  laneDodges: 0,
  perfects: 0,
  bestCombo: 0,
  missionsDone: 0,
  xp: 0,
  calories: null,
};

function card(accountLinks?: "individual" | "gym" | null) {
  return renderToStaticMarkup(createElement(ResultsScreen, { result, onAgain: () => undefined, accountLinks }));
}

describe("results account links", () => {
  it("hides Dashboard and History when nobody is signed in", () => {
    expect(resultsAccountLinks({ signedIn: false, role: null, gymLinked: false })).toBeNull();
    expect(resultsAccountLinks({ signedIn: false, role: "INDIVIDUAL", gymLinked: true })).toBeNull();
    expect(resultsAccountLinks({ signedIn: false, role: "GYM_OWNER", gymLinked: true })).toBeNull();
    const html = card(null);
    expect(html).toContain("Play Again");
    expect(html).not.toContain("Dashboard");
    expect(html).not.toContain("History");
    expect(html).not.toContain('href="/dashboard"');
    expect(html).not.toContain('href="/dev/fitrunner-v2/history"');
  });

  it("shows the links for an individual player with no gym seat", () => {
    expect(resultsAccountLinks({ signedIn: true, role: "INDIVIDUAL", gymLinked: false })).toBe("individual");
    expect(resultsAccountLinks({ signedIn: true, role: "PLAYER", gymLinked: false })).toBe("individual");
    const html = card("individual");
    expect(html).toContain("Play Again");
    expect(html).toContain("Dashboard");
    expect(html).toContain("History");
  });

  it("shows the links for a gym member or gym owner", () => {
    expect(resultsAccountLinks({ signedIn: true, role: "INDIVIDUAL", gymLinked: true })).toBe("gym");
    expect(resultsAccountLinks({ signedIn: true, role: "PLAYER", gymLinked: true })).toBe("gym");
    expect(resultsAccountLinks({ signedIn: true, role: "GYM_OWNER", gymLinked: true })).toBe("gym");
    expect(resultsAccountLinks({ signedIn: true, role: "GYM_OWNER", gymLinked: false })).toBe("gym");
    const html = card("gym");
    expect(html).toContain("Play Again");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/dev/fitrunner-v2/history"');
  });

  it("hides the links for a signed-in account that is neither individual nor gym-linked", () => {
    expect(resultsAccountLinks({ signedIn: true, role: "ADMIN", gymLinked: false })).toBeNull();
    expect(resultsAccountLinks({ signedIn: true, role: "SUPER_ADMIN", gymLinked: false })).toBeNull();
    expect(resultsAccountLinks({ signedIn: true, role: "ADMIN", gymLinked: true })).toBe("gym");
    expect(resultsAccountLinks({ signedIn: true, role: null, gymLinked: false })).toBeNull();
  });

  it("hides Dashboard and History on game over for a logged-out run and shows them for a signed-in player", () => {
    const loggedOut = renderToStaticMarkup(
      createElement(GameOverScreen, {
        score: 4,
        coins: 0,
        distanceM: 8,
        obstaclesHit: 1,
        saved: false,
        completedMissions: [],
        onAgain: () => undefined,
        onExit: () => undefined,
        accountLinks: null,
      }),
    );
    expect(loggedOut).toContain("GAME OVER");
    expect(loggedOut).toContain("Play Again");
    expect(loggedOut).toContain("No daily missions completed this run.");
    expect(loggedOut).not.toContain("Dashboard");
    expect(loggedOut).not.toContain("History");

    const signedIn = renderToStaticMarkup(
      createElement(GameOverScreen, {
        score: 4,
        coins: 0,
        distanceM: 8,
        obstaclesHit: 1,
        saved: true,
        completedMissions: [{ id: "dodge", title: "Dodge Master" }],
        onAgain: () => undefined,
        onExit: () => undefined,
        accountLinks: "individual",
      }),
    );
    expect(signedIn).toContain("Play Again");
    expect(signedIn).toContain("Dodge Master");
    expect(signedIn).toContain('href="/dashboard"');
    expect(signedIn).toContain('href="/dev/fitrunner-v2/history"');
  });

  it("keeps Play Again when the account prop is omitted", () => {
    const html = renderToStaticMarkup(createElement(ResultsScreen, { result, onAgain: () => undefined }));
    expect(html).toContain("Play Again");
    expect(html).not.toContain("Dashboard");
    expect(html).not.toContain("History");
  });
});
