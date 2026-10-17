// Prepares the page images of delivered e-booklets that have none yet, so the
// first student to open a book does not wait for them to be generated.
//
// Dry run (counts only):
//   node dist/src/scripts/backfillEBookletPagePreviews.js
// Generate, one book at a time (newest first), stop after 2 hours:
//   node dist/src/scripts/backfillEBookletPagePreviews.js --apply --max-minutes=120
// Optional: --limit=50 to process at most 50 books in this run.
//
// Safe to stop (Ctrl+C) and run again: books that already have images are skipped.

import { prisma } from "../libs/db/prisma";
import { getEBookletService } from "../apps/store-api/services/e-booklet.service";

function numberArg(name: string): number | null {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const limit = numberArg("limit");
  const maxMinutes = numberArg("max-minutes");
  const startedAt = Date.now();

  const instances = await prisma.e_booklet_instances.findMany({
    where: { status: "active", custom_document_file_id: { not: null } },
    select: { id: true, custom_document_file_id: true, template_version_id: true },
    orderBy: { id: "desc" },
  });

  // Several instances can share one document; process each document once.
  const seen = new Set<number>();
  const pending: Array<{ assetId: number; templateVersionId: number }> = [];
  for (const instance of instances) {
    const assetId = Number(instance.custom_document_file_id);
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    const existing = await prisma.e_booklet_page_previews.count({
      where: { document_file_id: assetId, size_key: "default" },
    });
    if (existing === 0) {
      pending.push({ assetId, templateVersionId: Number(instance.template_version_id) });
    }
  }

  console.log(`Active delivered books: ${instances.length}, documents without page images: ${pending.length}`);
  if (!apply) {
    console.log("Dry run. Re-run with --apply to generate.");
    await prisma.$disconnect();
    return;
  }

  const service = getEBookletService();
  const todo = limit ? pending.slice(0, limit) : pending;
  let done = 0;
  let failed = 0;
  for (const item of todo) {
    if (maxMinutes && Date.now() - startedAt > maxMinutes * 60_000) {
      console.log(`Time limit of ${maxMinutes} min reached, stopping.`);
      break;
    }
    const itemStart = Date.now();
    try {
      const result = await service.ensureDocumentPagePreviews(item.assetId, item.templateVersionId);
      if (result.generated) done += 1;
      else failed += 1;
      console.log(
        `[${done + failed}/${todo.length}] asset ${item.assetId}: ${result.generated ? `ok (${result.count} pages)` : "no images produced"} in ${Math.round((Date.now() - itemStart) / 1000)}s`,
      );
    } catch (error) {
      failed += 1;
      console.error(`asset ${item.assetId} failed:`, (error as Error).message);
    }
  }

  console.log(`Finished. Generated: ${done}, failed: ${failed}, remaining: ${pending.length - done - failed}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
