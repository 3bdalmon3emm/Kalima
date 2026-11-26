export const EMPLOYEE_PERFORMANCE_ALLOWED_ROLES = ['Admin'];

export function canAccessEmployeePerformance(roles = []) {
  return EMPLOYEE_PERFORMANCE_ALLOWED_ROLES.some((role) => roles.includes(role));
}
