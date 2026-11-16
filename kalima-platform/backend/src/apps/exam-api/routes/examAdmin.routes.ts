import { Router } from "express";
import { authenticateToken } from "../../../libs/auth/middleware";
import { requireRole } from "../../store-api/middleware/requireRole.middleware";
import { role_enum } from "../../store-api/generated/prisma/client";
import { BadRequestError } from "../../../libs/errors";
import { handle, idList, idParam, optionalId, requiredName, userId } from "../http";
import { examFoldersService } from "../services/examFolders.service";
import { examsService } from "../services/exams.service";
import { soundsService } from "../services/sounds.service";
import { resultsService } from "../services/results.service";
import { uploadSound } from "../services/media.service";
import { parseExamSettings, parseMark, parseRules } from "../services/examInput";

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
  res.json(ok(await examsService.search(String(req.query.q ?? "").trim(), subjectId)));
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

router.put("/exams/:id/test-link", handle(async (req, res) => {
  const link = await examsService.saveTestLink(
    idParam(req), date(req.body?.starts_at, "starts_at"), date(req.body?.ends_at, "ends_at"), userId(req),
  );
  res.json(ok(link, "Test link saved"));
}));

router.delete("/exams/:id/test-link", handle(async (req, res) => {
  await examsService.closeTestLink(idParam(req));
  res.json(ok(undefined, "Test link closed"));
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

router.get("/exams/:id/attempts", handle(async (req, res) => {
  res.json(ok(await resultsService.list(idParam(req), { status: typeof req.query.status === "string" ? req.query.status : undefined })));
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
