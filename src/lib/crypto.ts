import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "./env";

// AES-256-GCM. Stored layout: iv(12) | authTag(16) | ciphertext
const IV_BYTES = 12;
const TAG_BYTES = 16;

function masterKey(): Buffer {
  const hex = requireEnv("ENCRYPTION_KEY");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes as 64 hex characters — " +
        `got ${key.length} bytes. Regenerate with \`npm run setup:env\`.`,
    );
  }
  return key;
}

/**
 * Encrypt a credential for storage in a Bytes column. Returns a plain
 * Uint8Array because that is what Prisma 7 expects for Bytes — a Node Buffer
 * is typed over ArrayBufferLike and does not satisfy it.
 */
export function encryptSecret(plaintext: string): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Uint8Array.from(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
}

/** Decrypt a credential read back from a Bytes column. */
export function decryptSecret(stored: Uint8Array): string {
  const buf = Buffer.from(stored);
  if (buf.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Stored credential is truncated or corrupt");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Mask a token for logs: `ya29.a0Af...Xyz` -> `ya29****Xyz`. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-3)}`;
}
