import { authenticateToken } from '../../../libs/auth/middleware';
import { role_enum } from '../generated/prisma/client';
import { requireRole } from './requireRole.middleware';

// Dashboard numbers and analytics: Admin and SubAdmin (not the Moderator).
export const adminAnalyticsRoleGuard = requireRole([role_enum.Admin]);

export const adminAnalyticsAuth = [
  authenticateToken,
  adminAnalyticsRoleGuard,
];
