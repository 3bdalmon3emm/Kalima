import crypto from "crypto";
import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { foldersService, pathIds } from "./folders.service";
import { categoriesService } from "./categories.service";
import { mediaService } from "./media.service";
import { QuestionInput } from "./questionInput";

// Questions and passages of the bank. A passage is a question of type
// "passage"; its children point at it with passage_id. Options and matching
// items keep their ids across edits: changed rows are updated in place, new
// ones inserted, dropped ones marked removed_at.

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// No 0/O or 1/I, so a student can read the serial back without mistakes.
const SERIAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SERIAL_LENGTH = 8;

function randomSerial(): string {
  const bytes = crypto.randomBytes(SERIAL_LENGTH);
  return Array.from(bytes, (b) => SERIAL_ALPHABET[b % SERIAL_ALPHABET.length]).join("");
}

export async function newSerial(tx: Tx | PrismaClient): Promise<string> {
  for (;;) {
    const serial = randomSerial();
    const taken = await tx.qb_questions.findUnique({ where: { serial }, select: { id: true } });
    if (!taken) return serial;
  }
}

const fullInclude = {
  options: { where: { removed_at: null }, orderBy: [{ sort_order: "asc" as const }, { id: "asc" as const }] },
  matching_items: { where: { removed_at: null }, orderBy: [{ sort_order: "asc" as const }, { id: "asc" as const }] },
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
};

type FullQuestion = Awaited<ReturnType<QuestionsService["loadFull"]>>[number];

class QuestionsService {
  constructor(private db: PrismaClient = prisma) {}

  async loadFull(where: any) {
    return this.db.qb_questions.findMany({
      where,
      include: fullInclude,
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
    });
  }

  // ---------- Reading ----------

  async listFolder(
    folderId: number,
    filters: { uncategorized?: boolean; category_id?: number; subcategory_id?: number; reference_no?: string },
  ) {
    await foldersService.getFolder(folderId);
    const match: any = {};
    if (filters.uncategorized) match.category_id = null;
    else if (filters.category_id) match.category_id = filters.category_id;
    if (filters.subcategory_id) match.subcategory_id = filters.subcategory_id;
    if (filters.reference_no) match.reference_no = { contains: filters.reference_no, mode: "insensitive" };
    const filtered = Object.keys(match).length > 0;

    const top = await this.loadFull({
      folder_id: folderId,
      passage_id: null,
      archived_at: null,
      ...(filtered && {
        OR: [
          { type: { not: "passage" }, ...match },
          { type: "passage", children: { some: { archived_at: null, ...match } } },
        ],
      }),
    });
    const passageIds = top.filter((q) => q.type === "passage").map((q) => q.id);
    const children = passageIds.length
      ? await this.loadFull({ passage_id: { in: passageIds }, archived_at: null, ...(filtered && match) })
      : [];
    return this.present(top, children);
  }

  async getOne(id: number) {
    const [question] = await this.loadFull({ id });
    if (!question) throw new NotFoundError("Question not found");
    const children = question.type === "passage"
      ? await this.loadFull({ passage_id: id, archived_at: null })
      : [];
    const [presented] = await this.present([question], children);
    return presented;
  }

  // Finds a question anywhere in the bank by its serial, with where it is.
  async findBySerial(serial: string) {
    const q = await this.db.qb_questions.findUnique({
      where: { serial: serial.trim().toUpperCase() },
      select: { id: true, passage_id: true, folder_id: true, archived_at: true },
    });
    if (!q) throw new NotFoundError("No question has this serial");
    const folder = await foldersService.getFolderDetails(q.folder_id);
    return {
      question_id: q.id,
      passage_id: q.passage_id,
      archived: q.archived_at !== null,
      folder: { id: folder.id, bank_id: folder.bank_id, breadcrumb: folder.breadcrumb, hidden: folder.hidden },
    };
  }

