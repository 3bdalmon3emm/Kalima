import { Router } from "express";
import { adminDashboardController } from "../../controllers/admin-dashboard.controller";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { requireRole } from "../../middleware/requireRole.middleware";
import { role_enum } from "../../generated/prisma/client";
import { adminAnalyticsAuth, orderStatsAuth } from "../../middleware/adminAnalyticsAuth";
import { employeePerformanceAuth } from "../../middleware/employeePerformanceAuth";

const router = Router();

// All admin routes require authentication + Admin or SubAdmin role
const adminAuth = [
  authenticateToken,
  requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]),
];

// ============================================
// STORE ANALYTICS
// ============================================

// Overview, Monthly Trends, Daily stats
router.get("/store-stats", ...orderStatsAuth, adminDashboardController.getStoreStatistics);

// Confirmer Statistics
router.get("/confirmer-stats", ...employeePerformanceAuth, adminDashboardController.getConfirmerStatistics);

// Product Performance Ranking
router.get("/product-performance", ...adminAnalyticsAuth, adminDashboardController.getProductPerformance);

// Response Time Analytics
router.get("/response-time", ...adminAnalyticsAuth, adminDashboardController.getResponseTimeAnalytics);

// Staff Performance Tracking (Received/Confirmed/Returned/Response Times)
router.get("/staff-report", ...employeePerformanceAuth, adminDashboardController.getStaffPerformanceReport);

// User Stats (total users, by role, verified): the counts over the users
// page, which the SubAdmin and the Moderator see too.
router.get("/user-stats", ...orderStatsAuth, adminDashboardController.getUserStats);

export default router;
