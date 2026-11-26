import { Router } from "express";
import { authenticateToken } from "../../../libs/auth/middleware";
import { requireRole } from "../../store-api/middleware/requireRole.middleware";
import { role_enum } from "../../store-api/generated/prisma/client";
import { prisma } from "../../../libs/db/prisma";
import { NotFoundError } from "../../../libs/errors";
import { handle, idParam, userId } from "../http";
import { studentExamsService } from "../services/studentExams.service";
import { attemptsService } from "../services/attempts.service";
import { overviewArgs } from "./overviewArgs";

// A parent following their children's exams, mounted at /api/v2/exam-parent.
// The parent sees what the child sees: the same list, indicator and result
// papers (answers only once they show to the child). Only children linked to
// this parent.

const router = Router();
router.use(authenticateToken, requireRole([role_enum.Parent]));

const ok = (data?: unknown) => ({ success: true, ...(data !== undefined && { data }) });

async function childOf(parentId: number, studentId: number) {
  const link = await prisma.parent_children.findFirst({ where: { parent_user_id: parentId, student_user_id: studentId }, select: { id: true } });
  if (!link) throw new NotFoundError("Child not found");
  return studentId;
}

router.get("/children", handle(async (req, res) => {
  const rows = await prisma.parent_children.findMany({
    where: { parent_user_id: userId(req) },
    orderBy: { id: "asc" },
    select: { students: { select: { user_id: true, sequenced_id: true, users: { select: { name: true, profile_pic_url: true } } } } },
  });
  res.json(ok(rows.map((r) => ({
    id: r.students.user_id,
    name: r.students.users.name,
    serial: r.students.sequenced_id,
    profile_pic_url: r.students.users.profile_pic_url,
  }))));
}));

router.get("/children/:id/exams", handle(async (req, res) => {
  const child = await childOf(userId(req), idParam(req));
  res.json(ok(await studentExamsService.overview(child, ...overviewArgs(req.query))));
}));

router.get("/children/:id/attempts/:attemptId", handle(async (req, res) => {
  const child = await childOf(userId(req), idParam(req));
  const result = await attemptsService.result(idParam(req, "attemptId"), child);
  res.json(ok({ ...result, sound: null }));
}));

export default router;
