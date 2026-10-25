import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playAgain, PHONE_ROUND_RESET } from "./play-again";

describe("Play Again button", () => {
  it("grounds the course clip and emits the phone reset before the next run", () => {
    const applied: Array<{ motion: string; jumpActive: boolean; buffered: boolean }> = [];
    const emitted: string[] = [];
    let restarted = false;
    playAgain({
      demoSecondsLeft: 12,
      applyCourse: (clip) => applied.push(clip),
      emitPhoneReset: () => emitted.push(PHONE_ROUND_RESET),
      restartRun: () => {
        restarted = true;
        emitted.push("run:again");
      },
      clearRound: () => emitted.push("clear"),
      showDemoOver: () => {
        throw new Error("demo time was treated as over");
      },
    });
    expect(applied).toEqual([{ motion: "run", jumpActive: false, buffered: false }]);
    expect(emitted).toEqual(["clear", PHONE_ROUND_RESET, "run:again"]);
    expect(restarted).toBe(true);
  });

  it("is the function the Game Over button calls", () => {
    const source = readFileSync(new URL("./fitrunner-v2.tsx", import.meta.url), "utf8");
    const gameOver = readFileSync(new URL("./game-over.tsx", import.meta.url), "utf8");
    expect(gameOver).toContain("Play Again");
    expect(gameOver).toContain("onClick={onAgain}");
    expect(source).toContain("onAgain={playAgain}");
    expect(source).toContain("startPlayAgain({");
    expect(source).toContain("handleRef.current?.prepareReplay(clip)");
    expect(source).toContain("emitPhoneReset: () => session.emitRoundReset()");
  });
});