  // Attaches media links and nests passage children.
  private async present(top: FullQuestion[], children: FullQuestion[]) {
    const all = [...top, ...children];
    const media = await mediaService.resolve(all.flatMap((q) => [
      q.stem_image_id, q.stem_audio_id, q.explanation_image_id, q.model_answer_image_id,
      ...q.options.map((o) => o.image_id),
      ...q.matching_items.flatMap((m) => [m.image_id, m.audio_id]),
    ]));
    const m = (id: number | null) => (id ? media.get(id) ?? null : null);
    const shape = (q: FullQuestion) => ({
      ...q,
      stem_image: m(q.stem_image_id),
      stem_audio: m(q.stem_audio_id),
      explanation_image: m(q.explanation_image_id),
      model_answer_image: m(q.model_answer_image_id),
      options: q.options.map((o) => ({ ...o, image: m(o.image_id) })),
      matching_items: q.matching_items.map((i) => ({ ...i, image: m(i.image_id), audio: m(i.audio_id) })),
    });
    return top.map((q) => ({
      ...shape(q),
      children: q.type === "passage" ? children.filter((c) => c.passage_id === q.id).map(shape) : undefined,
    }));
  }

  // ---------- Writing ----------

  // Where a new question may go: a visible folder, and for a passage child, a
  // live passage in that folder.
  private async assertTarget(folderId: number, passageId: number | null, type: string) {
    const folder = await foldersService.getFolder(folderId);
    await foldersService.assertUsable(folder);
    if (passageId) {
      if (type === "passage") throw new BadRequestError("A passage cannot hold another passage");
      const passage = await this.db.qb_questions.findUnique({ where: { id: passageId } });
      if (!passage || passage.type !== "passage" || passage.folder_id !== folderId) {
        throw new NotFoundError("Passage not found");
      }
      if (passage.archived_at) throw new BadRequestError("This passage is archived");
    }
    return folder;
  }

  private async checkRefs(bankId: number, input: QuestionInput) {
    await categoriesService.assertPair(bankId, input.category_id, input.subcategory_id);
    await mediaService.assertExists([
      input.stem_image_id, input.explanation_image_id, input.model_answer_image_id,
      ...input.options.map((o) => o.image_id),
      ...input.matching_items.map((i) => i.image_id),
    ], "image");
    await mediaService.assertExists([
      input.stem_audio_id, ...input.matching_items.map((i) => i.audio_id),
    ], "audio");
  }

  private columns(input: QuestionInput) {
    return {
      type: input.type,
      difficulty: input.difficulty,
      category_id: input.category_id,
      subcategory_id: input.subcategory_id,
      reference_no: input.reference_no,
      stem_text: input.stem_text,
      stem_image_id: input.stem_image_id,
      stem_audio_id: input.stem_audio_id,
      explanation_mode: input.explanation_mode,
      explanation_text: input.explanation_text,
      explanation_image_id: input.explanation_image_id,
      model_answer_text: input.model_answer_text,
      model_answer_image_id: input.model_answer_image_id,
      font: input.font,
    } as const;
  }

  // Children of a passage always show in the passage's font.
  private async withPassageFont(passageId: number | null, input: QuestionInput) {
    if (!passageId) return input;
    const passage = await this.db.qb_questions.findUnique({
      where: { id: passageId },
      select: { font: true },
    });
    return passage ? { ...input, font: passage.font } as QuestionInput : input;
  }

  async create(folderId: number, passageId: number | null, input: QuestionInput, userId: number) {
    const folder = await this.assertTarget(folderId, passageId, input.type);
    await this.checkRefs(foldersService.bankIdOf(folder), input);
    input = await this.withPassageFont(passageId, input);

    const id = await this.db.$transaction(async (tx) => {
      const last = await tx.qb_questions.aggregate({
        where: { folder_id: folderId, passage_id: passageId },
        _max: { sort_order: true },
      });
      const created = await tx.qb_questions.create({
        data: {
          ...this.columns(input),
          serial: await newSerial(tx),
          folder_id: folderId,
          passage_id: passageId,
          sort_order: (last._max.sort_order ?? 0) + 1,
          created_by: userId,
          updated_by: userId,
        },
      });
      await this.saveOptions(tx, created.id, input);
      await this.saveMatching(tx, created.id, input);
      return created.id;
    });
    return this.getOne(id);
  }

  async update(id: number, input: QuestionInput, userId: number) {
    const current = await this.db.qb_questions.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("Question not found");
    if ((current.type === "passage") !== (input.type === "passage")) {
      throw new BadRequestError("A question cannot become a passage or the other way round");
    }
    if (current.type === "passage" && current.passage_id) throw new BadRequestError("Invalid passage");
    const folder = await foldersService.getFolder(current.folder_id);
    await this.checkRefs(foldersService.bankIdOf(folder), input);
    input = await this.withPassageFont(current.passage_id, input);

    await this.db.$transaction(async (tx) => {
      await tx.qb_questions.update({
        where: { id },
        data: { ...this.columns(input), version: { increment: 1 }, updated_by: userId },
      });
      if (current.type === "passage") {
        await tx.qb_questions.updateMany({
          where: { passage_id: id },
          data: { font: input.font },
        });
      }
      await this.saveOptions(tx, id, input);
      await this.saveMatching(tx, id, input);
    });
    return this.getOne(id);
  }

