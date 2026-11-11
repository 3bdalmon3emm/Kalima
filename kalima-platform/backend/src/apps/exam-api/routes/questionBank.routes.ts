import { Router } from "express";
import { authenticateToken } from "../../../libs/auth/middleware";
import { requireRole } from "../../store-api/middleware/requireRole.middleware";
import { role_enum } from "../../store-api/generated/prisma/client";
import { BadRequestError } from "../../../libs/errors";
import { handle, idList, idParam, optionalId, requiredName, userId } from "../http";
import { foldersService } from "../services/folders.service";
import { categoriesService } from "../services/categories.service";
import { questionsService } from "../services/questions.service";
import { bankCopyService } from "../services/bankCopy.service";
import { mediaService, uploadQuestionMedia } from "../services/media.service";
import { parseQuestionInput } from "../services/questionInput";

// Question bank API, mounted at /api/v2/question-bank. Admin and SubAdmin
// have full control; nobody else reaches the bank.

const router = Router();
router.use(authenticateToken, requireRole([role_enum.Admin, role_enum.SubAdmin]));

const ok = (data?: unknown, message?: string) => ({ success: true, ...(message && { message }), ...(data !== undefined && { data }) });

// ---------- Banks and folders ----------

router.get("/banks", handle(async (req, res) => {
  res.json(ok(await foldersService.listBanks(req.query.archived === "true")));
}));

router.post("/banks", handle(async (req, res) => {
  const bank = await foldersService.createBank(
    requiredName(req.body?.name),
    optionalId(req.body?.subject_id, "subject_id") ?? null,
    userId(req),
  );
  res.status(201).json(ok(bank, "Bank created"));
}));

router.get("/banks/:id/tree", handle(async (req, res) => {
  res.json(ok(await foldersService.getBankTree(idParam(req))));
}));

router.post("/banks/:id/copy", handle(async (req, res) => {
  const result = await bankCopyService.copyBank(idParam(req), requiredName(req.body?.name), userId(req));
  res.status(202).json(ok(result, "Bank copy started"));
}));

router.post("/banks/reorder", handle(async (req, res) => {
  await foldersService.reorder(null, idList(req.body?.ids));
  res.json(ok(undefined, "Order saved"));
}));

router.post("/folders", handle(async (req, res) => {
  const parentId = optionalId(req.body?.parent_id, "parent_id");
  if (!parentId) throw new BadRequestError("parent_id is required");
  const folder = await foldersService.createFolder(parentId, requiredName(req.body?.name), userId(req));
  res.status(201).json(ok(folder, "Folder created"));
}));

router.post("/folders/reorder", handle(async (req, res) => {
  const parentId = optionalId(req.body?.parent_id, "parent_id");
  if (!parentId) throw new BadRequestError("parent_id is required");
  await foldersService.reorder(parentId, idList(req.body?.ids));
  res.json(ok(undefined, "Order saved"));
}));

router.get("/folders/:id", handle(async (req, res) => {
  res.json(ok(await foldersService.getFolderDetails(idParam(req))));
}));

router.patch("/folders/:id", handle(async (req, res) => {
  const body = req.body ?? {};
  const levelIds = body.level_ids === undefined ? undefined : body.level_ids === null ? [] : body.level_ids;
  if (levelIds !== undefined && (!Array.isArray(levelIds) || levelIds.some((n: unknown) => !Number.isInteger(Number(n))))) {
    throw new BadRequestError("Invalid level_ids");
  }
  const folder = await foldersService.updateFolder(idParam(req), {
    name: body.name === undefined ? undefined : requiredName(body.name),
    subject_id: optionalId(body.subject_id, "subject_id"),
    level_ids: levelIds?.map(Number),
  });
  res.json(ok(folder, "Folder saved"));
}));

router.post("/folders/:id/archive", handle(async (req, res) => {
  await foldersService.archive(idParam(req), userId(req));
  res.json(ok(undefined, "Archived"));
}));

router.post("/folders/:id/restore", handle(async (req, res) => {
  await foldersService.restore(idParam(req));
  res.json(ok(undefined, "Restored"));
}));

