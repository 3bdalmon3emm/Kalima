import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import path from "path";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { getEBookletService } from "../services/e-booklet.service";
import { getEBookletDomainServices } from "../services/e-booklet-domain.service";
import { buildContentDisposition } from "../utils/filename";
import {
  isR2Enabled,
  proxyObject,
  getSignedDownloadUrl,
  getServePolicy,
  AssetCategory,
} from "../../../libs/storage";
import {
  AcceptEBookletInviteDto,
  CreateEBookletTemplateDto,
  DeliverEBookletDto,
  EBookletCheckoutDto,
  EBookletRepeatPurchaseCheckDto,
  PublicEBookletCheckoutDto,
  EBookletDeviceAllowanceDto,
  EBookletDeviceBindDto,
  EBookletInviteAccessPathDto,
  UpdateEBookletPurchaseStatusDto,
  UpdateEBookletQuotaDto,
  UpdateEBookletTemplateDto,
  UpsertEBookletHotspotDto,
} from "../dtos/e-booklet.dto";
import { BadRequestError, ValidationError } from "../../../libs/errors";

function normalizeMultipartEBookletBody(body: any) {
  const next = { ...(body || {}) };
  ["instance_id", "template_id", "template_version_id", "payment_method_id", "purchaseId", "paymentProofFileId"].forEach((key) => {
    if (next[key] !== undefined && next[key] !== null && next[key] !== "") next[key] = Number(next[key]);
  });
  if (typeof next.items === "string") {
    try {
      next.items = JSON.parse(next.items);
    } catch {
      throw new BadRequestError("Invalid e-booklet checkout items payload.");
    }
  }
  if (Array.isArray(next.items)) {
    next.items = next.items.map((item: any) => ({
      ...item,
      instance_id: Number(item.instance_id),
      template_id: Number(item.template_id),
      template_version_id: Number(item.template_version_id),
    }));
  }
  ["terms_accepted", "termsAccepted"].forEach((key) => {
    if (next[key] !== undefined) next[key] = next[key] === true || next[key] === "true" || next[key] === "1";
  });
  return next;
}

async function validateDto<T extends object>(
  DtoClass: new () => T,
  body: unknown,
): Promise<T> {
  const dto = plainToInstance(DtoClass, body);
  const errors = await validate(dto);
  if (errors.length > 0) {
    throw new ValidationError(
      errors.flatMap((err) => Object.values(err.constraints || {})),
    );
  }
  return dto;
}

function parseId(raw: string | string[] | undefined, label: string): number {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return id;
}

function parseOptionalId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return id;
}

function parseParam(raw: string | string[] | undefined, label: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return value;
}

function currentUserId(req: Request): number {
  const userId = (req as any).user?.userId;
  if (!Number.isInteger(userId)) {
    throw new BadRequestError("Authenticated user id is missing");
  }
  return userId;
}

function optionalNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolean(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "1" || raw === 1;
}

function sanitizeAccessCodeResponse(data: any) {
  if (!data?.record) return data;
  const { code_hash: _codeHash, ...safeRecord } = data.record;
  return { ...data, record: safeRecord };
}

function domainServices() {
  return getEBookletDomainServices();
}

function pagination(req: Request) {
  return {
    page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
  };
}

const ANALYTICS_SOURCES = new Set(["free_invite", "offline_passcode", "online_purchase", "invite_link", "qr_code", "teacher_share", "teacher_code", "access_code", "public_store"]);

function parseOptionalPositiveInt(raw: unknown, label: string, max?: number): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(value) || value <= 0 || (max !== undefined && value > max)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return value;
}

function parseRequiredPositiveInt(raw: unknown, label: string, max?: number): number {
  const value = parseOptionalPositiveInt(raw, label, max);
  if (value === undefined) throw new BadRequestError(`Invalid ${label}`);
  return value;
}

function parseAccessCodeKind(raw: unknown): "paid" | "free" {
  const value = String(Array.isArray(raw) ? raw[0] : raw || "");
  if (value !== "paid" && value !== "free") throw new BadRequestError("Invalid access code kind");
  return value;
}

function assertTeacherCanGenerateAccessCodeKind(kind: "paid" | "free") {
  if (kind === "free") {
    throw new BadRequestError("Teachers cannot generate free e-booklet access codes.");
  }
}

function parsePrintPresetType(raw: unknown): "registration_method" | "grade_class" {
  const value = String(Array.isArray(raw) ? raw[0] : raw || "").trim();
  if (value !== "registration_method" && value !== "grade_class") {
    throw new BadRequestError("Invalid print preset type.");
  }
  return value;
}

function parseOptionalIsoDate(raw: unknown, label: string): string | undefined {
  if (!raw) return undefined;
  const value = String(Array.isArray(raw) ? raw[0] : raw);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestError(`Invalid ${label}`);
  return parsed.toISOString();
}

function parseOptionalFutureIsoDate(raw: unknown, label: string): string | undefined {
  const value = parseOptionalIsoDate(raw, label);
  if (!value) return undefined;
  if (new Date(value).getTime() <= Date.now()) throw new BadRequestError(`${label} must be in the future`);
  return value;
}

function parseRequiredFiniteMoney(raw: unknown, label: string, allowZero = false): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return value;
}

function parseOptionalFiniteMoney(raw: unknown, label: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return value;
}

function parseStrictBoolean(raw: unknown, label: string): boolean {
  if (raw === true || raw === "true" || raw === "1" || raw === 1) return true;
  if (raw === false || raw === "false" || raw === "0" || raw === 0) return false;
  throw new BadRequestError(`Invalid ${label}`);
}

