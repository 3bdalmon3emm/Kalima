import { Router } from "express";
import { levelsController } from "../../controllers/levels.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { requireRole } from "../../middleware/requireRole.middleware";
import { role_enum } from "../../generated/prisma/client";
import { makeExportHandler } from "../../export";

const router = Router();
const adminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];
const adminOnlyAuth = [authenticateToken, requireRole([role_enum.Admin])];

// PUBLIC
router.get("/export", ...adminAuth, makeExportHandler("levels"));
router.get("/", levelsController.getAllLevels);
router.get("/stages", levelsController.getAllStages);
router.get("/:id", levelsController.getLevelById);

// ADMIN / SUBADMIN
router.post("/", ...adminAuth, levelsController.createLevel);
router.patch("/:id", ...adminAuth, levelsController.updateLevel);

// ADMIN only
router.delete("/:id", ...adminOnlyAuth, levelsController.deleteLevel);

export default router;
