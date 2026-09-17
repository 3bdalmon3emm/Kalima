// ============================================
// STORAGE SERVICE (R2)
// ============================================
// Thin wrapper over the S3 API for the operations the platform needs:
// upload, presigned download URL, streaming proxy (with HTTP Range support for
// video seeking), delete and existence check.

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presignUrl } from "@aws-sdk/s3-request-presigner";
import type { Request, Response } from "express";
import { Readable } from "stream";
import { getR2Client } from "./r2Client";
import { getR2Config } from "./config";
import { NotFoundError } from "../errors";

// ---------- Upload ----------

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | Readable;
  contentType?: string;
  contentLength?: number;
}

export async function putObject(input: PutObjectInput): Promise<void> {
  const { bucket } = getR2Config();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }),
  );
}

// ---------- Delete / exists ----------

export async function deleteObject(key: string): Promise<void> {
  const { bucket } = getR2Config();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  const { bucket } = getR2Config();
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

// ---------- Signed download URL ----------

export interface SignedUrlOptions {
  /** Link lifetime in seconds. */
  expiresIn: number;
  /** Overrides the stored Content-Type on the response. */
  contentType?: string;
  /** Sets Content-Disposition (e.g. attachment; filename="..."). */
  contentDisposition?: string;
}

/**
 * Returns a short-lived presigned GET URL. Content-Type / Content-Disposition
 * are baked into the signed query so they survive on the direct R2 response
 * (a plain redirect would otherwise drop them).
 */
export async function getSignedDownloadUrl(
  key: string,
  options: SignedUrlOptions,
): Promise<string> {
  const { bucket } = getR2Config();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: options.contentType,
    ResponseContentDisposition: options.contentDisposition,
  });
  return presignUrl(getR2Client(), command, { expiresIn: options.expiresIn });
}

// ---------- Streaming proxy (with Range) ----------

export interface ProxyOptions {
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
}

/**
 * Streams an object through the backend. Forwards the client's Range header so
 * partial requests (video seeking) work, and mirrors R2's 206 / Content-Range
 * response. Throws NotFoundError when the key is missing.
 */
export async function proxyObject(
  key: string,
  req: Request,
  res: Response,
  options: ProxyOptions = {},
): Promise<void> {
  const { bucket } = getR2Config();
  const range = req.headers.range;

  let result;
  try {
    result = await getR2Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }),
    );
  } catch (error) {
    if (isNotFound(error)) throw new NotFoundError("File not found");
    throw error;
  }

  if (range && result.ContentRange) {
    res.status(206);
    res.setHeader("Content-Range", result.ContentRange);
  } else {
    res.status(200);
  }
  res.setHeader("Accept-Ranges", "bytes");
  if (result.ContentLength != null) {
    res.setHeader("Content-Length", String(result.ContentLength));
  }
  const contentType = options.contentType || result.ContentType;
  if (contentType) res.setHeader("Content-Type", contentType);
  if (options.contentDisposition) {
    res.setHeader("Content-Disposition", options.contentDisposition);
  }
  res.setHeader("Cache-Control", options.cacheControl || "private, max-age=0");

  const body = result.Body as Readable;
  // Stop pulling from R2 if the client disconnects mid-stream.
  res.on("close", () => body.destroy());
  body.on("error", () => {
    if (!res.headersSent) res.status(502);
    res.end();
  });
  body.pipe(res);
}

// ---------- Helpers ----------

function isNotFound(error: unknown): boolean {
  const e = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.Code === "NoSuchKey" ||
    e?.$metadata?.httpStatusCode === 404
  );
}
