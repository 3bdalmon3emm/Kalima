import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { pathIds } from "./folders.service";

// Folders of exams. Same rules as the bank tree: folders nest, keep the path
// of ids from the root ("/3/8/21/"), never move, and hold folders and exams
// together. Archiving marks only the folder itself; everything under it is
// hidden through it.

type ExFolderRow = {
  id: number;
  parent_id: number | null;
  path: string;
  name: string;
  sort_order: number;
  archived_at: Date | null;
};

const order = [{ sort_order: "asc" as const }, { created_at: "asc" as const }];

class ExamFoldersService {
  constructor(private db: PrismaClient = prisma) {}

  async getFolder(id: number): Promise<ExFolderRow> {
    const folder = await this.db.ex_folders.findUnique({ where: { id } });
    if (!folder) throw new NotFoundError("Folder not found");
    return folder;
  }

  // True when the folder or one of its ancestors is archived.
  async isHidden(path: string): Promise<boolean> {
    const count = await this.db.ex_folders.count({
      where: { id: { in: pathIds(path) }, archived_at: { not: null } },
    });
    return count > 0;
  }

  async assertUsable(folder: ExFolderRow) {
    if (await this.isHidden(folder.path)) throw new BadRequestError("This folder is archived");
  }

  async listRoots() {
    return this.db.ex_folders.findMany({
      where: { parent_id: null, archived_at: null },
      orderBy: order,
      select: { id: true, name: true, sort_order: true },
    });
  }

  async create(parentId: number | null, name: string, userId: number) {
    let parentPath = "/";
    if (parentId) {
      const parent = await this.getFolder(parentId);
      await this.assertUsable(parent);
      parentPath = parent.path;
    }
    return this.db.$transaction(async (tx) => {
      const last = await tx.ex_folders.aggregate({ where: { parent_id: parentId }, _max: { sort_order: true } });
      const folder = await tx.ex_folders.create({
        data: { name, parent_id: parentId, sort_order: (last._max.sort_order ?? 0) + 1, created_by: userId },
      });
      return tx.ex_folders.update({ where: { id: folder.id }, data: { path: `${parentPath}${folder.id}/` } });
    });
  }

  async rename(id: number, name: string) {
    await this.getFolder(id);
    return this.db.ex_folders.update({ where: { id }, data: { name } });
  }

  // Folder page: where it sits, its subfolders and its exams.
  async details(id: number) {
    const folder = await this.getFolder(id);
    const ancestors = await this.db.ex_folders.findMany({
      where: { id: { in: pathIds(folder.path) } },
      select: { id: true, name: true, archived_at: true },
    });
    const byId = new Map(ancestors.map((a) => [a.id, a]));
    const breadcrumb = pathIds(folder.path).map((fid) => byId.get(fid)!).filter(Boolean);

    const [children, exams] = await Promise.all([
      this.db.ex_folders.findMany({
        where: { parent_id: id, archived_at: null },
        orderBy: order,
        select: { id: true, name: true, sort_order: true },
      }),
      this.db.ex_exams.findMany({
        where: { folder_id: id, archived_at: null },
        orderBy: order,
        select: {
          id: true, name: true, serial: true, type: true, mode: true, published_at: true, sort_order: true,
          subjects: { select: { id: true, title: true } },
          _count: { select: { questions: true } },
        },
      }),
    ]);

    return {
      ...folder,
      hidden: breadcrumb.some((a) => a.archived_at !== null),
      breadcrumb: breadcrumb.map((a) => ({ id: a.id, name: a.name })),
      children,
      exams: exams.map(({ _count, ...e }) => ({ ...e, question_count: _count.questions })),
    };
  }

  // Every visible folder, flat, for the sidebar tree.
  async tree() {
    const folders = await this.db.ex_folders.findMany({
      orderBy: order,
      select: { id: true, parent_id: true, name: true, path: true, archived_at: true },
    });
    const archived = new Set(folders.filter((f) => f.archived_at).map((f) => f.id));
    return folders
      .filter((f) => !pathIds(f.path).some((fid) => archived.has(fid)))
      .map(({ archived_at, path, ...f }) => f);
  }

  async reorder(parentId: number | null, ids: number[]) {
    const folders = await this.db.ex_folders.findMany({
      where: { id: { in: ids } },
      select: { id: true, parent_id: true },
    });
    if (folders.length !== ids.length || folders.some((f) => f.parent_id !== parentId)) {
      throw new BadRequestError("Folders must share the same parent");
    }
    await this.db.$transaction(
      ids.map((id, i) => this.db.ex_folders.update({ where: { id }, data: { sort_order: i + 1 } })),
    );
  }

  async archive(id: number, userId: number) {
    const folder = await this.getFolder(id);
    if (folder.archived_at) return;
    await this.db.ex_folders.update({ where: { id }, data: { archived_at: new Date(), archived_by: userId } });
  }

  async restore(id: number) {
    const folder = await this.getFolder(id);
    const ancestors = pathIds(folder.path).filter((fid) => fid !== id);
    const archivedAncestor = await this.db.ex_folders.count({
      where: { id: { in: ancestors }, archived_at: { not: null } },
    });
    if (archivedAncestor) throw new BadRequestError("Restore the parent folder first");
    await this.db.ex_folders.update({ where: { id }, data: { archived_at: null, archived_by: null } });
  }

  // Archived folders and exams, each with the path it sits in.
  async listArchive() {
    const [folders, exams] = await Promise.all([
      this.db.ex_folders.findMany({ where: { archived_at: { not: null } }, orderBy: { archived_at: "desc" } }),
      this.db.ex_exams.findMany({
        where: { archived_at: { not: null } },
        orderBy: { archived_at: "desc" },
        select: { id: true, name: true, serial: true, type: true, folder_id: true, archived_at: true, folder: { select: { path: true } } },
      }),
    ]);
    const ids = new Set([...folders.flatMap((f) => pathIds(f.path)), ...exams.flatMap((e) => pathIds(e.folder.path))]);
    const names = new Map(
      (await this.db.ex_folders.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } }))
        .map((f) => [f.id, f.name]),
    );
    const trail = (path: string) => pathIds(path).map((id) => names.get(id) ?? "");
    return {
      folders: folders.map((f) => ({ id: f.id, name: f.name, archived_at: f.archived_at, path: trail(f.path).slice(0, -1) })),
      exams: exams.map(({ folder, ...e }) => ({ ...e, path: trail(folder.path) })),
    };
  }
}

export const examFoldersService = new ExamFoldersService();
