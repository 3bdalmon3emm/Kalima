import path from "path";
import { promises as fsPromises } from "fs";
import crypto from "crypto";
import sharp from "sharp";
import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import { images, image_mime_type_enum } from "../generated/prisma/client";
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

/** All images go into a single flat folder */
const UPLOAD_DIR = resolveUploadPath("images");

/** Maps browser mime types → our DB enum */
const MIME_TO_ENUM: Record<string, image_mime_type_enum> = {
  "image/jpeg": image_mime_type_enum.jpeg,
  "image/png": image_mime_type_enum.png,
  "image/webp": image_mime_type_enum.webp,
  "image/gif": image_mime_type_enum.gif,
  "image/svg+xml": image_mime_type_enum.svg,
  "image/avif": image_mime_type_enum.avif,
};

/** Maps our DB enum → file extension. */
const ENUM_TO_EXT: Record<image_mime_type_enum, string> = {
  [image_mime_type_enum.jpeg]: ".jpeg",
  [image_mime_type_enum.png]: ".png",
  [image_mime_type_enum.webp]: ".webp",
  [image_mime_type_enum.gif]: ".gif",
  [image_mime_type_enum.svg]: ".svg",
  [image_mime_type_enum.avif]: ".avif",
};

function extensionForImage(file: Express.Multer.File, mimeEnum: image_mime_type_enum): string {
  const originalExt = path.extname(file.originalname).toLowerCase();
  if (mimeEnum === image_mime_type_enum.jpeg && [".jpg", ".jpeg"].includes(originalExt)) {
    return originalExt;
  }
  return ENUM_TO_EXT[mimeEnum];
}

// ============================================
// TYPES
// ============================================

export interface UploadImageOptions {
  /** Compress while preserving the uploaded image format. Default: false */
  compress?: boolean;
  /** Sharp quality 1–100 (only when compress=true). Default: 75 */
  quality?: number;
  /** Resize width (only when compress=true). Null = keep original. */
  width?: number;
  /** Resize height (only when compress=true). Null = keep original. */
  height?: number;
}

// ============================================
// IMAGE SERVICE (internal — no controller)
// ============================================

export class ImageService {
  private initPromise: Promise<unknown> | null = null;

  constructor(private db: PrismaClient = prisma) {}

