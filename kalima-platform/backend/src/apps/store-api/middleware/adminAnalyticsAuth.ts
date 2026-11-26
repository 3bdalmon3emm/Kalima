import { authenticateToken } from '../../../libs/auth/middleware';
import { role_enum } from '../generated/prisma/client';
import { requireRole } from './requireRole.middleware';

// Dashboard numbers and analytics: Admin and SubAdmin (not the Moderator).
export const adminAnalyticsRoleGuard = requireRole([role_enum.Admin]);

export const adminAnalyticsAuth = [
  authenticateToken,
  adminAnalyticsRoleGuard,
];

// The money cards over the orders page (the same store numbers) stay with
// the SubAdmin too; the analytics page itself is the Admin's.
export const orderStatsAuth = [authenticateToken, requireRole([role_enum.Admin, role_enum.SubAdmin])];
