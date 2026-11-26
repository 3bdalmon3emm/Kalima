import { Router } from "express";
import { authenticateToken } from "../../../libs/auth/middleware";
import { requireRole } from "../../store-api/middleware/requireRole.middleware";
import { role_enum } from "../../store-api/generated/prisma/client";
import { BadRequestError } from "../../../libs/errors";
import { handle, idList, idParam, optionalId, requiredName, userId } from "../http";
import { examFoldersService } from "../services/examFolders.service";
import { examsService } from "../services/exams.service";
import { soundsService } from "../services/sounds.service";
import { reopenForStudent, resultsService } from "../services/results.service";
import { appealsService, type Decision } from "../services/appeals.service";
import { attemptsService } from "../services/attempts.service";
import { regradeService } from "../services/regrade.service";
import { teacherLinksService } from "../services/teacherLinks.service";
import { qrPng, uniqueFileNames, examUrl } from "../services/examLinkUrl";
import { makeZip } from "../../../libs/zip";
import { prisma } from "../../../libs/db/prisma";
import { makeExportHandler } from "../../store-api/export";
import { exportOptions, multiExportFile } from "../services/resultsExportMulti";
import "../services/examResultsExport";
import { uploadSound } from "../services/media.service";
import { parseExamSettings, parseMark, parseRules } from "../services/examInput";
import { paging, searchTerm } from "../services/paging";
import { studentExamsService } from "../services/studentExams.service";
import { overviewArgs } from "./overviewArgs";

// Building exams, mounted at /api/v2/exam-admin. All staff (Admin, SubAdmin, Moderator).

const router = Router();
router.use(authenticateToken, requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]));

const ok = (data?: unknown, message?: string) => ({ success: true, ...(message && { message }), ...(data !== undefined && { data }) });

const sectionName = (raw: unknown) => {
  if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) return null;
  return requiredName(raw);
};

const date = (raw: unknown, name: string) => {
  const d = new Date(String(raw ?? ""));
  if (!raw || Number.isNaN(d.getTime())) throw new BadRequestError(`${name} is required`);
  return d;
};

// ---------- Folders ----------

router.get("/folders", handle(async (_req, res) => {
  res.json(ok(await examFoldersService.listRoots()));
}));

router.get("/folders/tree", handle(async (_req, res) => {
  res.json(ok(await examFoldersService.tree()));
}));

router.post("/folders", handle(async (req, res) => {
  const folder = await examFoldersService.create(
    optionalId(req.body?.parent_id, "parent_id") ?? null,
    requiredName(req.body?.name),
    userId(req),
  );
  res.status(201).json(ok(folder, "Folder created"));
}));

router.post("/folders/reorder", handle(async (req, res) => {
  await examFoldersService.reorder(optionalId(req.body?.parent_id, "parent_id") ?? null, idList(req.body?.ids));
  res.json(ok(undefined, "Order saved"));
}));

router.get("/folders/:id", handle(async (req, res) => {
  res.json(ok(await examFoldersService.details(idParam(req))));
}));

router.patch("/folders/:id", handle(async (req, res) => {
  res.json(ok(await examFoldersService.rename(idParam(req), requiredName(req.body?.name)), "Folder saved"));
}));

router.post("/folders/:id/archive", handle(async (req, res) => {
  await examFoldersService.archive(idParam(req), userId(req));
  res.json(ok(undefined, "Folder archived"));
}));

router.post("/folders/:id/restore", handle(async (req, res) => {
  await examFoldersService.restore(idParam(req));
  res.json(ok(undefined, "Folder restored"));
}));

router.post("/folders/:id/exams", handle(async (req, res) => {
  const exam = await examsService.create(idParam(req), parseExamSettings(req.body, true), userId(req));
  res.status(201).json(ok(exam, "Exam created"));
}));

router.post("/folders/:id/exams/reorder", handle(async (req, res) => {
  await examsService.reorder(idParam(req), idList(req.body?.ids));
  res.json(ok(undefined, "Order saved"));
}));

router.get("/archive", handle(async (_req, res) => {
  res.json(ok(await examFoldersService.listArchive()));
}));

// ---------- Exams ----------

router.get("/exams", handle(async (req, res) => {
  const subjectId = optionalId(req.query.subject_id, "subject_id") ?? undefined;
  res.json(ok(await examsService.search(searchTerm(req.query.q), subjectId, paging(req.query))));
}));

router.get("/exams/:id", handle(async (req, res) => {
  res.json(ok(await examsService.details(idParam(req))));
}));

router.patch("/exams/:id", handle(async (req, res) => {
  res.json(ok(await examsService.update(idParam(req), parseExamSettings(req.body, false), userId(req)), "Exam saved"));
}));

