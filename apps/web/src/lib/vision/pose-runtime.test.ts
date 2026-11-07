import { afterEach, describe, expect, it, vi } from "vitest";
import {
  poseRuntimePhase,
  preloadPoseLandmarker,
  resetPoseRuntimeForTests,
  takePoseLandmarker,
} from "./pose-runtime";

const createFromOptions = vi.fn();

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks: vi.fn(async () => ({ wasm: true })),
  },
  PoseLandmarker: {
    createFromOptions: (...args: unknown[]) => createFromOptions(...args),
  },
}));

describe("pose runtime preload", () => {
  afterEach(() => {
    resetPoseRuntimeForTests();
    createFromOptions.mockReset();
    vi.unstubAllGlobals();
  });

  it("preloads once and hands the spare landmarker to the first take", async () => {
    const first = { detectForVideo: vi.fn(), close: vi.fn() };
    const second = { detectForVideo: vi.fn(), close: vi.fn() };
    createFromOptions.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    expect(poseRuntimePhase()).toBe("idle");
    await preloadPoseLandmarker();
    expect(poseRuntimePhase()).toBe("ready");
    expect(createFromOptions).toHaveBeenCalledTimes(1);

    const taken = await takePoseLandmarker();
    expect(taken.landmarker).toBe(first);
    expect(poseRuntimePhase()).toBe("idle");

    const again = await takePoseLandmarker();
    expect(again.landmarker).toBe(second);
    expect(createFromOptions).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight create across overlapping preload calls", async () => {
    let finish: ((value: { detectForVideo: () => void; close: () => void }) => void) | null = null;
    createFromOptions.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const a = preloadPoseLandmarker();
    const b = preloadPoseLandmarker();
    expect(poseRuntimePhase()).toBe("loading");
    await vi.waitFor(() => {
      expect(finish).toBeTypeOf("function");
    });
    finish!({ detectForVideo: vi.fn(), close: vi.fn() });
    await Promise.all([a, b]);
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(poseRuntimePhase()).toBe("ready");
  });
});
