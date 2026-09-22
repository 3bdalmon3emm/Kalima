import crypto from "crypto";
import path from "path";
import { promises as fsPromises } from "fs";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../libs/errors";
import { resolveEBookletStoragePath, resolveEBookletUploadRoot } from "../../../libs/uploadsRoot";
import { isR2Enabled, putObject, getObjectBuffer } from "../../../libs/storage";
import { EBookletAccessCodeService, type EBookletAccessCodeKind } from "./e-booklet-access-code.service";
import { EBookletAccessCodePrintRendererService } from "./e-booklet-access-code-print-renderer.service";

export const E_BOOKLET_PRINT_CARD_WIDTH_PX = 827;
export const E_BOOKLET_PRINT_CARD_HEIGHT_PX = 438;
export const E_BOOKLET_PRINT_CARD_PPI = 300;

type PrintFieldLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  direction?: "rtl" | "ltr" | "auto";
  align?: "left" | "center" | "right" | "start" | "end";
  fontSize?: number;
  color?: string;
  fontFamily?:
    | "Noto Sans Arabic"
    | "Noto Kufi Arabic"
    | "Noto Naskh Arabic"
    | "Alexandria"
    | "Aref Ruqaa"
    | "Tajawal"
    | "IBM Plex Sans Arabic"
    | "Reem Kufi";
};

type PrintTemplateLayout = {
  fields?: Record<string, PrintFieldLayout | undefined>;
};

type RequiredFields = Record<string, boolean | undefined>;
type VisibleFields = Record<string, boolean | undefined>;
type BatchValues = Record<string, unknown>;
type PrintStorageAdapter = {
  readPrivateAsset: (asset: any) => Promise<Buffer>;
  writePrivateFile: (input: { buffer: Buffer; filename: string }) => Promise<{ storageKey: string; sizeBytes: number }>;
};

function getPrintSecret(): string {
  const secret = process.env.E_BOOKLET_ACCESS_CODE_PRINT_SECRET || process.env.E_BOOKLET_ACCESS_CODE_SECRET || process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("E_BOOKLET_ACCESS_CODE_PRINT_SECRET, E_BOOKLET_ACCESS_CODE_SECRET, ACCESS_TOKEN_SECRET, or JWT_SECRET is required");
  }
  return "dev-e-booklet-access-code-print-secret";
}

function signQrNonce(nonce: string): string {
  return crypto.createHmac("sha256", getPrintSecret()).update(nonce).digest("hex");
}

export function generatePrintQrRef(): string {
  const nonce = crypto.randomBytes(32).toString("base64url");
  return `${nonce}.${signQrNonce(nonce)}`;
}

