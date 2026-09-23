import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { CreatePurchaseDto, CreatePurchaseItemDto } from "../dtos/purchase.dto";
import { userManagementService } from "./user-management.service";
import { imageService } from "./image.service";
import type { Prisma } from "../generated/prisma/client";
import { role_enum } from "../generated/prisma/client";
import type { CheckoutDto } from "../dtos/cart.dto";
import { couponService } from "./coupon.service";
import { validatePaymentForCheckout } from "./checkout-validation.service";
import {
  notificationService,
  notification_key_enum,
  NOTIFICATION_CATEGORY,
} from "./notification.service";
import { getEmailService } from "../emails/email.service";
import type { Server as SocketIOServer } from "socket.io";

/** Standard include shape for purchase queries */
const PURCHASE_INCLUDE = {
  purchase_items: {
    include: {
      purchase_item_required_fields: {
        include: { required_field_definitions: true },
      },
      products: {
        select: {
          id: true,
          title: true,
          serial: true,
          type: true,
          price: true,
          price_after_discount: true,
          thumbnail_image: { select: { id: true, url: true } },
        },
      },
    },
  },
  users: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      user_roles: { select: { role: true } },
    },
  },
  received_by_user: { select: { id: true, name: true } },
  confirmed_by_user: { select: { id: true, name: true } },
  returned_by_user: { select: { id: true, name: true } },
  payment_methods: { select: { id: true, name: true, phone_number: true } },
  payment_screenshot: { select: { id: true, url: true } },
  watermark: { select: { id: true, url: true } },
  coupon_usages: {
    include: {
      coupons: {
        select: {
          id: true,
          code: true,
          discount_amount: true,
          discount_percentage: true,
        },
      },
    },
  },
} as const;

export class PurchasesService {
  constructor(private db: PrismaClient = prisma) {}

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  private buildUserSerialFrom(userRecord: { id: number }): string {
    return userRecord.id.toString().slice(-8).toUpperCase();
  }

  private async generatePurchaseSerial(
    client: PrismaClient,
    userSerial: string,
  ): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const formattedDate = `${yyyy}${mm}${dd}`;

    const last = await client.purchases.findFirst({
      where: {
        purchase_serial: { startsWith: `${userSerial}-CP-${formattedDate}-` },
      },
      orderBy: { purchase_serial: "desc" },
    });

    let seq = 1;
    if (last && last.purchase_serial) {
      const parts = last.purchase_serial.split("-");
      const lastSeq = parseInt(parts.pop() || "0", 10);
      if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
    }