function analyticsFilters(req: Request) {
  const startDate = parseOptionalIsoDate(req.query.start_date, "start_date");
  const endDate = parseOptionalIsoDate(req.query.end_date, "end_date");
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw new BadRequestError("start_date must be before end_date");
  }
  const source = req.query.source ? String(Array.isArray(req.query.source) ? req.query.source[0] : req.query.source) : undefined;
  if (source && !ANALYTICS_SOURCES.has(source)) throw new BadRequestError("Invalid analytics source");
  return {
    teacherId: parseOptionalPositiveInt(req.query.teacher_id, "teacher_id"),
    instanceId: parseOptionalPositiveInt(req.query.instance_id, "instance_id"),
    templateId: parseOptionalPositiveInt(req.query.template_id, "template_id"),
    studentId: parseOptionalPositiveInt(req.query.student_id, "student_id"),
    startDate,
    endDate,
    source,
    limit: parseOptionalPositiveInt(req.query.limit, "limit", 10000),
  };
}

function inviteAnonymousSessionId(req: Request, res: Response): string {
  const cookieValue = String((req as any).cookies?.e_booklet_anon_session || "");
  const supplied = String(req.get("x-e-booklet-session") || req.query.session_id || cookieValue || "");
  const sessionId = /^[A-Za-z0-9._:-]{4,128}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.cookie("e_booklet_anon_session", sessionId, { httpOnly: true, sameSite: "lax", maxAge: 180 * 24 * 60 * 60 * 1000 });
  return sessionId;
}

