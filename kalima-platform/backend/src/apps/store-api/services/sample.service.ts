import path from "path";
import { promises as fsPromises } from "fs";
import crypto from "crypto";
import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import {
  samples,
  sample_sections,
  sample_media_type_enum,
} from "../generated/prisma/client";
import { normalizeOriginalFilename } from "../utils/filename";
import { NotFoundError, BadRequestError } from "../../../libs/errors";
import { resolveUploadedUrlPath, resolveUploadPath } from "../../../libs/uploadsRoot";
import {
  isR2Enabled,
  putObject,
  deleteObject,
  normalizeStorageKey,
} from "../../../libs/storage";

// ============================================
// CONSTANTS
// ============================================

const UPLOAD_DIR = resolveUploadPath("samples");

const SAMPLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const THUMBNAIL_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);

const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024;

const MIME_TO_MEDIA_TYPE: Record<string, sample_media_type_enum> = {
  "application/pdf": sample_media_type_enum.pdf,
  "image/jpeg": sample_media_type_enum.image,
  "image/png": sample_media_type_enum.image,
  "image/webp": sample_media_type_enum.image,
  "image/gif": sample_media_type_enum.image,
  "video/mp4": sample_media_type_enum.video,
  "video/webm": sample_media_type_enum.video,
  "video/quicktime": sample_media_type_enum.video,
  "application/msword": sample_media_type_enum.word,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    sample_media_type_enum.word,
  "application/vnd.ms-powerpoint": sample_media_type_enum.powerpoint,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    sample_media_type_enum.powerpoint,
};

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
};

const EXT_TO_MIME = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mimeType, ext]) => [ext, mimeType]),
) as Record<string, string>;

const DISPLAYABLE_MEDIA_TYPES = new Set<sample_media_type_enum>([
  sample_media_type_enum.pdf,
  sample_media_type_enum.image,
  sample_media_type_enum.video,
]);

// ============================================
// TYPES
// ============================================

export interface CreateSampleSectionInput {
  title: string;
  description?: string;
  sort_order?: number;
  active?: boolean;
}

export interface UpdateSampleSectionInput {
  title?: string;
  description?: string;
  sort_order?: number;
  active?: boolean;
}

export interface CreateSampleInput {
  product_id: number;
  media_type: sample_media_type_enum;
  original_name: string;
  mime_type: string;
  size: number;
  thumbnail_url?: string;
  high_quality_url?: string;
  low_quality_url?: string;
}

const SAMPLE_LIST_SELECT = {
  id: true,
  media_type: true,
  title: true,
  thumbnail_url: true,
  high_quality_url: true,
  low_quality_url: true,
  original_name: true,
  mime_type: true,
  size: true,
  created_at: true,
  products: {
    select: {
      id: true,
      title: true,
    },
  },
};

const SAMPLE_SECTION_SAFE_SELECT = {
  id: true,
  title: true,
  description: true,
  sort_order: true,
  active: true,
  created_at: true,
  updated_at: true,
} as const;

interface SampleListFilters {
  search?: string;
  page?: number;
  limit?: number;
}

interface SampleResponse {
  id: number;
  media_type: sample_media_type_enum;
  title: string | null;
  thumbnail_url: string | null;
  high_quality_url: string | null;
  low_quality_url: string | null;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: Date | null;
  products?: {
    id: number;
    title: string;
  } | null;
  is_displayable?: boolean;
  thumbnail?: string | null;
}

interface SampleListResponse {
  data: SampleResponse[];
  total: number;
  page: number;
  limit: number;
}

const SAMPLE_PRODUCT_SELECT = {
  id: true,
  title: true,
  type: true,
  price: true,
  price_after_discount: true,
  serial: true,
  thumbnail_image: true,
};

// ============================================
// SAMPLE SERVICE
// ============================================

export class SampleService {
  private initPromise: Promise<unknown> | null = null;

  constructor(private db: PrismaClient = prisma) {}