// ---------- Categories ----------

router.get("/banks/:id/categories", handle(async (req, res) => {
  res.json(ok(await categoriesService.list(idParam(req))));
}));

router.post("/banks/:id/categories", handle(async (req, res) => {
  const category = await categoriesService.create(
    idParam(req),
    requiredName(req.body?.name),
    optionalId(req.body?.parent_id, "parent_id") ?? null,
  );
  res.status(201).json(ok(category, "Category created"));
}));

router.patch("/categories/:id", handle(async (req, res) => {
  res.json(ok(await categoriesService.rename(idParam(req), requiredName(req.body?.name)), "Category saved"));
}));

router.delete("/categories/:id", handle(async (req, res) => {
  await categoriesService.remove(idParam(req));
  res.json(ok(undefined, "Category deleted"));
}));

// ---------- Media ----------

router.post("/media", uploadQuestionMedia, handle(async (req, res) => {
  const bankId = optionalId(req.body?.bank_id, "bank_id");
  if (!bankId) throw new BadRequestError("bank_id is required");
  res.status(201).json(ok(await mediaService.upload(req.file, bankId, userId(req))));
}));

// ---------- Questions ----------

router.get("/folders/:id/questions", handle(async (req, res) => {
  const q = req.query;
  // category_id=none lists the questions without a category.
  const uncategorized = q.category_id === "none";
  res.json(ok(await questionsService.listFolder(idParam(req), {
    uncategorized,
    category_id: uncategorized ? undefined : optionalId(q.category_id, "category_id") ?? undefined,
    subcategory_id: optionalId(q.subcategory_id, "subcategory_id") ?? undefined,
    reference_no: typeof q.reference_no === "string" && q.reference_no.trim() ? q.reference_no.trim() : undefined,
  })));
}));

router.post("/folders/:id/questions", handle(async (req, res) => {
  const question = await questionsService.create(
    idParam(req),
    optionalId(req.body?.passage_id, "passage_id") ?? null,
    parseQuestionInput(req.body),
    userId(req),
  );
  res.status(201).json(ok(question, "Question saved"));
}));

router.post("/questions/reorder", handle(async (req, res) => {
  const folderId = optionalId(req.body?.folder_id, "folder_id");
  if (!folderId) throw new BadRequestError("folder_id is required");
  await questionsService.reorder(folderId, optionalId(req.body?.passage_id, "passage_id") ?? null, idList(req.body?.ids));
  res.json(ok(undefined, "Order saved"));
}));

router.post("/questions/copy", handle(async (req, res) => {
  const folderId = optionalId(req.body?.folder_id, "folder_id");
  if (!folderId) throw new BadRequestError("folder_id is required");
  res.status(201).json(ok(await questionsService.copy(idList(req.body?.ids), folderId, userId(req)), "Questions copied"));
}));

router.post("/questions/archive", handle(async (req, res) => {
  await questionsService.archive(idList(req.body?.ids), userId(req));
  res.json(ok(undefined, "Archived"));
}));

router.post("/questions/restore", handle(async (req, res) => {
  await questionsService.restore(idList(req.body?.ids));
  res.json(ok(undefined, "Restored"));
}));

router.get("/questions/serial/:serial", handle(async (req, res) => {
  res.json(ok(await questionsService.findBySerial(String(req.params.serial))));
}));

router.get("/questions/:id", handle(async (req, res) => {
  res.json(ok(await questionsService.getOne(idParam(req))));
}));

router.put("/questions/:id", handle(async (req, res) => {
  res.json(ok(await questionsService.update(idParam(req), parseQuestionInput(req.body), userId(req)), "Question saved"));
}));

router.post("/questions/:id/duplicate", handle(async (req, res) => {
  res.status(201).json(ok(await questionsService.duplicate(idParam(req), userId(req)), "Question duplicated"));
}));

// ---------- Archive page ----------

router.get("/archive", handle(async (_req, res) => {
  res.json(ok(await questionsService.listArchive()));
}));

export default router;
