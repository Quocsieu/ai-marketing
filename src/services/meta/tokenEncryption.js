const crypto = require("node:crypto");

function encryptionKey() {
  const value = process.env.META_TOKEN_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw Object.assign(new Error("META_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters."), {
      status: 503,
      code: "META_ENCRYPTION_NOT_CONFIGURED",
    });
  }
  return Buffer.from(value, "hex");
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
}

function decryptToken(encrypted) {
  const [version, encodedIv, encodedTag, encodedValue] = String(encrypted).split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedValue) {
    throw new Error("Stored Meta credential has an unsupported format.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = { encryptToken, decryptToken };