  private async ensureUploadDir(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = fsPromises.mkdir(UPLOAD_DIR, { recursive: true });
    }
    await this.initPromise;
  }

  /** Derive is_displayable from media_type (not stored in DB) */
  isDisplayable(mediaType: sample_media_type_enum): boolean {
    return DISPLAYABLE_MEDIA_TYPES.has(mediaType);
  }

  /** Save file buffer to disk and return the URL path */
  async saveFileToDisk(
    buffer: Buffer,
    mimeType: string,
    fieldName: string,
  ): Promise<string> {
    const ext = MIME_TO_EXT[mimeType] || path.extname(fieldName) || ".bin";
    const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const filename = `${uniqueId}-${fieldName}${ext}`;

    if (isR2Enabled()) {
      await putObject({
        key: `samples/${filename}`,
        body: buffer,
        contentType: mimeType,
      });
    } else {
      const filePath = path.join(UPLOAD_DIR, filename);
      await this.ensureUploadDir();
      await fsPromises.writeFile(filePath, buffer);
    }

    return `/uploads/samples/${filename}`;
  }

  /** Remove a stored sample file (R2 or disk) by its URL. Best-effort. */
  private removeStoredFile(url: string): void {
    if (isR2Enabled()) {
      void deleteObject(normalizeStorageKey(url)).catch((error) => {
        console.error(`[storage] R2 delete failed for ${url}:`, error);
      });
      return;
    }
    void fsPromises.unlink(this.urlToAbsolutePath(url)).catch(() => {});
  }

  /** Resolve URL to absolute filesystem path */
  urlToAbsolutePath(url: string): string {
    return resolveUploadedUrlPath(url);
  }

  private getMimeTypeForFile(filePath: string, fallbackMimeType: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return EXT_TO_MIME[ext] || fallbackMimeType;
  }

  private getDownloadFileName(originalName: string, filePath: string): string {
    const fileExt = path.extname(filePath) || path.extname(originalName);
    const originalExt = path.extname(originalName);
    const originalBase = path.basename(originalName, originalExt) || "sample";
    const lowQualityBase = originalBase
      .replace(/[-_\s]*high[-_\s]*quality/gi, "")
      .replace(/[-_\s]*low[-_\s]*quality/gi, "")
      .trim() || "sample";

    return `${lowQualityBase}-low-quality${fileExt}`;
  }

  // ============================================
  // SAMPLE SECTIONS — CRUD
  // ============================================

  async getAllSections(activeOnly = false): Promise<sample_sections[]> {
    const where = activeOnly ? { active: true } : {};
    return this.db.sample_sections.findMany({
      where,
      include: {
        samples: {
          include: { products: { select: { id: true, title: true } } },
        },
      },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
    });
  }

  async getSectionById(id: number): Promise<sample_sections> {
    const section = await this.db.sample_sections.findUnique({
      where: { id },
      include: {
        samples: {
          include: { products: { select: { id: true, title: true } } },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!section) {
      throw new NotFoundError("Sample section not found");
    }

    return section;
  }

  async createSection(
    data: CreateSampleSectionInput,
  ): Promise<sample_sections> {
    const sortOrder = data.sort_order ?? 0;

    return this.db.$transaction(async (tx) => {
      if (sortOrder > 0) {
        await tx.sample_sections.updateMany({
          where: { sort_order: { gte: sortOrder } },
          data: { sort_order: { increment: 1 } },
        });
      }

      return tx.sample_sections.create({
        data: {
          title: data.title,
          description: data.description,
          sort_order: sortOrder,
          active: data.active ?? true,
        },
        select: SAMPLE_SECTION_SAFE_SELECT,
      });
    });
  }

  async updateSection(
    id: number,
    data: UpdateSampleSectionInput,
  ): Promise<sample_sections> {
    const section = await this.db.sample_sections.findUnique({
      where: { id },
      select: { id: true, sort_order: true },
    });
    if (!section) {
      throw new NotFoundError("Sample section not found");
    }

    const currentSortOrder = section.sort_order ?? 0;
    const nextSortOrder = data.sort_order ?? currentSortOrder;

    return this.db.$transaction(async (tx) => {
      if (nextSortOrder > currentSortOrder) {
        await tx.sample_sections.updateMany({
          where: {
            id: { not: id },
            sort_order: { gt: currentSortOrder, lte: nextSortOrder },
          },
          data: { sort_order: { decrement: 1 } },
        });
      } else if (nextSortOrder < currentSortOrder) {
        await tx.sample_sections.updateMany({
          where: {
            id: { not: id },
            sort_order: { gte: nextSortOrder, lt: currentSortOrder },
          },
          data: { sort_order: { increment: 1 } },
        });
      }

      return tx.sample_sections.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.sort_order !== undefined && { sort_order: nextSortOrder }),
          ...(data.active !== undefined && { active: data.active }),
          updated_at: new Date(),
        },
        select: SAMPLE_SECTION_SAFE_SELECT,
      });
    });
  }

  async deleteSection(id: number): Promise<void> {
    const section = await this.db.sample_sections.findUnique({
      where: { id },
      include: { samples: true },
    });

    if (!section) {
      throw new NotFoundError("Sample section not found");
    }

    // Delete file assets for all samples
    for (const sample of section.samples) {
      if (sample.high_quality_url) {
        this.removeStoredFile(sample.high_quality_url);
      }
      if (sample.low_quality_url) {
        this.removeStoredFile(sample.low_quality_url);
      }
      if (sample.thumbnail_url) {
        this.removeStoredFile(sample.thumbnail_url);
      }
    }

    await this.db.sample_sections.delete({ where: { id } });
  }

  async getAllSamples(
    filters?: SampleListFilters,
  ): Promise<SampleListResponse> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters?.search) {
      where.OR = [
        { original_name: { contains: filters.search, mode: "insensitive" } },
        {
          products: {
            title: { contains: filters.search, mode: "insensitive" },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.db.samples.findMany({
        where,
        select: SAMPLE_LIST_SELECT,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.samples.count({ where }),
    ]);

    const enrichedData = data.map((sample: any) => this.enrichSample(sample));

    return {
      data: enrichedData,
      total: total,
      page,
      limit,
    };
  }

  // ============================================
  // SAMPLES — CRUD
  // ============================================

  async getSamplesBySection(sectionId: number): Promise<samples[]> {
    const section = await this.db.sample_sections.findUnique({
      where: { id: sectionId },
      select: { id: true },
    });

    if (!section) {
      throw new NotFoundError("Sample section not found");
    }

    return this.db.samples.findMany({
      where: { section_id: sectionId },
      include: { products: { select: SAMPLE_PRODUCT_SELECT } },
      orderBy: { id: "asc" },
    });
  }

  async getSampleById(sampleId: number, sectionId?: number): Promise<samples> {
    const where: { id: number; section_id?: number } = { id: sampleId };
    if (sectionId !== undefined) {
      where.section_id = sectionId;
    }

    const sample = await this.db.samples.findFirst({
      where,
      include: {
        products: { select: SAMPLE_PRODUCT_SELECT },
        sample_sections: { select: { id: true, title: true } },
      },
    });

    if (!sample) {
      throw new NotFoundError("Sample not found");
    }

    return sample;
  }

  async createSample(
    sectionId: number,
    productId: number | undefined,
    highQualityFile?: Express.Multer.File,
    lowQualityFile?: Express.Multer.File,
    title?: string,
    thumbnailFile?: Express.Multer.File,
  ): Promise<samples> {
    if (!highQualityFile && !lowQualityFile) {
      throw new BadRequestError(
        "At least one of high_quality or low_quality file must be provided",
      );
    }

    // Validate mime types eagerly before any I/O
    if (
      highQualityFile?.buffer &&
      !SAMPLE_MIME_TYPES.has(highQualityFile.mimetype)
    ) {
      throw new BadRequestError(
        `Invalid high_quality file type: ${highQualityFile.mimetype}. Allowed: PDF, images, video, Word, PowerPoint`,
      );
    }
    if (
      lowQualityFile?.buffer &&
      !SAMPLE_MIME_TYPES.has(lowQualityFile.mimetype)
    ) {
      throw new BadRequestError(
        `Invalid low_quality file type: ${lowQualityFile.mimetype}. Allowed: PDF, images, video, Word, PowerPoint`,
      );
    }
    if (thumbnailFile?.buffer) {
      if (!THUMBNAIL_MIME_TYPES.has(thumbnailFile.mimetype)) {
        throw new BadRequestError(
          `Invalid thumbnail file type: ${thumbnailFile.mimetype}. Allowed: images only`,
        );
      }
      if (thumbnailFile.buffer.length > MAX_THUMBNAIL_SIZE_BYTES) {
        throw new BadRequestError("Thumbnail image must be 5MB or smaller");
      }
    }

    // Verify section + product exist in parallel
    const [section, product] = await Promise.all([
      this.db.sample_sections.findUnique({ where: { id: sectionId } }),
      productId !== undefined
        ? this.db.products.findFirst({
            where: { id: productId, deleted_at: null },
          })
        : Promise.resolve(null),
    ]);
    if (!section) throw new NotFoundError("Sample section not found");
    if (productId !== undefined && !product) throw new NotFoundError("Product not found");

    // Determine metadata from primary file
    const primaryFile = highQualityFile?.buffer
      ? highQualityFile
      : lowQualityFile!;
    const mediaType =
      MIME_TO_MEDIA_TYPE[primaryFile.mimetype] ?? sample_media_type_enum.pdf;
    const originalName = normalizeOriginalFilename(primaryFile.originalname, "sample-file");
    const mimeType = primaryFile.mimetype;
    const size = primaryFile.buffer!.length;

    // Write files to disk in parallel when both are provided
    const fileWrites: Promise<string | null>[] = [
      thumbnailFile?.buffer
        ? this.saveFileToDisk(
            thumbnailFile.buffer,
            thumbnailFile.mimetype,
            "thumbnail",
          )
        : Promise.resolve(null),
      highQualityFile?.buffer
        ? this.saveFileToDisk(
            highQualityFile.buffer,
            highQualityFile.mimetype,
            "high_quality",
          )
        : Promise.resolve(null),
      lowQualityFile?.buffer
        ? this.saveFileToDisk(
            lowQualityFile.buffer,
            lowQualityFile.mimetype,
            "low_quality",
          )
        : Promise.resolve(null),
    ];
    const [thumbnailUrl, highQualityUrl, lowQualityUrl] =
      await Promise.all(fileWrites);

    return this.db.samples.create({
      data: {
        section_id: sectionId,
        product_id: productId,
        title,
        media_type: mediaType,
        original_name: originalName,
        mime_type: mimeType,
        size,
        thumbnail_url: thumbnailUrl,
        high_quality_url: highQualityUrl,
        low_quality_url: lowQualityUrl,
      },
      include: {
        products: { select: { id: true, title: true } },
        sample_sections: { select: { id: true, title: true } },
      },
    });
  }

  async updateSample(
    sampleId: number,
    sectionId: number,
    highQualityFile?: Express.Multer.File,
    lowQualityFile?: Express.Multer.File,
    title?: string,
    thumbnailFile?: Express.Multer.File,
  ): Promise<samples> {
    const sample = await this.db.samples.findFirst({
      where: { id: sampleId, section_id: sectionId },
    });

    if (!sample) {
      throw new NotFoundError("Sample not found");
    }

    let highQualityUrl = sample.high_quality_url;
    let lowQualityUrl = sample.low_quality_url;
    let thumbnailUrl = sample.thumbnail_url;
    let originalName = sample.original_name;
    let mimeType = sample.mime_type;
    let size = sample.size;

    if (highQualityFile?.buffer) {
      if (!SAMPLE_MIME_TYPES.has(highQualityFile.mimetype)) {
        throw new BadRequestError(
          `Invalid high_quality file type: ${highQualityFile.mimetype}`,
        );
      }
      if (sample.high_quality_url) {
        this.removeStoredFile(sample.high_quality_url);
      }
      highQualityUrl = await this.saveFileToDisk(
        highQualityFile.buffer,
        highQualityFile.mimetype,
        "high_quality",
      );
      originalName = normalizeOriginalFilename(highQualityFile.originalname, originalName);
      mimeType = highQualityFile.mimetype;
      size = highQualityFile.buffer.length;
    }

    if (lowQualityFile?.buffer) {
      if (!SAMPLE_MIME_TYPES.has(lowQualityFile.mimetype)) {
        throw new BadRequestError(
          `Invalid low_quality file type: ${lowQualityFile.mimetype}`,
        );
      }
      if (sample.low_quality_url) {
        this.removeStoredFile(sample.low_quality_url);
      }
      lowQualityUrl = await this.saveFileToDisk(
        lowQualityFile.buffer,
        lowQualityFile.mimetype,
        "low_quality",
      );
      if (!highQualityUrl) {
        originalName = normalizeOriginalFilename(lowQualityFile.originalname, originalName);
        mimeType = lowQualityFile.mimetype;
        size = lowQualityFile.buffer.length;
      }
    }

    if (thumbnailFile?.buffer) {
      if (!THUMBNAIL_MIME_TYPES.has(thumbnailFile.mimetype)) {
        throw new BadRequestError(
          `Invalid thumbnail file type: ${thumbnailFile.mimetype}. Allowed: images only`,
        );
      }
      if (thumbnailFile.buffer.length > MAX_THUMBNAIL_SIZE_BYTES) {
        throw new BadRequestError("Thumbnail image must be 5MB or smaller");
      }
      if (thumbnailUrl) {
        this.removeStoredFile(thumbnailUrl);
      }
      thumbnailUrl = await this.saveFileToDisk(
        thumbnailFile.buffer,
        thumbnailFile.mimetype,
        "thumbnail",
      );
    }

    return this.db.samples.update({
      where: { id: sampleId },
      data: {
        ...(title !== undefined && { title }),
        thumbnail_url: thumbnailUrl,
        high_quality_url: highQualityUrl,
        low_quality_url: lowQualityUrl,
        original_name: originalName,
        mime_type: mimeType,
        size,
        updated_at: new Date(),
      },
      include: {
        products: { select: { id: true, title: true } },
        sample_sections: { select: { id: true, title: true } },
      },
    });
  }

  async deleteSample(sampleId: number, sectionId?: number): Promise<void> {
    const where: { id: number; section_id?: number } = { id: sampleId };
    if (sectionId !== undefined) {
      where.section_id = sectionId;
    }

    const sample = await this.db.samples.findFirst({ where });

    if (!sample) {
      throw new NotFoundError("Sample not found");
    }

    if (sample.high_quality_url) {
      this.removeStoredFile(sample.high_quality_url);
    }
    if (sample.low_quality_url) {
      this.removeStoredFile(sample.low_quality_url);
    }
    if (sample.thumbnail_url) {
      this.removeStoredFile(sample.thumbnail_url);
    }

    await this.db.samples.delete({ where: { id: sampleId } });
  }

  /** Get the file path for preview (high quality - protected, no download) */
  async getPreviewPath(
    sampleId: number,
    sectionId?: number,
  ): Promise<{
    path: string;
    mimeType: string;
    originalName: string;
  }> {
    const sample = (await this.getSampleById(
      sampleId,
      sectionId,
    )) as samples & { high_quality_url?: string | null };

    if (!sample.high_quality_url) {
      throw new NotFoundError("No preview available for this sample");
    }

    const absolutePath = this.urlToAbsolutePath(sample.high_quality_url);

    return {
      path: absolutePath,
      mimeType: sample.mime_type,
      originalName: sample.original_name,
    };
  }

  /** Get the file path for download (low quality) */
  async getDownloadPath(
    sampleId: number,
    sectionId?: number,
  ): Promise<{
    path: string;
    mimeType: string;
    originalName: string;
  }> {
    const sample = (await this.getSampleById(
      sampleId,
      sectionId,
    )) as samples & { low_quality_url?: string | null };

    if (!sample.low_quality_url) {
      throw new NotFoundError("No download available for this sample");
    }

    const absolutePath = this.urlToAbsolutePath(sample.low_quality_url);

    return {
      path: absolutePath,
      mimeType: this.getMimeTypeForFile(absolutePath, sample.mime_type),
      originalName: this.getDownloadFileName(sample.original_name, absolutePath),
    };
  }

  /** Enrich sample with computed is_displayable and thumbnail (for API responses) */
  enrichSample<T extends { media_type: sample_media_type_enum; thumbnail_url?: string | null; high_quality_url?: string | null; low_quality_url?: string | null }>(
    sample: T,
  ): T & { is_displayable: boolean; thumbnail: string | null } {
    return {
      ...sample,
      is_displayable: this.isDisplayable(sample.media_type),
      thumbnail: sample.thumbnail_url || null,
    };
  }
}

export const sampleService = new SampleService();
