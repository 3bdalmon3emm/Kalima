import { NextFunction, Request, Response, Router } from "express";
import { authenticateToken } from "../../../libs/auth/middleware";
import { requireRole } from "../../store-api/middleware/requireRole.middleware";
import { role_enum } from "../../store-api/generated/prisma/client";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { handle, idParam, userId } from "../http";
import { teacherPortalService } from "../services/teacherPortal.service";
import { reopenForStudent, resultsService } from "../services/results.service";
import { qrPng, examUrl } from "../services/examLinkUrl";
import { makeExportHandler } from "../../store-api/export";
import { decisionBody, reopenBody } from "./examAdmin.routes";
import "../services/examResultsExport";
import { appealsService } from "../services/appeals.service";
import { attemptsService } from "../services/attempts.service";

// The teacher's (and assistant's) side of exams, mounted at
// /api/v2/exam-teacher. Every request is limited to the links of the
// teachers this account works for; anything else reads as not found.

const router = Router();
router.use(authenticateToken, requireRole([role_enum.Teacher, role_enum.Assistant]));

const ok = (data?: unknown, message?: string) => ({ success: true, ...(message && { message }), ...(data !== undefined && { data }) });

const teachersOf = (req: Request) => teacherPortalService.teacherIdsFor(userId(req), (req as any).user?.roles ?? []);

router.get("/exams", handle(async (req, res) => {
  res.json(ok(await teacherPortalService.myExams(await teachersOf(req))));
}));

router.get("/exams/:id", handle(async (req, res) => {
  res.json(ok(await teacherPortalService.exam(idParam(req), await teachersOf(req))));
}));

// The exam as a student sees it, with the right and model answers; nothing
// goes through the teacher's link.
router.get("/exams/:id/preview", handle(async (req, res) => {
  await teacherPortalService.linksTo(idParam(req), await teachersOf(req));
  res.json(ok(await attemptsService.preview(idParam(req))));
}));

router.get("/attempts/:id", handle(async (req, res) => {
  await teacherPortalService.assertAttempt(idParam(req), await teachersOf(req));
  res.json(ok(await resultsService.detail(idParam(req))));
}));

// Essay marks in halves.
router.put("/attempts/:id/grades", handle(async (req, res) => {
  await teacherPortalService.assertAttempt(idParam(req), await teachersOf(req));
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

router.post("/attempts/:id/reopen", handle(async (req, res) => {
  const attempt = await teacherPortalService.assertAttempt(idParam(req), await teachersOf(req));
  res.json(ok(await reopenForStudent(attempt.link_id, attempt.student_user_id, reopenBody(req.body), userId(req)), "Reopened for this student"));
}));

router.get("/links/:id/qr.png", handle(async (req, res) => {
  const link = await teacherPortalService.assertLink(idParam(req), await teachersOf(req));
  res.setHeader("Content-Type", "image/png");
  res.setHeader("X-Exam-Url", examUrl(link.code));
  res.send(await qrPng(link.code));
}));

// Results of one exam (?exam_id=) for this account's own links only.
const exportResults = makeExportHandler("exam-results");
router.get("/results/export", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const examId = Number(req.query.exam_id);
    if (!Number.isInteger(examId) || examId <= 0) throw new BadRequestError("exam_id is required");
    const links = await teacherPortalService.linksTo(examId, await teachersOf(req));
    const own = [...new Set(links.map((l) => l.teacher_user_id))].join(",");
    (req as any).query = { ...req.query, ids: undefined, teacher_ids: own };
    return exportResults(req, res, next);
  } catch (err) {
    next(err);
  }
});

// ---------- Appeals ----------

router.get("/appeals", handle(async (req, res) => {
  const links = await teacherPortalService.linkIdsOf(await teachersOf(req));
  res.json(ok(await appealsService.list(links, { status: String(req.query.status ?? ""), page: Number(req.query.page) })));
}));

const ownAppeal = async (req: Request) => {
  const linkId = await appealsService.linkOf(idParam(req));
  if (!(await teacherPortalService.linkIdsOf(await teachersOf(req))).includes(linkId)) throw new NotFoundError("Appeal not found");
};

router.get("/appeals/:id", handle(async (req, res) => {
  await ownAppeal(req);
  res.json(ok(await appealsService.detail(idParam(req))));
}));

router.post("/appeals/:id/decision", handle(async (req, res) => {
  await ownAppeal(req);
  res.json(ok(await appealsService.decide(req.app.get("io") ?? null, idParam(req), decisionBody(req.body), userId(req)), "Appeal answered"));
}));

export default router;