router.post("/exams/:id/archive", handle(async (req, res) => {
  await examsService.archive(idParam(req), userId(req));
  res.json(ok(undefined, "Exam archived"));
}));

router.post("/exams/:id/restore", handle(async (req, res) => {
  await examsService.restore(idParam(req));
  res.json(ok(undefined, "Exam restored"));
}));

router.post("/exams/:id/publish", handle(async (req, res) => {
  res.json(ok(await examsService.publish(idParam(req), userId(req)), "Exam published"));
}));

router.post("/exams/:id/unpublish", handle(async (req, res) => {
  await examsService.unpublish(idParam(req));
  res.json(ok(undefined, "Exam unpublished"));
}));

router.post("/exams/:id/draw", handle(async (req, res) => {
  res.json(ok(await examsService.draw(idParam(req)), "Questions drawn"));
}));

// Cancelling a question: everyone who has it gets its full mark; restoring
// gives back the marks the answers had.
router.post("/exams/:id/questions/:questionId/cancel", handle(async (req, res) => {
  res.json(ok(await regradeService.cancel(idParam(req), Number(req.params.questionId), userId(req)), "Question cancelled"));
}));

router.delete("/exams/:id/questions/:questionId/cancel", handle(async (req, res) => {
  res.json(ok(await regradeService.restore(idParam(req), Number(req.params.questionId)), "Question restored"));
}));

// The exam as a student sees it, with the right and model answers.
router.get("/exams/:id/preview", handle(async (req, res) => {
  res.json(ok(await attemptsService.preview(idParam(req))));
}));

// ---------- Sections ----------

router.post("/exams/:id/sections", handle(async (req, res) => {
  res.status(201).json(ok(await examsService.addSection(idParam(req), sectionName(req.body?.name)), "Section added"));
}));

router.post("/exams/:id/sections/reorder", handle(async (req, res) => {
  await examsService.reorderSections(idParam(req), idList(req.body?.ids));
  res.json(ok(undefined, "Order saved"));
}));

router.patch("/sections/:id", handle(async (req, res) => {
  res.json(ok(await examsService.renameSection(idParam(req), sectionName(req.body?.name)), "Section saved"));
}));

router.delete("/sections/:id", handle(async (req, res) => {
  await examsService.deleteSection(idParam(req));
  res.json(ok(undefined, "Section deleted"));
}));

router.post("/sections/:id/questions", handle(async (req, res) => {
  res.json(ok(await examsService.addQuestions(idParam(req), idList(req.body?.question_ids, "question_ids")), "Questions added"));
}));

router.post("/sections/:id/questions/reorder", handle(async (req, res) => {
  await examsService.reorderQuestions(idParam(req), idList(req.body?.ids));
  res.json(ok(undefined, "Order saved"));
}));

router.put("/sections/:id/rules", handle(async (req, res) => {
  res.json(ok(await examsService.saveRules(idParam(req), parseRules(req.body?.rules)), "Rules saved"));
}));

// ---------- Exam questions ----------

router.patch("/exam-questions/:id", handle(async (req, res) => {
  res.json(ok(await examsService.setMark(idParam(req), parseMark(req.body?.mark)), "Mark saved"));
}));

router.post("/exams/:id/questions/remove", handle(async (req, res) => {
  await examsService.removeQuestions(idParam(req), idList(req.body?.ids));
  res.json(ok(undefined, "Questions removed"));
}));

// ---------- Results and essay grading ----------

// ?teacher_ids=3,5
const teacherIdsParam = (raw: unknown): number[] | undefined => {
  if (typeof raw !== "string" || raw === "") return undefined;
  return raw.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0);
};

router.get("/exams/:id/attempts", handle(async (req, res) => {
  res.json(ok(await resultsService.list(idParam(req), {
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    teacherIds: teacherIdsParam(req.query.teacher_ids),
    q: searchTerm(req.query.q),
  }, paging(req.query))));
}));

// Excel/CSV of results: ?exam_id=&teacher_ids=&status=&format=xlsx
router.get("/results/export", makeExportHandler("exam-results"));

// Exporting many exams at once: one row per student, a column per attempt.
router.get("/results/export-options", handle(async (_req, res) => {
  res.json(ok(await exportOptions()));
}));

router.post("/results/export-multi", handle(async (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "xlsx";
  const locale = String(req.query.lang ?? "ar").toLowerCase().startsWith("en") ? "en" : "ar";
  const file = await multiExportFile(req.body, format, locale);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
}));