    const formattedSeq = String(seq).padStart(3, "0");
    return `${userSerial}-CP-${formattedDate}-${formattedSeq}`;
  }

  // ---------------------------------------------------------------
  // Core persistence
  // ---------------------------------------------------------------
  async createPurchase(input: CreatePurchaseDto, txClient?: PrismaClient) {
    if (!txClient) {
      return this.db.$transaction(async (tx) =>
        this.createPurchase(input, tx as unknown as PrismaClient),
      );
    }

    const client = txClient;

    const user = await userManagementService.findUserById(input.user_id);
    if (!user) throw new NotFoundError("User not found");

    const isFreeOrder = Number(input.total) <= 0;

    let paymentMethod: { phone_number: string | null } | null = null;
    if (!isFreeOrder) {
      if (!input.payment_method_id) {
        throw new BadRequestError("Payment method is required for paid orders");
      }

      if (!input.payment_screenshot_id) {
        throw new BadRequestError(
          "Payment screenshot is required for paid orders",
        );
      }

      const screenshot = await client.images.findUnique({
        where: { id: input.payment_screenshot_id },
      });
      if (!screenshot)
        throw new BadRequestError("Payment screenshot not found");

      paymentMethod = await validatePaymentForCheckout(client, {
        total: Number(input.total),
        numberTransferredFrom: input.number_transferred_from,
        payment_method_id: input.payment_method_id,
      });
    }

    const userSerial = this.buildUserSerialFrom({ id: user.id });
    const purchaseSerial = await this.generatePurchaseSerial(
      client,
      userSerial,
    );

    const created = await client.purchases.create({
      data: {
        user_id: input.user_id,
        payment_method_id: isFreeOrder
          ? null
          : (input.payment_method_id ?? null),
        payment_screenshot_id: isFreeOrder
          ? null
          : (input.payment_screenshot_id ?? null),
        subtotal: input.subtotal,
        discount: input.discount,
        total: input.total,
        notes: input.notes,
        number_transferred_from: isFreeOrder
          ? null
          : (input.number_transferred_from ?? null),
        payment_number: isFreeOrder
          ? null
          : (input.payment_number ?? paymentMethod?.phone_number ?? null),
        purchase_serial: purchaseSerial,
      },
    });

    const purchaseItemsData = input.items.map((item) => ({
      purchase_id: created.id,
      product_id: item.product_id,
      price_at_purchase: item.price_at_purchase,
      discount: item.discount,
      quantity: item.quantity,
      final_price: item.final_price,
      coupon_id: item.coupon_id || null,
    }));

    const createdItems = await client.purchase_items.createManyAndReturn({
      data: purchaseItemsData,
    });

    const requiredFieldsData: Array<{
      purchase_item_id: number;
      field_definition_id: number;
      value: string;
    }> = [];
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const purchaseItem = createdItems[i];
      if (item.required_fields?.length && purchaseItem) {
        for (const rf of item.required_fields) {
          if (rf.value !== null && rf.value !== undefined && rf.value !== "") {
            requiredFieldsData.push({
              purchase_item_id: purchaseItem.id,
              field_definition_id: rf.field_definition_id,
              value: String(rf.value),
            });
          }
        }
      }
    }
    if (requiredFieldsData.length > 0) {
      await client.purchase_item_required_fields.createMany({
        data: requiredFieldsData,
      });
    }

    return client.purchases.findUnique({
      where: { id: created.id },
      include: PURCHASE_INCLUDE,
    });
  }

  // =============================================================
  // Read operations
  // =============================================================

  /** Admin paginated list with search and filters */
  async getAll(filters: {
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    minTotal?: number;
    maxTotal?: number;
    productId?: number;
    page: number;
    limit: number;
  }) {
    const { page, limit } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.purchasesWhereInput = { deleted_at: null };

    if (filters.productId) {
      where.purchase_items = {
        some: {
          product_id: filters.productId,
          is_deleted: false,
        },
      };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = new Date(filters.startDate);
      if (filters.endDate) where.created_at.lte = new Date(filters.endDate);
    }

    if (filters.minTotal !== undefined || filters.maxTotal !== undefined) {
      where.total = {};
      if (filters.minTotal !== undefined) where.total.gte = filters.minTotal;
      if (filters.maxTotal !== undefined) where.total.lte = filters.maxTotal;
    }

    if (filters.search) {
      const s = filters.search.trim();
      where.OR = [
        { purchase_serial: { contains: s, mode: "insensitive" } },
        {
          number_transferred_from: { contains: s, mode: "insensitive" },
        },
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

    const [purchases, total] = await Promise.all([
      this.db.purchases.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.purchases.count({ where }),
    ]);

    return { purchases, total, page, pages: Math.ceil(total / limit), limit };
  }

  /** Teacher's own purchases */
  async getByUser(
    userId: number,
    filters?: { status?: string; page?: number; limit?: number },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.purchasesWhereInput = { user_id: userId };
    const status = filters?.status && filters.status !== "all" ? filters.status : null;
    if (status) {
      where.status = status;
      where.deleted_at = null;
      where.is_deleted = false;
    }

    const [purchases, total] = await Promise.all([
      this.db.purchases.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.db.purchases.count({ where }),
    ]);

    return {
      purchases,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    };
  }

  /** Single purchase by ID */
  async getById(id: number) {
    const purchase = await this.db.purchases.findUnique({
      where: { id },
      include: PURCHASE_INCLUDE,
    });
    if (!purchase) throw new NotFoundError("Purchase not found");
    return purchase;
  }

  /** Aggregated count of confirmed purchases per admin and per month with pagination */
  async getConfirmedStats(
    page: number,
    limit: number,
    month?: number,
    year?: number,
  ) {
    const skip = (page - 1) * limit;

    const now = new Date();
    const targetMonth = month || now.getMonth() + 1;
    const targetYear = year || now.getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 1);

    // 1. Get all eligible users (Admin, SubAdmin, Moderator)
    const eligibleRoles: role_enum[] = ["Admin", "SubAdmin", "Moderator"];

    // We filter users who have any of these roles
    const totalAdmins = await this.db.users.count({
      where: {
        user_roles: {
          some: {
            role: { in: eligibleRoles },
          },
        },
        deleted_at: null,
      },
    });

    const admins = await this.db.users.findMany({
      where: {
        user_roles: {
          some: {
            role: { in: eligibleRoles },
          },
        },
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        user_roles: {
          select: { role: true },
          where: { role: { in: eligibleRoles } },
          take: 1, // Generally one primary role for this grouping
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    });

    const adminIds = admins.map((a) => a.id);

    // 2. Get confirmed counts for these specific admins in the target month
    const grouped = await this.db.purchases.groupBy({
      by: ["confirmed_by"],
      _count: { _all: true },
      where: {
        confirmed_by: { in: adminIds },
        status: "confirmed",
        deleted_at: null,
        confirmed_at: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const countsMap = new Map(
      grouped.map((g) => [g.confirmed_by, g._count._all]),
    );

    const confirmedPurchases = await this.db.purchases.findMany({
      where: {
        confirmed_by: { in: adminIds },
        status: "confirmed",
        deleted_at: null,
        confirmed_at: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        confirmed_by: true,
        purchase_items: {
          where: { is_deleted: false },
          select: { quantity: true },
        },
      },
    });

    const productsSoldMap = new Map<number, number>();
    for (const purchase of confirmedPurchases) {
      if (purchase.confirmed_by === null) continue;
      const quantity = purchase.purchase_items.reduce(
        (total, item) => total + item.quantity,
        0,
      );
      productsSoldMap.set(
        purchase.confirmed_by,
        (productsSoldMap.get(purchase.confirmed_by) || 0) + quantity,
      );
    }

    // 2b. Count e-booklets delivered by these admins in the target month. This
    // is the e-booklet equivalent of "confirming" a regular order; the
    // e_booklet_purchases table has no "delivered_by" column, so the delivering
    // admin is read from the e-booklet audit log (action "booklet_delivered").
    const eBookletDeliveries = await this.db.e_booklet_audit_logs.groupBy({
      by: ["actor_user_id"],
      _count: { _all: true },
      where: {
        action: "booklet_delivered",
        actor_user_id: { in: adminIds },
        created_at: { gte: startDate, lt: endDate },
      },
    });
    const eBookletsMap = new Map<number, number>(
      eBookletDeliveries.map((g) => [g.actor_user_id as number, g._count._all]),
    );

    // 3. Merge data
    const stats = admins.map((admin) => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      role: admin.user_roles[0]?.role || null,
      count: countsMap.get(admin.id) || 0,
      productsSold: productsSoldMap.get(admin.id) || 0,
      eBookletsDelivered: eBookletsMap.get(admin.id) || 0,
    }));

    return {
      stats,
      total: totalAdmins,
      page,
      pages: Math.ceil(totalAdmins / limit),
      limit,
    };
  }

  /** Retrieve detailed product sales confirmed by a specific employee */
  async getConfirmedEmployeeProducts(
    employeeId: number,
    options: {
      page?: number;
      limit?: number;
      month?: number;
      year?: number;
      type?: "all" | "normal" | "ebooklet";
      search?: string;
    } = {},
  ) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const skip = (page - 1) * limit;

    const employee = await this.db.users.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        user_roles: { select: { role: true }, take: 1 },
      },
    });

    if (!employee) {
      throw new NotFoundError("Employee not found");
    }

    let dateFilter: { gte?: Date; lt?: Date } | undefined;
    if (options.month && options.year) {
      dateFilter = {
        gte: new Date(options.year, options.month - 1, 1),
        lt: new Date(options.year, options.month, 1),
      };
    } else if (options.year) {
      dateFilter = {
        gte: new Date(options.year, 0, 1),
        lt: new Date(options.year + 1, 0, 1),
      };
    }

    const purchaseWhere: Prisma.purchasesWhereInput = {
      confirmed_by: employeeId,
      status: "confirmed",
      deleted_at: null,
      ...(dateFilter ? { confirmed_at: dateFilter } : {}),
    };

    const allConfirmedPurchases = await this.db.purchases.findMany({
      where: purchaseWhere,
      select: {
        id: true,
        purchase_serial: true,
        total: true,
        confirmed_at: true,
        created_at: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        e_booklet_student_purchase_link: {
          select: {
            id: true,
            booklet_instance: {
              select: {
                id: true,
                template: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
        purchase_items: {
          where: { is_deleted: false },
          select: {
            id: true,
            quantity: true,
            price_at_purchase: true,
            discount: true,
            final_price: true,
            created_at: true,
            products: {
              select: {
                id: true,
                title: true,
                type: true,
                serial: true,
                price: true,
                thumbnail_image: {
                  select: { id: true, url: true },
                },
                product_categories: {
                  select: {
                    categories: {
                      select: { id: true, title: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { confirmed_at: "desc" },
    });

    const allItems: Array<{
      id: number;
      purchaseId: number;
      purchaseSerial: string | null;
      customer: { id: number; name: string | null; email: string | null; phone: string | null };
      product: {
        id: number;
        title: string;
        type: string;
        serial: string | null;
        price: number;
        thumbnailUrl: string | null;
        categories: string[];
      };
      itemType: "normal" | "ebooklet";
      quantity: number;
      unitPrice: number;
      finalPrice: number;
      confirmedAt: Date | null;
      createdAt: Date | null;
    }> = [];

    let totalRevenue = 0;
    let totalProductsSold = 0;
    let normalProductsCount = 0;
    let ebookletsCount = 0;

    for (const purchase of allConfirmedPurchases) {
      const isEBookletPurchase = Boolean(purchase.e_booklet_student_purchase_link);

      for (const item of purchase.purchase_items) {
        const prod = item.products;
        const categories =
          prod?.product_categories
            ?.map((pc) => pc.categories?.title)
            .filter((title): title is string => Boolean(title)) || [];
        const isEBookletItem =
          isEBookletPurchase ||
          prod?.type === "Book" ||
          categories.some((c) => /مذكرة|مذكرات|تفاعلية|كراسة|كتيب|e-booklet|ebooklet/i.test(c)) ||
          /مذكرة تفاعلية|e-booklet|ebooklet/i.test(prod?.title || "");

        const itemType: "normal" | "ebooklet" = isEBookletItem ? "ebooklet" : "normal";
        const quantity = item.quantity || 0;
        const unitPrice = Number(item.price_at_purchase || 0);
        const finalPrice = Number(item.final_price || 0);

        totalProductsSold += quantity;
        totalRevenue += finalPrice;
        if (itemType === "ebooklet") {
          ebookletsCount += quantity;
        } else {
          normalProductsCount += quantity;
        }

        allItems.push({
          id: item.id,
          purchaseId: purchase.id,
          purchaseSerial: purchase.purchase_serial,
          customer: purchase.users || { id: 0, name: "Unknown", email: null, phone: null },
          product: {
            id: prod?.id || 0,
            title:
              isEBookletPurchase &&
              purchase.e_booklet_student_purchase_link?.booklet_instance?.template?.title
                ? purchase.e_booklet_student_purchase_link.booklet_instance.template.title
                : prod?.title || "Unknown Product",
            type: prod?.type || "Product",
            serial: prod?.serial || null,
            price: Number(prod?.price || 0),
            thumbnailUrl: prod?.thumbnail_image?.url || null,
            categories,
          },
          itemType,
          quantity,
          unitPrice,
          finalPrice,
          confirmedAt: purchase.confirmed_at,
          createdAt: item.created_at || purchase.created_at,
        });
      }
    }

    let filteredItems = allItems;
    if (options.type && options.type !== "all") {
      filteredItems = filteredItems.filter((item) => item.itemType === options.type);
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      filteredItems = filteredItems.filter(
        (item) =>
          item.product.title.toLowerCase().includes(q) ||
          (item.product.serial && item.product.serial.toLowerCase().includes(q)) ||
          (item.purchaseSerial && item.purchaseSerial.toLowerCase().includes(q)) ||
          (item.customer.name && item.customer.name.toLowerCase().includes(q)) ||
          (item.customer.email && item.customer.email.toLowerCase().includes(q)) ||
          (item.customer.phone && item.customer.phone.includes(q)),
      );
    }

    const totalFiltered = filteredItems.length;
    const paginatedItems = filteredItems.slice(skip, skip + limit);

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        role: employee.user_roles[0]?.role || null,
      },
      summary: {
        totalOrders: allConfirmedPurchases.length,
        totalProductsSold,
        totalRevenue,
        normalProductsCount,
        ebookletsCount,
      },
      items: paginatedItems,
      pagination: {
        total: totalFiltered,
        page,
        pages: Math.ceil(totalFiltered / limit) || 1,
        limit,
      },
    };
  }

  // =============================================================
  // Status transitions
  // =============================================================

  /** Build product list HTML for use in status notification emails */
  #buildProductListHTML(
    items: Array<{ quantity: number; products?: { title?: string | null } | null }>,
  ): string {
    return items
      .map(
        (item, index) =>
          `<tr><td style='text-align:center; padding: 8px; border-bottom: 1px solid #ddd;'>${index + 1}</td>` +
          `<td style='text-align:start; padding: 8px; border-bottom: 1px solid #ddd;'>` +
          `${item.products?.title ?? "Product"} x${item.quantity}</td></tr>`,
      )
      .join("");
  }

  /** pending → received */
  async receive(purchaseId: number, adminId: number, io?: SocketIOServer | null) {
    const purchase = await this.db.purchases.findUnique({
      where: { id: purchaseId },
      include: {
        users: { select: { id: true, name: true, email: true } },
        purchase_items: { where: { is_deleted: false }, include: { products: { select: { title: true } } } },
      },
    });
    if (!purchase) throw new NotFoundError("Purchase not found");
    if (purchase.status !== "pending") {
      throw new BadRequestError(`Purchase is already ${purchase.status}`);
    }

    const updated = await this.db.purchases.update({
      where: { id: purchaseId },
      data: { status: "received", received_by: adminId, received_at: new Date(), updated_at: new Date() },
      include: PURCHASE_INCLUDE,
    });

    // Notify customer
    const customer = purchase.users;
    notificationService
      .sendToUser(io ?? null, customer.id, NOTIFICATION_CATEGORY.ORDER_STATUS_CHANGE,
        notification_key_enum.ORDER_STATUS_RECEIVED,
        { entityType: "purchase", entityId: purchaseId, createdBy: adminId })
      .catch((err) => console.error("[Purchases] Failed to send receive notification:", err));

    if (customer.email) {
      getEmailService()
        .sendOrderReceivedEmail(customer.email, {
          name: customer.name,
          purchaseSerial: purchase.purchase_serial ?? "N/A",
          totalItems: purchase.purchase_items.reduce((s, i) => s + i.quantity, 0),
          productListHTML: this.#buildProductListHTML(purchase.purchase_items),
        })
        .catch((err) => console.error("[Purchases] Failed to send receive email:", err));
    }

    return updated;
  }

  /** received | returned → confirmed */
  async confirm(purchaseId: number, adminId: number, io?: SocketIOServer | null) {
    const purchase = await this.db.purchases.findUnique({
      where: { id: purchaseId },
      include: {
        users: { select: { id: true, name: true, email: true } },
        purchase_items: { where: { is_deleted: false }, include: { products: { select: { title: true } } } },
      },
    });
    if (!purchase) throw new NotFoundError("Purchase not found");
    if (purchase.status === "confirmed") throw new BadRequestError("Purchase is already confirmed");
    if (!["received", "returned"].includes(purchase.status)) {
      throw new BadRequestError("Purchase must be received or in returned status before it can be confirmed");
    }

    const updated = await this.db.purchases.update({
      where: { id: purchaseId },
      data: { status: "confirmed", confirmed_by: adminId, confirmed_at: new Date(), updated_at: new Date() },
      include: PURCHASE_INCLUDE,
    });

    const customer = purchase.users;
    notificationService
      .sendToUser(io ?? null, customer.id, NOTIFICATION_CATEGORY.ORDER_STATUS_CHANGE,
        notification_key_enum.ORDER_STATUS_CONFIRMED,
        { entityType: "purchase", entityId: purchaseId, createdBy: adminId })
      .catch((err) => console.error("[Purchases] Failed to send confirm notification:", err));

    if (customer.email) {
      getEmailService()
        .sendOrderAcceptedEmail(customer.email, {
          name: customer.name,
          purchaseSerial: purchase.purchase_serial ?? "N/A",
          totalItems: purchase.purchase_items.reduce((s, i) => s + i.quantity, 0),
          productListHTML: this.#buildProductListHTML(purchase.purchase_items),
        })
        .catch((err) => console.error("[Purchases] Failed to send confirm email:", err));
    }

    return updated;
  }

  /** confirmed → delivered */
  async deliver(purchaseId: number, adminId: number, io?: SocketIOServer | null) {
    const purchase = await this.db.purchases.findUnique({
      where: { id: purchaseId },
      include: {
        users: { select: { id: true, name: true, email: true } },
        purchase_items: { where: { is_deleted: false }, include: { products: { select: { title: true } } } },
      },
    });
    if (!purchase) throw new NotFoundError("Purchase not found");
    if (purchase.status === "delivered") throw new BadRequestError("Purchase is already delivered");
    if (purchase.status !== "confirmed") throw new BadRequestError("Only confirmed purchases can be delivered");

    const updated = await this.db.purchases.update({
      where: { id: purchaseId },
      data: { status: "delivered", delivered_at: new Date(), updated_at: new Date() },
      include: PURCHASE_INCLUDE,
    });

    const customer = purchase.users;
    notificationService
      .sendToUser(io ?? null, customer.id, NOTIFICATION_CATEGORY.ORDER_STATUS_CHANGE,
        notification_key_enum.ORDER_STATUS_DELIVERED,
        { entityType: "purchase", entityId: purchaseId, createdBy: adminId })
      .catch((err) => console.error("[Purchases] Failed to send delivery notification:", err));

    if (customer.email) {
      getEmailService()
        .sendOrderDeliveredEmail(customer.email, {
          name: customer.name,
          purchaseSerial: purchase.purchase_serial ?? "N/A",
          totalItems: purchase.purchase_items.reduce((sum, item) => sum + item.quantity, 0),
          productListHTML: this.#buildProductListHTML(purchase.purchase_items),
        })
        .catch((err) => console.error("[Purchases] Failed to send delivery email:", err));
    }

    return updated;
  }

  /** received | confirmed | delivered → returned */
  async returnPurchase(purchaseId: number, adminId: number, io?: SocketIOServer | null) {
    const purchase = await this.db.purchases.findUnique({
      where: { id: purchaseId },
      include: {
        users: { select: { id: true, name: true, email: true } },
        purchase_items: { where: { is_deleted: false }, include: { products: { select: { title: true } } } },
      },
    });
    if (!purchase) throw new NotFoundError("Purchase not found");
    if (!["confirmed", "received", "delivered"].includes(purchase.status)) {
      throw new BadRequestError(
        purchase.status === "returned" ? "Purchase is already returned" : "Only received, confirmed, or delivered purchases can be returned",
      );
    }

    const updated = await this.db.purchases.update({
      where: { id: purchaseId },
      data: { status: "returned", returned_by: adminId, returned_at: new Date(), updated_at: new Date() },
      include: PURCHASE_INCLUDE,
    });

    const customer = purchase.users;
    notificationService
      .sendToUser(io ?? null, customer.id, NOTIFICATION_CATEGORY.ORDER_STATUS_CHANGE,
        notification_key_enum.ORDER_STATUS_RETURNED,
        { entityType: "purchase", entityId: purchaseId, createdBy: adminId })
      .catch((err) => console.error("[Purchases] Failed to send return notification:", err));

    if (customer.email) {
      getEmailService()
        .sendOrderReturnedEmail(customer.email, {
          name: customer.name,
          purchaseSerial: purchase.purchase_serial ?? "N/A",
          totalItems: purchase.purchase_items.reduce((s, i) => s + i.quantity, 0),
          productListHTML: this.#buildProductListHTML(purchase.purchase_items),
        })
        .catch((err) => console.error("[Purchases] Failed to send return email:", err));
    }

    return updated;
  }

  // =============================================================
  // Admin operations
  // =============================================================

  /** Update admin notes — only Admin and SubAdmin should trigger notifications */
  async addAdminNote(
    purchaseId: number,
    adminNotes: string,
    adminId: number,
    io?: SocketIOServer | null,
    triggerNotification = false,
  ) {
    const purchase = await this.db.purchases.findUnique({
      where: { id: purchaseId },
      include: { users: { select: { id: true } } },
    });
    if (!purchase) throw new NotFoundError("Purchase not found");

    const updated = await this.db.purchases.update({
      where: { id: purchaseId },
      data: {
        admin_notes: adminNotes,
        admin_note_by: adminId,
        has_admin_edits: true,
        updated_at: new Date(),
      },
      include: PURCHASE_INCLUDE,
    });

    // Only notify customer if caller is Admin or SubAdmin
    if (triggerNotification) {
      notificationService
        .sendToUser(
          io ?? null,
          purchase.users.id,
          NOTIFICATION_CATEGORY.ORDER_GENERAL_EDIT,
          notification_key_enum.ORDER_ADMIN_NOTE,
          { entityType: "purchase", entityId: purchaseId, createdBy: adminId },
        )
        .catch((err) =>
          console.error("[Purchases] Failed to send admin note notification:", err),
        );
    }

    return updated;
  }

  /** Hard-delete a purchase. Restores used coupons if confirmed. */
  async deletePurchase(purchaseId: number, adminId?: number, io?: SocketIOServer | null) {
    const purchase = await this.db.purchases.findUnique({
      where: { id: purchaseId },
      include: {
        users: { select: { id: true, name: true, email: true } },
        purchase_items: { where: { is_deleted: false }, include: { products: { select: { title: true } } } },
      },
    });
    if (!purchase) throw new NotFoundError("Purchase not found");

    await this.db.$transaction(async (tx) => {
      if (purchase.status === "confirmed") {
        await tx.coupon_usages.deleteMany({ where: { purchase_id: purchaseId } });
      }
      await tx.purchases.update({
        where: { id: purchaseId },
        data: { deleted_at: new Date(), is_deleted: true },
      });
      await tx.user_analytics.update({
        where: { user_id: purchase.user_id },
        data: {
          total_spent: { decrement: Number(purchase.total) },
          number_of_purchases: { decrement: 1 },
        },
      });
    });

    const customer = purchase.users;
    notificationService
      .sendToUser(io ?? null, customer.id, NOTIFICATION_CATEGORY.ORDER_DELETED,
        notification_key_enum.ORDER_DELETED,
        { entityType: "purchase", entityId: purchaseId, createdBy: adminId })
      .catch((err) => console.error("[Purchases] Failed to send delete notification:", err));

    if (customer.email) {
      getEmailService()
        .sendOrderDeletedEmail(customer.email, {
          name: customer.name,
          purchaseSerial: purchase.purchase_serial ?? "N/A",
          totalItems: purchase.purchase_items.reduce((s, i) => s + i.quantity, 0),
          productListHTML: this.#buildProductListHTML(purchase.purchase_items),
        })
      .catch((err) => console.error("[Purchases] Failed to send delete email:", err));
    }
  }

  /** Remove a single item; recalculate totals. Cannot remove last item. */
  async deleteItem(
    purchaseId: number,
    itemId: number,
    adminId?: number,
    io?: SocketIOServer | null,
  ) {
    const purchase = await this.db.purchases.findUnique({
      where: { id: purchaseId },
      include: {
        purchase_items: { include: { products: { select: { title: true } } } },
        users: { select: { id: true, name: true, email: true } },
      },
    });
    if (!purchase) throw new NotFoundError("Purchase not found");

    const activeItems = purchase.purchase_items.filter((i) => !i.is_deleted);
    const item = activeItems.find((i) => i.id === itemId);
    if (!item) throw new NotFoundError("Item not found in this purchase");

    if (activeItems.length === 1) {
      throw new BadRequestError("Cannot remove the last item. Delete the entire purchase instead.");
    }

    const remaining = activeItems.filter((i) => i.id !== itemId);
    const newSubtotal = remaining.reduce(
      (sum, i) => sum + Number(i.price_at_purchase) * i.quantity,
      0,
    );
    const newTotal = Math.max(0, newSubtotal - Number(purchase.discount));
    const priceDiff = Number(purchase.total) - newTotal;

    const updated = await this.db.$transaction(async (tx) => {
      await tx.purchase_items.update({
        where: { id: itemId },
        data: { deleted_at: new Date(), is_deleted: true },
      });

      if (priceDiff > 0) {
        await tx.user_analytics.update({
          where: { user_id: purchase.user_id },
          data: { total_spent: { decrement: priceDiff } },
        });
      }

      return tx.purchases.update({
        where: { id: purchaseId },
        data: { subtotal: newSubtotal, total: newTotal, has_admin_edits: true, updated_at: new Date() },
        include: PURCHASE_INCLUDE,
      });
    });

    const customer = purchase.users;
    notificationService
      .sendToUser(io ?? null, customer.id, NOTIFICATION_CATEGORY.ORDER_ITEM_DELETED,
        notification_key_enum.ORDER_ITEM_DELETED,
        { entityType: "purchase", entityId: purchaseId, createdBy: adminId })
      .catch((err) => console.error("[Purchases] Failed to send item delete notification:", err));

    if (customer.email) {
      getEmailService()
        .sendOrderItemDeletedEmail(customer.email, {
          name: customer.name,
          purchaseSerial: purchase.purchase_serial ?? "N/A",
          itemName: item.products?.title ?? "Product",
        })
        .catch((err) => console.error("[Purchases] Failed to send item delete email:", err));
    }

    return updated;
  }
}

export const purchasesService = new PurchasesService();
