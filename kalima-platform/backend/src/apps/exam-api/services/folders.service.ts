import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";

// Banks and folders. A bank is a folder with no bank_id. Every folder keeps
// the path of ids from its bank down to itself ("/3/8/21/"), which never
// changes because folders cannot move.
//
// Archiving marks only the folder itself; everything under it is hidden
// because an ancestor is archived. Restoring brings back exactly what that
// archive hid: items archived on their own before stay archived.

type FolderRow = {
  id: number;
  bank_id: number | null;
  parent_id: number | null;
  path: string;
  name: string;
  subject_id: number | null;
  sort_order: number;
  archived_at: Date | null;
  copy_status: string | null;
};

export function pathIds(path: string): number[] {
  return path.split("/").filter(Boolean).map(Number);
}

class FoldersService {
  constructor(private db: PrismaClient = prisma) {}

  async getFolder(id: number): Promise<FolderRow> {
    const folder = await this.db.qb_folders.findUnique({ where: { id } });
    if (!folder) throw new NotFoundError("Folder not found");
    return folder;
  }

  bankIdOf(folder: { id: number; bank_id: number | null }): number {
    return folder.bank_id ?? folder.id;
  }

  // True when the folder or one of its ancestors is archived.
  async isHidden(folder: FolderRow): Promise<boolean> {
    const count = await this.db.qb_folders.count({
      where: { id: { in: pathIds(folder.path) }, archived_at: { not: null } },
    });
    return count > 0;
  }

  async assertUsable(folder: FolderRow): Promise<void> {
    if (await this.isHidden(folder)) throw new BadRequestError("This folder is archived");
    const bank = await this.db.qb_folders.findUnique({
      where: { id: this.bankIdOf(folder) },
      select: { copy_status: true },
    });
    if (bank?.copy_status) throw new BadRequestError("This bank is still being copied");
  }

  async listBanks(archived = false) {
    const banks = await this.db.qb_folders.findMany({
      where: { bank_id: null, archived_at: archived ? { not: null } : null },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      include: { subjects: { select: { id: true, title: true } } },
    });
    return banks;
  }

  async createBank(name: string, subjectId: number | null, userId: number) {
    if (subjectId) await this.assertSubject(subjectId);
    return this.db.$transaction(async (tx) => {
      const last = await tx.qb_folders.aggregate({ where: { bank_id: null }, _max: { sort_order: true } });
      const bank = await tx.qb_folders.create({
        data: {
          name,
          subject_id: subjectId,
          sort_order: (last._max.sort_order ?? 0) + 1,
          created_by: userId,
        },
      });
      return tx.qb_folders.update({ where: { id: bank.id }, data: { path: `/${bank.id}/` } });
    });
  }

  async createFolder(parentId: number, name: string, userId: number) {
    const parent = await this.getFolder(parentId);
    await this.assertUsable(parent);

    return this.db.$transaction(async (tx) => {
      const last = await tx.qb_folders.aggregate({ where: { parent_id: parentId }, _max: { sort_order: true } });
      const folder = await tx.qb_folders.create({
        data: {
          name,
          parent_id: parentId,
          bank_id: this.bankIdOf(parent),
          sort_order: (last._max.sort_order ?? 0) + 1,
          created_by: userId,
        },
      });
      return tx.qb_folders.update({
        where: { id: folder.id },
        data: { path: `${parent.path}${folder.id}/` },
      });
    });
  }