export function verifyPrintQrRef(ref: string): boolean {
  const [nonce, signature, extra] = String(ref || "").split(".");
  if (!nonce || !signature || extra !== undefined) return false;
  const expected = signQrNonce(nonce);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function hashPrintQrRef(ref: string): string {
  return crypto.createHash("sha256").update(ref).digest("hex");
}

export function getPrintQrRedeemBaseUrl(): string {
  const configuredBase = (process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173").trim();
  let parsed: URL;
  try {
    parsed = new URL(configuredBase);
  } catch {
    throw new Error("FRONTEND_URL or APP_URL must be an absolute public frontend URL for printed e-booklet QR codes.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("FRONTEND_URL or APP_URL must use http or https for printed e-booklet QR codes.");
  }
  if (/\/api\/v\d+\/?$/i.test(parsed.pathname)) {
    throw new Error("FRONTEND_URL or APP_URL must point to the frontend, not the API, for printed e-booklet QR codes.");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
}

function printQrRedeemUrl(ref: string): string {
  return `${getPrintQrRedeemBaseUrl()}/e-booklet-code/qr/${encodeURIComponent(ref)}`;
}

function printQrTeacherImageUrl(ref: string): string {
  const apiBase = (process.env.API_URL || process.env.BACKEND_URL || "").replace(/\/$/, "");
  return `${apiBase}/api/v2/e-booklet-access-code-print/qr/${encodeURIComponent(ref)}/teacher-image`;
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

export class EBookletAccessCodePrintService {
  constructor(
    private readonly db: any,
    private readonly accessCodeService: Pick<EBookletAccessCodeService, "generateCodes"> = new EBookletAccessCodeService(db),
    private readonly renderer: Pick<EBookletAccessCodePrintRendererService, "renderCardPng" | "renderBatchPdf"> = new EBookletAccessCodePrintRendererService(),
    private readonly storage: PrintStorageAdapter = {
      readPrivateAsset: async (asset: any) =>
        isR2Enabled()
          ? getObjectBuffer(asset.storage_key)
          : fsPromises.readFile(resolveEBookletStoragePath(asset.storage_key)),
      writePrivateFile: async ({ buffer, filename }) => {
        const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const storageKey = `e-booklets/private/print-batches/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName}`;
        if (isR2Enabled()) {
          await putObject({ key: storageKey, body: buffer, contentType: "application/pdf" });
        } else {
          const dir = path.join(resolveEBookletUploadRoot(), "print-batches");
          await fsPromises.mkdir(dir, { recursive: true });
          await fsPromises.writeFile(resolveEBookletStoragePath(storageKey), buffer);
        }
        return { storageKey, sizeBytes: buffer.byteLength };
      },
    },
  ) {}

  private assertTemplateDimensions(widthPx: number, heightPx: number, ppi: number) {
    if (widthPx !== E_BOOKLET_PRINT_CARD_WIDTH_PX || heightPx !== E_BOOKLET_PRINT_CARD_HEIGHT_PX || ppi !== E_BOOKLET_PRINT_CARD_PPI) {
      throw new BadRequestError("Template image must be 827 x 438 px at 300 PPI.");
    }
  }

  private assertTemplateLayout(layout: PrintTemplateLayout) {
    const fields = layout?.fields || {};
    if (!fields.qr || !fields.codeNumber) {
      throw new BadRequestError("Template layout must include QR and code number fields.");
    }
    for (const [fieldName, field] of Object.entries(fields)) {
      if (!field) continue;
      for (const key of ["x", "y", "width", "height"] as const) {
        if (!Number.isFinite(field[key]) || field[key] < 0) {
          throw new BadRequestError(`Invalid ${fieldName} ${key} placement.`);
        }
      }
      if (field.width <= 0 || field.height <= 0) {
        throw new BadRequestError(`Invalid ${fieldName} placement size.`);
      }
    }
  }

  private normalizeRequiredFields(templateRequiredFields: RequiredFields = {}, batchRequiredFields: RequiredFields = {}) {
    return {
      qr: true,
      codeNumber: true,
      ...templateRequiredFields,
      ...batchRequiredFields,
    };
  }

  private assertRequiredBatchValues(requiredFields: RequiredFields, batchValues: BatchValues = {}, teacherImageFileAssetId?: number | null) {
    const valueKeys: Record<string, string> = {
      gradeClass: "gradeClassText",
      registrationMethod: "registrationMethodText",
      price: "priceText",
      redCustomText: "redCustomText",
    };
    for (const [fieldName, isRequired] of Object.entries(requiredFields)) {
      if (!isRequired || fieldName === "qr" || fieldName === "codeNumber") continue;
      if (fieldName === "teacherImage") {
        if (!teacherImageFileAssetId) throw new BadRequestError("Required print field is empty: teacherImage.");
        continue;
      }
      const valueKey = valueKeys[fieldName] || fieldName;
      const value = batchValues[valueKey];
      if (value === undefined || value === null || String(value).trim() === "") {
        throw new BadRequestError(`Required print field is empty: ${fieldName}.`);
      }
    }
  }

  private async capacityWarning(input: { teacherId: number; bookletInstanceId: number; kind: EBookletAccessCodeKind }) {
    if (input.kind !== "paid") return null;
    const instance = await this.db.e_booklet_instances.findUnique({
      where: { id: input.bookletInstanceId },
      select: { invite_quota: true },
    });
    if (!instance || instance.invite_quota === null || instance.invite_quota === undefined) return null;
    const [redeemed, unusedActive] = await Promise.all([
      this.db.e_booklet_access_code_redemptions.count({
        where: { booklet_instance_id: input.bookletInstanceId, counted_for_progress: true },
      }),
      this.db.e_booklet_access_codes.count({
        where: {
          booklet_instance_id: input.bookletInstanceId,
          teacher_id: input.teacherId,
          kind: "paid",
          status: "active",
          redeemed_count: 0,
        },
      }),
    ]);
    const remainingSeats = Math.max(0, Number(instance.invite_quota) - Number(redeemed));
    if (remainingSeats >= unusedActive) return null;
    return {
      type: "remaining_seats_below_unused_active_codes",
      remainingSeats,
      unusedActiveCodes: unusedActive,
      message: "Remaining student seats are below unused active paid codes. Codes do not reserve seats.",
    };
  }

  private templateSnapshot(template: any) {
    return {
      id: template.id,
      name: template.name,
      backgroundFileAssetId: template.background_file_asset_id,
      widthPx: template.width_px,
      heightPx: template.height_px,
      ppi: template.ppi,
      layout: template.layout_json,
      defaultRequiredFields: template.default_required_fields_json || {},
    };
  }

  encryptPrintedAccessCode(code: string): string {
    return encryptSecretValue(code, getPrintSecret());
  }

  private decryptPrintedAccessCode(ciphertext: string | null | undefined): string | null {
    return decryptSecretValue(ciphertext, getPrintSecret());
  }

  private async loadTemplate(templateId: number) {
    const template = await this.db.e_booklet_access_code_print_templates.findUnique({
      where: { id: templateId },
    });
    if (!template || template.status === "archived") {
      throw new NotFoundError("Active print template not found.");
    }
    return template;
  }

  private async readTemplateBackground(template: any): Promise<Buffer> {
    const asset = await this.db.e_booklet_file_assets.findUnique({
      where: { id: template.background_file_asset_id },
    });
    if (!asset) throw new NotFoundError("Print template background file not found.");
    return this.storage.readPrivateAsset(asset);
  }

  private async readOptionalAsset(assetId: number | null | undefined, label: string): Promise<Buffer | null> {
    if (!assetId) return null;
    const asset = await this.db.e_booklet_file_assets.findUnique({
      where: { id: assetId },
    });
    if (!asset) throw new NotFoundError(`${label} file not found.`);
    return this.storage.readPrivateAsset(asset);
  }

  private async createPdfAsset(input: { buffer: Buffer; label: string; createdBy: number }) {
    const stored = await this.storage.writePrivateFile({
      buffer: input.buffer,
      filename: `${input.label || "access-code-batch"}.pdf`,
    });
    return this.db.e_booklet_file_assets.create({
      data: {
        owner_type: "e_booklet_access_code_print_batch",
        owner_id: null,
        file_type: "pdf",
        storage_key: stored.storageKey,
        original_filename: `${input.label || "access-code-batch"}.pdf`,
        mime_type: "application/pdf",
        size_bytes: stored.sizeBytes,
        visibility: "private",
      },
    });
  }

  async createTemplate(input: {
    name: string;
    backgroundFileAssetId: number;
    widthPx: number;
    heightPx: number;
    ppi: number;
    layout: PrintTemplateLayout;
    defaultRequiredFields?: RequiredFields | null;
    createdBy?: number | null;
  }) {
    this.assertTemplateDimensions(input.widthPx, input.heightPx, input.ppi);
    this.assertTemplateLayout(input.layout);
    return this.db.e_booklet_access_code_print_templates.create({
      data: {
        name: input.name,
        background_file_asset_id: input.backgroundFileAssetId,
        width_px: input.widthPx,
        height_px: input.heightPx,
        ppi: input.ppi,
        status: "active",
        layout_json: input.layout,
        default_required_fields_json: input.defaultRequiredFields || {},
        created_by: input.createdBy ?? null,
      },
    });
  }

  async deleteTemplate(templateId: number) {
    const usedCount = await this.db.e_booklet_access_code_print_batches.count({
      where: { template_id: templateId },
    });
    if (usedCount > 0) {
      throw new ConflictError("Used print templates cannot be deleted.");
    }
    return this.db.e_booklet_access_code_print_templates.delete({ where: { id: templateId } });
  }

  async archiveTemplate(templateId: number, actorId?: number | null) {
    return this.db.e_booklet_access_code_print_templates.update({
      where: { id: templateId },
      data: {
        status: "archived",
        archived_at: new Date(),
        updated_by: actorId ?? null,
        updated_at: new Date(),
      },
    });
  }

  async activateTemplate(templateId: number, actorId?: number | null) {
    return this.db.e_booklet_access_code_print_templates.update({
      where: { id: templateId },
      data: {
        status: "active",
        archived_at: null,
        updated_by: actorId ?? null,
        updated_at: new Date(),
      },
    });
  }

  async updateTemplate(templateId: number, input: {
    name?: string | null;
    backgroundFileAssetId?: number | null;
    layout?: PrintTemplateLayout | null;
    defaultRequiredFields?: RequiredFields | null;
  }) {
    const current = await this.db.e_booklet_access_code_print_templates.findUnique({ where: { id: templateId } });
    if (!current) throw new NotFoundError("Print template not found.");
    if (input.layout) this.assertTemplateLayout(input.layout);
    return this.db.e_booklet_access_code_print_templates.update({
      where: { id: templateId },
      data: {
        ...(input.name !== undefined ? { name: String(input.name || "").trim() || current.name } : {}),
        ...(input.backgroundFileAssetId !== undefined && input.backgroundFileAssetId !== null ? { background_file_asset_id: input.backgroundFileAssetId } : {}),
        ...(input.layout ? { layout_json: input.layout } : {}),
        ...(input.defaultRequiredFields ? { default_required_fields_json: input.defaultRequiredFields } : {}),
        updated_at: new Date(),
      },
    });
  }

  async listTemplates(filters: { status?: string } = {}) {
    return this.db.e_booklet_access_code_print_templates.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { created_at: "desc" },
    });
  }

  async listBatches(filters: { teacherId?: number; bookletInstanceId?: number; templateId?: number } = {}) {
    return this.db.e_booklet_access_code_print_batches.findMany({
      where: {
        ...(filters.teacherId ? { teacher_id: filters.teacherId } : {}),
        ...(filters.bookletInstanceId ? { booklet_instance_id: filters.bookletInstanceId } : {}),
        ...(filters.templateId ? { template_id: filters.templateId } : {}),
      },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        booklet_instance: { select: { id: true, display_title: true, invite_quota: true } },
        template: { select: { id: true, name: true, status: true } },
        _count: { select: { codes: true } },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });
  }

  async createPreset(input: {
    presetType: "registration_method" | "grade_class";
    label: string;
    displayText: string;
    sortOrder?: number | null;
    createdBy?: number | null;
  }) {
    if (!["registration_method", "grade_class"].includes(input.presetType)) {
      throw new BadRequestError("Invalid print preset type.");
    }
    if (!input.label?.trim()) throw new BadRequestError("Print preset label is required.");
    if (!input.displayText?.trim()) throw new BadRequestError("Print preset display text is required.");
    return this.db.e_booklet_access_code_print_presets.create({
      data: {
        preset_type: input.presetType,
        label: input.label.trim(),
        display_text: input.displayText.trim(),
        sort_order: input.sortOrder ?? 0,
        active: true,
        created_by: input.createdBy ?? null,
      },
    });
  }

  async listPresets(filters: { presetType?: "registration_method" | "grade_class"; active?: boolean } = {}) {
    return this.db.e_booklet_access_code_print_presets.findMany({
      where: {
        ...(filters.presetType ? { preset_type: filters.presetType } : {}),
        ...(filters.active !== undefined ? { active: filters.active } : {}),
      },
      orderBy: [{ preset_type: "asc" }, { sort_order: "asc" }, { created_at: "desc" }],
    });
  }

  async createBatchSnapshot(input: {
    label: string;
    templateId: number;
    teacherId: number;
    bookletInstanceId: number;
    termId: number;
    kind: EBookletAccessCodeKind;
    count: number;
    createdBy: number;
    batchValues?: BatchValues | null;
    requiredFields?: RequiredFields | null;
    visibleFields?: VisibleFields | null;
    teacherImageFileAssetId?: number | null;
    pdfFileAssetId?: number | null;
    expiresAt?: Date | string | null;
    accessCodes: Array<{ id: number }>;
    qrRefs?: Array<{ ref: string; hash: string }>;
    printedCodes?: Array<{ code: string; ciphertext: string }>;
  }) {
    const template = await this.loadTemplate(input.templateId);
    const requiredFields = this.normalizeRequiredFields(template.default_required_fields_json || {}, input.requiredFields || {});
    this.assertRequiredBatchValues(requiredFields, input.batchValues || {}, input.teacherImageFileAssetId);
    const snapshot = {
      template: this.templateSnapshot(template),
      requiredFields,
      visibleFields: input.visibleFields || {},
      batchValues: input.batchValues || {},
      teacherImageFileAssetId: input.teacherImageFileAssetId ?? null,
      card: {
        widthPx: E_BOOKLET_PRINT_CARD_WIDTH_PX,
        heightPx: E_BOOKLET_PRINT_CARD_HEIGHT_PX,
        ppi: E_BOOKLET_PRINT_CARD_PPI,
      },
    };

    return this.db.$transaction(async (tx: any) => {
      const batch = await tx.e_booklet_access_code_print_batches.create({
        data: {
          label: input.label,
          teacher_id: input.teacherId,
          booklet_instance_id: input.bookletInstanceId,
          template_id: input.templateId,
          term_id: input.termId,
          kind: input.kind,
          count: input.count,
          status: "generated",
          teacher_image_file_asset_id: input.teacherImageFileAssetId ?? null,
          pdf_file_asset_id: input.pdfFileAssetId ?? null,
          expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
          snapshot_json: snapshot,
          created_by: input.createdBy,
          generated_at: new Date(),
        },
      });
      await tx.e_booklet_access_code_print_batch_codes.createMany({
        data: input.accessCodes.map((accessCode, index) => ({
          batch_id: batch.id,
          access_code_id: accessCode.id,
          card_index: index,
          qr_ref_hash: input.qrRefs?.[index]?.hash ?? null,
          access_code_ciphertext: input.printedCodes?.[index]?.ciphertext ?? null,
        })),
      });
      return batch;
    });
  }

  async generatePrintableBatch(input: {
    label: string;
    templateId: number;
    teacherId: number;
    bookletInstanceId: number;
    termId: number;
    kind: EBookletAccessCodeKind;
    count: number;
    createdBy: number;
    batchValues?: BatchValues | null;
    requiredFields?: RequiredFields | null;
    visibleFields?: VisibleFields | null;
    teacherImageFileAssetId?: number | null;
    pdfFileAssetId?: number | null;
    expiresAt?: Date | string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const template = await this.loadTemplate(input.templateId);
    const requiredFields = this.normalizeRequiredFields(template.default_required_fields_json || {}, input.requiredFields || {});
    this.assertRequiredBatchValues(requiredFields, input.batchValues || {}, input.teacherImageFileAssetId);
    const backgroundImage = await this.readTemplateBackground(template);
    const teacherImage = await this.readOptionalAsset(input.teacherImageFileAssetId, "Teacher image");
    const warning = await this.capacityWarning({
      teacherId: input.teacherId,
      bookletInstanceId: input.bookletInstanceId,
      kind: input.kind,
    });
    const generatedAccessCodeIds: number[] = [];
    try {
      const generated = await this.accessCodeService.generateCodes({
        bookletInstanceId: input.bookletInstanceId,
        teacherId: input.teacherId,
        kind: input.kind,
        termId: input.termId,
        count: input.count,
        expiresAt: input.expiresAt === null ? null : input.expiresAt ?? undefined,
        maxRedemptions: 1,
        adminActorId: input.createdBy,
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
      });
      const cards = generated.codes.map((generatedCode: any, index: number) => {
        const qrRef = generatePrintQrRef();
        const accessCodeId = Number(generatedCode.record.id);
        if (Number.isInteger(accessCodeId)) generatedAccessCodeIds.push(accessCodeId);
        return {
          cardIndex: index,
          accessCodeId,
          code: generatedCode.code,
          qrRef,
          qrRefHash: hashPrintQrRef(qrRef),
          qrRedeemUrl: printQrRedeemUrl(qrRef),
        };
      });
      const renderedCards = await Promise.all(cards.map(async (card) => ({
        png: await this.renderer.renderCardPng({
          backgroundImage,
          layout: template.layout_json,
          card: {
            code: card.code,
            qrRedeemUrl: card.qrRedeemUrl,
            teacherImage,
            batchValues: input.batchValues || {},
            visibleFields: input.visibleFields || {},
          },
        }),
      })));
      const pdfBytes = await this.renderer.renderBatchPdf(renderedCards);
      const pdfAsset = await this.createPdfAsset({
        buffer: Buffer.from(pdfBytes),
        label: input.label,
        createdBy: input.createdBy,
      });
      const batch = await this.createBatchSnapshot({
        label: input.label,
        templateId: input.templateId,
        teacherId: input.teacherId,
        bookletInstanceId: input.bookletInstanceId,
        termId: input.termId,
        kind: input.kind,
        count: input.count,
        createdBy: input.createdBy,
        batchValues: input.batchValues,
        requiredFields,
        visibleFields: input.visibleFields,
        teacherImageFileAssetId: input.teacherImageFileAssetId,
        pdfFileAssetId: pdfAsset.id,
        expiresAt: input.expiresAt,
        accessCodes: cards.map((card) => ({ id: card.accessCodeId })),
        qrRefs: cards.map((card) => ({ ref: card.qrRef, hash: card.qrRefHash })),
        printedCodes: cards.map((card) => ({ code: card.code, ciphertext: this.encryptPrintedAccessCode(card.code) })),
      });
      return { batch, cards, pdfFileAssetId: pdfAsset.id, warning };
    } catch (error) {
      if (generatedAccessCodeIds.length > 0) {
        await this.db.e_booklet_access_codes.deleteMany({
          where: {
            id: { in: generatedAccessCodeIds },
            redeemed_count: 0,
          },
        });
      }
      throw error;
    }
  }

  async renderPreviewCard(input: {
    templateId: number;
    code: string;
    qrRedeemUrl: string;
    teacherImageFileAssetId?: number | null;
    batchValues?: BatchValues | null;
    visibleFields?: VisibleFields | null;
  }): Promise<Buffer> {
    const template = await this.loadTemplate(input.templateId);
    const backgroundImage = await this.readTemplateBackground(template);
    const teacherImage = await this.readOptionalAsset(input.teacherImageFileAssetId, "Teacher image");
    return this.renderer.renderCardPng({
      backgroundImage,
      layout: template.layout_json,
      card: {
        code: input.code,
        qrRedeemUrl: input.qrRedeemUrl,
        teacherImage,
        batchValues: input.batchValues || {},
        visibleFields: input.visibleFields || {},
      },
    });
  }

  async getQrPrefill(ref: string) {
    if (!verifyPrintQrRef(ref)) {
      throw new BadRequestError("Invalid printed access-code QR reference.");
    }
    const row = await this.db.e_booklet_access_code_print_batch_codes.findFirst({
      where: { qr_ref_hash: hashPrintQrRef(ref) },
      include: {
        access_code: {
          select: {
            status: true,
            redeemed_count: true,
            max_redemptions: true,
            expires_at: true,
          },
        },
        batch: {
          include: {
            teacher: { select: { id: true, name: true } },
            booklet_instance: { select: { id: true, display_title: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundError("Printed access-code QR reference not found.");
    const accessCode = row.access_code;
    const expired = Boolean(accessCode?.expires_at && new Date(accessCode.expires_at) <= new Date());
    const exhausted = Number(accessCode?.redeemed_count ?? 0) >= Number(accessCode?.max_redemptions ?? 1);
    if (!accessCode || accessCode.status !== "active" || expired || exhausted) {
      throw new ForbiddenError("This e-booklet access code is no longer active.");
    }
    const code = this.decryptPrintedAccessCode(row.access_code_ciphertext);
    if (!code) throw new NotFoundError("Printed access-code data is unavailable.");
    const batchValues = row.batch?.snapshot_json?.batchValues || {};
    const teacherImageFileAssetId = row.batch?.teacher_image_file_asset_id ?? null;
    return {
      batchId: row.batch_id,
      accessCodeId: row.access_code_id,
      cardIndex: row.card_index,
      code,
      teacher: {
        id: row.batch?.teacher?.id ?? row.batch?.teacher_id,
        name: row.batch?.teacher?.name ?? null,
      },
      eBooklet: {
        id: row.batch?.booklet_instance?.id ?? row.batch?.booklet_instance_id,
        title: row.batch?.booklet_instance?.display_title ?? null,
      },
      gradeClassText: batchValues.gradeClassText ?? null,
      registrationMethodText: batchValues.registrationMethodText ?? null,
      teacherImageFileAssetId,
      teacherImageUrl: teacherImageFileAssetId ? printQrTeacherImageUrl(ref) : null,
    };
  }

  async getQrTeacherImageAssetId(ref: string): Promise<number> {
    if (!verifyPrintQrRef(ref)) {
      throw new BadRequestError("Invalid printed access-code QR reference.");
    }
    const row = await this.db.e_booklet_access_code_print_batch_codes.findFirst({
      where: { qr_ref_hash: hashPrintQrRef(ref) },
      include: { batch: { select: { teacher_image_file_asset_id: true } } },
    });
    const assetId = row?.batch?.teacher_image_file_asset_id;
    if (!assetId) throw new NotFoundError("Printed access-code teacher image not found.");
    return assetId;
  }

  async getBatchPdfAssetId(batchId: number): Promise<number> {
    const batch = await this.db.e_booklet_access_code_print_batches.findUnique({
      where: { id: batchId },
      select: { id: true, pdf_file_asset_id: true },
    });
    if (!batch?.pdf_file_asset_id) throw new NotFoundError("Printable access-code batch PDF not found.");
    return batch.pdf_file_asset_id;
  }
}