  private async saveOptions(tx: Tx, questionId: number, input: QuestionInput) {
    const existing = await tx.qb_question_options.findMany({ where: { question_id: questionId, removed_at: null } });
    const known = new Set(existing.map((o) => o.id));
    const kept = new Set<number>();
    for (const [i, o] of input.options.entries()) {
      const data = {
        sort_order: i + 1,
        text: o.text,
        image_id: o.image_id,
        label: o.label,
        is_correct: o.is_correct,
        explanation_text: o.explanation_text,
      };
      if (o.id && known.has(o.id)) {
        kept.add(o.id);
        await tx.qb_question_options.update({ where: { id: o.id }, data });
      } else {
        await tx.qb_question_options.create({ data: { ...data, question_id: questionId } });
      }
    }
    const dropped = existing.filter((o) => !kept.has(o.id)).map((o) => o.id);
    if (dropped.length) {
      await tx.qb_question_options.updateMany({ where: { id: { in: dropped } }, data: { removed_at: new Date() } });
    }
  }

  private async saveMatching(tx: Tx, questionId: number, input: QuestionInput) {
    const existing = await tx.qb_matching_items.findMany({ where: { question_id: questionId, removed_at: null } });
    const known = new Set(existing.map((m) => m.id));
    const idByKey = new Map<string, number>();
    const kept = new Set<number>();
    const counters = { left: 0, right: 0 };

    for (const m of input.matching_items) {
      const data = {
        side: m.side,
        sort_order: ++counters[m.side],
        text: m.text,
        image_id: m.image_id,
        audio_id: m.audio_id,
        match_item_id: null,
      };
      if (m.id && known.has(m.id)) {
        kept.add(m.id);
        await tx.qb_matching_items.update({ where: { id: m.id }, data });
        idByKey.set(m.key, m.id);
      } else {
        const created = await tx.qb_matching_items.create({ data: { ...data, question_id: questionId } });
        idByKey.set(m.key, created.id);
      }
    }
    for (const m of input.matching_items) {
      if (!m.match_key) continue;
      await tx.qb_matching_items.update({
        where: { id: idByKey.get(m.key)! },
        data: { match_item_id: idByKey.get(m.match_key)! },
      });
    }
    const dropped = existing.filter((m) => !kept.has(m.id)).map((m) => m.id);
    if (dropped.length) {
      await tx.qb_matching_items.updateMany({
        where: { id: { in: dropped } },
        data: { removed_at: new Date(), match_item_id: null },
      });
    }
  }

  // ---------- Copy and duplicate ----------

  // Creates an independent copy (new serial, same media, same reference
  // number). Options and matching pairs are copied with new ids.
  async cloneOne(
    tx: Tx,
    source: FullQuestion,
    target: { folder_id: number; passage_id: number | null; sort_order: number; category_id: number | null; subcategory_id: number | null },
    userId: number,
  ) {
    const {
      id: _id, serial: _s, options, matching_items, category: _c, subcategory: _sc,
      created_at: _ca, updated_at: _ua, archived_at: _aa, archived_by: _ab, version: _v,
      folder_id: _f, passage_id: _p, sort_order: _o, category_id: _ci, subcategory_id: _si,
      created_by: _cb, updated_by: _ub, ...content
    } = source;
    const created = await tx.qb_questions.create({
      data: { ...content, ...target, serial: await newSerial(tx), created_by: userId, updated_by: userId },
    });
    if (options.length) {
      await tx.qb_question_options.createMany({
        data: options.map(({ id: _oid, question_id: _q, removed_at: _r, ...o }) => ({ ...o, question_id: created.id })),
      });
    }
    if (matching_items.length) {
      const newIds = new Map<number, number>();
      for (const item of matching_items) {
        const { id: oldId, question_id: _q, removed_at: _r, match_item_id: _m, ...rest } = item;
        const row = await tx.qb_matching_items.create({ data: { ...rest, question_id: created.id } });
        newIds.set(oldId, row.id);
      }
      for (const item of matching_items) {
        if (item.match_item_id && newIds.has(item.match_item_id)) {
          await tx.qb_matching_items.update({
            where: { id: newIds.get(item.id)! },
            data: { match_item_id: newIds.get(item.match_item_id)! },
          });
        }
      }
    }
    return created;
  }

