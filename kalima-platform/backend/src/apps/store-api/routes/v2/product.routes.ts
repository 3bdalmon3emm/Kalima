import { Router } from "express";
import { productController } from "../../controllers/product.controller";
import { reviewController } from "../../controllers/review.controller";
import {
  authenticateToken,
  optionalAuthenticateToken,
} from "../../../../libs/auth/middleware";
import { requireRole } from "../../middleware/requireRole.middleware";
import {
  uploadSingleImage,
  uploadMultipleImages,
  uploadGalleryVideo,
  uploadProductWithSample,
  uploadProductUpdate,
} from "../../middleware/upload.middleware";
import { role_enum, portal_enum } from "../../generated/prisma/client";
import { makeExportHandler } from "../../export";

const router = Router();

const adminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];

const storeCustomerAuth = [
  authenticateToken,
  requireRole(
    [role_enum.Teacher, role_enum.Student, role_enum.Parent],
    portal_enum.store,
  ),
];

// ============================================
// PUBLIC — optionally authenticated
// ============================================

router.get("/export", ...adminAuth, makeExportHandler("products"));
router.get("/", optionalAuthenticateToken, productController.getAllProducts);
router.get("/:id", optionalAuthenticateToken, productController.getProductById);
router.get("/:id/coupons", productController.getProductCoupons);
router.get("/:id/thumbnail", productController.getThumbnail);
router.get("/:id/gallery", productController.getGallery);
router.get("/:id/gallery/full", productController.getFullGallery);
router.get("/:id/required-fields", productController.getProductRequiredFields);

// ============================================
// REVIEWS — public list, auth for create/update/delete
// ============================================

router.get("/:id/reviews", reviewController.getProductReviews);
router.get(
  "/:id/reviews/can-review",
  authenticateToken,
  reviewController.checkCanReview,
);
router.post(
  "/:id/reviews",
  ...storeCustomerAuth,
  reviewController.createReview,
);
router.patch(
  "/:id/reviews/:reviewId",
  authenticateToken,
  reviewController.updateReview,
);
router.delete(
  "/:id/reviews/:reviewId",
  authenticateToken,
  reviewController.deleteReview,
);

// ============================================
// ADMIN / SUBADMIN — product CRUD
// ============================================

router.post(
  "/",
  ...adminAuth,
  uploadProductWithSample,
  productController.createProduct,
);

router.patch(
  "/:id",
  ...adminAuth,
  uploadProductUpdate,
  productController.updateProduct,
);

router.patch(
  "/:id/required-fields/:fieldDefinitionId",
  ...adminAuth,
  productController.updateRequiredField,
);

router.delete("/:id", ...adminAuth, productController.deleteProduct);

// ============================================
// ADMIN / SUBADMIN — thumbnail
// ============================================

router.post(
  "/:id/thumbnail",
  ...adminAuth,
  uploadSingleImage("thumbnail"),
  productController.uploadThumbnail,
);

router.delete(
  "/:id/thumbnail",
  ...adminAuth,
  productController.removeThumbnail,
);

router.delete("/:id/sample", ...adminAuth, productController.removeSample);

// ============================================
// ADMIN / SUBADMIN — gallery
// ============================================

router.post(
  "/:id/gallery",
  ...adminAuth,
  uploadMultipleImages("gallery", 25),
  productController.addToGallery,
);

router.patch(
  "/:id/gallery/:galleryId",
  ...adminAuth,
  productController.updateGalleryEntry,
);

router.delete(
  "/:id/gallery/:galleryId",
  ...adminAuth,
  productController.removeFromGallery,
);

router.post(
  "/:id/gallery/videos",
  ...adminAuth,
  uploadGalleryVideo,
  productController.addVideoToGallery,
);

router.post(
  "/:id/gallery/videos/external",
  ...adminAuth,
  productController.addExternalVideoToGallery,
);

router.delete(
  "/:id/gallery/videos/:videoId",
  ...adminAuth,
  productController.removeVideoFromGallery,
);

// ============================================
// ADMIN / SUBADMIN — categories
// ============================================

router.post(
  "/:id/categories",
  ...adminAuth,
  productController.attachCategories,
);

router.delete(
  "/:id/categories/:categoryId",
  ...adminAuth,
  productController.detachCategory,
);

// ============================================
// ADMIN / SUBADMIN — required fields
// ============================================

router.post(
  "/:id/required-fields",
  ...adminAuth,
  productController.attachRequiredFields,
);

router.delete(
  "/:id/required-fields/:fieldDefinitionId",
  ...adminAuth,
  productController.detachRequiredField,
);

export default router;
