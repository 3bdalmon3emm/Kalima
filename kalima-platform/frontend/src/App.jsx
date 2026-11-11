import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route, Outlet, Navigate, useLocation, useParams } from "react-router-dom";
import { useState, useEffect, Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Toaster } from 'sonner';
import { E_BOOKLET_ORDERS_ALLOWED_ROLES } from "./pages/e-booklets/eBookletOrdersContract.mjs";
import { ADMIN_ANALYTICS_ALLOWED_ROLES } from "./lib/adminAnalyticsAccess";
import { EMPLOYEE_PERFORMANCE_ALLOWED_ROLES } from "./lib/employeePerformanceAccess";
import ImpersonationBanner from "./components/auth/ImpersonationBanner";

import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute"; // REPLACED AdminRoute
import MainLayout from "./layouts/MainLayout";
import CouponsPage from "./pages/admin/coupons/CouponsPage";

// Lazy-loaded pages
const LandingPage = lazy(() => import("./pages/landing/LandingPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const SignupPage = lazy(() => import("./pages/auth/SignupPage"));
const ForgotPasswordPage = lazy(
  () => import("./pages/auth/ForgotPasswordPage"),
);
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage"));
const MarketPage = lazy(() => import("./pages/market/MarketPage"));
const WizardCheckoutPage = lazy(
  () => import("./pages/checkout/WizardCheckoutPage"),
);
const CheckoutPage = lazy(() => import("./pages/checkout/CheckoutPage"));
const FastBuyCheckoutPage = lazy(
  () => import("./pages/checkout/FastBuyCheckoutPage"),
);
const ProductDetailsPage = lazy(
  () => import("./pages/product/ProductDetailsPage"),
);
const BookletDetailsPage = lazy(
  () => import("./pages/booklet/BookletDetailsPage"),
);
const EBookletStorePage = lazy(
  () => import("./pages/e-booklets/EBookletStorePage"),
);
const EBookletDetailsPage = lazy(
  () => import("./pages/e-booklets/EBookletDetailsPage"),
);
const EBookletCartPage = lazy(
  () => import("./pages/e-booklets/EBookletCartPage"),
);
const EBookletCheckoutPage = lazy(
  () => import("./pages/e-booklets/EBookletCheckoutPage"),
);
const EBookletOrdersPage = lazy(
  () => import("./pages/e-booklets/EBookletOrdersPage"),
);
const AcceptEBookletInvitePage = lazy(
  () => import("./pages/e-booklets/AcceptEBookletInvitePage"),
);
const EBookletPrintedCodeQrPage = lazy(
  () => import("./pages/e-booklets/EBookletPrintedCodeQrPage"),
);
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const CartPage = lazy(() => import("./pages/cart/CartPage"));

// Admin lazy-loaded pages
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const DashboardPage = lazy(() => import("./pages/admin/dashboard/DashboardPage"));
const OrdersPage = lazy(() => import("./pages/admin/orders/OrdersPage"));
const OrderDetailPage = lazy(
  () => import("./pages/admin/orders/OrderDetailPage"),
);
const ProductsPage = lazy(() => import("./pages/admin/products/ProductsPage"));
const CreateProductPage = lazy(() => import("./pages/admin/products/CreateProductPage"));
const ProductDetailPage = lazy(() => import("./pages/admin/products/ProductDetailPage"));
const ProductBuyersPage = lazy(() => import("./pages/admin/products/ProductBuyersPage"));
const EditProductPage = lazy(() => import("./pages/admin/products/EditProductPage"));
const CategoriesPage = lazy(
  () => import("./pages/admin/categories/CategoriesPage"),
);
const UsersPage = lazy(() => import("./pages/admin/users/UsersPage"));
const UserDetailPage = lazy(() => import("./pages/admin/users/UserDetailPage"));
const UserAppreciationPage = lazy(() => import("./pages/admin/users/UserAppreciationPage"));
const AdminSamplesPage = lazy(() => import("./pages/admin/samples/AdminSamplesPage"));
const AdminSampleSectionDetailPage = lazy(() => import("./pages/admin/samples/AdminSampleSectionDetailPage"));
const SettingsPage = lazy(() => import("./pages/admin/settings/SettingsPage"))
const PaymentMethodsPage = lazy(() => import("./pages/admin/payment-methods/PaymentMethodsPage"));
const RequiredFieldsPage = lazy(() => import("./pages/admin/required-fields/RequiredFieldsPage"));
const AnalyticsPage = lazy(() => import("./pages/admin/analytics/AnalyticsPage"));
const EmployeePerformancePage = lazy(() => import("./pages/admin/employee-performance/EmployeePerformancePage"));
const EmployeePerformanceDetailPage = lazy(() => import("./pages/admin/employee-performance/EmployeePerformanceDetailPage"));
const AdminStoreWorkspaceLayout = lazy(() => import("./pages/admin/store/AdminStoreWorkspaceLayout"));
const AdminEBookletsWorkspaceLayout = lazy(() => import("./pages/admin/e-booklets/AdminEBookletsWorkspaceLayout"));
const AdminEBookletsOverviewPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletsOverviewPage"));
const AdminEBookletTemplatesPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletTemplatesPage"));
const AdminEBookletEditorPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletEditorPage"));
const AdminEBookletPurchasesPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletPurchasesPage"));
const AdminEBookletPurchaseDetailPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletPurchaseDetailPage"));
const AdminEBookletPurchaseDeliveryPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletPurchaseDeliveryPage"));
const AdminEBookletInstancesPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletInstancesPage"));
const AdminEBookletTeacherAccessPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletTeacherAccessPage"));
const AdminEBookletPrintTemplatesPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletPrintTemplatesPage"));
const AdminEBookletDevicesPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletDevicesPage"));
const AdminEBookletInstanceStudentsPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletInstanceStudentsPage"));
const AdminEBookletAnalyticsPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletAnalyticsPage"));
const AdminEBookletSettingsPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletSettingsPage"));
const AdminEBookletTermsMilestonesPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletTermsMilestonesPage"));
const AdminEBookletHotspotLibraryPage = lazy(() => import("./pages/admin/e-booklets/AdminEBookletHotspotLibraryPage"));

// Public viewer (no layout)
const SamplePage = lazy(() => import("./pages/sample/SamplePage"));
const SamplesDirectoryPage = lazy(() => import("./pages/sample/SamplesDirectoryPage"));
const SamplePreview = lazy(() => import("./pages/sample/SamplePreviewPage"))
const AppreciationPublicPage = lazy(() => import("./pages/appreciation/AppreciationPublicPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/privacy/PrivacyPolicyPage"));
const DeleteMyDataPage = lazy(() => import("./pages/privacy/DeleteMyDataPage"));
// User lazy-loaded pages
const MyOrdersPage = lazy(() => import("./pages/orders/MyOrdersPage"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage"));
const AdminNotificationsPage = lazy(() => import("./pages/admin/notifications/AdminNotificationsPage"));
const QuestionBankPage = lazy(() => import("./pages/admin/question-bank/QuestionBankPage"));
const BankFolderPage = lazy(() => import("./pages/admin/question-bank/BankFolderPage"));
const QuestionEditorPage = lazy(() => import("./pages/admin/question-bank/QuestionEditorPage"));
const QuestionBankArchivePage = lazy(() => import("./pages/admin/question-bank/QuestionBankArchivePage"));

// Teacher lazy-loaded pages
const TeacherLayout = lazy(() => import("./layouts/TeacherLayout"));
const TeacherProfilePage = lazy(() => import("./pages/teacher/profile/TeacherProfilePage"));
const TeacherSettingsPage = lazy(() => import("./pages/teacher/settings/TeacherSettingsPage"));
const TeacherEBookletsPage = lazy(() => import("./pages/teacher/e-booklets/TeacherEBookletsPage"));
const TeacherInviteManagementPage = lazy(() => import("./pages/teacher/e-booklets/TeacherInviteManagementPage"));
const TeacherEBookletAnalyticsPage = lazy(() => import("./pages/teacher/e-booklets/TeacherEBookletAnalyticsPage"));
const EBookletViewerPage = lazy(() => import("./pages/e-booklets/EBookletViewerPage"));

// Student lazy-loaded pages
const StudentLayout = lazy(() => import("./layouts/StudentLayout"));
const StudentProfilePage = lazy(() => import("./pages/student/profile/StudentProfilePage"));
const StudentSettingsPage = lazy(() => import("./pages/student/settings/StudentSettingsPage"));
const StudentEBookletsPage = lazy(() => import("./pages/student/e-booklets/StudentEBookletsPage"));

// Parent lazy-loaded pages
const ParentLayout = lazy(() => import("./layouts/ParentLayout"));
const ParentProfilePage = lazy(() => import("./pages/parent/profile/ParentProfilePage"));
const ParentSettingsPage = lazy(() => import("./pages/parent/settings/ParentSettingsPage"));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <LoadingSpinner className="h-8 w-8 text-primary" />
  </div>
);

function Root() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.dir = i18n.dir();
    document.documentElement.lang = i18n.language;
  }, [i18n, i18n.language]);

  return (
    <ErrorBoundary>
      <ImpersonationBanner />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}

function LegacyEBookletRedirect({ type }) {
  const { purchaseId, instanceId } = useParams();
  const { search } = useLocation();
  const targets = {
    purchaseDelivery: `/admin/e-booklets/orders/${purchaseId}/delivery`,
    instanceView: `/admin/e-booklets/access/${instanceId}/view`,
    instanceStudents: `/admin/e-booklets/access/${instanceId}/students`,
    instanceDevices: `/admin/e-booklets/access/${instanceId}/devices`,
    accessCodes: `/admin/e-booklets/access${search}`,
  };

  return <Navigate to={targets[type] || "/admin/e-booklets"} replace />;
}

function LegacyAdminNotificationRedirect({ type }) {
  const { id } = useParams();
  const target = type === "order" ? `/admin/orders/${id}` : `/admin/users/${id}`;
  return <Navigate to={target} replace />;
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Root />}>
      <Route path="/appreciation/:token" element={<AppreciationPublicPage />} />
      {/* Public Routes with MainLayout (Navbar & Footer) */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/delete-my-data" element={<DeleteMyDataPage />} />
        <Route path="/e-booklet-viewer/:instanceId" element={<EBookletViewerPage />} />

        {/* E-booklet storefront is public to visitors/teachers; students redeem private URLs/codes only. */}
        <Route element={<RoleRoute excludedRole={["Student"]} />}>
          <Route path="/e-booklets" element={<EBookletStorePage />} />
          <Route path="/e-booklets/instances/:instanceId" element={<EBookletDetailsPage />} />
          <Route path="/e-booklets/:instanceId/preview" element={<EBookletViewerPage previewMode />} />
          <Route path="/e-booklets/:templateId" element={<EBookletDetailsPage />} />
        </Route>

        {/* Market and Product Routes - Restricted by store access and hidden from logged-in students for now. */}
        <Route element={<RoleRoute requireStoreAccess={true} excludedRole={["Student"]} />}>
          <Route path="/market" element={<MarketPage />} />
          <Route path="/product/:id" element={<ProductDetailsPage />} />
          <Route path="/booklet/:id" element={<BookletDetailsPage />} />
        </Route>
        {/* Samples Routes - Restricted by store access */}
        <Route element={<RoleRoute requireStoreAccess={true} />}>
          <Route path="/samples" element={<SamplesDirectoryPage />} />
          <Route path="/samples/:id" element={<SamplePage />} />
          <Route path="/samples/:id/preview" element={<SamplePreview />} />
        </Route>

        {/* E-booklet purchase flow: teachers buy from the public storefront; students only redeem private URLs/codes. */}
        <Route element={<ProtectedRoute requireAuth={true} />}>
          <Route element={<RoleRoute requiredRole={E_BOOKLET_ORDERS_ALLOWED_ROLES} />}>
            <Route path="/e-booklet-cart" element={<EBookletCartPage />} />
            <Route path="/e-booklet-checkout" element={<EBookletCheckoutPage />} />
          </Route>
        </Route>

        {/* Protected Store Routes (Auth Required) - Restricted by store access */}
        <Route element={<RoleRoute requireStoreAccess={true} />}>
          <Route element={<ProtectedRoute requireAuth={true} />}>
            {/* Purchase flow blocked for Admins */}
            <Route element={<RoleRoute excludedRole={["Admin", "SubAdmin", "Student"]} />}>
              <Route path="/cart" element={<WizardCheckoutPage />} />
              <Route path="/checkout" element={<WizardCheckoutPage />} />
              <Route
                path="/fast-buy/checkout"
                element={<FastBuyCheckoutPage />}
              />
            </Route>
            <Route path="/orders" element={<MyOrdersPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

        </Route>
        <Route path="/e-booklet-invite/:token" element={<AcceptEBookletInvitePage />} />
        <Route path="/e-booklet-code" element={<AcceptEBookletInvitePage mode="code" />} />
        <Route path="/e-booklet-code/qr/:ref" element={<EBookletPrintedCodeQrPage />} />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      {/* Admin Routes */}
      <Route element={<RoleRoute requiredRole={["Admin", "SubAdmin"]} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/dashboard" element={<DashboardPage />} />
          <Route element={<AdminStoreWorkspaceLayout />}>
          <Route path="/admin/orders" element={<OrdersPage />} />
          <Route path="/admin/orders/:id" element={<OrderDetailPage />} />
          <Route path="/orders/:id" element={<LegacyAdminNotificationRedirect type="order" />} />
            <Route path="/admin/products" element={<ProductsPage />} />
            <Route path="/admin/products/create" element={<CreateProductPage />} />
            <Route path="/admin/products/:id" element={<ProductDetailPage />} />
            <Route path="/admin/products/:id/buyers" element={<ProductBuyersPage />} />
            <Route path="/admin/products/:id/edit" element={<EditProductPage />} />
            <Route path="/admin/categories" element={<CategoriesPage />} />
            <Route path="/admin/samples" element={<AdminSamplesPage />} />
            <Route path="/admin/samples/:id" element={<AdminSampleSectionDetailPage />} />
          </Route>
          <Route path="/admin/e-booklets/create" element={<AdminEBookletEditorPage />} />
          <Route path="/admin/e-booklets/:id/edit" element={<AdminEBookletEditorPage />} />
          <Route path="/admin/e-booklets" element={<AdminEBookletsWorkspaceLayout />}>
            <Route index element={<AdminEBookletsOverviewPage />} />
            <Route path="catalog" element={<AdminEBookletTemplatesPage />} />
            <Route path="orders" element={<AdminEBookletPurchasesPage />} />
            <Route path="orders/:purchaseId" element={<AdminEBookletPurchaseDetailPage />} />
            <Route path="orders/:purchaseId/delivery" element={<AdminEBookletPurchaseDeliveryPage />} />
            <Route path="access" element={<AdminEBookletInstancesPage />} />
            <Route path="access/teachers/:teacherId" element={<AdminEBookletTeacherAccessPage />} />
            <Route path="access/:instanceId/view" element={<EBookletViewerPage />} />
            <Route path="access/:instanceId/students" element={<AdminEBookletInstanceStudentsPage />} />
            <Route path="access/:instanceId/devices" element={<AdminEBookletDevicesPage />} />
            <Route path="print-templates" element={<AdminEBookletPrintTemplatesPage />} />
            <Route path="analytics" element={<AdminEBookletAnalyticsPage />} />
            <Route path="hotspot-library" element={<AdminEBookletHotspotLibraryPage />} />
            <Route path="settings" element={<AdminEBookletSettingsPage />} />
            <Route path="settings/terms-milestones" element={<AdminEBookletTermsMilestonesPage />} />
          </Route>
          <Route path="/admin/e-booklet-purchases" element={<Navigate to="/admin/e-booklets/orders" replace />} />
          <Route path="/admin/e-booklet-purchases/:purchaseId/delivery" element={<LegacyEBookletRedirect type="purchaseDelivery" />} />
          <Route path="/admin/e-booklet-instances" element={<Navigate to="/admin/e-booklets/access" replace />} />
          <Route path="/admin/e-booklet-instances/:instanceId/view" element={<LegacyEBookletRedirect type="instanceView" />} />
          <Route path="/admin/e-booklet-instances/:instanceId/students" element={<LegacyEBookletRedirect type="instanceStudents" />} />
          <Route path="/admin/e-booklet-instances/:instanceId/devices" element={<LegacyEBookletRedirect type="instanceDevices" />} />
          <Route path="/admin/e-booklet-analytics" element={<Navigate to="/admin/e-booklets/analytics" replace />} />
          <Route path="/admin/e-booklet-terms-milestones" element={<Navigate to="/admin/e-booklets/settings/terms-milestones" replace />} />
          <Route path="/admin/e-booklets/milestones/:achievementId" element={<Navigate to="/admin/e-booklets/settings/terms-milestones" replace />} />
          <Route path="/admin/e-booklets/access-codes" element={<LegacyEBookletRedirect type="accessCodes" />} />
          <Route path="/admin/question-bank" element={<QuestionBankPage />} />
          <Route path="/admin/question-bank/archive" element={<QuestionBankArchivePage />} />
          <Route path="/admin/question-bank/folders/:id" element={<BankFolderPage />} />
          <Route path="/admin/question-bank/folders/:folderId/questions/new" element={<QuestionEditorPage />} />
          <Route path="/admin/question-bank/questions/:questionId/edit" element={<QuestionEditorPage />} />
          <Route path="/admin/payment-methods" element={<PaymentMethodsPage />} />
          <Route path="/admin/required-fields" element={<RequiredFieldsPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
          <Route path="/users/:id" element={<LegacyAdminNotificationRedirect type="user" />} />
          <Route path="/admin/users/:id/appreciation" element={<UserAppreciationPage />} />
          <Route path="/admin/coupons" element={<CouponsPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route element={<RoleRoute requiredRole={ADMIN_ANALYTICS_ALLOWED_ROLES} />}>
            <Route path="/admin/analytics" element={<AnalyticsPage />} />
          </Route>
          <Route element={<RoleRoute requiredRole={EMPLOYEE_PERFORMANCE_ALLOWED_ROLES} />}>
            <Route path="/admin/employee-performance" element={<EmployeePerformancePage />} />
            <Route path="/admin/employee-performance/:id" element={<EmployeePerformanceDetailPage />} />
          </Route>
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
        </Route>

      </Route>

      {/* Teacher Routes */}
      <Route element={<RoleRoute requiredRole={["Teacher"]} />}>
        <Route element={<TeacherLayout />}>
          <Route path="/teacher/profile" element={<TeacherProfilePage />} />
          <Route path="/teacher/settings" element={<TeacherSettingsPage />} />
          <Route path="/teacher/e-booklets" element={<TeacherEBookletsPage />} />
          <Route path="/teacher/e-booklets/milestones/:achievementId" element={<Navigate to="/teacher/e-booklets" replace />} />
          <Route path="/e-booklet-orders" element={<EBookletOrdersPage />} />
          <Route path="/teacher/e-booklet-analytics" element={<TeacherEBookletAnalyticsPage />} />
          <Route path="/teacher/orders" element={<MyOrdersPage />} />
          <Route path="/teacher/e-booklets/:instanceId" element={<EBookletViewerPage />} />
          <Route path="/teacher/e-booklets/:instanceId/invites" element={<TeacherInviteManagementPage />} />
        </Route>
      </Route>

      {/* Student Routes */}
      <Route element={<RoleRoute requiredRole={["Student"]} />}>
        <Route element={<StudentLayout />}>
          <Route path="/student/profile" element={<StudentProfilePage />} />
          <Route path="/student/settings" element={<StudentSettingsPage />} />
          <Route path="/student/e-booklets" element={<StudentEBookletsPage />} />
          <Route path="/student/e-booklets/:instanceId" element={<EBookletViewerPage />} />
        </Route>
      </Route>

      {/* Parent Routes */}
      <Route element={<RoleRoute requiredRole={["Parent"]} />}>
        <Route element={<ParentLayout />}>
          <Route path="/parent/profile" element={<ParentProfilePage />} />
          <Route path="/parent/settings" element={<ParentSettingsPage />} />
        </Route>
      </Route>

      {/* Guest-only routes with AuthLayout (No Navbar/Footer) */}
      <Route element={<MainLayout />}>
        <Route element={<ProtectedRoute requireAuth={false} />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/auth/reset-password"
            element={<ResetPasswordPage />}
          />
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        </Route>
      </Route>
    </Route>
  )
);

function App() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster
        richColors
        position={isMobile ? "top-center" : "bottom-right"}
        toastOptions={{
          className: "border border-border/40 bg-card/60 backdrop-blur-md shadow-2xl rounded-2xl p-4",
          titleClassName: "font-black uppercase tracking-tight text-sm",
          descriptionClassName: "font-medium opacity-80 text-xs"
        }}
      />
    </>
  );
}

export default App;
