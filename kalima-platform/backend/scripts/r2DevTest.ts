/*
 * R2 dev test — exercises the ACTUAL storage code paths the migration relies on
 * (signed URL, streaming proxy, HTTP Range, buffer read, temp download) against
 * real R2, in-process, without booting the full backend or a database.
 *
 * Never prints the secret. Set env in your own shell, then run from backend/:
 *
 *   $env:R2_ACCOUNT_ID="ace2249774c4aa9099d8c8be3c834a57"
 *   $env:R2_ACCESS_KEY_ID="3d27223362c01646d57f920012342098"
 *   $env:R2_SECRET_ACCESS_KEY="<secret>"
 *   $env:R2_BUCKET="kalima-files"
 *   npx ts-node --transpile-only scripts/r2DevTest.ts
 */

process.env.STORAGE_BACKEND = "r2";

import express from "express";
import { promises as fs } from "fs";
import {
  putObject,
  deleteObject,
  getSignedDownloadUrl,
  proxyObject,
  getObjectBuffer,
  downloadToTempFile,
} from "../src/libs/storage";

async function main() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean, extra = "") => {
    if (cond) {
      console.log("✅ " + name);
      pass++;
    } else {
      console.log("❌ " + name + (extra ? "  (" + extra + ")" : ""));
      fail++;
    }
  };

  // ~300 KB deterministic payload so Range slices are verifiable.
  const payload = Buffer.alloc(300 * 1024);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
  const key = `__dev-test__/serve-${Date.now()}.bin`;

  await putObject({ key, body: payload, contentType: "application/octet-stream" });
  console.log("uploaded test object: " + key + "\n");

  const app = express();
  app.get("/proxy/*", async (req, res, next) => {
    try {
      await proxyObject(decodeURIComponent((req.params as any)[0]), req, res);
    } catch (e) {
      next(e);
    }
  });
  app.get("/signed/*", async (req, res, next) => {
    try {
      const url = await getSignedDownloadUrl(decodeURIComponent((req.params as any)[0]), {
        expiresIn: 120,
      });
      res.redirect(302, url);
    } catch (e) {
      next(e);
    }
  });
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  const enc = encodeURIComponent(key);

  try {
    // 1) Signed URL redirect + direct R2 download
    const r1 = await fetch(`${base}/signed/${enc}`, { redirect: "manual" });
    check("signed: returns 302", r1.status === 302, `status ${r1.status}`);
    const loc = r1.headers.get("location") || "";
    check("signed: points at R2", loc.includes("r2.cloudflarestorage.com"));
    const d1 = Buffer.from(await (await fetch(loc)).arrayBuffer());
    check("signed: downloaded bytes match", d1.equals(payload), `len ${d1.length}`);

    // 2) Proxy full stream
    const r2 = await fetch(`${base}/proxy/${enc}`);
    const d2 = Buffer.from(await r2.arrayBuffer());
    check("proxy: status 200", r2.status === 200, `status ${r2.status}`);
    check("proxy: full bytes match", d2.equals(payload), `len ${d2.length}`);
    check("proxy: Accept-Ranges=bytes", (r2.headers.get("accept-ranges") || "") === "bytes");

    // 3) Proxy Range request (video seeking)
    const r3 = await fetch(`${base}/proxy/${enc}`, { headers: { Range: "bytes=100-199" } });
    const d3 = Buffer.from(await r3.arrayBuffer());
    check("range: status 206", r3.status === 206, `status ${r3.status}`);
    check("range: 100 bytes returned", d3.length === 100, `len ${d3.length}`);
    check("range: bytes match slice", d3.equals(payload.subarray(100, 200)));
    check(
      "range: Content-Range header",
      (r3.headers.get("content-range") || "").startsWith("bytes 100-199/"),
      r3.headers.get("content-range") || "none",
    );

    // 4) getObjectBuffer
    const gb = await getObjectBuffer(key);
    check("getObjectBuffer: matches", gb.equals(payload));

    // 5) downloadToTempFile + cleanup
    const tmp = await downloadToTempFile(key, ".bin");
    const tb = await fs.readFile(tmp.path);
    check("downloadToTempFile: matches", tb.equals(payload));
    await tmp.cleanup();
    const stillThere = await fs
      .stat(tmp.path)
      .then(() => true)
      .catch(() => false);
    check("downloadToTempFile: temp cleaned up", !stillThere);
  } finally {
    server.close();
    await deleteObject(key).catch(() => {});
  }

  console.log(`\n${fail === 0 ? "🎉 ALL PASSED" : "⚠️ SOME FAILED"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
