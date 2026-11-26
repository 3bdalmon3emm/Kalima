import crypto from "crypto";
import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { pathIds } from "./folders.service";
import { teacherLinksService } from "./teacherLinks.service";
import { examFoldersService } from "./examFolders.service";
import { questionsService } from "./questions.service";
import { paged, paging, type Paging } from "./paging";
import { ExamSettings, DIFFICULTY_KEYS, RuleInput } from "./examInput";

// Exams: settings, sections, their questions and, for random exams, the draw
// rules. Questions point at the bank; the mark and the order live here.

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function shuffled<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Keeps the children of one passage next to each other, where the first of
// them stands.
export function groupPassages<T>(items: T[], passageOf: (item: T) => number | null): T[] {
  const out: T[] = [];
  const placed = new Set<number>();
  for (const item of items) {
    const passage = passageOf(item);
    if (passage === null) out.push(item);
    else if (!placed.has(passage)) {
      placed.add(passage);
      out.push(...items.filter((other) => passageOf(other) === passage));
    }
  }
  return out;
}

// A matching question starts at one mark per pair.
export function pairCount(items: { side: string; match_item_id: number | null }[]) {
  return items.filter((i) => i.side === "left" && i.match_item_id !== null).length;
}

const num = (d: unknown) => Number(d ?? 0);

class ExamsService {
  constructor(private db: PrismaClient = prisma) {}

  async getExam(id: number) {
    const exam = await this.db.ex_exams.findUnique({ where: { id } });
    if (!exam) throw new NotFoundError("Exam not found");
    return exam;
  }

  async assertEditable(id: number) {
    const exam = await this.getExam(id);
    if (exam.archived_at) throw new BadRequestError("This exam is archived");
    return exam;
  }

  // ---------- Exams ----------

  async create(folderId: number, settings: ExamSettings, userId: number) {
    const folder = await examFoldersService.getFolder(folderId);
    await examFoldersService.assertUsable(folder);
    if (settings.subject_id) await this.assertSubject(settings.subject_id);
    const created = await this.db.$transaction(async (tx) => {
      const last = await tx.ex_exams.aggregate({ where: { folder_id: folderId }, _max: { sort_order: true } });
      const exam = await tx.ex_exams.create({
        data: {
          ...settings,
          mode: settings.mode!,
          type: settings.type!,
          name: settings.name!,
          folder_id: folderId,
          sort_order: (last._max.sort_order ?? 0) + 1,
          created_by: userId,
          updated_by: userId,
        },
      });
      await tx.ex_sections.create({ data: { exam_id: exam.id, sort_order: 1 } });
      return exam;
    });
    // Teachers on the folders above get their link to the new exam.
    await teacherLinksService.onExamCreated(created.id);
    return created;
  }

  async update(id: number, settings: ExamSettings, userId: number) {
    const exam = await this.assertEditable(id);
    if (settings.mode && settings.mode !== exam.mode) {
      throw new BadRequestError("The way an exam is built cannot change after it is created");
    }
    if (settings.subject_id) await this.assertSubject(settings.subject_id);
    const redoNew = settings.redo_new_questions ?? exam.redo_new_questions;
    if (redoNew && exam.mode !== "random") throw new BadRequestError("Only random exams can redo with new questions");
    const { mode, ...rest } = settings;
    return this.db.ex_exams.update({ where: { id }, data: { ...rest, updated_by: userId } });
  }

