import { cairoRange } from "../../../libs/cairoRange";
import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import {
  CreateCouponDto,
  UpdateCouponDto,
  DiscountType,
  CouponApplicabilityScope,
} from "../dtos/coupon.dto";
import { coupons, coupon_type } from "../generated/prisma/client";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../../libs/errors";
import crypto from "crypto";

type CouponTarget = {
  scope: CouponApplicabilityScope;
  product_id: number | null;
  category_id: number | null;
};

// ============================================
// COUPON SERVICE
// ============================================

export class CouponService {
  constructor(private db: PrismaClient = prisma) {}

  // ============================================
  // GENERATE UNIQUE CODE (public helper)
  // ============================================

  /**
   * Generates a unique coupon code in the format KLM-XXXXXX.
   * Can be called independently so admins can pre-generate a code.
   */
  async generateUniqueCode(): Promise<string> {
    let code: string;
    let exists: coupons | null;

    do {
      const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
      code = `KLM-${random}`;
      exists = await this.db.coupons.findUnique({ where: { code } });
    } while (exists);

    return code;
  }

  private resolveCreateTarget(dto: CreateCouponDto): CouponTarget {
    const scope =
      dto.applicability_scope ??
      (dto.category_id ? CouponApplicabilityScope.CATEGORY : CouponApplicabilityScope.PRODUCT);

    const hasProduct = dto.product_id !== undefined && dto.product_id !== null;
    const hasCategory = dto.category_id !== undefined && dto.category_id !== null;

    if (scope === CouponApplicabilityScope.PRODUCT) {
      if (!hasProduct || hasCategory) {
        throw new BadRequestError(
          "Product-scoped coupons require product_id and cannot include category_id",
        );
      }
      return { scope, product_id: dto.product_id ?? null, category_id: null };
    }

    if (!hasCategory || hasProduct) {
      throw new BadRequestError(
        "Category-scoped coupons require category_id and cannot include product_id",
      );
    }
    return { scope, product_id: null, category_id: dto.category_id ?? null };
  }

  private resolveUpdateTarget(
    dto: UpdateCouponDto,
    coupon: Pick<coupons, "product_id"> & {
      category_id?: number | null;
      applicability_scope?: string | null;
    },
  ): CouponTarget {
    const existingScope =
      (coupon.applicability_scope as CouponApplicabilityScope | undefined) ??
      (coupon.category_id ? CouponApplicabilityScope.CATEGORY : CouponApplicabilityScope.PRODUCT);
    const scope = dto.applicability_scope ?? existingScope;

    const product_id =
      dto.product_id !== undefined
        ? dto.product_id
        : scope === CouponApplicabilityScope.PRODUCT
          ? coupon.product_id
          : null;
    const category_id =
      dto.category_id !== undefined
        ? dto.category_id
        : scope === CouponApplicabilityScope.CATEGORY
          ? (coupon.category_id ?? null)
          : null;

    if (scope === CouponApplicabilityScope.PRODUCT) {
      if (!product_id || category_id) {
        throw new BadRequestError(
          "Product-scoped coupons require product_id and cannot include category_id",
        );
      }
      return { scope, product_id, category_id: null };
    }

    if (!category_id || product_id) {
      throw new BadRequestError(
        "Category-scoped coupons require category_id and cannot include product_id",
      );
    }
    return { scope, product_id: null, category_id };
  }

  private async validateTarget(target: CouponTarget) {
    if (target.scope === CouponApplicabilityScope.PRODUCT) {
      const product = await this.db.products.findFirst({
        where: { id: target.product_id!, deleted_at: null },
        select: { id: true, price: true, is_archived: true },
      });
      if (!product) {
        throw new NotFoundError("Product not found");
      }
      if (product.is_archived) {
        throw new BadRequestError("Cannot create coupon for archived product");
      }
      return { product, category: null };
    }

    const category = await this.db.categories.findUnique({
      where: { id: target.category_id! },
      select: { id: true, active: true },
    });
    if (!category) {
      throw new NotFoundError("Category not found");
    }
    if (!category.active) {
      throw new BadRequestError("Cannot create coupon for inactive category");
    }
    return { product: null, category };
  }