// { extra_attempts, extra_minutes, ends_at } for one student.
// Accept with a mark, or reject with a reason.
export function decisionBody(body: any): Decision {
  if (typeof body?.accept !== "boolean") throw new BadRequestError("accept must be true or false");
  return { accept: body.accept, mark: body.accept ? Number(body.mark) : undefined, reply: typeof body.reply === "string" ? body.reply : "" };
}

// ---------- Appeals (every teacher's link) ----------

router.get("/appeals", handle(async (req, res) => {
  res.json(ok(await appealsService.list(null, { status: String(req.query.status ?? ""), page: Number(req.query.page) })));
}));

router.get("/appeals/:id", handle(async (req, res) => {
  res.json(ok(await appealsService.detail(idParam(req))));
}));

router.post("/appeals/:id/decision", handle(async (req, res) => {
  res.json(ok(await appealsService.decide(req.app.get("io") ?? null, idParam(req), decisionBody(req.body), userId(req)), "Appeal answered"));
}));

export function reopenBody(body: any) {
  const count = (raw: unknown, name: string, max: number) => {
    if (raw === undefined || raw === null || raw === "") return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > max) throw new BadRequestError(`${name} must be 0 to ${max}`);
    return n;
  };
  const endsAt = body?.ends_at === undefined ? undefined : body.ends_at === null || body.ends_at === "" ? null : date(body.ends_at, "ends_at");
  const change = { extraAttempts: count(body?.extra_attempts, "extra_attempts", 10), extraMinutes: count(body?.extra_minutes, "extra_minutes", 600), endsAt };
  if (!change.extraAttempts && !change.extraMinutes && endsAt === undefined) throw new BadRequestError("Nothing to reopen");
  return change;
}

// Reopening an exam for the student of this attempt: extra attempts, extra
// minutes, or a later end date.
router.post("/attempts/:id/reopen", handle(async (req, res) => {
  const attempt = await prisma.ex_attempts.findUnique({ where: { id: idParam(req) }, select: { link_id: true, student_user_id: true } });
  if (!attempt) throw new BadRequestError("Attempt not found");
  res.json(ok(await reopenForStudent(attempt.link_id, attempt.student_user_id, reopenBody(req.body), userId(req)), "Reopened for this student"));
}));

router.get("/attempts/:id", handle(async (req, res) => {
  res.json(ok(await resultsService.detail(idParam(req))));
}));

// Essay marks go in halves: 0, 0.5, 1, 1.5...
router.put("/attempts/:id/grades", handle(async (req, res) => {
  const raw = req.body?.grades;
  if (!Array.isArray(raw) || !raw.length) throw new BadRequestError("grades must be a non-empty list");
  const grades = raw.map((g: any) => {
    const questionId = Number(g?.question_id);
    const mark = Number(g?.mark);
    if (!Number.isInteger(questionId) || questionId <= 0) throw new BadRequestError("Invalid question_id");
    if (!Number.isFinite(mark) || !Number.isInteger(mark * 2)) throw new BadRequestError("Marks go in halves");
    return { question_id: questionId, mark };
  });
  res.json(ok(await resultsService.grade(idParam(req), grades, userId(req)), "Marks saved"));
}));

// ---------- Teachers and their links ----------

const datePair = (body: any) => ({ startsAt: date(body?.starts_at, "starts_at"), endsAt: date(body?.ends_at, "ends_at") });

router.get("/teachers/search", handle(async (req, res) => {
  res.json(ok(await teacherLinksService.searchTeachers(searchTerm(req.query.q), paging(req.query))));
}));

router.get("/folders/:id/teachers", handle(async (req, res) => {
  res.json(ok(await teacherLinksService.folderTeachers(idParam(req), searchTerm(req.query.q), paging(req.query))));
}));

router.post("/folders/:id/teachers", handle(async (req, res) => {
  const { startsAt, endsAt } = datePair(req.body);
  const teacherId = optionalId(req.body?.teacher_id, "teacher_id");
  if (!teacherId) throw new BadRequestError("teacher_id is required");
  res.status(201).json(ok(await teacherLinksService.assign({ folderId: idParam(req) }, teacherId, startsAt, endsAt, userId(req)), "Teacher added"));
}));

router.get("/exams/:id/teachers", handle(async (req, res) => {
  res.json(ok(await teacherLinksService.examTeachers(idParam(req), searchTerm(req.query.q), paging(req.query))));
}));

// The exam's teachers by name only, for the results filter.
router.get("/exams/:id/teacher-options", handle(async (req, res) => {
  res.json(ok(await teacherLinksService.examTeacherOptions(idParam(req), searchTerm(req.query.q), paging(req.query))));
}));

// One student's exams for the admin: every attempt, the year's summary and
// the performance indicator, as the student sees them.
router.get("/students/:id/exams", handle(async (req, res) => {
  res.json(ok(await studentExamsService.overview(idParam(req), ...overviewArgs(req.query))));
}));

