import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { paging, slicePage, type Paging } from "./paging";

// A student's exams and homework across every teacher's link, grouped one
// row per link, and the performance indicator: per school year, per subject,
// exams and homework apart, the average and whether the student is going up
// or down. The school year runs from 1 July to 30 June (Cairo), like the
// yearly promotion. The parent sees the same view of their child.

const TIME_ZONE = "Africa/Cairo";

// Which attempt of an exam counts in the indicator: the best one (the
// owner's choice, so a better redo shows). "last" and "first" also work.
export const COUNTED_ATTEMPT: "last" | "best" | "first" = "best";

const num = (d: unknown) => Number(d ?? 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

// The school year a moment falls in, named by the year it starts (2026 =
// 2026/2027).
export function schoolYearOf(at: Date) {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" })
    .format(at)
    .split("-")
    .map(Number);
  return month >= 7 ? year : year - 1;
}

type Point = { exam_id: number; name: string; at: Date; percent: number; pass_percent: number };

// Up, down or steady from the slope of a straight line through the points
// (in percent per exam); under one point either way counts as steady.
function trendOf(points: Point[]) {
  if (points.length < 2) return "steady" as const;
  const n = points.length;
  const xs = points.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = points.reduce((s, p) => s + p.percent, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (points[i].percent - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return slope > 1 ? ("up" as const) : slope < -1 ? ("down" as const) : ("steady" as const);
}

class StudentExamsService {
  constructor(private db: PrismaClient = prisma) {}

  async overview(studentId: number, year?: number, filter: { subject?: number; type?: string } = {}, p: Paging = paging({}, 10)) {
    const attempts = await this.db.ex_attempts.findMany({
      where: { student_user_id: studentId },
      orderBy: [{ link_id: "asc" }, { attempt_no: "asc" }],
      select: {
        id: true, link_id: true, attempt_no: true, status: true, score: true, total: true, started_at: true, submitted_at: true,
        exam: { select: { id: true, name: true, serial: true, type: true, pass_percent: true, subjects: { select: { id: true, title: true } } } },
        link: { select: { code: true, teacher_user_id: true } },
      },
    });

    const teacherIds = [...new Set(attempts.map((a) => a.link.teacher_user_id).filter((id): id is number => !!id))];
    const teachers = new Map(
      (await this.db.users.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
    );

    // One row per link: the exam as this student took it from one teacher.
    const byLink = new Map<number, typeof attempts>();
    for (const a of attempts) byLink.set(a.link_id, [...(byLink.get(a.link_id) ?? []), a]);
    const rows = [...byLink.values()].map((list) => {
      const first = list[0];
      const shaped = list.map((a) => {
        const total = num(a.total);
        const score = a.status === "done" ? num(a.score) : null;
        return {
          id: a.id,
          attempt_no: a.attempt_no,
          status: a.status,
          score,
          total,
          percent: score === null ? null : total ? round1((score / total) * 100) : 0,
          started_at: a.started_at,
          submitted_at: a.submitted_at,
        };
      });
      const done = shaped.filter((a) => a.percent !== null);
      const counted =
        COUNTED_ATTEMPT === "best" ? done.reduce<(typeof done)[number] | null>((b, a) => (!b || a.percent! > b.percent! ? a : b), null)
        : COUNTED_ATTEMPT === "first" ? done[0] ?? null
        : done[done.length - 1] ?? null;
      return {
        link_code: first.link.code,
        exam: { id: first.exam.id, name: first.exam.name, serial: first.exam.serial, type: first.exam.type, pass_percent: first.exam.pass_percent },
        subject: first.exam.subjects ? { id: first.exam.subjects.id, title: first.exam.subjects.title } : null,
        teacher: first.link.teacher_user_id ? { id: first.link.teacher_user_id, name: teachers.get(first.link.teacher_user_id) ?? null } : null,
        school_year: schoolYearOf(first.started_at),
        attempts: shaped,
        counted: counted ? { id: counted.id, percent: counted.percent!, passed: counted.percent! >= first.exam.pass_percent, at: counted.submitted_at ?? counted.started_at } : null,
        last_at: list[list.length - 1].submitted_at ?? list[list.length - 1].started_at,
      };
    });
    rows.sort((a, b) => b.last_at.getTime() - a.last_at.getTime());

    const years = [...new Set(rows.map((r) => r.school_year))].sort((a, b) => b - a);
    const current = schoolYearOf(new Date());
    const selected = year !== undefined && years.includes(year) ? year : years.includes(current) ? current : years[0] ?? current;
    const yearRows = rows.filter((r) => r.school_year === selected);
    // The subjects of the year for the filter, before filtering.
    const subjectMap = new Map<number, string | null>();
    for (const r of yearRows) subjectMap.set(r.subject?.id ?? 0, r.subject?.title ?? null);
    const subjects = [...subjectMap.entries()].map(([id, title]) => ({ id, title }));
    const type = filter.type === "exam" || filter.type === "homework" ? filter.type : undefined;
    const inYear = yearRows.filter((r) => (filter.subject === undefined || (r.subject?.id ?? 0) === filter.subject) && (!type || r.exam.type === type));

    // The year at a glance, over every row that matches (not just the page).
    const counted = inYear.filter((r) => r.counted);
    const summary = {
      exams: inYear.length,
      graded: counted.length,
      passed: counted.filter((r) => r.counted!.passed).length,
      failed: counted.filter((r) => !r.counted!.passed).length,
      attempts: inYear.reduce((n, r) => n + r.attempts.length, 0),
      average: counted.length ? round1(counted.reduce((n, r) => n + r.counted!.percent, 0) / counted.length) : null,
    };

    // The indicator: one group per subject and type, points in date order.
    const groups = new Map<string, { subject: (typeof rows)[number]["subject"]; type: string; points: Point[] }>();
    for (const r of inYear) {
      if (!r.counted) continue;
      const key = `${r.subject?.id ?? 0}:${r.exam.type}`;
      if (!groups.has(key)) groups.set(key, { subject: r.subject, type: r.exam.type, points: [] });
      groups.get(key)!.points.push({ exam_id: r.exam.id, name: r.exam.name, at: r.counted.at, percent: r.counted.percent, pass_percent: r.exam.pass_percent });
    }
    const indicators = [...groups.values()].map((g) => {
      const points = g.points.sort((a, b) => a.at.getTime() - b.at.getTime());
      return {
        subject: g.subject,
        type: g.type,
        count: points.length,
        average: round1(points.reduce((s, p) => s + p.percent, 0) / points.length),
        trend: trendOf(points),
        points,
      };
    });
    indicators.sort((a, b) => (a.subject?.title ?? "￿").localeCompare(b.subject?.title ?? "￿", "ar") || a.type.localeCompare(b.type));

    const page = slicePage(inYear, p);
    return {
      counted_attempt: COUNTED_ATTEMPT, years, year: selected, current_year: current, subjects, summary, indicators,
      rows: page.items, page: page.page, page_size: page.page_size, total: page.total, pages: page.pages,
    };
  }
}

export const studentExamsService = new StudentExamsService();
