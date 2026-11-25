import { Router } from "express";
import { paymentMethodController } from "../../controllers/payment-method.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { requireRole } from "../../middleware/requireRole.middleware";
import { uploadSingleImage } from "../../middleware/upload.middleware";
import { role_enum } from "../../generated/prisma/client";
import { makeExportHandler } from "../../export";

const router = Router();

// Managing payment methods: the Admin only.
const adminAuth = [authenticateToken, requireRole([role_enum.Admin])];

router.get("/export", ...adminAuth, makeExportHandler("payment-methods"));

router.get(
  "/",
  authenticateToken,
  paymentMethodController.listPaymentMethods
);

router.get(
  "/:id",
  authenticateToken,
  paymentMethodController.getPaymentMethod
);

router.post(
  "/",
  ...adminAuth,
  uploadSingleImage("image"),
  paymentMethodController.createPaymentMethod
);

router.patch(
  "/:id",
  ...adminAuth,
  uploadSingleImage("image"),
  paymentMethodController.updatePaymentMethod
);

router.delete(
  "/:id",
  ...adminAuth,
  paymentMethodController.deletePaymentMethod
);

export default router;
