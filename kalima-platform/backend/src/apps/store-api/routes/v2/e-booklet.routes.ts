import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eBookletController } from "../../controllers/e-booklet.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { requireRole } from "../../middleware/requireRole.middleware";
import { uploadSingleImage } from "../../middleware/upload.middleware";
import { role_enum, portal_enum } from "../../generated/prisma/client";
import { makeExportHandler } from "../../export";
import {
  uploadEBookletCover,
  uploadEBookletDocument,
  uploadEBookletHotspotMedia,
} from "../../middleware/e-booklet-upload.middleware";

const router = Router();

const adminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];

const adminManagerAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin]),
];

const teacherAuth = [
  authenticateToken,
  requireRole([role_enum.Teacher], portal_enum.store),
];

const studentAuth = [
  authenticateToken,
  requireRole([role_enum.Student]),
];

const viewerAuth = [authenticateToken];

const inviteAcceptanceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many e-booklet invite attempts. Please try again later.",
  },
});

const viewerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many e-booklet viewer requests. Please slow down.",
  },
});

// Store APIs - separate from normal Market products.
router.get("/e-booklet-store", eBookletController.listStoreTemplates);
router.get("/e-booklet-store/covers/:assetId", eBookletController.previewPublicCoverAsset);
router.get("/e-booklet-store/:templateId/preview/metadata", viewerLimiter, eBookletController.getStorePreviewMetadata);
router.get("/e-booklet-store/:templateId/preview/pages/:pageNumber/preview", viewerLimiter, eBookletController.getStorePreviewDocumentPagePreview);
router.get("/e-booklet-store/:templateId/preview/pages/:pageNumber/hotspots", viewerLimiter, eBookletController.getStorePreviewPageHotspots);
router.get("/e-booklet-store/:templateId/preview/hotspots/:hotspotId/content", viewerLimiter, eBookletController.getStorePreviewHotspotContent);
router.get("/e-booklet-store/:templateId/preview/hotspots/:hotspotId/assets/:assetId", viewerLimiter, eBookletController.getStorePreviewHotspotAsset);
router.get("/e-booklet-store/:templateId/preview/pages/:pageNumber", viewerLimiter, eBookletController.getStorePreviewPage);
router.get("/e-booklet-store/instances/:instanceId", eBookletController.getStoreInstance);
router.get("/e-booklet-store/:templateId", eBookletController.getStoreTemplate);
router.post(
  "/e-booklet-checkout/repeat-purchases",
  ...teacherAuth,
  eBookletController.checkRepeatPurchases,
);
router.post("/e-booklet-checkout", ...teacherAuth, uploadSingleImage("paymentScreenshot"), eBookletController.createPublicCheckout);
router.get("/e-booklet-orders", ...teacherAuth, eBookletController.listPublicOrders);

