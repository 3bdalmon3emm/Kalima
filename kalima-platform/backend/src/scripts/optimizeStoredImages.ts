// Downsizes images that were uploaded before automatic optimisation existed.
//
// Dry run (counts and sizes from the DB, downloads nothing):
//   node dist/src/scripts/optimizeStoredImages.js
// Do it, biggest first, stop after 2 hours:
//   node dist/src/scripts/optimizeStoredImages.js --apply --max-minutes=120
//
// Options:
//   --only=products,samples,covers,receipts   (default: products,samples,covers)
//   --min-kb=300     only images larger than this are touched (default 300)
//   --limit=50       at most this many images in this run
//
// Safety: every image is written to a NEW key (-opt-xxxxxx.webp) and only then
// does the database row point to it. The original object is never deleted, so
// any image can be put back by restoring its old URL. A JSON report lists every
// change (old and new key/size). Safe to stop and re-run: converted images are
// WebP and are skipped.
//
// "receipts" (customer payment screenshots) is NOT in the default set; ask for
// it explicitly with --only=receipts.

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { prisma } from "../libs/db/prisma";
import { getObjectBuffer, putObject, isR2Enabled, normalizeStorageKey } from "../libs/storage";
import { IMAGE_SIZES, optimizeImage, type OptimizeOptions } from "../libs/imageOptimize";

type Group = "products" | "samples" | "covers" | "receipts";

interface Candidate {
  group: Group;
  table: "images" | "samples" | "e_booklet_file_assets";
  id: number;
  key: string; // current R2 object key
  size: number;
  mime: string;
  options: OptimizeOptions;
}

