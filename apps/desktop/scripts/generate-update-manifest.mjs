#!/usr/bin/env node
/**
 * Westside — update manifest generator.
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs \
 *     --version 0.4.1 \
 *     --notes "Fixes login crash; adds PTT hotkey remap UI." \
 *     --input  ./releases/Westside_0.4.1_x64-setup.exe \
 *     --output ./manifests/manifest.json
 *
 * The script:
 *   1. Reads the binary file, computes SHA-256.
 *   2. Signs the SHA-256 hash with the ED25519 private key located at
 *      $WESTSIDE_UPDATE_PRIVATE_KEY (path) — base64-encoded detached signature.
 *   3. Emits a JSON manifest compatible with Tauri's updater plugin.
 *
 * The private key NEVER ships in the binary or repo. Operators keep it in a
 * secrets manager. The corresponding public key is baked into the binary at
 * build time via `tauri.conf.json -> plugins.updater.pubkey`.
 *
 * If $WESTSIDE_UPDATE_PRIVATE_KEY is unset, the script writes an unsigned
 * manifest with `signature: ""` — useful for dev/testing but NOT for production.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));

if (!args.version || !args.input || !args.output) {
  console.error("Usage: generate-update-manifest.mjs --version X.Y.Z --input FILE --output FILE [--notes STRING]");
  process.exit(1);
}

if (!existsSync(args.input)) {
  console.error(`Input file not found: ${args.input}`);
  process.exit(1);
}

const binary = readFileSync(args.input);
const sha256 = createHash("sha256").update(binary).digest("hex");

// Determine platform key from filename suffix.
const filename = args.input.toLowerCase();
let platformKey = "";
if (filename.endsWith("-setup.exe") || filename.endsWith(".msi")) platformKey = "windows-x86_64";
else if (filename.endsWith(".app.tar.gz") || filename.endsWith(".dmg")) platformKey = "darwin-x86_64";
else if (filename.endsWith(".deb") || filename.endsWith(".rpm") || filename.endsWith(".appimage"))
  platformKey = "linux-x86_64";

if (!platformKey) {
  console.error(`Could not infer platform from filename: ${args.input}`);
  console.error("Expected suffixes: -setup.exe / .msi / .app.tar.gz / .deb / .rpm / .AppImage");
  process.exit(1);
}

// Determine URL where this binary will be hosted.
const basename = args.input.split("/").pop();
const url = `https://updates.westside.example/desktop/${args.version}/${basename}`;

// Sign the SHA-256 hash if a private key is available.
let signature = "";
const keyPath = process.env.WESTSIDE_UPDATE_PRIVATE_KEY;
if (keyPath && existsSync(keyPath)) {
  try {
    const { sign } = await import("tweetnacl");
    const keyB64 = readFileSync(keyPath, "utf8").trim();
    const keyBytes = Buffer.from(keyB64, "base64");
    if (keyBytes.length !== 64) {
      console.error(`Private key must be 64 bytes (ed25519); got ${keyBytes.length}`);
      process.exit(1);
    }
    const sigBytes = sign.detached(Buffer.from(sha256, "utf8"), keyBytes);
    signature = Buffer.from(sigBytes).toString("base64");
    console.log(`✓ signed manifest with key at ${keyPath}`);
  } catch (e) {
    console.error(`Failed to sign: ${e.message}`);
    console.error("Install `tweetnacl` to enable signing: pnpm add -w tweetnacl");
    process.exit(1);
  }
} else {
  console.warn("⚠ WESTSIDE_UPDATE_PRIVATE_KEY env var not set or path does not exist.");
  console.warn("⚠ Emitting UNSIGNED manifest. Do NOT use in production.");
}

const manifest = {
  version: args.version,
  notes: args.notes ?? "",
  pub_date: new Date().toISOString(),
  platforms: {
    [platformKey]: {
      signature,
      url,
    },
  },
  min_required_version: "0.4.0",
};

writeFileSync(args.output, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✓ manifest written: ${args.output}`);
console.log(`  version: ${args.version}`);
console.log(`  platform: ${platformKey}`);
console.log(`  sha256: ${sha256}`);
console.log(`  url: ${url}`);
console.log(`  signature: ${signature ? "(present)" : "(none)"}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        out[key] = val;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}
