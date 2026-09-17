// ============================================
// R2 S3 CLIENT (singleton)
// ============================================
// Cloudflare R2 speaks the S3 API. region is always "auto"; the account
// endpoint plus the access key pair is all that is required.

import { S3Client } from "@aws-sdk/client-s3";
import { getR2Config } from "./config";

let client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (client) return client;

  const config = getR2Config();
  client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

/** Test hook: drops the cached client. */
export function resetR2Client(): void {
  client = null;
}
