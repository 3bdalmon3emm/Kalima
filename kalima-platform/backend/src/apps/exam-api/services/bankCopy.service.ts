import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError } from "../../../libs/errors";
import { foldersService, pathIds } from "./folders.service";
import { questionsService } from "./questions.service";

// Copies a whole bank into a new, independent bank, or a folder under another
// folder: visible folders with their levels and live questions (and, for a
// bank, its categories). Media files are shared, not uploaded again. Archived
// folders and questions are left behind.

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type CategoryPair = { category_id: number | null; subcategory_id: number | null };

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

    void this.fill(bank, newBank, userId)
      .then(() => this.db.qb_folders.update({ where: { id: newBank.id }, data: { copy_status: null } }))
      .catch(async (err) => {
        console.error(`[question-bank] copying bank ${bankId} into ${newBank.id} failed:`, err);
        await this.db.qb_folders.update({ where: { id: newBank.id }, data: { copy_status: "failed" } }).catch(() => {});
      });

    return { bank: newBank };
  }

  // Copies a folder with everything live inside it under another folder, in
  // this bank or another one (categories then follow by name). Copying under
  // its own parent is a duplicate, placed right after the original. Like a
  // bank copy, the new folder appears at once (marked "copying") and is
  // filled in the background.
  async copyFolder(sourceId: number, targetParentId: number, name: string | null, userId: number) {
    const source = await foldersService.getFolder(sourceId);
    if (source.bank_id === null) throw new BadRequestError("Use copy bank to copy a whole bank");
    await foldersService.assertUsable(source);
    const target = await foldersService.getFolder(targetParentId);
    await foldersService.assertUsable(target);
    if (pathIds(target.path).includes(source.id)) throw new BadRequestError("A folder cannot be copied into itself");

    const targetBank = foldersService.bankIdOf(target);

    const root = await this.db.$transaction(async (tx) => {
      let sortOrder: number;
      if (target.id === source.parent_id) {
        await tx.qb_folders.updateMany({
          where: { parent_id: target.id, sort_order: { gt: source.sort_order } },
          data: { sort_order: { increment: 1 } },
        });
        sortOrder = source.sort_order + 1;
      } else {
        const last = await tx.qb_folders.aggregate({ where: { parent_id: target.id }, _max: { sort_order: true } });
        sortOrder = (last._max.sort_order ?? 0) + 1;
      }
      const created = await tx.qb_folders.create({
        data: {
          name: name || source.name,
          parent_id: target.id,
          bank_id: targetBank,
          sort_order: sortOrder,
          copy_status: "copying",
          created_by: userId,
        },
      });
      return tx.qb_folders.update({ where: { id: created.id }, data: { path: `${target.path}${created.id}/` } });
    });

    void this.fillFolder(source, root, targetBank, userId)
      .then(() => this.db.qb_folders.update({ where: { id: root.id }, data: { copy_status: null } }))
      .catch(async (err) => {
        console.error(`[question-bank] copying folder ${source.id} into ${root.id} failed:`, err);
        await this.db.qb_folders.update({ where: { id: root.id }, data: { copy_status: "failed" } }).catch(() => {});
      });

    return root;
  }

  // Fills a new folder copy. One transaction: on failure it stays empty.
  private async fillFolder(
    source: { id: number; path: string; bank_id: number | null },
    root: { id: number; path: string },
    targetBank: number,
    userId: number,
  ) {
    const tree = await this.loadTree(source);
    await this.db.$transaction(async (tx) => {
      const category = await questionsService.categoryMapper(tx, foldersService.bankIdOf(source), targetBank);
      await this.cloneTree(tx, tree, new Map([[source.id, root]]), targetBank, category, userId);
    }, { timeout: 15 * 60_000 });
  }

  // Copies everything live in the source bank into the new, empty bank. One
  // transaction: on failure the new bank stays empty and is marked failed.
  private async fill(bank: { id: number; path: string }, newBank: { id: number; path: string }, userId: number) {
    const [tree, categories] = await Promise.all([
      this.loadTree(bank),
      this.db.qb_categories.findMany({
        where: { bank_id: bank.id },
        orderBy: [{ parent_id: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      }),
    ]);

    await this.db.$transaction(async (tx) => {
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

      await this.cloneTree(tx, tree, new Map([[bank.id, newBank]]), newBank.id,
        (c, s) => ({ category_id: cat(c), subcategory_id: cat(s) }), userId);
    }, { timeout: 15 * 60_000 });
  }

  // The live folders under a root (parents first), and the levels and live
  // questions of the root and those folders.
  private async loadTree(root: { id: number; path: string }) {
    const folders = await this.db.qb_folders.findMany({
      where: { path: { startsWith: root.path }, id: { not: root.id } },
      orderBy: [{ path: "asc" }],
    });
    const archived = new Set(folders.filter((f) => f.archived_at).map((f) => f.id));
    const live = folders
      .filter((f) => !pathIds(f.path).some((id) => archived.has(id)))
      // Parents before children.
      .sort((a, b) => pathIds(a.path).length - pathIds(b.path).length);
    const liveIds = [root.id, ...live.map((f) => f.id)];

    const [levels, questions] = await Promise.all([
      this.db.qb_folder_levels.findMany({ where: { folder_id: { in: liveIds } } }),
      questionsService.loadFull({ folder_id: { in: liveIds }, archived_at: null }),
    ]);
    return { live, levels, questions };
  }

  // Creates the copies. folderMap starts with the source root mapped to its
  // already-created copy and fills up with the subfolders.
  private async cloneTree(
    tx: Tx,
    tree: Awaited<ReturnType<BankCopyService["loadTree"]>>,
    folderMap: Map<number, { id: number; path: string }>,
    bankId: number,
    category: (c: number | null, s: number | null) => CategoryPair,
    userId: number,
  ) {
    for (const f of tree.live) {
      const parent = folderMap.get(f.parent_id!)!;
      const row = await tx.qb_folders.create({
        data: { name: f.name, parent_id: parent.id, bank_id: bankId, sort_order: f.sort_order, created_by: userId },
      });
      const withPath = await tx.qb_folders.update({ where: { id: row.id }, data: { path: `${parent.path}${row.id}/` } });
      folderMap.set(f.id, withPath);
    }

    if (tree.levels.length) {
      await tx.qb_folder_levels.createMany({
        data: tree.levels.map((l) => ({ folder_id: folderMap.get(l.folder_id)!.id, level_id: l.level_id })),
      });
    }

    const questionMap = new Map<number, number>();
    // Passages and single questions first, then passage children.
    const ordered = [...tree.questions].sort((a, b) => Number(!!a.passage_id) - Number(!!b.passage_id));
    for (const q of ordered) {
      if (q.passage_id && !questionMap.has(q.passage_id)) continue; // its passage is archived
      const copy = await questionsService.cloneOne(tx, q, {
        folder_id: folderMap.get(q.folder_id)!.id,
        passage_id: q.passage_id ? questionMap.get(q.passage_id)! : null,
        sort_order: q.sort_order,
        ...category(q.category_id, q.subcategory_id),
      }, userId);
      questionMap.set(q.id, copy.id);
    }
  }
}

export const bankCopyService = new BankCopyService();
