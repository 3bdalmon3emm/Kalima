import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { foldersService, pathIds } from "./folders.service";
import { mediaService } from "./media.service";

// Permanent delete from the archive page (Admin only). Only archived items can
// go.

class BankPurgeService {
  constructor(private db: PrismaClient = prisma) {}

  // An archived bank or folder with every folder and question under it.
  async purgeFolder(id: number) {
    const folder = await foldersService.getFolder(id);
    if (!folder.archived_at) throw new BadRequestError("Only archived items can be deleted permanently");

    const subtree = await this.db.qb_folders.findMany({
      where: { path: { startsWith: folder.path } },
      select: { id: true, path: true },
    });
    const folderIds = subtree.map((f) => f.id);

    const questions = await this.db.qb_questions.findMany({ where: { folder_id: { in: folderIds } }, select: { id: true } });
    const mediaIds = await this.removeQuestions(questions.map((q) => q.id), async (tx) => {
      // Deepest folders first: a folder cannot go while it still has children.
      const byDepth = [...subtree].sort((a, b) => pathIds(b.path).length - pathIds(a.path).length);
      for (const f of byDepth) await tx.qb_folders.delete({ where: { id: f.id } });
    });
    await mediaService.removeUnused(mediaIds);
  }

  // Archived questions; a passage takes its children with it.
  async purgeQuestions(ids: number[]) {
    const picked = await this.db.qb_questions.findMany({ where: { id: { in: ids } }, select: { id: true, archived_at: true } });
    if (picked.length !== new Set(ids).size) throw new NotFoundError("Question not found");
    if (picked.some((q) => !q.archived_at)) throw new BadRequestError("Only archived items can be deleted permanently");

    const children = await this.db.qb_questions.findMany({ where: { passage_id: { in: ids } }, select: { id: true } });
    const mediaIds = await this.removeQuestions([...ids, ...children.map((c) => c.id)]);
    await mediaService.removeUnused(mediaIds);
  }

  // Deletes the questions (children before passages) in one transaction, plus
  // anything extra the caller deletes after them. Returns their media ids.
  private async removeQuestions(
    ids: number[],
    after?: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<void>,
  ) {
    const unique = [...new Set(ids)];

    const rows = unique.length ? await this.db.qb_questions.findMany({
      where: { id: { in: unique } },
      select: {
        stem_image_id: true, stem_audio_id: true, explanation_image_id: true, model_answer_image_id: true,
        options: { select: { image_id: true } },
        matching_items: { select: { image_id: true, audio_id: true } },
      },
    }) : [];
    const mediaIds = rows.flatMap((q) => [
      q.stem_image_id, q.stem_audio_id, q.explanation_image_id, q.model_answer_image_id,
      ...q.options.map((o) => o.image_id),
      ...q.matching_items.flatMap((i) => [i.image_id, i.audio_id]),
    ]).filter((id): id is number => !!id);

    await this.db.$transaction(async (tx) => {
      if (unique.length) {
        await tx.qb_questions.deleteMany({ where: { id: { in: unique }, passage_id: { not: null } } });
        await tx.qb_questions.deleteMany({ where: { id: { in: unique } } });
      }
      if (after) await after(tx);
    }, { timeout: 5 * 60_000 });
    return mediaIds;
  }
}

export const bankPurgeService = new BankPurgeService();
