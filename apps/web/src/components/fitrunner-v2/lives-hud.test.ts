import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameOverScreen } from "./game-over";
import { LivesHearts } from "./lives-hearts";
import { PlayScoreCard } from "./play-score-card";

describe("lives hud", () => {
  it("shows five hearts and dims one per missing life", () => {
    const full = renderToStaticMarkup(createElement(LivesHearts, { hidden: false, lives: 5 }));
    expect(full.match(/data-heart="full"/g)).toHaveLength(5);
    expect(full).not.toContain('data-heart="dim"');
    const afterTwo = renderToStaticMarkup(createElement(LivesHearts, { hidden: false, lives: 3 }));
    expect(afterTwo.match(/data-heart="full"/g)).toHaveLength(3);
    expect(afterTwo.match(/data-heart="dim"/g)).toHaveLength(2);
    expect(afterTwo).toContain('data-lives="3"');
    const none = renderToStaticMarkup(createElement(LivesHearts, { hidden: false, lives: 0 }));
    expect(none.match(/data-heart="dim"/g)).toHaveLength(5);
  });

  it("keeps hearts off the distance, time, and calories card", () => {
    const card = renderToStaticMarkup(
      createElement(PlayScoreCard, {
        hidden: false,
        scoreRef: null,
        distanceRef: null,
        timeRef: null,
        jumpRef: null,
        squatRef: null,
        rightRef: null,
        leftRef: null,
        coinsRef: null,
        calories: "43 kcal",
        note: null,
        keyboard: false,
      }),
    );
    expect(card).toContain("Distance");
    expect(card).toContain("Time");
    expect(card).toContain("Calories burned");
    expect(card).toContain("Jump");
    expect(card).toContain("Squat");
    expect(card).toContain("Right");
    expect(card).toContain("Left");
    expect(card).toContain("Coins");
    expect(card).not.toContain("data-fitrunner-hearts");
    expect(card).not.toContain("Demo");
    expect(card).not.toContain("Tokens");
    expect(card).not.toContain("Combo");
  });

  it("shows the game over totals", () => {
    const html = renderToStaticMarkup(
      createElement(GameOverScreen, {
        score: 840,
        coins: 12,
        distanceM: 315.4,
        obstaclesHit: 5,
        saved: true,
        onAgain: () => undefined,
        onExit: () => undefined,
      }),
    );
    expect(html).toContain("GAME OVER");
    expect(html).toContain("Score");
    expect(html).toContain("840");
    expect(html).toContain("Coins");
    expect(html).toContain("12");
    expect(html).toContain("Distance");
    expect(html).toContain("315 m");
    expect(html).toContain("Obstacles hit");
    expect(html).toContain("Play Again");
    expect(html).toContain("Exit");
    expect(html).not.toContain("Demo");
    expect(html).not.toContain("Tokens");
    expect(html).not.toContain("Combo");
    expect(html).not.toContain("COMPLETED THIS RUN");
    expect(html).not.toContain("Dodge Master");
  });

  it("lists only the missions completed this run", () => {
    const html = renderToStaticMarkup(
      createElement(GameOverScreen, {
        score: 840,
        coins: 12,
        distanceM: 315.4,
        obstaclesHit: 5,
        saved: null,
        completedMissions: [
          { id: "dodge", title: "Dodge Master" },
          { id: "clean", title: "Untouchable" },
        ],
        onAgain: () => undefined,
        onExit: () => undefined,
      }),
    );
    expect(html).toContain("COMPLETED THIS RUN");
    expect(html).toContain("Dodge Master");
    expect(html).toContain("Untouchable");
    expect(html).not.toContain("Warm-Up Warrior");
    expect(html).not.toContain("Triple Victory");
    expect(html).not.toContain("No daily missions completed this run.");
  });

  it("says plainly when this run completed no missions", () => {
    const html = renderToStaticMarkup(
      createElement(GameOverScreen, {
        score: 10,
        coins: 0,
        distanceM: 20,
        obstaclesHit: 5,
        saved: false,
        completedMissions: [],
        onAgain: () => undefined,
        onExit: () => undefined,
      }),
    );
    expect(html).toContain("No daily missions completed this run.");
    expect(html).not.toContain("Dodge Master");
    expect(html).not.toContain("Warm-Up Warrior");
    expect(html).not.toContain("Untouchable");
    expect(html).not.toContain("Triple Victory");
  });
});