  // The whole exam for its admin page: settings, sections with their
  // questions (and the passages they sit under), rules, totals and links.
  async details(id: number) {
    const exam = await this.db.ex_exams.findUnique({
      where: { id },
      include: {
        subjects: { select: { id: true, title: true } },
        folder: { select: { id: true, name: true, path: true } },
        sections: { orderBy: [{ sort_order: "asc" }, { id: "asc" }], include: { rules: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] } } },
        questions: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
        cancelled: { select: { question_id: true } },
      },
    });
    if (!exam) throw new NotFoundError("Exam not found");

    const questionIds = exam.questions.map((q) => q.question_id);
    const rows = await questionsService.loadFull({ id: { in: questionIds } });
    const passageIds = [...new Set(rows.map((q) => q.passage_id).filter((p): p is number => p !== null))];
    const passages = passageIds.length ? await questionsService.loadFull({ id: { in: passageIds } }) : [];
    const shaped = await questionsService.presentFlat([...rows, ...passages]);
    const byId = new Map(shaped.map((q) => [q.id, q]));

    const breadcrumb = await this.db.ex_folders.findMany({
      where: { id: { in: pathIds(exam.folder.path) } },
      select: { id: true, name: true },
    });
    const crumbs = pathIds(exam.folder.path).map((fid) => breadcrumb.find((b) => b.id === fid)).filter(Boolean);

    const total = exam.questions.reduce((sum, q) => sum + num(q.mark), 0);
    const attempts = await this.db.ex_attempts.count({ where: { exam_id: id } });
    const { questions, folder, cancelled, ...rest } = exam;
    return {
      ...rest,
      breadcrumb: crumbs,
      total,
      attempt_count: attempts,
      cancelled_question_ids: cancelled.map((c) => c.question_id),
      sections: exam.sections.map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.section_id === s.id)
          .map((q) => ({ ...q, mark: num(q.mark), question: byId.get(q.question_id) ?? null })),
      })),
      passages: passageIds.map((pid) => byId.get(pid)).filter(Boolean),
    };
  }

  async archive(id: number, userId: number) {
    const exam = await this.getExam(id);
    if (exam.archived_at) return;
    await this.db.ex_exams.update({ where: { id }, data: { archived_at: new Date(), archived_by: userId } });
  }

  async restore(id: number) {
    const exam = await this.getExam(id);
    const folder = await examFoldersService.getFolder(exam.folder_id);
    if (await examFoldersService.isHidden(folder.path)) throw new BadRequestError("Restore the parent folder first");
    await this.db.ex_exams.update({ where: { id }, data: { archived_at: null, archived_by: null } });
  }

  async reorder(folderId: number, ids: number[]) {
    const exams = await this.db.ex_exams.findMany({ where: { id: { in: ids } }, select: { folder_id: true } });
    if (exams.length !== ids.length || exams.some((e) => e.folder_id !== folderId)) {
      throw new BadRequestError("Exams must be in the same folder");
    }
    await this.db.$transaction(ids.map((id, i) => this.db.ex_exams.update({ where: { id }, data: { sort_order: i + 1 } })));
  }

  // Exams found by name or number, newest edit first, a page at a time.
  // Exams in an archived folder (or under one) are left out in the query
  // itself, so every page is full and the total is right.
  async search(term: string, subjectId: number | undefined, p: Paging = paging()) {
    const archived = await this.db.ex_folders.findMany({ where: { archived_at: { not: null } }, select: { id: true } });
    const where = {
      archived_at: null,
      ...(subjectId && { subject_id: subjectId }),
      ...(archived.length && { folder: { NOT: { OR: archived.map((f) => ({ path: { contains: `/${f.id}/` } })) } } }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: "insensitive" as const } },
          { serial: { contains: term, mode: "insensitive" as const } },
        ],
      }),
    };
    const [exams, total] = await Promise.all([
      this.db.ex_exams.findMany({
        where,
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        skip: p.skip,
        take: p.size,
        select: {
          id: true, name: true, serial: true, type: true, mode: true, published_at: true, folder_id: true,
          subjects: { select: { id: true, title: true } },
        },
      }),
      this.db.ex_exams.count({ where }),
    ]);
    return paged(exams, total, p);
  }

  // Publishing opens the exam to its links. A total that differs from the
  // target is allowed; the caller shows the warning.
  async publish(id: number, userId: number) {
    const exam = await this.assertEditable(id);
    const questions = await this.db.ex_exam_questions.findMany({ where: { exam_id: id }, select: { mark: true } });
    if (!questions.length) throw new BadRequestError("Add questions before publishing");
    const total = questions.reduce((sum, q) => sum + num(q.mark), 0);
    await this.db.ex_exams.update({ where: { id }, data: { published_at: exam.published_at ?? new Date(), updated_by: userId } });
    const target = exam.target_total === null ? null : num(exam.target_total);
    return { total, target, total_mismatch: target !== null && Math.abs(target - total) > 0.001 };
  }

  async unpublish(id: number) {
    await this.assertEditable(id);
    await this.db.ex_exams.update({ where: { id }, data: { published_at: null } });
  }

  // ---------- Sections ----------

  async addSection(examId: number, name: string | null) {
    await this.assertEditable(examId);
    const last = await this.db.ex_sections.aggregate({ where: { exam_id: examId }, _max: { sort_order: true } });
    return this.db.ex_sections.create({ data: { exam_id: examId, name, sort_order: (last._max.sort_order ?? 0) + 1 } });
  }

  private async getSection(id: number) {
    const section = await this.db.ex_sections.findUnique({ where: { id } });
    if (!section) throw new NotFoundError("Section not found");
    await this.assertEditable(section.exam_id);
    return section;
  }

  async renameSection(id: number, name: string | null) {
    await this.getSection(id);
    return this.db.ex_sections.update({ where: { id }, data: { name } });
  }

  // Removes a section with its questions and rules; the last one stays.
  async deleteSection(id: number) {
    const section = await this.getSection(id);
    const count = await this.db.ex_sections.count({ where: { exam_id: section.exam_id } });
    if (count <= 1) throw new BadRequestError("An exam needs at least one section");
    await this.db.ex_sections.delete({ where: { id } });
  }

  async reorderSections(examId: number, ids: number[]) {
    await this.assertEditable(examId);
    const sections = await this.db.ex_sections.findMany({ where: { exam_id: examId }, select: { id: true } });
    if (sections.length !== ids.length || !sections.every((s) => ids.includes(s.id))) {
      throw new BadRequestError("Send every section of the exam");
    }
    await this.db.$transaction(ids.map((id, i) => this.db.ex_sections.update({ where: { id }, data: { sort_order: i + 1 } })));
  }

  // ---------- Questions (manual exams) ----------

  // Adds bank questions to a section in the order given. A passage adds all
  // its children. Questions already in the exam are skipped.
  async addQuestions(sectionId: number, ids: number[]) {
    const section = await this.getSection(sectionId);
    const exam = await this.getExam(section.exam_id);
    if (exam.mode !== "manual") throw new BadRequestError("Questions of a random exam come from its rules");

    const picked = await this.db.qb_questions.findMany({
      where: { id: { in: ids }, archived_at: null },
      select: { id: true, type: true },
    });
    if (picked.length !== ids.length) throw new NotFoundError("Question not found");
    const passageIds = picked.filter((q) => q.type === "passage").map((q) => q.id);
    const children = passageIds.length
      ? await this.db.qb_questions.findMany({
          where: { passage_id: { in: passageIds }, archived_at: null },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          select: { id: true, passage_id: true },
        })
      : [];
    const ordered = ids.flatMap((id) =>
      passageIds.includes(id) ? children.filter((c) => c.passage_id === id).map((c) => c.id) : [id]);

    const existing = new Set(
      (await this.db.ex_exam_questions.findMany({ where: { exam_id: exam.id }, select: { question_id: true } }))
        .map((q) => q.question_id),
    );
    const fresh = [...new Set(ordered)].filter((id) => !existing.has(id));
    if (!fresh.length) return { added: 0, skipped: ordered.length };

    const full = await questionsService.loadFull({ id: { in: fresh } });
    const byId = new Map(full.map((q) => [q.id, q]));
    const last = await this.db.ex_exam_questions.aggregate({ where: { section_id: sectionId }, _max: { sort_order: true } });
    let order = last._max.sort_order ?? 0;
    await this.db.ex_exam_questions.createMany({
      data: fresh.map((id) => {
        const q = byId.get(id)!;
        return {
          exam_id: exam.id,
          section_id: sectionId,
          question_id: id,
          mark: q.type === "matching" ? Math.max(pairCount(q.matching_items), 1) : 1,
          sort_order: ++order,
        };
      }),
    });
    await this.regroup(sectionId);
    return { added: fresh.length, skipped: ordered.length - fresh.length };
  }

  private async getExamQuestion(id: number) {
    const row = await this.db.ex_exam_questions.findUnique({ where: { id }, include: { question: { include: { matching_items: { where: { removed_at: null } } } } } });
    if (!row) throw new NotFoundError("Question not found");
    await this.assertEditable(row.exam_id);
    return row;
  }

  async setMark(id: number, mark: number) {
    // A matching question starts at one mark per pair; any other mark is
    // shared equally between its pairs when grading.
    await this.getExamQuestion(id);
    return this.db.ex_exam_questions.update({ where: { id }, data: { mark } });
  }

  async removeQuestions(examId: number, ids: number[]) {
    const exam = await this.assertEditable(examId);
    if (exam.mode !== "manual") throw new BadRequestError("Questions of a random exam come from its rules");
    await this.db.ex_exam_questions.deleteMany({ where: { exam_id: examId, id: { in: ids } } });
  }

  // New order of a section's questions; a question may come from another
  // section of the same exam. Passage children are kept together.
  async reorderQuestions(sectionId: number, ids: number[]) {
    const section = await this.getSection(sectionId);
    const rows = await this.db.ex_exam_questions.findMany({ where: { id: { in: ids } }, select: { exam_id: true } });
    if (rows.length !== ids.length || rows.some((r) => r.exam_id !== section.exam_id)) {
      throw new BadRequestError("Questions must belong to this exam");
    }
    await this.db.$transaction(ids.map((id, i) =>
      this.db.ex_exam_questions.update({ where: { id }, data: { section_id: sectionId, sort_order: i + 1 } })));
    await this.regroup(sectionId);
  }

  private async regroup(sectionId: number, tx: Tx | PrismaClient = this.db) {
    const rows = await tx.ex_exam_questions.findMany({
      where: { section_id: sectionId },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      select: { id: true, question: { select: { passage_id: true } } },
    });
    const grouped = groupPassages(rows, (r) => r.question.passage_id);
    await Promise.all(grouped.map((r, i) => tx.ex_exam_questions.update({ where: { id: r.id }, data: { sort_order: i + 1 } })));
  }

  // ---------- Draw rules (random exams) ----------

  async saveRules(sectionId: number, rules: RuleInput[]) {
    const section = await this.getSection(sectionId);
    const exam = await this.getExam(section.exam_id);
    if (exam.mode !== "random") throw new BadRequestError("Only random exams have draw rules");

    const folderIds = [...new Set(rules.flatMap((r) => r.folder_ids))];
    const folders = await this.db.qb_folders.findMany({ where: { id: { in: folderIds } }, select: { id: true } });
    if (folders.length !== folderIds.length) throw new NotFoundError("Folder not found");
    const categoryIds = [...new Set(rules.flatMap((r) => [r.category_id, r.subcategory_id]).filter((c): c is number => !!c))];
    const categories = await this.db.qb_categories.findMany({ where: { id: { in: categoryIds } }, select: { id: true, parent_id: true } });
    if (categories.length !== categoryIds.length) throw new NotFoundError("Category not found");
    for (const r of rules) {
      if (r.subcategory_id) {
        const sub = categories.find((c) => c.id === r.subcategory_id)!;
        if (sub.parent_id === null || (r.category_id && sub.parent_id !== r.category_id)) {
          throw new BadRequestError("The subcategory does not belong to the category");
        }
      }
    }

    await this.db.$transaction(async (tx) => {
      await tx.ex_draw_rules.deleteMany({ where: { section_id: sectionId } });
      if (rules.length) {
        await tx.ex_draw_rules.createMany({
          data: rules.map((r, i) => ({ ...r, section_id: sectionId, sort_order: i + 1 })),
        });
      }
    });
    return this.db.ex_draw_rules.findMany({ where: { section_id: sectionId }, orderBy: { sort_order: "asc" } });
  }

  // Picks questions for every rule of the exam. Returns the picks without
  // saving them, plus what each rule was short of.
  // Questions in avoid are drawn only when a rule has nothing else left.
  async drawQuestions(examId: number, avoid: Set<number> = new Set()) {
    const sections = await this.db.ex_sections.findMany({
      where: { exam_id: examId },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      include: { rules: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] } },
    });
    const taken = new Set<number>();
    const picks: { section_id: number; question_id: number; mark: number; rule_id: number; passage_id: number | null }[] = [];
    const shortages: { section_id: number; rule_id: number; difficulty: string; wanted: number; available: number }[] = [];

    for (const section of sections) {
      const sectionPicks: typeof picks = [];
      for (const rule of section.rules) {
        const folderIds = await this.visibleFolderIds(rule.folder_ids);
        for (const difficulty of DIFFICULTY_KEYS) {
          const wanted = (rule as any)[`${difficulty}_count`] as number;
          if (!wanted) continue;
          const candidates = await this.db.qb_questions.findMany({
            where: {
              folder_id: { in: folderIds },
              archived_at: null,
              type: { not: "passage" },
              difficulty,
              OR: [{ passage_id: null }, { passage: { archived_at: null } }],
              ...(rule.category_id && { category_id: rule.category_id }),
              ...(rule.subcategory_id && { subcategory_id: rule.subcategory_id }),
            },
            select: { id: true, type: true, passage_id: true },
          });
          const open = candidates.filter((c) => !taken.has(c.id));
          const free = [...shuffled(open.filter((c) => !avoid.has(c.id))), ...shuffled(open.filter((c) => avoid.has(c.id)))];
          if (free.length < wanted) {
            shortages.push({ section_id: section.id, rule_id: rule.id, difficulty, wanted, available: free.length });
          }
          for (const q of free.slice(0, wanted)) {
            taken.add(q.id);
            sectionPicks.push({
              section_id: section.id,
              question_id: q.id,
              rule_id: rule.id,
              passage_id: q.passage_id,
              // A drawn matching question takes its level's mark like any other;
              // grading shares it between the pairs.
              mark: num((rule as any)[`${difficulty}_mark`]),
            });
          }
        }
      }
      picks.push(...groupPassages(sectionPicks, (p) => p.passage_id));
    }
    return { picks, shortages };
  }

  // Draws the exam's questions again, replacing the current ones.
  async draw(examId: number) {
    const exam = await this.assertEditable(examId);
    if (exam.mode !== "random") throw new BadRequestError("Only random exams are drawn");
    const { picks, shortages } = await this.drawQuestions(examId);
    await this.db.$transaction(async (tx) => {
      await tx.ex_exam_questions.deleteMany({ where: { exam_id: examId } });
      const order = new Map<number, number>();
      await tx.ex_exam_questions.createMany({
        data: picks.map((p) => {
          const next = (order.get(p.section_id) ?? 0) + 1;
          order.set(p.section_id, next);
          return { exam_id: examId, section_id: p.section_id, question_id: p.question_id, mark: p.mark, rule_id: p.rule_id, sort_order: next };
        }),
      });
    });
    return { drawn: picks.length, shortages };
  }

  // A rule's folders and every folder under them, minus archived branches.
  async visibleFolderIds(roots: number[]) {
    if (!roots.length) return [];
    const rootRows = await this.db.qb_folders.findMany({ where: { id: { in: roots } }, select: { path: true } });
    const folders = await this.db.qb_folders.findMany({
      where: { OR: rootRows.map((r) => ({ path: { startsWith: r.path } })) },
      select: { id: true, path: true, archived_at: true },
    });
    const allIds = [...new Set(folders.flatMap((f) => pathIds(f.path)))];
    const archived = new Set(
      (await this.db.qb_folders.findMany({ where: { id: { in: allIds }, archived_at: { not: null } }, select: { id: true } }))
        .map((f) => f.id),
    );
    return folders.filter((f) => !pathIds(f.path).some((id) => archived.has(id))).map((f) => f.id);
  }

  private async newLinkCode() {
    for (;;) {
      const code = Array.from(crypto.randomBytes(6), (b) => LINK_ALPHABET[b % LINK_ALPHABET.length]).join("");
      if (!(await this.db.ex_links.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
  }

  private async assertSubject(subjectId: number) {
    const subject = await this.db.subjects.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundError("Subject not found");
  }
}

export const examsService = new ExamsService();
