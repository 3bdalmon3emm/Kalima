// ============================================
// R2 S3 CLIENT (singleton)
// ============================================
// Cloudflare R2 speaks the S3 API. region is always "auto"; the account
// endpoint plus the access key pair is all that is required.

import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpsAgent } from "https";
import { getR2Config } from "./config";

let client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (client) return client;

  const config = getR2Config();
  // Every proxied asset (page previews, hotspot media, covers, images) is a
  // GetObject through the backend, so one booklet page-load fans out into many
  // concurrent R2 requests. The AWS SDK's default socket pool (maxSockets = 50)
  // saturates under that load and requests queue for minutes ("socket usage at
  // capacity=50 and N additional requests are enqueued"), which surfaces to
  // users as nginx 504 timeouts. Raise the pool and keep connections alive.
  const maxSockets = Number(process.env.R2_MAX_SOCKETS) || 512;
  client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets }),
    }),
  });
  return client;
}

/** Test hook: drops the cached client. */
export function resetR2Client(): void {
  client = null;
}