  // Category ids of the source bank mapped to the target bank by name. Same
  // bank keeps them as they are; a name missing in the target leaves it empty.
  private async categoryMapper(tx: Tx, sourceBankId: number, targetBankId: number) {
    if (sourceBankId === targetBankId) {
      return (c: number | null, s: number | null) => ({ category_id: c, subcategory_id: s });
    }
    const [from, to] = await Promise.all([
      tx.qb_categories.findMany({ where: { bank_id: sourceBankId } }),
      tx.qb_categories.findMany({ where: { bank_id: targetBankId } }),
    ]);
    const fromById = new Map(from.map((c) => [c.id, c]));
    const norm = (s: string) => s.trim().toLowerCase();
    return (c: number | null, s: number | null) => {
      const src = c ? fromById.get(c) : undefined;
      const cat = src ? to.find((t) => t.parent_id === null && norm(t.name) === norm(src.name)) : undefined;
      const srcSub = s ? fromById.get(s) : undefined;
      const sub = cat && srcSub ? to.find((t) => t.parent_id === cat.id && norm(t.name) === norm(srcSub.name)) : undefined;
      return { category_id: cat?.id ?? null, subcategory_id: sub?.id ?? null };
    };
  }

  // Copies questions into a folder, at the end. A passage comes with all its
  // children; a single child comes inside a new copy of its passage.
  async copy(ids: number[], targetFolderId: number, userId: number) {
    const target = await this.assertTarget(targetFolderId, null, "question");
    const sources = await this.loadFull({ id: { in: ids } });
    if (sources.length !== ids.length) throw new NotFoundError("Question not found");
    const ordered = ids.map((id) => sources.find((q) => q.id === id)!);

    // A child picked together with its own passage is already copied with it.
    const picked = new Set(ids);
    const roots = ordered.filter((q) => !(q.passage_id && picked.has(q.passage_id)));

    const sourceFolders = await this.db.qb_folders.findMany({
      where: { id: { in: [...new Set(roots.map((q) => q.folder_id))] } },
    });
    const bankOf = new Map(sourceFolders.map((f) => [f.id, foldersService.bankIdOf(f)]));
    const targetBank = foldersService.bankIdOf(target);

    const created: number[] = [];
    await this.db.$transaction(async (tx) => {
      const last = await tx.qb_questions.aggregate({
        where: { folder_id: targetFolderId, passage_id: null },
        _max: { sort_order: true },
      });
      let order = last._max.sort_order ?? 0;
      const mappers = new Map<number, Awaited<ReturnType<QuestionsService["categoryMapper"]>>>();
      const mapperFor = async (bankId: number) => {
        if (!mappers.has(bankId)) mappers.set(bankId, await this.categoryMapper(tx, bankId, targetBank));
        return mappers.get(bankId)!;
      };

      for (const q of roots) {
        const map = await mapperFor(bankOf.get(q.folder_id)!);
        if (q.passage_id) {
          const [passage] = await this.loadFull({ id: q.passage_id });
          const newPassage = await this.cloneOne(tx, passage, {
            folder_id: targetFolderId, passage_id: null, sort_order: ++order, category_id: null, subcategory_id: null,
          }, userId);
          await this.cloneOne(tx, q, {
            folder_id: targetFolderId, passage_id: newPassage.id, sort_order: 1, ...map(q.category_id, q.subcategory_id),
          }, userId);
          created.push(newPassage.id);
          continue;
        }
        const copy = await this.cloneOne(tx, q, {
          folder_id: targetFolderId, passage_id: null, sort_order: ++order, ...map(q.category_id, q.subcategory_id),
        }, userId);
        created.push(copy.id);
        if (q.type === "passage") {
          const children = await this.loadFull({ passage_id: q.id, archived_at: null });
          for (const [i, child] of children.entries()) {
            await this.cloneOne(tx, child, {
              folder_id: targetFolderId, passage_id: copy.id, sort_order: i + 1,
              ...map(child.category_id, child.subcategory_id),
            }, userId);
          }
        }
      }
    }, { timeout: 60_000 });
    return { created };
  }

