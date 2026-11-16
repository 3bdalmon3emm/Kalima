import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";
import multer, { FileFilterCallback } from "multer";
import { NextFunction, Request, Response } from "express";
import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { optimizeImage } from "../../../libs/imageOptimize";
import { isR2Enabled, putObject, deleteObject, getSignedDownloadUrl, getServePolicy } from "../../../libs/storage";
import { resolveUploadPath } from "../../../libs/uploadsRoot";
import { foldersService } from "./folders.service";

// Images and audio of questions. Stored on R2 (or the local uploads folder in
// development) under question-bank/<bank id>/images|audio/. Copies of a
// question point at the same media rows, so nothing is uploaded twice.

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/avif"]);
const AUDIO_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/ogg",
  "audio/webm", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/m4a",
]);
const IMAGE_MAX_MB = 50;
const AUDIO_MAX_MB = 30;
const IMAGE_MAX_WIDTH = 1600;

const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav",
  "audio/wave": ".wav", "audio/ogg": ".ogg", "audio/webm": ".webm", "audio/mp4": ".m4a",
  "audio/aac": ".aac", "audio/x-m4a": ".m4a", "audio/m4a": ".m4a",
};
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "image/svg+xml": ".svg", "image/avif": ".avif",
};

function mediaFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (IMAGE_TYPES.has(file.mimetype) || AUDIO_TYPES.has(file.mimetype)) cb(null, true);
  else cb(new BadRequestError("Only images and audio files can be uploaded") as any);
}

// The image limit is the larger one; audio is checked again below.
const receiveFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: mediaFilter,
  limits: { fileSize: IMAGE_MAX_MB * 1024 * 1024 },
}).single("file");

export function uploadQuestionMedia(req: Request, res: Response, next: NextFunction) {
  receiveFile(req, res, (err: any) => {
    if (err?.code === "LIMIT_FILE_SIZE") return next(new BadRequestError(`Files must be ${IMAGE_MAX_MB} MB or smaller`));
    next(err);
  });
}

// Photos of handwritten essay answers and celebration sounds: one file per
// request, smaller limits than the bank.
const STUDENT_PHOTO_MAX_MB = 20;
const SOUND_MAX_MB = 10;

function singleFile(filter: (mime: string) => boolean, maxMb: number, wrongType: string) {
  const receive = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => (filter(file.mimetype) ? cb(null, true) : cb(new BadRequestError(wrongType) as any)),
    limits: { fileSize: maxMb * 1024 * 1024 },
  }).single("file");
  return (req: Request, res: Response, next: NextFunction) => {
    receive(req, res, (err: any) => {
      if (err?.code === "LIMIT_FILE_SIZE") return next(new BadRequestError(`Files must be ${maxMb} MB or smaller`));
      next(err);
    });
  };
}

export const uploadAnswerPhoto = singleFile(
  (mime) => IMAGE_TYPES.has(mime) && mime !== "image/svg+xml", STUDENT_PHOTO_MAX_MB, "Only images can be uploaded",
);
export const uploadSound = singleFile((mime) => AUDIO_TYPES.has(mime), SOUND_MAX_MB, "Only audio files can be uploaded");

class MediaService {
  constructor(private db: PrismaClient = prisma) {}

  // Writes a file to R2, or to the local uploads folder in development.
  async put(key: string, body: Buffer, mime: string) {
    if (isR2Enabled()) {
      await putObject({ key, body, contentType: mime });
    } else {
      const target = resolveUploadPath(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body);
    }
  }

  private async compress(body: Buffer, mime: string) {
    try {
      const optimized = await optimizeImage(body, mime, { maxWidth: IMAGE_MAX_WIDTH });
      return optimized.changed
        ? { body: optimized.buffer, mime: optimized.mimeType, ext: optimized.extension || ".webp" }
        : { body, mime, ext: IMAGE_EXT[mime] };
    } catch {
      throw new BadRequestError("The image is damaged or incomplete. Please choose another image.");
    }
  }

  // A photo of a handwritten essay answer, compressed like bank images.
  async storeAnswerPhoto(attemptId: number, file: Express.Multer.File) {
    const image = await this.compress(file.buffer, file.mimetype);
    const key = `exam-answers/${attemptId}/${crypto.randomUUID()}${image.ext}`;
    await this.put(key, image.body, image.mime);
    const row = await this.db.ex_answer_files.create({
      data: { attempt_id: attemptId, storage_key: key, mime_type: image.mime, size_bytes: image.body.length },
    });
    return { id: row.id, url: await this.url(key) };
  }

  async storeSound(file: Express.Multer.File, folder: string) {
    const key = `exam-sounds/${folder}/${crypto.randomUUID()}${AUDIO_EXT[file.mimetype] ?? ""}`;
    await this.put(key, file.buffer, file.mimetype);
    return key;
  }

