import path from "path";
import { promises as fsPromises } from "fs";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type { Server as SocketIOServer } from "socket.io";
import type { PrismaClient } from "../../../libs/db/prisma";
import { notification_key_enum } from "../generated/prisma/client";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../../libs/errors";
import { generateInviteToken, hashInviteToken } from "../utils/e-booklet-token";
import { normalizeOriginalFilename } from "../utils/filename";
import { EBookletPagePreviewService } from "./e-booklet-page-preview.service";
import { getEmailService } from "../emails/email.service";
import { emitNotificationToUser } from "../../../libs/redis/socketNotificationEmitter";
import { resolveEBookletStoragePath, resolveEBookletUploadRoot } from "../../../libs/uploadsRoot";
import { createReadStream } from "fs";
import {
  isR2Enabled,
  putObject,
  deleteObject,
  downloadToTempFile,
} from "../../../libs/storage";

type EBookletDb = PrismaClient | any;
const execFileAsync = promisify(execFile);
type EBookletLiveNotification = {
  userId: number;
  notification: {
    id: number;
    category: number;
    message_key: string;
    entity_type: string | null;
    entity_id: number | null;
    target_link: string | null;
    created_at: Date | null;
  };
};

const E_BOOKLET_ORDER_ENTITY_TYPE = "e_booklet_purchase";
const E_BOOKLET_ORDER_TEACHER_TARGET_LINK = "/e-booklet-orders";
const E_BOOKLET_ORDER_ADMIN_ROLES = ["Admin", "SubAdmin", "Moderator"] as const;
const DEFAULT_E_BOOKLET_PREVIEW_PAGE_LIMIT = 10;
const MAX_E_BOOKLET_PREVIEW_PAGE_LIMIT = 200;
const E_BOOKLET_HOTSPOT_REFERENCE_LOCK_NAMESPACE = 42_618;
const E_BOOKLET_INSTANCE_STATUSES = new Set(["active", "suspended", "archived"]);
const DEFAULT_E_BOOKLET_GLOBAL_SETTINGS = {
  default_invite_quota: 0,
  default_access_duration_days: null,
  default_invite_expiration_days: null,
  default_delivery_notes: null,
  default_student_marketing_price: 0,
  default_internal_price: 0,
  default_allowed_devices_per_student: 1,
  default_allowed_devices_per_teacher: 2,
  device_reset_policy: null,
  notify_admins_on_delivery: true,
  notify_teacher_on_delivery: true,
};

async function assertReadableEBookletImage(file: Express.Multer.File): Promise<void> {
  if (!file.mimetype?.startsWith("image/")) return;
  try {
    await sharp(file.path || file.buffer).metadata();
  } catch {
    await removeUploadedTempFile(file);
    throw new BadRequestError("Uploaded image could not be processed. Use a valid PNG, JPEG, WebP, GIF, or AVIF image.");
  }
}

export type EBookletPurchaseListFilters = {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  minTotal?: number;
  maxTotal?: number;
  page?: number;
  limit?: number;
};

export const E_BOOKLET_ADMIN_PURCHASE_INCLUDE = {
  teacher: { select: { id: true, name: true, email: true, phone: true } },
  template: true,
  template_version: true,
  instances: true,
  payment_methods: { select: { id: true, name: true, phone_number: true } },
  payment_screenshot: { select: { id: true, url: true } },
  required_fields: { include: { required_field_definitions: true } },
} as const;

const E_BOOKLET_PURCHASE_STATUSES = new Set([
  "pending",
  "awaiting_payment",
  "paid",
  "needs_branding_info",
  "customization_in_progress",
  "ready",
  "delivered",
  "rejected",
  "cancelled",
  "unknown",
]);

const normalizeEBookletInstanceStatus = (status?: string): string | undefined => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return undefined;
  if (normalized === "revoked") return "suspended";
  return E_BOOKLET_INSTANCE_STATUSES.has(normalized) ? normalized : undefined;
};

function parseFilterDate(value: unknown, label: string, boundary?: "start" | "end"): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new BadRequestError(`Invalid ${label}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (boundary === "end") date.setUTCHours(23, 59, 59, 999);
    if (boundary === "start") date.setUTCHours(0, 0, 0, 0);
  }
  return date;
}

function parseFilterMoney(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new BadRequestError(`Invalid ${label}`);
  return amount;
}

function eBookletPurchaseAmount(purchase: any): unknown {
  if (!purchase || typeof purchase !== "object") return 0;
  if (purchase.final_payable_price !== null && purchase.final_payable_price !== undefined) {
    return purchase.final_payable_price;
  }
  if (Number(purchase.price) > 0) return purchase.price;
  return purchase.marketing_price ?? purchase.student_marketing_price ?? purchase.total ?? purchase.price ?? 0;
}

function serializeEBookletPurchase(purchase: any): any {
  if (!purchase || typeof purchase !== "object") return purchase;
  return {
    ...purchase,
    total: eBookletPurchaseAmount(purchase),
  };
}

export function isGeneratedEBookletTitle(value: unknown): boolean {
  const str = String(value || "").trim();
  return (
    /^Teacher e-booklet #\d+$/i.test(str) ||
    /^e-booklet #\d+$/i.test(str) ||
    /^كتاب إلكتروني #\d+$/i.test(str) ||
    /^مذكرة إلكترونية #\d+$/i.test(str)
  );
}

export function resolveInstanceDisplayTitle(instance: any): string {
  const customTeacherTitle =
    (instance?.branding_json as any)?.bookletTitle?.trim?.() ||
    (instance?.purchase?.branding_json as any)?.bookletTitle?.trim?.() ||
    "";
  if (customTeacherTitle && !isGeneratedEBookletTitle(customTeacherTitle)) {
    return customTeacherTitle;
  }
  const templateTitle = instance?.template?.title?.trim?.() ?? "";
  if (templateTitle) {
    return templateTitle;
  }
  const displayTitle = instance?.display_title?.trim?.() ?? "";
  if (displayTitle && !isGeneratedEBookletTitle(displayTitle)) {
    return displayTitle;
  }
  return displayTitle;
}

function enrichTemplateWithReleaseInfo<T extends { release_at?: Date | string | null }>(
  template: T,
): T & { is_released: boolean; time_until_release_ms: number | null; exact_minute: number | null } {
  const releaseAt = template.release_at ? new Date(template.release_at) : null;
  const now = new Date();
  const isReleased = !releaseAt || releaseAt <= now;
  const timeUntilReleaseMs =
    releaseAt && releaseAt > now ? releaseAt.getTime() - now.getTime() : null;
  return {
    ...template,
    is_released: isReleased,
    time_until_release_ms: timeUntilReleaseMs,
    exact_minute: releaseAt ? releaseAt.getMinutes() : null,
  };
}

function parseTemplateReleaseAt(dto: any): Date | null | undefined {
  if (dto?.release_date !== undefined && dto?.release_hour !== undefined && dto?.release_minute !== undefined) {
    if (!dto.release_date) return null;
    const releaseAt = new Date(dto.release_date);
    releaseAt.setHours(Number(dto.release_hour));
    releaseAt.setMinutes(Number(dto.release_minute));
    releaseAt.setSeconds(0);
    releaseAt.setMilliseconds(0);
    return releaseAt;
  }
  if (dto?.release_at === undefined) return undefined;
  if (!dto.release_at) return null;
  const releaseAt = new Date(dto.release_at);
  releaseAt.setSeconds(0);
  releaseAt.setMilliseconds(0);
  return releaseAt;
}

function assertTemplateReleased(template: { release_at?: Date | string | null; title?: string | null }) {
  const releaseAt = template.release_at ? new Date(template.release_at) : null;
  if (releaseAt && releaseAt > new Date()) {
    throw new BadRequestError(
      `This e-booklet has not been released yet. It releases at ${releaseAt.toISOString()}`,
    );
  }
}

const E_BOOKLET_UPLOAD_DIR = resolveEBookletUploadRoot();
const PASSCODE_BLOCK_MESSAGE = "Invalid e-booklet invite passcode.";
const PASSCODE_MAX_FAILURES = 5;
const PASSCODE_WINDOW_MS = 10 * 60 * 1000;
const PASSCODE_BLOCK_MS = 15 * 60 * 1000;
const passcodeFailures = new Map<string, { count: number; firstFailureAt: number; blockedUntil?: number }>();

function requireDeviceAdminReason(reason?: string) {
  const normalized = typeof reason === "string" ? reason.trim() : "";
  if (!normalized) {
    throw new BadRequestError("A reason is required for device admin actions.");
  }
  return normalized;
}

const MIME_TO_FILE_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "file",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
  "application/vnd.ms-excel": "file",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "file",
  "application/vnd.ms-powerpoint": "file",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "file",
  "text/plain": "file",
  "text/csv": "file",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/avif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "video/x-m4v": "video",
  "video/ogg": "video",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/webm": "audio",
  "audio/ogg": "audio",
  "audio/mp4": "audio",
};

const FALLBACK_MIME_TYPES = new Set([
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
]);

const EXTENSION_TO_FILE_TYPE: Record<string, string> = {
  ".pdf": "file",
  ".doc": "file",
  ".docx": "file",
  ".xls": "file",
  ".xlsx": "file",
  ".ppt": "file",
  ".pptx": "file",
  ".txt": "file",
  ".csv": "file",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".webp": "image",
  ".gif": "image",
  ".avif": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".qt": "video",
  ".m4v": "video",
  ".ogv": "video",
  ".ogg": "audio",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
};

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
  "video/ogg": ".ogv",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
};

const MIME_ALLOWED_EXTS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/avif": [".avif"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov", ".qt"],
  "video/x-m4v": [".m4v", ".mp4"],
  "video/ogg": [".ogv", ".ogg"],
  "audio/mpeg": [".mp3"],
  "audio/mp3": [".mp3"],
  "audio/wav": [".wav"],
  "audio/webm": [".webm"],
  "audio/ogg": [".ogg"],
  "audio/mp4": [".m4a", ".mp4"],
};

function inferEBookletFileType(file: Express.Multer.File): string | undefined {
  const mimeFileType = MIME_TO_FILE_TYPE[file.mimetype];
  if (mimeFileType) return mimeFileType;
  if (!FALLBACK_MIME_TYPES.has(file.mimetype)) return undefined;
  const ext = path.extname(file.originalname).toLowerCase();
  return ext ? EXTENSION_TO_FILE_TYPE[ext] : undefined;
}

export interface PageDimensions {
  width: number;
  height: number;
}

export interface PdfMetadata {
  page_count: number;
  page_dimensions: PageDimensions[];
}

export interface ValidateTeacherDocumentInput {
  templateVersionId: number;
  deliveredDocumentAssetId?: number | null;
  uploadedPageCount: number;
  uploadedPageDimensions?: PageDimensions[];
}

export interface AcceptInviteMeta {
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

type HotspotContentInput = {
  type: string;
  asset_file_id?: number | null;
  text_content?: string | null;
  content_json?: any;
};

type NormalizedHotspotContent = {
  version: 2;
  blocks: any[];
};

type TermsInput = {
  termsAccepted?: boolean;
  termsVersion?: string;
  purchaseId?: number;
  paymentProofFileId?: number;
  payment_method_id?: number;
  numberTransferredFrom?: string;
  notes?: string;
  passcode?: string;
};

function resolveDefaultPrisma(): PrismaClient {
  // Lazy require keeps service unit tests from needing DATABASE_URL.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../../../libs/db/prisma").prisma;
}

function dimensionsDiffer(
  expected?: PageDimensions[] | null,
  uploaded?: PageDimensions[],
): boolean {
  if (!expected?.length || !uploaded?.length) return false;
  if (expected.length !== uploaded.length) return true;

  return expected.some((dimension, index) => {
    const uploadedDimension = uploaded[index];
    if (!uploadedDimension) return true;
    return (
      Number(dimension.width) !== Number(uploadedDimension.width) ||
      Number(dimension.height) !== Number(uploadedDimension.height)
    );
  });
}

async function extractPdfMetadata(
  file: Express.Multer.File,
): Promise<PdfMetadata | null> {
  if (file.mimetype !== "application/pdf") return null;

  try {
    if (file.path) {
      const pdfInfoMetadata = await extractPdfMetadataWithPdfInfo(file.path);
      if (!pdfInfoMetadata) {
        throw new Error("PDF metadata extraction failed");
      }
      return pdfInfoMetadata;
    }
    const buffer = file.buffer || (file.path ? await fsPromises.readFile(file.path) : undefined);
    if (!buffer) {
      throw new Error("Missing PDF upload buffer");
    }
    const document = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const pages = document.getPages();
    return {
      page_count: pages.length,
      page_dimensions: pages.map((page) => {
        const size = page.getSize();
        return {
          width: Number(size.width.toFixed(2)),
          height: Number(size.height.toFixed(2)),
        };
      }),
    };
  } catch {
    throw new BadRequestError(
      "The uploaded PDF could not be read. Please upload a valid PDF file.",
    );
  }
}

async function extractPdfMetadataWithPdfInfo(pdfPath: string): Promise<PdfMetadata | null> {
  try {
    const { stdout } = await execFileAsync(
      process.env.E_BOOKLET_PDFINFO_BIN || "pdfinfo",
      ["-box", "-f", "1", "-l", "1000000", pdfPath],
      { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
    );
    const pageCountMatch = stdout.match(/^Pages:\s+(\d+)$/m);
    const pageCount = pageCountMatch ? Number(pageCountMatch[1]) : 0;
    const dimensions = new Map<number, { width: number; height: number }>();
    const sizePattern = /^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts\b/gm;
    let match: RegExpExecArray | null;
    while ((match = sizePattern.exec(stdout)) !== null) {
      dimensions.set(Number(match[1]), {
        width: Number(Number(match[2]).toFixed(2)),
        height: Number(Number(match[3]).toFixed(2)),
      });
    }
    if (!pageCount || dimensions.size !== pageCount) return null;
    return {
      page_count: pageCount,
      page_dimensions: Array.from({ length: pageCount }, (_, index) => dimensions.get(index + 1)!),
    };
  } catch {
    return null;
  }
}

async function removeUploadedTempFile(file?: Express.Multer.File): Promise<void> {
  if (!file?.path) return;
  try {
    await fsPromises.unlink(file.path);
  } catch {
    // Best-effort cleanup only.
  }
}

const VIEWER_PAGE_TOKEN_TTL_MS = 5 * 60 * 1000;

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function viewerTokenSecret(): string {
  return (
    process.env.E_BOOKLET_PAGE_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "dev-e-booklet-page-token-secret"
  );
}

function inviteShareTokenSecret(): string {
  return (
    process.env.E_BOOKLET_INVITE_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "dev-e-booklet-invite-token-secret"
  );
}

function invitePasscodeSecret(): string {
  return (
    process.env.E_BOOKLET_INVITE_PASSCODE_SECRET ||
    process.env.APP_SECRET ||
    process.env.JWT_SECRET ||
    "dev-e-booklet-invite-passcode-secret"
  );
}

function encryptSecretValue(value: string, secret: string): string {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decryptSecretValue(ciphertext: string | null | undefined, secret: string): string | null {
  if (!ciphertext) return null;
  const parts = ciphertext.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function encryptInviteShareToken(token: string): string {
  return encryptSecretValue(token, inviteShareTokenSecret());
}

function decryptInviteShareToken(ciphertext: string | null | undefined): string | null {
  return decryptSecretValue(ciphertext, inviteShareTokenSecret());
}

function encryptInvitePasscode(passcode: string): string {
  return encryptSecretValue(passcode, invitePasscodeSecret());
}

function decryptInvitePasscode(ciphertext: string | null | undefined): string | null {
  return decryptSecretValue(ciphertext, invitePasscodeSecret());
}

function createViewerPageToken(input: {
  instanceId: number;
  pageNumber: number;
  userId: number;
  expiresAt: Date;
}): string {
  const body = base64UrlEncode(
    JSON.stringify({
      instanceId: input.instanceId,
      pageNumber: input.pageNumber,
      userId: input.userId,
      expiresAt: input.expiresAt.toISOString(),
    }),
  );
  const signature = crypto
    .createHmac("sha256", viewerTokenSecret())
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${body}.${signature}`;
}

function verifyViewerPageToken(input: {
  token: string | undefined;
  instanceId: number;
  pageNumber: number;
  userId: number;
}) {
  if (!input.token) {
    throw new ForbiddenError("A valid e-booklet page token is required.");
  }
  const [body, signature] = input.token.split(".");
  if (!body || !signature) {
    throw new ForbiddenError("A valid e-booklet page token is required.");
  }
  const expected = crypto
    .createHmac("sha256", viewerTokenSecret())
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new ForbiddenError("A valid e-booklet page token is required.");
  }
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new ForbiddenError("A valid e-booklet page token is required.");
  }
  const expiresAt = new Date(payload.expiresAt);
  if (
    Number(payload.instanceId) !== input.instanceId ||
    Number(payload.pageNumber) !== input.pageNumber ||
    Number(payload.userId) !== input.userId ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    throw new ForbiddenError("A valid e-booklet page token is required.");
  }
}

export class EBookletService {
  private fileStorageInitPromise: Promise<unknown> | null = null;
  private pagePreviewService = new EBookletPagePreviewService(this.db);

  constructor(private readonly db: EBookletDb = resolveDefaultPrisma()) {}

  private async getGlobalSettings(db: EBookletDb = this.db): Promise<any> {
    if (!db.e_booklet_global_settings?.upsert) return DEFAULT_E_BOOKLET_GLOBAL_SETTINGS;
    const settings = await db.e_booklet_global_settings.upsert({
      where: { id: 1 },
      create: { id: 1, ...DEFAULT_E_BOOKLET_GLOBAL_SETTINGS },
      update: {},
    });
    return { ...DEFAULT_E_BOOKLET_GLOBAL_SETTINGS, ...settings };
  }

  private addDaysFromNow(days: unknown): Date | undefined {
    if (days === null || days === undefined || days === "") return undefined;
    const numeric = Number(days);
    if (!Number.isInteger(numeric) || numeric < 0) return undefined;
    return new Date(Date.now() + numeric * 24 * 60 * 60 * 1000);
  }

  private async transaction<T>(
    callback: (tx: EBookletDb) => Promise<T>,
    options?: Record<string, unknown>,
  ): Promise<T> {
    if (typeof this.db.$transaction === "function") {
      return this.db.$transaction(callback, options);
    }
    return callback(this.db);
  }

