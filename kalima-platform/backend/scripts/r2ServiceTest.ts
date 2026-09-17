/*
 * R2 service integration test — drives the ACTUAL image / sample / e-booklet
 * services against real R2 using in-memory (mock) DBs, so it exercises the real
 * upload/serve/delete glue (key derivation, url shape, R2 calls) without needing
 * a local Postgres.
 *
 * Never prints the secret. Set env in your own shell, then run from backend/:
 *
 *   $env:R2_ACCOUNT_ID="ace2249774c4aa9099d8c8be3c834a57"
 *   $env:R2_ACCESS_KEY_ID="3d27223362c01646d57f920012342098"
 *   $env:R2_SECRET_ACCESS_KEY="<secret>"
 *   $env:R2_BUCKET="kalima-files"
 *   npx ts-node --transpile-only scripts/r2ServiceTest.ts
 */

process.env.STORAGE_BACKEND = "r2";
// Dummy so importing the services (which construct a Prisma client) doesn't
// throw. We never query it — every service under test gets a mock db.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://u:p@127.0.0.1:5432/db?schema=kalima";

import sharp from "sharp";
import { ImageService } from "../src/apps/store-api/services/image.service";
import { SampleService } from "../src/apps/store-api/services/sample.service";
import { EBookletService } from "../src/apps/store-api/services/e-booklet.service";
import { objectExists, getObjectBuffer, deleteObject } from "../src/libs/storage";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keyFromUrl = (url: string) => url.replace(/^\/uploads\//, "");

async function main() {
  // ---------- ImageService ----------
  const imgRows: any[] = [];
  const imgDb: any = {
    images: {
      create: async ({ data }: any) => {
        const row = { id: imgRows.length + 1, ...data };
        imgRows.push(row);
        return row;
      },
    },
  };
  const imageService = new ImageService(imgDb);
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  const image: any = await imageService.uploadImage({
    buffer: png,
    mimetype: "image/png",
    originalname: "unit.png",
    size: png.length,
  } as any);
  const imgKey = keyFromUrl(image.url);
  check("image: url shape /uploads/images/", image.url.startsWith("/uploads/images/"), image.url);
  check("image: object exists on R2", await objectExists(imgKey), imgKey);
  check("image: bytes round-trip", (await getObjectBuffer(imgKey)).equals(png));
  imageService.removeFileFromDisk(image.url); // fire-and-forget delete
  await sleep(1000);
  check("image: deleted from R2", !(await objectExists(imgKey)));

  // ---------- SampleService ----------
  const sampleService = new SampleService({} as any);
  const samplePdf = Buffer.from("%PDF-1.4\n% sample test file\n");
  const sampleUrl = await sampleService.saveFileToDisk(
    samplePdf,
    "application/pdf",
    "low_quality",
  );
  const sampleKey = keyFromUrl(sampleUrl);
  check("sample: url shape /uploads/samples/", sampleUrl.startsWith("/uploads/samples/"), sampleUrl);
  check("sample: object exists on R2", await objectExists(sampleKey), sampleKey);
  check("sample: bytes round-trip", (await getObjectBuffer(sampleKey)).equals(samplePdf));
  await deleteObject(sampleKey);

  // ---------- EBookletService (hotspot image asset) ----------
  const ebRows: any[] = [];
  const ebDb: any = {
    e_booklet_file_assets: {
      create: async ({ data }: any) => {
        const row = { id: ebRows.length + 1, ...data };
        ebRows.push(row);
        return row;
      },
    },
  };
  const ebService = new EBookletService(ebDb);
  const ebPng = await sharp({
    create: { width: 6, height: 6, channels: 3, background: { r: 90, g: 90, b: 90 } },
  })
    .png()
    .toBuffer();
  const asset: any = await ebService.createFileAsset(
    { buffer: ebPng, mimetype: "image/png", originalname: "hotspot.png", size: ebPng.length } as any,
    { fileType: "image" },
  );
  check(
    "ebooklet: storage_key shape e-booklets/private/",
    String(asset.storage_key).startsWith("e-booklets/private/"),
    asset.storage_key,
  );
  check("ebooklet: object exists on R2", await objectExists(asset.storage_key), asset.storage_key);
  check("ebooklet: bytes round-trip", (await getObjectBuffer(asset.storage_key)).equals(ebPng));
  await deleteObject(asset.storage_key);

  console.log(
    `\n${fail === 0 ? "🎉 ALL PASSED" : "⚠️ SOME FAILED"} — ${pass} passed, ${fail} failed`,
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
