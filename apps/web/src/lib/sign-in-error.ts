export type SignInBody = { message?: string; role?: string; mustChangePassword?: boolean };

export async function readSignInBody(response: Response): Promise<SignInBody | null> {
  try {
    const text = await response.text();
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as SignInBody;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signInFailureMessage(status: number, body: SignInBody | null) {
  if (status >= 500) return "Sign-in is unavailable right now. Try again in a moment.";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  return message || "Could not sign in.";
}
