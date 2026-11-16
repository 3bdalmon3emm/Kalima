import { authenticateToken } from '../../../libs/auth/middleware';
import { role_enum } from '../generated/prisma/client';
import { requireRole } from './requireRole.middleware';

// Dashboard numbers and analytics: all staff.
export const adminAnalyticsRoleGuard = requireRole([role_enum.Admin, role_enum.SubAdmin, role_enum.Moderator]);

export const adminAnalyticsAuth = [
  authenticateToken,
  adminAnalyticsRoleGuard,
];