// Admin APIs.
router.post(
  "/admin/e-booklet-files/document",
  ...adminAuth,
  uploadEBookletDocument,
  eBookletController.uploadFileAsset,
);
router.post(
  "/admin/e-booklet-files/cover",
  ...adminAuth,
  uploadEBookletCover,
  eBookletController.uploadFileAsset,
);
router.post(
  "/admin/e-booklet-files/hotspot-media",
  ...adminAuth,
  uploadEBookletHotspotMedia,
  eBookletController.uploadFileAsset,
);
router.get(
  "/admin/e-booklet-files/:assetId/preview",
  ...adminAuth,
  eBookletController.previewAdminFileAsset,
);
router.get(
  "/admin/e-booklet-files/:assetId/pages/:pageNumber/preview",
  ...adminAuth,
  eBookletController.previewAdminFileAssetPage,
);
router.get(
  "/admin/e-booklet-templates",
  ...adminAuth,
  eBookletController.listAdminTemplates,
);
router.post(
  "/admin/e-booklet-templates",
  ...adminAuth,
  eBookletController.createTemplate,
);
router.get(
  "/admin/e-booklet-templates/:id",
  ...adminAuth,
  eBookletController.getAdminTemplate,
);
router.patch(
  "/admin/e-booklet-templates/:id",
  ...adminAuth,
  eBookletController.updateTemplate,
);
router.delete(
  "/admin/e-booklet-templates/:id",
  ...adminAuth,
  eBookletController.updateTemplate,
);
router.post(
  "/admin/e-booklet-templates/:id/versions",
  ...adminAuth,
  eBookletController.createVersion,
);
router.get(
  "/admin/e-booklet-templates/:id/versions",
  ...adminAuth,
  eBookletController.listTemplateVersions,
);
router.patch(
  "/admin/e-booklet-template-versions/:versionId",
  ...adminAuth,
  eBookletController.updateVersion,
);
router.get(
  "/admin/e-booklet-template-versions/:versionId/hotspots",
  ...adminAuth,
  eBookletController.listVersionHotspots,
);
router.post(
  "/admin/e-booklet-template-versions/:versionId/hotspots/from-preset",
  ...adminAuth,
  eBookletController.createHotspotFromPreset,
);
router.post(
  "/admin/e-booklet-template-versions/:versionId/publish",
  ...adminAuth,
  eBookletController.publishVersion,
);
router.post(
  "/admin/e-booklet-template-versions/:versionId/hotspots",
  ...adminAuth,
  eBookletController.createHotspot,
);
router.patch(
  "/admin/e-booklet-hotspots/:hotspotId",
  ...adminAuth,
  eBookletController.updateHotspot,
);
router.delete(
  "/admin/e-booklet-hotspots/:hotspotId",
  ...adminAuth,
  eBookletController.deleteHotspot,
);
router.get(
  "/admin/e-booklet-hotspot-presets",
  ...adminAuth,
  eBookletController.listHotspotPresets,
);
router.post(
  "/admin/e-booklet-hotspot-presets",
  ...adminAuth,
  eBookletController.createHotspotPreset,
);
router.get(
  "/admin/e-booklet-hotspot-presets/:presetId",
  ...adminAuth,
  eBookletController.getHotspotPreset,
);
router.patch(
  "/admin/e-booklet-hotspot-presets/:presetId/metadata",
  ...adminAuth,
  eBookletController.updateHotspotPresetMetadata,
);
router.put(
  "/admin/e-booklet-hotspot-presets/:presetId/content",
  ...adminAuth,
  eBookletController.replaceHotspotPresetContent,
);
router.delete(
  "/admin/e-booklet-hotspot-presets/:presetId",
  ...adminAuth,
  eBookletController.deleteHotspotPreset,
);
router.post(
  "/admin/e-booklet-hotspot-presets/:presetId/restore",
  ...adminAuth,
  eBookletController.restoreHotspotPreset,
);
router.get(
  "/admin/e-booklet-purchases/export",
  ...adminAuth,
  makeExportHandler("admin/e-booklet-purchases"),
);
router.get(
  "/admin/e-booklet-purchases",
  ...adminAuth,
  eBookletController.listPurchases,
);
router.post(
  "/admin/e-booklet-purchases",
  ...adminAuth,
  eBookletController.createPurchaseDeal,
);
router.get(
  "/admin/e-booklet-purchases/:id",
  ...adminAuth,
  eBookletController.getPurchase,
);
router.patch(
  "/admin/e-booklet-purchases/:id/status",
  ...adminAuth,
  eBookletController.updatePurchaseStatus,
);
router.post(
  "/admin/e-booklet-purchases/:id/mark-paid",
  ...adminAuth,
  eBookletController.markPurchasePaid,
);
router.post(
  "/admin/e-booklet-purchases/:id/deliver",
  ...adminAuth,
  eBookletController.deliverPurchase,
);
router.post(
  "/admin/e-booklet-purchases/:id/custom-template",
  ...adminAuth,
  eBookletController.preparePurchaseCustomTemplate,
);
router.get(
  "/admin/e-booklet-instances",
  ...adminAuth,
  eBookletController.listInstances,
);
router.get(
  "/admin/e-booklet-instances/export",
  ...adminAuth,
  makeExportHandler("admin/e-booklet-instances"),
);
router.post(
  "/admin/e-booklet-instances/:id/update-quota",
  ...adminAuth,
  eBookletController.updateQuota,
);
router.post(
  "/admin/e-booklet-instances/:id/access-expiry",
  ...adminAuth,
  eBookletController.updateAccessExpiry,
);
router.post(
  "/admin/e-booklet-instances/:id/revoke-access",
  ...adminAuth,
  eBookletController.revokeTeacherAccess,
);
router.get(
  "/admin/e-booklet-instances/:instanceId/students",
  ...adminAuth,
  eBookletController.listInstanceStudents,
);
router.get(
  "/admin/e-booklet-instances/:instanceId/users/:userId/devices",
  ...adminAuth,
  eBookletController.listViewerDevices,
);
router.post(
  "/admin/e-booklet-instances/:instanceId/users/:userId/devices/reset",
  ...adminAuth,
  eBookletController.resetViewerDevices,
);
router.post(
  "/admin/e-booklet-instances/:instanceId/users/:userId/device-allowance",
  ...adminAuth,
  eBookletController.addDeviceAllowance,
);
router.post(
  "/admin/e-booklet-student-purchases/:purchaseId/approve",
  ...adminAuth,
  eBookletController.approveStudentPurchaseLink,
);
router.get(
  "/admin/e-booklet-analytics",
  ...adminManagerAuth,
  eBookletController.adminAnalytics,
);
router.get(
  "/admin/e-booklet-analytics.csv",
  ...adminManagerAuth,
  eBookletController.exportAdminAnalyticsCsv,
);
router.get(
  "/admin/e-booklet-terms",
  ...adminManagerAuth,
  eBookletController.listTerms,
);
router.get(
  "/admin/e-booklet-settings",
  ...adminManagerAuth,
  eBookletController.getSettings,
);
router.put(
  "/admin/e-booklet-settings",
  ...adminManagerAuth,
  eBookletController.updateSettings,
);
router.post(
  "/admin/e-booklet-terms",
  ...adminManagerAuth,
  eBookletController.createTerms,
);
router.patch(
  "/admin/e-booklet-terms/:termId",
  ...adminManagerAuth,
  eBookletController.updateTerms,
);
router.post(
  "/admin/e-booklet-terms/:termId/activate",
  ...adminManagerAuth,
  eBookletController.activateTerms,
);
router.get(
  "/admin/e-booklet-milestones",
  ...adminManagerAuth,
  eBookletController.listMilestones,
);
router.post(
  "/admin/e-booklet-milestones",
  ...adminManagerAuth,
  eBookletController.createMilestone,
);
router.patch(
  "/admin/e-booklet-milestones/:milestoneId",
  ...adminManagerAuth,
  eBookletController.updateMilestone,
);
router.delete(
  "/admin/e-booklet-milestones/:milestoneId",
  ...adminManagerAuth,
  eBookletController.deleteMilestone,
);
router.post(
  "/admin/e-booklet-milestones/reorder",
  ...adminManagerAuth,
  eBookletController.reorderMilestones,
);
router.post(
  "/admin/e-booklet-access-codes",
  ...adminManagerAuth,
  eBookletController.adminGenerateAccessCode,
);
router.get(
  "/admin/e-booklet-access-codes",
  ...adminManagerAuth,
  eBookletController.adminListAccessCodes,
);
router.post(
  "/admin/e-booklet-access-codes/bulk",
  ...adminManagerAuth,
  eBookletController.adminGenerateAccessCodes,
);
router.post(
  "/admin/e-booklet-access-codes/free",
  ...adminManagerAuth,
  eBookletController.adminGenerateFreeCode,
);
router.get(
  "/admin/e-booklet-access-code-print/templates",
  ...adminManagerAuth,
  eBookletController.adminListPrintTemplates,
);
router.post(
  "/admin/e-booklet-access-code-print/templates",
  ...adminManagerAuth,
  eBookletController.adminCreatePrintTemplate,
);
router.patch(
  "/admin/e-booklet-access-code-print/templates/:templateId",
  ...adminManagerAuth,
  eBookletController.adminUpdatePrintTemplate,
);
router.patch(
  "/admin/e-booklet-access-code-print/templates/:templateId/archive",
  ...adminManagerAuth,
  eBookletController.adminArchivePrintTemplate,
);
router.patch(
  "/admin/e-booklet-access-code-print/templates/:templateId/activate",
  ...adminManagerAuth,
  eBookletController.adminActivatePrintTemplate,
);
router.delete(
  "/admin/e-booklet-access-code-print/templates/:templateId",
  ...adminManagerAuth,
  eBookletController.adminDeletePrintTemplate,
);
router.get(
  "/admin/e-booklet-access-code-print/presets",
  ...adminManagerAuth,
  eBookletController.adminListPrintPresets,
);
router.post(
  "/admin/e-booklet-access-code-print/presets",
  ...adminManagerAuth,
  eBookletController.adminCreatePrintPreset,
);
router.post(
  "/admin/e-booklet-access-code-print/batches/snapshot",
  ...adminManagerAuth,
  eBookletController.adminCreatePrintBatchSnapshot,
);
router.get(
  "/admin/e-booklet-access-code-print/batches",
  ...adminManagerAuth,
  eBookletController.adminListPrintBatches,
);
router.post(
  "/admin/e-booklet-access-code-print/batches",
  ...adminManagerAuth,
  eBookletController.adminGeneratePrintBatch,
);
router.post(
  "/admin/e-booklet-access-code-print/preview",
  ...adminManagerAuth,
  eBookletController.adminPreviewPrintCard,
);
router.get(
  "/admin/e-booklet-access-code-print/batches/:batchId/pdf",
  ...adminManagerAuth,
  eBookletController.adminDownloadPrintBatchPdf,
);
router.get(
  "/admin/e-booklet-progress",
  ...adminManagerAuth,
  eBookletController.listAdminProgress,
);

