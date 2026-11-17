import { Router, Request } from "express";
import { authenticateToken } from "../../../libs/auth/middleware";
import { requireRole } from "../../store-api/middleware/requireRole.middleware";
import { role_enum } from "../../store-api/generated/prisma/client";
import { handle, idParam, userId } from "../http";
import { attemptsService } from "../services/attempts.service";
import { uploadAnswerPhoto, uploadAppealPhotos } from "../services/media.service";
import { appealsService } from "../services/appeals.service";

// Taking exams, mounted at /api/v2/exams. Students reach an exam by its link
// code; Admin and SubAdmin may take it too, to try the test link. The tab or
// device that opened the attempt last sends its token in X-Attempt-Token.

const router = Router();
router.use(authenticateToken, requireRole([role_enum.Student, role_enum.Admin, role_enum.SubAdmin]));

const ok = (data?: unknown, message?: string) => ({ success: true, ...(message && { message }), ...(data !== undefined && { data }) });
const token = (req: Request) => {
  const value = req.header("x-attempt-token");
  return value ? value.trim() : null;
};

router.get("/links/:code", handle(async (req, res) => {
  res.json(ok(await attemptsService.linkInfo(String(req.params.code), userId(req))));
}));

router.post("/links/:code/start", handle(async (req, res) => {
  res.json(ok(await attemptsService.start(String(req.params.code), userId(req))));
}));

router.get("/attempts/:id", handle(async (req, res) => {
  res.json(ok(await attemptsService.resume(idParam(req), userId(req), token(req) ?? undefined)));
}));

router.put("/attempts/:id/answers", handle(async (req, res) => {
  res.json(ok(await attemptsService.saveAnswers(idParam(req), userId(req), token(req), req.body?.answers)));
}));

router.post("/attempts/:id/events", handle(async (req, res) => {
  await attemptsService.recordEvent(idParam(req), userId(req), token(req), req.body?.type);
  res.json(ok());
}));

router.post("/attempts/:id/files", uploadAnswerPhoto, handle(async (req, res) => {
  res.status(201).json(ok(await attemptsService.addFile(idParam(req), userId(req), token(req), req.file)));
}));

router.post("/attempts/:id/submit", handle(async (req, res) => {
  res.json(ok(await attemptsService.submit(idParam(req), userId(req), token(req), false, req.body?.answers), "Exam submitted"));
}));

router.get("/attempts/:id/result", handle(async (req, res) => {
  res.json(ok(await attemptsService.result(idParam(req), userId(req))));
}));

// An appeal on one question: question_id, text and up to three photos.
router.post("/attempts/:id/appeals", uploadAppealPhotos, handle(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.status(201).json(ok(await appealsService.create(req.app.get("io") ?? null, idParam(req), userId(req), req.body ?? {}, files), "Appeal sent"));
}));

export default router;
