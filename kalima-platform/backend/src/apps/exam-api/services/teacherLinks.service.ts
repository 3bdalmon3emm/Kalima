import crypto from "crypto";
import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { pathIds } from "./folders.service";

// Teachers on exams. The admin adds a teacher on an exam folder (everything
// inside it, now and later) or on one exam; each exam then gets one
// permanent link for that teacher, so a printed QR keeps working.
//
// Access comes from the assignments only: a teacher's link works while an
// assignment covers its exam (directly or through any folder above it).
// closed_at is the admin's own switch on one link and is never touched by
// adding or removing teachers. Dates: a link edited by hand keeps its own,
// otherwise a direct exam assignment wins over the nearest folder.

const LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Assignment = {
  id: number;
  teacher_user_id: number;
  folder_id: number | null;
  exam_id: number | null;
  starts_at: Date;
  ends_at: Date;
};

class TeacherLinksService {
  constructor(private db: PrismaClient = prisma) {}

  // ---------- Which assignment covers an exam ----------

  // The assignment that gives a teacher this exam (direct first, then the
  // deepest folder above it), or null.
  coveringAssignment(examId: number, folderPath: string, assignments: Assignment[]): Assignment | null {
    const direct = assignments.find((a) => a.exam_id === examId);
    if (direct) return direct;
    const ancestors = pathIds(folderPath);
    let best: Assignment | null = null;
    let bestDepth = -1;
    for (const a of assignments) {
      if (a.folder_id === null) continue;
      const depth = ancestors.indexOf(a.folder_id);
      if (depth > bestDepth) { best = a; bestDepth = depth; }
    }
    return best;
  }

  private async activeAssignments(teacherIds: number[]) {
    return this.db.ex_teacher_assignments.findMany({
      where: { teacher_user_id: { in: teacherIds }, removed_at: null },
      select: { id: true, teacher_user_id: true, folder_id: true, exam_id: true, starts_at: true, ends_at: true },
    });
  }

  // True when the link's teacher still has its exam. Every link belongs to a
  // teacher; one without (an old admin test link) never opens.
  async linkCovered(link: { exam_id: number; teacher_user_id: number | null }): Promise<boolean> {
    if (link.teacher_user_id === null) return false;
    const exam = await this.db.ex_exams.findUnique({ where: { id: link.exam_id }, select: { id: true, folder: { select: { path: true } } } });
    if (!exam) return false;
    return !!this.coveringAssignment(exam.id, exam.folder.path, await this.activeAssignments([link.teacher_user_id]));
  }

  // ---------- Making the links ----------

  // Every exam a teacher's assignments cover gets its link, and links with
  // inherited dates follow their assignment. Safe to call any time.
  async ensureLinks(teacherId: number, createdBy?: number | null) {
    const assignments = await this.activeAssignments([teacherId]);
    if (!assignments.length) return;
    const folderIds = assignments.map((a) => a.folder_id).filter((x): x is number => x !== null);
    const examIds = assignments.map((a) => a.exam_id).filter((x): x is number => x !== null);
    const folders = folderIds.length
      ? await this.db.ex_folders.findMany({ where: { id: { in: folderIds } }, select: { path: true } })
      : [];
    const exams = await this.db.ex_exams.findMany({
      where: {
        OR: [
          ...(examIds.length ? [{ id: { in: examIds } }] : []),
          ...folders.map((f) => ({ folder: { path: { startsWith: f.path } } })),
        ],
      },
      select: { id: true, folder: { select: { path: true } } },
    });
    const links = await this.db.ex_links.findMany({
      where: { teacher_user_id: teacherId, exam_id: { in: exams.map((e) => e.id) } },
    });
    const linkByExam = new Map(links.map((l) => [l.exam_id, l]));
    for (const exam of exams) {
      const a = this.coveringAssignment(exam.id, exam.folder.path, assignments);
      if (!a) continue;
      const link = linkByExam.get(exam.id);
      if (!link) {
        await this.db.ex_links.create({
          data: { exam_id: exam.id, teacher_user_id: teacherId, code: await this.newCode(), starts_at: a.starts_at, ends_at: a.ends_at, created_by: createdBy ?? null },
        });
      } else if (!link.dates_custom && (link.starts_at.getTime() !== a.starts_at.getTime() || link.ends_at.getTime() !== a.ends_at.getTime())) {
        await this.db.ex_links.update({ where: { id: link.id }, data: { starts_at: a.starts_at, ends_at: a.ends_at } });
      }
    }
  }

  // A new exam: teachers on the folders above it get their links.
  async onExamCreated(examId: number) {
    const exam = await this.db.ex_exams.findUnique({ where: { id: examId }, select: { folder: { select: { path: true } } } });
    if (!exam) return;
    const teachers = await this.db.ex_teacher_assignments.findMany({
      where: { removed_at: null, folder_id: { in: pathIds(exam.folder.path) } },
      select: { teacher_user_id: true },
      distinct: ["teacher_user_id"],
    });
    for (const t of teachers) await this.ensureLinks(t.teacher_user_id);
  }

