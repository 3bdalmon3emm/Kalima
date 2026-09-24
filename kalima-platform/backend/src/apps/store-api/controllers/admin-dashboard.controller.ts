import { Request, Response, NextFunction } from "express";
import { prisma } from "../../../libs/db/prisma";

export const adminDashboardController = {
  /**
   * GET /admin/dashboard/store-stats
   * Overview: Total Purchases, Confirmed Purchases, Revenue, Pending, Avg Price.
   * Also returns monthly trends and daily stats.
   */
  async getStoreStatistics(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      const whereClause: any = {};
      if (startDate && endDate) {
        whereClause.created_at = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }

      const [aggregates, confirmedAggregates, pendingCount] = await Promise.all(
        [
          prisma.purchases.aggregate({
            _count: { id: true },
            _sum: { total: true },
            _avg: { total: true },
            where: whereClause,
          }),
          prisma.purchases.aggregate({
            _count: { id: true },
            _sum: { total: true },
            where: { ...whereClause, status: "confirmed" },
          }),
          prisma.purchases.count({
            where: { ...whereClause, status: "pending" },
          }),
        ],
      );

      res.status(200).json({
        success: true,
        data: {
          overview: {
            totalPurchases: aggregates._count.id,
            totalRevenue: aggregates._sum.total || 0,
            averagePrice: aggregates._avg.total || 0,
            confirmedPurchases: confirmedAggregates._count.id,
            confirmedRevenue: confirmedAggregates._sum.total || 0,
            pendingPurchases: pendingCount,
          },
        },
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * GET /admin/dashboard/confirmer-stats
   * Groups purchases by confirmed_by_user
   */
  async getConfirmerStatistics(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const stats = await prisma.purchases.groupBy({
        by: ["confirmed_by", "status"],
        _count: {
          id: true,
        },
        where: {
          confirmed_by: {
            not: null,
          },
        },
      });

      const confirmerIds = [
        ...new Set(
          stats.map((s) => s.confirmed_by).filter((id) => id !== null),
        ),
      ] as number[];

      const confirmers = await prisma.users.findMany({
        where: { id: { in: confirmerIds } },
        select: { id: true, name: true, email: true },
      });

      const confirmerMap = new Map();
      confirmers.forEach((c) => confirmerMap.set(c.id, c));

      const statsByConfirmer = new Map<number, any>();

      stats.forEach((stat) => {
        const confirmerId = stat.confirmed_by as number;
        if (!statsByConfirmer.has(confirmerId)) {
          const confirmerInfo = confirmerMap.get(confirmerId);
          statsByConfirmer.set(confirmerId, {
            user: confirmerInfo
              ? confirmerInfo
              : { id: confirmerId, name: "Unknown" },
            byStatus: {},
            totalHandled: 0,
          });
        }

        const data = statsByConfirmer.get(confirmerId);
        data.byStatus[stat.status] = stat._count.id;
        data.totalHandled += stat._count.id;
      });

      const result = Array.from(statsByConfirmer.values()).sort(
        (a, b) => b.totalHandled - a.totalHandled,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * GET /admin/dashboard/product-performance
   * Ranks products by total value and counts from purchase_items
   */
  async getProductPerformance(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      // Find top products based on purchase_items
      const items = await prisma.purchase_items.groupBy({
        by: ["product_id"],
        _count: { id: true },
        _sum: {
          price_at_purchase: true, // Assuming price per item at time of purchase is stored
        },
      });

      const productIds = items
        .map((i) => i.product_id)
        .filter((id) => id !== null) as number[];

      const products = await prisma.products.findMany({
        where: { id: { in: productIds } },
        select: { id: true, title: true, price: true, serial: true }, // Select essential fields (serial shown in the analytics table)
      });

      const productMap = new Map();
      products.forEach((p) => productMap.set(p.id, p));

      const result = items
        .map((item) => {
          const prod = productMap.get(item.product_id);
          return {
            product: prod
              ? prod
              : { id: item.product_id, title: "Unknown Product" },
            timesPurchased: item._count.id,
            // Calculate total value generated (this could vary based on how price is stored on purchase_items)
            totalValue: item._sum.price_at_purchase
              ? Number(item._sum.price_at_purchase)
              : 0,
          };
        })
        .sort((a, b) => b.totalValue - a.totalValue);

      res.status(200).json({
        success: true,
        data: result.slice(0, 50), // Return top 50
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * GET /admin/dashboard/response-time
   * Calculates time from created_at to confirmed_at
   */
  async getResponseTimeAnalytics(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      // Using raw query for time calculations across the table.
      // PostgreSQL handles time intervals well.
      // This calculates the average difference in minutes between created_at and confirmed_at
      const timeStats: any[] = await prisma.$queryRaw`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))/60) as avg_response_minutes,
          MIN(EXTRACT(EPOCH FROM (confirmed_at - created_at))/60) as min_response_minutes,
          MAX(EXTRACT(EPOCH FROM (confirmed_at - created_at))/60) as max_response_minutes
        FROM kalima.purchases
        WHERE confirmed_at IS NOT NULL AND status = 'Confirmed';
      `;

      res.status(200).json({
        success: true,
        data: {
          averageResponseTimeMinutes: timeStats[0]?.avg_response_minutes || 0,
          fastestResponseTimeMinutes: timeStats[0]?.min_response_minutes || 0,
          slowestResponseTimeMinutes: timeStats[0]?.max_response_minutes || 0,
        },
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * GET /admin/dashboard/staff-report
   * Comprehensive report for staff performance:
   * - Total Received
   * - Total Confirmed
   * - Total Returned
   * - Average Response Time (created_at -> received_at)
   * - Average Confirmation Time (received_at -> confirmed_at)
   */
  async getStaffPerformanceReport(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      // 1. Get all users who are Sub_Admin, Moderator, or Assistant
      const staffMembers = await prisma.users.findMany({
        where: {
          role: {
            in: ["SubAdmin", "Moderator", "Assistant"],
          },
        },
        select: {
          id: true,
          name: true,
          role: true,
          email: true,
        },
      });

      // 2. We'll run raw queries to get accurate averages and counts per staff,
      //    since Prisma's native groupBy across multiple relation keys is complex.
      //    This is similar to how the legacy system's `getFullOrdersReport` worked.

      const staffIds = staffMembers.map((s) => s.id);

      if (staffIds.length === 0) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      const idList = staffIds.join(",");

      // Count Received
      const receivedCounts: any[] = await prisma.$queryRawUnsafe(`
        SELECT received_by as admin_id, COUNT(*) as count
        FROM kalima.purchases
        WHERE received_by IN (${idList})
        GROUP BY received_by;
      `);

      // Count Confirmed
      const confirmedCounts: any[] = await prisma.$queryRawUnsafe(`
        SELECT confirmed_by as admin_id, COUNT(*) as count
        FROM kalima.purchases
        WHERE confirmed_by IN (${idList})
        GROUP BY confirmed_by;
      `);

      // Count Returned
      const returnedCounts: any[] = await prisma.$queryRawUnsafe(`
        SELECT returned_by as admin_id, COUNT(*) as count
        FROM kalima.purchases
        WHERE returned_by IN (${idList})
        GROUP BY returned_by;
      `);

      // Average Response Time (created -> received)
      const responseTimes: any[] = await prisma.$queryRawUnsafe(`
        SELECT received_by as admin_id, AVG(EXTRACT(EPOCH FROM (received_at - created_at))/60) as avg_minutes
        FROM kalima.purchases
        WHERE received_by IN (${idList}) AND received_at IS NOT NULL
        GROUP BY received_by;
      `);

      // Average Confrimation Time (received -> confirmed)
      const confirmTimes: any[] = await prisma.$queryRawUnsafe(`
        SELECT confirmed_by as admin_id, AVG(EXTRACT(EPOCH FROM (confirmed_at - received_at))/60) as avg_minutes
        FROM kalima.purchases
        WHERE confirmed_by IN (${idList}) AND confirmed_at IS NOT NULL AND received_at IS NOT NULL
        GROUP BY confirmed_by;
      `);

      const getVal = (arr: any[], id: number, key: string) => {
        const found = arr.find((item) => Number(item.admin_id) === id);
        return found ? Number(found[key]) : 0;
      };

      const report = staffMembers.map((staff) => {
        return {
          staff: {
            id: staff.id,
            name: staff.name,
            role: staff.role,
            email: staff.email,
          },
          metrics: {
            totalReceived: getVal(receivedCounts, staff.id, "count"),
            totalConfirmed: getVal(confirmedCounts, staff.id, "count"),
            totalReturned: getVal(returnedCounts, staff.id, "count"),
            avgResponseMinutes: getVal(responseTimes, staff.id, "avg_minutes"),
            avgConfirmationMinutes: getVal(
              confirmTimes,
              staff.id,
              "avg_minutes",
            ),
          },
        };
      });

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * GET /admin/dashboard/user-stats
   * Returns: total users, total users per role, total verified users.
   */
  async getUserStats(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const [totalUsers, totalVerifiedUsers, countsByRole] = await Promise.all([
        prisma.users.count(),
        prisma.users.count({ where: { is_email_verified: true } }),
        prisma.users.groupBy({
          by: ["role"],
          _count: {
            _all: true, // Count all records in each group
          },
        }),
      ]);

      const byRole: Record<string, number> = {};
      countsByRole.forEach((row) => {
        byRole[row.role] = row._count._all;
      });

      res.status(200).json({
        success: true,
        data: {
          totalUsers,
          totalVerifiedUsers,
          byRole,
        },
      });
    } catch (error) {
      _next(error);
    }
  },
};