  private async serializableTransaction<T>(callback: (tx: EBookletDb) => Promise<T>): Promise<T> {
    // Device binding makes a count-then-insert decision. Serializable isolation
    // forces competing transactions for different fingerprints to collide instead
    // of both observing the same free allowance; P2034 is retried below.
    const options = { isolationLevel: "Serializable" };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.transaction(callback, options);
      } catch (error: any) {
        if (error?.code === "P2034" && attempt === 0) continue;
        throw error;
      }
    }
    throw new ForbiddenError("Unable to bind viewer device safely.");
  }

  private async lockHotspotReferenceSequence(db: EBookletDb, templateVersionId: number): Promise<void> {
    if (typeof db.$executeRaw !== "function") return;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(${E_BOOKLET_HOTSPOT_REFERENCE_LOCK_NAMESPACE}, ${templateVersionId})`;
  }

  private async auditSafely(db: EBookletDb, data: Record<string, unknown>) {
    try {
      await db.e_booklet_audit_logs.create({ data });
    } catch {
      // Audit failures must not mask the primary e-booklet action/error.
    }
  }

  private toLiveNotificationPayload(userId: number, notification: any): EBookletLiveNotification | null {
    if (!notification?.id) return null;
    return {
      userId,
      notification: {
        id: Number(notification.id),
        category: Number(notification.category),
        message_key: String(notification.message_key),
        entity_type: notification.entity_type ?? null,
        entity_id: notification.entity_id ?? null,
        target_link: notification.target_link ?? null,
        created_at: notification.created_at ?? null,
      },
    };
  }

  private emitEBookletLiveNotifications(io: SocketIOServer | null | undefined, payloads: EBookletLiveNotification[]) {
    if (!io) return;
    for (const payload of payloads) {
      emitNotificationToUser(io, payload.userId, payload.notification);
    }
  }

  private async createEBookletOrderNotifications(db: EBookletDb, purchase: { id: number; teacher_id: number }, createdBy?: number): Promise<EBookletLiveNotification[]> {
    if (!purchase?.id || !purchase?.teacher_id || !db.notifications) return [];

    try {
      const liveNotifications: EBookletLiveNotification[] = [];
      const settings = await this.getGlobalSettings(db);
      const notifyTeacher = settings.notify_teacher_on_delivery !== false;
      const notifyAdmins = settings.notify_admins_on_delivery !== false;
      const adminTargetLink = `/admin/e-booklets/orders/${purchase.id}`;
      const teacherWhere = {
        user_id: purchase.teacher_id,
        message_key: notification_key_enum.ORDER_STATUS_RECEIVED,
        entity_type: E_BOOKLET_ORDER_ENTITY_TYPE,
        entity_id: purchase.id,
      };
      const existingTeacherNotification = await db.notifications.findFirst?.({ where: teacherWhere, select: { id: true } });
      if (notifyTeacher && !existingTeacherNotification) {
        try {
          const teacherNotification = await db.notifications.create({
            data: {
              user_id: purchase.teacher_id,
              category: 1,
              message_key: notification_key_enum.ORDER_STATUS_RECEIVED,
              entity_type: E_BOOKLET_ORDER_ENTITY_TYPE,
              entity_id: purchase.id,
              target_link: E_BOOKLET_ORDER_TEACHER_TARGET_LINK,
              created_by: createdBy ?? null,
            },
          });
          const payload = this.toLiveNotificationPayload(purchase.teacher_id, teacherNotification);
          if (payload) liveNotifications.push(payload);
        } catch (error: any) {
          if (error?.code !== "P2002") throw error;
        }
      }

      const admins = notifyAdmins ? await db.users?.findMany?.({
        where: {
          user_roles: {
            some: { portal: "store", role: { in: [...E_BOOKLET_ORDER_ADMIN_ROLES] } },
          },
          OR: [{ is_deleted: false }, { is_deleted: null }],
        },
        select: { id: true },
      }) : [];
      const adminIds: number[] = Array.from(new Set<number>((admins ?? []).map((admin: any) => Number(admin.id)).filter((id: number) => Number.isInteger(id) && id > 0)));
      if (adminIds.length > 0) {
        const existingAdminNotifications = await db.notifications.findMany?.({
          where: {
            user_id: { in: adminIds },
            message_key: notification_key_enum.NEW_ORDER_CREATED,
            entity_type: E_BOOKLET_ORDER_ENTITY_TYPE,
            entity_id: purchase.id,
          },
          select: { user_id: true },
        });
        const existingAdminIds = new Set((existingAdminNotifications ?? []).map((notification: any) => Number(notification.user_id)));
        const missingAdminIds = adminIds.filter((adminId) => !existingAdminIds.has(adminId));
        for (const adminId of missingAdminIds) {
          try {
            const adminNotification = await db.notifications.create({
              data: {
                user_id: adminId,
                category: 4,
                message_key: notification_key_enum.NEW_ORDER_CREATED,
                entity_type: E_BOOKLET_ORDER_ENTITY_TYPE,
                entity_id: purchase.id,
                target_link: adminTargetLink,
                created_by: createdBy ?? null,
              },
            });
            const payload = this.toLiveNotificationPayload(adminId, adminNotification);
            if (payload) liveNotifications.push(payload);
          } catch (error: any) {
            if (error?.code !== "P2002") throw error;
          }
        }
      }
      return liveNotifications;
    } catch (error) {
      console.error(`[EBookletNotifications] Failed to create notifications for purchase ${purchase.id}:`, error);
      return [];
    }
  }

  buildAdminPurchaseWhere(filters: EBookletPurchaseListFilters = {}) {
    const where: Record<string, any> = {};
    const andClauses: Array<Record<string, any>> = [];
    if (filters.status && filters.status !== "all") {
      if (!E_BOOKLET_PURCHASE_STATUSES.has(String(filters.status))) {
        throw new BadRequestError("Invalid e-booklet purchase status");
      }
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      const startDate = parseFilterDate(filters.startDate, "startDate", "start");
      const endDate = parseFilterDate(filters.endDate, "endDate", "end");
      where.created_at = {};
      if (startDate) where.created_at.gte = startDate;
      if (endDate) where.created_at.lte = endDate;
    }

    const minTotal = parseFilterMoney(filters.minTotal, "minTotal");
    const maxTotal = parseFilterMoney(filters.maxTotal, "maxTotal");
    if (minTotal !== undefined || maxTotal !== undefined) {
      const payableRange: Record<string, number> = {};
      if (minTotal !== undefined) payableRange.gte = minTotal;
      if (maxTotal !== undefined) payableRange.lte = maxTotal;
      andClauses.push({
        OR: [
          { final_payable_price: { not: null, ...payableRange } },
          { final_payable_price: null, price: { gt: 0, ...payableRange } },
          { final_payable_price: null, price: { lte: 0 }, marketing_price: payableRange },
        ],
      });
    }

    const search = filters.search?.trim();
    if (search) {
      const numericSearch = Number(search);
      andClauses.push({ OR: [
        ...(Number.isInteger(numericSearch) && numericSearch > 0 ? [{ id: numericSearch }] : []),
        { payment_reference: { contains: search, mode: "insensitive" } },
        { admin_notes: { contains: search, mode: "insensitive" } },
        { teacher: { name: { contains: search, mode: "insensitive" } } },
        { teacher: { email: { contains: search, mode: "insensitive" } } },
        { teacher: { phone: { contains: search, mode: "insensitive" } } },
        { template: { title: { contains: search, mode: "insensitive" } } },
      ] });
    }

    if (andClauses.length > 0) where.AND = andClauses;

    return where;
  }

  private async ensureFileStorageDir(): Promise<void> {
    if (!this.fileStorageInitPromise) {
      this.fileStorageInitPromise = fsPromises.mkdir(E_BOOKLET_UPLOAD_DIR, {
        recursive: true,
      });
    }
    await this.fileStorageInitPromise;
  }

  private getAssetAbsolutePath(asset: any): string {
    const filename = path.basename(asset?.storage_key || "");
    return path.join(E_BOOKLET_UPLOAD_DIR, filename);
  }

  /**
   * Returns a readable local path for an asset's bytes. On R2 this downloads
   * the object to a temp file (caller must call cleanup); on local disk it
   * returns the stored path with a no-op cleanup. Used for processing that
   * needs a real file (pdfinfo, page rendering, single-page extraction).
   */
  private async resolveAssetLocalFile(
    asset: any,
  ): Promise<{ path: string; cleanup: () => Promise<void> }> {
    if (isR2Enabled()) {
      const ext = path.extname(asset?.storage_key || "") || "";
      return downloadToTempFile(asset?.storage_key || "", ext);
    }
    return { path: this.getAssetAbsolutePath(asset), cleanup: async () => {} };
  }

  /**
   * Confirms an asset's bytes exist before serving. On disk this stats the
   * file; on R2 the object is streamed by the controller via its storage key,
   * so a missing object surfaces as a 404 there instead.
   */
  private async assertAssetServable(_asset: any, absolutePath: string): Promise<void> {
    if (isR2Enabled()) return;
    await fsPromises.access(absolutePath);
  }

  private async ensurePagePreviews(asset: any, templateVersionId?: number | null, force = false): Promise<void> {
    if (!asset || asset.mime_type !== "application/pdf") return;
    const local = await this.resolveAssetLocalFile(asset);
    let result;
    try {
      result = await this.pagePreviewService.generateForDocument({
        documentAsset: asset,
        absolutePdfPath: local.path,
        templateVersionId,
        force,
      });
    } finally {
      await local.cleanup();
    }
    if (templateVersionId) {
      await this.db.e_booklet_page_previews?.updateMany?.({
        where: { document_file_id: Number(asset.id), template_version_id: null },
        data: { template_version_id: templateVersionId, updated_at: new Date() },
      });
    }
    if (result.error) {
      await this.auditSafely(this.db, {
        actor_user_id: null,
        action: "page_preview_generation_failed",
        entity_type: "e_booklet_file_asset",
        entity_id: Number(asset.id),
        metadata_json: { reason: result.error, template_version_id: templateVersionId || null },
      });
    }
  }

  private schedulePagePreviews(asset: any, templateVersionId?: number | null): void {
    void this.ensurePagePreviews(asset, templateVersionId).catch(() => undefined);
  }

  private buildSlug(title: string): string {
    const base = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || `e-booklet-${Date.now()}`;
  }

  private async buildUniqueSlug(tx: EBookletDb, title: string): Promise<string> {
    const baseSlug = this.buildSlug(title);
    let candidate = baseSlug;
    let suffix = 2;

    while (await tx.e_booklet_templates.findUnique({ where: { slug: candidate }, select: { id: true } })) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private templateCheckoutInclude() {
    return {
      payment_methods: {
        include: {
          payment_method: { include: { images: true } },
        },
      },
      required_fields: {
        where: { active: true },
        include: { required_field_definitions: true },
        orderBy: { id: "asc" },
      },
    };
  }

  private normalizeIds(values: unknown): number[] {
    if (!Array.isArray(values)) return [];
    return Array.from(new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)));
  }

  private normalizeTemplateRequiredFields(values: unknown): Array<{ field_definition_id: number; is_required: boolean }> {
    if (!Array.isArray(values)) return [];
    const seen = new Set<number>();
    return values
      .map((value: any) => ({
        field_definition_id: Number(value?.field_definition_id ?? value?.id),
        is_required: value?.is_required !== false,
      }))
      .filter((value) => {
        if (!Number.isInteger(value.field_definition_id) || value.field_definition_id <= 0 || seen.has(value.field_definition_id)) {
          return false;
        }
        seen.add(value.field_definition_id);
        return true;
      });
  }

  private async replaceTemplateCheckoutConfig(tx: EBookletDb, templateId: number, dto: any) {
    if (Array.isArray(dto.payment_method_ids)) {
      const paymentMethodIds = this.normalizeIds(dto.payment_method_ids);
      if (paymentMethodIds.length > 0) {
        const activeCount = await tx.payment_methods.count({
          where: { id: { in: paymentMethodIds }, status: true, is_deleted: false },
        });
        if (activeCount !== paymentMethodIds.length) {
          throw new BadRequestError("One or more selected payment methods are inactive or invalid.");
        }
      }
      await tx.e_booklet_template_payment_methods.deleteMany({ where: { template_id: templateId } });
      if (paymentMethodIds.length > 0) {
        await tx.e_booklet_template_payment_methods.createMany({
          data: paymentMethodIds.map((payment_method_id) => ({ template_id: templateId, payment_method_id })),
          skipDuplicates: true,
        });
      }
    }

    if (Array.isArray(dto.required_fields)) {
      const requiredFields = this.normalizeTemplateRequiredFields(dto.required_fields);
      if (requiredFields.length > 0) {
        const activeCount = await tx.required_field_definitions.count({
          where: {
            id: { in: requiredFields.map((field) => field.field_definition_id) },
            active: { not: false },
            is_deleted: { not: true },
          },
        });
        if (activeCount !== requiredFields.length) {
          throw new BadRequestError("One or more selected required fields are inactive or invalid.");
        }
      }
      await tx.e_booklet_template_required_fields.deleteMany({ where: { template_id: templateId } });
      if (requiredFields.length > 0) {
        await tx.e_booklet_template_required_fields.createMany({
          data: requiredFields.map((field) => ({
            template_id: templateId,
            field_definition_id: field.field_definition_id,
            is_required: field.is_required,
            active: true,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  private async validateEBookletRequiredFields(template: any, submittedValues: unknown) {
    const configuredFields = Array.isArray(template?.required_fields) ? template.required_fields : [];
    const normalizedValues = Array.isArray(submittedValues) ? submittedValues : [];
    const valuesByFieldId = new Map<number, string>();

    for (const value of normalizedValues as any[]) {
      const fieldId = Number(value?.field_definition_id ?? value?.id);
      if (!Number.isInteger(fieldId) || fieldId <= 0) continue;
      valuesByFieldId.set(fieldId, String(value?.value ?? "").trim());
    }

    const requiredMissing = configuredFields.find((field: any) => {
      if (field?.is_required === false) return false;
      const definition = field?.required_field_definitions;
      if (definition && (definition.active === false || definition.is_deleted === true)) return false;
      const fieldId = Number(field?.field_definition_id);
      return !valuesByFieldId.get(fieldId);
    });

    if (requiredMissing) {
      const label = requiredMissing?.required_field_definitions?.label || "Required field";
      throw new BadRequestError(`${label} is required for this e-booklet purchase.`);
    }

    return configuredFields
      .map((field: any) => {
        const fieldId = Number(field.field_definition_id);
        const value = valuesByFieldId.get(fieldId);
        if (!value) return null;
        return { field_definition_id: fieldId, value };
      })
      .filter(Boolean);
  }

  private async validateEBookletPaymentMethod(templatePurchases: any[], paymentMethodId: unknown) {
    const id = Number(paymentMethodId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Payment method is required for paid e-booklet checkout.");
    }

    const configuredIds = new Set<number>();
    for (const item of templatePurchases) {
      for (const relation of (item.template?.payment_methods || [])) {
        configuredIds.add(Number(relation.payment_method_id));
      }
    }
    if (configuredIds.size > 0 && !configuredIds.has(id)) {
      throw new BadRequestError("Selected payment method is not available for this e-booklet.");
    }

    const paymentMethod = await this.db.payment_methods.findFirst({
      where: { id, status: true, is_deleted: false },
      select: { id: true, phone_number: true, name: true },
    });
    if (!paymentMethod) throw new BadRequestError("Selected payment method is inactive or invalid.");
    return paymentMethod;
  }


  async createFileAsset(
    file: Express.Multer.File | undefined,
    input: {
      ownerType?: string;
      ownerId?: number | null;
      fileType?: string;
    } = {},
  ): Promise<unknown> {
    if (!file) {
      throw new BadRequestError("No e-booklet file was uploaded.");
    }

    const inferredFileType = inferEBookletFileType(file);
    if (input.fileType === "document" && file.mimetype !== "application/pdf") {
      await removeUploadedTempFile(file);
      throw new BadRequestError(
        `Invalid document type: ${file.mimetype}. Allowed: PDF only`,
      );
    }
    if (!inferredFileType) {
      await removeUploadedTempFile(file);
      throw new BadRequestError(`Unsupported e-booklet file type: ${file.mimetype}`);
    }
    await assertReadableEBookletImage(file);
    const requestedFileType = input.fileType === "document" ? "pdf" : input.fileType;
    const requestedSafeAttachment = requestedFileType === "file";
    const inferredStorageType =
      requestedSafeAttachment &&
      (file.mimetype === "application/pdf" || file.mimetype.startsWith("application/") || file.mimetype.startsWith("text/"))
        ? "file"
        : inferredFileType;
    const fileType = requestedSafeAttachment ? inferredStorageType : requestedFileType || inferredStorageType;
    if (fileType !== inferredStorageType) {
      await removeUploadedTempFile(file);
      throw new BadRequestError(
        `Uploaded MIME type ${file.mimetype} must be stored as e-booklet file_type=${inferredStorageType}.`,
      );
    }

    const originalFilename = normalizeOriginalFilename(file.originalname, "e-booklet-file");
    const originalExt = path.extname(originalFilename).toLowerCase();
    const allowedExts = MIME_ALLOWED_EXTS[file.mimetype];
    if (allowedExts && originalExt && !allowedExts.includes(originalExt)) {
      await removeUploadedTempFile(file);
      throw new BadRequestError(
        `File extension ${originalExt} does not match uploaded MIME type ${file.mimetype}.`,
      );
    }

    const ext =
      MIME_TO_EXT[file.mimetype] ||
      path.extname(originalFilename).toLowerCase() ||
      ".bin";
    const safeBase = path
      .basename(originalFilename, path.extname(originalFilename))
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 80);
    const uniqueId = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const filename = `${uniqueId}-${safeBase || "ebooklet"}${ext}`;
    const storageKey = `e-booklets/private/${filename}`;
    const finalPath = path.join(E_BOOKLET_UPLOAD_DIR, filename);

    await this.ensureFileStorageDir();
    try {
      const metadata = await extractPdfMetadata(file);
      if (isR2Enabled()) {
        // Upload to R2 using the storage key. Metadata was already read from the
        // local temp above; the temp is cleaned up after a successful upload.
        if (file.path) {
          await putObject({
            key: storageKey,
            body: createReadStream(file.path),
            contentType: file.mimetype,
            contentLength: file.size,
          });
          await removeUploadedTempFile(file);
        } else if (file.buffer) {
          await putObject({
            key: storageKey,
            body: file.buffer,
            contentType: file.mimetype,
            contentLength: file.size,
          });
        } else {
          throw new BadRequestError("No e-booklet file was uploaded.");
        }
      } else if (file.path) {
        await fsPromises.rename(file.path, finalPath);
      } else if (file.buffer) {
        await fsPromises.writeFile(finalPath, file.buffer);
      } else {
        throw new BadRequestError("No e-booklet file was uploaded.");
      }

      const asset = await this.db.e_booklet_file_assets.create({
        data: {
          owner_type: input.ownerType || "admin",
          owner_id: input.ownerId ?? null,
          file_type: fileType,
          storage_key: storageKey,
          original_filename: originalFilename,
          mime_type: file.mimetype,
          size_bytes: file.size,
          visibility: "private",
        },
      });
      return metadata ? { ...asset, metadata } : asset;
    } catch (error) {
      await removeUploadedTempFile(file);
      if (isR2Enabled()) {
        try {
          await deleteObject(storageKey);
        } catch {
          // Best-effort cleanup only.
        }
      } else {
        try {
          await fsPromises.unlink(finalPath);
        } catch {
          // Best-effort cleanup only.
        }
      }
      throw error;
    }
  }

  async getPrivateFileAssetForAdmin(
    assetId: number,
    pageNumber?: number,
  ): Promise<{ asset: any; absolutePath: string; pageBuffer: Buffer | null }> {
    const asset = await this.db.e_booklet_file_assets.findUnique({
      where: { id: assetId },
    });
    if (!asset) throw new NotFoundError("E-booklet file asset not found");

    const absolutePath = resolveEBookletStoragePath(asset.storage_key || "");
    let pageBuffer: Buffer | null = null;
    if (pageNumber && asset.mime_type === "application/pdf") {
      const local = await this.resolveAssetLocalFile(asset);
      try {
        pageBuffer = await this.extractSinglePagePdf(local.path, pageNumber);
      } finally {
        await local.cleanup();
      }
    } else {
      await this.assertAssetServable(asset, absolutePath);
    }
    return { asset, absolutePath, pageBuffer };
  }

  private async getPagePreviewForDocumentAsset(asset: any, pageNumber: number, templateVersionId?: number | null) {
    if (!asset || asset.mime_type !== "application/pdf") {
      throw new NotFoundError("E-booklet PDF document not found.");
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new BadRequestError("Invalid e-booklet page number.");
    }

    const absolutePdfPath = this.getAssetAbsolutePath(asset);
    await this.assertAssetServable(asset, absolutePdfPath);
    let preview: any = null;
    try {
      preview = await this.db.e_booklet_page_previews?.findUnique?.({
        where: {
          document_file_id_page_number_size_key: {
            document_file_id: Number(asset.id),
            page_number: pageNumber,
            size_key: "default",
          },
        },
        include: { image_file: true },
      });
    } catch {
      preview = null;
    }

    if (!preview) {
      await this.ensurePagePreviews(asset, templateVersionId).catch(() => undefined);
      try {
        preview = await this.db.e_booklet_page_previews?.findUnique?.({
          where: {
            document_file_id_page_number_size_key: {
              document_file_id: Number(asset.id),
              page_number: pageNumber,
              size_key: "default",
            },
          },
          include: { image_file: true },
        });
      } catch {
        preview = null;
      }
    }

    if (preview?.image_file) {
      const absolutePath = this.getAssetAbsolutePath(preview.image_file);
      await this.assertAssetServable(preview.image_file, absolutePath);
      return { preview, asset: preview.image_file, absolutePath, pageBuffer: null };
    }

    const localPdf = await this.resolveAssetLocalFile(asset);
    let renderedPage;
    try {
      renderedPage = await this.pagePreviewService.renderPageBuffer({ absolutePdfPath: localPdf.path, pageNumber });
    } finally {
      await localPdf.cleanup();
    }
    return {
      preview: null,
      asset: {
        id: asset.id,
        file_type: "image",
        original_filename: `${path.basename(asset.original_filename || "e-booklet", ".pdf")}-page-${pageNumber}.webp`,
        mime_type: renderedPage.mimeType,
        size_bytes: renderedPage.buffer.length,
        visibility: "private",
      },
      absolutePath: null,
      pageBuffer: renderedPage.buffer,
    };
  }

  async getPrivateFileAssetPagePreviewForAdmin(assetId: number, pageNumber: number) {
    const asset = await this.db.e_booklet_file_assets.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError("E-booklet file asset not found");
    return this.getPagePreviewForDocumentAsset(asset, pageNumber);
  }

  async getPublicCoverFileAsset(
    assetId: number,
  ): Promise<{ asset: any; absolutePath: string }> {
    const template = await this.db.e_booklet_templates.findFirst({
      where: {
        status: "published",
        cover_file_id: assetId,
      },
      include: { cover_file: true },
    });
    let asset = template?.cover_file;

    if (!asset) {
      const now = new Date();
      const instance = await this.db.e_booklet_instances.findFirst({
        where: {
          status: "active",
          access_expires_at: { gt: now },
          template: {
            status: "published",
            cover_file_id: assetId,
          },
        },
        include: {
          template: { include: { cover_file: true } },
        },
      });
      asset = instance?.template?.cover_file;
    }

    if (!asset || asset.file_type !== "image") throw new NotFoundError("E-booklet cover asset not found");

    const filename = path.basename(asset.storage_key || "");
    const absolutePath = path.join(E_BOOKLET_UPLOAD_DIR, filename);
    await this.assertAssetServable(asset, absolutePath);
    return { asset, absolutePath };
  }

  async listPublishedTemplates(filters: {
    search?: string;
    categoryId?: number;
    page?: number;
    limit?: number;
  }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { status: "published" };

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters.categoryId) {
      where.category_id = filters.categoryId;
    }

    const [data, total] = await Promise.all([
      this.db.e_booklet_templates.findMany({
        where,
        include: {
          cover_file: true,
          category: { select: { id: true, title: true } },
          ...this.templateCheckoutInclude(),
          versions: {
            where: { status: "active" },
            orderBy: { version_number: "desc" },
            take: 1,
            include: { _count: { select: { hotspots: true } } },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.e_booklet_templates.count({ where }),
    ]);

    return { data: data.map((template: any) => enrichTemplateWithReleaseInfo(template)), total, page, limit };
  }

  async getPublishedTemplateById(id: number): Promise<unknown> {
    const template = await this.db.e_booklet_templates.findFirst({
      where: { id, status: "published" },
      include: {
        cover_file: true,
        category: { select: { id: true, title: true } },
        ...this.templateCheckoutInclude(),
        versions: {
          where: { status: "active" },
          orderBy: { version_number: "desc" },
          take: 1,
          include: {
            _count: { select: { hotspots: true } },
            hotspots: {
              where: { is_active: true },
              orderBy: [
                { page_number: "asc" },
                { sort_order: "asc" },
                { created_at: "asc" },
              ],
            },
          },
        },
      },
    });
    if (!template) throw new NotFoundError("E-booklet template not found");
    return enrichTemplateWithReleaseInfo(this.normalizeTemplateVersionHotspots(template));
  }

  private normalizePreviewPageLimit(value: unknown): number {
    const numeric = Number(value ?? DEFAULT_E_BOOKLET_PREVIEW_PAGE_LIMIT);
    if (!Number.isInteger(numeric) || numeric < 1) return DEFAULT_E_BOOKLET_PREVIEW_PAGE_LIMIT;
    return Math.min(numeric, MAX_E_BOOKLET_PREVIEW_PAGE_LIMIT);
  }

  private async getPreviewPageLimit(): Promise<number> {
    if (this.db.e_booklet_global_settings?.upsert) {
      try {
        const settings = await this.db.e_booklet_global_settings.upsert({
          where: { id: 1 },
          create: { id: 1, preview_page_limit: DEFAULT_E_BOOKLET_PREVIEW_PAGE_LIMIT },
          update: {},
        });
        return this.normalizePreviewPageLimit(settings?.preview_page_limit);
      } catch {
        // Fall through to the raw-query fallback for older generated clients.
      }
    }
    if (!this.db.$queryRawUnsafe) return DEFAULT_E_BOOKLET_PREVIEW_PAGE_LIMIT;
    try {
      const rows = await this.db.$queryRawUnsafe(
        "SELECT preview_page_limit FROM e_booklet_global_settings WHERE id = 1 LIMIT 1",
      );
      return this.normalizePreviewPageLimit(Array.isArray(rows) ? rows[0]?.preview_page_limit : undefined);
    } catch {
      return DEFAULT_E_BOOKLET_PREVIEW_PAGE_LIMIT;
    }
  }

  private async getPublishedPreviewTemplate(templateId: number) {
    const [template, previewPageLimit] = await Promise.all([
      this.db.e_booklet_templates.findFirst({
        where: { id: templateId, status: "published" },
        include: {
          cover_file: true,
          category: { select: { id: true, title: true } },
          ...this.templateCheckoutInclude(),
          versions: {
            where: { status: "active" },
            orderBy: { version_number: "desc" },
            take: 1,
            include: { _count: { select: { hotspots: true } } },
          },
        },
      }),
      this.getPreviewPageLimit(),
    ]);
    if (!template) throw new NotFoundError("E-booklet template not found");
    assertTemplateReleased(template);
    const activeVersion = Array.isArray((template as any).versions) ? (template as any).versions[0] : null;
    if (!activeVersion) throw new NotFoundError("E-booklet template version not found");
    const totalPageCount = Number(activeVersion.page_count || 0);
    if (!Number.isInteger(totalPageCount) || totalPageCount < 1) {
      throw new NotFoundError("E-booklet preview is not available.");
    }
    return {
      template,
      activeVersion,
      previewPageLimit,
      previewPageCount: Math.min(totalPageCount, previewPageLimit),
      totalPageCount,
    };
  }

  private assertPreviewPageNumber(pageNumber: number, previewPageCount: number) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > previewPageCount) {
      throw new BadRequestError(`Preview is limited to the first ${previewPageCount} e-booklet pages.`);
    }
  }

  private previewInstanceForTemplate(template: any, activeVersion: any) {
    return {
      id: template.id,
      template_id: template.id,
      template_version_id: activeVersion.id,
      display_title: template.title,
      custom_document_file_id: null,
      template,
      template_version: activeVersion,
    };
  }

  private sanitizePublicPreviewHotspot(hotspot: any) {
    return {
      id: hotspot.id,
      template_version_id: hotspot.template_version_id,
      page_number: hotspot.page_number,
      x_percent: hotspot.x_percent,
      y_percent: hotspot.y_percent,
      radius_percent: hotspot.radius_percent,
      reference_number: hotspot.reference_number,
      shape: hotspot.shape,
      width_percent: hotspot.width_percent,
      height_percent: hotspot.height_percent,
      type: hotspot.type,
      trigger_type: hotspot.trigger_type,
      display_behavior: hotspot.display_behavior,
      sort_order: hotspot.sort_order,
      is_locked: true,
    };
  }

  async getPublicPreviewMetadata(templateId: number) {
    const { template, activeVersion, previewPageLimit, previewPageCount, totalPageCount } = await this.getPublishedPreviewTemplate(templateId);
    const previewVersion = { ...activeVersion, page_count: previewPageCount, total_page_count: totalPageCount };
    const safeTemplate = enrichTemplateWithReleaseInfo({ ...template, versions: [previewVersion] });
    this.decoratePublicCover(safeTemplate);
    return this.sanitizeViewerAccess({
      preview_mode: true,
      preview_page_limit: previewPageLimit,
      preview_page_count: previewPageCount,
      total_page_count: totalPageCount,
      booklet_instance: this.previewInstanceForTemplate(safeTemplate, previewVersion),
    });
  }

  async getPublicPreviewPage(templateId: number, pageNumber: number) {
    const { template, activeVersion, previewPageLimit, previewPageCount, totalPageCount } = await this.getPublishedPreviewTemplate(templateId);
    this.assertPreviewPageNumber(pageNumber, previewPageCount);
    const documentAssetId = this.resolveViewerDocumentAssetId(this.previewInstanceForTemplate(template, activeVersion));
    return {
      pageNumber,
      renderMode: documentAssetId ? "pdf-document" : "server-page",
      documentAssetId,
      pageAccessToken: null,
      expiresAt: null,
      cacheControl: "public, max-age=60",
      previewMode: true,
      previewPageLimit,
      previewPageCount,
      totalPageCount,
      watermark: {
        teacherName: null,
        templateTitle: template.title || null,
      },
      message: documentAssetId
        ? null
        : "Page rendering pipeline is pending document renderer integration.",
    };
  }

  async getPublicPreviewPageHotspots(templateId: number, pageNumber: number) {
    const { activeVersion, previewPageCount } = await this.getPublishedPreviewTemplate(templateId);
    this.assertPreviewPageNumber(pageNumber, previewPageCount);
    const hotspots = await this.db.e_booklet_hotspots.findMany({
      where: {
        template_version_id: activeVersion.id,
        page_number: pageNumber,
        is_active: true,
      },
      orderBy: { sort_order: "asc" },
    });
    return hotspots.map((hotspot: any) => this.sanitizePublicPreviewHotspot(hotspot));
  }

  async getPublicPreviewHotspotContent(templateId: number, hotspotId: number) {
    const { activeVersion, previewPageCount } = await this.getPublishedPreviewTemplate(templateId);
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
      include: { asset_file: true },
    });
    if (
      !hotspot ||
      Number(hotspot.template_version_id) !== Number(activeVersion.id) ||
      hotspot.is_active === false ||
      Number(hotspot.page_number) > previewPageCount
    ) {
      throw new NotFoundError("E-booklet hotspot not found for this preview.");
    }
    return this.serializeHotspotContent(hotspot, { is_locked: false });
  }

  async getPublicPreviewHotspotAsset(templateId: number, hotspotId: number, assetId: number) {
    const { activeVersion, previewPageCount } = await this.getPublishedPreviewTemplate(templateId);
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
    });
    const referencedAssetIds = new Set<number>();
    if (hotspot?.asset_file_id) referencedAssetIds.add(Number(hotspot.asset_file_id));
    const blocks = Array.isArray(hotspot?.content_json?.blocks) ? hotspot.content_json.blocks : [];
    blocks.forEach((block: any) => {
      if (block?.asset_file_id) referencedAssetIds.add(Number(block.asset_file_id));
    });
    if (
      !hotspot ||
      Number(hotspot.template_version_id) !== Number(activeVersion.id) ||
      hotspot.is_active === false ||
      Number(hotspot.page_number) > previewPageCount ||
      !referencedAssetIds.has(assetId)
    ) {
      throw new ForbiddenError("You do not have access to this hotspot asset.");
    }
    const asset = await this.db.e_booklet_file_assets.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError("E-booklet file asset not found");
    const filename = path.basename(asset.storage_key || "");
    return {
      asset: {
        id: asset.id,
        file_type: asset.file_type,
        original_filename: asset.original_filename,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
        visibility: asset.visibility,
      },
      absolutePath: path.join(E_BOOKLET_UPLOAD_DIR, filename),
      cacheControl: "public, max-age=60",
    };
  }

  async getPublicPreviewDocumentPagePreview(templateId: number, pageNumber: number) {
    const { template, activeVersion, previewPageCount } = await this.getPublishedPreviewTemplate(templateId);
    this.assertPreviewPageNumber(pageNumber, previewPageCount);
    return this.buildViewerDocumentPagePreviewResponse(this.previewInstanceForTemplate(template, activeVersion), pageNumber);
  }

  async getPublishedTemplateBySlug(slug: string): Promise<unknown> {
    const template = await this.db.e_booklet_templates.findFirst({
      where: { slug, status: "published" },
      include: {
        cover_file: true,
        category: { select: { id: true, title: true } },
        ...this.templateCheckoutInclude(),
        versions: {
          where: { status: "active" },
          orderBy: { version_number: "desc" },
          take: 1,
          include: {
            _count: { select: { hotspots: true } },
            hotspots: {
              where: { is_active: true },
              orderBy: [
                { page_number: "asc" },
                { sort_order: "asc" },
                { created_at: "asc" },
              ],
            },
          },
        },
      },
    });
    if (!template) throw new NotFoundError("E-booklet template not found");
    return enrichTemplateWithReleaseInfo(this.normalizeTemplateVersionHotspots(template));
  }

  async listAdminTemplates(filters: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.db.e_booklet_templates.findMany({
        where,
        include: {
          cover_file: true,
          category: { select: { id: true, title: true } },
          ...this.templateCheckoutInclude(),
          versions: { orderBy: { version_number: "desc" }, take: 1 },
          _count: { select: { purchases: true } },
        },
        orderBy: { updated_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.e_booklet_templates.count({ where }),
    ]);

    return { data: data.map((template: any) => enrichTemplateWithReleaseInfo(template)), total, page, limit };
  }

  async createTemplate(dto: any, adminUserId: number): Promise<unknown> {
    const releaseAt = parseTemplateReleaseAt(dto);
    return this.transaction(async (tx: EBookletDb) => {
      const slug = dto.slug || await this.buildUniqueSlug(tx, dto.title);
      const template = await tx.e_booklet_templates.create({
        data: {
          title: dto.title,
          slug,
          description: dto.description,
          cover_file_id: dto.cover_file_id,
          price: dto.price,
          marketing_price: dto.marketing_price ?? 0,
          currency: dto.currency || "EGP",
          category_id: dto.category_id,
          status: dto.status || "draft",
          release_at: releaseAt,
          created_by: adminUserId,
        },
      });
      await this.replaceTemplateCheckoutConfig(tx, template.id, dto);
      const created = await tx.e_booklet_templates.findUnique({
        where: { id: template.id },
        include: {
          cover_file: true,
          category: { select: { id: true, title: true } },
          ...this.templateCheckoutInclude(),
        },
      });
      return created ? enrichTemplateWithReleaseInfo(created) : created;
    });
  }

  async getTemplateById(id: number): Promise<unknown> {
    const template = await this.db.e_booklet_templates.findUnique({
      where: { id },
      include: {
        cover_file: true,
        category: { select: { id: true, title: true } },
        ...this.templateCheckoutInclude(),
        versions: { orderBy: { version_number: "desc" } },
      },
    });
    if (!template) throw new NotFoundError("E-booklet template not found");
    return enrichTemplateWithReleaseInfo(template);
  }

  async listTemplateVersions(templateId: number): Promise<unknown[]> {
    const template = await this.db.e_booklet_templates.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (!template) throw new NotFoundError("E-booklet template not found");

    return this.db.e_booklet_template_versions.findMany({
      where: { template_id: templateId },
      include: {
        base_document_file: true,
        rendered_document_file: true,
        _count: { select: { hotspots: true, instances: true, purchases: true } },
      },
      orderBy: { version_number: "desc" },
    });
  }

  async updateTemplate(id: number, dto: any): Promise<unknown> {
    const releaseAt = parseTemplateReleaseAt(dto);
    return this.transaction(async (tx: EBookletDb) => {
      const data: Record<string, unknown> = {
        title: dto.title,
        description: dto.description,
        cover_file_id: dto.cover_file_id,
        price: dto.price,
        marketing_price: dto.marketing_price,
        currency: dto.currency,
        category_id: dto.category_id,
        status: dto.status,
        updated_at: new Date(),
      };
      if (releaseAt !== undefined) data.release_at = releaseAt;
      await tx.e_booklet_templates.update({ where: { id }, data });
      await this.replaceTemplateCheckoutConfig(tx, id, dto);

      if (typeof dto.title === "string" && dto.title.trim()) {
        const nextTitle = dto.title.trim();
        const instances = typeof tx.e_booklet_instances?.findMany === "function"
          ? await tx.e_booklet_instances.findMany({
              where: { template_id: id },
              select: { id: true, display_title: true, branding_json: true, purchase_id: true },
            })
          : [];

        for (const instance of instances || []) {
          const nextBranding = instance.branding_json && typeof instance.branding_json === "object"
            ? { ...(instance.branding_json as Record<string, unknown>), bookletTitle: nextTitle }
            : { bookletTitle: nextTitle };

          if (typeof tx.e_booklet_instances?.update === "function") {
            await tx.e_booklet_instances.update({
              where: { id: instance.id },
              data: {
                display_title: nextTitle,
                branding_json: nextBranding,
                updated_at: new Date(),
              },
            });
          }

          if (instance.purchase_id && typeof tx.e_booklet_purchases?.update === "function") {
            const purchase = typeof tx.e_booklet_purchases?.findUnique === "function"
              ? await tx.e_booklet_purchases.findUnique({
                  where: { id: instance.purchase_id },
                  select: { branding_json: true },
                })
              : null;
            const nextPurchaseBranding = purchase?.branding_json && typeof purchase.branding_json === "object"
              ? { ...(purchase.branding_json as Record<string, unknown>), bookletTitle: nextTitle }
              : { bookletTitle: nextTitle };

            await tx.e_booklet_purchases.update({
              where: { id: instance.purchase_id },
              data: {
                branding_json: nextPurchaseBranding,
                updated_at: new Date(),
              },
            });
          }
        }

        if (typeof tx.e_booklet_purchases?.findMany === "function") {
          const purchases = await tx.e_booklet_purchases.findMany({
            where: { template_id: id },
            select: { id: true, branding_json: true },
          });
          for (const purchase of purchases || []) {
            const nextPurchaseBranding = purchase.branding_json && typeof purchase.branding_json === "object"
              ? { ...(purchase.branding_json as Record<string, unknown>), bookletTitle: nextTitle }
              : { bookletTitle: nextTitle };

            if (typeof tx.e_booklet_purchases?.update === "function") {
              await tx.e_booklet_purchases.update({
                where: { id: purchase.id },
                data: {
                  branding_json: nextPurchaseBranding,
                  updated_at: new Date(),
                },
              });
            }
          }
        }
      }
      const updated = await tx.e_booklet_templates.findUnique({
        where: { id },
        include: {
          cover_file: true,
          category: { select: { id: true, title: true } },
          ...this.templateCheckoutInclude(),
          versions: { orderBy: { version_number: "desc" } },
        },
      });
      return updated ? enrichTemplateWithReleaseInfo(updated) : updated;
    });
  }

  async updateTemplateVersion(versionId: number, dto: any): Promise<unknown> {
    const version = await this.db.e_booklet_template_versions.update({
      where: { id: versionId },
      data: {
        base_document_file_id: dto.base_document_file_id,
        rendered_document_file_id: dto.rendered_document_file_id,
        page_count: dto.page_count,
        page_dimensions_json: dto.page_dimensions_json,
        status: dto.status,
      },
    });
    if (dto.sync_delivered_instance_document === true && version.base_document_file_id) {
      await this.db.e_booklet_instances.updateMany({
        where: {
          template_version_id: versionId,
          custom_document_file_id: { not: null },
        },
        data: {
          custom_document_file_id: version.base_document_file_id,
          updated_at: new Date(),
        },
      });
    }
    const documentAssetId = version.base_document_file_id || version.rendered_document_file_id;
    if (documentAssetId) {
      const asset = await this.db.e_booklet_file_assets.findUnique({ where: { id: documentAssetId } });
      this.schedulePagePreviews(asset, version.id);
    }
    return version;
  }

  async createTemplateVersion(
    templateId: number,
    dto: any,
    adminUserId: number,
  ): Promise<unknown> {
    const latest = await this.db.e_booklet_template_versions.findFirst({
      where: { template_id: templateId },
      orderBy: { version_number: "desc" },
      select: { version_number: true },
    });

    const version = await this.db.e_booklet_template_versions.create({
      data: {
        template_id: templateId,
        version_number: (latest?.version_number ?? 0) + 1,
        base_document_file_id: dto.base_document_file_id,
        rendered_document_file_id: dto.rendered_document_file_id,
        page_count: dto.page_count,
        page_dimensions_json: dto.page_dimensions_json,
        status: "draft",
        created_by: adminUserId,
      },
    });
    const documentAssetId = version.base_document_file_id || version.rendered_document_file_id;
    if (documentAssetId) {
      const asset = await this.db.e_booklet_file_assets.findUnique({ where: { id: documentAssetId } });
      this.schedulePagePreviews(asset, version.id);
    }
    return version;
  }

  async listVersionHotspots(
    templateVersionId: number,
    pageNumber?: number,
  ): Promise<unknown[]> {
    const where: Record<string, unknown> = {
      template_version_id: templateVersionId,
      is_active: true,
    };
    if (pageNumber) where.page_number = pageNumber;

    const hotspots = await this.db.e_booklet_hotspots.findMany({
      where,
      orderBy: [
        { page_number: "asc" },
        { sort_order: "asc" },
        { created_at: "asc" },
      ],
    });
    return hotspots.map((hotspot: any) => this.normalizeHotspotRecord(hotspot));
  }

  private normalizePresetTags(value: unknown): string[] {
    const rawTags = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];
    const seen = new Set<string>();
    return rawTags
      .map((tag) => String(tag || "").trim())
      .filter((tag) => {
        if (!tag || tag.length > 64) return false;
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private normalizePresetRecord(preset: any): any {
    if (!preset || typeof preset !== "object") return preset;
    const tags = Array.isArray(preset.tags_json)
      ? preset.tags_json
      : Array.isArray(preset.tags)
        ? preset.tags
        : [];
    return {
      ...preset,
      tags,
      content_json: this.normalizeLegacyHotspotContent(preset),
    };
  }

  private getPresetSearchText(preset: any): string {
    const blockText = Array.isArray(preset?.content_json?.blocks)
      ? preset.content_json.blocks
          .map((block: any) => [
            block?.text_content,
            block?.supplementary_text,
            block?.url,
            block?.youtube_url,
          ].filter(Boolean).join(" "))
          .join(" ")
      : "";
    return [
      preset?.name,
      preset?.description,
      preset?.title,
      preset?.text_content,
      ...(Array.isArray(preset?.tags_json) ? preset.tags_json : []),
      blockText,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  private hotspotPresetContentDataFromHotspot(hotspot: any, includePosition = true) {
    const normalizedContent = this.normalizeLegacyHotspotContent(hotspot);
    return {
      type: hotspot.type,
      shape: hotspot.shape || "circle",
      width_percent: hotspot.width_percent,
      height_percent: hotspot.height_percent,
      radius_percent: hotspot.radius_percent,
      title: hotspot.title,
      text_content: hotspot.text_content,
      asset_file_id: hotspot.asset_file_id,
      trigger_type: hotspot.trigger_type || "click",
      display_behavior: hotspot.display_behavior,
      content_json: normalizedContent,
      interaction_json: hotspot.interaction_json,
      default_page_number: includePosition ? hotspot.page_number : null,
      default_x_percent: includePosition ? hotspot.x_percent : null,
      default_y_percent: includePosition ? hotspot.y_percent : null,
      source_template_id: hotspot.template_version?.template_id ?? null,
      source_template_version_id: hotspot.template_version_id,
      source_hotspot_id: hotspot.id,
    };
  }

  private async getSourceHotspotForPreset(sourceHotspotId: number) {
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: sourceHotspotId },
      include: { template_version: { select: { id: true, template_id: true } } },
    });
    if (!hotspot) throw new NotFoundError("E-booklet hotspot not found");
    return hotspot;
  }

  async listHotspotPresets(filters: {
    search?: string;
    type?: string;
    tag?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where: any = {};
    if (!filters.includeInactive) where.is_active = true;
    if (filters.type) where.type = filters.type;

    const rows = await this.db.e_booklet_hotspot_presets.findMany({
      where,
      orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    });
    const search = String(filters.search || "").trim().toLowerCase();
    const tag = String(filters.tag || "").trim().toLowerCase();
    const filtered = rows
      .map((preset: any) => this.normalizePresetRecord(preset))
      .filter((preset: any) => !search || this.getPresetSearchText(preset).includes(search))
      .filter((preset: any) => !tag || (preset.tags || []).some((value: string) => String(value).toLowerCase() === tag));
    const skip = (page - 1) * limit;
    return { data: filtered.slice(skip, skip + limit), total: filtered.length, page, limit };
  }

  async getHotspotPreset(presetId: number): Promise<unknown> {
    const preset = await this.db.e_booklet_hotspot_presets.findUnique({ where: { id: presetId } });
    if (!preset) throw new NotFoundError("E-booklet hotspot preset not found");
    return this.normalizePresetRecord(preset);
  }

  async createHotspotPreset(dto: any, adminUserId: number): Promise<unknown> {
    const name = String(dto?.name || "").trim();
    if (!name) throw new BadRequestError("Hotspot preset name is required.");
    const sourceHotspotId = Number(dto?.source_hotspot_id ?? dto?.sourceHotspotId);
    if (!Number.isInteger(sourceHotspotId) || sourceHotspotId <= 0) {
      throw new BadRequestError("Source hotspot is required.");
    }
    const hotspot = await this.getSourceHotspotForPreset(sourceHotspotId);
    const preset = await this.db.e_booklet_hotspot_presets.create({
      data: {
        name,
        description: dto?.description ? String(dto.description).trim() : null,
        tags_json: this.normalizePresetTags(dto?.tags),
        ...this.hotspotPresetContentDataFromHotspot(hotspot, dto?.include_position !== false),
        created_by: adminUserId,
      },
    });
    return this.normalizePresetRecord(preset);
  }

  async updateHotspotPresetMetadata(presetId: number, dto: any, adminUserId: number): Promise<unknown> {
    const name = String(dto?.name || "").trim();
    if (!name) throw new BadRequestError("Hotspot preset name is required.");
    const preset = await this.db.e_booklet_hotspot_presets.update({
      where: { id: presetId },
      data: {
        name,
        description: dto?.description ? String(dto.description).trim() : null,
        tags_json: this.normalizePresetTags(dto?.tags),
        updated_by: adminUserId,
        updated_at: new Date(),
      },
    });
    return this.normalizePresetRecord(preset);
  }

  async replaceHotspotPresetContent(presetId: number, dto: any, adminUserId: number): Promise<unknown> {
    const sourceHotspotId = Number(dto?.source_hotspot_id ?? dto?.sourceHotspotId);
    if (!Number.isInteger(sourceHotspotId) || sourceHotspotId <= 0) {
      throw new BadRequestError("Source hotspot is required.");
    }
    const existing = await this.db.e_booklet_hotspot_presets.findUnique({ where: { id: presetId }, select: { id: true } });
    if (!existing) throw new NotFoundError("E-booklet hotspot preset not found");
    const hotspot = await this.getSourceHotspotForPreset(sourceHotspotId);
    const preset = await this.db.e_booklet_hotspot_presets.update({
      where: { id: presetId },
      data: {
        ...this.hotspotPresetContentDataFromHotspot(hotspot, dto?.include_position !== false),
        updated_by: adminUserId,
        updated_at: new Date(),
      },
    });
    return this.normalizePresetRecord(preset);
  }

  async deleteHotspotPreset(presetId: number): Promise<unknown> {
    const usageCount = await this.db.e_booklet_hotspot_preset_usages.count({ where: { preset_id: presetId } });
    if (usageCount > 0) {
      const preset = await this.db.e_booklet_hotspot_presets.update({
        where: { id: presetId },
        data: { is_active: false, updated_at: new Date() },
      });
      return { action: "archived", preset: this.normalizePresetRecord(preset) };
    }
    await this.db.e_booklet_hotspot_presets.delete({ where: { id: presetId } });
    return { action: "deleted" };
  }

  async restoreHotspotPreset(presetId: number, adminUserId: number): Promise<unknown> {
    const existing = await this.db.e_booklet_hotspot_presets.findUnique({ where: { id: presetId }, select: { id: true } });
    if (!existing) throw new NotFoundError("E-booklet hotspot preset not found");

    const preset = await this.db.e_booklet_hotspot_presets.update({
      where: { id: presetId },
      data: { is_active: true, updated_by: adminUserId, updated_at: new Date() },
    });
    return this.normalizePresetRecord(preset);
  }

  async createHotspotFromPreset(templateVersionId: number, dto: any, adminUserId: number): Promise<unknown> {
    const presetId = Number(dto?.preset_id ?? dto?.presetId);
    if (!Number.isInteger(presetId) || presetId <= 0) throw new BadRequestError("Hotspot preset is required.");
    const [version, preset] = await Promise.all([
      this.db.e_booklet_template_versions.findUnique({ where: { id: templateVersionId }, select: { id: true, template_id: true } }),
      this.db.e_booklet_hotspot_presets.findUnique({ where: { id: presetId } }),
    ]);
    if (!version) throw new NotFoundError("E-booklet template version not found");
    if (!preset || preset.is_active === false) throw new NotFoundError("E-booklet hotspot preset not found");

    const pageNumber = Number(dto?.page_number ?? preset.default_page_number);
    const xPercent = Number(dto?.x_percent ?? preset.default_x_percent);
    const yPercent = Number(dto?.y_percent ?? preset.default_y_percent);
    if (!Number.isInteger(pageNumber) || pageNumber <= 0 || !Number.isFinite(xPercent) || !Number.isFinite(yPercent)) {
      throw new BadRequestError("Preset placement is required.");
    }

    return this.transaction(async (tx: EBookletDb) => {
      const normalizedContent = this.normalizeLegacyHotspotContent(preset);
      const hotspot = await tx.e_booklet_hotspots.create({
        data: {
          template_version_id: templateVersionId,
          page_number: pageNumber,
          x_percent: xPercent,
          y_percent: yPercent,
          radius_percent: preset.radius_percent,
          reference_number: null,
          shape: preset.shape || "circle",
          width_percent: preset.width_percent,
          height_percent: preset.height_percent,
          type: preset.type,
          title: preset.title,
          text_content: preset.text_content,
          asset_file_id: preset.asset_file_id,
          trigger_type: preset.trigger_type || "click",
          display_behavior: preset.display_behavior,
          content_json: normalizedContent,
          interaction_json: preset.interaction_json,
          created_by: adminUserId,
        },
      });
      await tx.e_booklet_hotspot_preset_usages.create({
        data: {
          preset_id: preset.id,
          target_template_id: version.template_id,
          target_template_version_id: templateVersionId,
          target_hotspot_id: hotspot.id,
          used_by: adminUserId,
        },
      });
      const referenceNumbers = await this.normalizeActiveHotspotReferenceNumbers(tx, templateVersionId);
      return this.normalizeHotspotRecord({
        ...hotspot,
        reference_number: referenceNumbers.get(Number(hotspot.id)) ?? hotspot.reference_number,
      });
    });
  }

  async publishTemplateVersion(versionId: number): Promise<unknown> {
    const version = await this.db.e_booklet_template_versions.findUnique({
      where: { id: versionId },
      select: { id: true, template_id: true },
    });
    if (!version) throw new NotFoundError("E-booklet template version not found");

    return this.db.$transaction(async (tx: EBookletDb) => {
      await tx.e_booklet_template_versions.updateMany({
        where: { template_id: version.template_id, status: "active" },
        data: { status: "archived" },
      });
      const published = await tx.e_booklet_template_versions.update({
        where: { id: versionId },
        data: { status: "active", published_at: new Date() },
      });
      await tx.e_booklet_templates.update({
        where: { id: version.template_id },
        data: { status: "published", updated_at: new Date() },
      });
      return published;
    });
  }

  async createHotspot(dto: any, adminUserId: number): Promise<unknown> {
    this.validateHotspotContent(dto);
    const normalizedContent = this.normalizeLegacyHotspotContent(dto);
    return this.transaction(async (tx: EBookletDb) => {
      const hotspot = await tx.e_booklet_hotspots.create({
        data: {
          template_version_id: dto.template_version_id,
          page_number: dto.page_number,
          x_percent: dto.x_percent,
          y_percent: dto.y_percent,
          radius_percent: dto.radius_percent,
          reference_number: null,
          shape: dto.shape || "circle",
          width_percent: dto.width_percent,
          height_percent: dto.height_percent,
          type: dto.type,
          title: dto.title,
          text_content: dto.text_content,
          asset_file_id: dto.asset_file_id,
          trigger_type: dto.trigger_type || "click",
          display_behavior: dto.display_behavior,
          content_json: normalizedContent,
          interaction_json: dto.interaction_json,
          created_by: adminUserId,
        },
      });
      const referenceNumbers = await this.normalizeActiveHotspotReferenceNumbers(tx, dto.template_version_id);
      return this.normalizeHotspotRecord({
        ...hotspot,
        reference_number: referenceNumbers.get(Number(hotspot.id)) ?? hotspot.reference_number,
      });
    });
  }

  private async normalizeActiveHotspotReferenceNumbers(
    db: EBookletDb,
    templateVersionId: number,
  ): Promise<Map<number, number>> {
    await this.lockHotspotReferenceSequence(db, templateVersionId);

    const activeHotspots = await db.e_booklet_hotspots.findMany({
      where: { template_version_id: templateVersionId, is_active: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    await db.e_booklet_hotspots.updateMany({
      where: {
        template_version_id: templateVersionId,
        is_active: false,
        reference_number: { not: null },
      },
      data: { reference_number: null },
    });

    await Promise.all(activeHotspots.map((hotspot: any, index: number) =>
      db.e_booklet_hotspots.update({
        where: { id: hotspot.id },
        data: { reference_number: -1_000_000 - index },
      }),
    ));

    const referenceNumbers = new Map<number, number>();
    await Promise.all(activeHotspots.map((hotspot: any, index: number) => {
      const referenceNumber = index + 1;
      referenceNumbers.set(Number(hotspot.id), referenceNumber);
      return db.e_booklet_hotspots.update({
        where: { id: hotspot.id },
        data: { reference_number: referenceNumber },
      });
    }));

    return referenceNumbers;
  }

  normalizeLegacyHotspotContent(input: HotspotContentInput): NormalizedHotspotContent {
    const existingBlocks = Array.isArray(input.content_json?.blocks)
      ? input.content_json.blocks
      : null;
    if (existingBlocks) {
      return {
        ...(input.content_json || {}),
        version: 2,
        blocks: existingBlocks.map((block: any) => ({ ...block })),
      };
    }

    const block: any = { type: input.type };
    if (input.asset_file_id !== undefined && input.asset_file_id !== null) {
      block.asset_file_id = input.asset_file_id;
    }
    if (input.type === "text" && input.text_content) {
      block.text_content = input.text_content;
    } else if (input.text_content) {
      block.supplementary_text = input.text_content;
    }
    if (input.content_json?.url) block.url = input.content_json.url;
    if (input.content_json?.youtube_url) block.youtube_url = input.content_json.youtube_url;
    if (input.content_json?.source) block.source = input.content_json.source;
    if (input.content_json?.answers) block.answers = input.content_json.answers;

    return { version: 2, blocks: [block] };
  }

  private getYoutubeVideoId(value?: string): string | null {
    if (!this.isYoutubeUrl(value)) return null;
    const parsed = new URL(value as string);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || null;
    }
    const queryVideoId = parsed.searchParams.get("v");
    if (queryVideoId) return queryVideoId;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const videoPathIndex = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
    return videoPathIndex >= 0 ? parts[videoPathIndex + 1] || null : parts[parts.length - 1] || null;
  }

  private sanitizeViewerHotspotContentJson(input: HotspotContentInput): NormalizedHotspotContent {
    const normalized = this.normalizeLegacyHotspotContent(input);
    return {
      ...normalized,
      version: 2,
      blocks: normalized.blocks.map((block: any) => {
        if (block?.type !== "video" || block?.source !== "youtube") return { ...block };
        const { youtube_url: _youtubeUrl, url: _url, ...safeBlock } = block;
        return {
          ...safeBlock,
          source: "youtube",
          provider: "youtube",
          video_id: this.getYoutubeVideoId(block.youtube_url),
        };
      }),
    };
  }

  private serializeHotspotContent(hotspot: any, extra: Record<string, unknown> = {}) {
    return {
      id: hotspot.id,
      template_version_id: hotspot.template_version_id,
      page_number: hotspot.page_number,
      x_percent: hotspot.x_percent,
      y_percent: hotspot.y_percent,
      radius_percent: hotspot.radius_percent,
      type: hotspot.type,
      title: hotspot.title,
      text_content: hotspot.text_content,
      asset_file_id: hotspot.asset_file_id,
      trigger_type: hotspot.trigger_type,
      display_behavior: hotspot.display_behavior,
      content_json: this.sanitizeViewerHotspotContentJson(hotspot),
      asset_file: hotspot.asset_file
        ? {
            id: hotspot.asset_file.id,
            file_type: hotspot.asset_file.file_type,
            original_filename: hotspot.asset_file.original_filename,
            mime_type: hotspot.asset_file.mime_type,
            size_bytes: hotspot.asset_file.size_bytes,
            visibility: hotspot.asset_file.visibility,
          }
        : null,
      ...extra,
    };
  }

  private normalizeHotspotRecord(hotspot: any): any {
    if (!hotspot || typeof hotspot !== "object") return hotspot;
    return {
      ...hotspot,
      content_json: this.normalizeLegacyHotspotContent(hotspot),
    };
  }

  private normalizeTemplateVersionHotspots(template: any): any {
    if (!template || !Array.isArray(template.versions)) return template;
    return {
      ...template,
      versions: template.versions.map((version: any) => ({
        ...version,
        hotspots: Array.isArray(version.hotspots)
          ? version.hotspots.map((hotspot: any) => this.normalizeHotspotRecord(hotspot))
          : version.hotspots,
      })),
    };
  }

  validateHotspotContent(input: HotspotContentInput): void {
    const normalized = this.normalizeLegacyHotspotContent(input);
    const blocks = normalized.blocks;
    const primaryBlock = blocks[0] || {};
    const url = primaryBlock.url || input.content_json?.url;
    const youtubeUrl = primaryBlock.youtube_url || input.content_json?.youtube_url;

    blocks.forEach((block: any) => {
      const blockType = block?.type;
      if (["image", "audio", "file"].includes(blockType) && !block.asset_file_id) {
        const label = blockType === "file" ? "File" : `${blockType[0].toUpperCase()}${blockType.slice(1)}`;
        throw new BadRequestError(`${label} hotspots require an attached file asset.`);
      }
      if (blockType === "link" && !this.isHttpUrl(block.url)) {
        throw new BadRequestError("Link hotspots require a valid HTTP/HTTPS URL.");
      }
      if (blockType === "video") {
        if (block.source === "youtube") {
          if (!this.isYoutubeUrl(block.youtube_url)) {
            throw new BadRequestError("YouTube video hotspots require a valid YouTube HTTP/HTTPS URL.");
          }
        } else if (!block.asset_file_id) {
          throw new BadRequestError("Video hotspots require an attached file asset or YouTube URL.");
        }
      }
      if (blockType === "question_answer") {
        const answers = Array.isArray(block.answers) ? block.answers : [];
        const correctCount = answers.filter(
          (answer: any) => answer?.isCorrect === true || answer?.is_correct === true,
        ).length;
        if (correctCount !== 1) {
          throw new BadRequestError("Q&A hotspots require exactly one correct answer.");
        }
      }
    });

    if (
      ["image", "audio", "file"].includes(input.type) &&
      !input.asset_file_id &&
      !blocks.some((block: any) => block?.type === input.type && block?.asset_file_id)
    ) {
      const label =
        input.type === "file"
          ? "File"
          : `${input.type[0].toUpperCase()}${input.type.slice(1)}`;
      throw new BadRequestError(
        `${label} hotspots require an attached file asset.`,
      );
    }
    if (input.type === "video") {
      if (primaryBlock.source === "youtube") {
        if (!this.isYoutubeUrl(youtubeUrl)) {
          throw new BadRequestError(
            "YouTube video hotspots require a valid YouTube HTTP/HTTPS URL.",
          );
        }
      } else if (!input.asset_file_id && !blocks.some((block: any) => block?.type === "video" && block?.asset_file_id)) {
        throw new BadRequestError(
          "Video hotspots require an attached file asset or YouTube URL.",
        );
      }
    }
    if (input.type === "link" && !this.isHttpUrl(url)) {
      throw new BadRequestError("Link hotspots require a valid HTTP/HTTPS URL.");
    }
    if (input.type === "question_answer") {
      const answers = Array.isArray(primaryBlock.answers)
        ? primaryBlock.answers
        : [];
      const correctCount = answers.filter(
        (answer: any) => answer?.isCorrect === true || answer?.is_correct === true,
      ).length;
      if (correctCount !== 1) {
        throw new BadRequestError(
          "Q&A hotspots require exactly one correct answer.",
        );
      }
    }
  }

  private isHttpUrl(value?: string): boolean {
    if (!value || typeof value !== "string") return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  private isYoutubeUrl(value?: string): boolean {
    if (!this.isHttpUrl(value)) return false;
    const host = new URL(value as string).hostname.toLowerCase();
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host);
  }

  private sanitizeViewerAccess<T>(value: T): T {
    if (!value || typeof value !== "object") return value;
    if (value instanceof Date) {
      return value.toISOString() as T;
    }
    if (typeof (value as any).toJSON === "function") {
      return (value as any).toJSON() as T;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeViewerAccess(item)) as T;
    }
    const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    delete copy.internal_price;
    Object.keys(copy).forEach((key) => {
      copy[key] = this.sanitizeViewerAccess(copy[key]);
    });
    return copy as T;
  }

  validateInstancePricing(input: {
    template_marketing_price?: number;
    marketing_price?: number;
    student_marketing_price?: number;
    internal_price?: number;
  }): { marketingPrice: number; internalPrice: number } {
    const marketingPrice = Number(
      input.student_marketing_price ??
        input.marketing_price ??
        input.template_marketing_price ??
        0,
    );
    const internalPrice = Number(input.internal_price ?? 0);
    if (internalPrice > marketingPrice) {
      throw new BadRequestError("Internal price cannot exceed marketing price.");
    }
    return { marketingPrice, internalPrice };
  }

  async updateHotspot(
    hotspotId: number,
    dto: any,
    adminUserId: number,
  ): Promise<unknown> {
    const { reference_number: _referenceNumber, ...updateDto } = dto;
    let normalizedContent = dto.content_json;
    if (dto.content_json !== undefined || dto.type !== undefined || dto.asset_file_id !== undefined || dto.text_content !== undefined) {
      const existing = await this.db.e_booklet_hotspots.findUnique({ where: { id: hotspotId } });
      if (!existing) throw new NotFoundError("E-booklet hotspot not found");
      const validationInput = { ...existing, ...updateDto };
      this.validateHotspotContent(validationInput);
      normalizedContent = this.normalizeLegacyHotspotContent(validationInput);
    }
    return this.db.e_booklet_hotspots.update({
      where: { id: hotspotId },
      data: {
        ...updateDto,
        ...(normalizedContent !== undefined ? { content_json: normalizedContent } : {}),
        updated_by: adminUserId,
        updated_at: new Date(),
      },
    });
  }

  async deleteHotspot(hotspotId: number, adminUserId: number): Promise<unknown> {
    return this.transaction(async (tx: EBookletDb) => {
      const deletedHotspot = await tx.e_booklet_hotspots.update({
        where: { id: hotspotId },
        data: {
          is_active: false,
          reference_number: null,
          updated_by: adminUserId,
          updated_at: new Date(),
        },
      });
      await this.normalizeActiveHotspotReferenceNumbers(tx, deletedHotspot.template_version_id);
      return { ...deletedHotspot, reference_number: null };
    });
  }

  private getIncludedActiveSeatCount(instance: any): number {
    return Array.isArray(instance.access_records)
      ? instance.access_records.length
      : Number(instance._count?.access_records ?? 0);
  }

  private getIncludedPendingSeatCount(instance: any): number {
    return Array.isArray(instance.student_purchase_links)
      ? instance.student_purchase_links.length
      : Number(instance._count?.student_purchase_links ?? 0);
  }

  private async countReservedStudentSeats(db: EBookletDb, instanceId: number, options: { excludePurchaseId?: number } = {}): Promise<number> {
    const pendingWhere: any = {
      booklet_instance_id: instanceId,
      access_id: null,
      invite: { status: "active", expires_at: { gt: new Date() } },
    };
    if (options.excludePurchaseId) {
      pendingWhere.purchase_id = { not: options.excludePurchaseId };
    }
    const [activeAccessCount, pendingPurchaseLinkCount] = await Promise.all([
      db.e_booklet_access.count({
        where: { booklet_instance_id: instanceId, role: "student", status: "active" },
      }),
      db.e_booklet_student_purchase_links.count({ where: pendingWhere }),
    ]);
    return Number(activeAccessCount ?? 0) + Number(pendingPurchaseLinkCount ?? 0);
  }

  private async assertStudentSeatAvailable(db: EBookletDb, instance: any, options: { excludePurchaseId?: number } = {}): Promise<void> {
    const inviteQuota = Number(instance.invite_quota ?? 0);
    const reservedSeats = await this.countReservedStudentSeats(db, instance.id, options);
    if (reservedSeats >= inviteQuota) {
      throw new ForbiddenError("This e-booklet has reached its student seat limit.");
    }
  }

  private buildPublicCoverUrl(assetId?: number | null): string | null {
    if (!assetId) return null;
    return `/api/v2/e-booklet-store/covers/${assetId}`;
  }

  private decoratePublicCover(template: any): void {
    if (!template) return;
    const coverAssetId = Number(template.cover_file_id ?? template.cover_file?.id ?? 0);
    const coverUrl = this.buildPublicCoverUrl(coverAssetId);
    if (!coverUrl) return;

    template.cover_url = coverUrl;
    if (template.cover_file) {
      template.cover_file = {
        id: template.cover_file.id,
        file_type: template.cover_file.file_type,
        mime_type: template.cover_file.mime_type,
        original_filename: template.cover_file.original_filename,
        size_bytes: template.cover_file.size_bytes,
        url: coverUrl,
      };
    }
  }

  private serializePublicInstance(instance: any): Record<string, unknown> {
    const usedSeats = this.getIncludedActiveSeatCount(instance);
    const pendingSeats = this.getIncludedPendingSeatCount(instance);
    const inviteQuota = Number(instance.invite_quota ?? 0);
    const serialized = this.sanitizeViewerAccess({ ...instance }) as any;
    this.decoratePublicCover(serialized.template);
    delete serialized.internal_price;
    delete serialized.access_records;
    delete serialized.student_purchase_links;
    return {
      ...serialized,
      used_seats: usedSeats,
      reserved_seats: pendingSeats,
      remaining_seats: Math.max(inviteQuota - usedSeats - pendingSeats, 0),
    };
  }

  async listPublicInstances(filters: {
    search?: string;
    categoryId?: number;
    page?: number;
    limit?: number;
  }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const now = new Date();
    const where: any = {
      status: "active",
      access_expires_at: { gt: now },
      purchase: { status: "delivered" },
    };

    if (filters.categoryId) {
      where.template = { category_id: filters.categoryId };
    }
    if (filters.search) {
      where.OR = [
        { display_title: { contains: filters.search, mode: "insensitive" } },
        { teacher: { name: { contains: filters.search, mode: "insensitive" } } },
        { template: { title: { contains: filters.search, mode: "insensitive" } } },
        { template: { description: { contains: filters.search, mode: "insensitive" } } },
      ];
    }

    const include = {
      teacher: { select: { id: true, name: true } },
      template: {
        include: {
          cover_file: true,
          category: { select: { id: true, title: true } },
          ...this.templateCheckoutInclude(),
        },
      },
      template_version: {
        include: { _count: { select: { hotspots: true } } },
      },
      access_records: {
        where: { role: "student", status: "active" },
        select: { id: true },
      },
      student_purchase_links: {
        where: {
          access_id: null,
          invite: { status: "active", expires_at: { gt: now } },
        },
        select: { id: true },
      },
    };

    const [instances, total] = await Promise.all([
      this.db.e_booklet_instances.findMany({
        where,
        include,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.e_booklet_instances.count({ where }),
    ]);

    return {
      data: instances.map((instance: any) => this.serializePublicInstance(instance)),
      total,
      page,
      limit,
    };
  }

  async getPublicInstance(instanceId: number): Promise<unknown> {
    const now = new Date();
    const instance = await this.db.e_booklet_instances.findFirst({
      where: {
        id: instanceId,
        status: "active",
        access_expires_at: { gt: now },
        purchase: { status: "delivered" },
      },
      include: {
        teacher: { select: { id: true, name: true } },
        template: {
          include: {
            cover_file: true,
            category: { select: { id: true, title: true } },
            ...this.templateCheckoutInclude(),
          },
        },
        template_version: {
          include: { _count: { select: { hotspots: true } } },
        },
        access_records: {
          where: { role: "student", status: "active" },
          select: { id: true },
        },
        student_purchase_links: {
          where: {
            access_id: null,
            invite: { status: "active", expires_at: { gt: now } },
          },
          select: { id: true },
        },
      },
    });
    if (!instance) throw new NotFoundError("E-booklet instance not found");
    return this.serializePublicInstance(instance);
  }

  async getRepeatPurchaseTemplates(
    teacherId: number,
    templateIds: number[],
  ): Promise<Array<{ id: number; title: string }>> {
    const uniqueTemplateIds = [...new Set(templateIds)];
    if (uniqueTemplateIds.length === 0) return [];

    const purchases = await this.db.e_booklet_purchases.findMany({
      where: {
        teacher_id: teacherId,
        template_id: { in: uniqueTemplateIds },
        status: {
          in: [
            "pending",
            "awaiting_payment",
            "paid",
            "needs_branding_info",
            "customization_in_progress",
            "ready",
            "delivered",
          ],
        },
      },
      select: {
        template_id: true,
        template: { select: { id: true, title: true } },
      },
    });

    return [
      ...new Map(
        purchases.map(({ template }: any) => [
          template.id,
          { id: template.id, title: template.title },
        ]),
      ).values(),
    ] as Array<{ id: number; title: string }>;
  }

  async createPublicCheckoutRequest(
    teacherId: number,
    dto: any,
    paymentScreenshotFile?: Express.Multer.File,
    io?: SocketIOServer | null,
  ): Promise<unknown> {
    const checkoutItems = Array.isArray(dto.items) && dto.items.length > 0
      ? dto.items
      : dto.template_id
        ? [{
            instance_id: dto.instance_id,
            template_id: dto.template_id,
            template_version_id: dto.template_version_id,
          }]
        : [];
    if (checkoutItems.length === 0) {
      throw new BadRequestError("E-booklet template is required for checkout.");
    }
    if (!dto.terms_accepted) {
      throw new BadRequestError("Terms must be accepted before e-booklet checkout.");
    }

    const acceptedTerms = dto.terms_id
      ? await this.db.e_booklet_terms.findFirst({
          where: {
            id: Number(dto.terms_id),
            status: "active",
            starts_at: { lte: new Date() },
            OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
          },
        })
      : null;
    if (dto.terms_id && !acceptedTerms) {
      throw new BadRequestError("Active e-booklet purchase terms not found.");
    }

    const hasInstanceItems = checkoutItems.some((item: any) => Boolean(item.instance_id));
    const hasTemplateOnlyItems = checkoutItems.some((item: any) => !item.instance_id);
    if (hasInstanceItems && hasTemplateOnlyItems) {
      throw new BadRequestError("E-booklet checkout items cannot mix template and instance purchases.");
    }

    if (hasTemplateOnlyItems) {
      const templatePurchases: any[] = [];
      const seenTemplateIds = new Set<number>();
      for (const item of checkoutItems) {
        const templateId = Number(item.template_id);
        const templateVersionId = Number(item.template_version_id);
        if (!templateId || !templateVersionId || seenTemplateIds.has(templateId)) {
          throw new BadRequestError("Each e-booklet checkout item must reference a unique template and active version.");
        }
        seenTemplateIds.add(templateId);

        const template = await this.db.e_booklet_templates.findFirst({
          where: { id: templateId, status: "published" },
          include: {
            ...this.templateCheckoutInclude(),
            versions: {
              where: { id: templateVersionId, status: "active" },
              take: 1,
            },
          },
        });
        if (!template || !Array.isArray((template as any).versions) || (template as any).versions.length === 0) {
          throw new NotFoundError("E-booklet template version not found");
        }
        assertTemplateReleased(template);
        const price = Number((template as any).marketing_price ?? (template as any).price ?? 0);
        const requiredFieldValues = await this.validateEBookletRequiredFields(
          template,
          item.required_field_values ?? dto.required_field_values,
        );
        templatePurchases.push({ template, templateId, templateVersionId, price, requiredFieldValues });
      }

      const total = templatePurchases.reduce((sum, item) => sum + item.price, 0);
      let paymentScreenshotId: number | null = null;
      let paymentMethod: { id: number; phone_number: string | null; name?: string | null } | null = null;

      if (total > 0) {
        if (!paymentScreenshotFile) {
          throw new BadRequestError("Payment screenshot is required for paid e-booklet checkout.");
        }
        const { imageService } = await import("./image.service");
        const { validatePaymentForCheckout } = await import("./checkout-validation.service");
        const paymentScreenshot = await imageService.uploadImage(
          paymentScreenshotFile,
          { compress: true, quality: 80 },
        );
        paymentScreenshotId = paymentScreenshot.id;
        await validatePaymentForCheckout(this.db, {
          total,
          numberTransferredFrom: dto.numberTransferredFrom,
          payment_method_id: dto.payment_method_id,
        });
        paymentMethod = await this.validateEBookletPaymentMethod(templatePurchases, dto.payment_method_id);
      }

      const transactionResult = await this.serializableTransaction(async (tx: EBookletDb) => {
        const createdPurchases: any[] = [];
        const notificationPayloads: EBookletLiveNotification[] = [];
        for (const item of templatePurchases) {
          const purchase = await tx.e_booklet_purchases.create({
            data: {
              teacher_id: teacherId,
              template_id: item.templateId,
              template_version_id: item.templateVersionId,
              price: item.price,
              marketing_price: item.price,
              internal_price: 0,
              currency: (item.template as any).currency || "EGP",
              admin_notes: dto.notes,
              status: "pending",
              payment_method: total > 0 ? (paymentMethod?.name || String(dto.payment_method_id ?? "")) : null,
              payment_method_id: total > 0 ? paymentMethod?.id : null,
              payment_reference: total > 0 ? (dto.numberTransferredFrom || paymentMethod?.phone_number || null) : null,
              payment_screenshot_id: total > 0 ? paymentScreenshotId : null,
            },
          });

          if (item.requiredFieldValues.length > 0) {
            await tx.e_booklet_purchase_required_fields.createMany({
              data: item.requiredFieldValues.map((field: any) => ({
                purchase_id: purchase.id,
                field_definition_id: field.field_definition_id,
                value: field.value,
              })),
              skipDuplicates: true,
            });
          }
          createdPurchases.push(purchase);
        }

        for (const purchase of createdPurchases) {
          notificationPayloads.push(...await this.createEBookletOrderNotifications(tx, { ...purchase, teacher_id: teacherId }));
        }

        const firstPurchase = createdPurchases[0] || {};
        return { response: {
          id: firstPurchase.id,
          purchase_id: firstPurchase.id,
          status: firstPurchase.status,
          total,
          currency: createdPurchases[0]?.currency || "EGP",
          item_count: createdPurchases.length,
          items: createdPurchases,
          next_url: "/e-booklet-orders",
        }, notificationPayloads };
      });
      this.emitEBookletLiveNotifications(io, transactionResult.notificationPayloads);
      return transactionResult.response;
    }

    const instances: any[] = [];
    const seenInstanceIds = new Set<number>();
    for (const item of checkoutItems) {
      const instanceId = Number(item.instance_id);
      if (!instanceId || seenInstanceIds.has(instanceId)) {
        throw new BadRequestError("Each e-booklet checkout item must reference a unique instance.");
      }
      seenInstanceIds.add(instanceId);

      const instance = await this.db.e_booklet_instances.findFirst({
        where: {
          id: instanceId,
          status: "active",
          access_expires_at: { gt: new Date() },
        },
        include: {
          template: { include: this.templateCheckoutInclude() },
          template_version: true,
        },
      });
      if (!instance) throw new NotFoundError("E-booklet instance not found");
      if (Number(instance.template_id) !== Number(item.template_id)) {
        throw new BadRequestError("Checkout template does not match the selected e-booklet instance.");
      }
      if (Number(instance.template_version_id) !== Number(item.template_version_id)) {
        throw new BadRequestError("Checkout version does not match the selected e-booklet instance.");
      }
      const requiredFieldValues = await this.validateEBookletRequiredFields(
        instance.template,
        item.required_field_values ?? dto.required_field_values,
      );
      instances.push({ ...instance, requiredFieldValues });
    }

    const total = instances.reduce((sum, instance) => sum + Number(instance.student_marketing_price ?? 0), 0);
    let paymentScreenshotId: number | null = null;
    let paymentMethod: { phone_number: string | null } | null = null;

    if (total > 0) {
      if (!paymentScreenshotFile) {
        throw new BadRequestError("Payment screenshot is required for paid e-booklet checkout.");
      }
      const { imageService } = await import("./image.service");
      const { validatePaymentForCheckout } = await import("./checkout-validation.service");
      const paymentScreenshot = await imageService.uploadImage(
        paymentScreenshotFile,
        { compress: true, quality: 80 },
      );
      paymentScreenshotId = paymentScreenshot.id;
      paymentMethod = await validatePaymentForCheckout(this.db, {
        total,
        numberTransferredFrom: dto.numberTransferredFrom,
        payment_method_id: dto.payment_method_id,
      });
    }

    const transactionResult = await this.serializableTransaction(async (tx: EBookletDb) => {
      for (const instance of instances) {
        await this.assertStudentSeatAvailable(tx, instance);
      }
      const createdPurchases: any[] = [];
      const notificationPayloads: EBookletLiveNotification[] = [];
      for (const instance of instances) {
        const price = Number(instance.student_marketing_price ?? 0);
        const purchase = await tx.e_booklet_purchases.create({
          data: {
            teacher_id: teacherId,
            template_id: instance.template_id,
            template_version_id: instance.template_version_id,
            price,
            marketing_price: price,
            internal_price: Number(instance.internal_price ?? 0),
            access_expires_at: instance.access_expires_at,
            currency: instance.template?.currency || "EGP",
            admin_notes: dto.notes,
            status: total > 0 ? "pending" : "ready",
            payment_method: total > 0 ? String(dto.payment_method_id ?? "") : null,
            payment_method_id: total > 0 ? Number(dto.payment_method_id) : null,
            payment_reference: total > 0 ? (dto.numberTransferredFrom || paymentMethod?.phone_number || null) : null,
            payment_screenshot_id: total > 0 ? paymentScreenshotId : null,
          },
        });

        if (instance.requiredFieldValues.length > 0) {
          await tx.e_booklet_purchase_required_fields.createMany({
            data: instance.requiredFieldValues.map((field: any) => ({
              purchase_id: purchase.id,
              field_definition_id: field.field_definition_id,
              value: field.value,
            })),
            skipDuplicates: true,
          });
        }

        await this.recordAnalyticsEvent(tx, {
          event_type: "teacher_purchase_requested",
          teacher_id: teacherId,
          template_id: instance.template_id,
          booklet_instance_id: instance.id,
          purchase_id: purchase.id,
          source: "public_store",
          marketing_price_snapshot: price,
          internal_price_snapshot: Number(instance.internal_price ?? 0),
        });

        createdPurchases.push({
          ...purchase,
          booklet_instance_id: instance.id,
          total: price,
        });
      }

      for (const purchase of createdPurchases) {
        notificationPayloads.push(...await this.createEBookletOrderNotifications(tx, { ...purchase, teacher_id: teacherId }));
      }

      const firstPurchase = createdPurchases[0] || {};
      return { response: {
        id: firstPurchase.id,
        purchase_id: firstPurchase.id,
        status: firstPurchase.status,
        total,
        currency: createdPurchases[0]?.currency || "EGP",
        item_count: createdPurchases.length,
        items: createdPurchases,
        booklet_instance_id: firstPurchase.booklet_instance_id,
        next_url: "/e-booklet-orders",
      }, notificationPayloads };
    });
    this.emitEBookletLiveNotifications(io, transactionResult.notificationPayloads);
    return transactionResult.response;
  }

  async createPurchaseRequest(teacherId: number, dto: any, adminUserId?: number, io?: SocketIOServer | null): Promise<unknown> {
    const rawMarketingPrice = dto.marketing_price ?? dto.student_marketing_price;
    const submittedPrice = Number(dto.price ?? 0);
    const submittedMarketingPrice = Number(rawMarketingPrice ?? 0);
    const price = submittedPrice > 0 ? submittedPrice : submittedMarketingPrice;
    const { marketingPrice, internalPrice } = this.validateInstancePricing({
      marketing_price: rawMarketingPrice ?? price,
      internal_price: dto.internal_price ?? 0,
    });

    const purchase = await this.db.e_booklet_purchases.create({
      data: {
        teacher_id: teacherId,
        template_id: dto.template_id,
        template_version_id: dto.template_version_id,
        price,
        marketing_price: marketingPrice,
        internal_price: internalPrice,
        currency: dto.currency || "EGP",
        branding_json: dto.branding_json,
        admin_notes: dto.notes,
        status: "pending",
      },
    });

    const notificationPayloads = await this.createEBookletOrderNotifications(this.db, { ...(purchase as any), teacher_id: teacherId }, adminUserId);
    this.emitEBookletLiveNotifications(io, notificationPayloads);

    await this.auditSafely(this.db, {
      actor_user_id: adminUserId,
      action: "teacher_e_booklet_deal_created",
      entity_type: "e_booklet_purchase",
      entity_id: (purchase as any).id,
      metadata_json: {
        teacher_id: teacherId,
        template_id: dto.template_id,
        template_version_id: dto.template_version_id,
      },
    });

    return purchase;
  }

  async listPublicOrders(
    teacherId: number,
    filters: { status?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { teacher_id: teacherId };
    if (filters.status && filters.status !== "all") where.status = filters.status;

    const [data, total] = await Promise.all([
      this.db.e_booklet_purchases.findMany({
        where,
        include: {
          template: true,
          template_version: true,
          instances: true,
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.e_booklet_purchases.count({ where }),
    ]);

    return {
      data: data.map((purchase: any) => serializeEBookletPurchase(purchase)),
      total,
      page,
      limit,
    };
  }

  async listPurchases(filters: EBookletPurchaseListFilters): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildAdminPurchaseWhere(filters);
    const [data, total] = await Promise.all([
      this.db.e_booklet_purchases.findMany({
        where,
        include: E_BOOKLET_ADMIN_PURCHASE_INCLUDE,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.e_booklet_purchases.count({ where }),
    ]);
    return { data: data.map((purchase: any) => serializeEBookletPurchase(purchase)), total, page, limit };
  }

  async getPurchase(id: number): Promise<unknown> {
    const purchase = await this.db.e_booklet_purchases.findUnique({
      where: { id },
      include: E_BOOKLET_ADMIN_PURCHASE_INCLUDE,
    });
    if (!purchase) throw new NotFoundError("E-booklet purchase not found");
    return serializeEBookletPurchase(purchase);
  }

  async preparePurchaseCustomTemplateVersion(purchaseId: number, adminUserId: number) {
    const purchase = await this.db.e_booklet_purchases.findUnique({
      where: { id: purchaseId },
      include: {
        template_version: { include: { hotspots: { where: { is_active: true } } } },
      },
    });
    if (!purchase) throw new NotFoundError("E-booklet purchase not found");
    if (!purchase.template_version) throw new NotFoundError("E-booklet template version not found");

    const otherPurchaseCount = await this.db.e_booklet_purchases.count({
      where: {
        template_version_id: purchase.template_version_id,
        id: { not: purchase.id },
      },
    });
    const instanceCount = await this.db.e_booklet_instances.count({
      where: {
        template_version_id: purchase.template_version_id,
        purchase_id: { not: purchase.id },
      },
    });
    const isAlreadyTeacherSpecific =
      purchase.template_version.status === "draft" &&
      otherPurchaseCount === 0 &&
      instanceCount === 0;

    if (isAlreadyTeacherSpecific) {
      return {
        template_id: purchase.template_id,
        template_version_id: purchase.template_version_id,
        version: purchase.template_version,
        reused: true,
      };
    }

    return this.transaction(async (tx: EBookletDb) => {
      const latest = await tx.e_booklet_template_versions.findFirst({
        where: { template_id: purchase.template_id },
        orderBy: { version_number: "desc" },
        select: { version_number: true },
      });

      const customVersion = await tx.e_booklet_template_versions.create({
        data: {
          template_id: purchase.template_id,
          version_number: (latest?.version_number ?? 0) + 1,
          base_document_file_id: purchase.template_version.base_document_file_id,
          rendered_document_file_id: purchase.template_version.rendered_document_file_id,
          page_count: purchase.template_version.page_count,
          page_dimensions_json: purchase.template_version.page_dimensions_json,
          status: "draft",
          created_by: adminUserId,
        },
      });

      if (purchase.template_version.hotspots.length > 0) {
        await tx.e_booklet_hotspots.createMany({
          data: purchase.template_version.hotspots.map((hotspot: any) => ({
            template_version_id: customVersion.id,
            page_number: hotspot.page_number,
            x_percent: hotspot.x_percent,
            y_percent: hotspot.y_percent,
            radius_percent: hotspot.radius_percent,
            reference_number: hotspot.reference_number,
            shape: hotspot.shape,
            width_percent: hotspot.width_percent,
            height_percent: hotspot.height_percent,
            type: hotspot.type,
            title: hotspot.title,
            text_content: hotspot.text_content,
            asset_file_id: hotspot.asset_file_id,
            trigger_type: hotspot.trigger_type,
            display_behavior: hotspot.display_behavior,
            content_json: hotspot.content_json,
            interaction_json: hotspot.interaction_json,
            sort_order: hotspot.sort_order,
            is_active: hotspot.is_active,
            created_by: adminUserId,
          })),
        });
      }

      await tx.e_booklet_purchases.update({
        where: { id: purchase.id },
        data: { template_version_id: customVersion.id, updated_at: new Date() },
      });
      await tx.e_booklet_instances.updateMany({
        where: { purchase_id: purchase.id },
        data: { template_version_id: customVersion.id, updated_at: new Date() },
      });
      await tx.e_booklet_audit_logs.create({
        data: {
          actor_user_id: adminUserId,
          action: "teacher_template_version_prepared",
          entity_type: "e_booklet_purchase",
          entity_id: purchase.id,
          metadata_json: {
            source_template_version_id: purchase.template_version_id,
            custom_template_version_id: customVersion.id,
          },
        },
      });

      return {
        template_id: purchase.template_id,
        template_version_id: customVersion.id,
        version: customVersion,
        reused: false,
      };
    });
  }

  async updatePurchaseStatus(id: number, status: string, adminNotes?: string) {
    if (status !== "paid") {
      return this.db.e_booklet_purchases.update({
        where: { id },
        data: {
          status,
          admin_notes: adminNotes,
          updated_at: new Date(),
        },
      });
    }

    const purchase = await this.db.e_booklet_purchases.findUnique({
      where: { id },
      include: { instances: true, template: { select: { title: true } } },
    });
    if (!purchase) throw new NotFoundError("E-booklet purchase not found");

    return this.transaction(async (tx: EBookletDb) => {
      let instance = Array.isArray(purchase.instances) && purchase.instances.length > 0
        ? purchase.instances[0]
        : null;

      if (!instance) {
        instance = await tx.e_booklet_instances.create({
          data: {
            purchase_id: purchase.id,
            teacher_id: purchase.teacher_id,
            template_id: purchase.template_id,
            template_version_id: purchase.template_version_id,
            display_title: (purchase.branding_json as any)?.bookletTitle || purchase.template?.title || `Teacher e-booklet #${purchase.id}`,
            branding_json: purchase.branding_json,
            invite_quota: 0,
            access_expires_at: purchase.access_expires_at ?? undefined,
            student_marketing_price: purchase.marketing_price ?? purchase.price ?? 0,
            internal_price: purchase.internal_price ?? 0,
            status: "active",
          },
        });
      }

      const existingTeacherAccess = await tx.e_booklet_access.findFirst({
        where: {
          booklet_instance_id: instance.id,
          user_id: purchase.teacher_id,
          role: "teacher",
          status: "active",
        },
      });
      if (!existingTeacherAccess) {
        await tx.e_booklet_access.create({
          data: {
            booklet_instance_id: instance.id,
            user_id: purchase.teacher_id,
            role: "teacher",
            status: "active",
          },
        });
      }

      return tx.e_booklet_purchases.update({
        where: { id: purchase.id },
        data: {
          status: "ready",
          admin_notes: adminNotes,
          updated_at: new Date(),
        },
      });
    });
  }

  async deliverPurchase(purchaseId: number, dto: any, adminUserId: number) {
    const purchase = await this.db.e_booklet_purchases.findUnique({
      where: { id: purchaseId },
      include: {
        instances: true,
        teacher: { select: { name: true, email: true } },
        template: { select: { title: true } },
      },
    });
    if (!purchase) throw new NotFoundError("E-booklet purchase not found");
    if (!["paid", "ready"].includes(String(purchase.status))) {
      throw new BadRequestError("Payment must be approved before delivering the e-booklet.");
    }
    const settings = await this.getGlobalSettings();
    const accessExpiresAt = dto.access_expires_at
      ? new Date(dto.access_expires_at)
      : this.addDaysFromNow(settings.default_access_duration_days);
    if (!accessExpiresAt) {
      throw new BadRequestError("Access expiry is required for delivered e-booklets.");
    }

    const { marketingPrice, internalPrice } = this.validateInstancePricing({
      marketing_price: dto.student_marketing_price ?? purchase.marketing_price ?? purchase.price ?? settings.default_student_marketing_price ?? 0,
      internal_price: dto.internal_price ?? purchase.internal_price ?? settings.default_internal_price ?? 0,
    });

    await this.validateTeacherDocumentForDelivery({
      templateVersionId: purchase.template_version_id,
      deliveredDocumentAssetId: dto.custom_document_file_id,
      uploadedPageCount: dto.page_count,
      uploadedPageDimensions: dto.page_dimensions,
    });

    const instance: any = await this.transaction(async (tx: EBookletDb) => {
      const existingInstance = Array.isArray(purchase.instances) && purchase.instances.length > 0
        ? purchase.instances[0]
        : null;
      const instanceData = {
        purchase_id: purchase.id,
        teacher_id: purchase.teacher_id,
        template_id: purchase.template_id,
        template_version_id: purchase.template_version_id,
        custom_document_file_id: dto.custom_document_file_id,
        display_title: dto.display_title,
        branding_json: purchase.branding_json,
        invite_quota: dto.invite_quota ?? settings.default_invite_quota ?? 0,
        access_expires_at: accessExpiresAt,
        student_marketing_price: marketingPrice,
        internal_price: internalPrice,
        status: "active",
      };
      const instance = existingInstance
        ? await tx.e_booklet_instances.update({
            where: { id: existingInstance.id },
            data: { ...instanceData, updated_at: new Date() },
          })
        : await tx.e_booklet_instances.create({ data: instanceData });

      const existingTeacherAccess = await tx.e_booklet_access.findFirst({
        where: {
          booklet_instance_id: instance.id,
          user_id: purchase.teacher_id,
          role: "teacher",
          status: "active",
        },
      });
      if (!existingTeacherAccess) {
        await tx.e_booklet_access.create({
          data: {
            booklet_instance_id: instance.id,
            user_id: purchase.teacher_id,
            role: "teacher",
            status: "active",
          },
        });
      }

      await tx.e_booklet_purchases.update({
        where: { id: purchase.id },
        data: {
          status: "delivered",
          admin_notes: purchase.admin_notes ?? settings.default_delivery_notes ?? undefined,
          updated_at: new Date(),
        },
      });

      await tx.e_booklet_audit_logs.create({
        data: {
          actor_user_id: adminUserId,
          action: "booklet_delivered",
          entity_type: "e_booklet_instance",
          entity_id: instance.id,
          metadata_json: { purchase_id: purchase.id },
        },
      });

      await this.recordAnalyticsEvent(tx, {
        event_type: "teacher_purchase_delivered",
        teacher_id: purchase.teacher_id,
        template_id: purchase.template_id,
        booklet_instance_id: instance.id,
        purchase_id: purchase.id,
        source: "public_store",
        marketing_price_snapshot: Number(purchase.price ?? purchase.marketing_price ?? 0),
        internal_price_snapshot: Number(purchase.internal_price ?? 0),
      });

      return instance;
    });

    if (purchase.teacher?.email) {
      getEmailService()
        .sendEBookletDeliveredEmail(purchase.teacher.email, {
          name: purchase.teacher.name ?? "",
          bookletTitle: instance.display_title ?? purchase.template?.title ?? "كتابك الإلكتروني",
        })
        .catch((err) => console.error("[EBooklet] Failed to send delivery email:", err));
    }

    return instance;
  }

  async listInstances(filters: {
    teacherId?: number;
    status?: string;
    page?: number;
    limit?: number;
    includeStudents?: boolean;
  }) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 200);
    const skip = (page - 1) * limit;
    const includeStudents = filters.includeStudents !== false;
    const where: Record<string, unknown> = {};
    if (filters.teacherId) where.teacher_id = filters.teacherId;
    const status = normalizeEBookletInstanceStatus(filters.status);
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.db.e_booklet_instances.findMany({
        where,
        include: {
          template: true,
          template_version: true,
          teacher: { select: { id: true, name: true, email: true } },
          devices: { select: { id: true, status: true } },
          _count: { select: { access_records: true, invites: true } },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.e_booklet_instances.count({ where }),
    ]);
    const instanceIds = data.map((instance: any) => Number(instance.id)).filter((id: number) => Number.isInteger(id));
    const studentRowsByInstance = includeStudents
      ? await this.getInstanceStudentRowsByInstanceId(instanceIds)
      : new Map<number, any[]>();
    return {
      data: data.map(({ devices = [], ...instance }: any) => ({
        ...instance,
        used_devices_count: devices.filter((device: any) => device.status === "active").length,
        students: includeStudents ? (studentRowsByInstance.get(Number(instance.id)) || []) : [],
      })),
      total,
      page,
      limit,
    };
  }

  private async getInstanceStudentRowsByInstanceId(instanceIds: number[]) {
    const uniqueInstanceIds = Array.from(new Set(instanceIds.filter((id) => Number.isInteger(id))));
    const rowsByInstance = new Map<number, any[]>();
    uniqueInstanceIds.forEach((id) => rowsByInstance.set(id, []));
    if (uniqueInstanceIds.length === 0) return rowsByInstance;

    const settings = await this.getGlobalSettings();
    const defaultAllowedStudentDevices = Number(settings.default_allowed_devices_per_student ?? 1);
    const accessRows = await this.db.e_booklet_access.findMany({
      where: { booklet_instance_id: { in: uniqueInstanceIds }, role: "student", status: "active" },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { granted_at: "desc" },
    });
    if (!accessRows?.length) return rowsByInstance;

    const studentIds = Array.from(new Set(accessRows
      .map((row: any) => Number(row.user_id ?? row.user?.id))
      .filter((id: number) => Number.isInteger(id))));
    const [devices, allowances, analyticsEvents, inviteRedemptions, codeRedemptions] = await Promise.all([
      this.db.e_booklet_devices.findMany({
        where: { booklet_instance_id: { in: uniqueInstanceIds }, user_id: { in: studentIds } },
        select: { id: true, booklet_instance_id: true, user_id: true, status: true, last_seen_at: true },
      }),
      this.db.e_booklet_device_allowances.findMany({
        where: { booklet_instance_id: { in: uniqueInstanceIds }, user_id: { in: studentIds } },
        select: { booklet_instance_id: true, user_id: true, allowed_devices: true },
      }),
      this.db.e_booklet_analytics_events.findMany({
        where: { booklet_instance_id: { in: uniqueInstanceIds }, student_id: { in: studentIds } },
        select: { booklet_instance_id: true, student_id: true, event_type: true, source: true, marketing_price_snapshot: true },
      }),
      this.db.e_booklet_invite_redemptions.findMany({
        where: { booklet_instance_id: { in: uniqueInstanceIds }, student_id: { in: studentIds } },
        select: { booklet_instance_id: true, student_id: true, invite_id: true, redeemed_at: true },
      }),
      this.db.e_booklet_access_code_redemptions?.findMany?.({
        where: { booklet_instance_id: { in: uniqueInstanceIds }, student_id: { in: studentIds } },
        select: { booklet_instance_id: true, student_id: true, access_code_id: true, purchase_id: true, counted_for_progress: true, redeemed_at: true },
      }) ?? [],
    ]);

    const keyFor = (instanceId: number, userId: number) => `${instanceId}:${userId}`;
    const rowInstanceId = (value: unknown) => {
      const id = Number(value);
      return Number.isInteger(id) ? id : uniqueInstanceIds[0];
    };
    const deviceSummaryByKey = new Map<string, { active_count: number; total_count: number; last_seen_at: Date | string | null }>();
    (devices || []).forEach((device: any) => {
      const key = keyFor(rowInstanceId(device.booklet_instance_id), Number(device.user_id));
      const current = deviceSummaryByKey.get(key) || { active_count: 0, total_count: 0, last_seen_at: null };
      current.total_count += 1;
      if (device.status === "active") current.active_count += 1;
      const nextLastSeen = device.last_seen_at ? new Date(device.last_seen_at) : null;
      const currentLastSeen = current.last_seen_at ? new Date(current.last_seen_at) : null;
      if (nextLastSeen && (!currentLastSeen || nextLastSeen > currentLastSeen)) current.last_seen_at = device.last_seen_at;
      deviceSummaryByKey.set(key, current);
    });

    const allowanceByKey = new Map<string, number>();
    (allowances || []).forEach((allowance: any) => allowanceByKey.set(keyFor(rowInstanceId(allowance.booklet_instance_id), Number(allowance.user_id)), Number(allowance.allowed_devices ?? 1)));

    const analyticsByKey = new Map<string, Record<string, any>>();
    (analyticsEvents || []).forEach((event: any) => {
      const key = keyFor(rowInstanceId(event.booklet_instance_id), Number(event.student_id));
      const current = analyticsByKey.get(key) || { invite_opened: 0, access_created: 0, viewer_opened: 0, page_viewed: 0, device_bound: 0, source: null, marketing_price_snapshot: null };
      if (event.event_type) current[event.event_type] = Number(current[event.event_type] ?? 0) + 1;
      if (!current.source && event.source) current.source = event.source;
      if (current.marketing_price_snapshot === null && event.marketing_price_snapshot !== null && event.marketing_price_snapshot !== undefined) current.marketing_price_snapshot = this.sanitizeViewerAccess(event.marketing_price_snapshot);
      analyticsByKey.set(key, current);
    });

    const purchaseReferenceByKey = new Map<string, Record<string, unknown>>();
    (inviteRedemptions || []).forEach((redemption: any) => {
      const key = keyFor(Number(redemption.booklet_instance_id), Number(redemption.student_id));
      if (!purchaseReferenceByKey.has(key)) purchaseReferenceByKey.set(key, { source: "invite", invite_id: redemption.invite_id, purchase_id: null, redeemed_at: redemption.redeemed_at ?? null });
    });
    (codeRedemptions || []).forEach((redemption: any) => {
      const key = keyFor(Number(redemption.booklet_instance_id), Number(redemption.student_id));
      if (!purchaseReferenceByKey.has(key)) purchaseReferenceByKey.set(key, { source: "access_code", access_code_id: redemption.access_code_id, purchase_id: redemption.purchase_id ?? null, counted_for_progress: Boolean(redemption.counted_for_progress), redeemed_at: redemption.redeemed_at ?? null });
    });

    (accessRows || []).forEach((row: any) => {
      const instanceId = Number(row.booklet_instance_id);
      const userId = Number(row.user_id ?? row.user?.id);
      const key = keyFor(instanceId, userId);
      const devicesSummary = deviceSummaryByKey.get(key) || { active_count: 0, total_count: 0, last_seen_at: null };
      const analyticsSummary = analyticsByKey.get(key) || { invite_opened: 0, access_created: 0, viewer_opened: 0, page_viewed: 0, device_bound: 0, source: row.access_source ?? null, marketing_price_snapshot: null };
      rowsByInstance.get(instanceId)?.push(this.sanitizeViewerAccess({
        ...row,
        devices_summary: { ...devicesSummary, allowed_devices: allowanceByKey.get(key) ?? defaultAllowedStudentDevices },
        analytics_summary: analyticsSummary,
        purchase_reference: purchaseReferenceByKey.get(key) || null,
      }));
    });

    return rowsByInstance;
  }

  async updateQuota(instanceId: number, inviteQuota: number): Promise<unknown> {
    const instance = await this.db.e_booklet_instances.findUnique({
      where: { id: instanceId },
      select: { id: true },
    });
    if (!instance) throw new NotFoundError("Teacher e-booklet not found");
    const reservedSeats = await this.countReservedStudentSeats(this.db, instanceId);
    if (inviteQuota < reservedSeats) {
      throw new BadRequestError("Invite quota cannot be below existing student seats or pending reservations.");
    }
    return this.db.e_booklet_instances.update({
      where: { id: instanceId },
      data: { invite_quota: inviteQuota, updated_at: new Date() },
    });
  }

  async archiveExpiredInstances(now = new Date(), options: { dryRun?: boolean } = {}) {
    const where = { status: "active", access_expires_at: { lte: now } };
    if (options.dryRun) {
      const count = await this.db.e_booklet_instances.count({ where });
      return { count, dryRun: true };
    }
    return this.db.e_booklet_instances.updateMany({
      where,
      data: {
        status: "archived",
        archived_at: now,
        archive_reason: "expired",
        updated_at: now,
      },
    });
  }

  async createInvite(instanceId: number, teacherId: number, dto: any) {
    const instance = await this.db.e_booklet_instances.findFirst({
      where: { id: instanceId, teacher_id: teacherId, status: "active" },
    });
    if (!instance) throw new NotFoundError("Teacher e-booklet not found");

    const { generateInviteToken } = await import("../utils/e-booklet-token");
    const token = generateInviteToken();
    const generatedPasscode = dto.require_passcode && !dto.passcode
      ? String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")
      : undefined;
    const passcode = dto.passcode ?? generatedPasscode;
    const settings = await this.getGlobalSettings();
    const expiresAt = dto.expires_at
      ? new Date(dto.expires_at)
      : this.addDaysFromNow(settings.default_invite_expiration_days);
    const invite = await this.db.e_booklet_invites.create({
      data: {
        booklet_instance_id: instanceId,
        teacher_id: teacherId,
        token_hash: hashInviteToken(token),
        share_token_ciphertext: encryptInviteShareToken(token),
        passcode_hash: passcode ? this.hashPasscode(passcode) : undefined,
        passcode_ciphertext: passcode ? encryptInvitePasscode(passcode) : undefined,
        passcode_hint: dto.passcode_hint,
        max_uses: dto.max_uses,
        expires_at: expiresAt,
        status: "active",
      },
      select: {
        id: true,
        booklet_instance_id: true,
        teacher_id: true,
        passcode_hash: true,
        passcode_ciphertext: true,
        passcode_hint: true,
        max_uses: true,
        used_count: true,
        expires_at: true,
        status: true,
        created_at: true,
      },
    });
    const safeInvite = {
      id: invite.id,
      booklet_instance_id: invite.booklet_instance_id,
      teacher_id: invite.teacher_id,
      passcode_hint: invite.passcode_hint,
      max_uses: invite.max_uses,
      used_count: invite.used_count,
      expires_at: invite.expires_at,
      status: invite.status,
      created_at: invite.created_at,
      has_passcode: Boolean(invite.passcode_hash),
    };
    return generatedPasscode
      ? { invite: safeInvite, token, passcode: generatedPasscode }
      : { invite: safeInvite, token };
  }

  async listInvites(instanceId: number, teacherId: number): Promise<unknown[]> {
    const invites = await this.db.e_booklet_invites.findMany({
      where: { booklet_instance_id: instanceId, teacher_id: teacherId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        booklet_instance_id: true,
        teacher_id: true,
        share_token_ciphertext: true,
        passcode_hash: true,
        passcode_ciphertext: true,
        passcode_hint: true,
        max_uses: true,
        used_count: true,
        expires_at: true,
        status: true,
        created_at: true,
      },
    });
    return invites.map(({ share_token_ciphertext: shareTokenCiphertext, passcode_hash: passcodeHash, passcode_ciphertext: passcodeCiphertext, ...invite }) => ({
      ...invite,
      token: decryptInviteShareToken(shareTokenCiphertext),
      passcode: decryptInvitePasscode(passcodeCiphertext),
      has_passcode: Boolean(passcodeHash),
    }));
  }

  async disableInvite(inviteId: number, teacherId: number): Promise<unknown> {
    return this.db.e_booklet_invites.updateMany({
      where: { id: inviteId, teacher_id: teacherId },
      data: { status: "disabled" },
    });
  }

  async listInstanceStudents(instanceId: number, teacherId?: number) {
    const instanceWhere: Record<string, unknown> = { id: instanceId };
    if (teacherId) instanceWhere.teacher_id = teacherId;
    const instance = await this.db.e_booklet_instances.findFirst({
      where: instanceWhere,
      select: { id: true },
    });
    if (!instance) throw new NotFoundError("Teacher e-booklet not found");

    return (await this.getInstanceStudentRowsByInstanceId([instanceId])).get(instanceId) || [];
  }

  async revokeStudentAccess(
    instanceId: number,
    studentId: number,
    actorUserId: number,
  ): Promise<unknown> {
    const instance = await this.db.e_booklet_instances.findFirst({
      where: { id: instanceId, teacher_id: actorUserId },
      select: { id: true },
    });
    if (!instance) throw new NotFoundError("Teacher e-booklet not found");

    const revokedAt = new Date();
    await this.db.e_booklet_audit_logs.create({
      data: {
        actor_user_id: actorUserId,
        action: "student_access_revoked",
        entity_type: "e_booklet_instance",
        entity_id: instanceId,
        metadata_json: { student_id: studentId },
      },
    });
    return this.db.e_booklet_access.updateMany({
      where: {
        booklet_instance_id: instanceId,
        user_id: studentId,
        role: "student",
        status: "active",
      },
      data: { status: "revoked", revoked_at: revokedAt },
    });
  }

  async listUserEBooklets(userId: number, role: "teacher" | "student") {
    const access = await this.db.e_booklet_access.findMany({
      where: {
        user_id: userId,
        role,
        status: "active",
      },
      include: {
        booklet_instance: {
          include: {
            template: true,
            template_version: true,
            teacher: { select: { id: true, name: true } },
            devices: { select: { id: true, status: true } },
          },
        },
      },
      orderBy: { granted_at: "desc" },
    });
    const withDeviceCounts = access.map(({ booklet_instance: bookletInstance, ...record }: any) => {
      const { devices = [], ...safeInstance } = bookletInstance ?? {};
      const resolvedTitle = resolveInstanceDisplayTitle(safeInstance);
      return {
        ...record,
        // Surface the instance deadline on the access record as the student-facing
        // access contract. This keeps the portal independent of nested instance
        // serialization details while retaining the nested value for existing clients.
        access_expires_at: safeInstance.access_expires_at ?? null,
        booklet_instance: {
          ...safeInstance,
          display_title: resolvedTitle || safeInstance.display_title,
          used_devices_count: devices.filter((device: any) => device.status === "active").length,
        },
      };
    });
    return this.sanitizeViewerAccess(withDeviceCounts);
  }

  async assertViewerAccess(instanceId: number, userId: number, now = new Date()) {
    const access = await this.db.e_booklet_access.findFirst({
      where: {
        booklet_instance_id: instanceId,
        user_id: userId,
        status: "active",
      },
      include: {
        booklet_instance: {
          include: {
            template: true,
            template_version: true,
            teacher: { select: { id: true, name: true } },
            purchase: { select: { id: true, status: true } },
          },
        },
      },
    });
    if (!access || access.booklet_instance?.status !== "active") {
      throw new ForbiddenError("You do not have access to this e-booklet.");
    }
    if ((access as any).role === "teacher" && access.booklet_instance?.purchase_id) {
      const purchaseStatus = String((access as any).booklet_instance?.purchase?.status || "");
      if (purchaseStatus !== "delivered") {
        throw new ForbiddenError("This e-booklet is not available until payment is confirmed and customization is complete.");
      }
    }
    const expiresAt = access.booklet_instance?.access_expires_at
      ? new Date(access.booklet_instance.access_expires_at)
      : null;
    if (expiresAt && expiresAt <= now) {
      await this.db.e_booklet_instances.update({
        where: { id: access.booklet_instance.id },
        data: {
          status: "archived",
          archived_at: now,
          archive_reason: "expired",
          updated_at: now,
        },
      });
      throw new ForbiddenError("This e-booklet has expired.");
    }
    if (access.booklet_instance) {
      const resolvedTitle = resolveInstanceDisplayTitle(access.booklet_instance);
      if (resolvedTitle) {
        access.booklet_instance.display_title = resolvedTitle;
      }
    }
    return this.sanitizeViewerAccess(access);
  }

  async listViewerDevices(instanceId: number, userId: number) {
    return this.db.e_booklet_devices.findMany({
      where: { booklet_instance_id: instanceId, user_id: userId, status: "active" },
      select: {
        id: true,
        booklet_instance_id: true,
        user_id: true,
        device_label: true,
        status: true,
        first_seen_at: true,
        last_seen_at: true,
      },
      orderBy: { last_seen_at: "desc" },
    });
  }

  async bindViewerDevice(
    instanceId: number,
    userId: number,
    input: {
      deviceFingerprint: string;
      deviceLabel?: string;
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    const access = await this.assertViewerAccess(instanceId, userId);
    const settings = await this.getGlobalSettings();
    return this.serializableTransaction(async (tx: EBookletDb) => {
      const existing = await tx.e_booklet_devices.findFirst({
        where: {
          booklet_instance_id: instanceId,
          user_id: userId,
          device_fingerprint: input.deviceFingerprint,
          status: "active",
        },
      });
      if (existing) {
        return tx.e_booklet_devices.update({
          where: { id: existing.id },
          data: {
            last_seen_at: new Date(),
            user_agent: input.userAgent,
            ip_address: input.ipAddress,
          },
        });
      }

      const allowance = await tx.e_booklet_device_allowances.findUnique({
        where: {
          booklet_instance_id_user_id: {
            booklet_instance_id: instanceId,
            user_id: userId,
          },
        },
      });
      const defaultAllowedDevices = (access as any).role === "teacher"
        ? settings.default_allowed_devices_per_teacher
        : settings.default_allowed_devices_per_student;
      const allowedDevices = Number(allowance?.allowed_devices ?? defaultAllowedDevices ?? 1);
      const activeCount = await tx.e_booklet_devices.count({
        where: { booklet_instance_id: instanceId, user_id: userId, status: "active" },
      });
      if (activeCount >= allowedDevices) {
        throw new ForbiddenError(
          "This e-booklet is already bound to another device.",
        );
      }
      const reusableDevice = await tx.e_booklet_devices.findFirst({
        where: {
          booklet_instance_id: instanceId,
          user_id: userId,
          device_fingerprint: input.deviceFingerprint,
          status: { not: "active" },
        },
      });
      if (reusableDevice) {
        const reactivatedDevice = await tx.e_booklet_devices.update({
          where: { id: reusableDevice.id },
          data: {
            status: "active",
            device_label: input.deviceLabel,
            user_agent: input.userAgent,
            ip_address: input.ipAddress,
            last_seen_at: new Date(),
          },
        });
        await this.recordAnalyticsEvent(tx, {
          event_type: "device_bound",
          teacher_id: (access as any).booklet_instance?.teacher_id,
          student_id: userId,
          template_id: (access as any).booklet_instance?.template_id,
          booklet_instance_id: instanceId,
          access_id: (access as any).id,
          source: (access as any).access_source,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: { device_label_present: Boolean(input.deviceLabel), binding_type: "reactivated" },
        });
        return reactivatedDevice;
      }
      try {
        const createdDevice = await tx.e_booklet_devices.create({
          data: {
            booklet_instance_id: instanceId,
            user_id: userId,
            device_fingerprint: input.deviceFingerprint,
            device_label: input.deviceLabel,
            user_agent: input.userAgent,
            ip_address: input.ipAddress,
            last_seen_at: new Date(),
            status: "active",
          },
        });
        await this.recordAnalyticsEvent(tx, {
          event_type: "device_bound",
          teacher_id: (access as any).booklet_instance?.teacher_id,
          student_id: userId,
          template_id: (access as any).booklet_instance?.template_id,
          booklet_instance_id: instanceId,
          access_id: (access as any).id,
          source: (access as any).access_source,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: { device_label_present: Boolean(input.deviceLabel), binding_type: "created" },
        });
        return createdDevice;
      } catch (error: any) {
        if (error?.code === "P2002") {
          throw new ForbiddenError(
            "This e-booklet is already bound to another device.",
          );
        }
        throw error;
      }
    });
  }

  async resetViewerDevices(
    instanceId: number,
    userId: number,
    adminUserId: number,
    reason?: string,
  ) {
    const normalizedReason = requireDeviceAdminReason(reason);
    const settings = await this.getGlobalSettings();
    const result = await this.db.e_booklet_devices.updateMany({
      where: { booklet_instance_id: instanceId, user_id: userId, status: "active" },
      data: {
        status: "reset",
        reset_by_admin_id: adminUserId,
        reset_reason: normalizedReason,
        last_seen_at: new Date(),
      },
    });
    await this.auditSafely(this.db, {
      actor_user_id: adminUserId,
      action: "viewer_devices_reset",
      entity_type: "e_booklet_instance",
      entity_id: instanceId,
      metadata_json: {
        user_id: userId,
        reason: normalizedReason,
        reset_count: result?.count ?? 0,
        device_reset_policy: settings.device_reset_policy ?? null,
      },
    });
    return result;
  }

  async addDeviceAllowance(
    instanceId: number,
    userId: number,
    adminUserId: number,
    allowedDevices: number,
    reason?: string,
  ) {
    if (!Number.isInteger(allowedDevices) || allowedDevices < 1) {
      throw new BadRequestError("Allowed devices must be at least 1.");
    }
    const normalizedReason = requireDeviceAdminReason(reason);
    const allowance = await this.db.e_booklet_device_allowances.upsert({
      where: {
        booklet_instance_id_user_id: {
          booklet_instance_id: instanceId,
          user_id: userId,
        },
      },
      create: {
        booklet_instance_id: instanceId,
        user_id: userId,
        allowed_devices: allowedDevices,
        updated_by_admin_id: adminUserId,
        reason: normalizedReason,
        updated_at: new Date(),
      },
      update: {
        allowed_devices: allowedDevices,
        updated_by_admin_id: adminUserId,
        reason: normalizedReason,
        updated_at: new Date(),
      },
    });
    await this.auditSafely(this.db, {
      actor_user_id: adminUserId,
      action: "viewer_device_allowance_updated",
      entity_type: "e_booklet_instance",
      entity_id: instanceId,
      metadata_json: { user_id: userId, allowed_devices: allowedDevices, reason: normalizedReason },
    });
    return allowance;
  }

  private async getAdminViewerAccess(instanceId: number) {
    const instance = await this.db.e_booklet_instances.findUnique({
      where: { id: instanceId },
      include: {
        template: true,
        template_version: true,
        teacher: { select: { id: true, name: true } },
      },
    });
    if (!instance || instance.status === "revoked") {
      throw new NotFoundError("E-booklet instance not found.");
    }
    return this.sanitizeViewerAccess({
      id: 0,
      status: "active",
      access_source: "admin_view",
      admin_view_mode: true,
      booklet_instance_id: instanceId,
      booklet_instance: instance,
    });
  }

  private async getPublicViewerAccess(instanceId: number) {
    const instance = await this.db.e_booklet_instances.findUnique({
      where: { id: instanceId },
      include: {
        template: true,
        template_version: true,
        teacher: { select: { id: true, name: true } },
        purchase: { select: { id: true, status: true } },
      },
    });
    if (!instance || instance.status !== "active" || instance.purchase?.status !== "delivered") {
      throw new NotFoundError("E-booklet instance not found.");
    }
    const { purchase: _purchase, ...safeInstance } = instance as any;
    return this.sanitizeViewerAccess({
      id: 0,
      status: "active",
      access_source: "public_view",
      public_view_mode: true,
      booklet_instance_id: instanceId,
      booklet_instance: safeInstance,
    });
  }

  async getPublicViewerMetadata(instanceId: number) {
    return this.getPublicViewerAccess(instanceId);
  }

  async getAdminViewerMetadata(instanceId: number, adminUserId: number) {
    const access = await this.getAdminViewerAccess(instanceId);
    await this.db.e_booklet_audit_logs.create({
      data: {
        actor_user_id: adminUserId,
        action: "admin_view_opened",
        entity_type: "e_booklet_instance",
        entity_id: instanceId,
      },
    });
    return access;
  }

  private resolveViewerDocumentAssetId(instance: any): number | null {
    const assetId =
      instance?.custom_document_file_id ??
      instance?.template_version?.rendered_document_file_id ??
      instance?.template_version?.base_document_file_id ??
      null;
    return assetId ? Number(assetId) : null;
  }

  private resolveViewerDocumentAssetIds(instance: any): number[] {
    return [
      instance?.custom_document_file_id,
      instance?.template_version?.rendered_document_file_id,
      instance?.template_version?.base_document_file_id,
    ]
      .map((assetId) => Number(assetId))
      .filter((assetId, index, assetIds) => Number.isInteger(assetId) && assetId > 0 && assetIds.indexOf(assetId) === index);
  }

  async getAdminViewerPage(instanceId: number, pageNumber: number, adminUserId: number) {
    const access: any = await this.getAdminViewerAccess(instanceId);
    const pageCount = Number(access.booklet_instance?.template_version?.page_count || 0);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new BadRequestError("Invalid e-booklet page number.");
    }
    const documentAssetId = this.resolveViewerDocumentAssetId(access.booklet_instance);
    if (!documentAssetId) {
      throw new NotFoundError("E-booklet document is not available.");
    }
    const expiresAt = new Date(Date.now() + VIEWER_PAGE_TOKEN_TTL_MS);
    await this.db.e_booklet_audit_logs.create({
      data: {
        actor_user_id: adminUserId,
        action: "admin_page_viewed",
        entity_type: "e_booklet_instance",
        entity_id: instanceId,
        metadata_json: { page_number: pageNumber },
      },
    });
    return {
      pageNumber,
      renderMode: "pdf-document",
      documentAssetId,
      pageAccessToken: createViewerPageToken({ instanceId, pageNumber, userId: adminUserId, expiresAt }),
      expiresAt,
      cacheControl: "private, no-store",
      adminViewMode: true,
      watermark: {
        teacherName: access.booklet_instance?.teacher?.name || null,
        templateTitle: access.booklet_instance?.template?.title || null,
      },
      message: "Admin View Mode: previewing the delivered e-booklet without consuming a student seat or binding a device.",
    };
  }

  async getAdminViewerPageHotspots(instanceId: number, pageNumber: number) {
    const access: any = await this.getAdminViewerAccess(instanceId);
    const hotspots = await this.db.e_booklet_hotspots.findMany({
      where: {
        template_version_id: access.booklet_instance.template_version_id,
        page_number: pageNumber,
        is_active: true,
      },
      orderBy: { sort_order: "asc" },
    });
    return hotspots.map((hotspot: any) => this.normalizeHotspotRecord(hotspot));
  }

  async getAdminHotspotContent(instanceId: number, hotspotId: number) {
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
      include: {
        asset_file: true,
        template_version: {
          include: {
            instances: {
              where: { id: instanceId },
              take: 1,
            },
          },
        },
      },
    });
    if (!hotspot || hotspot.is_active === false || !hotspot.template_version.instances.length) {
      throw new NotFoundError("E-booklet hotspot not found for this instance.");
    }
    return this.serializeHotspotContent(hotspot);
  }

  async getAdminAuthorizedHotspotAsset(instanceId: number, hotspotId: number, assetId: number) {
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
      include: {
        template_version: {
          include: {
            instances: {
              where: { id: instanceId },
              take: 1,
            },
          },
        },
      },
    });
    const referencedAssetIds = new Set<number>();
    if (hotspot?.asset_file_id) referencedAssetIds.add(Number(hotspot.asset_file_id));
    const blocks = Array.isArray(hotspot?.content_json?.blocks) ? hotspot.content_json.blocks : [];
    blocks.forEach((block: any) => {
      if (block?.asset_file_id) referencedAssetIds.add(Number(block.asset_file_id));
    });
    if (
      !hotspot ||
      hotspot.is_active === false ||
      !referencedAssetIds.has(assetId) ||
      !hotspot.template_version?.instances?.length
    ) {
      throw new ForbiddenError("You do not have access to this hotspot asset.");
    }
    const asset = await this.db.e_booklet_file_assets.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError("E-booklet file asset not found");
    const filename = path.basename(asset.storage_key || "");
    return {
      asset: {
        id: asset.id,
        file_type: asset.file_type,
        original_filename: asset.original_filename,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
        visibility: asset.visibility,
      },
      absolutePath: path.join(E_BOOKLET_UPLOAD_DIR, filename),
      cacheControl: "private, no-store",
    };
  }

  private async extractSinglePagePdf(absolutePath: string, pageNumber: number) {
    try {
      const sourceBytes = await fsPromises.readFile(absolutePath);
      const sourceDocument = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      const pageCount = sourceDocument.getPageCount();
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
        throw new BadRequestError("Invalid e-booklet page number.");
      }

      const pageDocument = await PDFDocument.create();
      const [page] = await pageDocument.copyPages(sourceDocument, [pageNumber - 1]);
      pageDocument.addPage(page);
      return Buffer.from(await pageDocument.save({ updateFieldAppearances: false }));
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError("The e-booklet PDF page could not be rendered. Please contact support.");
    }
  }

  private async buildViewerDocumentResponse(instance: any, pageNumber?: number) {
    const documentAssetIds = this.resolveViewerDocumentAssetIds(instance);
    if (!documentAssetIds.length) {
      throw new NotFoundError("E-booklet document is not available.");
    }
    let sawPdfAsset = false;
    for (const documentAssetId of documentAssetIds) {
      const asset = await this.db.e_booklet_file_assets.findUnique({ where: { id: documentAssetId } });
      if (!asset || asset.mime_type !== "application/pdf") continue;
      sawPdfAsset = true;
      const filename = path.basename(asset.storage_key || "");
      const absolutePath = path.join(E_BOOKLET_UPLOAD_DIR, filename);
      let pageBuffer: Buffer | null = null;
      if (isR2Enabled()) {
        // Served straight from R2 via the storage key; only pull the file
        // locally when a single page must be extracted.
        if (pageNumber) {
          let local;
          try {
            local = await this.resolveAssetLocalFile(asset);
          } catch {
            continue; // object missing on R2 — try the next document asset
          }
          try {
            pageBuffer = await this.extractSinglePagePdf(local.path, pageNumber);
          } finally {
            await local.cleanup();
          }
        }
      } else {
        try {
          await fsPromises.access(absolutePath);
        } catch {
          continue;
        }
        pageBuffer = pageNumber
          ? await this.extractSinglePagePdf(absolutePath, pageNumber)
          : null;
      }
      return {
        asset: {
          id: asset.id,
          file_type: asset.file_type,
          original_filename: pageNumber
            ? `${path.basename(asset.original_filename || "e-booklet-document", ".pdf")}-page-${pageNumber}.pdf`
            : asset.original_filename,
          mime_type: asset.mime_type,
          size_bytes: asset.size_bytes,
          visibility: asset.visibility,
        },
        absolutePath,
        pageBuffer,
        cacheControl: "private, no-store",
      };
    }
    throw new NotFoundError(sawPdfAsset ? "E-booklet PDF file is not available." : "E-booklet PDF document not found.");
  }

  private async buildViewerDocumentPagePreviewResponse(instance: any, pageNumber: number) {
    const documentAssetIds = this.resolveViewerDocumentAssetIds(instance);
    if (!documentAssetIds.length) {
      throw new NotFoundError("E-booklet document is not available.");
    }
    let sawPdfAsset = false;
    for (const documentAssetId of documentAssetIds) {
      const asset = await this.db.e_booklet_file_assets.findUnique({ where: { id: documentAssetId } });
      if (!asset || asset.mime_type !== "application/pdf") continue;
      sawPdfAsset = true;
      try {
        const result = await this.getPagePreviewForDocumentAsset(asset, pageNumber, instance?.template_version_id);
        return { ...result, cacheControl: "private, no-store" };
      } catch (error) {
        if (error instanceof NotFoundError) continue;
        throw error;
      }
    }
    throw new NotFoundError(sawPdfAsset ? "E-booklet page preview is not ready yet." : "E-booklet PDF document not found.");
  }

  async getAdminAuthorizedViewerDocument(instanceId: number, pageNumber: number, pageAccessToken: string, adminUserId: number) {
    verifyViewerPageToken({ token: pageAccessToken, instanceId, pageNumber, userId: adminUserId });
    const access: any = await this.getAdminViewerAccess(instanceId);
    return this.buildViewerDocumentResponse(access.booklet_instance, pageNumber);
  }

  async getAdminAuthorizedViewerDocumentPagePreview(instanceId: number, pageNumber: number, pageAccessToken: string, adminUserId: number) {
    verifyViewerPageToken({ token: pageAccessToken, instanceId, pageNumber, userId: adminUserId });
    const access: any = await this.getAdminViewerAccess(instanceId);
    return this.buildViewerDocumentPagePreviewResponse(access.booklet_instance, pageNumber);
  }

  async getPublicAuthorizedViewerDocument(instanceId: number, pageNumber: number, pageAccessToken: string) {
    verifyViewerPageToken({ token: pageAccessToken, instanceId, pageNumber, userId: 0 });
    const access: any = await this.getPublicViewerAccess(instanceId);
    return this.buildViewerDocumentResponse(access.booklet_instance, pageNumber);
  }

  async getPublicAuthorizedViewerDocumentPagePreview(instanceId: number, pageNumber: number, pageAccessToken: string) {
    verifyViewerPageToken({ token: pageAccessToken, instanceId, pageNumber, userId: 0 });
    const access: any = await this.getPublicViewerAccess(instanceId);
    return this.buildViewerDocumentPagePreviewResponse(access.booklet_instance, pageNumber);
  }

  async getAuthorizedViewerDocument(instanceId: number, userId: number, pageNumber: number, pageAccessToken: string) {
    verifyViewerPageToken({ token: pageAccessToken, instanceId, pageNumber, userId });
    const access: any = await this.assertViewerAccess(instanceId, userId);
    return this.buildViewerDocumentResponse(access.booklet_instance, pageNumber);
  }

  async getAuthorizedViewerDocumentPagePreview(instanceId: number, userId: number, pageNumber: number, pageAccessToken: string) {
    verifyViewerPageToken({ token: pageAccessToken, instanceId, pageNumber, userId });
    const access: any = await this.assertViewerAccess(instanceId, userId);
    return this.buildViewerDocumentPagePreviewResponse(access.booklet_instance, pageNumber);
  }

  async getViewerMetadata(instanceId: number, userId: number) {
    const access = await this.assertViewerAccess(instanceId, userId);
    await this.db.e_booklet_audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "booklet_opened",
        entity_type: "e_booklet_instance",
        entity_id: instanceId,
      },
    });
    await this.recordAnalyticsEvent(this.db, {
      event_type: "viewer_opened",
      teacher_id: (access as any).booklet_instance?.teacher_id,
      student_id: userId,
      template_id: (access as any).booklet_instance?.template_id,
      booklet_instance_id: instanceId,
      access_id: (access as any).id,
      source: (access as any).access_source,
    });
    return access;
  }

  async getPublicViewerPage(instanceId: number, pageNumber: number) {
    const access: any = await this.getPublicViewerAccess(instanceId);
    const pageCount = Number(access.booklet_instance?.template_version?.page_count || 0);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new BadRequestError("Invalid e-booklet page number.");
    }
    const expiresAt = new Date(Date.now() + VIEWER_PAGE_TOKEN_TTL_MS);
    const documentAssetId = this.resolveViewerDocumentAssetId(access.booklet_instance);
    if (!documentAssetId) {
      throw new NotFoundError("E-booklet document is not available.");
    }
    return {
      pageNumber,
      renderMode: "pdf-document",
      documentAssetId,
      pageAccessToken: createViewerPageToken({ instanceId, pageNumber, userId: 0, expiresAt }),
      expiresAt,
      cacheControl: "private, no-store",
      watermark: {
        teacherName: access.booklet_instance?.teacher?.name || null,
        templateTitle: access.booklet_instance?.template?.title || null,
      },
      message: null,
    };
  }

  async getViewerPage(instanceId: number, pageNumber: number, userId: number) {
    const access: any = await this.assertViewerAccess(instanceId, userId);
    const pageCount = Number(
      access.booklet_instance?.template_version?.page_count || 0,
    );
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new BadRequestError("Invalid e-booklet page number.");
    }

    const expiresAt = new Date(Date.now() + VIEWER_PAGE_TOKEN_TTL_MS);
    await this.db.e_booklet_audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "page_viewed",
        entity_type: "e_booklet_instance",
        entity_id: instanceId,
        metadata_json: { page_number: pageNumber },
      },
    });
    await this.recordAnalyticsEvent(this.db, {
      event_type: "page_viewed",
      teacher_id: access.booklet_instance?.teacher_id,
      student_id: userId,
      template_id: access.booklet_instance?.template_id,
      booklet_instance_id: instanceId,
      access_id: access.id,
      source: access.access_source,
      metadata: { page_number: pageNumber },
    });
    const documentAssetId = this.resolveViewerDocumentAssetId(access.booklet_instance);
    if (!documentAssetId) {
      throw new NotFoundError("E-booklet document is not available.");
    }
    return {
      pageNumber,
      renderMode: "pdf-document",
      documentAssetId,
      pageAccessToken: createViewerPageToken({
        instanceId,
        pageNumber,
        userId,
        expiresAt,
      }),
      expiresAt,
      cacheControl: "private, no-store",
      watermark: {
        teacherName: access.booklet_instance?.teacher?.name || null,
        templateTitle: access.booklet_instance?.template?.title || null,
      },
      message: null,
    };
  }

  async getViewerPageHotspots(
    instanceId: number,
    pageNumber: number,
    userId: number,
  ) {
    const access: any = await this.assertViewerAccess(instanceId, userId);
    const hotspots = await this.db.e_booklet_hotspots.findMany({
      where: {
        template_version_id: access.booklet_instance.template_version_id,
        page_number: pageNumber,
        is_active: true,
      },
      orderBy: { sort_order: "asc" },
    });
    return hotspots.map((hotspot: any) => this.normalizeHotspotRecord(hotspot));
  }

  async getPublicViewerPageHotspots(instanceId: number, pageNumber: number) {
    const access: any = await this.getPublicViewerAccess(instanceId);
    const hotspots = await this.db.e_booklet_hotspots.findMany({
      where: {
        template_version_id: access.booklet_instance.template_version_id,
        page_number: pageNumber,
        is_active: true,
      },
      orderBy: { sort_order: "asc" },
    });
    return hotspots.map((hotspot: any) => this.normalizeHotspotRecord(hotspot));
  }

  async getAuthorizedHotspotAsset(instanceId: number, hotspotId: number, assetId: number, userId: number) {
    const access: any = await this.assertViewerAccess(instanceId, userId);
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
    });
    const referencedAssetIds = new Set<number>();
    if (hotspot?.asset_file_id) referencedAssetIds.add(Number(hotspot.asset_file_id));
    const blocks = Array.isArray(hotspot?.content_json?.blocks)
      ? hotspot.content_json.blocks
      : [];
    blocks.forEach((block: any) => {
      if (block?.asset_file_id) referencedAssetIds.add(Number(block.asset_file_id));
    });

    if (
      !hotspot ||
      Number(hotspot.template_version_id) !== Number(access.booklet_instance?.template_version_id) ||
      hotspot.is_active === false ||
      !referencedAssetIds.has(assetId)
    ) {
      throw new ForbiddenError("You do not have access to this hotspot asset.");
    }

    const asset = await this.db.e_booklet_file_assets.findUnique({
      where: { id: assetId },
    });
    if (!asset) throw new NotFoundError("E-booklet file asset not found");

    await this.db.e_booklet_audit_logs.create({
      data: {
        actor_user_id: userId,
        action: "hotspot_file_downloaded",
        entity_type: "e_booklet_hotspot",
        entity_id: hotspotId,
        metadata_json: { asset_id: assetId, booklet_instance_id: instanceId },
      },
    });

    const filename = path.basename(asset.storage_key || "");
    return {
      asset: {
        id: asset.id,
        file_type: asset.file_type,
        original_filename: asset.original_filename,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
        visibility: asset.visibility,
      },
      absolutePath: path.join(E_BOOKLET_UPLOAD_DIR, filename),
      cacheControl: "private, no-store",
    };
  }

  async getPublicHotspotAsset(instanceId: number, hotspotId: number, assetId: number) {
    const access: any = await this.getPublicViewerAccess(instanceId);
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
    });
    const referencedAssetIds = new Set<number>();
    if (hotspot?.asset_file_id) referencedAssetIds.add(Number(hotspot.asset_file_id));
    const blocks = Array.isArray(hotspot?.content_json?.blocks)
      ? hotspot.content_json.blocks
      : [];
    blocks.forEach((block: any) => {
      if (block?.asset_file_id) referencedAssetIds.add(Number(block.asset_file_id));
    });

    if (
      !hotspot ||
      Number(hotspot.template_version_id) !== Number(access.booklet_instance?.template_version_id) ||
      hotspot.is_active === false ||
      !referencedAssetIds.has(assetId)
    ) {
      throw new ForbiddenError("You do not have access to this hotspot asset.");
    }

    const asset = await this.db.e_booklet_file_assets.findUnique({
      where: { id: assetId },
    });
    if (!asset) throw new NotFoundError("E-booklet file asset not found");

    const filename = path.basename(asset.storage_key || "");
    return {
      asset: {
        id: asset.id,
        file_type: asset.file_type,
        original_filename: asset.original_filename,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
        visibility: asset.visibility,
      },
      absolutePath: path.join(E_BOOKLET_UPLOAD_DIR, filename),
      cacheControl: "private, no-store",
    };
  }

  async getHotspotContent(instanceId: number, hotspotId: number, userId: number) {
    const access: any = await this.assertViewerAccess(instanceId, userId);
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
      include: {
        asset_file: true,
      },
    });
    if (
      !hotspot ||
      Number(hotspot.template_version_id) !== Number(access.booklet_instance?.template_version_id) ||
      hotspot.is_active === false
    ) {
      throw new ForbiddenError("You do not have access to this hotspot.");
    }
    return this.serializeHotspotContent(hotspot);
  }

  async getPublicHotspotContent(instanceId: number, hotspotId: number) {
    const access: any = await this.getPublicViewerAccess(instanceId);
    const hotspot = await this.db.e_booklet_hotspots.findUnique({
      where: { id: hotspotId },
      include: {
        asset_file: true,
      },
    });
    if (
      !hotspot ||
      Number(hotspot.template_version_id) !== Number(access.booklet_instance?.template_version_id) ||
      hotspot.is_active === false
    ) {
      throw new ForbiddenError("You do not have access to this hotspot.");
    }
    return this.serializeHotspotContent(hotspot, { is_locked: false });
  }

  async validateTeacherDocumentForDelivery(
    input: ValidateTeacherDocumentInput,
  ): Promise<{ valid: true; warnings: string[] }> {
    const templateVersion = await this.db.e_booklet_template_versions.findUnique({
      where: { id: input.templateVersionId },
      select: {
        id: true,
        page_count: true,
        page_dimensions_json: true,
        base_document_file_id: true,
        rendered_document_file_id: true,
      },
    });

    if (!templateVersion) {
      throw new NotFoundError("E-booklet template version not found");
    }

    const documentAssetId =
      input.deliveredDocumentAssetId ??
      templateVersion.rendered_document_file_id ??
      templateVersion.base_document_file_id ??
      null;
    if (!documentAssetId) {
      throw new BadRequestError("A PDF document is required before delivering this e-booklet.");
    }

    if (templateVersion.page_count !== input.uploadedPageCount) {
      throw new BadRequestError(
        `This file does not match the selected e-booklet template. Expected: ${templateVersion.page_count} pages. Uploaded file: ${input.uploadedPageCount} pages. Please upload a file with the same number of pages.`,
      );
    }

    const expectedDimensions =
      templateVersion.page_dimensions_json as PageDimensions[] | null;
    const warnings: string[] = [];

    if (dimensionsDiffer(expectedDimensions, input.uploadedPageDimensions)) {
      warnings.push(
        "This file has the same page count, but some page dimensions differ from the template. Hotspot positions may not align correctly.",
      );
    }

    return { valid: true, warnings };
  }

  private requireStudentTerms(input: TermsInput): void {
    if (!input.termsAccepted) {
      throw new BadRequestError("Student terms acceptance is required.");
    }
  }

  private async recordAnalyticsEvent(db: EBookletDb, input: Record<string, any>) {
    if (!db?.e_booklet_analytics_events?.create) return;
    const { ip_address, ipAddress, user_agent, userAgent, raw_passcode, passcode, ...safe } = input;
    try {
      await db.e_booklet_analytics_events.create({
        data: {
          ...safe,
          metadata: this.redactAnalyticsMetadata({
            ...(safe.metadata || {}),
            ip_redacted: ip_address || ipAddress ? "captured_for_security" : undefined,
            user_agent_family: this.userAgentFamily(user_agent || userAgent),
          }),
        },
      });
    } catch {
      // Analytics must never block access operations.
    }
  }

  private redactAnalyticsMetadata(metadata: Record<string, any>) {
    const { ip_address, ipAddress, user_agent, userAgent, raw_passcode, passcode, wrong_passcode, ...safe } = metadata || {};
    return safe;
  }

  private userAgentFamily(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;
    if (/Mobile|Android|iPhone|iPad/i.test(userAgent)) return "mobile";
    if (/Windows|Macintosh|Linux/i.test(userAgent)) return "desktop";
    return "unknown";
  }

  private analyticsWhere(filters: { teacherId?: number; instanceId?: number; templateId?: number; studentId?: number; startDate?: string; endDate?: string; source?: string }) {
    const where: Record<string, any> = {};
    if (filters.teacherId) where.teacher_id = filters.teacherId;
    if (filters.instanceId) where.booklet_instance_id = filters.instanceId;
    if (filters.templateId) where.template_id = filters.templateId;
    if (filters.studentId) where.student_id = filters.studentId;
    if (filters.source) where.source = filters.source;
    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = new Date(filters.startDate);
      if (filters.endDate) where.created_at.lte = new Date(filters.endDate);
    }
    return where;
  }

  async getTeacherAnalytics(teacherId: number, filters: { instanceId?: number; startDate?: string; endDate?: string; source?: string } = {}) {
    const seatUsage = this.db.e_booklet_instances.findMany
      ? ((await this.db.e_booklet_instances.findMany({
          where: { teacher_id: teacherId, ...(filters.instanceId ? { id: filters.instanceId } : {}) },
          select: { id: true, invite_quota: true, used_invites_count: true, status: true, access_expires_at: true, student_marketing_price: true, internal_price: true },
        })) || [])
      : [];
    if (filters.instanceId && !seatUsage.some((instance: any) => instance.id === filters.instanceId)) {
      throw new ForbiddenError("You do not have access to analytics for this e-booklet instance.");
    }
    const ownedInstanceIds = seatUsage.map((instance: any) => instance.id).filter((id: any) => Number.isInteger(Number(id)));
    const where = this.analyticsWhere({ teacherId, startDate: filters.startDate, endDate: filters.endDate, source: filters.source });
    where.booklet_instance_id = { in: ownedInstanceIds };
    const [events, sources, offlineRevenue, onlineRevenue, openAgg, uniqueAnon, failedPasscodes] = await Promise.all([
      this.db.e_booklet_analytics_events?.groupBy ? this.db.e_booklet_analytics_events.groupBy({ by: ["event_type"], where, _count: { _all: true } }) : Promise.resolve([]),
      this.db.e_booklet_analytics_events?.groupBy ? this.db.e_booklet_analytics_events.groupBy({ by: ["source"], where, _count: { _all: true } }) : Promise.resolve([]),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: "access_created", source: "offline_passcode" }, _sum: { marketing_price_snapshot: true } }) : Promise.resolve(null),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: "access_created", source: "online_purchase" }, _sum: { marketing_price_snapshot: true } }) : Promise.resolve(null),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: "invite_opened" }, _count: { _all: true }, _min: { created_at: true }, _max: { created_at: true } }) : Promise.resolve(null),
      this.db.e_booklet_analytics_events?.groupBy ? this.db.e_booklet_analytics_events.groupBy({ by: ["anonymous_session_id"], where: { ...where, event_type: "invite_opened", anonymous_session_id: { not: null } }, _count: { _all: true } }) : Promise.resolve([]),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: { in: ["passcode_failed", "passcode_blocked"] } }, _count: { _all: true } }) : Promise.resolve(null),
    ]);

    const totalUsedSeats = seatUsage.reduce((sum: number, row: any) => sum + Number(row.used_invites_count || 0), 0);
    const estimatedSeatRevenue = seatUsage.reduce((sum: number, row: any) => sum + (Number(row.used_invites_count || 0) * Number(row.student_marketing_price || 0)), 0);

    const eventOffline = Number(offlineRevenue?._sum?.marketing_price_snapshot ?? 0);
    const eventOnline = Number(onlineRevenue?._sum?.marketing_price_snapshot ?? 0);
    const offlineEstimated = eventOffline > 0 ? eventOffline : estimatedSeatRevenue;

    const eventMap: Record<string, number> = Object.fromEntries((events || []).map((row: any) => [row.event_type, row._count?._all ?? 0]));
    if (totalUsedSeats > 0 && !eventMap.access_created) {
      eventMap.access_created = totalUsedSeats;
    }

    return {
      events: eventMap,
      inviteOpens: { total: openAgg?._count?._all ?? 0, first: openAgg?._min?.created_at ?? null, last: openAgg?._max?.created_at ?? null, approximateUniqueAnonymousVisitors: (uniqueAnon || []).length },
      sourceBreakdown: Object.fromEntries((sources || []).filter((row: any) => row.source).map((row: any) => [row.source, row._count?._all ?? 0])),
      access: { failedPasscodes: failedPasscodes?._count?._all ?? 0, status: "sanitized_teacher_scope" },
      seatUsage,
      devices: { accessStatus: "aggregated", securityDetails: "hidden_from_teacher" },
      revenue: {
        offlineEstimated,
        onlineApproved: eventOnline,
        purchaseFunnelPending: 0,
      },
    };
  }

  async getAdminAnalytics(filters: { teacherId?: number; instanceId?: number; templateId?: number; studentId?: number; startDate?: string; endDate?: string; source?: string } = {}) {
    const where = this.analyticsWhere(filters);

    const purchasesWhere: Record<string, any> = {};
    if (filters.teacherId) purchasesWhere.teacher_id = filters.teacherId;
    if (filters.templateId) purchasesWhere.template_id = filters.templateId;
    if (filters.startDate || filters.endDate) {
      purchasesWhere.created_at = {};
      if (filters.startDate) purchasesWhere.created_at.gte = new Date(filters.startDate);
      if (filters.endDate) purchasesWhere.created_at.lte = new Date(filters.endDate);
    }

    const instancesWhere: Record<string, any> = {};
    if (filters.teacherId) instancesWhere.teacher_id = filters.teacherId;
    if (filters.templateId) instancesWhere.template_id = filters.templateId;
    if (filters.instanceId) instancesWhere.id = filters.instanceId;
    if (filters.startDate || filters.endDate) {
      instancesWhere.created_at = {};
      if (filters.startDate) instancesWhere.created_at.gte = new Date(filters.startDate);
      if (filters.endDate) instancesWhere.created_at.lte = new Date(filters.endDate);
    }

    const [events, sources, revenue, offline, online, failures, instances, purchasesAgg, activeAccessCount, activeDevicesCount] = await Promise.all([
      this.db.e_booklet_analytics_events?.groupBy ? this.db.e_booklet_analytics_events.groupBy({ by: ["event_type"], where, _count: { _all: true } }) : Promise.resolve([]),
      this.db.e_booklet_analytics_events?.groupBy ? this.db.e_booklet_analytics_events.groupBy({ by: ["source"], where, _count: { _all: true } }) : Promise.resolve([]),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: "access_created" }, _sum: { marketing_price_snapshot: true, internal_price_snapshot: true } }) : Promise.resolve(null),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: "access_created", source: "offline_passcode" }, _sum: { marketing_price_snapshot: true } }) : Promise.resolve(null),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: "access_created", source: "online_purchase" }, _sum: { marketing_price_snapshot: true } }) : Promise.resolve(null),
      this.db.e_booklet_analytics_events?.aggregate ? this.db.e_booklet_analytics_events.aggregate({ where: { ...where, event_type: { in: ["passcode_failed", "passcode_blocked"] } }, _count: { _all: true } }) : Promise.resolve(null),
      this.db.e_booklet_instances?.groupBy ? this.db.e_booklet_instances.groupBy({ by: ["status"], where: instancesWhere, _count: { _all: true } }) : Promise.resolve([]),
      this.db.e_booklet_purchases?.aggregate ? this.db.e_booklet_purchases.aggregate({ where: { ...purchasesWhere, status: { in: ["paid", "ready", "delivered"] } }, _sum: { price: true, marketing_price: true, internal_price: true }, _count: { _all: true } }) : Promise.resolve(null),
      this.db.e_booklet_access?.count ? this.db.e_booklet_access.count({ where: { role: "student", status: "active", ...(filters.teacherId ? { booklet_instance: { teacher_id: filters.teacherId } } : {}), ...(filters.instanceId ? { booklet_instance_id: filters.instanceId } : {}) } }) : Promise.resolve(0),
      this.db.e_booklet_devices?.count ? this.db.e_booklet_devices.count({ where: { status: "active", ...(filters.instanceId ? { booklet_instance_id: filters.instanceId } : {}) } }) : Promise.resolve(0),
    ]);

    const eventMap: Record<string, number> = Object.fromEntries((events || []).map((row: any) => [row.event_type, row._count?._all ?? 0]));

    const ordersRevenue = Number(purchasesAgg?._sum?.price ?? purchasesAgg?._sum?.marketing_price ?? 0);
    const ordersInternal = Number(purchasesAgg?._sum?.internal_price ?? 0);
    const eventMarketing = Number(revenue?._sum?.marketing_price_snapshot ?? 0);
    const eventInternal = Number(revenue?._sum?.internal_price_snapshot ?? 0);

    const marketing = eventMarketing > 0 ? (eventMarketing + ordersRevenue) : ordersRevenue;
    const internal = eventInternal > 0 ? (eventInternal + ordersInternal) : ordersInternal;
    const margin = marketing - internal;

    if (activeAccessCount && !eventMap.access_created) {
      eventMap.access_created = activeAccessCount;
    }
    if (activeDevicesCount && !eventMap.device_bound) {
      eventMap.device_bound = activeDevicesCount;
    }
    if (purchasesAgg?._count?._all) {
      eventMap.teacher_orders = Number(purchasesAgg._count._all);
    }

    return {
      events: eventMap,
      launchMetrics: { teacher: {}, template: {}, instance: { byStatus: instances || [] }, studentAccess: {}, operationalHealth: { analyticsRetention: "Sanitized security metadata only; purge/export analytics rows per retention policy via database maintenance job." } },
      sourceBreakdown: Object.fromEntries((sources || []).filter((row: any) => row.source).map((row: any) => [row.source, row._count?._all ?? 0])),
      deviceSecurity: { failedPasscodes: failures?._count?._all ?? 0 },
      expiryArchive: { byStatus: instances || [] },
      revenue: {
        marketing,
        internal,
        margin,
        ordersRevenue,
        ordersInternal,
        offlineEstimated: Number(offline?._sum?.marketing_price_snapshot ?? 0),
        onlineApproved: Number(online?._sum?.marketing_price_snapshot ?? 0),
        purchaseFunnelPending: 0,
      },
    };
  }

  async exportAdminAnalyticsCsv(filters: { teacherId?: number; instanceId?: number; studentId?: number; startDate?: string; endDate?: string; source?: string; limit?: number } = {}) {
    const rows = await this.db.e_booklet_analytics_events.findMany({ where: this.analyticsWhere(filters), orderBy: { created_at: "desc" }, take: Math.min(Math.max(filters.limit || 10000, 1), 10000) });
    const header = ["id", "event_type", "teacher_id", "student_id", "anonymous_session_id", "template_id", "booklet_instance_id", "invite_id", "access_id", "purchase_id", "source", "marketing_price_snapshot", "internal_price_snapshot", "created_at"];
    const csv = [header.join(","), ...(rows || []).map((row: any) => header.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
    return csv;
  }

  async exportTeacherAnalyticsCsv(teacherId: number, filters: { instanceId?: number; startDate?: string; endDate?: string; source?: string; limit?: number } = {}) {
    const seatUsage = this.db.e_booklet_instances.findMany
      ? ((await this.db.e_booklet_instances.findMany({
          where: { teacher_id: teacherId, ...(filters.instanceId ? { id: filters.instanceId } : {}) },
          select: { id: true },
        })) || [])
      : [];
    if (filters.instanceId && !seatUsage.some((instance: any) => instance.id === filters.instanceId)) {
      throw new ForbiddenError("You do not have access to analytics for this e-booklet instance.");
    }
    const ownedInstanceIds = seatUsage.map((instance: any) => instance.id).filter((id: any) => Number.isInteger(Number(id)));
    const where = this.analyticsWhere({ teacherId, startDate: filters.startDate, endDate: filters.endDate, source: filters.source });
    where.booklet_instance_id = { in: ownedInstanceIds };
    const rows = await this.db.e_booklet_analytics_events.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: Math.min(Math.max(filters.limit || 10000, 1), 10000),
    });
    const header = ["id", "event_type", "student_id", "template_id", "booklet_instance_id", "invite_id", "access_id", "purchase_id", "source", "marketing_price_snapshot", "created_at"];
    return [header.join(","), ...(rows || []).map((row: any) => header.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
  }

  async recordInviteOpen(rawToken: string, input: { anonymousSessionId?: string; studentId?: number; source?: string; ipAddress?: string; userAgent?: string } = {}) {
    const invite = await this.findInviteByToken(rawToken);
    if (!invite) throw new NotFoundError("E-booklet invite not found");
    const instance = invite.booklet_instance ?? invite.e_booklet_instances;
    await this.recordAnalyticsEvent(this.db, {
      event_type: "invite_opened",
      teacher_id: invite.teacher_id ?? instance?.teacher_id,
      student_id: input.studentId,
      anonymous_session_id: input.studentId ? undefined : input.anonymousSessionId,
      template_id: instance?.template_id,
      booklet_instance_id: invite.booklet_instance_id,
      invite_id: invite.id,
      source: input.source,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { security_context: "ip_user_agent_captured_sanitized" },
    });
    return { invite_id: invite.id, has_passcode: Boolean(invite.passcode_hash), passcode_hint: invite.passcode_hint, anonymous_session_id: input.anonymousSessionId };
  }

  private assertPasscodeNotBlocked(key: string) {
    const now = Date.now();
    const current = passcodeFailures.get(key);
    if (current?.blockedUntil && current.blockedUntil > now) throw new ForbiddenError(PASSCODE_BLOCK_MESSAGE);
  }

  private registerPasscodeFailure(key: string) {
    const now = Date.now();
    const current = passcodeFailures.get(key);
    const next = !current || now - current.firstFailureAt > PASSCODE_WINDOW_MS
      ? { count: 1, firstFailureAt: now }
      : { ...current, count: current.count + 1 };
    if (next.count >= PASSCODE_MAX_FAILURES) next.blockedUntil = now + PASSCODE_BLOCK_MS;
    passcodeFailures.set(key, next);
  }

  private clearPasscodeFailures(key: string) {
    passcodeFailures.delete(key);
  }

  private passcodeRateLimitKeys(tokenHash: string, studentId: number, meta: AcceptInviteMeta = {}) {
    return [
      `invite:${tokenHash}:student:${studentId}`,
      meta.ipAddress ? `invite:${tokenHash}:ip:${crypto.createHash("sha256").update(meta.ipAddress).digest("hex").slice(0, 16)}` : undefined,
      meta.deviceFingerprint ? `invite:${tokenHash}:device:${crypto.createHash("sha256").update(meta.deviceFingerprint).digest("hex").slice(0, 16)}` : undefined,
    ].filter(Boolean) as string[];
  }

  private hashPasscode(passcode: string): string {
    const pepper =
      process.env.E_BOOKLET_PASSCODE_PEPPER ||
      process.env.APP_SECRET ||
      process.env.JWT_SECRET ||
      process.env.E_BOOKLET_PAGE_TOKEN_SECRET ||
      "dev-e-booklet-passcode-pepper";
    // Six-digit passcodes have tiny entropy; HMAC with a server-only pepper
    // prevents useful offline cracking if invite rows are exposed.
    return crypto.createHmac("sha256", pepper).update(passcode).digest("hex");
  }

  private async findInviteByToken(rawToken: string) {
    return this.db.e_booklet_invites.findFirst({
      where: { token_hash: hashInviteToken(rawToken) },
      include: {
        booklet_instance: {
          select: {
            id: true,
            invite_quota: true,
            status: true,
            teacher_id: true,
            template_id: true,
            student_marketing_price: true,
            internal_price: true,
          },
        },
      },
    });
  }

  private ensureInviteUsable(invite: any): any {
    if (!invite) throw new NotFoundError("E-booklet invite not found");
    if (invite.status && invite.status !== "active") {
      throw new ForbiddenError("This e-booklet invite is not active.");
    }
    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      throw new ForbiddenError("This e-booklet invite has expired.");
    }
    const instance = invite.booklet_instance ?? invite.e_booklet_instances;
    if (!instance || instance.status !== "active") {
      throw new ForbiddenError("This e-booklet is not currently active.");
    }
    return instance;
  }

  async approveStudentPurchaseLink(purchaseId: number, adminUserId: number) {
    try {
      return await this.serializableTransaction(async (tx: EBookletDb) => {
      const link = await tx.e_booklet_student_purchase_links.findUnique({
        where: { purchase_id: purchaseId },
        include: { invite: true, booklet_instance: true },
      });
      if (!link) throw new NotFoundError("E-booklet student purchase link not found");
      if (link.access_id || link.approved_at) return link;
      const instance = this.ensureInviteUsable({ ...link.invite, booklet_instance: link.booklet_instance });
      const existingAccess = await tx.e_booklet_access.findFirst({
        where: {
          booklet_instance_id: link.booklet_instance_id,
          user_id: link.student_id,
          role: "student",
          status: "active",
        },
      });
      let access = existingAccess;
      if (!access) {
        if (link.invite?.max_uses !== null && link.invite?.max_uses !== undefined && link.invite.used_count >= link.invite.max_uses) {
          throw new ForbiddenError("This e-booklet invite has reached its access limit.");
        }
        await this.assertStudentSeatAvailable(tx, instance, { excludePurchaseId: purchaseId });
        access = await tx.e_booklet_access.create({
          data: {
            booklet_instance_id: link.booklet_instance_id,
            user_id: link.student_id,
            role: "student",
            source_invite_id: link.invite_id,
            access_source: "online_purchase",
            terms_accepted_at: link.terms_accepted_at,
            terms_version: link.terms_version,
            status: "active",
          },
        });
        await this.recordAnalyticsEvent(tx, {
          event_type: "access_created",
          teacher_id: (link as any).booklet_instance?.teacher_id ?? (link as any).invite?.teacher_id,
          student_id: link.student_id,
          template_id: (link as any).booklet_instance?.template_id,
          booklet_instance_id: link.booklet_instance_id,
          invite_id: link.invite_id,
          access_id: access.id,
          purchase_id: purchaseId,
          source: "online_purchase",
          marketing_price_snapshot: Number((link as any).marketing_price_snapshot ?? (link as any).booklet_instance?.student_marketing_price ?? 0),
          internal_price_snapshot: Number((link as any).booklet_instance?.internal_price ?? 0),
          metadata: { terms_version: link.terms_version },
        });
        await tx.e_booklet_invites.update({
          where: { id: link.invite_id },
          data: { used_count: { increment: 1 } },
        });
        await tx.e_booklet_instances.update({
          where: { id: link.booklet_instance_id },
          data: { used_invites_count: { increment: 1 } },
        });
      }
      const approved = await tx.e_booklet_student_purchase_links.update({
        where: { purchase_id: purchaseId },
        data: { access_id: access.id, approved_at: new Date() },
      });
      await tx.e_booklet_audit_logs.create({
        data: {
          actor_user_id: adminUserId,
          action: "student_purchase_approved",
          entity_type: "e_booklet_instance",
          entity_id: link.booklet_instance_id,
          metadata_json: { purchase_id: purchaseId, access_id: access.id },
        },
      });
      return approved;
      });
    } catch (error: any) {
      await this.auditSafely(this.db, {
        actor_user_id: adminUserId,
        action: "student_purchase_approval_failed",
        entity_type: "purchase",
        entity_id: purchaseId,
        metadata_json: { reason: error?.message },
      });
      throw error;
    }
  }

  async createStudentPurchaseLink(
    rawToken: string,
    studentId: number,
    input: TermsInput,
    paymentScreenshotFile?: Express.Multer.File,
  ) {
    throw new ForbiddenError("Direct student e-booklet purchase is disabled. Students must redeem a teacher-provided URL or access code.");

    try {
      this.requireStudentTerms(input);
      const invite = await this.findInviteByToken(rawToken);
      const instance = this.ensureInviteUsable(invite);
      const price = Number(instance.student_marketing_price ?? 0);

      if (!input.purchaseId) {
        let paymentScreenshotId: number | null = null;
        let paymentMethod: { phone_number: string | null } | null = null;
        if (price > 0) {
          if (!paymentScreenshotFile) {
            throw new BadRequestError("Payment screenshot is required for online e-booklet invite purchases.");
          }
          const { imageService } = await import("./image.service");
          const { validatePaymentForCheckout } = await import("./checkout-validation.service");
          const paymentScreenshot = await imageService.uploadImage(
            paymentScreenshotFile,
            { compress: true, quality: 80 },
          );
          paymentScreenshotId = paymentScreenshot.id;
          paymentMethod = await validatePaymentForCheckout(this.db, {
            total: price,
            numberTransferredFrom: input.numberTransferredFrom,
            payment_method_id: input.payment_method_id,
          });
        }

        const result = await this.serializableTransaction(async (tx: EBookletDb) => {
          await this.assertStudentSeatAvailable(tx, instance);
          const purchase = await tx.purchases.create({
            data: {
              user_id: studentId,
              payment_method_id: price > 0 ? (input.payment_method_id ?? null) : null,
              payment_screenshot_id: paymentScreenshotId,
              status: price > 0 ? "pending" : "confirmed",
              subtotal: price,
              discount: 0,
              total: price,
              notes: input.notes,
              number_transferred_from: price > 0 ? (input.numberTransferredFrom || null) : null,
              payment_number: price > 0 ? (paymentMethod?.phone_number || null) : null,
            },
          });
          const link = await tx.e_booklet_student_purchase_links.create({
            data: {
              purchase_id: purchase.id,
              invite_id: invite.id,
              booklet_instance_id: invite.booklet_instance_id,
              student_id: studentId,
              marketing_price_snapshot: price,
              terms_accepted_at: new Date(),
              terms_version: input.termsVersion,
            },
          });

          await this.recordAnalyticsEvent(tx, {
            event_type: "online_purchase_selected",
            teacher_id: invite.teacher_id ?? (instance as any).teacher_id,
            student_id: studentId,
            template_id: (instance as any).template_id,
            booklet_instance_id: invite.booklet_instance_id,
            invite_id: invite.id,
            purchase_id: purchase.id,
            source: "online_purchase",
            marketing_price_snapshot: price,
            internal_price_snapshot: Number((instance as any).internal_price ?? 0),
            metadata: { terms_version: input.termsVersion, payment_proof_uploaded: Boolean(paymentScreenshotId) },
          });
          await tx.e_booklet_audit_logs.create({
            data: {
              actor_user_id: studentId,
              action: "student_purchase_link_created",
              entity_type: "e_booklet_instance",
              entity_id: invite.booklet_instance_id,
              metadata_json: {
                invite_id: invite.id,
                purchase_id: purchase.id,
                payment_screenshot_id: paymentScreenshotId,
                marketing_price_snapshot: price,
                terms_version: input.termsVersion,
              },
            },
          });
          return {
            ...link,
            purchase_id: purchase.id,
            status: purchase.status,
            total: price,
            currency: "EGP",
            booklet_instance_id: invite.booklet_instance_id,
          };
        });
        return result;
      }

      const purchase = await this.db.purchases.findFirst({
        where: {
          id: input.purchaseId,
          user_id: studentId,
        },
      });
      if (!purchase) {
        throw new ForbiddenError("Purchase does not belong to this student.");
      }
      const existingProofFileId = Number((purchase as any).payment_screenshot_id || 0) || undefined;
      const proofFileId = input.paymentProofFileId ?? existingProofFileId;
      if (!proofFileId) {
        throw new BadRequestError("Payment proof is required for online e-booklet invite purchases.");
      }
      if (input.paymentProofFileId && existingProofFileId && input.paymentProofFileId !== existingProofFileId) {
        throw new BadRequestError("Payment proof file does not match the generic purchase proof.");
      }
      if (input.paymentProofFileId && !existingProofFileId) {
        const proofAsset = await this.db.e_booklet_file_assets.findUnique({
          where: { id: input.paymentProofFileId },
        });
        const proofOwnerType = String(proofAsset?.owner_type || "");
        const proofOwnerId = Number(proofAsset?.owner_id || 0);
        const allowedProofOwner =
          proofOwnerType === "student" && proofOwnerId === studentId ||
          proofOwnerType === "purchase" && proofOwnerId === input.purchaseId ||
          proofOwnerType === "student_purchase_proof" && (proofOwnerId === studentId || proofOwnerId === input.purchaseId);
        if (!proofAsset || !allowedProofOwner) {
          throw new ForbiddenError("Payment proof file does not belong to this purchase.");
        }
      }
      const link = await this.db.e_booklet_student_purchase_links.create({
        data: {
          purchase_id: input.purchaseId,
          invite_id: invite.id,
          booklet_instance_id: invite.booklet_instance_id,
          student_id: studentId,
          marketing_price_snapshot: price,
          terms_accepted_at: new Date(),
          terms_version: input.termsVersion,
        },
      });
      await this.recordAnalyticsEvent(this.db, {
        event_type: "online_purchase_selected",
        teacher_id: invite.teacher_id ?? (instance as any).teacher_id,
        student_id: studentId,
        template_id: (instance as any).template_id,
        booklet_instance_id: invite.booklet_instance_id,
        invite_id: invite.id,
        purchase_id: input.purchaseId,
        source: "online_purchase",
        marketing_price_snapshot: price,
        metadata: { terms_version: input.termsVersion, payment_proof_uploaded: Boolean(proofFileId) },
      });
      await this.auditSafely(this.db, {
        actor_user_id: studentId,
        action: "student_purchase_link_created",
        entity_type: "e_booklet_instance",
        entity_id: invite.booklet_instance_id,
        metadata_json: {
          invite_id: invite.id,
          purchase_id: input.purchaseId,
          payment_proof_file_id: proofFileId,
          marketing_price_snapshot: price,
          terms_version: input.termsVersion,
        },
      });
      return link;
    } catch (error: any) {
      await this.auditSafely(this.db, {
        actor_user_id: studentId,
        action: "student_purchase_link_failed",
        entity_type: "purchase",
        entity_id: input.purchaseId ?? 0,
        metadata_json: { reason: error?.message, invite_token_hash: hashInviteToken(rawToken) },
      });
      throw error;
    }
  }

  async acceptInvitePasscode(
    rawToken: string,
    studentId: number,
    input: TermsInput,
    meta: AcceptInviteMeta = {},
  ) {
    const tokenHash = hashInviteToken(rawToken);
    const rateLimitKeys = this.passcodeRateLimitKeys(tokenHash, studentId, meta);
    try {
      this.requireStudentTerms(input);
      for (const key of rateLimitKeys) this.assertPasscodeNotBlocked(key);
      return await this.serializableTransaction(async (tx: EBookletDb) => {
      const invite = await tx.e_booklet_invites.findFirst({
        where: { token_hash: tokenHash },
        include: { booklet_instance: { select: { id: true, invite_quota: true, status: true, student_marketing_price: true, internal_price: true } } },
      });
      const instance = this.ensureInviteUsable(invite);
      if (!invite.passcode_hash) {
        throw new ForbiddenError("This e-booklet invite does not allow passcode access.");
      }
      if (this.hashPasscode(String(input.passcode || "")) !== invite.passcode_hash) {
        for (const key of rateLimitKeys) this.registerPasscodeFailure(key);
        await this.recordAnalyticsEvent(tx, {
          event_type: rateLimitKeys.some((key) => passcodeFailures.get(key)?.blockedUntil) ? "passcode_blocked" : "passcode_failed",
          teacher_id: invite.teacher_id ?? (instance as any).teacher_id,
          student_id: studentId,
          template_id: (instance as any).template_id,
          booklet_instance_id: invite.booklet_instance_id,
          invite_id: invite.id,
          source: "offline_passcode",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: { reason: "invalid_or_blocked", dimensions: { student: true, invite: true, ip: Boolean(meta.ipAddress), device: Boolean(meta.deviceFingerprint) } },
        });
        throw new ForbiddenError(PASSCODE_BLOCK_MESSAGE);
      }
      for (const key of rateLimitKeys) this.clearPasscodeFailures(key);
      if (invite.max_uses !== null && invite.max_uses !== undefined && invite.used_count >= invite.max_uses) {
        throw new ForbiddenError("This e-booklet invite has reached its access limit.");
      }
      const existingAccess = await tx.e_booklet_access.findFirst({
        where: {
          booklet_instance_id: invite.booklet_instance_id,
          user_id: studentId,
          role: "student",
          status: "active",
        },
      });
      if (existingAccess) {
        await tx.e_booklet_audit_logs.create({
          data: {
            actor_user_id: studentId,
            action: "invite_passcode_accepted",
            entity_type: "e_booklet_instance",
            entity_id: invite.booklet_instance_id,
            metadata_json: {
              invite_id: invite.id,
              access_id: existingAccess.id,
              already_had_access: true,
              marketing_price_snapshot: Number((instance as any).student_marketing_price ?? 0),
              terms_version: input.termsVersion,
            },
          },
        });
        return existingAccess;
      }
      await this.assertStudentSeatAvailable(tx, instance);
      const access = await tx.e_booklet_access.create({
        data: {
          booklet_instance_id: invite.booklet_instance_id,
          user_id: studentId,
          role: "student",
          source_invite_id: invite.id,
          access_source: "offline_passcode",
          terms_accepted_at: new Date(),
          terms_version: input.termsVersion,
          status: "active",
        },
      });
      await this.recordAnalyticsEvent(tx, {
        event_type: "access_created",
        teacher_id: invite.teacher_id ?? (instance as any).teacher_id,
        student_id: studentId,
        template_id: (instance as any).template_id,
        booklet_instance_id: invite.booklet_instance_id,
        invite_id: invite.id,
        access_id: access.id,
        source: "offline_passcode",
        marketing_price_snapshot: Number((instance as any).student_marketing_price ?? 0),
        internal_price_snapshot: Number((instance as any).internal_price ?? 0),
        metadata: { terms_version: input.termsVersion },
      });
      await tx.e_booklet_invites.update({
        where: { id: invite.id },
        data: { used_count: { increment: 1 } },
      });
      await tx.e_booklet_instances.update({
        where: { id: invite.booklet_instance_id },
        data: { used_invites_count: { increment: 1 } },
      });
      await tx.e_booklet_audit_logs.create({
        data: {
          actor_user_id: studentId,
          action: "invite_passcode_accepted",
          entity_type: "e_booklet_instance",
          entity_id: invite.booklet_instance_id,
          metadata_json: {
            invite_id: invite.id,
            access_id: access.id,
            marketing_price_snapshot: Number((instance as any).student_marketing_price ?? 0),
            terms_version: input.termsVersion,
          },
        },
      });
      return access;
      });
    } catch (error: any) {
      await this.auditSafely(this.db, {
        actor_user_id: studentId,
        action: "invite_passcode_failed",
        entity_type: "e_booklet_invite",
        entity_id: 0,
        metadata_json: { reason: error?.message, invite_token_hash: tokenHash },
      });
      throw error;
    }
  }

  async acceptFreeInvite(rawToken: string, studentId: number, input: TermsInput) {
    const tokenHash = hashInviteToken(rawToken);
    try {
      this.requireStudentTerms(input);
      return await this.serializableTransaction(async (tx: EBookletDb) => {
      const invite = await tx.e_booklet_invites.findFirst({
        where: { token_hash: tokenHash },
        include: {
          booklet_instance: {
            select: { id: true, invite_quota: true, status: true, student_marketing_price: true, internal_price: true },
          },
        },
      });
      const instance = this.ensureInviteUsable(invite);
      if (Number(instance.student_marketing_price ?? 0) !== 0) {
        throw new ForbiddenError("This e-booklet invite requires purchase.");
      }
      if (invite.max_uses !== null && invite.max_uses !== undefined && invite.used_count >= invite.max_uses) {
        throw new ForbiddenError("This e-booklet invite has reached its access limit.");
      }
      const existingAccess = await tx.e_booklet_access.findFirst({
        where: {
          booklet_instance_id: invite.booklet_instance_id,
          user_id: studentId,
          role: "student",
          status: "active",
        },
      });
      if (existingAccess) {
        await tx.e_booklet_audit_logs.create({
          data: {
            actor_user_id: studentId,
            action: "free_invite_accepted",
            entity_type: "e_booklet_instance",
            entity_id: invite.booklet_instance_id,
            metadata_json: {
              invite_id: invite.id,
              access_id: existingAccess.id,
              already_had_access: true,
              terms_version: input.termsVersion,
            },
          },
        });
        return existingAccess;
      }
      await this.assertStudentSeatAvailable(tx, instance);
      const access = await tx.e_booklet_access.create({
        data: {
          booklet_instance_id: invite.booklet_instance_id,
          user_id: studentId,
          role: "student",
          source_invite_id: invite.id,
          access_source: "free_invite",
          terms_accepted_at: new Date(),
          terms_version: input.termsVersion,
          status: "active",
        },
      });
      await this.recordAnalyticsEvent(tx, {
        event_type: "access_created",
        teacher_id: invite.teacher_id ?? (instance as any).teacher_id,
        student_id: studentId,
        template_id: (instance as any).template_id,
        booklet_instance_id: invite.booklet_instance_id,
        invite_id: invite.id,
        access_id: access.id,
        source: "free_invite",
        marketing_price_snapshot: Number((instance as any).student_marketing_price ?? 0),
        internal_price_snapshot: Number((instance as any).internal_price ?? 0),
        metadata: { terms_version: input.termsVersion },
      });
      await tx.e_booklet_invites.update({
        where: { id: invite.id },
        data: { used_count: { increment: 1 } },
      });
      await tx.e_booklet_instances.update({
        where: { id: invite.booklet_instance_id },
        data: { used_invites_count: { increment: 1 } },
      });
      await tx.e_booklet_audit_logs.create({
        data: {
          actor_user_id: studentId,
          action: "free_invite_accepted",
          entity_type: "e_booklet_instance",
          entity_id: invite.booklet_instance_id,
          metadata_json: {
            invite_id: invite.id,
            access_id: access.id,
            terms_version: input.termsVersion,
          },
        },
      });
      return access;
      });
    } catch (error: any) {
      await this.auditSafely(this.db, {
        actor_user_id: studentId,
        action: "free_invite_failed",
        entity_type: "e_booklet_invite",
        entity_id: 0,
        metadata_json: { reason: error?.message, invite_token_hash: tokenHash },
      });
      throw error;
    }
  }

  async acceptInvite(
    rawToken: string,
    studentId: number,
    meta: AcceptInviteMeta = {},
  ): Promise<{
    alreadyHadAccess: boolean;
    access: unknown;
    bookletInstanceId: number;
  }> {
    const tokenHash = hashInviteToken(rawToken);

    return this.serializableTransaction(async (tx: EBookletDb) => {
      const invite = await tx.e_booklet_invites.findFirst({
        where: { token_hash: tokenHash },
        include: {
          booklet_instance: {
            select: {
              id: true,
              invite_quota: true,
              status: true,
            },
          },
        },
      });

      if (!invite) {
        throw new NotFoundError("E-booklet invite not found");
      }
      if (invite.status !== "active") {
        throw new ForbiddenError("This e-booklet invite is not active.");
      }
      if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
        throw new ForbiddenError("This e-booklet invite has expired.");
      }
      if (
        invite.max_uses !== null &&
        invite.max_uses !== undefined &&
        invite.used_count >= invite.max_uses
      ) {
        throw new ForbiddenError(
          "This e-booklet invite has reached its access limit.",
        );
      }

      const bookletInstance =
        invite.booklet_instance ?? invite.e_booklet_instances;
      if (!bookletInstance || bookletInstance.status !== "active") {
        throw new ForbiddenError("This e-booklet is not currently active.");
      }

      const existingAccess = await tx.e_booklet_access.findFirst({
        where: {
          booklet_instance_id: invite.booklet_instance_id,
          user_id: studentId,
          role: "student",
          status: "active",
        },
      });

      if (existingAccess) {
        return {
          alreadyHadAccess: true,
          access: existingAccess,
          bookletInstanceId: invite.booklet_instance_id,
        };
      }

      await this.assertStudentSeatAvailable(tx, { ...bookletInstance, id: invite.booklet_instance_id });

      const access = await tx.e_booklet_access.create({
        data: {
          booklet_instance_id: invite.booklet_instance_id,
          user_id: studentId,
          role: "student",
          source_invite_id: invite.id,
          status: "active",
        },
      });

      await tx.e_booklet_invite_redemptions.create({
        data: {
          invite_id: invite.id,
          booklet_instance_id: invite.booklet_instance_id,
          student_id: studentId,
          ip_address: meta.ipAddress,
          user_agent: meta.userAgent,
        },
      });

      await tx.e_booklet_invites.update({
        where: { id: invite.id },
        data: { used_count: { increment: 1 } },
      });

      await tx.e_booklet_instances.update({
        where: { id: invite.booklet_instance_id },
        data: { used_invites_count: { increment: 1 } },
      });

      await tx.e_booklet_audit_logs.create({
        data: {
          actor_user_id: studentId,
          action: "invite_redeemed",
          entity_type: "e_booklet_instance",
          entity_id: invite.booklet_instance_id,
          metadata_json: {
            invite_id: invite.id,
          },
          ip_address: meta.ipAddress,
          user_agent: meta.userAgent,
        },
      });

      return {
        alreadyHadAccess: false,
        access,
        bookletInstanceId: invite.booklet_instance_id,
      };
    });
  }

  async revokeTeacherAccess(
    bookletInstanceId: number,
    actorUserId: number,
    revokedAt = new Date(),
  ): Promise<void> {
    await this.db.e_booklet_instances.update({
      where: { id: bookletInstanceId },
      data: {
        status: "suspended",
        updated_at: revokedAt,
      },
    });

    await this.db.e_booklet_access.updateMany({
      where: {
        booklet_instance_id: bookletInstanceId,
        status: "active",
      },
      data: {
        status: "revoked",
        revoked_at: revokedAt,
      },
    });

    await this.db.e_booklet_audit_logs.create({
      data: {
        actor_user_id: actorUserId,
        action: "teacher_access_revoked",
        entity_type: "e_booklet_instance",
        entity_id: bookletInstanceId,
        metadata_json: {
          cascaded_student_access: true,
        },
      },
    });
  }
}

let serviceSingleton: EBookletService | null = null;

export function getEBookletService(): EBookletService {
  if (!serviceSingleton) {
    serviceSingleton = new EBookletService();
  }
  return serviceSingleton;
}
