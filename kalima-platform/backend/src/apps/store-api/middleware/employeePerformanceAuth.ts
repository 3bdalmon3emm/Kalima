import { authenticateToken } from '../../../libs/auth/middleware';
import { role_enum } from '../generated/prisma/client';
import { requireRole } from './requireRole.middleware';

export const employeePerformanceRoleGuard = requireRole([role_enum.Admin]);

export const employeePerformanceAuth = [
  authenticateToken,
  employeePerformanceRoleGuard,
];
