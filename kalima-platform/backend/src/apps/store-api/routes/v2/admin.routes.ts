import { Router } from "express";
import { adminController } from "../../controllers/admin.controller";
import { adminUserStatsController } from "../../controllers/admin-user-stats.controller";
import { appreciationController } from "../../controllers/appreciation.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { requireRole } from "../../middleware/requireRole.middleware";
import { role_enum } from "../../generated/prisma/client";
import { makeExportHandler } from "../../export";
import { usersExportFile, usersExportOptions } from "../../export/users-custom-export";
import { impersonationLogService } from "../../services/impersonation-log.service";

const router = Router();

// All admin routes require authentication + Admin or SubAdmin role
const adminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];

const adminModeratorAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];

const adminOnlyAuth = [authenticateToken, requireRole([role_enum.Admin])];

const adminSubAdminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin]),
];

const whatsappDisconnectAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin]),
];

// ============================================
// USER MANAGEMENT
// ============================================

// ============================================
// ACCOUNT REVIEW
// ============================================

router.get("/account-review-settings", ...adminAuth, adminController.getAccountReviewSettings);
router.put("/account-review-settings", ...adminAuth, adminController.upsertAccountReviewSettings);

// Create user (respects privilege matrix)
router.post("/users", ...adminAuth, adminController.createUser);

// Create specific user types
router.post("/teachers", ...adminAuth, adminController.createTeacher);
router.post("/students", ...adminAuth, adminController.createStudent);
router.post("/parents", ...adminAuth, adminController.createParent);
router.post("/lecturers", ...adminAuth, adminController.createLecturer);

// Export users
router.get("/users/export", ...adminAuth, makeExportHandler("users"));

// Export users with the admin's choice of account types and columns.
router.get("/users/export-options", ...adminAuth, async (_req, res, next) => {
  try {
    res.json({ success: true, data: await usersExportOptions() });
  } catch (err) {
    next(err);
  }
});
router.post("/users/export-custom", ...adminAuth, async (req, res, next) => {
  try {
    const format = req.query.format === "csv" ? "csv" : "xlsx";
    const locale = String(req.query.lang ?? "ar").toLowerCase().startsWith("en") ? "en" : "ar";
    const file = await usersExportFile(req.body, format, locale);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});

// List / search users
router.get("/users", ...adminModeratorAuth, adminController.listUsers);

// Created Accounts Statistics
router.get(
  "/users/stats/created-accounts",
  ...adminAuth,
  adminUserStatsController.getCreatedAccountsStats,
);

// Get single user with all roles
router.get("/users/:userId", ...adminModeratorAuth, adminController.getUser);
router.get(
  "/users/:userId/appreciation-page",
  ...adminModeratorAuth,
  appreciationController.getAdminPage,
);
router.post(
  "/users/:userId/appreciation-page",
  ...adminModeratorAuth,
  appreciationController.createAdminPage,
);
router.patch(
  "/users/:userId/appreciation-page/comments/:commentId",
  ...adminModeratorAuth,
  appreciationController.updateComment,
);
router.delete(
  "/users/:userId/appreciation-page/comments/:commentId",
  ...adminModeratorAuth,
  appreciationController.deleteComment,
);
router.patch(
  "/users/:userId/flag",
  ...adminModeratorAuth,
  adminController.updateUserFlag,
);
router.patch(
  "/users/:userId/profile",
  ...adminModeratorAuth,
  adminController.updateUserProfile,
);
router.patch(
  "/users/:userId/password",
  ...adminAuth,
  adminController.resetUserPassword,
);

// Account review: approve / reject users (must be before :userId/roles to avoid conflict)
router.post("/users/:userId/approve", ...adminAuth, adminController.approveUser);
router.post("/users/:userId/reject", ...adminAuth, adminController.rejectUser);

// ============================================
// ROLE MANAGEMENT
// ============================================

// Get user roles
router.get("/users/:userId/roles", ...adminAuth, adminController.getUserRoles);

// Assign a new role to a user
router.post("/users/:userId/roles", ...adminAuth, adminController.assignRole);

// Replace all roles for a user
router.put("/users/:userId/roles", ...adminAuth, adminController.setRoles);

// Revoke a role from a user
router.delete("/users/:userId/roles", ...adminAuth, adminController.revokeRole);

// Delete a user
router.delete("/users/:userId", ...adminAuth, adminController.deleteUser);

// Impersonation log: Admin only.
router.get("/impersonation-logs", ...adminOnlyAuth, async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    res.json({ success: true, data: await impersonationLogService.list(page, limit) });
  } catch (error) {
    next(error);
  }
});

// ============================================
// REVIEWS MANAGEMENT
// ============================================

// Delete a product review
import { reviewController } from "../../controllers/review.controller";
router.delete(
  "/reviews/:reviewId",
  ...adminModeratorAuth,
  reviewController.deleteReview,
);

import { whatsappController } from "../../controllers/whatsapp.controller";

// ============================================
// GENERAL SETTINGS
// ============================================
router.get("/general-settings", ...adminAuth, whatsappController.getGeneralSettings);
router.put(
  "/general-settings/whatsapp_receiving_number",
  ...adminAuth,
  whatsappController.updateReceivingNumber,
);

// ============================================
// WHATSAPP
// ============================================
router.get("/whatsapp/status", ...adminAuth, whatsappController.getStatus);
router.post("/whatsapp/send", ...adminAuth, whatsappController.sendMessage);
router.post(
  "/whatsapp/logout",
  ...whatsappDisconnectAuth,
  whatsappController.logout,
);

// ============================================
// NOTIFICATIONS
// ============================================

// Send notification to user(s) or role (all staff)
router.post(
  "/notifications",
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
  adminController.sendNotification,
);

// List all notifications (Admin, SubAdmin, Moderator)
router.get(
  "/notifications",
  ...adminAuth,
  adminController.listNotifications,
);

export default router;