// Teacher APIs.
router.get("/teacher/e-booklets", ...teacherAuth, eBookletController.listTeacherEBooklets);
router.get(
  "/teacher/e-booklet-terms/current",
  ...teacherAuth,
  eBookletController.getCurrentTerms,
);
router.post(
  "/teacher/e-booklet-terms/accept-code-generation",
  ...teacherAuth,
  eBookletController.acceptCodeGenerationTerms,
);
router.post(
  "/teacher/e-booklets/:instanceId/access-codes",
  ...teacherAuth,
  eBookletController.generateAccessCode,
);
router.get(
  "/teacher/e-booklets/:instanceId/access-codes",
  ...teacherAuth,
  eBookletController.listAccessCodes,
);
router.post(
  "/teacher/e-booklets/:instanceId/access-codes/bulk",
  ...teacherAuth,
  eBookletController.generateAccessCodes,
);
router.get(
  "/teacher/e-booklet-milestones",
  ...teacherAuth,
  eBookletController.listMilestones,
);
router.post(
  "/teacher/e-booklet-milestones/evaluate",
  ...teacherAuth,
  eBookletController.evaluateMilestones,
);
router.get(
  "/teacher/e-booklet-wallet",
  ...teacherAuth,
  eBookletController.getTeacherWallet,
);
router.post(
  "/teacher/e-booklet-wallet/preview",
  ...teacherAuth,
  eBookletController.previewTeacherWallet,
);
router.post(
  "/teacher/e-booklet-wallet/apply",
  ...teacherAuth,
  eBookletController.applyTeacherWallet,
);
router.post(
  "/teacher/e-booklet-milestone-achievements/:achievementId/claim",
  ...teacherAuth,
  eBookletController.claimMilestoneReward,
);
router.get(
  "/teacher/e-booklets/:instanceId/invites",
  ...teacherAuth,
  eBookletController.listInvites,
);
router.post(
  "/teacher/e-booklets/:instanceId/invites",
  ...teacherAuth,
  eBookletController.createInvite,
);
router.patch(
  "/teacher/e-booklet-invites/:inviteId/disable",
  ...teacherAuth,
  eBookletController.disableInvite,
);
router.get(
  "/teacher/e-booklets/:instanceId/students",
  ...teacherAuth,
  eBookletController.listInstanceStudents,
);
router.patch(
  "/teacher/e-booklets/:instanceId/students/:studentId/revoke",
  ...teacherAuth,
  eBookletController.revokeStudentAccess,
);
router.get(
  "/teacher/e-booklet-analytics.csv",
  ...teacherAuth,
  eBookletController.exportTeacherAnalyticsCsv,
);
router.get(
  "/teacher/e-booklet-analytics",
  ...teacherAuth,
  eBookletController.teacherAnalytics,
);

