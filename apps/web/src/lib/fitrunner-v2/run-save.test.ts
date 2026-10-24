import { describe, expect, it } from "vitest";
import { createOnce } from "./run-save";

describe("run save", () => {
  it("saves a completed run once", () => {
    const once = createOnce();
    let saves = 0;
    expect(
      once(() => {
        saves += 1;
      }),
    ).toBe(true);
    expect(
      once(() => {
        saves += 1;
      }),
    ).toBe(false);
    expect(saves).toBe(1);
  });
});
