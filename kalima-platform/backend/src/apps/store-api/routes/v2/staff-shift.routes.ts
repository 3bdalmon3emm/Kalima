import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../../../../libs/auth/middleware";
import { ForbiddenError } from "../../../../libs/errors";
import { requireRole } from "../../middleware/requireRole.middleware";
import { role_enum } from "../../generated/prisma/client";
import { staffShiftService, SHIFT_ROLES } from "../../services/staff-shift.service";
import { attendanceWorkbook } from "../../services/staff-shift-export";

const router = Router();

// The SubAdmin and the Moderator start and end their own shifts.
const shiftAuth = [authenticateToken, requireRole(SHIFT_ROLES)];
// The Admin sees everyone's hours and corrects them.
const adminOnlyAuth = [authenticateToken, requireRole([role_enum.Admin])];

const userId = (req: Request) => Number((req as any).user?.userId);
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).then((data) => {
    if (!res.headersSent) res.json({ success: true, data: data ?? null });
  }).catch(next);

// Someone viewing an account as its owner never starts or ends its shift.
const noImpersonation = (req: Request, _res: Response, next: NextFunction) =>
  (req as any).user?.impersonation ? next(new ForbiddenError("Shifts cannot be changed while viewing as another user")) : next();

router.get("/me", ...shiftAuth, wrap((req) => staffShiftService.mine(userId(req))));
router.post("/me/start", ...shiftAuth, noImpersonation, wrap((req) => staffShiftService.start(userId(req))));
router.post("/me/end", ...shiftAuth, noImpersonation, wrap((req) => staffShiftService.end(userId(req))));

router.get("/report", ...adminOnlyAuth, wrap((req) => staffShiftService.report(String(req.query.period || "day"), req.query.date ? String(req.query.date) : undefined)));
// A month as an Excel workbook for paying staff: ?month=YYYY-MM.
router.get("/export", ...adminOnlyAuth, (req: Request, res: Response, next: NextFunction) => {
  const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : undefined;
  attendanceWorkbook(month).then(({ filename, buffer }) => {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }).catch(next);
});
router.post("/", ...adminOnlyAuth, wrap((req) => staffShiftService.add(userId(req), req.body || {})));
router.patch("/:id", ...adminOnlyAuth, wrap((req) => staffShiftService.edit(userId(req), Number(req.params.id), req.body || {})));
router.delete("/:id", ...adminOnlyAuth, wrap((req) => staffShiftService.remove(Number(req.params.id))));

export default router;
