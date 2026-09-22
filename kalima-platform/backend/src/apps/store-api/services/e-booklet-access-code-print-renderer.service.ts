import sharp from "sharp";
import QRCode from "qrcode";
import { PDFDocument, rgb } from "pdf-lib";
import { BadRequestError } from "../../../libs/errors";
import {
  E_BOOKLET_PRINT_CARD_HEIGHT_PX,
  E_BOOKLET_PRINT_CARD_PPI,
  E_BOOKLET_PRINT_CARD_WIDTH_PX,
} from "./e-booklet-access-code-print.service";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PRINT_COLUMNS = 3;
const PRINT_ROWS = 8;

type FieldBox = {
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

type PrintLayout = {
  fields?: Record<string, FieldBox | undefined>;
};

type PrintCardRenderInput = {
  code: string;
  qrRedeemUrl: string;
  teacherImage?: Buffer | null;
  batchValues?: Record<string, any>;
  visibleFields?: Record<string, boolean | undefined>;
};

const RTL_TEXT_RE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;
const MIN_TEXT_FONT_SIZE = 9;
const PRINT_TEXT_FONT_FAMILIES = {
  "Noto Sans Arabic": "Noto Sans Arabic",
  "Noto Kufi Arabic": "Noto Kufi Arabic",
  "Noto Naskh Arabic": "Noto Naskh Arabic",
  "Alexandria": "Alexandria",
  "Aref Ruqaa": "Aref Ruqaa",
  "Tajawal": "Tajawal",
  "IBM Plex Sans Arabic": "IBM Plex Sans Arabic",
  "Reem Kufi": "Reem Kufi",
} as const;

export type PrintTextFontFamily = keyof typeof PRINT_TEXT_FONT_FAMILIES;
export const PRINT_TEXT_FONT_FAMILY_VALUES = Object.freeze(Object.keys(PRINT_TEXT_FONT_FAMILIES) as PrintTextFontFamily[]);

function resolvePrintFont(fontFamily: FieldBox["fontFamily"]) {
  return PRINT_TEXT_FONT_FAMILIES[fontFamily || "Noto Sans Arabic"] || PRINT_TEXT_FONT_FAMILIES["Noto Sans Arabic"];
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveDirection(field: FieldBox, value: unknown): "rtl" | "ltr" {
  if (field.direction === "rtl" || field.direction === "ltr") return field.direction;
  return RTL_TEXT_RE.test(String(value ?? "")) ? "rtl" : "ltr";
}

function resolveTextAlign(field: FieldBox, direction: "rtl" | "ltr"): "left" | "center" | "right" {
  if (field.align === "center") return "center";
  if (field.align === "left" || field.align === "right") return field.align;
  if (field.align === "end") return direction === "rtl" ? "left" : "right";
  return direction === "rtl" ? "right" : "left";
}

function svgTextAnchor(align: "left" | "center" | "right"): "start" | "middle" | "end" {
  if (align === "center") return "middle";
  return align === "right" ? "end" : "start";
}

function svgTextX(width: number, align: "left" | "center" | "right"): number {
  if (align === "center") return width / 2;
  return align === "right" ? width : 0;
}

function isolateText(value: unknown, direction: "rtl" | "ltr"): string {
  const text = String(value ?? "");
  return direction === "rtl" ? `\u202b${text}\u202c` : `\u202a${text}\u202c`;
}

function boundedField(field: FieldBox): FieldBox | null {
  const left = Math.max(0, Math.round(field.x));
  const top = Math.max(0, Math.round(field.y));
  const maxWidth = E_BOOKLET_PRINT_CARD_WIDTH_PX - left;
  const maxHeight = E_BOOKLET_PRINT_CARD_HEIGHT_PX - top;
  if (maxWidth <= 0 || maxHeight <= 0) return null;
  return {
    ...field,
    x: left,
    y: top,
    width: Math.max(1, Math.min(Math.round(field.width), maxWidth)),
    height: Math.max(1, Math.min(Math.round(field.height), maxHeight)),
  };
}

async function boundedOverlay(overlay: sharp.OverlayOptions): Promise<sharp.OverlayOptions | null> {
  const left = Math.max(0, Math.round(overlay.left || 0));
  const top = Math.max(0, Math.round(overlay.top || 0));
  const maxWidth = E_BOOKLET_PRINT_CARD_WIDTH_PX - left;
  const maxHeight = E_BOOKLET_PRINT_CARD_HEIGHT_PX - top;
  if (maxWidth <= 0 || maxHeight <= 0) return null;
  if (!Buffer.isBuffer(overlay.input)) {
    return { ...overlay, left, top };
  }
  const metadata = await sharp(overlay.input).metadata();
  const width = metadata.width || maxWidth;
  const height = metadata.height || maxHeight;
  if (width <= maxWidth && height <= maxHeight) {
    return { ...overlay, left, top };
  }
  return {
    ...overlay,
    input: await sharp(overlay.input)
      .resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer(),
    left,
    top,
  };
}

export class EBookletAccessCodePrintRendererService {
  private async renderTeacherImage(input: Buffer, field: FieldBox): Promise<Buffer> {
    try {
      return await sharp(input)
        .resize(Math.round(field.width), Math.round(field.height), { fit: "cover" })
        .png()
        .toBuffer();
    } catch {
      throw new BadRequestError("Teacher image could not be processed. Upload a valid PNG, JPEG, WebP, GIF, or AVIF image.");
    }
  }

  private async renderTextOverlay(field: FieldBox | undefined, value: unknown, fallback: Partial<FieldBox> = {}): Promise<sharp.OverlayOptions | null> {
    if (value === undefined || value === null || value === "") return null;
    if (!field) return null;
    const merged = boundedField({ ...fallback, ...field });
    if (!merged) return null;
    const width = Math.max(1, Math.round(merged.width));
    const height = Math.max(1, Math.round(merged.height));
    const fontSize = Math.max(MIN_TEXT_FONT_SIZE, Math.round(merged.fontSize || 24));
    const direction = resolveDirection(merged, value);
    const align = resolveTextAlign(merged, direction);
    const fontFamily = resolvePrintFont(merged.fontFamily);
    const text = `<span foreground="${escapeXml(merged.color || "#111827")}">${escapeXml(isolateText(value, direction))}</span>`;
    let lastError: unknown = null;
    for (let currentFontSize = fontSize; currentFontSize >= MIN_TEXT_FONT_SIZE; currentFontSize -= 1) {
      try {
        return {
          input: await sharp({
            text: {
              text,
              font: `${fontFamily} ${currentFontSize}`,
              width,
              height,
              align,
              rgba: true,
            },
          }).png().toBuffer(),
          left: Math.round(merged.x),
          top: Math.round(merged.y),
        };
      } catch (error) {
        lastError = error;
      }
    }
    if (!lastError) return null;
    const fallbackFontSize = Math.max(MIN_TEXT_FONT_SIZE, Math.min(fontSize, height));
    const fallbackSvg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${svgTextX(width, align)}" y="${height / 2}" fill="${escapeXml(merged.color || "#111827")}" font-family="${escapeXml(fontFamily)}, sans-serif" font-size="${fallbackFontSize}" text-anchor="${svgTextAnchor(align)}" dominant-baseline="middle" direction="${direction}">${escapeXml(String(value ?? ""))}</text>
      </svg>
    `;
    return {
      input: Buffer.from(fallbackSvg),
      left: Math.round(merged.x),
      top: Math.round(merged.y),
    };
  }

  async renderCardPng(input: {
    backgroundImage: Buffer;
    layout: PrintLayout;
    card: PrintCardRenderInput;
  }): Promise<Buffer> {
    const fields = input.layout.fields || {};
    const isVisible = (fieldName: string) => input.card.visibleFields?.[fieldName] !== false;
    if (!fields.qr || !fields.codeNumber) {
      throw new Error("Print layout requires QR and code number fields.");
    }
    const qrField = boundedField(fields.qr);
    if (!qrField) {
      throw new Error("Print layout QR field is outside the card bounds.");
    }
    const qrBuffer = await QRCode.toBuffer(input.card.qrRedeemUrl, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: Math.round(qrField.width),
    });
    const overlays: sharp.OverlayOptions[] = [
      {
        input: qrBuffer,
        left: Math.round(qrField.x),
        top: Math.round(qrField.y),
      },
    ];
    const teacherImageField = fields.teacherImage || fields.teacher_image;
    if (isVisible("teacherImage") && teacherImageField && input.card.teacherImage) {
      const boundedTeacherImageField = boundedField(teacherImageField);
      if (boundedTeacherImageField) {
        overlays.push({
          input: await this.renderTeacherImage(input.card.teacherImage, boundedTeacherImageField),
          left: Math.round(boundedTeacherImageField.x),
          top: Math.round(boundedTeacherImageField.y),
        });
      }
    }
    const textOverlays = await Promise.all([
      this.renderTextOverlay(fields.codeNumber, input.card.code, { direction: "ltr", align: "center", fontSize: 22 }),
      isVisible("gradeClass")
        ? this.renderTextOverlay(fields.gradeClass || fields.grade_class || fields.className, input.card.batchValues?.gradeClassText, { direction: "rtl", align: "center", fontSize: 22 })
        : null,
      isVisible("registrationMethod")
        ? this.renderTextOverlay(fields.registrationMethod || fields.registration_method, input.card.batchValues?.registrationMethodText, { direction: "rtl", align: "center", fontSize: 18 })
        : null,
      isVisible("price")
        ? this.renderTextOverlay(fields.price, input.card.batchValues?.priceText, { direction: "rtl", align: "center", fontSize: 18 })
        : null,
      isVisible("redCustomText")
        ? this.renderTextOverlay(fields.redCustomText || fields.red_custom_text, input.card.batchValues?.redCustomText, { direction: "rtl", align: "center", fontSize: 18, color: "#dc2626" })
        : null,
    ]);
    overlays.push(...textOverlays.filter((overlay): overlay is sharp.OverlayOptions => Boolean(overlay)));
    const boundedOverlays = (await Promise.all(overlays.map((overlay) => boundedOverlay(overlay))))
      .filter((overlay): overlay is sharp.OverlayOptions => Boolean(overlay));
    return sharp(input.backgroundImage)
      .resize(E_BOOKLET_PRINT_CARD_WIDTH_PX, E_BOOKLET_PRINT_CARD_HEIGHT_PX, { fit: "fill" })
      .composite(boundedOverlays)
      .png()
      .toBuffer();
  }

  async renderBatchPdf(cards: Array<{ png: Buffer }>): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    // The established 827 px card is 70.02 mm wide at 300 PPI. Three cards are
    // 0.06 mm wider than A4, so fit the width by 0.03% rather than introducing
    // page margins, gaps, or a material change to the printed card dimensions.
    const cardWidthPt = A4_WIDTH_PT / PRINT_COLUMNS;
    const cardHeightPt = (E_BOOKLET_PRINT_CARD_HEIGHT_PX / E_BOOKLET_PRINT_CARD_PPI) * 72;
    const perPage = PRINT_COLUMNS * PRINT_ROWS;

    for (let index = 0; index < cards.length; index += 1) {
      if (index % perPage === 0) {
        pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      }
      const page = pdf.getPage(pdf.getPageCount() - 1);
      const pageIndex = index % perPage;
      const col = pageIndex % PRINT_COLUMNS;
      const row = Math.floor(pageIndex / PRINT_COLUMNS);
      const image = await pdf.embedPng(cards[index].png);
      const x = col * cardWidthPt;
      const y = A4_HEIGHT_PT - cardHeightPt - row * cardHeightPt;
      page.drawRectangle({ x, y, width: cardWidthPt, height: cardHeightPt, color: rgb(1, 1, 1) });
      page.drawImage(image, { x, y, width: cardWidthPt, height: cardHeightPt });
    }
    return pdf.save();
  }
}
