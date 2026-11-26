import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { NotFoundError } from "../../../libs/errors";
import { pathIds } from "./folders.service";
import { teacherLinksService } from "./teacherLinks.service";
import { examsService } from "./exams.service";
import { bandFor } from "./attempts.service";
import { appealsService } from "./appeals.service";
import { resultsService } from "./results.service";
import { paged, paging, searchTerm, slicePage, type Paging } from "./paging";

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

  // Every exam given to these teachers, with its link and counts.
  private async allExams(teacherIds: number[]) {
    if (!teacherIds.length) return [];
    const links = (await teacherLinksService.linksOf(teacherIds)).filter((l) => !l.exam.archived_at);
    const linkIds = links.map((l) => l.id);
    const [counts, pending, appeals] = await Promise.all([
      this.db.ex_attempts.groupBy({ by: ["link_id"], where: { link_id: { in: linkIds } }, _count: { _all: true } }),
      this.db.ex_attempts.groupBy({ by: ["link_id"], where: { link_id: { in: linkIds }, status: "pending" }, _count: { _all: true } }),
      appealsService.pendingByLink(linkIds),
    ]);
    const countOf = new Map(counts.map((c) => [c.link_id, c._count._all]));
    const pendingOf = new Map(pending.map((c) => [c.link_id, c._count._all]));
    const now = Date.now();
    return links.map((l) => ({
      id: l.exam.id,
      name: l.exam.name,
      serial: l.exam.serial,
      type: l.exam.type,
      folder_id: l.exam.folder.id,
      path: l.exam.folder.path,
      teacher_id: l.teacher_user_id,
      sort_order: l.exam.sort_order,
      link: { id: l.id, code: l.code, starts_at: l.starts_at, ends_at: l.ends_at, closed_at: l.closed_at },
      state: l.closed_at ? "closed" : !l.exam.published_at ? "not_published" : now < l.starts_at.getTime() ? "not_started" : now > l.ends_at.getTime() ? "ended" : "open",
      attempts: countOf.get(l.id) ?? 0,
      pending: pendingOf.get(l.id) ?? 0,
      appeals: appeals.get(l.id) ?? 0,
    }));
  }

  // The folders above these teachers' exams (to draw the tree), each with
  // the totals of everything under it. The exams come a page at a time
  // from examList.
  async myExams(teacherIds: number[]) {
    const exams = await this.allExams(teacherIds);
    if (!exams.length) return { exam_count: 0, folders: [], teachers: [] };
    const folderIds = [...new Set(exams.flatMap((e) => pathIds(e.path)))];
    const folders = await this.db.ex_folders.findMany({ where: { id: { in: folderIds } }, select: { id: true, name: true, parent_id: true, sort_order: true } });
    const totals = new Map<number, { exams: number; own: number; pending: number; appeals: number }>();
    for (const e of exams) {
      for (const id of pathIds(e.path)) {
        const t = totals.get(id) ?? { exams: 0, own: 0, pending: 0, appeals: 0 };
        t.exams += 1;
        if (id === e.folder_id) t.own += 1;
        t.pending += e.pending;
        t.appeals += e.appeals;
        totals.set(id, t);
      }
    }
    const teachers = await teacherLinksService.teacherCards(teacherIds);
    return {
      exam_count: exams.length,
      teachers: [...teachers.values()],
      folders: folders.map((f) => ({ ...f, totals: totals.get(f.id) ?? { exams: 0, own: 0, pending: 0, appeals: 0 } })),
    };
  }

  // A page of the exams directly in one folder, or of those found by name
  // or number in any folder.
  async examList(teacherIds: number[], filter: { folderId?: number; q?: string }, p: Paging = paging()) {
    const term = searchTerm(filter.q).toLowerCase();
    const all = await this.allExams(teacherIds);
    const shown = term
      ? all.filter((e) => e.name.toLowerCase().includes(term) || (e.serial ?? "").toLowerCase().includes(term))
      : all.filter((e) => e.folder_id === filter.folderId);
    // A folder keeps the admin's order; a search sorts by name, numbers as numbers.
    const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name, "ar", { numeric: true });
    shown.sort((x, y) => (term ? byName(x, y) : x.sort_order - y.sort_order) || byName(x, y) || x.id - y.id || (x.teacher_id ?? 0) - (y.teacher_id ?? 0));
    return slicePage(shown.map(({ path, sort_order, ...e }) => e), p);
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
    return {
      exam: { ...exam, sections },
      links: links.map((l) => ({ id: l.id, code: l.code, teacher_id: l.teacher_user_id, starts_at: l.starts_at, ends_at: l.ends_at, closed_at: l.closed_at })),
      summary: await resultsService.summary({ link_id: { in: links.map((l) => l.id) } }, details.pass_percent),
    };
  }

  // A page of the students who came through these teachers' links, the
  // latest active first, each with every attempt. Search by name, phone or
  // number runs over all of them.
  // filter: graded (has a finished attempt), ungraded (none finished yet:
  // waiting for essay marks or still solving), passed / failed (best
  // finished attempt against the pass mark). counts covers every choice.
  async students(examId: number, teacherIds: number[], q = "", p: Paging = paging(), filter = "all") {
    const links = await this.linksTo(examId, teacherIds);
    const exam = await this.db.ex_exams.findUnique({ where: { id: examId }, select: { pass_percent: true } });
    if (!exam) throw new NotFoundError("Exam not found");
    const scope = { link_id: { in: links.map((l) => l.id) } };
    const matching = await resultsService.matchingStudents(scope, searchTerm(q));
    const where = { ...scope, ...(matching && { student_user_id: { in: matching } }) };
    const [ordered, done] = await Promise.all([
      this.db.ex_attempts.groupBy({
        by: ["student_user_id"],
        where,
        _max: { started_at: true },
        orderBy: [{ _max: { started_at: "desc" } }, { student_user_id: "asc" }],
      }),
      this.db.ex_attempts.findMany({ where: { ...where, status: "done" }, select: { student_user_id: true, score: true, total: true } }),
    ]);
    // Each student's best finished percent.
    const bestOf = new Map<number, number>();
    for (const a of done) {
      const total = num(a.total);
      const percent = total ? (num(a.score) / total) * 100 : 0;
      if (!bestOf.has(a.student_user_id) || percent > bestOf.get(a.student_user_id)!) bestOf.set(a.student_user_id, percent);
    }
    const kind = (id: number) => (!bestOf.has(id) ? "ungraded" : bestOf.get(id)! >= exam.pass_percent ? "passed" : "failed");
    const allIds = ordered.map((g) => g.student_user_id);
    const counts = { all: allIds.length, graded: bestOf.size, ungraded: 0, passed: 0, failed: 0 };
    for (const id of allIds) counts[kind(id)] += 1;
    const chosen = filter === "graded" ? allIds.filter((id) => bestOf.has(id))
      : ["ungraded", "passed", "failed"].includes(filter) ? allIds.filter((id) => kind(id) === filter)
        : allIds;
    const ids = chosen.slice(p.skip, p.skip + p.size);
    const all = chosen;
    const attempts = await this.db.ex_attempts.findMany({
      where: { ...scope, student_user_id: { in: ids } },
      orderBy: [{ student_user_id: "asc" }, { attempt_no: "asc" }],
      select: { id: true, link_id: true, student_user_id: true, attempt_no: true, status: true, score: true, total: true, submitted_at: true, tab_leaves: true, fullscreen_exits: true, copy_attempts: true },
    });
    const users = await this.db.users.findMany({
      where: { id: { in: ids } },
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
    const items = ids.map((id) => students.get(id)).filter(Boolean).map((s) => {
      const last = s.attempts[s.attempts.length - 1];
      const percent = s.best !== null && s.total ? round2((s.best / s.total) * 100) : null;
      return { ...s, last_status: last.status, percent, band: percent === null ? null : bandFor(percent, exam.pass_percent) };
    });
    return { counts, ...paged(items, all.length, p) };
  }

  // Every link these teachers ever had, for their appeals.
  async linkIdsOf(teacherIds: number[]) {
    if (!teacherIds.length) return [];
    const rows = await this.db.ex_links.findMany({ where: { teacher_user_id: { in: teacherIds } }, select: { id: true } });
    return rows.map((r) => r.id);
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
