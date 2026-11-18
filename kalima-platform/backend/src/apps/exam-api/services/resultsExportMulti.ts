import { prisma } from "../../../libs/db/prisma";
import { BadRequestError } from "../../../libs/errors";
import { toCSV } from "../../../libs/export/csv-export";
import { toExcel } from "../../../libs/export/excel-export";

// The admin's export across many exams (and teachers): one row per student,
// the student fields the admin picked, then for every exam one column per
// attempt (and its percent if picked). A student who took an exam fewer
// times leaves the later attempt columns empty.

export const STUDENT_FIELDS = ["serial", "phone", "parent_phone", "email", "level", "teacher"] as const;
export const ATTEMPT_FIELDS = ["score", "percent"] as const;
type StudentField = (typeof STUDENT_FIELDS)[number];
type AttemptField = (typeof ATTEMPT_FIELDS)[number];

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

const LABELS = {
  ar: {
    student: "الطالب", serial: "السيريال", phone: "التليفون", parent_phone: "تليفون ولي الأمر", email: "الإيميل", level: "السنة الدراسية", teacher: "المدرس",
    attempt: (n: number) => `محاولة ${n}`, percent: "%", pending: "محتاج تصحيح", running: "بيمتحن",
  },
  en: {
    student: "Student", serial: "Serial", phone: "Phone", parent_phone: "Parent phone", email: "Email", level: "Level", teacher: "Teacher",
    attempt: (n: number) => `attempt ${n}`, percent: "%", pending: "Waiting for marks", running: "In progress",
  },
};

