import { Router } from "express";
import { userProfileController } from "../../controllers/user-profile.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { uploadSingleImage } from "../../middleware/upload.middleware";

const router = Router();

// All profile routes require authentication
router.use(authenticateToken);

// ============================================
// SELF-SERVICE  (/profile/me/*)
// ============================================

const meRouter = Router();

meRouter.get("/", userProfileController.getProfile);
meRouter.patch("/", userProfileController.updateProfile);
meRouter.post(
  "/avatar",
  uploadSingleImage("avatar"),
  userProfileController.uploadAvatar,
);
meRouter.delete("/avatar", userProfileController.deleteAvatar);
meRouter.post("/promotion-notice", userProfileController.resolvePromotionNotice);

// Teaches-at (Teacher)
meRouter.get("/teaches-at", userProfileController.getAllTeachesAt);
meRouter.post("/teaches-at", userProfileController.createTeachesAt);
meRouter.patch("/teaches-at/:id", userProfileController.updateTeachesAt);
meRouter.delete("/teaches-at/:id", userProfileController.deleteTeachesAt);

// Social media (Teacher)
meRouter.get("/social-media", userProfileController.getAllSocialMedia);
meRouter.post("/social-media", userProfileController.createSocialMedia);
meRouter.patch("/social-media/:id", userProfileController.updateSocialMedia);
meRouter.delete("/social-media/:id", userProfileController.deleteSocialMedia);

// Children (Parent)
meRouter.get("/children", userProfileController.getAllChildren);
meRouter.post("/children", userProfileController.addChild);
meRouter.patch("/children/:id", userProfileController.updateChild);
meRouter.delete("/children/:id", userProfileController.deleteChild);

router.use("/me", meRouter);

// ============================================
// ADMIN  (/profile/users/:userId/*)
// Admin/SubAdmin role enforced inside resolveTargetUserId
// ============================================

const adminRouter = Router({ mergeParams: true });

adminRouter.get("/", userProfileController.getProfile);
adminRouter.patch("/", userProfileController.updateProfile);
adminRouter.post(
  "/avatar",
  uploadSingleImage("avatar"),
  userProfileController.uploadAvatar,
);
adminRouter.delete("/avatar", userProfileController.deleteAvatar);

adminRouter.get("/teaches-at", userProfileController.getAllTeachesAt);
adminRouter.post("/teaches-at", userProfileController.createTeachesAt);
adminRouter.patch("/teaches-at/:id", userProfileController.updateTeachesAt);
adminRouter.delete("/teaches-at/:id", userProfileController.deleteTeachesAt);

adminRouter.get("/social-media", userProfileController.getAllSocialMedia);
adminRouter.post("/social-media", userProfileController.createSocialMedia);
adminRouter.patch("/social-media/:id", userProfileController.updateSocialMedia);
adminRouter.delete(
  "/social-media/:id",
  userProfileController.deleteSocialMedia,
);

adminRouter.get("/children", userProfileController.getAllChildren);
adminRouter.post("/children", userProfileController.addChild);
adminRouter.patch("/children/:id", userProfileController.updateChild);
adminRouter.delete("/children/:id", userProfileController.deleteChild);

router.use("/users/:userId", adminRouter);

export default router;
