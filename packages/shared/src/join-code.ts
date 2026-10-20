const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createJoinCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < 6) {
    throw new Error("Need at least 6 random bytes to create a join code");
  }
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ALPHABET[randomBytes[index]! % ALPHABET.length];
  }
  return code;
}

export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
