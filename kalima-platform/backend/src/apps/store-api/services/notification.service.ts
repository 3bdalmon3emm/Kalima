import type { Server as SocketIOServer } from "socket.io";
import type { PrismaClient, role_enum } from "../generated/prisma/client";
import { notification_key_enum } from "../generated/prisma/client";
import { prisma } from "../../../libs/db/prisma";
import {
  emitNotificationToUser,
  emitNotificationToUsers,
} from "../../../libs/redis/socketNotificationEmitter";

// ---------------------------------------------------------------
// Category constants (matches the 1-10 scheme)
// ---------------------------------------------------------------
export const NOTIFICATION_CATEGORY = {
  ORDER_STATUS_CHANGE: 1,
  ORDER_ITEM_DELETED: 2,
  ORDER_DELETED: 3,
  // 4, 5, 6 reserved for future use
  ORDER_GENERAL_EDIT: 7,
  SYSTEM_ANNOUNCEMENT: 8,
  ACCOUNT_UPDATE: 9,
  CUSTOM: 10,
  // Admin-facing only
  NEW_ORDER: 4,
  NEW_ACCOUNT: 5,
} as const;

// Re-export enum so callers don't need a second import
export { notification_key_enum };

// Shape returned by getByUser / list queries
export interface NotificationRow {
  id: number;
  user_id: number | null;
  role: string | null;
  category: number;
  message_key: notification_key_enum;
  entity_type: string | null;
  entity_id: number | null;
  target_link: string | null;
  is_read: boolean;
  created_by: number | null;
  created_at: Date | null;
  creator: { id: number; name: string } | null;
}

class NotificationService {
  constructor(private db: PrismaClient = prisma) {}

  // ---------------------------------------------------------------
  // Send helpers
  // ---------------------------------------------------------------

  /**
   * Create a notification for a single user and push it via Socket.IO.
   */
  async sendToUser(
    io: SocketIOServer | null,
    userId: number,
    category: number,
    messageKey: notification_key_enum,
    options?: {
      entityType?: string;
      entityId?: number;
      targetLink?: string;
      createdBy?: number;
    },
  ): Promise<NotificationRow> {
    const row = await this.db.notifications.create({
      data: {
        user_id: userId,
        category,
        message_key: messageKey,
        entity_type: options?.entityType ?? null,
        entity_id: options?.entityId ?? null,
        target_link: options?.targetLink ?? null,
        created_by: options?.createdBy ?? null,
      },
      include: { creator: { select: { id: true, name: true } } },
    });

    if (io) {
      emitNotificationToUser(io, userId, {
        id: row.id,
        category: row.category,
        message_key: row.message_key,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        target_link: row.target_link,
        created_at: row.created_at,
      });
    }

    return row as unknown as NotificationRow;
  }

  /**
   * Create notifications for a list of user IDs and push each via Socket.IO.
   */
  async sendToUsers(
    io: SocketIOServer | null,
    userIds: number[],
    category: number,
    messageKey: notification_key_enum,
    options?: {
      entityType?: string;
      entityId?: number;
      targetLink?: string;
      createdBy?: number;
      title?: string | null;
      body?: string | null;
    },
  ): Promise<number> {
    if (userIds.length === 0) return 0;

    await this.db.notifications.createMany({
      data: userIds.map((uid) => ({
        user_id: uid,
        category,
        message_key: messageKey,
        entity_type: options?.entityType ?? null,
        entity_id: options?.entityId ?? null,
        target_link: options?.targetLink ?? null,
        created_by: options?.createdBy ?? null,
        title: options?.title ?? null,
        body: options?.body ?? null,
      })),
    });

    if (io) {
      // Fetch the just-created rows to get their IDs for the socket payload
      const rows = await this.db.notifications.findMany({
        where: {
          user_id: { in: userIds },
          message_key: messageKey,
          category,
          created_by: options?.createdBy ?? null,
        },
        orderBy: { id: "desc" },
        take: userIds.length,
        select: {
          id: true,
          user_id: true,
          category: true,
          message_key: true,
          entity_type: true,
          entity_id: true,
          created_at: true,
        },
      });

      const byUser = new Map(rows.map((r) => [r.user_id, r]));
      const socketPayloads = userIds.map((uid) => {
        const r = byUser.get(uid);
        return {
          userId: uid,
          notification: {
            id: r?.id ?? 0,
            category,
            message_key: messageKey,
            entity_type: options?.entityType ?? null,
            entity_id: options?.entityId ?? null,
            target_link: options?.targetLink ?? null,
            title: options?.title ?? null,
            body: options?.body ?? null,
            created_at: r?.created_at ?? null,
          },
        };
      });

      emitNotificationToUsers(
        io,
        userIds,
        socketPayloads[0]?.notification ?? {
          id: 0,
          category,
          message_key: messageKey,
          entity_type: options?.entityType ?? null,
          entity_id: options?.entityId ?? null,
          target_link: options?.targetLink ?? null,
          created_at: null,
        },
      );
    }

    return userIds.length;
  }

