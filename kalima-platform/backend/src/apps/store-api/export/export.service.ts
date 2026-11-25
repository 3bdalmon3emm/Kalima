/**
 * Generic export service.
 *
 * Centralises all "fetch records → flatten → serialize" logic.
 * Each resource registers a fetcher + mapper; the controller
 * simply calls `exportResource(name, format, ids)`.
 */

import { toCSV, type CsvOptions } from "../../../libs/export/csv-export";
import { toExcel, type ExcelOptions } from "../../../libs/export/excel-export";
import type { ExportMapper } from "./mappers";

// ─── Types ─────────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "xlsx";

export interface ExportResult {
  buffer: Buffer | string;
  contentType: string;
  filename: string;
}

export interface ResourceExportConfig<T = any> {
  /** Fetch all records (no pagination). When `ids` supplied, filter to those. */
  fetcher: (ids?: number[], filters?: Record<string, unknown>) => Promise<T[]>;
  /** Flattens a DB record to a key-value row and defines column order. */
  mapper: ExportMapper<T>;
  /** Sheet / file label (e.g. "products"). */
  label: string;
}

export interface ExportOptions {
  locale?: string;
  rtl?: boolean;
}

// ─── Registry ──────────────────────────────────────────────────────────

const registry = new Map<string, ResourceExportConfig>();

export function registerExportResource(
  name: string,
  config: ResourceExportConfig,
): void {
  registry.set(name, config);
}

export function getRegisteredResources(): string[] {
  return [...registry.keys()];
}

// ─── Core export ───────────────────────────────────────────────────────

const MAX_EXPORT_ROWS = 50_000;

export async function exportResource(
  resourceName: string,
  format: ExportFormat,
  ids?: number[],
  filters?: Record<string, unknown>,
  options?: ExportOptions,
): Promise<ExportResult> {
  const config = registry.get(resourceName);
  if (!config) {
    throw new Error(`Unknown export resource: ${resourceName}`);
  }

  // Rows picked by checkbox export exactly as picked, with no filter on top.
  const records = await config.fetcher(ids, ids && ids.length ? {} : filters);

  if (records.length > MAX_EXPORT_ROWS) {
    throw new Error(
      `Export limit exceeded: ${records.length} records (max ${MAX_EXPORT_ROWS}). Please narrow your selection.`,
    );
  }

  const locale = options?.locale?.toLowerCase().split("-")[0];
  const rows = records.map((record) => {
    const row = config.mapper.toRow(record);
    return config.mapper.localizeRow
      ? config.mapper.localizeRow(row, locale)
      : row;
  });
  const { columns } = config.mapper;
  const headers = locale && config.mapper.headersByLocale?.[locale]
    ? config.mapper.headersByLocale[locale]
    : config.mapper.headers;
  const timestamp = new Date().toISOString().split("T")[0];

  if (format === "csv") {
    const csv = toCSV(rows, { columns, headers } satisfies CsvOptions);
    return {
      buffer: csv,
      contentType: "text/csv; charset=utf-8",
      filename: `${config.label}-${timestamp}.csv`,
    };
  }

  const xlsxBuf = toExcel(rows, {
    sheetName: config.label,
    columns,
    headers,
    rtl: options?.rtl,
  } satisfies ExcelOptions);
  return {
    buffer: xlsxBuf,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `${config.label}-${timestamp}.xlsx`,
  };
}
