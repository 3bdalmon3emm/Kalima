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
// Adding and editing stages and grades is a platform setting.
const managerAuth = [authenticateToken, requireRole([role_enum.Admin, role_enum.SubAdmin])];

// PUBLIC
router.get("/export", ...adminAuth, makeExportHandler("levels"));
router.get("/", levelsController.getAllLevels);
router.get("/stages", levelsController.getAllStages);
router.get("/:id", levelsController.getLevelById);

// ADMIN / SUBADMIN
router.post("/stages", ...managerAuth, levelsController.createStage);
router.patch("/stages/:id", ...managerAuth, levelsController.updateStage);
router.post("/", ...managerAuth, levelsController.createLevel);
router.patch("/:id", ...managerAuth, levelsController.updateLevel);

// ADMIN only
router.delete("/stages/:id", ...adminOnlyAuth, levelsController.deleteStage);
router.delete("/:id", ...adminOnlyAuth, levelsController.deleteLevel);

export default router;
