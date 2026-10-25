import { replayClip } from "./course-body";

export const PHONE_ROUND_RESET = "round:reset";

export type ReplayClip = ReturnType<typeof replayClip>;

export type PlayAgainActions = {
  /** Null means this account is not on the demo clock. Zero means the demo is used up. */
  demoSecondsLeft: number | null;
  /** Puts the course body on the ground in the run clip and drops a waiting jump or squat. */
  applyCourse: (clip: ReplayClip) => void;
  /** Tells the connected phone to clear its jump and squat machine. No reload. */
  emitPhoneReset: () => void;
  restartRun: () => void;
  clearRound: () => void;
  showDemoOver: () => void;
};

/**
 * Game Over "Play Again" calls this.
 * The course clip goes back to the run, and the phone is told to stand ready, before the next countdown.
 */
export function playAgain(actions: PlayAgainActions) {
  if (actions.demoSecondsLeft === 0) {
    actions.clearRound();
    actions.showDemoOver();
    return;
  }
  actions.clearRound();
  actions.applyCourse(replayClip());
  actions.emitPhoneReset();
  actions.restartRun();
}
