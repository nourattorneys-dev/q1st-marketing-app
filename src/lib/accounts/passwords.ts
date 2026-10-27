import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Spec M5c: scrypt from node:crypto (no package, no native module for the cPanel host). The stored form names its
// settings, so they can be raised later without breaking existing passwords.
const COST_LOG2 = 15;
const BLOCK_SIZE = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// 128 × N × r = 32 MiB for N = 2^15 and r = 8: exactly Node's default ceiling, so it's raised.
const MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;
export type PasswordProblem = "short" | "long" | "email";

type Settings = { logN: number; r: number; p: number };

function derive(password: string, salt: Buffer, settings: Settings, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFKC: the same password typed on another keyboard (a letter plus an accent, Arabic forms) gives the same bytes.
    scrypt(password.normalize("NFKC"), salt, length, { N: 2 ** settings.logN, r: settings.r, p: settings.p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, { logN: COST_LOG2, r: BLOCK_SIZE, p: PARALLEL }, KEY_LENGTH);
  return ["scrypt", COST_LOG2, BLOCK_SIZE, PARALLEL, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, key] = stored.split("$");
  const settings = { logN: Number(logN), r: Number(r), p: Number(p) };
  if (scheme !== "scrypt" || !salt || !key) return false;
  if (![settings.logN, settings.r, settings.p].every(Number.isInteger) || settings.logN < 10 || settings.logN > 20 || settings.r < 1 || settings.r > 32 || settings.p !== 1) return false;
  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  return timingSafeEqual(await derive(password, Buffer.from(salt, "base64url"), settings, expected.length), expected);
}

let dummy: Promise<string> | null = null;

/** A real hash of a random password: an unknown email is checked against it, so the time taken gives nothing away. */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(randomBytes(24).toString("base64url")));
}

/** 10 to 200 characters (code points: an emoji or an Arabic letter is one), never trimmed, and not the email. */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return "short";
  if (length > PASSWORD_MAX) return "long";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "email";
  return null;
}
