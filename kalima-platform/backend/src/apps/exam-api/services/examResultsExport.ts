import { prisma } from "../../../libs/db/prisma";
import { registerExportResource } from "../../store-api/export/export.service";
import type { ExportMapper } from "../../store-api/export/mappers";

// Excel/CSV of an exam's results: one row per attempt with the student, the
// teacher whose link they used, the score and how often they left the page.
// Filters: exam_id (required), teacher_ids ("3,5"; 0 = the admin test link),
// status.

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const cairo = (d: Date | null) =>
  d ? new Date(d).toLocaleString("en-GB", { timeZone: "Africa/Cairo", hour12: false }) : "";

const teacherIdsOf = (raw: unknown): number[] | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;
  return String(raw).split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0);
};

const resultsMapper: ExportMapper = {
  columns: ["student", "serial", "phone", "level", "teacher", "attempt", "score", "total", "percent", "passed", "status", "submitted_at", "auto_submitted", "tab_leaves", "fullscreen_exits", "copy_attempts"],
  headers: ["Student", "Serial", "Phone", "Level", "Teacher", "Attempt", "Score", "Total", "Percent", "Passed", "Status", "Submitted at", "Auto submitted", "Left the page", "Left full screen", "Copy attempts"],
  headersByLocale: {
    ar: ["الطالب", "السيريال", "التليفون", "السنة الدراسية", "المدرس", "المحاولة", "الدرجة", "من", "النسبة %", "ناجح", "الحالة", "وقت التسليم", "سُلّم تلقائيًا", "الخروج من الصفحة", "الخروج من ملء الشاشة", "محاولات النسخ"],
  },
  toRow: (r) => r,
  localizeRow: (row, locale) => {
    if (!locale?.toLowerCase().startsWith("ar")) return row;
    const status: Record<string, string> = { in_progress: "يمتحن الآن", pending: "محتاج تصحيح", done: "تم التصحيح" };
    return {
      ...row,
      passed: row.passed === "" ? "" : row.passed === "yes" ? "نعم" : "لا",
      status: status[String(row.status)] ?? row.status,
      auto_submitted: row.auto_submitted === "yes" ? "نعم" : "",
      teacher: row.teacher === "Admin test link" ? "رابط تجربة الإدارة" : row.teacher,
    };
  },
};

registerExportResource("exam-results", {
  label: "exam-results",
  mapper: resultsMapper,
  fetcher: async (ids, filters) => {
    const examId = Number(filters?.exam_id);
    if (!ids?.length && !Number.isInteger(examId)) return [];
    const teacherIds = teacherIdsOf(filters?.teacher_ids);
    const real = (teacherIds ?? []).filter((t) => t > 0);
    const attempts = await prisma.ex_attempts.findMany({
      where: {
        ...(ids?.length ? { id: { in: ids } } : { exam_id: examId }),
        ...(typeof filters?.status === "string" && ["in_progress", "pending", "done"].includes(filters.status) && { status: filters.status as any }),
        ...(teacherIds && {
          link: { OR: [...(real.length ? [{ teacher_user_id: { in: real } }] : []), ...(teacherIds.includes(0) ? [{ teacher_user_id: null }] : [])] },
        }),
      },
      include: { link: { select: { teacher_user_id: true } }, exam: { select: { pass_percent: true } } },
      orderBy: [{ student_user_id: "asc" }, { attempt_no: "asc" }],
    });
    const userIds = [...new Set([...attempts.map((a) => a.student_user_id), ...attempts.map((a) => a.link.teacher_user_id).filter((x): x is number => x !== null)])];
    const users = await prisma.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, phone: true, students: { select: { sequenced_id: true, levels: { select: { title: true, title_ar: true } } } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return attempts.map((a) => {
      const s = byId.get(a.student_user_id);
      const total = num(a.total);
      const score = a.status === "done" ? num(a.score) : null;
      const percent = score !== null && total ? round2((score / total) * 100) : null;
      return {
        student: s?.name ?? "",
        serial: s?.students?.sequenced_id ?? "",
        phone: s?.phone ?? "",
        level: s?.students?.levels?.title_ar || s?.students?.levels?.title || "",
        teacher: a.link.teacher_user_id ? byId.get(a.link.teacher_user_id)?.name ?? "" : "Admin test link",
        attempt: a.attempt_no,
        score: score ?? "",
        total,
        percent: percent ?? "",
        passed: percent === null ? "" : percent >= a.exam.pass_percent ? "yes" : "no",
        status: a.status,
        submitted_at: cairo(a.submitted_at),
        auto_submitted: a.auto_submitted ? "yes" : "",
        tab_leaves: a.tab_leaves,
        fullscreen_exits: a.fullscreen_exits,
        copy_attempts: a.copy_attempts,
      };
    });
  },
});
