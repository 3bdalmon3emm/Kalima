import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { BadRequestError } from '../../../libs/errors';

// ============================================
// ALLOWED MIME TYPES
// ============================================

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif']);

const SAMPLE_MIME_TYPES = new Set(['application/pdf']);

/** Expanded sample mime types: PDF, images, video, Word, PowerPoint */
const SAMPLE_SECTION_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const SAMPLE_THUMBNAIL_MIME_TYPES = IMAGE_MIME_TYPES;

// ============================================
// FILE FILTER — images only
// ============================================

function imageFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (IMAGE_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(`Invalid file type: ${file.mimetype}. Allowed: jpeg, png, webp, gif, svg, avif`));
  }
}

// ============================================
// MEMORY STORAGE (buffer only — no disk write)
// ============================================

const memoryStorage = multer.memoryStorage();

// ============================================
// FACTORY — creates a multer instance with a given size limit
// ============================================

function createImageUpload(maxSizeMB: number) {
  return multer({
    storage: memoryStorage,
    fileFilter: imageFilter,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  });
}

// ============================================
// PRE-CONFIGURED UPLOAD MIDDLEWARES
// ============================================

/** Single image — 5 MB (product thumbnail, payment method, etc.) */
export const uploadSingleImage = (fieldName: string) => createImageUpload(5).single(fieldName);

/** Multiple images — 5 MB each (product gallery) */
export const uploadMultipleImages = (fieldName: string, maxCount: number) =>
  createImageUpload(5).array(fieldName, maxCount);

/** Single image — 3 MB (profile picture) */
export const uploadProfilePic = (fieldName: string) => createImageUpload(3).single(fieldName);

/** Custom size — for special use cases */
export const uploadImageWithLimit = (fieldName: string, maxSizeMB: number) =>
  createImageUpload(maxSizeMB).single(fieldName);

// ============================================
// PRODUCT CREATE — thumbnail + sample (PDF)
// ============================================

function productWithSampleFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (file.fieldname === 'thumbnail') {
    return imageFilter(_req, file, cb);
  }
  if (file.fieldname === 'high_quality' || file.fieldname === 'low_quality') {
    if (SAMPLE_SECTION_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestError(
          `Invalid file type for ${file.fieldname}. Allowed: PDF, images, video, Word, or PowerPoint`,
        ) as any,
        false,
      );
    }
    return;
  }
  cb(null, true);
}

/** Product create: thumbnail (image) + sample files (high/low quality). Max 150 MB per file. */
export const uploadProductWithSample = multer({
  storage: memoryStorage,
  fileFilter: productWithSampleFilter,
  limits: { fileSize: 150 * 1024 * 1024 },
}).fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'high_quality', maxCount: 1 },
  { name: 'low_quality', maxCount: 1 },
]);

/** Product update: sample files (high/low quality). Max 150 MB. For multipart PATCH. */
function sampleOnlyFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (
    (file.fieldname === 'high_quality' || file.fieldname === 'low_quality') &&
    SAMPLE_SECTION_MIME_TYPES.has(file.mimetype)
  ) {
    cb(null, true);
  } else if (file.fieldname === 'high_quality' || file.fieldname === 'low_quality') {
    cb(
      new BadRequestError(
        `Invalid file type for ${file.fieldname}. Allowed: PDF, images, video, Word, or PowerPoint`,
      ) as any,
      false,
    );
  } else {
    cb(null, true);
  }
}

export const uploadProductUpdate = multer({
  storage: memoryStorage,
  fileFilter: sampleOnlyFilter,
  limits: { fileSize: 150 * 1024 * 1024 },
}).fields([
  { name: 'high_quality', maxCount: 1 },
  { name: 'low_quality', maxCount: 1 },
]);

// ============================================
// FAST BUY — payment screenshot + optional product image
// ============================================

export const uploadFastBuy = createImageUpload(5).fields([
  { name: 'payment_screenshot', maxCount: 1 },
  { name: 'product_image', maxCount: 1 },
]);

// ============================================
// SAMPLE FILES — high_quality + low_quality (PDF, images, video, Word, PowerPoint)
// ============================================

function sampleFilesFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (
    (file.fieldname === 'high_quality' || file.fieldname === 'low_quality') &&
    SAMPLE_SECTION_MIME_TYPES.has(file.mimetype)
  ) {
    cb(null, true);
  } else if (file.fieldname === 'thumbnail' && SAMPLE_THUMBNAIL_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        `Invalid file type for ${file.fieldname}: ${file.mimetype}. Allowed: PDF, images, video, Word, PowerPoint, or thumbnail image`,
      ) as any,
      false,
    );
  }
}

/** Sample create/update: high_quality and/or low_quality files. Max 150 MB per file. */
export const uploadSampleFiles = multer({
  storage: memoryStorage,
  fileFilter: sampleFilesFilter,
  limits: { fileSize: 300 * 1024 * 1024 },
}).fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'high_quality', maxCount: 1 },
  { name: 'low_quality', maxCount: 1 },
]);

// ============================================
// GALLERY VIDEO — single video upload (mp4, webm, quicktime)
// ============================================

const GALLERY_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function galleryVideoFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (GALLERY_VIDEO_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(`Invalid video type: ${file.mimetype}. Allowed: mp4, webm, quicktime`) as any, false);
  }
}

/** Single gallery video upload. Max 100 MB. */
export const uploadGalleryVideo = multer({
  storage: memoryStorage,
  fileFilter: galleryVideoFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single('video');
