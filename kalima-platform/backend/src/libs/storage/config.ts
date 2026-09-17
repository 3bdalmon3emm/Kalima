// ============================================
// R2 / S3 STORAGE CONFIG
// ============================================
// Reads storage configuration from environment variables. Nothing here
// touches the running app until STORAGE_BACKEND is switched to "r2"; while
// it stays "local" the existing disk-based behaviour is unchanged.

export type StorageBackend = "local" | "r2";

export interface R2Config {
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Which backend serves and stores files. Defaults to "local" (no change). */
export function getStorageBackend(): StorageBackend {
  return process.env.STORAGE_BACKEND === "r2" ? "r2" : "local";
}

export function isR2Enabled(): boolean {
  return getStorageBackend() === "r2";
}

let cachedConfig: R2Config | null = null;

/**
 * Resolves and validates the R2 configuration. Throws when R2 is expected but
 * required env vars are missing, so misconfiguration fails loudly instead of
 * silently serving nothing.
 */
export function getR2Config(): R2Config {
  if (cachedConfig) return cachedConfig;

  const accountId = process.env.R2_ACCOUNT_ID?.trim() || "";
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const bucket = process.env.R2_BUCKET?.trim() || "kalima-files";

  const missing: string[] = [];
  if (!endpoint) missing.push("R2_ENDPOINT (or R2_ACCOUNT_ID)");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_BUCKET");
  if (missing.length > 0) {
    throw new Error(
      `R2 storage is enabled but required env vars are missing: ${missing.join(", ")}`,
    );
  }

  cachedConfig = { accountId, endpoint, accessKeyId, secretAccessKey, bucket };
  return cachedConfig;
}

/** Test hook: clears the memoised config so a new env can be read. */
export function resetStorageConfigCache(): void {
  cachedConfig = null;
}
