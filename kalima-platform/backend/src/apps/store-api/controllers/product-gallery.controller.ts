import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { productService as productGalleryService } from "../services/product.service";
import { UpdateGalleryEntryDto } from "../dtos/product.dto";
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
// PRODUCT GALLERY CONTROLLER
// ============================================

export const productGalleryController = {
  // ============================================
  // ADD IMAGES TO GALLERY
  // ============================================

  /**
   * POST /products/:productId/gallery
   * Body: multipart/form-data with field "gallery" (1–25 images)
   * Query: ?compress=false to skip compression (default: true)
   */
  async addToGallery(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const productId = parseInt(req.params.productId as string, 10);
      if (isNaN(productId)) {
        throw new BadRequestError("Invalid product ID");
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError("No images provided");
      }

      const compress = req.query.compress !== "false";

      const entries = await productGalleryService.addToGallery(
        productId,
        files,
        compress,
      );

      res.status(201).json({
        success: true,
        message: `${entries.length} image(s) added to gallery`,
        data: entries,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // GET GALLERY
  // ============================================

  /**
   * GET /products/:productId/gallery
   * Query: ?includeInactive=true to include deactivated entries
   */
  async getGallery(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const productId = parseInt(req.params.productId as string, 10);
      if (isNaN(productId)) {
        throw new BadRequestError("Invalid product ID");
      }

      const includeInactive = req.query.includeInactive === "true";

      const entries = await productGalleryService.getGallery(
        productId,
        includeInactive,
      );

      res.status(200).json({
        success: true,
        results: entries.length,
        data: entries,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // UPDATE GALLERY ENTRY
  // ============================================

  /**
   * PATCH /products/:productId/gallery/:galleryId
   * Body: { sort_order?, active? }
   */
  async updateGalleryEntry(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const productId = parseInt(req.params.productId as string, 10);
      const galleryId = req.params.galleryId ? parseInt(req.params.galleryId as string, 10) : NaN;
      if (isNaN(productId) || isNaN(galleryId)) {
        throw new BadRequestError("Invalid product ID or gallery ID");
      }

      const dto = await validateDto(UpdateGalleryEntryDto, req.body);

      const entry = await productGalleryService.updateGalleryEntry(
        productId,
        galleryId,
        dto,
      );

      res.status(200).json({
        success: true,
        message: "Gallery entry updated",
        data: entry,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // REMOVE FROM GALLERY
  // ============================================

  /**
   * DELETE /products/:productId/gallery/:galleryId
   * Deletes the gallery entry AND the image from disk.
   */
  async removeFromGallery(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const productId = parseInt(req.params.productId as string, 10);
      const galleryId = req.params.galleryId ? parseInt(req.params.galleryId as string, 10) : NaN;
      if (isNaN(productId) || isNaN(galleryId)) {
        throw new BadRequestError("Invalid product ID or gallery ID");
      }

      await productGalleryService.removeFromGallery(productId, galleryId);

      res.status(200).json({
        success: true,
        message: "Image removed from gallery",
      });
    } catch (error) {
      _next(error);
    }
  },
};
