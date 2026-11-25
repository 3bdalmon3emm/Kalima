import { NextFunction, Request, Response, Router } from "express";
import { authController } from "../../controllers/auth.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { role_enum } from "../../generated/prisma/enums";
import { requireRole } from "../../middleware/requireRole.middleware";
import { canGrant } from "../../../../libs/auth/roleRank";

const router = Router();

// ============================================
// PUBLIC ROUTES - No authentication required
// ============================================

// Registration - Local
router.post("/register/teacher", authController.registerTeacher);
router.post("/register/student", authController.registerStudent);
router.post("/register/parent", authController.registerParent);
router.post("/register/lecturer", authController.registerLecturer);

// Registration - Firebase OAuth
router.post(
  "/register/teacher/firebase",
  authController.registerTeacherFirebase,
);
router.post(
  "/register/student/firebase",
  authController.registerStudentFirebase,
);
router.post("/register/parent/firebase", authController.registerParentFirebase);
router.post(
  "/register/lecturer/firebase",
  authController.registerLecturerFirebase,
);

// Login
router.post("/login", authController.login);
router.post("/login/firebase", authController.loginFirebase);

// Token Management (Public)
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

// Password Recovery (Public)
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// Email Verification (Public)
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerificationEmail);

// ============================================
// PROTECTED ROUTES - Authentication required
// ============================================

// Logout from all devices
router.post("/logout-all", authenticateToken, authController.logoutAllDevices);

// Password Management (Protected)
router.post(
  "/change-password",
  authenticateToken,
  authController.changePassword,
);
router.post("/set-password", authenticateToken, authController.setPassword);

// Email Verification (Protected - for logged in users)
router.post(
  "/send-verification",
  authenticateToken,
  authController.sendVerificationEmail,
);

// Account Linking (Protected)
router.post(
  "/link/firebase",
  authenticateToken,
  authController.linkFirebaseAccount,
);
router.post("/unlink", authenticateToken, authController.unlinkProvider);
router.get(
  "/linked-providers",
  authenticateToken,
  authController.getLinkedProviders,
);

// Account Deletion (Protected)
router.delete(
  "/delete-account",
  authenticateToken,
  authController.deleteAccount,
);

// ============================================
// ADMIN ROUTES - Admin authentication required
// ============================================

// All admin routes require authentication + Admin or SubAdmin role
const adminAuth = [authenticateToken, requireRole([role_enum.Admin])];

const adminSubAdminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin]),
];

const adminModeratorAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];

// Who may impersonate whom is decided in authService.startImpersonation.
router.post("/admin/impersonation/start", adminModeratorAuth, authController.startImpersonation);
router.post("/admin/impersonation/stop", authenticateToken, authController.stopImpersonation);

// Staff accounts only below the creator's own rank (nobody creates an Admin).
const canCreate = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  if (canGrant((req as any).user?.roles, role)) return next();
  res.status(403).json({ success: false, message: `You cannot create a ${role} account` });
};

router.post("/admin/create-admin", adminAuth, canCreate(role_enum.Admin), authController.createAdmin);
router.post("/admin/create-subadmin", adminAuth, canCreate(role_enum.SubAdmin), authController.createSubAdmin);
router.post(
  "/admin/create-moderator",
  adminSubAdminAuth,
  canCreate(role_enum.Moderator),
  authController.createModerator,
);
router.post(
  "/admin/create-assistant",
  adminModeratorAuth,
  authController.createAssistant,
);

export default router;
