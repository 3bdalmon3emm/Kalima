/**
 * Registers every Store API v2 resource for export.
 *
 * Each registration provides:
 *   - A `fetcher` that returns all records (or a filtered subset by IDs / filters)
 *   - A `mapper` that flattens each record into a plain row
 *   - A `label` used as the file/sheet name
 *
 * Call `registerAllExportResources()` once at app startup.
 */

import { prisma } from "../../../libs/db/prisma";
import { registerExportResource } from "./export.service";
import { productService } from "../services/product.service";
import {
  productMapper,
  categoryMapper,
  couponMapper,
  purchaseMapper,
  eBookletPurchaseMapper,
  eBookletAccessMapper,
  sampleMapper,
  governmentMapper,
  zoneMapper,
  siteMapper,
  levelMapper,
  subjectMapper,
  requiredFieldMapper,
  userMapper,
  paymentMethodMapper,
} from "./mappers";
import {
  E_BOOKLET_ADMIN_PURCHASE_INCLUDE,
  EBookletService,
} from "../services/e-booklet.service";

// ─── Shared Prisma include shapes (mirrors existing services) ──────────

const PRODUCT_LIST_INCLUDE = {
  thumbnail_image: true,
  product_categories: {
    include: { categories: { select: { id: true, title: true } } },
  },
} as const;

const PURCHASE_INCLUDE = {
  purchase_items: {
    include: {
      products: {
        select: {
          id: true,
          title: true,
          serial: true,
          type: true,
          price: true,
        },
      },
    },
  },
  users: { select: { id: true, name: true, email: true, phone: true } },
  received_by_user: { select: { id: true, name: true } },
  confirmed_by_user: { select: { id: true, name: true } },
  returned_by_user: { select: { id: true, name: true } },
  payment_methods: { select: { id: true, name: true, phone_number: true } },
} as const;

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  secondary_phone: true,
  gender: true,
  is_email_verified: true,
  profile_pic_url: true,
  created_at: true,
  role: true,
  confirmed: true,
  user_roles: { select: { id: true, portal: true, role: true } },
} as const;

// ─── Registration ──────────────────────────────────────────────────────