// Student APIs.
router.get("/student/e-booklets", ...studentAuth, eBookletController.listStudentEBooklets);
router.get(
  "/e-booklet-access-codes/preview",
  inviteAcceptanceLimiter,
  ...studentAuth,
  eBookletController.previewAccessCode,
);
router.get(
  "/e-booklet-access-code-print/qr/:ref",
  inviteAcceptanceLimiter,
  ...studentAuth,
  eBookletController.getPrintQrPrefill,
);
router.get(
  "/e-booklet-access-code-print/qr/:ref/teacher-image",
  inviteAcceptanceLimiter,
  ...studentAuth,
  eBookletController.getPrintQrTeacherImage,
);
router.post(
  "/e-booklet-access-codes/redeem",
  inviteAcceptanceLimiter,
  ...studentAuth,
  eBookletController.redeemAccessCode,
);
router.get(
  "/e-booklet-invites/:token/open",
  inviteAcceptanceLimiter,
  eBookletController.recordInviteOpen,
);
router.post(
  "/e-booklet-invites/:token/accept",
  inviteAcceptanceLimiter,
  ...studentAuth,
  uploadSingleImage("paymentScreenshot"),
  eBookletController.acceptInvite,
);

// Admin View Mode APIs.
router.get(
  "/admin/e-booklet-viewer/:instanceId/metadata",
  viewerLimiter,
  ...adminAuth,
  eBookletController.getAdminViewerMetadata,
);
router.get(
  "/admin/e-booklet-viewer/:instanceId/document",
  viewerLimiter,
  ...adminAuth,
  eBookletController.getAdminAuthorizedViewerDocument,
);
router.get(
  "/admin/e-booklet-viewer/:instanceId/pages/:pageNumber/preview",
  viewerLimiter,
  ...adminAuth,
  eBookletController.getAdminAuthorizedViewerDocumentPagePreview,
);
router.get(
  "/admin/e-booklet-viewer/:instanceId/pages/:pageNumber",
  viewerLimiter,
  ...adminAuth,
  eBookletController.getAdminViewerPage,
);
router.get(
  "/admin/e-booklet-viewer/:instanceId/pages/:pageNumber/hotspots",
  viewerLimiter,
  ...adminAuth,
  eBookletController.getAdminViewerPageHotspots,
);
router.get(
  "/admin/e-booklet-viewer/:instanceId/hotspots/:hotspotId/content",
  viewerLimiter,
  ...adminManagerAuth,
  eBookletController.getAdminHotspotContent,
);
router.get(
  "/admin/e-booklet-viewer/:instanceId/hotspots/:hotspotId/assets/:assetId",
  viewerLimiter,
  ...adminManagerAuth,
  eBookletController.getAdminAuthorizedHotspotAsset,
);