  async newCode() {
    for (;;) {
      const code = Array.from(crypto.randomBytes(6), (b) => LINK_ALPHABET[b % LINK_ALPHABET.length]).join("");
      if (!(await this.db.ex_links.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
  }

  // ---------- Assignments ----------

  private async assertTeacher(teacherId: number) {
    const teacher = await this.db.users.findFirst({
      where: { id: teacherId, OR: [{ is_deleted: false }, { is_deleted: null }], user_roles: { some: { role: "Teacher" } } },
      select: { id: true },
    });
    if (!teacher) throw new BadRequestError("This account is not a teacher");
  }

  // Adds a teacher on a folder or an exam (or changes the dates of an
  // existing one; a removed teacher comes back with the same links).
  async assign(target: { folderId?: number; examId?: number }, teacherId: number, startsAt: Date, endsAt: Date, userId: number) {
    if (endsAt <= startsAt) throw new BadRequestError("The end date must be after the start date");
    await this.assertTeacher(teacherId);
    if (target.folderId) {
      const folder = await this.db.ex_folders.findUnique({ where: { id: target.folderId }, select: { id: true } });
      if (!folder) throw new NotFoundError("Folder not found");
    } else if (target.examId) {
      const exam = await this.db.ex_exams.findUnique({ where: { id: target.examId }, select: { id: true } });
      if (!exam) throw new NotFoundError("Exam not found");
    } else {
      throw new BadRequestError("Pick a folder or an exam");
    }
    const where = target.folderId
      ? { teacher_user_id: teacherId, folder_id: target.folderId }
      : { teacher_user_id: teacherId, exam_id: target.examId };
    const existing = await this.db.ex_teacher_assignments.findFirst({ where });
    const row = existing
      ? await this.db.ex_teacher_assignments.update({
        where: { id: existing.id },
        data: { starts_at: startsAt, ends_at: endsAt, removed_at: null },
      })
      : await this.db.ex_teacher_assignments.create({
        data: { ...where, starts_at: startsAt, ends_at: endsAt, created_by: userId },
      });
    await this.ensureLinks(teacherId, userId);
    return row;
  }

  // The teacher leaves this folder or exam: their links there stop working
  // (unless another assignment still covers them); results stay.
  async remove(assignmentId: number) {
    const row = await this.db.ex_teacher_assignments.findUnique({ where: { id: assignmentId } });
    if (!row) throw new NotFoundError("Teacher not found here");
    await this.db.ex_teacher_assignments.update({ where: { id: assignmentId }, data: { removed_at: new Date() } });
    await this.ensureLinks(row.teacher_user_id);
  }

  // New dates for a teacher's folder or exam (links with hand-set dates keep
  // theirs).
  async setAssignmentDates(assignmentId: number, startsAt: Date, endsAt: Date) {
    if (endsAt <= startsAt) throw new BadRequestError("The end date must be after the start date");
    const row = await this.db.ex_teacher_assignments.findUnique({ where: { id: assignmentId } });
    if (!row || row.removed_at) throw new NotFoundError("Teacher not found here");
    const updated = await this.db.ex_teacher_assignments.update({ where: { id: assignmentId }, data: { starts_at: startsAt, ends_at: endsAt } });
    await this.ensureLinks(row.teacher_user_id);
    return updated;
  }

  // A teacher's links to every exam in a folder (and the folders inside it),
  // for the QR download.
  async folderLinksOf(folderId: number, teacherId: number) {
    const folder = await this.db.ex_folders.findUnique({ where: { id: folderId }, select: { path: true } });
    if (!folder) throw new NotFoundError("Folder not found");
    const links = await this.linksOf([teacherId]);
    return links.filter((l) => l.exam.folder.path.startsWith(folder.path) && !l.exam.archived_at);
  }

  // Teachers added directly on a folder.
  async folderTeachers(folderId: number) {
    const rows = await this.db.ex_teacher_assignments.findMany({
      where: { folder_id: folderId, removed_at: null },
      orderBy: { created_at: "asc" },
    });
    const users = await this.teacherCards(rows.map((r) => r.teacher_user_id));
    return rows.map((r) => ({ id: r.id, starts_at: r.starts_at, ends_at: r.ends_at, teacher: users.get(r.teacher_user_id) ?? { id: r.teacher_user_id } }));
  }

  // Every teacher who has this exam (directly or through a folder), with
  // their link and its state.
  async examTeachers(examId: number) {
    const exam = await this.db.ex_exams.findUnique({
      where: { id: examId },
      select: { id: true, archived_at: true, published_at: true, folder: { select: { path: true, name: true } } },
    });
    if (!exam) throw new NotFoundError("Exam not found");
    const assignments = await this.db.ex_teacher_assignments.findMany({
      where: { removed_at: null, OR: [{ exam_id: examId }, { folder_id: { in: pathIds(exam.folder.path) } }] },
      select: { id: true, teacher_user_id: true, folder_id: true, exam_id: true, starts_at: true, ends_at: true },
    });
    const teacherIds = [...new Set(assignments.map((a) => a.teacher_user_id))];
    for (const t of teacherIds) await this.ensureLinks(t);
    const [links, users, folders] = await Promise.all([
      this.db.ex_links.findMany({ where: { exam_id: examId, teacher_user_id: { in: teacherIds } } }),
      this.teacherCards(teacherIds),
      this.db.ex_folders.findMany({ where: { id: { in: assignments.map((a) => a.folder_id).filter((x): x is number => x !== null) } }, select: { id: true, name: true } }),
    ]);
    const folderName = new Map(folders.map((f) => [f.id, f.name]));
    const now = Date.now();
    return teacherIds.map((tid) => {
      const mine = assignments.filter((a) => a.teacher_user_id === tid);
      const a = this.coveringAssignment(examId, exam.folder.path, mine)!;
      const link = links.find((l) => l.teacher_user_id === tid);
      const state = !link ? "missing"
        : exam.archived_at ? "archived"
          : link.closed_at ? "closed"
            : !exam.published_at ? "not_published"
              : now < link.starts_at.getTime() ? "not_started"
                : now > link.ends_at.getTime() ? "ended" : "open";
      return {
        teacher: users.get(tid) ?? { id: tid },
        assignment_id: a.id,
        source: a.exam_id ? { type: "exam" } : { type: "folder", folder_id: a.folder_id, name: folderName.get(a.folder_id!) ?? null },
        link: link && { id: link.id, code: link.code, starts_at: link.starts_at, ends_at: link.ends_at, closed_at: link.closed_at, dates_custom: link.dates_custom },
        state,
      };
    });
  }

  // ---------- One link ----------

  async getTeacherLink(linkId: number) {
    const link = await this.db.ex_links.findUnique({ where: { id: linkId } });
    if (!link || link.teacher_user_id === null) throw new NotFoundError("Link not found");
    return link;
  }

  // Dates set by hand for one link (folder changes then leave it alone);
  // `null` dates go back to the assignment's.
  async setLinkDates(linkId: number, dates: { startsAt: Date; endsAt: Date } | null) {
    const link = await this.getTeacherLink(linkId);
    if (!dates) {
      await this.db.ex_links.update({ where: { id: linkId }, data: { dates_custom: false } });
      await this.ensureLinks(link.teacher_user_id!);
      return this.db.ex_links.findUniqueOrThrow({ where: { id: linkId } });
    }
    if (dates.endsAt <= dates.startsAt) throw new BadRequestError("The end date must be after the start date");
    return this.db.ex_links.update({ where: { id: linkId }, data: { starts_at: dates.startsAt, ends_at: dates.endsAt, dates_custom: true } });
  }

  async setLinkClosed(linkId: number, closed: boolean) {
    await this.getTeacherLink(linkId);
    return this.db.ex_links.update({ where: { id: linkId }, data: { closed_at: closed ? new Date() : null } });
  }

  // ---------- A teacher's exams ----------

  // Links of every exam the teacher (or the teachers an assistant works for)
  // currently has, with the exam and its folder path.
  async linksOf(teacherIds: number[]) {
    for (const t of teacherIds) await this.ensureLinks(t);
    const assignments = await this.activeAssignments(teacherIds);
    const links = await this.db.ex_links.findMany({
      where: { teacher_user_id: { in: teacherIds } },
      include: {
        exam: {
          select: {
            id: true, name: true, serial: true, type: true, mode: true, description: true, duration_minutes: true,
            published_at: true, archived_at: true, folder_id: true, subject_id: true,
            folder: { select: { id: true, name: true, path: true } },
          },
        },
      },
      orderBy: [{ exam_id: "asc" }],
    });
    return links.filter((l) => this.coveringAssignment(l.exam_id, l.exam.folder.path, assignments.filter((a) => a.teacher_user_id === l.teacher_user_id)));
  }

  async teacherCards(ids: number[]) {
    const users = await this.db.users.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, email: true, phone: true, profile_pic_url: true },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  // Teachers to pick from when adding one.
  async searchTeachers(term: string) {
    const t = term.trim();
    return this.db.users.findMany({
      where: {
        OR: [{ is_deleted: false }, { is_deleted: null }],
        user_roles: { some: { role: "Teacher" } },
        ...(t && {
          AND: [{
            OR: [
              { name: { contains: t, mode: "insensitive" } },
              { email: { contains: t, mode: "insensitive" } },
              { phone: { contains: t } },
            ],
          }],
        }),
      },
      select: { id: true, name: true, email: true, phone: true, profile_pic_url: true },
      orderBy: { name: "asc" },
      take: 20,
    });
  }
}

export const teacherLinksService = new TeacherLinksService();