  // A copy right below the original, in the same folder (or passage).
  async duplicate(id: number, userId: number) {
    const [source] = await this.loadFull({ id });
    if (!source) throw new NotFoundError("Question not found");
    await this.assertTarget(source.folder_id, source.passage_id, source.type);

    const newId = await this.db.$transaction(async (tx) => {
      await tx.qb_questions.updateMany({
        where: { folder_id: source.folder_id, passage_id: source.passage_id, sort_order: { gt: source.sort_order } },
        data: { sort_order: { increment: 1 } },
      });
      const copy = await this.cloneOne(tx, source, {
        folder_id: source.folder_id, passage_id: source.passage_id, sort_order: source.sort_order + 1,
        category_id: source.category_id, subcategory_id: source.subcategory_id,
      }, userId);
      if (source.type === "passage") {
        const children = await this.loadFull({ passage_id: id, archived_at: null });
        for (const [i, child] of children.entries()) {
          await this.cloneOne(tx, child, {
            folder_id: source.folder_id, passage_id: copy.id, sort_order: i + 1,
            category_id: child.category_id, subcategory_id: child.subcategory_id,
          }, userId);
        }
      }
      return copy.id;
    });
    return this.getOne(newId);
  }

  // ---------- Order and archive ----------

  async reorder(folderId: number, passageId: number | null, ids: number[]) {
    const rows = await this.db.qb_questions.findMany({
      where: { id: { in: ids } },
      select: { id: true, folder_id: true, passage_id: true },
    });
    const same = rows.length === ids.length && rows.every((r) => r.folder_id === folderId && r.passage_id === passageId);
    if (!same) throw new BadRequestError("Questions must be in the same folder");
    await this.db.$transaction(
      ids.map((id, i) => this.db.qb_questions.update({ where: { id }, data: { sort_order: i + 1 } })),
    );
  }

  async archive(ids: number[], userId: number) {
    await this.db.qb_questions.updateMany({
      where: { id: { in: ids }, archived_at: null },
      data: { archived_at: new Date(), archived_by: userId },
    });
  }

  async restore(ids: number[]) {
    const rows = await this.db.qb_questions.findMany({
      where: { id: { in: ids } },
      include: { passage: { select: { archived_at: true } }, folder: true },
    });
    if (rows.length !== ids.length) throw new NotFoundError("Question not found");
    for (const q of rows) {
      if (q.passage?.archived_at) throw new BadRequestError("Restore the passage first");
      if (await foldersService.isHidden(q.folder)) throw new BadRequestError("Restore the parent folder first");
    }
    await this.db.qb_questions.updateMany({ where: { id: { in: ids } }, data: { archived_at: null, archived_by: null } });
  }

  // Everything archived on its own, newest first, with where it was.
  async listArchive() {
    const [folders, questions] = await Promise.all([
      this.db.qb_folders.findMany({
        where: { archived_at: { not: null } },
        orderBy: { archived_at: "desc" },
        select: { id: true, name: true, bank_id: true, path: true, archived_at: true },
      }),
      this.db.qb_questions.findMany({
        where: { archived_at: { not: null } },
        orderBy: { archived_at: "desc" },
        select: {
          id: true, serial: true, type: true, stem_text: true, reference_no: true, passage_id: true,
          archived_at: true, folder: { select: { id: true, path: true } },
        },
        take: 500,
      }),
    ]);
    const allIds = new Set<number>();
    folders.forEach((f) => pathIds(f.path).forEach((i) => allIds.add(i)));
    questions.forEach((q) => pathIds(q.folder.path).forEach((i) => allIds.add(i)));
    const names = new Map(
      (await this.db.qb_folders.findMany({ where: { id: { in: [...allIds] } }, select: { id: true, name: true } }))
        .map((f) => [f.id, f.name]),
    );
    const trail = (path: string, dropLast: boolean) => {
      const ids = pathIds(path);
      return (dropLast ? ids.slice(0, -1) : ids).map((i) => names.get(i) ?? "");
    };
    return {
      folders: folders.map((f) => ({
        id: f.id, name: f.name, is_bank: f.bank_id === null, archived_at: f.archived_at, location: trail(f.path, true),
      })),
      questions: questions.map(({ folder, ...q }) => ({ ...q, folder_id: folder.id, location: trail(folder.path, false) })),
    };
  }
}

export const questionsService = new QuestionsService();
