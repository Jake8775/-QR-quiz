import { randomInt } from "crypto";

const PIN_LENGTH = 4;

// Plaintext, numeric-only -- distinct charset/length from generateJoinCode's
// 8-character letter+digit room code, so collision between the two is
// impossible by construction (still guarded explicitly where both are
// compared, per spec).
export function generateGroupPin(): string {
  let pin = "";
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += randomInt(0, 10).toString();
  }
  return pin;
}