  private async getDescendantCategoryIds(categoryId: number): Promise<number[]> {
    const ids = new Set<number>([categoryId]);
    let frontier = [categoryId];

    while (frontier.length > 0) {
      const children = await this.db.categories.findMany({
        where: { parent_id: { in: frontier } },
        select: { id: true },
      });
      frontier = children.map((child) => child.id).filter((id) => !ids.has(id));
      for (const id of frontier) ids.add(id);
    }

    return [...ids];
  }

  // ============================================
  // CREATE
  // ============================================

  async createCoupon(dto: CreateCouponDto, _user_id: number): Promise<coupons> {
    // Check uniqueness of the provided code
    const existing = await this.db.coupons.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictError(`Coupon code "${dto.code}" already exists`);
    }

    const target = this.resolveCreateTarget(dto);
    const { product } = await this.validateTarget(target);

    // Date sanity: starts_at must be before expires_at when both provided
    if (dto.starts_at && dto.expires_at && dto.starts_at >= dto.expires_at) {
      throw new BadRequestError("starts_at must be before expires_at");
    }

    if (dto.expires_at < new Date()) {
      throw new BadRequestError("expires_at must be after now");
    }

    if (dto.discount_type === DiscountType.PERCENTAGE) {
      if (dto.discount_percentage <= 0) {
        throw new BadRequestError("Discount percentage must be greater than 0");
      }
      if (dto.discount_percentage > 100) {
        throw new BadRequestError("Discount percentage cannot exceed 100%");
      }
    }

    let couponType: coupon_type = coupon_type.percentage;
    // Fixed discount cannot exceed product price
    if (dto.discount_type === DiscountType.AMOUNT) {
      if (dto.discount_amount <= 0) {
        throw new BadRequestError("Discount amount must be greater than 0");
      }
      const productPrice = product ? Number(product.price) : null;
      if (productPrice !== null && dto.discount_amount > productPrice) {
        throw new BadRequestError(
          `Discount amount (${dto.discount_amount}) cannot exceed product price (${productPrice})`,
        );
      }
      couponType = coupon_type.fixed;
    }

    // Build data based on discount type
    const data: any = {
      code: dto.code,
      product_id: target.product_id,
      category_id: target.category_id,
      applicability_scope: target.scope,
      starts_at: dto.starts_at ?? null,
      expires_at: dto.expires_at,
      type: couponType,
    };

    if (dto.discount_type === DiscountType.AMOUNT) {
      data.discount_amount = dto.discount_amount;
      data.discount_percentage = 0;
    } else {
      data.discount_percentage = dto.discount_percentage;
      data.discount_amount = 0;
    }