// Viewer APIs.
router.get(
  "/e-booklet-viewer/:instanceId/metadata",
  viewerLimiter,
  eBookletController.getViewerMetadata,
);
router.post(
  "/e-booklet-viewer/:instanceId/devices/bind",
  viewerLimiter,
  ...viewerAuth,
  eBookletController.bindViewerDevice,
);
router.get(
  "/e-booklet-viewer/:instanceId/document",
  viewerLimiter,
  eBookletController.getAuthorizedViewerDocument,
);
router.get(
  "/e-booklet-viewer/:instanceId/pages/:pageNumber/preview",
  viewerLimiter,
  eBookletController.getAuthorizedViewerDocumentPagePreview,
);
router.get(
  "/e-booklet-viewer/:instanceId/pages/:pageNumber",
  viewerLimiter,
  eBookletController.getViewerPage,
);
router.get(
  "/e-booklet-viewer/:instanceId/pages/:pageNumber/hotspots",
  viewerLimiter,
  eBookletController.getViewerPageHotspots,
);
router.get(
  "/e-booklet-viewer/hotspots/:hotspotId/content",
  viewerLimiter,
  ...viewerAuth,
  (_req, res) => res.status(410).json({
    success: false,
    message: "This e-booklet hotspot route has moved. Please refresh the viewer.",
  }),
);
router.get(
  "/e-booklet-viewer/hotspots/:hotspotId/assets/:assetId",
  viewerLimiter,
  ...viewerAuth,
  (_req, res) => res.status(410).json({
    success: false,
    message: "This e-booklet hotspot asset route has moved. Please refresh the viewer.",
  }),
);
router.get(
  "/e-booklet-viewer/:instanceId/hotspots/:hotspotId/content",
  viewerLimiter,
  eBookletController.getHotspotContent,
);
router.get(
  "/e-booklet-viewer/:instanceId/hotspots/:hotspotId/assets/:assetId",
  viewerLimiter,
  eBookletController.getAuthorizedHotspotAsset,
);

export default router;
