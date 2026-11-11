import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { foldersService } from "./folders.service";

// Each bank has its own categories; a category may have subcategories (one
// level). Deleting a category leaves its questions without a category.

class CategoriesService {
  constructor(private db: PrismaClient = prisma) {}

  async list(bankId: number) {
    const bank = await foldersService.getFolder(bankId);
    if (bank.bank_id !== null) throw new BadRequestError("Not a bank");
    const rows = await this.db.qb_categories.findMany({
      where: { bank_id: bankId },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      select: { id: true, parent_id: true, name: true, sort_order: true },
    });
    return rows
      .filter((r) => r.parent_id === null)
      .map((c) => ({ ...c, subcategories: rows.filter((r) => r.parent_id === c.id) }));
  }

  async create(bankId: number, name: string, parentId: number | null) {
    const bank = await foldersService.getFolder(bankId);
    if (bank.bank_id !== null) throw new BadRequestError("Not a bank");
    if (parentId) {
      const parent = await this.db.qb_categories.findUnique({ where: { id: parentId } });
      if (!parent || parent.bank_id !== bankId) throw new NotFoundError("Category not found");
      if (parent.parent_id !== null) throw new BadRequestError("A subcategory cannot have subcategories");
    }
    await this.assertNameFree(bankId, parentId, name);
    const last = await this.db.qb_categories.aggregate({
      where: { bank_id: bankId, parent_id: parentId },
      _max: { sort_order: true },
    });
    return this.db.qb_categories.create({
      data: { bank_id: bankId, parent_id: parentId, name, sort_order: (last._max.sort_order ?? 0) + 1 },
    });
  }

  async rename(id: number, name: string) {
    const category = await this.get(id);
    await this.assertNameFree(category.bank_id, category.parent_id, name, id);
    return this.db.qb_categories.update({ where: { id }, data: { name } });
  }

  // Subcategories go with their category; questions keep their place and
  // just lose the category (the foreign keys set it to null).
  async remove(id: number) {
    await this.get(id);
    await this.db.qb_categories.delete({ where: { id } });
  }

  async get(id: number) {
    const category = await this.db.qb_categories.findUnique({ where: { id } });
    if (!category) throw new NotFoundError("Category not found");
    return category;
  }

  // Checks a category / subcategory pair for a question in this bank.
  async assertPair(bankId: number, categoryId: number | null, subcategoryId: number | null) {
    if (subcategoryId && !categoryId) throw new BadRequestError("Pick the category of the subcategory");
    if (!categoryId) return;
    const ids = subcategoryId ? [categoryId, subcategoryId] : [categoryId];
    const rows = await this.db.qb_categories.findMany({ where: { id: { in: ids } } });
    const category = rows.find((r) => r.id === categoryId);
    if (!category || category.bank_id !== bankId || category.parent_id !== null) {
      throw new NotFoundError("Category not found");
    }
    if (subcategoryId) {
      const sub = rows.find((r) => r.id === subcategoryId);
      if (!sub || sub.parent_id !== categoryId) throw new NotFoundError("Subcategory not found");
    }
  }

  private async assertNameFree(bankId: number, parentId: number | null, name: string, exceptId?: number) {
    const clash = await this.db.qb_categories.findFirst({
      where: {
        bank_id: bankId,
        parent_id: parentId,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) throw new BadRequestError("A category with this name already exists");
  }
}

export const categoriesService = new CategoriesService();
