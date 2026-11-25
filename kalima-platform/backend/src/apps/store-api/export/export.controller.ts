/**
 * Generic export controller factory.
 *
 * Usage in route files:
 *   router.get("/export", makeExportHandler("products"));
 *
 * Query params accepted:
 *   format  – "csv" | "xlsx" (required)
 *   lang    – "ar" | "en" (optional, controls localized headers)
 *   ids     – comma-separated integers (optional, for selected rows)
 *   *       – any other query params are forwarded as dynamic filters
 *            (each resource defines which filters it supports)
 */

import { Request, Response, NextFunction } from "express";
import { exportResource, type ExportFormat } from "./export.service";
import { BadRequestError } from "../../../libs/errors";

const VALID_FORMATS = new Set<ExportFormat>(["csv", "xlsx"]);

function parseIds(raw: unknown): number[] | undefined {
  if (!raw || typeof raw !== "string" || raw.trim() === "") return undefined;

  const ids = raw.split(",").map((s) => {
    const n = Number(s.trim());
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestError(`Invalid ID value: "${s.trim()}"`);
    }
    return n;
  });

  if (ids.length === 0) return undefined;
  return ids;
}

/**
 * Extracts all query params except `format` and `ids` as dynamic filters.
 * Auto-coerces booleans and numbers so fetchers get typed values.
 */
function parseQueryFilters(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const reserved = new Set(["format", "ids", "lang", "rtl"]);
  const filters: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(query)) {
    if (reserved.has(key) || raw === undefined || raw === "") continue;
    const val = String(raw);

    // booleans
    if (val === "true") {
      filters[key] = true;
      continue;
    }
    if (val === "false") {
      filters[key] = false;
      continue;
    }

    // numbers (integers and decimals), except text fields typed as digits
    if (/^\d+(\.\d+)?$/.test(val) && !/search|serial|phone|email|code|name/i.test(key)) {
      filters[key] = Number(val);
      continue;
    }

    // everything else stays a string (dates, search text, status, etc.)
    filters[key] = val;
  }

  return filters;
}

/**
 * Returns an Express handler that exports the given resource.
 */
export function makeExportHandler(resourceName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const format = (req.query.format as string)?.toLowerCase();
      if (!format || !VALID_FORMATS.has(format as ExportFormat)) {
        throw new BadRequestError(
          'Query parameter "format" is required and must be "csv" or "xlsx".',
        );
      }

      const ids = parseIds(req.query.ids);
      const filters = parseQueryFilters(req.query as Record<string, unknown>);
      const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;
      const rtl = req.query.rtl === "true" || lang?.toLowerCase().startsWith("ar");

      const result = await exportResource(
        resourceName,
        format as ExportFormat,
        ids,
        filters,
        { locale: lang, rtl },
      );

      res.setHeader("Content-Type", result.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  };
}
