import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { NotFoundError } from "../../../libs/errors";
import { pathIds } from "./folders.service";
import { teacherLinksService } from "./teacherLinks.service";
import { examsService } from "./exams.service";
import { bandFor } from "./attempts.service";

// What a teacher (or an assistant, for the teachers they work for) sees:
// the exams they were given, their own link to each, and the students who
// came through those links. Nothing outside their own links is reachable.

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

class TeacherPortalService {
  constructor(private db: PrismaClient = prisma) {}

  // The teachers whose exams this account works on: itself if a teacher,
  // and the teachers it assists.
  async teacherIdsFor(userId: number, roles: Array<{ role: string }> = []) {
    const ids = new Set<number>();
    if (roles.some((r) => r.role === "Teacher")) ids.add(userId);
    if (roles.some((r) => r.role === "Assistant")) {
      const rows = await this.db.teacher_assistants.findMany({ where: { assistant_user_id: userId }, select: { teacher_user_id: true } });
      rows.forEach((r) => ids.add(r.teacher_user_id));
    }
    return [...ids];
  }

  // Every exam given to these teachers, with its link and counts, and the
  // folders above it (to draw the tree).
  async myExams(teacherIds: number[]) {
    if (!teacherIds.length) return { exams: [], folders: [], teachers: [] };
    const links = (await teacherLinksService.linksOf(teacherIds)).filter((l) => !l.exam.archived_at);
    const linkIds = links.map((l) => l.id);
    const [counts, pending] = await Promise.all([
      this.db.ex_attempts.groupBy({ by: ["link_id"], where: { link_id: { in: linkIds } }, _count: { _all: true } }),
      this.db.ex_attempts.groupBy({ by: ["link_id"], where: { link_id: { in: linkIds }, status: "pending" }, _count: { _all: true } }),
    ]);
    const countOf = new Map(counts.map((c) => [c.link_id, c._count._all]));
    const pendingOf = new Map(pending.map((c) => [c.link_id, c._count._all]));
    const folderIds = [...new Set(links.flatMap((l) => pathIds(l.exam.folder.path)))];
    const folders = await this.db.ex_folders.findMany({ where: { id: { in: folderIds } }, select: { id: true, name: true, parent_id: true, sort_order: true } });
    const teachers = await teacherLinksService.teacherCards(teacherIds);
    const now = Date.now();
    return {
      teachers: [...teachers.values()],
      folders,
      exams: links.map((l) => ({
        id: l.exam.id,
        name: l.exam.name,
        serial: l.exam.serial,
        type: l.exam.type,
        folder_id: l.exam.folder.id,
        teacher_id: l.teacher_user_id,
        link: { id: l.id, code: l.code, starts_at: l.starts_at, ends_at: l.ends_at, closed_at: l.closed_at },
        state: l.closed_at ? "closed" : !l.exam.published_at ? "not_published" : now < l.starts_at.getTime() ? "not_started" : now > l.ends_at.getTime() ? "ended" : "open",
        attempts: countOf.get(l.id) ?? 0,
        pending: pendingOf.get(l.id) ?? 0,
      })),
    };
  }

  // The teacher's links to this exam (an assistant may hold several).
  async linksTo(examId: number, teacherIds: number[]) {
    const links = (await teacherLinksService.linksOf(teacherIds)).filter((l) => l.exam_id === examId);
    if (!links.length) throw new NotFoundError("Exam not found");
    return links;
  }

  // The exam read-only (with answers and explanations), the link(s) and the
  // students who came through them.
  async exam(examId: number, teacherIds: number[]) {
    const links = await this.linksTo(examId, teacherIds);
    const details = await examsService.details(examId);
    const { test_link, attempt_count, sections, ...exam } = details as any;
    const attempts = await this.db.ex_attempts.findMany({
      where: { link_id: { in: links.map((l) => l.id) } },
      orderBy: [{ student_user_id: "asc" }, { attempt_no: "asc" }],
      select: { id: true, link_id: true, student_user_id: true, attempt_no: true, status: true, score: true, total: true, submitted_at: true, tab_leaves: true, fullscreen_exits: true, copy_attempts: true },
    });
    const users = await this.db.users.findMany({
      where: { id: { in: [...new Set(attempts.map((a) => a.student_user_id))] } },
      select: { id: true, name: true, phone: true, profile_pic_url: true, students: { select: { sequenced_id: true, levels: { select: { title: true, title_ar: true } } } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const students = new Map<number, any>();
    for (const a of attempts) {
      const u = byId.get(a.student_user_id);
      const row = students.get(a.student_user_id) ?? {
        student: { id: a.student_user_id, name: u?.name ?? "", phone: u?.phone ?? null, profile_pic_url: u?.profile_pic_url ?? null, serial: u?.students?.sequenced_id ?? null, level: u?.students?.levels?.title_ar || u?.students?.levels?.title || null },
        link_id: a.link_id,
        attempts: [] as any[],
        best: null as number | null,
        total: num(a.total),
      };
      const score = a.status === "done" ? num(a.score) : null;
      row.attempts.push({ id: a.id, attempt_no: a.attempt_no, status: a.status, score, total: num(a.total), submitted_at: a.submitted_at, tab_leaves: a.tab_leaves, fullscreen_exits: a.fullscreen_exits, copy_attempts: a.copy_attempts });
      if (score !== null && (row.best === null || score > row.best)) row.best = score;
      students.set(a.student_user_id, row);
    }
    return {
      exam: { ...exam, sections },
      links: links.map((l) => ({ id: l.id, code: l.code, teacher_id: l.teacher_user_id, starts_at: l.starts_at, ends_at: l.ends_at, closed_at: l.closed_at })),
      students: [...students.values()].map((s) => {
        const last = s.attempts[s.attempts.length - 1];
        const percent = s.best !== null && s.total ? round2((s.best / s.total) * 100) : null;
        return { ...s, last_status: last.status, percent, band: percent === null ? null : bandFor(percent, details.pass_percent) };
      }),
    };
  }

  // The attempt, only when it came through one of these teachers' links.
  async assertAttempt(attemptId: number, teacherIds: number[]) {
    const attempt = await this.db.ex_attempts.findUnique({ where: { id: attemptId }, select: { id: true, link_id: true, student_user_id: true, link: { select: { teacher_user_id: true } } } });
    if (!attempt || attempt.link.teacher_user_id === null || !teacherIds.includes(attempt.link.teacher_user_id)) {
      throw new NotFoundError("Attempt not found");
    }
    return attempt;
  }

  async assertLink(linkId: number, teacherIds: number[]) {
    const link = await this.db.ex_links.findUnique({ where: { id: linkId }, select: { id: true, code: true, teacher_user_id: true } });
    if (!link || link.teacher_user_id === null || !teacherIds.includes(link.teacher_user_id)) throw new NotFoundError("Link not found");
    return link;
  }
}

export const teacherPortalService = new TeacherPortalService();