  async upload(file: Express.Multer.File | undefined, bankId: number, userId: number) {
    if (!file) throw new BadRequestError("File is required");
    const bank = await foldersService.getFolder(bankId);
    if (bank.bank_id !== null) throw new BadRequestError("Not a bank");

    const isImage = IMAGE_TYPES.has(file.mimetype);
    let body = file.buffer;
    let mime = file.mimetype;
    let ext = isImage ? IMAGE_EXT[mime] : AUDIO_EXT[mime];

    if (!isImage && file.size > AUDIO_MAX_MB * 1024 * 1024) {
      throw new BadRequestError(`Audio files must be ${AUDIO_MAX_MB} MB or smaller`);
    }
    if (isImage) ({ body, mime, ext } = await this.compress(body, mime));

    const kind = isImage ? "image" : "audio";
    const key = `question-bank/${bankId}/${isImage ? "images" : "audio"}/${crypto.randomUUID()}${ext}`;

    await this.put(key, body, mime);

    const media = await this.db.qb_media.create({
      data: {
        storage_key: key,
        kind,
        mime_type: mime,
        size_bytes: body.length,
        original_filename: file.originalname?.slice(0, 255) || null,
        created_by: userId,
      },
    });
    return { id: media.id, kind, url: await this.url(key) };
  }

  async assertExists(ids: (number | null | undefined)[], kind: "image" | "audio") {
    const wanted = [...new Set(ids.filter((id): id is number => !!id))];
    if (!wanted.length) return;
    const found = await this.db.qb_media.findMany({ where: { id: { in: wanted } }, select: { id: true, kind: true } });
    if (found.length !== wanted.length || found.some((m) => m.kind !== kind)) {
      throw new NotFoundError(kind === "image" ? "Image not found" : "Audio file not found");
    }
  }

  // Deletes the media rows and files that no question uses any more. Copies
  // share media, so a file goes only with its last user. A file that fails to
  // delete is logged and left behind; the rows are gone either way.
  async removeUnused(ids: number[]) {
    const wanted = [...new Set(ids)];
    if (!wanted.length) return;
    const stillUsed = new Set<number>();
    const [questions, options, items] = await Promise.all([
      this.db.qb_questions.findMany({
        where: { OR: [
          { stem_image_id: { in: wanted } }, { stem_audio_id: { in: wanted } },
          { explanation_image_id: { in: wanted } }, { model_answer_image_id: { in: wanted } },
        ] },
        select: { stem_image_id: true, stem_audio_id: true, explanation_image_id: true, model_answer_image_id: true },
      }),
      this.db.qb_question_options.findMany({ where: { image_id: { in: wanted } }, select: { image_id: true } }),
      this.db.qb_matching_items.findMany({
        where: { OR: [{ image_id: { in: wanted } }, { audio_id: { in: wanted } }] },
        select: { image_id: true, audio_id: true },
      }),
    ]);
    [
      ...questions.flatMap((q) => [q.stem_image_id, q.stem_audio_id, q.explanation_image_id, q.model_answer_image_id]),
      ...options.map((o) => o.image_id),
      ...items.flatMap((i) => [i.image_id, i.audio_id]),
    ].forEach((id) => id && stillUsed.add(id));

    const unused = await this.db.qb_media.findMany({
      where: { id: { in: wanted.filter((id) => !stillUsed.has(id)) } },
      select: { id: true, storage_key: true },
    });
    if (!unused.length) return;
    await this.db.qb_media.deleteMany({ where: { id: { in: unused.map((m) => m.id) } } });
    await Promise.all(unused.map(async (m) => {
      try {
        if (isR2Enabled()) await deleteObject(m.storage_key);
        else await fs.rm(resolveUploadPath(m.storage_key), { force: true });
      } catch (err) {
        console.error(`[question-bank] could not delete file ${m.storage_key}:`, err);
      }
    }));
  }

  // Signed R2 link (short-lived) or the local path in development.
  async url(key: string): Promise<string> {
    if (!isR2Enabled()) return `/uploads/${key}`;
    const { ttlSeconds } = getServePolicy("question_media");
    return getSignedDownloadUrl(key, { expiresIn: ttlSeconds });
  }

  // { id: { id, kind, url } } for every media id in the list.
  async resolve(ids: (number | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((id): id is number => !!id))];
    const map = new Map<number, { id: number; kind: string; url: string }>();
    if (!wanted.length) return map;
    const rows = await this.db.qb_media.findMany({ where: { id: { in: wanted } } });
    await Promise.all(rows.map(async (m) => {
      map.set(m.id, { id: m.id, kind: m.kind, url: await this.url(m.storage_key) });
    }));
    return map;
  }
}

export const mediaService = new MediaService();
