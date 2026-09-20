import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { sampleService } from "../services/sample.service";
import {
  CreateSampleSectionDto,
  UpdateSampleSectionDto,
  CreateSampleBodyDto,
  UpdateSampleBodyDto,
} from "../dtos/sample.dto";
import { buildContentDisposition } from "../utils/filename";
import { ValidationError, BadRequestError, ForbiddenError } from "../../../libs/errors";
import fs from "fs";
import path from "path";
import {
  isR2Enabled,
  proxyObject,
  getSignedDownloadUrl,
  getServePolicy,
  AssetCategory,
} from "../../../libs/storage";

/**
 * Serves a stored sample file. On R2 the mode is read from the serving policy
 * for `category`: "signed" 302-redirects to a short-lived signed URL (with the
 * content type/disposition baked in so they survive on the direct R2 response),
 * "proxy" streams through the backend. On local disk it sends the file after an
 * existence check. Response headers set by the caller are preserved for the
 * proxy/local paths.
 */
async function serveSampleFile(
  req: Request,
  res: Response,
  filePath: string,
  category: AssetCategory,
  meta: { contentType: string; contentDisposition: string },
): Promise<void> {
  if (isR2Enabled()) {
    const key = `samples/${path.basename(filePath)}`;
    const policy = getServePolicy(category);
    if (policy.mode === "signed") {
      const url = await getSignedDownloadUrl(key, {
        expiresIn: policy.ttlSeconds,
        contentType: meta.contentType,
        contentDisposition: meta.contentDisposition,
      });
      res.redirect(302, url);
    } else {
      await proxyObject(key, req, res, {
        contentType: meta.contentType,
        contentDisposition: meta.contentDisposition,
      });
    }
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: "File not found" });
    return;
  }
  res.sendFile(filePath);
}

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

function parseId(param: unknown, name: string): number {
  if (typeof param !== "string") {
    throw new BadRequestError(`Invalid ${name} parameter`);
  }
  const id = parseInt(param, 10);
  if (isNaN(id)) {
    throw new BadRequestError(`Invalid ${name}`);
  }
  return id;
}

// ============================================
// SAMPLE SECTION CONTROLLER
// ============================================

