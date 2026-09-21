/**
 * TOTP / MFA tests.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as OTPAuth from "otpauth";
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  verifyTotpCode,
  issueMfaTicket,
  consumeMfaTicket,
} from "../src/modules/mfa/index.ts";

const cfg = {
  jwt: {
    privateKeyPem: readFileSync(join(process.cwd(), "..", "..", ".keys", "jwt-private.pem"), "utf8"),
    issuer: "westside-test",
  },
} as any;

describe("MFA secret encryption", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptSecret(plaintext, cfg);
    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.split(":").length).toBe(3); // iv:tag:ciphertext
    const decrypted = decryptSecret(encrypted, cfg);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP", cfg);
    const b = encryptSecret("JBSWY3DPEHPK3PXP", cfg);
    expect(a).not.toBe(b);
  });
});

describe("TOTP generation + verification", () => {
  it("generates a secret, encrypts it, and verifies a current code", () => {
    const { secret, encrypted, uri } = generateTotpSecret("alice", cfg);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(uri).toContain("otpauth://totp/");
    expect(encrypted).not.toContain(secret);

    // Generate the current valid TOTP code from the secret.
    const totp = new OTPAuth.TOTP({
      issuer: "westside-test",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const code = totp.generate();
    expect(code).toMatch(/^\d{6}$/);

    expect(verifyTotpCode(code, encrypted, cfg)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const { encrypted } = generateTotpSecret("bob", cfg);
    expect(verifyTotpCode("000000", encrypted, cfg)).toBe(false);
  });

  it("rejects a malformed secret blob", () => {
    expect(verifyTotpCode("123456", "not-a-valid-blob", cfg)).toBe(false);
  });
});

describe("MFA tickets", () => {
  it("issues a ticket that can be consumed exactly once", () => {
    const ticket = issueMfaTicket("user-1");
    expect(ticket).toMatch(/^[0-9a-f]{48}$/);
    expect(consumeMfaTicket(ticket)).toBe("user-1");
    expect(consumeMfaTicket(ticket)).toBe(null); // already consumed
  });

  it("returns null for an unknown ticket", () => {
    expect(consumeMfaTicket("nonexistent")).toBe(null);
  });
});