const UNKNOWN_SIZE = Number.MAX_SAFE_INTEGER;

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const num = (name: string, fallback: number | null): number | null => {
  const v = Number(arg(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const SKIP_MIMES = new Set(["image/webp", "image/svg+xml", "image/gif", "webp", "svg", "gif"]);

function newKeyFor(oldKey: string): string {
  const dir = path.posix.dirname(oldKey);
  const base = path.posix.basename(oldKey, path.posix.extname(oldKey));
  return `${dir}/${base}-opt-${crypto.randomBytes(3).toString("hex")}.webp`;
}

async function collect(groups: Group[], minBytes: number): Promise<Candidate[]> {
  const found: Candidate[] = [];
  const add = (c: Candidate) => {
    if (c.size > minBytes && !SKIP_MIMES.has(c.mime) && c.key && !/^https?:/i.test(c.key)) found.push(c);
  };
  const imageSelect = { id: true, url: true, size: true, mime_type: true } as const;

  if (groups.includes("products")) {
    const thumbs = await prisma.products.findMany({
      where: { thumbnail_id: { not: null } },
      select: { thumbnail_image: { select: imageSelect } },
    });
    for (const p of thumbs) {
      const i = p.thumbnail_image;
      if (i) add({ group: "products", table: "images", id: i.id, key: normalizeStorageKey(i.url), size: i.size, mime: String(i.mime_type), options: IMAGE_SIZES.productThumbnail });
    }
    const gallery = await prisma.product_gallery.findMany({ select: { images: { select: imageSelect } } });
    for (const g of gallery) {
      const i = g.images;
      if (i) add({ group: "products", table: "images", id: i.id, key: normalizeStorageKey(i.url), size: i.size, mime: String(i.mime_type), options: IMAGE_SIZES.productGallery });
    }
  }

  if (groups.includes("samples")) {
    const samples = await prisma.samples.findMany({
      where: { thumbnail_url: { not: null } },
      select: { id: true, thumbnail_url: true },
    });
    for (const s of samples) {
      const key = normalizeStorageKey(String(s.thumbnail_url));
      const ext = path.posix.extname(key).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "unknown";
      // The size of sample thumbnails is not stored: treat as a candidate and let
      // the real download decide whether it is worth converting.
      add({ group: "samples", table: "samples", id: s.id, key, size: UNKNOWN_SIZE, mime, options: IMAGE_SIZES.sampleThumbnail });
    }
  }

  if (groups.includes("covers")) {
    const templates = await prisma.e_booklet_templates.findMany({
      where: { cover_file_id: { not: null } },
      select: { cover_file: { select: { id: true, storage_key: true, size_bytes: true, mime_type: true, file_type: true } } },
    });
    for (const t of templates) {
      const a = t.cover_file;
      if (a && String(a.file_type) === "image") {
        add({ group: "covers", table: "e_booklet_file_assets", id: a.id, key: normalizeStorageKey(a.storage_key), size: a.size_bytes, mime: a.mime_type, options: IMAGE_SIZES.eBookletCover });
      }
    }
  }

  if (groups.includes("receipts")) {
    const [shop, booklet] = await Promise.all([
      prisma.purchases.findMany({ where: { payment_screenshot_id: { not: null } }, select: { payment_screenshot: { select: imageSelect } } }),
      prisma.e_booklet_purchases.findMany({ where: { payment_screenshot_id: { not: null } }, select: { payment_screenshot: { select: imageSelect } } }),
    ]);
    for (const row of [...shop, ...booklet]) {
      const i = row.payment_screenshot;
      if (i) add({ group: "receipts", table: "images", id: i.id, key: normalizeStorageKey(i.url), size: i.size, mime: String(i.mime_type), options: IMAGE_SIZES.paymentReceipt });
    }
  }

  // one entry per stored object, biggest first
  const unique = new Map<string, Candidate>();
  for (const c of found) if (!unique.has(`${c.table}:${c.id}`)) unique.set(`${c.table}:${c.id}`, c);
  return [...unique.values()].sort((a, b) => b.size - a.size);
}

async function main(): Promise<void> {
  if (!isR2Enabled()) {
    console.error("R2 storage is not enabled in this environment; nothing to do.");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const groups = (arg("only") ?? "products,samples,covers").split(",").map((g) => g.trim()) as Group[];
  const minBytes = (num("min-kb", 300) as number) * 1024;
  const limit = num("limit", null);
  const maxMinutes = num("max-minutes", null);
  const startedAt = Date.now();

  const candidates = await collect(groups, minBytes);
  const known = candidates.filter((c) => c.size !== UNKNOWN_SIZE);
  const knownBytes = known.reduce((sum, c) => sum + c.size, 0);
  console.log(`Groups: ${groups.join(", ")}`);
  console.log(`Candidate images: ${candidates.length} (sizes known for ${known.length}: ${(knownBytes / 1048576).toFixed(0)} MB)`);
  if (!apply) {
    console.log("Dry run. Re-run with --apply to convert (originals are kept).");
    await prisma.$disconnect();
    return;
  }

  const report: unknown[] = [];
  const reportPath = path.join(os.tmpdir(), `image-optimize-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;
  const work = limit ? candidates.slice(0, limit) : candidates;

  for (const c of work) {
    if (maxMinutes && Date.now() - startedAt > maxMinutes * 60_000) {
      console.log(`Time limit of ${maxMinutes} min reached, stopping.`);
      break;
    }
    try {
      const original = await getObjectBuffer(c.key);
      const result = await optimizeImage(original, c.mime.startsWith("image/") ? c.mime : "image/png", c.options);
      if (!result.changed || result.buffer.length > original.length * 0.9) {
        skipped += 1;
        continue;
      }
      const newKey = newKeyFor(c.key);
      await putObject({ key: newKey, body: result.buffer, contentType: result.mimeType });

      if (c.table === "images") {
        await prisma.images.update({ where: { id: c.id }, data: { url: `/uploads/${newKey}`, mime_type: "webp", size: result.buffer.length } });
      } else if (c.table === "samples") {
        await prisma.samples.update({ where: { id: c.id }, data: { thumbnail_url: `/uploads/${newKey}` } });
      } else {
        await prisma.e_booklet_file_assets.update({ where: { id: c.id }, data: { storage_key: newKey, mime_type: result.mimeType, size_bytes: result.buffer.length } });
      }

      converted += 1;
      savedBytes += original.length - result.buffer.length;
      report.push({ group: c.group, table: c.table, id: c.id, oldKey: c.key, newKey, oldBytes: original.length, newBytes: result.buffer.length });
      console.log(`[${converted}] ${c.table}#${c.id} ${(original.length / 1024).toFixed(0)}KB -> ${(result.buffer.length / 1024).toFixed(0)}KB`);
    } catch (error) {
      failed += 1;
      console.error(`${c.table}#${c.id} (${c.key}) failed:`, (error as Error).message);
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Done. Converted: ${converted}, skipped: ${skipped}, failed: ${failed}, saved: ${(savedBytes / 1048576).toFixed(0)} MB`);
  console.log(`Report: ${reportPath}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