  async updateFolder(
    id: number,
    data: { name?: string; subject_id?: number | null; level_ids?: number[] },
  ) {
    const folder = await this.getFolder(id);
    if (data.subject_id !== undefined && folder.bank_id !== null) {
      throw new BadRequestError("Only a bank has a subject");
    }
    if (data.subject_id) await this.assertSubject(data.subject_id);
    if (data.level_ids?.length) {
      const found = await this.db.levels.count({ where: { id: { in: data.level_ids } } });
      if (found !== data.level_ids.length) throw new NotFoundError("Level not found");
    }

    return this.db.$transaction(async (tx) => {
      if (data.level_ids !== undefined) {
        await tx.qb_folder_levels.deleteMany({ where: { folder_id: id } });
        if (data.level_ids.length) {
          await tx.qb_folder_levels.createMany({
            data: data.level_ids.map((level_id) => ({ folder_id: id, level_id })),
          });
        }
      }
      return tx.qb_folders.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.subject_id !== undefined && { subject_id: data.subject_id }),
        },
      });
    });
  }

  // Folder page: the folder, where it sits, what it holds and its levels.
  async getFolderDetails(id: number) {
    const folder = await this.db.qb_folders.findUnique({
      where: { id },
      include: { subjects: { select: { id: true, title: true } } },
    });
    if (!folder) throw new NotFoundError("Folder not found");

    const ancestors = await this.db.qb_folders.findMany({
      where: { id: { in: pathIds(folder.path) } },
      select: { id: true, name: true, path: true, archived_at: true, copy_status: true },
    });
    const byId = new Map(ancestors.map((a) => [a.id, a]));
    const breadcrumb = pathIds(folder.path).map((fid) => byId.get(fid)).filter(Boolean);

    const [children, questionCount, levels] = await Promise.all([
      this.db.qb_folders.findMany({
        where: { parent_id: id, archived_at: null },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
        select: { id: true, name: true, sort_order: true },
      }),
      this.db.qb_questions.count({ where: { folder_id: id, passage_id: null, archived_at: null } }),
      this.effectiveLevels(folder),
    ]);

    return {
      ...folder,
      bank_id: this.bankIdOf(folder),
      is_bank: folder.bank_id === null,
      copy_status: byId.get(this.bankIdOf(folder))?.copy_status ?? null,
      hidden: breadcrumb.some((a) => a!.archived_at !== null),
      breadcrumb: breadcrumb.map((a) => ({ id: a!.id, name: a!.name })),
      children,
      question_count: questionCount,
      levels,
    };
  }

  // A folder's own levels, or the nearest ancestor's when it has none.
  async effectiveLevels(folder: { id: number; path: string }) {
    const chain = pathIds(folder.path).reverse();
    const rows = await this.db.qb_folder_levels.findMany({
      where: { folder_id: { in: chain } },
      include: { level: { select: { id: true, title: true, title_ar: true, stage_id: true } } },
    });
    for (const fid of chain) {
      const own = rows.filter((r) => r.folder_id === fid);
      if (own.length) {
        return { inherited_from: fid === folder.id ? null : fid, levels: own.map((r) => r.level) };
      }
    }
    return { inherited_from: null, levels: [] };
  }

  // Every visible folder of a bank, flat, for the sidebar tree.
  async getBankTree(bankId: number) {
    const bank = await this.getFolder(bankId);
    if (bank.bank_id !== null) throw new BadRequestError("Not a bank");
    const folders = await this.db.qb_folders.findMany({
      where: { OR: [{ id: bankId }, { bank_id: bankId }] },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      select: { id: true, parent_id: true, name: true, path: true, archived_at: true },
    });
    const archived = new Set(folders.filter((f) => f.archived_at).map((f) => f.id));
    return folders
      .filter((f) => !pathIds(f.path).some((fid) => archived.has(fid)))
      .map(({ archived_at, path, ...f }) => f);
  }

  async reorder(parentId: number | null, ids: number[]) {
    const folders = await this.db.qb_folders.findMany({
      where: { id: { in: ids } },
      select: { id: true, parent_id: true, bank_id: true },
    });
    const sameParent = folders.length === ids.length && folders.every((f) =>
      parentId === null ? f.bank_id === null : f.parent_id === parentId);
    if (!sameParent) throw new BadRequestError("Folders must share the same parent");
    await this.db.$transaction(
      ids.map((id, i) => this.db.qb_folders.update({ where: { id }, data: { sort_order: i + 1 } })),
    );
  }

  async archive(id: number, userId: number) {
    const folder = await this.getFolder(id);
    if (folder.archived_at) return;
    await this.db.qb_folders.update({
      where: { id },
      data: { archived_at: new Date(), archived_by: userId },
    });
  }

  async restore(id: number) {
    const folder = await this.getFolder(id);
    const ancestors = pathIds(folder.path).filter((fid) => fid !== id);
    const archivedAncestor = await this.db.qb_folders.count({
      where: { id: { in: ancestors }, archived_at: { not: null } },
    });
    if (archivedAncestor) throw new BadRequestError("Restore the parent folder first");
    await this.db.qb_folders.update({ where: { id }, data: { archived_at: null, archived_by: null } });
  }

  private async assertSubject(subjectId: number) {
    const subject = await this.db.subjects.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundError("Subject not found");
  }
}

export const foldersService = new FoldersService();
