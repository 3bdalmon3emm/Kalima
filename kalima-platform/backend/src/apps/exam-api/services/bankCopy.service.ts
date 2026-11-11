import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError } from "../../../libs/errors";
import { foldersService, pathIds } from "./folders.service";
import { questionsService } from "./questions.service";

// Copies a whole bank into a new, independent bank: visible folders with
// their levels, categories, and live questions. Media files are shared, not
// uploaded again. Archived folders and questions are left behind.

class BankCopyService {
  constructor(private db: PrismaClient = prisma) {}

  // Creates the new bank right away (marked "copying") and fills it in the
  // background, so a big bank does not hold the request open.
  async copyBank(bankId: number, name: string, userId: number) {
    const bank = await foldersService.getFolder(bankId);
    if (bank.bank_id !== null) throw new BadRequestError("Not a bank");
    if (bank.archived_at) throw new BadRequestError("This bank is archived");
    if (bank.copy_status) throw new BadRequestError("This bank is still being copied");

    const newBank = await this.db.$transaction(async (tx) => {
      const last = await tx.qb_folders.aggregate({ where: { bank_id: null }, _max: { sort_order: true } });
      const created = await tx.qb_folders.create({
        data: {
          name,
          subject_id: bank.subject_id,
          sort_order: (last._max.sort_order ?? 0) + 1,
          copy_status: "copying",
          created_by: userId,
        },
      });
      return tx.qb_folders.update({ where: { id: created.id }, data: { path: `/${created.id}/` } });
    });

    void this.fill(bankId, newBank, userId)
      .then(() => this.db.qb_folders.update({ where: { id: newBank.id }, data: { copy_status: null } }))
      .catch(async (err) => {
        console.error(`[question-bank] copying bank ${bankId} into ${newBank.id} failed:`, err);
        await this.db.qb_folders.update({ where: { id: newBank.id }, data: { copy_status: "failed" } }).catch(() => {});
      });

    return { bank: newBank };
  }

  // Copies everything live in the source bank into the new, empty bank. One
  // transaction: on failure the new bank stays empty and is marked failed.
  private async fill(bankId: number, newBank: { id: number; path: string }, userId: number) {
    const folders = await this.db.qb_folders.findMany({
      where: { bank_id: bankId },
      orderBy: [{ path: "asc" }],
    });
    const archived = new Set(folders.filter((f) => f.archived_at).map((f) => f.id));
    const live = folders
      .filter((f) => !pathIds(f.path).some((id) => archived.has(id)))
      // Parents before children.
      .sort((a, b) => pathIds(a.path).length - pathIds(b.path).length);
    const liveIds = [bankId, ...live.map((f) => f.id)];

    const [levels, categories, questions] = await Promise.all([
      this.db.qb_folder_levels.findMany({ where: { folder_id: { in: liveIds } } }),
      this.db.qb_categories.findMany({ where: { bank_id: bankId }, orderBy: [{ parent_id: { sort: "asc", nulls: "first" } }, { id: "asc" }] }),
      questionsService.loadFull({ folder_id: { in: liveIds }, archived_at: null }),
    ]);

    await this.db.$transaction(async (tx) => {
      const folderMap = new Map<number, { id: number; path: string }>([[bankId, newBank]]);
      for (const f of live) {
        const parent = folderMap.get(f.parent_id!)!;
        const row = await tx.qb_folders.create({
          data: { name: f.name, parent_id: parent.id, bank_id: newBank.id, sort_order: f.sort_order, created_by: userId },
        });
        const withPath = await tx.qb_folders.update({ where: { id: row.id }, data: { path: `${parent.path}${row.id}/` } });
        folderMap.set(f.id, withPath);
      }

      if (levels.length) {
        await tx.qb_folder_levels.createMany({
          data: levels.map((l) => ({ folder_id: folderMap.get(l.folder_id)!.id, level_id: l.level_id })),
        });
      }

      const categoryMap = new Map<number, number>();
      for (const c of categories) {
        const row = await tx.qb_categories.create({
          data: {
            bank_id: newBank.id,
            parent_id: c.parent_id ? categoryMap.get(c.parent_id) ?? null : null,
            name: c.name,
            sort_order: c.sort_order,
          },
        });
        categoryMap.set(c.id, row.id);
      }
      const cat = (id: number | null) => (id ? categoryMap.get(id) ?? null : null);

      const questionMap = new Map<number, number>();
      // Passages and single questions first, then passage children.
      const ordered = [...questions].sort((a, b) => Number(!!a.passage_id) - Number(!!b.passage_id));
      for (const q of ordered) {
        if (q.passage_id && !questionMap.has(q.passage_id)) continue; // its passage is archived
        const copy = await questionsService.cloneOne(tx, q, {
          folder_id: folderMap.get(q.folder_id)!.id,
          passage_id: q.passage_id ? questionMap.get(q.passage_id)! : null,
          sort_order: q.sort_order,
          category_id: cat(q.category_id),
          subcategory_id: cat(q.subcategory_id),
        }, userId);
        questionMap.set(q.id, copy.id);
      }
    }, { timeout: 15 * 60_000 });
  }
}

export const bankCopyService = new BankCopyService();
