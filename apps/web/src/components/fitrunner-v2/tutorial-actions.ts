/** Lane steps accept the pose package's current names. Arm raises are emitted as leans. */
const LEFT_NAMES = new Set(["lean_left", "left_arm_raise", "arm_left", "raise_left", "left_raise"]);
const RIGHT_NAMES = new Set(["lean_right", "right_arm_raise", "arm_right", "raise_right", "right_raise"]);

export type TutorialGesture = "left" | "right" | "squat" | "jump";

export function tutorialGestureFor(movementType: string): TutorialGesture | null {
  const name = movementType.trim().toLowerCase();
  if (name === "squat") return "squat";
  if (name === "jump") return "jump";
  if (LEFT_NAMES.has(name) || (name.includes("left") && (name.includes("lean") || name.includes("arm") || name.includes("raise")))) {
    return "left";
  }
  if (RIGHT_NAMES.has(name) || (name.includes("right") && (name.includes("lean") || name.includes("arm") || name.includes("raise")))) {
    return "right";
  }
  return null;
}

export const TUTORIAL_LOCAL_KEY = "fitrunner-v2-tutorial-complete";

export const GESTURE_STEPS: Array<{ gesture: TutorialGesture; prompt: string; diagram: TutorialGesture }> = [
  { gesture: "left", prompt: "Raise your LEFT arm to move left.", diagram: "left" },
  { gesture: "right", prompt: "Raise your RIGHT arm to move right.", diagram: "right" },
  { gesture: "squat", prompt: "Squat down to duck under obstacles.", diagram: "squat" },
  { gesture: "jump", prompt: "Make a small jump to clear hurdles.", diagram: "jump" },
];