// Exams that have attempts, and the teachers whose links were used, to pick
// from.
export async function exportOptions() {
  const exams = await prisma.ex_exams.findMany({
    where: { attempts: { some: {} } },
    orderBy: [{ folder: { name: "asc" } }, { sort_order: "asc" }, { id: "asc" }],
    select: { id: true, name: true, serial: true, type: true, archived_at: true, folder: { select: { name: true } }, _count: { select: { attempts: true } } },
  });
  const links = await prisma.ex_links.findMany({
    where: { teacher_user_id: { not: null }, attempts: { some: {} } },
    distinct: ["teacher_user_id"],
    select: { teacher_user_id: true },
  });
  const teachers = await prisma.users.findMany({
    where: { id: { in: links.map((l) => l.teacher_user_id!) } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return {
    exams: exams.map((e) => ({ id: e.id, name: e.name, serial: e.serial, type: e.type, archived: !!e.archived_at, folder: e.folder.name, attempts: e._count.attempts })),
    teachers,
    student_fields: STUDENT_FIELDS,
    attempt_fields: ATTEMPT_FIELDS,
  };
}

const pick = <T extends string>(raw: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(raw) ? allowed.filter((f) => raw.includes(f)) : [];
const ids = (raw: unknown) => (Array.isArray(raw) ? [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : []);

export async function buildMultiExport(body: any, locale: "ar" | "en") {
  const examIds = ids(body?.exam_ids);
  if (!examIds.length) throw new BadRequestError("Pick at least one exam");
  if (examIds.length > 200) throw new BadRequestError("Pick at most 200 exams");
  const teacherIds = ids(body?.teacher_ids);
  const studentFields = pick<StudentField>(body?.student_fields, STUDENT_FIELDS);
  let attemptFields = pick<AttemptField>(body?.attempt_fields, ATTEMPT_FIELDS);
  if (!attemptFields.length) attemptFields = ["score"];
  const L = LABELS[locale];

  const exams = await prisma.ex_exams.findMany({ where: { id: { in: examIds } }, select: { id: true, name: true, serial: true } });
  const examOrder = examIds.map((id) => exams.find((e) => e.id === id)).filter((e): e is (typeof exams)[number] => !!e);
  const attempts = await prisma.ex_attempts.findMany({
    where: { exam_id: { in: examIds }, ...(teacherIds.length && { link: { teacher_user_id: { in: teacherIds } } }) },
    orderBy: [{ started_at: "asc" }, { id: "asc" }],
    select: { exam_id: true, student_user_id: true, status: true, score: true, total: true, link: { select: { teacher_user_id: true } } },
  });

  const userIds = [...new Set([...attempts.map((a) => a.student_user_id), ...attempts.map((a) => a.link.teacher_user_id).filter((x): x is number => !!x)])];
  const users = new Map((await prisma.users.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, phone: true, email: true, students: { select: { sequenced_id: true, parent_phone_number: true, levels: { select: { title: true, title_ar: true } } } } },
  })).map((u) => [u.id, u]));

  // Per student, per exam: the attempts in the order taken (across teachers).
  const byStudent = new Map<number, Map<number, typeof attempts>>();
  const maxAttempts = new Map<number, number>();
  for (const a of attempts) {
    if (!byStudent.has(a.student_user_id)) byStudent.set(a.student_user_id, new Map());
    const perExam = byStudent.get(a.student_user_id)!;
    perExam.set(a.exam_id, [...(perExam.get(a.exam_id) ?? []), a]);
    maxAttempts.set(a.exam_id, Math.max(maxAttempts.get(a.exam_id) ?? 0, perExam.get(a.exam_id)!.length));
  }

  const columns = ["student", ...studentFields];
  const headers = [L.student, ...studentFields.map((f) => L[f])];
  // Column titles must differ (the sheet keys by them): exams sharing a name
  // get their serial, or their id, after it.
  const nameCount = new Map<string, number>();
  for (const e of examOrder) nameCount.set(e.name, (nameCount.get(e.name) ?? 0) + 1);
  for (const e of examOrder) {
    const name = (nameCount.get(e.name) ?? 0) > 1 ? `${e.name} (${e.serial || `#${e.id}`})` : e.name;
    const n = maxAttempts.get(e.id) ?? 0;
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const title = n > 1 ? `${name} - ${L.attempt(i)}` : name;
      for (const f of attemptFields) {
        columns.push(`e${e.id}_${i}_${f}`);
        headers.push(f === "percent" ? `${title} ${L.percent}` : title);
      }
    }
  }

  const rows = [...byStudent.entries()].map(([studentId, perExam]) => {
    const u = users.get(studentId);
    const teachers = new Set<string>();
    const row: Record<string, unknown> = {
      student: u?.name ?? "",
      serial: u?.students?.sequenced_id ?? "",
      phone: u?.phone ?? "",
      parent_phone: u?.students?.parent_phone_number ?? "",
      email: u?.email ?? "",
      level: (locale === "ar" ? u?.students?.levels?.title_ar : null) || u?.students?.levels?.title || "",
    };
    for (const [examId, list] of perExam) {
      list.forEach((a, i) => {
        if (a.link.teacher_user_id) teachers.add(users.get(a.link.teacher_user_id)?.name ?? "");
        const total = num(a.total);
        const done = a.status === "done";
        const state = a.status === "pending" ? L.pending : L.running;
        row[`e${examId}_${i + 1}_score`] = done ? num(a.score) : state;
        row[`e${examId}_${i + 1}_percent`] = done ? (total ? round2((num(a.score) / total) * 100) : 0) : "";
      });
    }
    row.teacher = [...teachers].filter(Boolean).join("، ");
    return row;
  });
  rows.sort((a, b) => String(a.student).localeCompare(String(b.student), "ar"));
  return { columns, headers, rows };
}

export async function multiExportFile(body: any, format: "xlsx" | "csv", locale: "ar" | "en") {
  const { columns, headers, rows } = await buildMultiExport(body, locale);
  const day = new Date().toISOString().split("T")[0];
  if (format === "csv") {
    return { buffer: toCSV(rows, { columns, headers }), contentType: "text/csv; charset=utf-8", filename: `exam-results-${day}.csv` };
  }
  return {
    buffer: toExcel(rows, { sheetName: "results", columns, headers, rtl: locale === "ar" }),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `exam-results-${day}.xlsx`,
  };
}
