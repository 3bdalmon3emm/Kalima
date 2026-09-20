import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { BadRequestError } from '../../../libs/errors';

const DOCUMENT_MIME_TYPES = new Set(['application/pdf']);

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg']);

const AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4']);

const SAFE_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

const HOTSPOT_MEDIA_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
  ...AUDIO_MIME_TYPES,
  ...SAFE_ATTACHMENT_MIME_TYPES,
]);

const FALLBACK_MIME_TYPES = new Set(['application/octet-stream', 'application/zip', 'application/x-zip-compressed']);

const MIME_ALLOWED_EXTS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/avif': ['.avif'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov', '.qt'],
  'video/x-m4v': ['.m4v', '.mp4'],
  'video/ogg': ['.ogv', '.ogg'],
  'audio/mpeg': ['.mp3'],
  'audio/mp3': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/webm': ['.webm'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a', '.mp4'],
};

const HOTSPOT_FALLBACK_EXTS = new Set(Object.values(MIME_ALLOWED_EXTS).flat());

function hasAllowedExtension(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = MIME_ALLOWED_EXTS[file.mimetype];
  return !allowed || !ext || allowed.includes(ext);
}

function hasAllowedFallbackExtension(file: Express.Multer.File): boolean {
  if (!FALLBACK_MIME_TYPES.has(file.mimetype)) return false;
  const ext = path.extname(file.originalname).toLowerCase();
  return Boolean(ext && HOTSPOT_FALLBACK_EXTS.has(ext));
}

const E_BOOKLET_UPLOAD_ROOT = path.resolve(
  process.env.E_BOOKLET_UPLOAD_DIR || process.cwd(),
  process.env.E_BOOKLET_UPLOAD_DIR ? '' : 'uploads/e-booklets/private',
);
const E_BOOKLET_TEMP_UPLOAD_DIR = path.join(E_BOOKLET_UPLOAD_ROOT, '.tmp');

function ensureTempUploadDir(): void {
  fs.mkdirSync(E_BOOKLET_TEMP_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureTempUploadDir();
      cb(null, E_BOOKLET_TEMP_UPLOAD_DIR);
    } catch (error) {
      cb(error as Error, E_BOOKLET_TEMP_UPLOAD_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.upload';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

function documentFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (DOCUMENT_MIME_TYPES.has(file.mimetype) && hasAllowedExtension(file)) {
    cb(null, true);
    return;
  }

  cb(new BadRequestError(`Invalid document type: ${file.mimetype}. Allowed: PDF only`));
}

function coverFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (IMAGE_MIME_TYPES.has(file.mimetype) && hasAllowedExtension(file)) {
    cb(null, true);
    return;
  }

  cb(new BadRequestError(`Invalid cover image type: ${file.mimetype}. Allowed: jpeg, png, webp, gif, avif`));
}

function hotspotMediaFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if ((HOTSPOT_MEDIA_MIME_TYPES.has(file.mimetype) && hasAllowedExtension(file)) || hasAllowedFallbackExtension(file)) {
    cb(null, true);
    return;
  }

  cb(
    new BadRequestError(
      `Invalid hotspot media type: ${file.mimetype}. Allowed: image, video, audio, PDF, or safe office attachment`,
    ),
  );
}

export const uploadEBookletDocument = multer({
  storage,
  fileFilter: documentFilter,
  limits: { fileSize: 400 * 1024 * 1024 },
}).single('document');

export const uploadEBookletCover = multer({
  storage,
  fileFilter: coverFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('cover');

export const uploadEBookletHotspotMedia = multer({
  storage,
  fileFilter: hotspotMediaFilter,
  limits: { fileSize: 1024 * 1024 * 1024 },
}).single('media');

export const uploadEBookletTemplateWizardFiles = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'cover') {
      coverFilter(req, file, cb);
      return;
    }
    if (file.fieldname === 'document') {
      documentFilter(req, file, cb);
      return;
    }
    cb(new BadRequestError(`Unexpected e-booklet upload field: ${file.fieldname}`));
  },
  limits: { fileSize: 400 * 1024 * 1024 },
}).fields([
  { name: 'cover', maxCount: 1 },
  { name: 'document', maxCount: 1 },
]);