  private async ensureUploadDir(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = fsPromises.mkdir(UPLOAD_DIR, { recursive: true });
    }
    await this.initPromise;
  }

  // ============================================
  // UPLOAD SINGLE IMAGE
  // ============================================

  /**
   * Saves a multer file buffer to disk, optionally compresses it,
   * and creates an `images` record in the database.
   *
   * @param file - Express.Multer.File (from memoryStorage — has `.buffer`)
   * @param options - compression / resize options
   * @returns The created `images` record
   */
  async uploadImage(
    file: Express.Multer.File,
    options: UploadImageOptions = {},
  ): Promise<images> {
    const { compress = false, quality = 75, width, height } = options;

    const mimeEnum = MIME_TO_ENUM[file.mimetype];
    if (!mimeEnum) {
      throw new BadRequestError(`Unsupported image type: ${file.mimetype}`);
    }

    // Generate unique filename
    const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    let finalBuffer: Buffer;
    let finalMime: image_mime_type_enum;
    let ext: string;

    if (compress && file.mimetype !== "image/svg+xml") {
      // Re-encode in the original format so compression never changes the
      // file type advertised to callers or the extension used on disk.
      let pipeline = sharp(file.buffer);
      if (width || height) {
        pipeline = pipeline.resize(width, height, { fit: "inside" });
      }

      switch (file.mimetype) {
        case "image/jpeg":
          pipeline = pipeline.jpeg({ quality });
          break;
        case "image/png":
          pipeline = pipeline.png({ compressionLevel: 9 });
          break;
        case "image/webp":
          pipeline = pipeline.webp({ quality });
          break;
        case "image/gif":
          pipeline = pipeline.gif();
          break;
        case "image/avif":
          pipeline = pipeline.avif({ quality });
          break;
      }

      finalBuffer = await pipeline.toBuffer();
      finalMime = mimeEnum;
      ext = extensionForImage(file, mimeEnum);
    } else {
      // Store as-is
      finalBuffer = file.buffer;
      finalMime = mimeEnum;
      ext = extensionForImage(file, mimeEnum);
    }

    const filename = `${uniqueId}${ext}`;

    if (isR2Enabled()) {
      await putObject({
        key: `images/${filename}`,
        body: finalBuffer,
        contentType: file.mimetype,
      });
    } else {
      const filePath = path.join(UPLOAD_DIR, filename);
      await this.ensureUploadDir();
      await fsPromises.writeFile(filePath, finalBuffer);
    }

    // Relative URL — same shape whether stored on disk or R2; the /uploads
    // route resolves it to the right backend.
    const url = `/uploads/images/${filename}`;

    // Create DB record
    const image = await this.db.images.create({
      data: {
        url,
        original_name: normalizeOriginalFilename(file.originalname, "image"),
        mime_type: finalMime,
        size: finalBuffer.length,
      },
    });

    return image;
  }

  // ============================================
  // UPLOAD MULTIPLE IMAGES
  // ============================================

  /**
   * Uploads multiple files. Returns all created image records.
   */
  async uploadImages(
    files: Express.Multer.File[],
    options: UploadImageOptions = {},
  ): Promise<images[]> {
    return Promise.all(files.map((file) => this.uploadImage(file, options)));
  }

  // ============================================
  // GET IMAGE BY ID
  // ============================================

  async getImageById(id: number): Promise<images> {
    const image = await this.db.images.findUnique({ where: { id } });
    if (!image) {
      throw new NotFoundError("Image not found");
    }
    return image;
  }

  // ============================================
  // DELETE IMAGE (DB + disk)
  // ============================================

  /**
   * Deletes an image record from the database and removes the file from disk.
   */
  async deleteImage(id: number): Promise<void> {
    const image = await this.db.images.findUnique({ where: { id } });
    if (!image) {
      throw new NotFoundError("Image not found");
    }

    // Delete file from disk
    this.removeFileFromDisk(image.url);

    // Delete DB record (cascades remove product_gallery entries, nullifies product thumbnail_id)
    await this.db.images.delete({ where: { id } });
  }

  // ============================================
  // DELETE IMAGE FILE ONLY (disk cleanup helper)
  // ============================================

  /**
   * Removes a file from disk by its URL path.
   * Does not throw if the file doesn't exist (already cleaned up).
   */
  removeFileFromDisk(url: string): void {
    if (isR2Enabled()) {
      void deleteObject(normalizeStorageKey(url)).catch((error) => {
        console.error(`[storage] R2 delete failed for ${url}:`, error);
      });
      return;
    }
    const absolutePath = resolveUploadedUrlPath(url);
    void fsPromises.unlink(absolutePath).catch(() => {});
  }

  // ============================================
  // REPLACE IMAGE (upload new + delete old)
  // ============================================

  /**
   * Uploads a new image and deletes the old one (both DB record and file).
   * Useful for updating a product thumbnail or profile pic.
   *
   * @param oldImageId - ID of the image to replace (null if no previous image)
   * @param file - new file to upload
   * @param options - compression options
   * @returns The new image record
   */
  async replaceImage(
    oldImageId: number | null,
    file: Express.Multer.File,
    options: UploadImageOptions = {},
  ): Promise<images> {
    const newImage = await this.uploadImage(file, options);

    if (oldImageId) {
      try {
        await this.deleteImage(oldImageId);
      } catch {
        // Old image may already be gone — that's fine
      }
    }

    return newImage;
  }
}

export const imageService = new ImageService();