function setPrivateNoStore(res: Response) {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function setInlineFilename(res: Response, filename: unknown, fallback: string) {
  res.set("Content-Disposition", buildContentDisposition("inline", filename, fallback));
}

/**
 * Serves a stored e-booklet file. On R2 the file is streamed through the
 * backend (proxy, session-protected) by deriving the object key from the
 * path; on local disk it is sent directly. Response headers set by the caller
 * (Content-Type, Content-Disposition, Cache-Control) are preserved.
 */
/** Derives the R2 object key from a local e-booklet path, preserving nested
 * paths like print-batches/. */
function eBookletKeyFromPath(filePath: string): string {
  const normalized = filePath.split(path.sep).join("/");
  const marker = "e-booklets/private/";
  const idx = normalized.indexOf(marker);
  return idx >= 0 ? normalized.slice(idx) : `${marker}${path.basename(filePath)}`;
}

/**
 * Serves a stored e-booklet file. The serve mode is read from the central
 * serving policy for the given `category` (single source of truth): "signed"
 * 302-redirects to a short-lived signed R2 URL (offloads the server, for public
 * assets like covers); "proxy" streams through the backend (session-protected,
 * no shareable link, for paid/sensitive content). On local disk it always sends
 * the file directly. Caller-set response headers are preserved.
 */
async function serveEBookletFile(
  req: Request,
  res: Response,
  filePath: string,
  category: AssetCategory,
): Promise<void> {
  if (isR2Enabled()) {
    const key = eBookletKeyFromPath(filePath);
    const policy = getServePolicy(category);
    if (policy.mode === "signed") {
      const url = await getSignedDownloadUrl(key, { expiresIn: policy.ttlSeconds });
      res.redirect(302, url);
    } else {
      await proxyObject(key, req, res);
    }
  } else {
    res.sendFile(filePath);
  }
}

export const eBookletController = {
  async uploadFileAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().createFileAsset(
        (req as any).file,
        {
          ownerType:
            typeof req.body?.owner_type === "string"
              ? req.body.owner_type
              : "admin",
          ownerId: parseOptionalId(req.body?.owner_id),
          fileType:
            typeof req.body?.file_type === "string" ? req.body.file_type : undefined,
        },
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async previewAdminFileAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const pageNumber = parseOptionalId(req.query.page);
      const { asset, absolutePath, pageBuffer } =
        pageNumber
          ? await getEBookletService().getPrivateFileAssetForAdmin(
              parseId(req.params.assetId, "file asset ID"),
              pageNumber,
            )
          : await getEBookletService().getPrivateFileAssetForAdmin(
              parseId(req.params.assetId, "file asset ID"),
            );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "application/octet-stream");
      setInlineFilename(res, asset.original_filename, "e-booklet-file");
      if (pageBuffer) {
        res.send(pageBuffer);
        return;
      }
      await serveEBookletFile(req, res, absolutePath, "ebooklet_document");
    } catch (error) {
      next(error);
    }
  },

  async previewAdminFileAssetPage(req: Request, res: Response, next: NextFunction) {
    try {
      const { asset, absolutePath, pageBuffer } = await getEBookletService().getPrivateFileAssetPagePreviewForAdmin(
        parseId(req.params.assetId, "file asset ID"),
        parseId(req.params.pageNumber, "page number"),
      );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "image/webp");
      setInlineFilename(res, asset.original_filename, "e-booklet-page.webp");
      if (pageBuffer) {
        res.send(pageBuffer);
        return;
      }
      await serveEBookletFile(req, res, absolutePath, "ebooklet_page_image");
    } catch (error) {
      next(error);
    }
  },

  async previewPublicCoverAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const { asset, absolutePath } =
        await getEBookletService().getPublicCoverFileAsset(
          parseId(req.params.assetId, "cover asset ID"),
        );
      res.set("Cache-Control", "public, max-age=300");
      res.type(asset.mime_type || "image/*");
      setInlineFilename(res, asset.original_filename, "e-booklet-cover");
      // Covers are public catalog images → signed URL (per serving policy).
      await serveEBookletFile(req, res, absolutePath, "ebooklet_cover");
    } catch (error) {
      next(error);
    }
  },

  async listStoreTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await getEBookletService().listPublishedTemplates({
        search: req.query.search as string | undefined,
        categoryId: req.query.category_id
          ? parseInt(req.query.category_id as string, 10)
          : undefined,
        ...pagination(req),
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async getStoreTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublishedTemplateById(
        parseId(req.params.templateId, "template ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getStorePreviewMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicPreviewMetadata(
        parseId(req.params.templateId, "template ID"),
      );
      res.set("Cache-Control", "public, max-age=60");
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getStorePreviewPage(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicPreviewPage(
        parseId(req.params.templateId, "template ID"),
        parseId(req.params.pageNumber, "page number"),
      );
      res.set("Cache-Control", data.cacheControl || "public, max-age=60");
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getStorePreviewPageHotspots(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicPreviewPageHotspots(
        parseId(req.params.templateId, "template ID"),
        parseId(req.params.pageNumber, "page number"),
      );
      res.set("Cache-Control", "public, max-age=60");
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getStorePreviewHotspotContent(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicPreviewHotspotContent(
        parseId(req.params.templateId, "template ID"),
        parseId(req.params.hotspotId, "hotspot ID"),
      );
      res.set("Cache-Control", "public, max-age=60");
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getStorePreviewHotspotAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const { asset, absolutePath, cacheControl } = await getEBookletService().getPublicPreviewHotspotAsset(
        parseId(req.params.templateId, "template ID"),
        parseId(req.params.hotspotId, "hotspot ID"),
        parseId(req.params.assetId, "asset ID"),
      );
      res.set("Cache-Control", cacheControl || "public, max-age=60");
      res.type(asset.mime_type || "application/octet-stream");
      setInlineFilename(res, asset.original_filename, "e-booklet-file");
      await serveEBookletFile(req, res, absolutePath, "ebooklet_hotspot_media");
    } catch (error) {
      next(error);
    }
  },

  async getStorePreviewDocumentPagePreview(req: Request, res: Response, next: NextFunction) {
    try {
      const { asset, absolutePath, pageBuffer } = await getEBookletService().getPublicPreviewDocumentPagePreview(
        parseId(req.params.templateId, "template ID"),
        parseId(req.params.pageNumber, "page number"),
      );
      res.set("Cache-Control", "public, max-age=60");
      res.type(asset.mime_type || "image/webp");
      setInlineFilename(res, asset.original_filename, "e-booklet-preview-page.webp");
      if (pageBuffer) {
        res.send(pageBuffer);
        return;
      }
      await serveEBookletFile(req, res, absolutePath, "ebooklet_page_image");
    } catch (error) {
      next(error);
    }
  },

  async getStoreInstance(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicInstance(
        parseId(req.params.instanceId, "instance ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async checkRepeatPurchases(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(EBookletRepeatPurchaseCheckDto, req.body);
      const items = await getEBookletService().getRepeatPurchaseTemplates(
        currentUserId(req),
        dto.template_ids,
      );
      res.status(200).json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  },

  async createPublicCheckout(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(PublicEBookletCheckoutDto, normalizeMultipartEBookletBody(req.body));
      const data = await getEBookletService().createPublicCheckoutRequest(
        currentUserId(req),
        dto,
        (req as any).file,
        req.app.get("io"),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createPurchaseDeal(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(EBookletCheckoutDto, req.body);
      if (!dto.teacher_id) {
        throw new BadRequestError("Teacher ID is required for e-booklet deal creation.");
      }
      const data = await getEBookletService().createPurchaseRequest(
        dto.teacher_id,
        dto,
        currentUserId(req),
        req.app.get("io"),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listAdminTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await getEBookletService().listAdminTemplates({
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        ...pagination(req),
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async createTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(CreateEBookletTemplateDto, req.body);
      const data = await getEBookletService().createTemplate(
        dto,
        currentUserId(req),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getAdminTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getTemplateById(
        parseId(req.params.id, "template ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(UpdateEBookletTemplateDto, req.body);
      const data = await getEBookletService().updateTemplate(
        parseId(req.params.id, "template ID"),
        dto,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listTemplateVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().listTemplateVersions(
        parseId(req.params.id, "template ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createVersion(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().createTemplateVersion(
        parseId(req.params.id, "template ID"),
        req.body,
        currentUserId(req),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateVersion(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().updateTemplateVersion(
        parseId(req.params.versionId, "template version ID"),
        req.body,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async publishVersion(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().publishTemplateVersion(
        parseId(req.params.versionId, "template version ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listVersionHotspots(req: Request, res: Response, next: NextFunction) {
    try {
      const pageNumber = req.query.page_number
        ? parseInt(req.query.page_number as string, 10)
        : undefined;
      const data = await getEBookletService().listVersionHotspots(
        parseId(req.params.versionId, "template version ID"),
        pageNumber,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createHotspot(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(UpsertEBookletHotspotDto, req.body);
      const data = await getEBookletService().createHotspot(
        dto,
        currentUserId(req),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateHotspot(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().updateHotspot(
        parseId(req.params.hotspotId, "hotspot ID"),
        req.body,
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async deleteHotspot(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().deleteHotspot(
        parseId(req.params.hotspotId, "hotspot ID"),
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listHotspotPresets(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await getEBookletService().listHotspotPresets({
        search: req.query.search as string | undefined,
        type: req.query.type as string | undefined,
        tag: req.query.tag as string | undefined,
        includeInactive: parseBoolean(req.query.include_inactive),
        ...pagination(req),
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async getHotspotPreset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getHotspotPreset(
        parseId(req.params.presetId, "hotspot preset ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createHotspotPreset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().createHotspotPreset(req.body, currentUserId(req));
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateHotspotPresetMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().updateHotspotPresetMetadata(
        parseId(req.params.presetId, "hotspot preset ID"),
        req.body,
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async replaceHotspotPresetContent(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().replaceHotspotPresetContent(
        parseId(req.params.presetId, "hotspot preset ID"),
        req.body,
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async deleteHotspotPreset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().deleteHotspotPreset(
        parseId(req.params.presetId, "hotspot preset ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async restoreHotspotPreset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().restoreHotspotPreset(
        parseId(req.params.presetId, "hotspot preset ID"),
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createHotspotFromPreset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().createHotspotFromPreset(
        parseId(req.params.versionId, "template version ID"),
        req.body,
        currentUserId(req),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listPublicOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await getEBookletService().listPublicOrders(currentUserId(req), {
        status: req.query.status as string | undefined,
        ...pagination(req),
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listPurchases(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await getEBookletService().listPurchases({
        status: req.query.status as string | undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        startDate: (req.query.startDate ?? req.query.start_date) as string | undefined,
        endDate: (req.query.endDate ?? req.query.end_date) as string | undefined,
        minTotal: parseOptionalFiniteMoney(req.query.minTotal ?? req.query.min_total, "minTotal"),
        maxTotal: parseOptionalFiniteMoney(req.query.maxTotal ?? req.query.max_total, "maxTotal"),
        ...pagination(req),
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async getPurchase(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPurchase(
        parseId(req.params.id, "purchase ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updatePurchaseStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(UpdateEBookletPurchaseStatusDto, req.body);
      const data = await getEBookletService().updatePurchaseStatus(
        parseId(req.params.id, "purchase ID"),
        dto.status,
        dto.admin_notes,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async markPurchasePaid(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().updatePurchaseStatus(
        parseId(req.params.id, "purchase ID"),
        "paid",
        req.body?.admin_notes,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async deliverPurchase(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(DeliverEBookletDto, req.body);
      const data = await getEBookletService().deliverPurchase(
        parseId(req.params.id, "purchase ID"),
        dto,
        currentUserId(req),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async preparePurchaseCustomTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().preparePurchaseCustomTemplateVersion(
        parseId(req.params.id, "purchase ID"),
        currentUserId(req),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listInstances(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await getEBookletService().listInstances({
        teacherId: req.query.teacher_id
          ? parseInt(req.query.teacher_id as string, 10)
          : undefined,
        status: req.query.status as string | undefined,
        includeStudents: req.query.include_students === undefined
          ? undefined
          : parseBoolean(req.query.include_students),
        ...pagination(req),
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async updateQuota(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(UpdateEBookletQuotaDto, req.body);
      const data = await getEBookletService().updateQuota(
        parseId(req.params.id, "instance ID"),
        dto.invite_quota,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async revokeTeacherAccess(req: Request, res: Response, next: NextFunction) {
    try {
      await getEBookletService().revokeTeacherAccess(
        parseId(req.params.id, "instance ID"),
        currentUserId(req),
      );
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  async listTeacherEBooklets(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().listUserEBooklets(
        currentUserId(req),
        "teacher",
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listStudentEBooklets(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().listUserEBooklets(
        currentUserId(req),
        "student",
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listInvites(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().listInvites(
        parseId(req.params.instanceId, "instance ID"),
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createInvite(req: Request, res: Response, next: NextFunction) {
    try {
      throw new BadRequestError("Teacher invite links are disabled. Teachers must share e-booklet access by copying the generated redeem code or WhatsApp template message.");
    } catch (error) {
      next(error);
    }
  },

  async disableInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().disableInvite(
        parseId(req.params.inviteId, "invite ID"),
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listInstanceStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().listInstanceStudents(
        parseId(req.params.instanceId, "instance ID"),
        req.path.startsWith("/admin/") ? undefined : currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async revokeStudentAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().revokeStudentAccess(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.studentId, "student ID"),
        currentUserId(req),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async recordInviteOpen(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().recordInviteOpen(
        parseParam(req.params.token, "invite token"),
        {
          anonymousSessionId: inviteAnonymousSessionId(req, res),
          source: req.query.source as string | undefined,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        },
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async teacherAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { teacherId: _ignored, studentId: _studentId, ...filters } = analyticsFilters(req);
      const data = await getEBookletService().getTeacherAnalytics(currentUserId(req), filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async exportTeacherAnalyticsCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const { teacherId: _ignored, studentId: _studentId, ...filters } = analyticsFilters(req);
      const csv = await getEBookletService().exportTeacherAnalyticsCsv(currentUserId(req), filters);
      res.type("text/csv");
      res.set("Content-Disposition", "attachment; filename=\"teacher-e-booklet-analytics.csv\"");
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  async adminAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getAdminAnalytics(analyticsFilters(req));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async exportAdminAnalyticsCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await getEBookletService().exportAdminAnalyticsCsv(analyticsFilters(req));
      res.type("text/csv");
      res.set("Content-Disposition", "attachment; filename=\"e-booklet-analytics.csv\"");
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  async getCurrentTerms(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().terms.getLatestActiveTerms(optionalNumber(req.query.template_id));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async acceptCodeGenerationTerms(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().terms.acceptLatestTerms(currentUserId(req), "code_generation", {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }, optionalNumber(req.body?.templateId ?? req.body?.template_id));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createTerms(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().terms.createTerms(req.body, currentUserId(req));
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listTerms(req: Request, res: Response, next: NextFunction) {
    try {
      const templateId = req.query.template_id === "null" ? null : optionalNumber(req.query.template_id);
      const data = await domainServices().terms.listTerms({
        templateId,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().settings.getSettings();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().settings.updateSettings(req.body, currentUserId(req));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateTerms(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().terms.updateTerms(parseId(req.params.termId, "term ID"), req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async activateTerms(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().terms.activateTerms(parseId(req.params.termId, "term ID"), currentUserId(req));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listAccessCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const requestedKind = req.query.kind ? parseAccessCodeKind(req.query.kind) : undefined;
      const data = await domainServices().accessCodes.listCodes({
        bookletInstanceId: parseId(req.params.instanceId, "instance ID"),
        teacherId: currentUserId(req),
        kind: requestedKind,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async generateAccessCode(req: Request, res: Response, next: NextFunction) {
    try {
      const requestedKind = req.body?.kind ? parseAccessCodeKind(req.body.kind) : undefined;
      if (requestedKind) assertTeacherCanGenerateAccessCodeKind(requestedKind);
      const data = await domainServices().accessCodes.generateCode({
        bookletInstanceId: parseId(req.params.instanceId, "instance ID"),
        teacherId: currentUserId(req),
        kind: requestedKind,
        termId: parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"),
        expiresAt: parseOptionalFutureIsoDate(req.body?.expiresAt ?? req.body?.expires_at, "expiration date"),
        maxRedemptions: parseOptionalPositiveInt(req.body?.maxRedemptions ?? req.body?.max_redemptions, "max redemptions"),
      });
      res.status(201).json({ success: true, data: sanitizeAccessCodeResponse(data) });
    } catch (error) {
      next(error);
    }
  },

  async generateAccessCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const requestedKind = req.body?.kind ? parseAccessCodeKind(req.body.kind) : undefined;
      if (requestedKind) assertTeacherCanGenerateAccessCodeKind(requestedKind);
      const data = await domainServices().accessCodes.generateCodes({
        bookletInstanceId: parseId(req.params.instanceId, "instance ID"),
        teacherId: currentUserId(req),
        kind: requestedKind,
        termId: parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"),
        count: parseOptionalPositiveInt(req.body?.count ?? req.body?.quantity, "access code count") ?? 1,
        expiresAt: parseOptionalFutureIsoDate(req.body?.expiresAt ?? req.body?.expires_at, "expiration date"),
        maxRedemptions: parseOptionalPositiveInt(req.body?.maxRedemptions ?? req.body?.max_redemptions, "max redemptions"),
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminListAccessCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const requestedKind = req.query.kind ? parseAccessCodeKind(req.query.kind) : undefined;
      const data = await domainServices().accessCodes.listCodes({
        bookletInstanceId: parseRequiredPositiveInt(req.query.bookletInstanceId ?? req.query.booklet_instance_id, "instance ID"),
        teacherId: parseRequiredPositiveInt(req.query.teacherId ?? req.query.teacher_id, "teacher ID"),
        kind: requestedKind,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminGenerateAccessCode(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodes.generateCode({
        bookletInstanceId: parseRequiredPositiveInt(req.body?.bookletInstanceId ?? req.body?.booklet_instance_id, "instance ID"),
        teacherId: parseRequiredPositiveInt(req.body?.teacherId ?? req.body?.teacher_id, "teacher ID"),
        kind: req.body?.kind ? parseAccessCodeKind(req.body.kind) : undefined,
        termId: parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"),
        expiresAt: parseOptionalFutureIsoDate(req.body?.expiresAt ?? req.body?.expires_at, "expiration date"),
        maxRedemptions: parseOptionalPositiveInt(req.body?.maxRedemptions ?? req.body?.max_redemptions, "max redemptions"),
        adminActorId: currentUserId(req),
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
      res.status(201).json({ success: true, data: sanitizeAccessCodeResponse(data) });
    } catch (error) {
      next(error);
    }
  },

  async adminGenerateAccessCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodes.generateCodes({
        bookletInstanceId: parseRequiredPositiveInt(req.body?.bookletInstanceId ?? req.body?.booklet_instance_id, "instance ID"),
        teacherId: parseRequiredPositiveInt(req.body?.teacherId ?? req.body?.teacher_id, "teacher ID"),
        kind: req.body?.kind ? parseAccessCodeKind(req.body.kind) : undefined,
        termId: parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"),
        count: parseOptionalPositiveInt(req.body?.count ?? req.body?.quantity, "access code count") ?? 1,
        expiresAt: parseOptionalFutureIsoDate(req.body?.expiresAt ?? req.body?.expires_at, "expiration date"),
        maxRedemptions: parseOptionalPositiveInt(req.body?.maxRedemptions ?? req.body?.max_redemptions, "max redemptions"),
        adminActorId: currentUserId(req),
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminGenerateFreeCode(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodes.generateCode({
        bookletInstanceId: parseRequiredPositiveInt(req.body?.bookletInstanceId ?? req.body?.booklet_instance_id, "instance ID"),
        teacherId: parseRequiredPositiveInt(req.body?.teacherId ?? req.body?.teacher_id, "teacher ID"),
        kind: "free",
        termId: parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"),
        expiresAt: parseOptionalFutureIsoDate(req.body?.expiresAt ?? req.body?.expires_at, "expiration date"),
        maxRedemptions: parseOptionalPositiveInt(req.body?.maxRedemptions ?? req.body?.max_redemptions, "max redemptions"),
        adminActorId: currentUserId(req),
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
      res.status(201).json({ success: true, data: sanitizeAccessCodeResponse(data) });
    } catch (error) {
      next(error);
    }
  },

  async adminListPrintTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.listTemplates({
        status: typeof req.query.status === "string" ? req.query.status : undefined,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminCreatePrintTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.createTemplate({
        name: String(req.body?.name || "").trim(),
        backgroundFileAssetId: parseRequiredPositiveInt(req.body?.backgroundFileAssetId ?? req.body?.background_file_asset_id, "background file asset ID"),
        widthPx: parseRequiredPositiveInt(req.body?.widthPx ?? req.body?.width_px, "template width"),
        heightPx: parseRequiredPositiveInt(req.body?.heightPx ?? req.body?.height_px, "template height"),
        ppi: parseRequiredPositiveInt(req.body?.ppi, "template PPI"),
        layout: req.body?.layout ?? req.body?.layout_json,
        defaultRequiredFields: req.body?.defaultRequiredFields ?? req.body?.default_required_fields_json ?? {},
        createdBy: currentUserId(req),
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminUpdatePrintTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.updateTemplate(parseId(req.params.templateId, "template ID"), {
        name: req.body?.name === undefined ? undefined : String(req.body.name || "").trim(),
        backgroundFileAssetId: req.body?.backgroundFileAssetId === undefined && req.body?.background_file_asset_id === undefined
          ? undefined
          : parseRequiredPositiveInt(req.body?.backgroundFileAssetId ?? req.body?.background_file_asset_id, "background file asset ID"),
        layout: req.body?.layout ?? req.body?.layout_json,
        defaultRequiredFields: req.body?.defaultRequiredFields ?? req.body?.default_required_fields_json,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminDeletePrintTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.deleteTemplate(parseId(req.params.templateId, "template ID"));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminArchivePrintTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.archiveTemplate(parseId(req.params.templateId, "template ID"), currentUserId(req));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminActivatePrintTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.activateTemplate(parseId(req.params.templateId, "template ID"), currentUserId(req));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminListPrintPresets(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.listPresets({
        presetType: req.query.presetType || req.query.preset_type ? parsePrintPresetType(req.query.presetType ?? req.query.preset_type) : undefined,
        active: req.query.active === undefined ? undefined : parseBoolean(req.query.active),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminCreatePrintPreset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.createPreset({
        presetType: parsePrintPresetType(req.body?.presetType ?? req.body?.preset_type),
        label: String(req.body?.label || "").trim(),
        displayText: String(req.body?.displayText ?? req.body?.display_text ?? "").trim(),
        sortOrder: parseOptionalPositiveInt(req.body?.sortOrder ?? req.body?.sort_order, "sort order") ?? 0,
        createdBy: currentUserId(req),
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminCreatePrintBatchSnapshot(req: Request, res: Response, next: NextFunction) {
    try {
      const rawAccessCodeIds = req.body?.accessCodeIds ?? req.body?.access_code_ids;
      const accessCodes = Array.isArray(rawAccessCodeIds)
        ? rawAccessCodeIds.map((id: unknown) => ({ id: parseRequiredPositiveInt(id, "access code ID") }))
        : [];
      const data = await domainServices().accessCodePrint.createBatchSnapshot({
        label: String(req.body?.label || "").trim(),
        templateId: parseRequiredPositiveInt(req.body?.templateId ?? req.body?.template_id, "template ID"),
        teacherId: parseRequiredPositiveInt(req.body?.teacherId ?? req.body?.teacher_id, "teacher ID"),
        bookletInstanceId: parseRequiredPositiveInt(req.body?.bookletInstanceId ?? req.body?.booklet_instance_id, "instance ID"),
        termId: parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"),
        kind: req.body?.kind ? parseAccessCodeKind(req.body.kind) : "paid",
        count: parseRequiredPositiveInt(req.body?.count, "access code count"),
        createdBy: currentUserId(req),
        batchValues: req.body?.batchValues ?? req.body?.batch_values ?? {},
        requiredFields: req.body?.requiredFields ?? req.body?.required_fields ?? {},
        visibleFields: req.body?.visibleFields ?? req.body?.visible_fields ?? {},
        teacherImageFileAssetId: parseOptionalPositiveInt(req.body?.teacherImageFileAssetId ?? req.body?.teacher_image_file_asset_id, "teacher image file asset ID") ?? null,
        pdfFileAssetId: parseOptionalPositiveInt(req.body?.pdfFileAssetId ?? req.body?.pdf_file_asset_id, "PDF file asset ID") ?? null,
        expiresAt: parseOptionalFutureIsoDate(req.body?.expiresAt ?? req.body?.expires_at, "expiration date"),
        accessCodes,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminListPrintBatches(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.listBatches({
        teacherId: parseOptionalPositiveInt(req.query.teacherId ?? req.query.teacher_id, "teacher ID") ?? undefined,
        bookletInstanceId: parseOptionalPositiveInt(req.query.bookletInstanceId ?? req.query.booklet_instance_id, "instance ID") ?? undefined,
        templateId: parseOptionalPositiveInt(req.query.templateId ?? req.query.template_id, "template ID") ?? undefined,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminGeneratePrintBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.generatePrintableBatch({
        label: String(req.body?.label || "").trim(),
        templateId: parseRequiredPositiveInt(req.body?.templateId ?? req.body?.template_id, "template ID"),
        teacherId: parseRequiredPositiveInt(req.body?.teacherId ?? req.body?.teacher_id, "teacher ID"),
        bookletInstanceId: parseRequiredPositiveInt(req.body?.bookletInstanceId ?? req.body?.booklet_instance_id, "instance ID"),
        termId: parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"),
        kind: req.body?.kind ? parseAccessCodeKind(req.body.kind) : "paid",
        count: parseRequiredPositiveInt(req.body?.count, "access code count"),
        createdBy: currentUserId(req),
        batchValues: req.body?.batchValues ?? req.body?.batch_values ?? {},
        requiredFields: req.body?.requiredFields ?? req.body?.required_fields ?? {},
        visibleFields: req.body?.visibleFields ?? req.body?.visible_fields ?? {},
        teacherImageFileAssetId: parseOptionalPositiveInt(req.body?.teacherImageFileAssetId ?? req.body?.teacher_image_file_asset_id, "teacher image file asset ID") ?? null,
        pdfFileAssetId: parseOptionalPositiveInt(req.body?.pdfFileAssetId ?? req.body?.pdf_file_asset_id, "PDF file asset ID") ?? null,
        expiresAt: parseOptionalFutureIsoDate(req.body?.expiresAt ?? req.body?.expires_at, "expiration date"),
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async adminPreviewPrintCard(req: Request, res: Response, next: NextFunction) {
    try {
      const buffer = await domainServices().accessCodePrint.renderPreviewCard({
        templateId: parseRequiredPositiveInt(req.body?.templateId ?? req.body?.template_id, "template ID"),
        code: String(req.body?.code || "KLM PREV IEW"),
        qrRedeemUrl: String(req.body?.qrRedeemUrl ?? req.body?.qr_redeem_url ?? "https://kalima.test/e-booklet-code/qr/preview"),
        teacherImageFileAssetId: parseOptionalPositiveInt(req.body?.teacherImageFileAssetId ?? req.body?.teacher_image_file_asset_id, "teacher image file asset ID") ?? null,
        batchValues: req.body?.batchValues ?? req.body?.batch_values ?? {},
        visibleFields: req.body?.visibleFields ?? req.body?.visible_fields ?? {},
      });
      setPrivateNoStore(res);
      res.type("image/png");
      setInlineFilename(res, "access-code-preview.png", "access-code-preview.png");
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  async adminDownloadPrintBatchPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const assetId = await domainServices().accessCodePrint.getBatchPdfAssetId(parseId(req.params.batchId, "batch ID"));
      const { asset, absolutePath } = await getEBookletService().getPrivateFileAssetForAdmin(assetId);
      setPrivateNoStore(res);
      res.type(asset.mime_type || "application/pdf");
      res.set("Content-Disposition", buildContentDisposition("attachment", asset.original_filename, "access-code-batch.pdf"));
      await serveEBookletFile(req, res, absolutePath, "admin_access_code_pdf");
    } catch (error) {
      next(error);
    }
  },

  async getPrintQrPrefill(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().accessCodePrint.getQrPrefill(parseParam(req.params.ref, "QR reference"));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getPrintQrTeacherImage(req: Request, res: Response, next: NextFunction) {
    try {
      const assetId = await domainServices().accessCodePrint.getQrTeacherImageAssetId(parseParam(req.params.ref, "QR reference"));
      const { asset, absolutePath } = await getEBookletService().getPrivateFileAssetForAdmin(assetId);
      setPrivateNoStore(res);
      res.type(asset.mime_type || "image/png");
      setInlineFilename(res, asset.original_filename, "teacher-image");
      await serveEBookletFile(req, res, absolutePath, "admin_access_code_pdf");
    } catch (error) {
      next(error);
    }
  },

  async redeemAccessCode(req: Request, res: Response, next: NextFunction) {
    try {
      const code = String(req.body?.code || "").trim();
      if (!code) throw new BadRequestError("E-booklet access code is required.");
      const data = await domainServices().redemptions.redeemCode(code, currentUserId(req), {
        termsAccepted: parseStrictBoolean(req.body?.termsAccepted ?? req.body?.terms_accepted, "terms acceptance"),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        purchaseId: parseOptionalPositiveInt(req.body?.purchaseId ?? req.body?.purchase_id, "purchase ID"),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async previewAccessCode(req: Request, res: Response, next: NextFunction) {
    try {
      const code = String(req.query?.code || req.body?.code || "").trim();
      if (!code) throw new BadRequestError("E-booklet access code is required.");
      const data = await domainServices().redemptions.previewCode(code, currentUserId(req));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listMilestones(req: Request, res: Response, next: NextFunction) {
    try {
      const isAdminRoute = req.path.startsWith("/admin/");
      const data = await domainServices().milestones.listMilestones(
        optionalNumber(req.query.term_id),
        isAdminRoute ? undefined : currentUserId(req),
        isAdminRoute,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().milestones.createMilestone(req.body, currentUserId(req));
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().milestones.updateMilestone(parseId(req.params.milestoneId, "milestone ID"), req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async deleteMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().milestones.deleteMilestone(parseId(req.params.milestoneId, "milestone ID"));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async reorderMilestones(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().milestones.reorderMilestones(parseRequiredPositiveInt(req.body?.termId ?? req.body?.term_id, "term ID"), req.body?.items ?? []);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listAdminProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().milestones.listProgress(optionalNumber(req.query.term_id));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async evaluateMilestones(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().milestones.evaluateTeacherMilestones(currentUserId(req), optionalNumber(req.body?.termId ?? req.body?.term_id));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getTeacherWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const teacherId = currentUserId(req);
      const [wallet, ledger, rewardLots] = await Promise.all([
        domainServices().wallet.getWallet(teacherId),
        domainServices().wallet.listLedger(teacherId),
        domainServices().wallet.listRewardLots(teacherId),
      ]);
      res.status(200).json({ success: true, data: { wallet, ledger, rewardLots } });
    } catch (error) {
      next(error);
    }
  },

  async previewTeacherWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().wallet.previewPurchase({
        teacherId: currentUserId(req),
        purchaseTotal: parseRequiredFiniteMoney(req.body?.purchaseTotal ?? req.body?.purchase_total, "purchase total", true),
        requestedAmount: parseRequiredFiniteMoney(req.body?.requestedAmount ?? req.body?.requested_amount, "wallet credit amount"),
        couponApplied: parseBoolean(req.body?.couponApplied ?? req.body?.coupon_applied),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async claimMilestoneReward(req: Request, res: Response, next: NextFunction) {
    try {
      const termsAccepted = parseBoolean(req.body?.termsAccepted ?? req.body?.terms_accepted);
      if (!termsAccepted) throw new BadRequestError("Reward claim terms must be accepted.");
      const data = await domainServices().milestones.claimReward(currentUserId(req), parseId(req.params.achievementId, "achievement ID"), {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        termsAccepted,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async applyTeacherWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await domainServices().wallet.applyToPurchase({
        teacherId: currentUserId(req),
        purchaseId: parseRequiredPositiveInt(req.body?.purchaseId ?? req.body?.purchase_id, "purchase ID"),
        purchaseTotal: parseRequiredFiniteMoney(req.body?.purchaseTotal ?? req.body?.purchase_total, "purchase total", true),
        requestedAmount: parseRequiredFiniteMoney(req.body?.requestedAmount ?? req.body?.requested_amount, "wallet credit amount"),
        couponApplied: parseBoolean(req.body?.couponApplied ?? req.body?.coupon_applied),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async acceptInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const inviteToken = parseParam(req.params.token, "invite token");
      const dto = await validateDto(AcceptEBookletInviteDto, {
        ...normalizeMultipartEBookletBody(req.body),
        token: inviteToken,
      });
      const service = getEBookletService();
      const userId = currentUserId(req);
      let data;
      if (dto.accessPath === EBookletInviteAccessPathDto.free) {
        data = await service.acceptFreeInvite(inviteToken, userId, dto);
      } else if (dto.accessPath === EBookletInviteAccessPathDto.offline_passcode) {
        data = await service.acceptInvitePasscode(inviteToken, userId, dto, {
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          deviceFingerprint: req.get("x-e-booklet-device") || req.body?.deviceFingerprint,
        });
      } else if (dto.accessPath === EBookletInviteAccessPathDto.online_purchase) {
        data = await service.createStudentPurchaseLink(inviteToken, userId, dto, (req as any).file);
      } else {
        throw new BadRequestError("Invite accessPath is required.");
      }
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getViewerMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicViewerMetadata(
        parseId(req.params.instanceId, "instance ID"),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getAdminViewerMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getAdminViewerMetadata(
        parseId(req.params.instanceId, "instance ID"),
        currentUserId(req),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async bindViewerDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(EBookletDeviceBindDto, req.body);
      const data = await getEBookletService().bindViewerDevice(
        parseId(req.params.instanceId, "instance ID"),
        currentUserId(req),
        {
          deviceFingerprint: dto.deviceFingerprint,
          deviceLabel: dto.deviceLabel,
          userAgent: req.get("user-agent"),
          ipAddress: req.ip,
        },
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listViewerDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().listViewerDevices(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.userId, "user ID"),
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async resetViewerDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().resetViewerDevices(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.userId, "user ID"),
        currentUserId(req),
        req.body?.reason,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async addDeviceAllowance(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = await validateDto(EBookletDeviceAllowanceDto, req.body);
      const data = await getEBookletService().addDeviceAllowance(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.userId, "user ID"),
        currentUserId(req),
        dto.allowedDevices,
        dto.reason,
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async approveStudentPurchaseLink(req: Request, res: Response, next: NextFunction) {
    try {
      throw new BadRequestError("Direct student e-booklet purchase approval is disabled. Students must redeem a teacher-provided URL or access code.");
    } catch (error) {
      next(error);
    }
  },

  async getViewerPage(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicViewerPage(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.pageNumber, "page number"),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getAdminViewerPage(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getAdminViewerPage(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.pageNumber, "page number"),
        currentUserId(req),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getViewerPageHotspots(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicViewerPageHotspots(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.pageNumber, "page number"),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getAdminViewerPageHotspots(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getAdminViewerPageHotspots(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.pageNumber, "page number"),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getHotspotContent(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getPublicHotspotContent(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.hotspotId, "hotspot ID"),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getAdminHotspotContent(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getEBookletService().getAdminHotspotContent(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.hotspotId, "hotspot ID"),
      );
      setPrivateNoStore(res);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getAuthorizedViewerDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const pageNumber = parseOptionalId(req.query.page);
      if (!pageNumber) throw new BadRequestError("E-booklet document page is required.");
      const pageAccessToken = req.get("X-E-Booklet-Page-Token") || "";
      const { asset, absolutePath, pageBuffer } = await getEBookletService().getPublicAuthorizedViewerDocument(
        parseId(req.params.instanceId, "instance ID"),
        pageNumber,
        pageAccessToken,
      );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "application/pdf");
      setInlineFilename(res, asset.original_filename, "e-booklet-document.pdf");
      if (pageBuffer) {
        res.send(pageBuffer);
        return;
      }
      await serveEBookletFile(req, res, absolutePath, "ebooklet_document");
    } catch (error) {
      next(error);
    }
  },

  async getAuthorizedViewerDocumentPagePreview(req: Request, res: Response, next: NextFunction) {
    try {
      const pageNumber = parseOptionalId(req.query.page) || parseId(req.params.pageNumber, "page number");
      const pageAccessToken = req.get("X-E-Booklet-Page-Token") || "";
      const { asset, absolutePath, pageBuffer } = await getEBookletService().getPublicAuthorizedViewerDocumentPagePreview(
        parseId(req.params.instanceId, "instance ID"),
        pageNumber,
        pageAccessToken,
      );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "image/webp");
      setInlineFilename(res, asset.original_filename, "e-booklet-page.webp");
      if (pageBuffer) {
        res.send(pageBuffer);
        return;
      }
      await serveEBookletFile(req, res, absolutePath, "ebooklet_page_image");
    } catch (error) {
      next(error);
    }
  },

  async getAdminAuthorizedViewerDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const pageNumber = parseOptionalId(req.query.page);
      if (!pageNumber) throw new BadRequestError("E-booklet document page is required.");
      const pageAccessToken = req.get("X-E-Booklet-Page-Token") || "";
      const { asset, absolutePath, pageBuffer } = await getEBookletService().getAdminAuthorizedViewerDocument(
        parseId(req.params.instanceId, "instance ID"),
        pageNumber,
        pageAccessToken,
        currentUserId(req),
      );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "application/pdf");
      setInlineFilename(res, asset.original_filename, "e-booklet-document.pdf");
      if (pageBuffer) {
        res.send(pageBuffer);
        return;
      }
      await serveEBookletFile(req, res, absolutePath, "ebooklet_document");
    } catch (error) {
      next(error);
    }
  },

  async getAdminAuthorizedViewerDocumentPagePreview(req: Request, res: Response, next: NextFunction) {
    try {
      const pageNumber = parseOptionalId(req.query.page) || parseId(req.params.pageNumber, "page number");
      const pageAccessToken = req.get("X-E-Booklet-Page-Token") || "";
      const { asset, absolutePath, pageBuffer } = await getEBookletService().getAdminAuthorizedViewerDocumentPagePreview(
        parseId(req.params.instanceId, "instance ID"),
        pageNumber,
        pageAccessToken,
        currentUserId(req),
      );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "image/webp");
      setInlineFilename(res, asset.original_filename, "e-booklet-page.webp");
      if (pageBuffer) {
        res.send(pageBuffer);
        return;
      }
      await serveEBookletFile(req, res, absolutePath, "ebooklet_page_image");
    } catch (error) {
      next(error);
    }
  },

  async getAuthorizedHotspotAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const { asset, absolutePath } = await getEBookletService().getPublicHotspotAsset(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.hotspotId, "hotspot ID"),
        parseId(req.params.assetId, "asset ID"),
      );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "application/octet-stream");
      setInlineFilename(res, asset.original_filename, "e-booklet-file");
      await serveEBookletFile(req, res, absolutePath, "ebooklet_hotspot_media");
    } catch (error) {
      next(error);
    }
  },

  async getAdminAuthorizedHotspotAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const { asset, absolutePath } = await getEBookletService().getAdminAuthorizedHotspotAsset(
        parseId(req.params.instanceId, "instance ID"),
        parseId(req.params.hotspotId, "hotspot ID"),
        parseId(req.params.assetId, "asset ID"),
      );
      setPrivateNoStore(res);
      res.type(asset.mime_type || "application/octet-stream");
      setInlineFilename(res, asset.original_filename, "e-booklet-file");
      await serveEBookletFile(req, res, absolutePath, "ebooklet_hotspot_media");
    } catch (error) {
      next(error);
    }
  },
};
