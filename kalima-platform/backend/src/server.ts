import "reflect-metadata";
import "./config/loadEnv";
import * as Sentry from "@sentry/node";
import { closeRedis } from "./libs/redis/client";
import { baileysClient } from "./libs/whatsapp/client";
import path from "path";
import express from "express";
import { createServer } from "http";
import storeV2Routes from "./apps/store-api/routes/v2/index";
import authRoutes from "./apps/store-api/routes/v2/auth.routes";
import adminRoutes from "./apps/store-api/routes/v2/admin.routes";
import { errorHandler } from "./libs/errors";
import { setupStoreSocket } from "./libs/socket/setupStoreSocket";
import { startPurchaseNotificationConsumer } from "./apps/store-api/services/notificationStream.service";
import { notificationService } from "./apps/store-api/services/notification.service";
import { emitStorePurchaseToAdmins } from "./libs/redis/socketNotificationEmitter";
import cors from "cors";
import corsOptions from "./config/corsOptions";
import { registerAllExportResources } from "./apps/store-api/export";
import { isProtectedSampleStaticPath } from "./libs/sampleStaticAccess";
import { resolveUploadsRoot } from "./libs/uploadsRoot";
import {
  isR2Enabled,
  getSignedDownloadUrl,
  normalizeStorageKey,
} from "./libs/storage";
import {
  httpMetricsMiddleware,
  metricsAccessMiddleware,
  metricsHandler,
} from "./libs/metrics";

const sentryDsn = process.env.SENTRY_DSN
  || (process.env.NODE_ENV === "production"
    ? "https://048ba305ef0a02edfe7c9a2b46b16b50@o4511636173488128.ingest.de.sentry.io/4511636192100432"
    : undefined);

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
  });
}

const app = express();
const uploadsRoot = resolveUploadsRoot();

registerAllExportResources();

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(httpMetricsMiddleware);

app.get("/metrics", metricsAccessMiddleware, metricsHandler);

// Public asset serving. When R2 is enabled, resolve the path to an object key
// and 302-redirect to a short-lived signed URL so the download comes straight
// from R2. When disabled, keep the current express.static behaviour unchanged.
function makeUploadsHandler(localRoot: string): express.RequestHandler {
  const staticHandler = express.static(localRoot);
  return (req, res, next) => {
    if (!isR2Enabled()) {
      staticHandler(req, res, next);
      return;
    }
    void (async () => {
      try {
        const urlPath = decodeURIComponent(req.originalUrl.split("?")[0]);
        const key = normalizeStorageKey(urlPath);
        const ttl = Number(process.env.R2_SIGNED_TTL_PUBLIC_ASSET || 1800);
        // /uploads/images is a flat folder that also holds sensitive images
        // (payment screenshots, watermarks), so cache PRIVATELY — the requester's
        // own browser only, never a shared/CDN cache — and below the signed
        // link's TTL so it never expires while cached. This still removes most
        // repeat fetches for product/cover/gallery images within a session.
        // Long public/CDN caching of genuinely-public images needs them split
        // out of this shared folder first.
        const cacheControl = `private, max-age=${Math.max(60, Math.floor(ttl * 0.8))}`;
        const signed = await getSignedDownloadUrl(key, { expiresIn: ttl, cacheControl });
        res.setHeader("Cache-Control", cacheControl);
        res.redirect(302, signed);
      } catch (error) {
        next(error);
      }
    })();
  };
}

app.use(
  "/uploads/samples",
  (req, res, next) => {
    if (isProtectedSampleStaticPath(req.path)) {
      res.status(403).json({
        success: false,
        message: "Protected samples cannot be downloaded directly",
      });
      return;
    }
    next();
  },
  makeUploadsHandler(path.join(uploadsRoot, "samples")),
);
app.use("/uploads/e-booklets/private", (_req, res) => {
  res.status(403).json({
    success: false,
    message: "Protected e-booklet files cannot be downloaded directly",
  });
});
app.use("/uploads", makeUploadsHandler(uploadsRoot));

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

app.get("/api/v1/health", (_, res) => {
  res.json({ status: "ok", version: "v1" });
});

app.get("/api/v2/health", async (_, res) => {
  res.json({ status: "ok", version: "v2 new" });
});

app.use("/api/v2", storeV2Routes);
app.use("/api/v2/auth", authRoutes);
app.use("/api/v2/admin", adminRoutes);

if (sentryDsn) {
  Sentry.setupExpressErrorHandler(app);
}
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);

const io = setupStoreSocket(httpServer);
app.set("io", io);

async function start() {
  try {
    if (process.env.REDIS_URL) {
      startPurchaseNotificationConsumer((payload) => {
        emitStorePurchaseToAdmins(io, payload);
        notificationService.notifyAdminsOfNewOrder(io, {
          id: payload.purchase_id,
          purchase_serial: payload.purchase_serial,
        });
      });
    }

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

function gracefulShutdown() {
  console.log("\n🛑 Shutting down gracefully...");
  baileysClient.destroy();
  httpServer.close(() => {
    closeRedis().finally(() => process.exit(0));
  });
  // Force exit if graceful close takes too long (e.g. open connections)
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

start();

export default app;