    const coupon = await this.db.coupons.create({ data });
    return coupon;
  }

  // ============================================
  // READ — ALL (Admin/SubAdmin)
  // ============================================

  async getAllCoupons(filters?: {
    page?: number;
    limit?: number;
    active?: boolean;
    product_id?: number;
    category_id?: number;
    startDate?: string | Date;
    endDate?: string | Date;
    isAmount?: boolean;
    search?: string;
  }): Promise<{
    coupons: coupons[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      deleted_at: null, // exclude soft-deleted
    };

    if (filters?.active !== undefined) {
      where.active = filters.active;
    }

    if (filters?.product_id !== undefined) {
      where.product_id = filters.product_id;
    }

    if (filters?.category_id !== undefined) {
      where.category_id = filters.category_id;
    }

    if (filters?.startDate || filters?.endDate) {
      // Whole Cairo days for YYYY-MM-DD; a full timestamp as it is.
      const created = cairoRange(filters.startDate, filters.endDate);
      if (created) where.created_at = created;
    }

    if (filters?.isAmount !== undefined && filters?.isAmount !== null) {
      where.type = filters.isAmount
        ? coupon_type.fixed
        : coupon_type.percentage;
    }

    if (filters?.search) {
      where.code = {
        contains: filters.search,
        mode: "insensitive",
      };
    }

    const [coupons, total] = await Promise.all([
      this.db.coupons.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        include: {
          product: { select: { id: true, title: true } },
          category: { select: { id: true, title: true } },
        },
        relationLoadStrategy: "join",
      }),
      this.db.coupons.count({ where }),
    ]);

    return { coupons, total, page, limit };
  }

  // ============================================
  // READ — SINGLE
  // ============================================

  async getCouponById(id: number): Promise<coupons> {
    const coupon = await this.db.coupons.findFirst({
      where: { id, deleted_at: null },
      include: {
        product: { select: { id: true, title: true } },
        category: { select: { id: true, title: true } },
      },
    });
    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }
    return coupon;
  }

  /**
   * Get coupons for a specific product.
   */
  async getCouponsByProduct(
    product_id: number,
    active?: boolean,
  ): Promise<coupons[]> {
    const where: any = {
      product_id,
      deleted_at: null,
    };
    if (active !== undefined) {
      where.active = active;
    }
    return this.db.coupons.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: { product: { select: { id: true, title: true } } },
    });
  }

  // ============================================
  // UPDATE
  // ============================================

  async updateCoupon(id: number, dto: UpdateCouponDto): Promise<coupons> {
    const coupon = await this.db.coupons.findFirst({
      where: { id, deleted_at: null },
      include: {
        product: { select: { id: true, price: true, is_archived: true } },
        category: { select: { id: true, active: true } },
      },
    });
    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }

    // If code is being changed, check uniqueness
    if (dto.code && dto.code !== coupon.code) {
      const existing = await this.db.coupons.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new ConflictError(`Coupon code "${dto.code}" already exists`);
      }
    }

    const target = this.resolveUpdateTarget(dto, coupon as any);
    const { product: productForPrice } = await this.validateTarget(target);

    // Date sanity
    const startsAt = dto.starts_at ?? coupon.starts_at;
    const expiresAt = dto.expires_at ?? coupon.expires_at;
    if (startsAt && expiresAt && startsAt >= expiresAt) {
      throw new BadRequestError("starts_at must be before expires_at");
    }

    // Discount vs price check when amount discount is being set
    if (productForPrice) {
      let amountToCheck: number | undefined;
      if (
        dto.discount_type === DiscountType.AMOUNT &&
        dto.discount_amount !== undefined
      ) {
        amountToCheck = dto.discount_amount;
      } else if (dto.discount_amount !== undefined) {
        amountToCheck = dto.discount_amount;
      }
      if (
        amountToCheck !== undefined &&
        amountToCheck > 0 &&
        amountToCheck > Number(productForPrice.price)
      ) {
        throw new BadRequestError(
          `Discount amount cannot exceed product price (${productForPrice.price})`,
        );
      }
    }

    const data: any = {
      updated_at: new Date(),
    };

    if (dto.code !== undefined) data.code = dto.code;
    if (
      dto.applicability_scope !== undefined ||
      dto.product_id !== undefined ||
      dto.category_id !== undefined
    ) {
      data.applicability_scope = target.scope;
      data.product_id = target.product_id;
      data.category_id = target.category_id;
    }
    if (dto.starts_at !== undefined) data.starts_at = dto.starts_at;
    if (dto.expires_at !== undefined) data.expires_at = dto.expires_at;
    if (dto.is_active !== undefined) data.active = dto.is_active;

    // Handle discount type change
    if (dto.discount_type !== undefined) {
      if (dto.discount_type === DiscountType.AMOUNT) {
        data.discount_amount = dto.discount_amount;
        data.discount_percentage = 0;
      } else {
        data.discount_percentage = dto.discount_percentage;
        data.discount_amount = 0;
      }
    } else {
      // No type change — just update the value if provided
      if (dto.discount_amount !== undefined)
        data.discount_amount = dto.discount_amount;
      if (dto.discount_percentage !== undefined)
        data.discount_percentage = dto.discount_percentage;
    }

    const updated = await this.db.coupons.update({
      where: { id },
      data,
    });
    return updated;
  }

  // ============================================
  // SOFT DELETE
  // ============================================

  async deleteCoupon(id: number): Promise<coupons> {
    const coupon = await this.db.coupons.findFirst({
      where: { id, deleted_at: null },
    });
    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }

    const deleted = await this.db.coupons.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        is_deleted: true,
        active: false,
      },
    });
    return deleted;
  }

  // ============================================
  // VALIDATE COUPON
  // ============================================

  /**
   * Validates a coupon for use.
   * @param code - Coupon code
   * @param user_id - Optional. When provided, checks if user has already used this coupon (one-time per user).
   * @param product_id - Optional. When provided, ensures the coupon is valid for this product.
   */
  async validateCoupon(
    code: string,
    user_id?: number,
    product_id?: number,
  ): Promise<{ isValid: boolean; coupon: coupons }> {
    const coupon = await this.db.coupons.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        product_id: true,
        category_id: true,
        applicability_scope: true,
        discount_amount: true,
        discount_percentage: true,
        active: true,
        starts_at: true,
        expires_at: true,
        deleted_at: true,
      },
    });

    if (!coupon || coupon.deleted_at) {
      throw new NotFoundError("Invalid coupon code");
    }

    if (!coupon.active) {
      throw new BadRequestError("This coupon is no longer active");
    }

    const now = new Date();

    if (coupon.starts_at && coupon.starts_at > now) {
      throw new BadRequestError("This coupon is not yet valid");
    }

    if (coupon.expires_at && coupon.expires_at < now) {
      throw new BadRequestError("This coupon has expired");
    }

    const scope =
      (coupon.applicability_scope as CouponApplicabilityScope | undefined) ??
      (coupon.category_id ? CouponApplicabilityScope.CATEGORY : CouponApplicabilityScope.PRODUCT);

    if (product_id !== undefined) {
      if (scope === CouponApplicabilityScope.PRODUCT) {
        if (coupon.product_id !== product_id) {
          throw new BadRequestError("This coupon is not valid for this product");
        }
      } else {
        if (!coupon.category_id) {
          throw new BadRequestError("This coupon is not valid for this product");
        }

        const categoryIds = await this.getDescendantCategoryIds(coupon.category_id);
        const productCategory = await this.db.product_categories.findFirst({
          where: {
            product_id,
            category_id: { in: categoryIds },
          },
          select: { id: true },
        });

        if (!productCategory) {
          throw new BadRequestError("This coupon is not valid for this product");
        }
      }
    }

    if (user_id !== undefined) {
      const alreadyUsed = await this.db.coupon_usages.findUnique({
        where: {
          user_id_coupon_id: { user_id, coupon_id: coupon.id },
        },
      });
      if (alreadyUsed) {
        throw new BadRequestError("You have already used this coupon");
      }
    }

    return { isValid: true, coupon: coupon as coupons };
  }

  async getCouponStats() {
    const [total, active, inactive, expired, percentage, fixed] =
      await Promise.all([
        this.db.coupons.count(),
        this.db.coupons.count({ where: { active: true } }),
        this.db.coupons.count({ where: { active: false } }),
        this.db.coupons.count({ where: { expires_at: { lt: new Date() } } }),
        this.db.coupons.count({
          where: { type: coupon_type.percentage },
        }),
        this.db.coupons.count({
          where: { type: coupon_type.fixed },
        }),
      ]);

    return { total, active, inactive, expired, percentage, fixed };
  }

  /**
   * Records that a user has used a coupon (called when purchase completes).
   */
  async recordCouponUsage(
    user_id: number,
    coupon_id: number,
    purchase_id?: number,
    tx?: PrismaClient,
  ): Promise<void> {
    const db = tx || this.db;
    await db.coupon_usages.create({
      data: {
        user_id,
        coupon_id,
        purchase_id: purchase_id ?? null,
      },
    });
  }

  // ============================================
  // USE COUPON (Teacher / Account-level promo)
  // ============================================

  /**
   * Records that a user has used a coupon (e.g. for account-level promo).
   * Each user can use each coupon only once (enforced via validateCoupon).
   */
  async useCoupon(code: string, user_id: number): Promise<coupons> {
    const { coupon } = await this.validateCoupon(code, user_id);
    await this.recordCouponUsage(user_id, coupon.id);
    return coupon;
  }
}

export const couponService = new CouponService();
