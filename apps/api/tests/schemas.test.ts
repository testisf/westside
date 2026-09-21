/**
 * Zod schema tests — request validation, password policy.
 */

import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
} from "../src/schemas/index.ts";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const parsed = registerSchema.parse({
      email: "Alice@Example.com",
      username: "alice_99",
      password: "Correct-Horse-Battery-9!",
    });
    expect(parsed.email).toBe("alice@example.com"); // lowercased
    expect(parsed.username).toBe("alice_99");
  });

  it("rejects a short password", () => {
    expect(() =>
      registerSchema.parse({
        email: "alice@example.com",
        username: "alice",
        password: "Short1!",
      }),
    ).toThrow();
  });

  it("rejects a password containing 'password'", () => {
    expect(() =>
      registerSchema.parse({
        email: "alice@example.com",
        username: "alice",
        password: "Password-12345!",
      }),
    ).toThrow();
  });

  it("rejects a password without 3 character classes", () => {
    expect(() =>
      registerSchema.parse({
        email: "alice@example.com",
        username: "alice",
        password: "alllowercaseletters",
      }),
    ).toThrow();
  });

  it("rejects a password with whitespace", () => {
    expect(() =>
      registerSchema.parse({
        email: "alice@example.com",
        username: "alice",
        password: "Correct Horse Battery 9!",
      }),
    ).toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() =>
      registerSchema.parse({
        email: "not-an-email",
        username: "alice",
        password: "Correct-Horse-Battery-9!",
      }),
    ).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() =>
      registerSchema.parse({
        email: "alice@example.com",
        username: "alice",
        password: "Correct-Horse-Battery-9!",
        admin: true,
      }),
    ).toThrow();
  });

  it("rejects a short username", () => {
    expect(() =>
      registerSchema.parse({
        email: "alice@example.com",
        username: "ab",
        password: "Correct-Horse-Battery-9!",
      }),
    ).toThrow();
  });
});

describe("loginSchema", () => {
  it("accepts email or username", () => {
    expect(() =>
      loginSchema.parse({ identifier: "alice@example.com", password: "anything" }),
    ).not.toThrow();
    expect(() =>
      loginSchema.parse({ identifier: "alice", password: "anything" }),
    ).not.toThrow();
  });

  it("rejects an empty password", () => {
    expect(() =>
      loginSchema.parse({ identifier: "alice", password: "" }),
    ).toThrow();
  });
});

describe("refreshSchema", () => {
  it("accepts a non-empty token", () => {
    expect(() => refreshSchema.parse({ refreshToken: "abc" })).not.toThrow();
  });

  it("rejects an empty token", () => {
    expect(() => refreshSchema.parse({ refreshToken: "" })).toThrow();
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a valid reset request", () => {
    expect(() =>
      resetPasswordSchema.parse({
        token: "some-token",
        password: "Correct-Horse-Battery-9!",
      }),
    ).not.toThrow();
  });

  it("rejects a weak new password", () => {
    expect(() =>
      resetPasswordSchema.parse({ token: "x", password: "weak" }),
    ).toThrow();
  });
});

describe("verifyEmailSchema + forgotPasswordSchema", () => {
  it("verifyEmailSchema requires a token", () => {
    expect(() => verifyEmailSchema.parse({ token: "x" })).not.toThrow();
    expect(() => verifyEmailSchema.parse({})).toThrow();
  });

  it("forgotPasswordSchema requires a valid email", () => {
    expect(() => forgotPasswordSchema.parse({ email: "alice@example.com" })).not.toThrow();
    expect(() => forgotPasswordSchema.parse({ email: "nope" })).toThrow();
  });
});
