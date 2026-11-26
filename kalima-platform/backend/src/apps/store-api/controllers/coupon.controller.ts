import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { couponService } from "../services/coupon.service";
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  UseCouponDto,
  getAllCouponsDto,
} from "../dtos/coupon.dto";
import { ValidationError, BadRequestError } from "../../../libs/errors";

// ============================================
// HELPER
// ============================================

async function validateDto<T extends object>(
  DtoClass: new () => T,
  body: unknown,
): Promise<T> {
  const dto = plainToInstance(DtoClass, body);
  const validationErrors = await validate(dto);

  if (validationErrors.length > 0) {
    const errors = validationErrors.flatMap((err) =>
      Object.values(err.constraints || {}),
    );
    throw new ValidationError(errors);
  }

  return dto;
}

// ============================================
// COUPON CONTROLLER
// ============================================

export const couponController = {
  // ============================================
  // GENERATE CODE (Admin/SubAdmin helper)
  // ============================================

  /**
   * GET /coupons/generate-code
   * Returns a unique auto-generated coupon code.
   * Admin can use this to get a code before creating a coupon.
   */
  async generateCode(
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const code = await couponService.generateUniqueCode();

      res.status(200).json({
        success: true,
        data: { code },
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // CREATE COUPON (Admin/SubAdmin)
  // ============================================

  /**
   * POST /coupons
   * Body: { code, discount_type, discount_amount?, discount_percentage?, expires_at }
   */
  async createCoupon(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(CreateCouponDto, req.body);
      const userId = (req as any).user.userId;

      const coupon = await couponService.createCoupon(dto, userId);

      res.status(201).json({
        success: true,
        message: "Coupon created successfully",
        data: coupon,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // GET ALL COUPONS (Admin/SubAdmin)
  // ============================================

  /**
   * GET /coupons?page=1&limit=20&active=true
   */
  async getAllCoupons(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const active =
        req.query.active !== undefined ? req.query.active === "1" : undefined;

      const isAmount =
        req.query.isAmount !== undefined
          ? req.query.isAmount === "1"
          : undefined;

      // Kept as written: a day "2026-11-26" is read as the whole Cairo day.
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 50;

      const product_id = req.query.product_id
        ? parseInt(req.query.product_id as string, 10)
        : undefined;

      const category_id = req.query.category_id
        ? parseInt(req.query.category_id as string, 10)
        : undefined;

      const search = req.query.search
        ? (req.query.search as string)
        : undefined;

      const result = await couponService.getAllCoupons({
        page,
        limit,
        product_id,
        category_id,
        active,
        isAmount,
        startDate,
        endDate,
        search,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // GET SINGLE COUPON (Admin/SubAdmin)
  // ============================================

  /**
   * GET /coupons/:id
   */
  async getCouponById(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        throw new BadRequestError("Invalid coupon ID");
      }

      const coupon = await couponService.getCouponById(id);

      res.status(200).json({
        success: true,
        data: coupon,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // UPDATE COUPON (Admin/SubAdmin)
  // ============================================

  /**
   * PATCH /coupons/:id
   */
  async updateCoupon(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        throw new BadRequestError("Invalid coupon ID");
      }

      const dto = await validateDto(UpdateCouponDto, req.body);
      const coupon = await couponService.updateCoupon(id, dto);

      res.status(200).json({
        success: true,
        message: "Coupon updated successfully",
        data: coupon,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // SOFT DELETE COUPON (Admin/SubAdmin)
  // ============================================

  /**
   * DELETE /coupons/:id
   */
  async deleteCoupon(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        throw new BadRequestError("Invalid coupon ID");
      }

      await couponService.deleteCoupon(id);

      res.status(200).json({
        success: true,
        message: "Coupon deleted successfully",
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // VALIDATE COUPON (Teacher)
  // ============================================

  /**
   * POST /coupons/validate
   * Body: { code, product_id? }
   */
  async validateCoupon(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(ValidateCouponDto, req.body);
      const result = await couponService.validateCoupon(
        dto.code,
        undefined,
        dto.product_id,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // USE COUPON (Teacher)
  // ============================================

  /**
   * POST /coupons/use
   * Body: { code }
   */
  async useCoupon(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(UseCouponDto, req.body);
      const userId = (req as any).user.userId;

      const coupon = await couponService.useCoupon(dto.code, userId);

      res.status(200).json({
        success: true,
        message: "Coupon applied successfully",
        data: coupon,
      });
    } catch (error) {
      _next(error);
    }
  },

  async getCouponStats(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const stats = await couponService.getCouponStats();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      _next(error);
    }
  },
};
