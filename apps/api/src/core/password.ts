import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const HASH_PREFIX = "scrypt";

// Default credential assigned to the seeded demo accounts. Overridable via env for
// non-demo deployments; newly created accounts always receive a random password
// (see generatePassword).
const BUILT_IN_DEMO_SEED = "1234567890";
export const DEFAULT_SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? BUILT_IN_DEMO_SEED;

// Avoid visually ambiguous characters (0/O, 1/l/I) so a generated password can be
// read aloud or copied from screen without confusion.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(plain, salt, KEY_LENGTH);
  return `${HASH_PREFIX}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
    return false;
  }

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const derived = scryptSync(plain, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  let password = "";
  for (let index = 0; index < length; index += 1) {
    password += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return password;
}
