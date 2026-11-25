import { Router } from "express";
import cartRoutes from "./cart.routes";
import couponRoutes from "./coupon.routes";
import requiredFieldRoutes from "./required-field.routes";
import categoryRoutes from "./category.routes";
import productRoutes from "./product.routes";
import purchaseRoutes from "./purchase.routes";
import sampleSectionRoutes from "./sample-section.routes";
import sampleRoutes from "./sample.routes";
import governmentRoutes from "./government.routes";
import zonesRoutes from "./zones.routes";
import sitesRoutes from "./sites.routes";
import levelsRoutes from "./levels.routes";
import subjectsRoutes from "./subjects.routes";
import userProfileRoutes from "./user-profile.routes";
import paymentMethodRoutes from "./payment-method.routes";
import adminRoutes from "./admin.routes";
import adminDashboardRoutes from "./admin-dashboard.routes";
import staffShiftRoutes from "./staff-shift.routes";
import notificationRoutes from "./notification.routes";
import appreciationRoutes from "./appreciation.routes";
import eBookletRoutes from "./e-booklet.routes";
import settingsRoutes from "./settings.routes";

const router = Router();

router.use("/cart", cartRoutes);
router.use("/coupons", couponRoutes);
router.use("/required-fields", requiredFieldRoutes);
router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/purchases", purchaseRoutes);
router.use("/sample-sections", sampleSectionRoutes);
router.use("/samples", sampleRoutes);

// Lookup / reference-data endpoints
router.use("/governments", governmentRoutes);
router.use("/zones", zonesRoutes);
router.use("/sites", sitesRoutes);
router.use("/levels", levelsRoutes);
router.use("/subjects", subjectsRoutes);

// User profile (consolidated teaches-at, social-media, parent-children)
router.use("/profile", userProfileRoutes);

// Payment Methods
router.use("/payment-methods", paymentMethodRoutes);
router.use("/appreciation", appreciationRoutes);
router.use("/settings", settingsRoutes);

// Admin Routes
router.use("/admin", adminRoutes);

// Admin Dashboard Analytics Routes
router.use("/admin/dashboard", adminDashboardRoutes);
router.use("/staff-shifts", staffShiftRoutes);

// Notifications
router.use("/notifications", notificationRoutes);

// E-Booklets: standalone store/admin/teacher/student/viewer API namespace.
router.use("/", eBookletRoutes);

export default router;
