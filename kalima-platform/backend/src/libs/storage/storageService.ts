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
import { pipeline } from "stream/promises";
import { createWriteStream, promises as fsp } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
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

// ---------- Read whole object / download to temp ----------

/** Reads an entire object into a buffer. For small files only. */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { bucket } = getR2Config();
  let out;
  try {
    out = await getR2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (isNotFound(error)) throw new NotFoundError("File not found");
    throw error;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of out.Body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Downloads an object to a local temp file for tools that need a real path
 * (pdfinfo, PDF page rendering, sharp). The caller must call cleanup() when
 * done. Used for the rare cold path — most previews are pre-generated.
 */
export async function downloadToTempFile(
  key: string,
  ext = "",
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const { bucket } = getR2Config();
  let out;
  try {
    out = await getR2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (isNotFound(error)) throw new NotFoundError("File not found");
    throw error;
  }
  const tmpPath = path.join(
    os.tmpdir(),
    `r2-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`,
  );
  await pipeline(out.Body as Readable, createWriteStream(tmpPath));
  return {
    path: tmpPath,
    cleanup: async () => {
      try {
        await fsp.unlink(tmpPath);
      } catch {
        // best-effort
      }
    },
  };
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
  // Don't clobber headers a caller (e.g. a controller) already set before
  // handing off to the proxy; only fill in what's missing.
  const contentType = options.contentType || result.ContentType;
  if (contentType && !res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", contentType);
  }
  if (options.contentDisposition && !res.getHeader("Content-Disposition")) {
    res.setHeader("Content-Disposition", options.contentDisposition);
  }
  if (!res.getHeader("Cache-Control")) {
    res.setHeader("Cache-Control", options.cacheControl || "private, max-age=0");
  }

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