export function registerAllExportResources(): void {
  // ── Products ───────────────────────────────────────────────────────
  // Filters: is_archived (bool), category_id (int), search (string)
  registerExportResource("products", {
    label: "products",
    mapper: productMapper,
    fetcher: async (ids, filters) => {
      // Picked rows export exactly as picked; otherwise the page's own filter.
      const where: any = ids
        ? { deleted_at: null, id: { in: ids } }
        : await productService.productListWhere(filters as any);

      return prisma.products.findMany({
        where,
        include: PRODUCT_LIST_INCLUDE,
        orderBy: { created_at: "desc" },
      });
    },
  });

  // ── Categories ─────────────────────────────────────────────────────
  // Filters: active (bool)
  registerExportResource("categories", {
    label: "categories",
    mapper: categoryMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      return prisma.categories.findMany({
        where,
        orderBy: { title: "asc" },
      });
    },
  });

  // ── Coupons ────────────────────────────────────────────────────────
  // Filters: active (bool), product_id (int), category_id (int), startDate (ISO), endDate (ISO), isAmount (bool)
  registerExportResource("coupons", {
    label: "coupons",
    mapper: couponMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        deleted_at: null,
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      if (filters?.product_id !== undefined) {
        where.product_id = filters.product_id as number;
      }

      if (filters?.category_id !== undefined) {
        where.category_id = filters.category_id as number;
      }

      if (filters?.startDate || filters?.endDate) {
        where.created_at = {};
        if (filters.startDate) {
          where.created_at.gte = new Date(filters.startDate as string);
        }
        if (filters.endDate) {
          const endOfDay = new Date(filters.endDate as string);
          endOfDay.setUTCHours(23, 59, 59, 999);
          where.created_at.lte = endOfDay;
        }
      }

      if (filters?.isAmount !== undefined) {
        where.type = (filters.isAmount as boolean) ? "fixed" : "percentage";
      }

      return prisma.coupons.findMany({
        where,
        include: {
          product: { select: { id: true, title: true } },
          category: { select: { id: true, title: true } },
        },
        orderBy: { created_at: "desc" },
      });
    },
  });

  // ── Purchases ──────────────────────────────────────────────────────
  // Filters: status (string), search (string), startDate (ISO), endDate (ISO),
  //          minTotal (number), maxTotal (number)
  registerExportResource("purchases", {
    label: "purchases",
    mapper: purchaseMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.productId) {
        where.purchase_items = {
          some: {
            product_id: Number(filters.productId),
            is_deleted: false,
          },
        };
      }

      if (filters?.status) {
        where.status = filters.status as string;
      }

      if (filters?.startDate || filters?.endDate) {
        where.created_at = {};
        if (filters.startDate) {
          where.created_at.gte = new Date(filters.startDate as string);
        }
        if (filters.endDate) {
          where.created_at.lte = new Date(filters.endDate as string);
        }
      }

      if (filters?.minTotal !== undefined || filters?.maxTotal !== undefined) {
        where.total = {};
        if (filters.minTotal !== undefined)
          where.total.gte = filters.minTotal as number;
        if (filters.maxTotal !== undefined)
          where.total.lte = filters.maxTotal as number;
      }

      if (filters?.search) {
        const s = (filters.search as string).trim();
        where.OR = [
          { purchase_serial: { contains: s, mode: "insensitive" } },
          { number_transferred_from: { contains: s, mode: "insensitive" } },
          { users: { name: { contains: s, mode: "insensitive" } } },
          { users: { email: { contains: s, mode: "insensitive" } } },
          { users: { phone: { contains: s, mode: "insensitive" } } },
          {
            purchase_items: {
              some: {
                products: { title: { contains: s, mode: "insensitive" } },
              },
            },
          },
          {
            purchase_items: {
              some: {
                products: { serial: { contains: s, mode: "insensitive" } },
              },
            },
          },
        ];
      }

      return prisma.purchases.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: { created_at: "desc" },
      });
    },
  });

  // ── E-booklet Purchases ─────────────────────────────────────────────
  // Filters: status (string), search (string), startDate (ISO), endDate (ISO),
  //          minTotal (number), maxTotal (number)
  registerExportResource("admin/e-booklet-purchases", {
    label: "e-booklet-purchases",
    mapper: eBookletPurchaseMapper,
    fetcher: (ids, filters) => {
      const service = new EBookletService(prisma as any);
      const where: any = service.buildAdminPurchaseWhere(filters || {});
      if (ids) where.id = { in: ids };

      return prisma.e_booklet_purchases.findMany({
        where,
        include: E_BOOKLET_ADMIN_PURCHASE_INCLUDE,
        orderBy: { created_at: "desc" },
      });
    },
  });

  // ── E-booklet Teacher Access ───────────────────────────────────────
  // Filters: status (string), teacher_id (int)
  registerExportResource("admin/e-booklet-instances", {
    label: "e-booklet-teacher-access",
    mapper: eBookletAccessMapper,
    fetcher: async (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.status) {
        where.status = filters.status as string;
      }

      if (filters?.teacher_id !== undefined) {
        where.teacher_id = filters.teacher_id as number;
      }

      const instances = await prisma.e_booklet_instances.findMany({
        where,
        include: {
          teacher: { select: { id: true, name: true, email: true, phone: true } },
          template: { select: { id: true, title: true } },
          template_version: {
            select: {
              id: true,
              version_number: true,
            },
          },
          purchase: {
            include: {
              payment_methods: { select: { id: true, name: true, phone_number: true } },
              required_fields: {
                include: {
                  required_field_definitions: { select: { label: true } },
                },
              },
            },
          },
          access_records: {
            where: { role: "student" },
            include: { user: { select: { id: true, name: true, email: true, phone: true } } },
            orderBy: { granted_at: "desc" },
          },
          invites: { select: { id: true, status: true, max_uses: true, used_count: true } },
          access_codes: {
            select: {
              id: true,
              kind: true,
              status: true,
              code_hint: true,
              max_redemptions: true,
              redeemed_count: true,
            },
          },
          devices: {
            select: {
              id: true,
              user_id: true,
              status: true,
              last_seen_at: true,
            },
          },
          device_allowances: {
            select: { user_id: true, allowed_devices: true },
          },
          redemptions: {
            select: {
              id: true,
              invite_id: true,
              student_id: true,
              redeemed_at: true,
            },
          },
          access_code_redemptions: {
            select: {
              id: true,
              access_code_id: true,
              student_id: true,
              purchase_id: true,
              counted_for_progress: true,
              redeemed_at: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      });

      const instanceIds = instances.map((instance: any) => Number(instance.id));
      const studentIds = Array.from(new Set(instances.flatMap((instance: any) =>
        (instance.access_records || []).map((access: any) => Number(access.user_id)).filter(Number.isInteger),
      )));
      const analyticsEvents = instanceIds.length && studentIds.length
        ? await prisma.e_booklet_analytics_events.findMany({
          where: {
            booklet_instance_id: { in: instanceIds },
            student_id: { in: studentIds },
          },
          select: {
            booklet_instance_id: true,
            student_id: true,
            event_type: true,
          },
        })
        : [];

      const analyticsByKey = new Map<string, Record<string, number>>();
      analyticsEvents.forEach((event: any) => {
        const key = `${event.booklet_instance_id}:${event.student_id}`;
        const current = analyticsByKey.get(key) || {};
        current[event.event_type] = Number(current[event.event_type] || 0) + 1;
        analyticsByKey.set(key, current);
      });

      const isoValue = (value: unknown) => {
        if (!value) return "";
        const date = new Date(value as string | Date);
        return Number.isNaN(date.getTime()) ? "" : date.toISOString();
      };
      const decimalValue = (value: unknown) => value === null || value === undefined ? "" : Number(value);
      const sum = (items: any[], selector: (item: any) => number) =>
        items.reduce((total, item) => total + selector(item), 0);

      return instances.flatMap((instance: any) => {
        const accessRows = instance.access_records?.length ? instance.access_records : [null];
        const activeInvites = (instance.invites || []).filter((invite: any) => invite.status === "active").length;
        const activeAccessCodes = (instance.access_codes || []).filter((code: any) => code.status === "active").length;
        const requiredFields = (instance.purchase?.required_fields || [])
          .map((field: any) => {
            const label = field.required_field_definitions?.label || field.field_definition_id;
            return `${label}: ${field.value ?? ""}`;
          })
          .join("; ");
        const codeHints = (instance.access_codes || [])
          .map((code: any) => code.code_hint ? `****${code.code_hint}` : "")
          .filter(Boolean)
          .join("; ");

        return accessRows.map((access: any) => {
          const studentId = Number(access?.user_id ?? access?.user?.id);
          const key = `${instance.id}:${studentId}`;
          const studentDevices = (instance.devices || []).filter((device: any) => Number(device.user_id) === studentId);
          const activeStudentDevices = studentDevices.filter((device: any) => device.status === "active");
          const lastSeen = studentDevices
            .map((device: any) => device.last_seen_at ? new Date(device.last_seen_at) : null)
            .filter(Boolean)
            .sort((a: any, b: any) => b.getTime() - a.getTime())[0];
          const allowance = (instance.device_allowances || []).find((item: any) => Number(item.user_id) === studentId);
          const inviteRedemption = (instance.redemptions || []).find((item: any) => Number(item.student_id) === studentId);
          const codeRedemption = (instance.access_code_redemptions || []).find((item: any) => Number(item.student_id) === studentId);
          const analytics = analyticsByKey.get(key) || {};

          return {
            teacher_id: instance.teacher?.id ?? instance.teacher_id ?? "",
            teacher_name: instance.teacher?.name ?? "",
            teacher_email: instance.teacher?.email ?? "",
            teacher_phone: instance.teacher?.phone ?? "",
            instance_id: instance.id,
            instance_status: instance.status ?? "",
            e_booklet_title: instance.display_title ?? "",
            template_title: instance.template?.title ?? "",
            version: instance.template_version?.version_number ? `v${instance.template_version.version_number}` : "",
            purchase_id: instance.purchase_id ?? "",
            purchase_status: instance.purchase?.status ?? "",
            teacher_price: decimalValue(instance.purchase?.final_payable_price ?? instance.purchase?.price),
            student_marketing_price: decimalValue(instance.student_marketing_price),
            internal_price: decimalValue(instance.internal_price),
            currency: instance.purchase?.currency ?? "",
            payment_method: instance.purchase?.payment_methods?.name ?? instance.purchase?.payment_method ?? "",
            payment_reference: instance.purchase?.payment_reference ?? "",
            invite_quota: instance.invite_quota ?? 0,
            used_student_seats: instance.used_invites_count ?? (instance.access_records || []).length,
            active_instance_devices: (instance.devices || []).filter((device: any) => device.status === "active").length,
            access_expires_at: isoValue(instance.access_expires_at),
            instance_created_at: isoValue(instance.created_at),
            student_access_id: access?.id ?? "",
            student_id: access?.user?.id ?? access?.user_id ?? "",
            student_name: access?.user?.name ?? "",
            student_email: access?.user?.email ?? "",
            student_phone: access?.user?.phone ?? "",
            student_access_status: access?.status ?? "",
            student_access_source: access?.access_source ?? "",
            student_granted_at: isoValue(access?.granted_at),
            student_revoked_at: isoValue(access?.revoked_at),
            student_terms_accepted_at: isoValue(access?.terms_accepted_at),
            allowed_devices: allowance?.allowed_devices ?? "",
            active_student_devices: activeStudentDevices.length,
            total_student_devices: studentDevices.length,
            student_last_seen_at: isoValue(lastSeen),
            viewer_opens: analytics.viewer_opened ?? 0,
            pages_viewed: analytics.page_viewed ?? 0,
            device_binds: analytics.device_bound ?? 0,
            invite_redemption_id: inviteRedemption?.id ?? "",
            access_code_redemption_id: codeRedemption?.id ?? "",
            redemption_source: codeRedemption ? "access_code" : inviteRedemption ? "invite" : "",
            redemption_purchase_id: codeRedemption?.purchase_id ?? "",
            redemption_counted_for_progress: codeRedemption ? (codeRedemption.counted_for_progress ? "Yes" : "No") : "",
            redemption_redeemed_at: isoValue(codeRedemption?.redeemed_at ?? inviteRedemption?.redeemed_at),
            active_invites: activeInvites,
            total_invites: (instance.invites || []).length,
            invite_uses: sum(instance.invites || [], (invite: any) => Number(invite.used_count || 0)),
            active_access_codes: activeAccessCodes,
            total_access_codes: (instance.access_codes || []).length,
            paid_access_codes: (instance.access_codes || []).filter((code: any) => code.kind === "paid").length,
            free_access_codes: (instance.access_codes || []).filter((code: any) => code.kind === "free").length,
            access_code_redemptions: sum(instance.access_codes || [], (code: any) => Number(code.redeemed_count || 0)),
            access_code_hints: codeHints,
            required_fields: requiredFields,
            admin_notes: instance.purchase?.admin_notes ?? "",
          };
        });
      });
    },
  });

  // ── Samples ────────────────────────────────────────────────────────
  // Filters: search (string), section_id (int), product_id (int), media_type (string), is_archived (bool)
  registerExportResource("samples", {
    label: "samples",
    mapper: sampleMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.search) {
        const search = filters.search as string;
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { original_name: { contains: search, mode: "insensitive" } },
          { products: { title: { contains: search, mode: "insensitive" } } },
          { sample_sections: { title: { contains: search, mode: "insensitive" } } },
        ];
      }

      if (filters?.section_id !== undefined) {
        where.section_id = filters.section_id as number;
      }

      if (filters?.product_id !== undefined) {
        where.product_id = filters.product_id as number;
      }

      if (filters?.media_type) {
        where.media_type = filters.media_type as string;
      }

      if (filters?.is_archived !== undefined) {
        where.is_archived = filters.is_archived as boolean;
      }

      return prisma.samples.findMany({
        where,
        include: {
          sample_sections: { select: { id: true, title: true, active: true } },
          products: {
            select: {
              id: true,
              title: true,
              serial: true,
              type: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      });
    },
  });

  // ── Governments ────────────────────────────────────────────────────
  // Filters: active (bool)
  registerExportResource("governments", {
    label: "governments",
    mapper: governmentMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      return prisma.government.findMany({
        where,
        orderBy: { title: "asc" },
      });
    },
  });

  // ── Zones ──────────────────────────────────────────────────────────
  // Filters: government_id (int), active (bool)
  registerExportResource("zones", {
    label: "zones",
    mapper: zoneMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.government_id !== undefined) {
        where.government_id = filters.government_id as number;
      }

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      return prisma.zones.findMany({
        where,
        orderBy: { title: "asc" },
      });
    },
  });

  // ── Sites ──────────────────────────────────────────────────────────
  // Filters: active (bool)
  registerExportResource("sites", {
    label: "sites",
    mapper: siteMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      return prisma.sites.findMany({
        where,
        orderBy: { title: "asc" },
      });
    },
  });

  // ── Levels ─────────────────────────────────────────────────────────
  // Filters: active (bool)
  registerExportResource("levels", {
    label: "levels",
    mapper: levelMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      return prisma.levels.findMany({
        where,
        orderBy: { title: "asc" },
      });
    },
  });

  // ── Subjects ───────────────────────────────────────────────────────
  // Filters: active (bool)
  registerExportResource("subjects", {
    label: "subjects",
    mapper: subjectMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      return prisma.subjects.findMany({
        where,
        orderBy: { title: "asc" },
      });
    },
  });

  // ── Required Field Definitions ─────────────────────────────────────
  // Filters: active (bool)
  registerExportResource("required-field-definitions", {
    label: "required-field-definitions",
    mapper: requiredFieldMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        deleted_at: null,
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.active !== undefined) {
        where.active = filters.active as boolean;
      }

      return prisma.required_field_definitions.findMany({
        where,
        orderBy: { created_at: "desc" },
      });
    },
  });

  // ── Users (Admin) ──────────────────────────────────────────────────
  // Filters: search (string), role (string), portal (string)
  registerExportResource("users", {
    label: "users",
    mapper: userMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.search) {
        where.OR = [
          { name: { contains: filters.search as string, mode: "insensitive" } },
          {
            email: { contains: filters.search as string, mode: "insensitive" },
          },
          { phone: { contains: filters.search as string } },
        ];
      }

      if (filters?.role || filters?.portal) {
        where.user_roles = {
          some: {
            ...(filters.role ? { role: filters.role as string } : {}),
            ...(filters.portal ? { portal: filters.portal as string } : {}),
          },
        };
      }

      return prisma.users.findMany({
        where,
        select: USER_SELECT,
        orderBy: { created_at: "desc" },
      });
    },
  });

  // ── Payment Methods ────────────────────────────────────────────────
  // Filters: status (bool), search (string)
  registerExportResource("payment-methods", {
    label: "payment-methods",
    mapper: paymentMethodMapper,
    fetcher: (ids, filters) => {
      const where: any = {
        ...(ids ? { id: { in: ids } } : {}),
      };

      if (filters?.status !== undefined) {
        where.status = filters.status as boolean;
      }

      if (filters?.search) {
        where.name = {
          contains: filters.search as string,
          mode: "insensitive",
        };
      }

      return prisma.payment_methods.findMany({
        where,
        orderBy: { created_at: "desc" },
      });
    },
  });
}
