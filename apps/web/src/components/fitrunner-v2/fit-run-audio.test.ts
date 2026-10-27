import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FIT_RUN_BED_FILE,
  FIT_RUN_CUE_FILE,
  cueAfterLocalCall,
  fitRunBedAction,
  hearFitRunMove,
  type FitRunCueName,
} from "./fit-run-audio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

function sink() {
  const played: FitRunCueName[] = [];
  return {
    played,
    audio: {
      playCue(cue: FitRunCueName) {
        played.push(cue);
      },
    },
  };
}

describe("fit run phone audio", () => {
  it("plays the jump cue only when the jump is accepted", () => {
    const heard = sink();
    expect(
      hearFitRunMove(heard.audio, { call: "jump", direction: 0, accepted: true, soundOn: true }),
    ).toBe("jump");
    expect(heard.played).toEqual(["jump"]);
    expect(FIT_RUN_CUE_FILE.jump).toBe("01_jump_arcade.wav");
  });

  it("plays nothing for a rejected or cooldown gesture", () => {
    const heard = sink();
    expect(hearFitRunMove(heard.audio, { call: "jump", direction: 0, accepted: false, soundOn: true })).toBeNull();
    expect(hearFitRunMove(heard.audio, { call: "roll", direction: 0, accepted: false, soundOn: true })).toBeNull();
    expect(hearFitRunMove(heard.audio, { call: "step", direction: -1, accepted: false, soundOn: true })).toBeNull();
    expect(hearFitRunMove(heard.audio, { call: "step", direction: 1, accepted: false, soundOn: true })).toBeNull();
    expect(heard.played).toEqual([]);
    expect(cueAfterLocalCall("jump", 0, false, true)).toBeNull();
  });

  it("plays nothing while sound is off", () => {
    const heard = sink();
    expect(hearFitRunMove(heard.audio, { call: "jump", direction: 0, accepted: true, soundOn: false })).toBeNull();
    expect(hearFitRunMove(heard.audio, { call: "roll", direction: 0, accepted: true, soundOn: false })).toBeNull();
    expect(hearFitRunMove(heard.audio, { call: "step", direction: -1, accepted: true, soundOn: false })).toBeNull();
    expect(hearFitRunMove(heard.audio, { call: "step", direction: 1, accepted: true, soundOn: false })).toBeNull();
    expect(heard.played).toEqual([]);
    expect(
      fitRunBedAction({ phase: "running", coursePaused: false, buttonPaused: false, soundOn: false, ended: false }),
    ).toBe("pause");
  });

  it("maps squat and the player's left and right onto their cue files", () => {
    const heard = sink();
    hearFitRunMove(heard.audio, { call: "roll", direction: 0, accepted: true, soundOn: true });
    hearFitRunMove(heard.audio, { call: "step", direction: -1, accepted: true, soundOn: true });
    hearFitRunMove(heard.audio, { call: "step", direction: 1, accepted: true, soundOn: true });
    expect(heard.played).toEqual(["squat", "left", "right"]);
    expect(FIT_RUN_CUE_FILE).toEqual({
      jump: "01_jump_arcade.wav",
      squat: "02_squat_arcade.wav",
      left: "03_left_hand_arcade.wav",
      right: "04_right_hand_arcade.wav",
    });
  });

  it("loops only during the live run, pauses on mute or pause, and stops before GO and on game over", () => {
    const live = { phase: "running", coursePaused: false, buttonPaused: false, soundOn: true, ended: false };
    expect(fitRunBedAction(live)).toBe("play");
    expect(fitRunBedAction({ ...live, phase: "warning" })).toBe("play");
    expect(fitRunBedAction({ ...live, buttonPaused: true })).toBe("pause");
    expect(fitRunBedAction({ ...live, coursePaused: true })).toBe("pause");
    expect(fitRunBedAction({ ...live, phase: "reposition", coursePaused: true })).toBe("pause");
    expect(fitRunBedAction({ ...live, phase: "countdown", coursePaused: true })).toBe("pause");
    expect(fitRunBedAction({ ...live, phase: "countdown", coursePaused: false })).toBe("stop");
    expect(fitRunBedAction({ ...live, phase: "finding" })).toBe("stop");
    expect(fitRunBedAction({ ...live, phase: "ready" })).toBe("stop");
    expect(fitRunBedAction({ ...live, ended: true })).toBe("stop");
    expect(FIT_RUN_BED_FILE).toBe("PlayFit_Club_Arcade_Background_Loop.mp3");
  });

  it("copies the music folder into the public path without transcoding", () => {
    const files = [...Object.values(FIT_RUN_CUE_FILE), FIT_RUN_BED_FILE];
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, "music", file));
      const published = fs.readFileSync(path.join(root, "apps/web/public/audio/fit-run", file));
      expect(published.equals(source)).toBe(true);
    }
  });
});
