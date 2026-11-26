import { employeePerformanceAuth } from "../../middleware/employeePerformanceAuth";
import { Router } from "express";
import { purchaseController } from "../../controllers/purchase.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { requireRole } from "../../middleware/requireRole.middleware";
import { role_enum } from "../../generated/prisma/client";
import { uploadFastBuy } from "../../middleware/upload.middleware";
import { makeExportHandler } from "../../export";

const router = Router();

const adminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];

// ============================================
// AUTHENTICATED — teacher reads own purchases
// ============================================

router.get("/my", authenticateToken, purchaseController.getMyPurchases);

// ============================================
// ADMIN / SUBADMIN — purchase management
// ============================================

router.get("/export", ...adminAuth, makeExportHandler("purchases"));
router.get(
  "/confirmed-count",
  ...employeePerformanceAuth,
  purchaseController.getConfirmedCount,
);
router.get(
  "/confirmed-items/:employeeId",
  ...employeePerformanceAuth,
  purchaseController.getConfirmedEmployeeProducts,
);
router.get("/", ...adminAuth, purchaseController.getAll);
// Deleted orders: Admin only.
router.get("/deleted", authenticateToken, requireRole([role_enum.Admin]), purchaseController.listDeleted);
router.get("/:id", ...adminAuth, purchaseController.getById);

router.patch("/:id/receive", ...adminAuth, purchaseController.receive);
router.patch("/:id/confirm", ...adminAuth, purchaseController.confirm);
router.patch("/:id/deliver", ...adminAuth, purchaseController.deliver);
router.patch("/:id/return", ...adminAuth, purchaseController.returnPurchase);
router.patch("/:id/admin-note", ...adminAuth, purchaseController.addAdminNote);

router.delete("/:id", ...adminAuth, purchaseController.deletePurchase);
router.delete(
  "/:id/items/:itemId",
  ...adminAuth,
  purchaseController.deleteItem,
);

export default router;
