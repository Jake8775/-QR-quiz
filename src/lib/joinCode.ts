import { randomInt } from "crypto";

// Excludes visually-confusable characters (0/O, 1/I/L) since this code may
// be read aloud or typed manually as a fallback to scanning the QR.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}