  /**
   * Create a single role-targeted notification row, then push via Socket.IO
   * to all currently connected users with that role.
   */
  async sendToRole(
    io: SocketIOServer | null,
    role: role_enum,
    category: number,
    messageKey: notification_key_enum,
    options?: {
      entityType?: string;
      entityId?: number;
      targetLink?: string;
      createdBy?: number;
    },
  ): Promise<NotificationRow> {
    const row = await this.db.notifications.create({
      data: {
        role,
        category,
        message_key: messageKey,
        entity_type: options?.entityType ?? null,
        entity_id: options?.entityId ?? null,
        target_link: options?.targetLink ?? null,
        created_by: options?.createdBy ?? null,
      },
      include: { creator: { select: { id: true, name: true } } },
    });

    if (io) {
      // Resolve all user IDs with this role to push real-time events
      const userRoles = await this.db.user_roles.findMany({
        where: { role, portal: "store" },
        select: { user_id: true },
      });
      const userIds = userRoles.map((r) => r.user_id);

      if (userIds.length > 0) {
        emitNotificationToUsers(io, userIds, {
          id: row.id,
          category: row.category,
          message_key: row.message_key,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          target_link: row.target_link,
          created_at: row.created_at,
        });
      }
    }

    return row as unknown as NotificationRow;
  }

  // ---------------------------------------------------------------
  // High-level triggers for Admin Alerts
  // ---------------------------------------------------------------

  /**
   * Notify all Admins and SubAdmins about a new order.
   */
  async notifyAdminsOfNewOrder(
    io: SocketIOServer | null,
    purchase: { id: number; purchase_serial: string },
  ) {
    const roles: role_enum[] = ["Admin", "SubAdmin"] as any;
    for (const role of roles) {
      this.sendToRole(
        io,
        role,
        NOTIFICATION_CATEGORY.NEW_ORDER,
        notification_key_enum.NEW_ORDER_CREATED,
        {
          entityType: "purchase",
          entityId: purchase.id,
          targetLink: `/admin/orders/${purchase.id}`,
        },
      ).catch((err) =>
        console.error(`[Notifications] Failed to notify ${role} of order:`, err),
      );
    }
  }

  /**
   * Notify all Admins and SubAdmins about a new account registration/creation.
   */
  async notifyAdminsOfNewAccount(io: SocketIOServer | null, user: { id: number }) {
    const roles: role_enum[] = ["Admin", "SubAdmin"] as any;
    for (const role of roles) {
      this.sendToRole(
        io,
        role,
        NOTIFICATION_CATEGORY.NEW_ACCOUNT,
        notification_key_enum.NEW_ACCOUNT_CREATED,
        {
          entityType: "user",
          entityId: user.id,
          targetLink: `/admin/users/${user.id}`,
        },
      ).catch((err) =>
        console.error(`[Notifications] Failed to notify ${role} of user:`, err),
      );
    }
  }

  // ---------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------

  /**
   * Get paginated notifications for a user.
   * Includes both user-specific rows (user_id = userId) and
   * role-targeted rows (role IN user's roles).
   */
  async getByUser(
    userId: number,
    userRoles: role_enum[],
    filters?: {
      category?: number;
      is_read?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { user_id: userId },
        ...(userRoles.length > 0 ? [{ role: { in: userRoles } }] : []),
      ],
    };

    if (filters?.category !== undefined) {
      where.category = filters.category;
    }
    if (filters?.is_read !== undefined) {
      where.is_read = filters.is_read;
    }

    const [notifications, total] = await Promise.all([
      this.db.notifications.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        include: { creator: { select: { id: true, name: true } } },
      }),
      this.db.notifications.count({ where }),
    ]);

    return {
      notifications,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    };
  }

  /**
   * Get unread notification count for a user (own + role-based).
   */
  async getUnreadCount(userId: number, userRoles: role_enum[]): Promise<number> {
    return this.db.notifications.count({
      where: {
        is_read: false,
        OR: [
          { user_id: userId },
          ...(userRoles.length > 0 ? [{ role: { in: userRoles } }] : []),
        ],
      },
    });
  }

  /**
   * Get all notifications (admin view), paginated.
   */
  async getAll(filters?: {
    category?: number;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.category !== undefined) {
      where.category = filters.category;
    }

    const [notifications, total] = await Promise.all([
      this.db.notifications.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true } },
        },
      }),
      this.db.notifications.count({ where }),
    ]);

    return {
      notifications,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    };
  }

  // ---------------------------------------------------------------
  // Read tracking
  // ---------------------------------------------------------------

  /**
   * Mark a single notification as read. Verifies it belongs to the user
   * (directly or via role).
   */
  async markAsRead(
    notificationId: number,
    userId: number,
    userRoles: role_enum[],
  ): Promise<boolean> {
    const notification = await this.db.notifications.findFirst({
      where: {
        id: notificationId,
        OR: [
          { user_id: userId },
          ...(userRoles.length > 0 ? [{ role: { in: userRoles } }] : []),
        ],
      },
    });

    if (!notification) return false;

    await this.db.notifications.update({
      where: { id: notificationId },
      data: { is_read: true },
    });

    return true;
  }

  /**
   * Mark all notifications as read for a user (own + role-based).
   * For role-based rows this creates per-user copies is not ideal at scale,
   * but for simplicity we update them in place since they are shared.
   */
  async markAllAsRead(userId: number, userRoles: role_enum[]): Promise<number> {
    const result = await this.db.notifications.updateMany({
      where: {
        is_read: false,
        OR: [
          { user_id: userId },
          ...(userRoles.length > 0 ? [{ role: { in: userRoles } }] : []),
        ],
      },
      data: { is_read: true },
    });

    return result.count;
  }
}

export const notificationService = new NotificationService();
