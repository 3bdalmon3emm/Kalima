/*
 * R2 connection smoke test.
 *
 * Verifies the backend can talk to Cloudflare R2 end to end:
 *   put -> head -> presigned GET (fetch) -> streamed GET -> delete
 *
 * It NEVER prints your secret. Set the env vars in your own shell, then run:
 *
 *   Windows PowerShell:
 *     $env:R2_ACCOUNT_ID="ace2249774c4aa9099d8c8be3c834a57"
 *     $env:R2_ACCESS_KEY_ID="3d27223362c01646d57f920012342098"
 *     $env:R2_SECRET_ACCESS_KEY="<paste-your-secret-here>"
 *     $env:R2_BUCKET="kalima-files"
 *     node scripts/r2SmokeTest.js
 *
 *   Git Bash / Linux / macOS:
 *     R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=kalima-files \
 *       node scripts/r2SmokeTest.js
 */

const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function fail(step, error) {
  console.error(`❌ ${step}`);
  console.error("   " + (error && error.message ? error.message : String(error)));
  process.exit(1);
}

async function streamToString(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const endpoint =
    (process.env.R2_ENDPOINT || "").trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.R2_BUCKET || "kalima-files").trim();

  const missing = [];
  if (!endpoint) missing.push("R2_ENDPOINT (or R2_ACCOUNT_ID)");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (missing.length) fail("config", new Error("Missing env vars: " + missing.join(", ")));

  console.log(`endpoint: ${endpoint}`);
  console.log(`bucket:   ${bucket}`);
  console.log(`accessKeyId: ${accessKeyId.slice(0, 6)}... (secret hidden)\n`);

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const key = `__healthcheck__/smoke-${Date.now()}.txt`;
  const payload = `r2-smoke-test ${new Date().toISOString()}`;

  // 1) put
  try {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: payload, ContentType: "text/plain" }),
    );
    console.log("✅ put    — uploaded test object");
  } catch (e) {
    fail("put — upload failed (check keys / bucket name / permissions)", e);
  }

  // 2) head
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    console.log("✅ head   — object exists");
  } catch (e) {
    fail("head — object not found after upload", e);
  }

  // 3) presigned GET + fetch
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 120 },
    );
    const res = await fetch(url);
    const text = await res.text();
    if (res.status !== 200 || text !== payload) {
      throw new Error(`unexpected response: status=${res.status}`);
    }
    console.log("✅ signed — presigned URL downloaded correctly");
  } catch (e) {
    fail("signed — presigned URL did not return the object", e);
  }

  // 4) streamed GET (proxy path)
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await streamToString(out.Body);
    if (text !== payload) throw new Error("streamed body mismatch");
    console.log("✅ stream — proxy download correct");
  } catch (e) {
    fail("stream — proxy download failed", e);
  }

  // 5) delete (cleanup)
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log("✅ delete — test object removed");
  } catch (e) {
    fail("delete — cleanup failed (object may remain)", e);
  }

  console.log("\n🎉 R2 connection OK — all operations succeeded.");
}

main().catch((e) => fail("unexpected", e));