router.post("/exams/:id/teachers", handle(async (req, res) => {
  const { startsAt, endsAt } = datePair(req.body);
  const teacherId = optionalId(req.body?.teacher_id, "teacher_id");
  if (!teacherId) throw new BadRequestError("teacher_id is required");
  res.status(201).json(ok(await teacherLinksService.assign({ examId: idParam(req) }, teacherId, startsAt, endsAt, userId(req)), "Teacher added"));
}));

router.patch("/teacher-assignments/:id", handle(async (req, res) => {
  const { startsAt, endsAt } = datePair(req.body);
  res.json(ok(await teacherLinksService.setAssignmentDates(idParam(req), startsAt, endsAt), "Dates saved"));
}));

router.delete("/teacher-assignments/:id", handle(async (req, res) => {
  await teacherLinksService.remove(idParam(req));
  res.json(ok(undefined, "Teacher removed"));
}));

// One teacher link: { closed: true|false } or dates { starts_at, ends_at }
// or { reset_dates: true } to follow the folder/exam dates again.
router.patch("/links/:id", handle(async (req, res) => {
  const id = idParam(req);
  if (typeof req.body?.closed === "boolean") {
    res.json(ok(await teacherLinksService.setLinkClosed(id, req.body.closed), req.body.closed ? "Link closed" : "Link opened"));
    return;
  }
  const dates = req.body?.reset_dates === true ? null : datePair(req.body);
  res.json(ok(await teacherLinksService.setLinkDates(id, dates), "Dates saved"));
}));

// Every QR of a teacher's exams in a folder, one PNG per exam, in a ZIP.
router.get("/folders/:id/teachers/:teacherId/qr.zip", handle(async (req, res) => {
  const links = await teacherLinksService.folderLinksOf(idParam(req), idParam(req, "teacherId"));
  if (!links.length) throw new BadRequestError("This teacher has no exams in this folder");
  const names = uniqueFileNames(links.map((l) => l.exam.name), "png");
  const files = await Promise.all(links.map(async (l, i) => ({ name: names[i], data: await qrPng(l.code) })));
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="qr-codes.zip"`);
  res.send(makeZip(files));
}));

// One link's QR as a PNG.
router.get("/links/:id/qr.png", handle(async (req, res) => {
  const link = await prisma.ex_links.findUnique({ where: { id: idParam(req) }, select: { code: true } });
  if (!link) throw new BadRequestError("Link not found");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("X-Exam-Url", examUrl(link.code));
  res.send(await qrPng(link.code));
}));

// ---------- Assistants and the teachers they work for ----------

const assertRole = async (id: number, role: "Assistant" | "Teacher") => {
  const user = await prisma.users.findFirst({ where: { id, user_roles: { some: { role } } }, select: { id: true } });
  if (!user) throw new BadRequestError(role === "Assistant" ? "This account is not an assistant" : "This account is not a teacher");
};

router.get("/assistants/:id/teachers", handle(async (req, res) => {
  res.json(ok(await teacherLinksService.assistantTeachers(idParam(req), paging(req.query))));
}));

router.post("/assistants/:id/teachers", handle(async (req, res) => {
  const assistantId = idParam(req);
  const teacherId = optionalId(req.body?.teacher_id, "teacher_id");
  if (!teacherId) throw new BadRequestError("teacher_id is required");
  await assertRole(assistantId, "Assistant");
  await assertRole(teacherId, "Teacher");
  await prisma.teacher_assistants.upsert({
    where: { teacher_user_id_assistant_user_id: { teacher_user_id: teacherId, assistant_user_id: assistantId } },
    create: { teacher_user_id: teacherId, assistant_user_id: assistantId, created_by: userId(req) },
    update: {},
  });
  res.status(201).json(ok(undefined, "Teacher linked"));
}));

router.delete("/assistants/:id/teachers/:teacherId", handle(async (req, res) => {
  await prisma.teacher_assistants.deleteMany({ where: { assistant_user_id: idParam(req), teacher_user_id: idParam(req, "teacherId") } });
  res.json(ok(undefined, "Teacher unlinked"));
}));

// ---------- Celebration sounds ----------

router.get("/sounds", handle(async (_req, res) => {
  res.json(ok(await soundsService.list()));
}));

router.post("/sounds", uploadSound, handle(async (req, res) => {
  res.status(201).json(ok(await soundsService.add(String(req.body?.band ?? ""), req.file, userId(req)), "Sound added"));
}));

router.delete("/sounds/:id", handle(async (req, res) => {
  await soundsService.remove(idParam(req));
  res.json(ok(undefined, "Sound removed"));
}));

export default router;
