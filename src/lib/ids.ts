import { randomBytes } from "node:crypto";

// No 0/O, 1/l/I: tracking codes get read aloud and retyped.
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

/** Unguessable token for a side's private swap link (144 bits). */
export function newAccessToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Short code for a tracking redirect, like /r/k7Pq2xa. */
export function newTrackingCode(length = 7): string {
  let out = "";
  for (const byte of randomBytes(length)) {
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}