export const sampleSectionController = {
  // ──────────────────────────────────────────
  // SECTIONS — PUBLIC
  // ──────────────────────────────────────────

  async getAllSections(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const activeOnly = req.query.activeOnly === "true";
      const sections = await sampleService.getAllSections(activeOnly);
      const enriched = sections.map((s) => ({
        ...s,
        samples: (s as any).samples?.map((sample: any) =>
          sampleService.enrichSample(sample),
        ) ?? [],
      }));

      res.status(200).json({
        success: true,
        results: enriched.length,
        data: enriched,
      });
    } catch (error) {
      next(error);
    }
  },

  async getSectionById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseId(req.params.id, "section ID");
      const section = await sampleService.getSectionById(id);
      const enriched = {
        ...section,
        samples: (section as any).samples?.map((sample: any) =>
          sampleService.enrichSample(sample),
        ) ?? [],
      };

      res.status(200).json({
        success: true,
        data: enriched,
      });
    } catch (error) {
      next(error);
    }
  },

  // ──────────────────────────────────────────
  // SECTIONS — ADMIN
  // ──────────────────────────────────────────

  async createSection(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(CreateSampleSectionDto, req.body);
      const section = await sampleService.createSection(dto);

      res.status(201).json({
        success: true,
        message: "Sample section created successfully",
        data: section,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateSection(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseId(req.params.id, "section ID");
      const dto = await validateDto(UpdateSampleSectionDto, req.body);
      const section = await sampleService.updateSection(id, dto);

      res.status(200).json({
        success: true,
        message: "Sample section updated successfully",
        data: section,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteSection(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseId(req.params.id, "section ID");
      await sampleService.deleteSection(id);

      res.status(200).json({
        success: true,
        message: "Sample section deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },

  // ──────────────────────────────────────────
  // SAMPLES — PUBLIC
  // ──────────────────────────────────────────

  async getAllSamples(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const search = req.query.search as string;

      const results = await sampleService.getAllSamples({ page, limit, search });

      res.status(200).json({
        success: true,
        results: results.data.length,
        data: results.data,
        pagination: {
          total: results.total,
          page: results.page,
          limit: results.limit,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getSamplesBySection(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sectionId = parseId(req.params.sectionId, "section ID");
      const samples = await sampleService.getSamplesBySection(sectionId);
      const enriched = samples.map((s) => sampleService.enrichSample(s));

      res.status(200).json({
        success: true,
        results: enriched.length,
        data: enriched,
      });
    } catch (error) {
      next(error);
    }
  },

  async getSampleById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sampleId = parseId(req.params.sampleId, "sample ID");
      const sectionId = req.params.sectionId ? parseId(req.params.sectionId, "section ID") : undefined;
      const sample = await sampleService.getSampleById(sampleId, sectionId);

      res.status(200).json({
        success: true,
        data: sampleService.enrichSample(sample),
      });
    } catch (error) {
      next(error);
    }
  },

  // ──────────────────────────────────────────
  // SAMPLES — ADMIN
  // ──────────────────────────────────────────

  async createSample(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sectionId = parseId(req.params.sectionId, "section ID");

      // Parse product_id from body (may be JSON string in form-data)
      let body = req.body;
      if (typeof body.product_id === "string" && body.product_id.trim() !== "") {
        body = { ...body, product_id: parseInt(body.product_id, 10) };
      }
      const dto = await validateDto(CreateSampleBodyDto, body);

      const files = req.files as
        | {
            thumbnail?: Express.Multer.File[];
            high_quality?: Express.Multer.File[];
            low_quality?: Express.Multer.File[];
          }
        | undefined;
      const thumbnailFile = files?.thumbnail?.[0];
      const highQualityFile = files?.high_quality?.[0];
      const lowQualityFile = files?.low_quality?.[0];

      const sample = await sampleService.createSample(
        sectionId,
        dto.product_id,
        highQualityFile,
        lowQualityFile,
        dto.title,
        thumbnailFile,
      );

      res.status(201).json({
        success: true,
        message: "Sample created successfully",
        data: sampleService.enrichSample(sample),
      });
    } catch (error) {
      next(error);
    }
  },

  async updateSample(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sectionId = parseId(req.params.sectionId, "section ID");
      const sampleId = parseId(req.params.sampleId, "sample ID");

      const dto = await validateDto(UpdateSampleBodyDto, req.body);

      const files = req.files as
        | {
            thumbnail?: Express.Multer.File[];
            high_quality?: Express.Multer.File[];
            low_quality?: Express.Multer.File[];
          }
        | undefined;
      const thumbnailFile = files?.thumbnail?.[0];
      const highQualityFile = files?.high_quality?.[0];
      const lowQualityFile = files?.low_quality?.[0];

      const sample = await sampleService.updateSample(
        sampleId,
        sectionId,
        highQualityFile,
        lowQualityFile,
        dto.title,
        thumbnailFile,
      );

      res.status(200).json({
        success: true,
        message: "Sample updated successfully",
        data: sampleService.enrichSample(sample),
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteSample(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sectionId = parseId(req.params.sectionId, "section ID");
      const sampleId = parseId(req.params.sampleId, "sample ID");

      await sampleService.deleteSample(sampleId, sectionId);

      res.status(200).json({
        success: true,
        message: "Sample deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },

  // ──────────────────────────────────────────
  // SERVE — PREVIEW (high quality, inline, protected from download)
  // ──────────────────────────────────────────

  async servePreview(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sectionId = parseId(req.params.sectionId, "section ID");
      const sampleId = parseId(req.params.sampleId, "sample ID");

      const { path: filePath, mimeType, originalName } =
        await sampleService.getPreviewPath(sampleId, sectionId);

      const disposition = buildContentDisposition("inline", originalName, "sample-file");
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", disposition);
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Download-Options", "noopen");
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Protected preview → proxy (per serving policy).
      await serveSampleFile(req, res, filePath, "sample_high_quality", {
        contentType: mimeType,
        contentDisposition: disposition,
      });
    } catch (error) {
      next(error);
    }
  },

  // ──────────────────────────────────────────
  // SERVE — DOWNLOAD (low quality)
  // ──────────────────────────────────────────

  async serveDownload(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sectionId = parseId(req.params.sectionId, "section ID");
      const sampleId = parseId(req.params.sampleId, "sample ID");

      const { path: filePath, mimeType, originalName } =
        await sampleService.getDownloadPath(sampleId, sectionId);

      const disposition = buildContentDisposition("attachment", originalName, "sample-file");
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", disposition);
      // Downloadable low-quality sample → signed URL (per serving policy).
      await serveSampleFile(req, res, filePath, "sample_low_quality", {
        contentType: mimeType,
        contentDisposition: disposition,
      });
    } catch (error) {
      next(error);
    }
  },
};
