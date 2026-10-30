import { describe, expect, it } from "vitest";
import { readSignInBody, signInFailureMessage } from "./sign-in-error";

describe("sign-in failure copy", () => {
  it("does not treat an empty 500 as a wrong password", async () => {
    const response = new Response("", { status: 500 });
    const body = await readSignInBody(response);
    expect(body).toBeNull();
    expect(signInFailureMessage(500, body)).toBe("Sign-in is unavailable right now. Try again in a moment.");
    expect(signInFailureMessage(500, { message: "Email or password is incorrect." })).toBe(
      "Sign-in is unavailable right now. Try again in a moment.",
    );
  });

  it("keeps a real rejection message for a client error", () => {
    expect(signInFailureMessage(401, { message: "Email or password is incorrect." })).toBe("Email or password is incorrect.");
    expect(signInFailureMessage(400, null)).toBe("Could not sign in.");
  });

  it("reads a JSON error and ignores a non-JSON body", async () => {
    const json = await readSignInBody(new Response('{"message":"Too many sign-in attempts."}', { status: 429 }));
    expect(json?.message).toBe("Too many sign-in attempts.");
    expect(await readSignInBody(new Response("upstream down", { status: 502 }))).toBeNull();
  });
});
