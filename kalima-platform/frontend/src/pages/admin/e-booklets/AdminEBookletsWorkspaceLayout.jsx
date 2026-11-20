import { Link, Outlet, useLocation } from "react-router-dom";
import { BarChart3, BookOpenCheck, ClipboardList, Library, LayoutGrid, Printer, Settings, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRole } from "@/hooks/useRole";
import { canAccessAdminAnalytics } from "@/lib/adminAnalyticsAccess";

const tabs = [
  { labelKey: "admin.workspace.tabs.overview", href: "/admin/e-booklets", icon: BookOpenCheck, exact: true, testId: "overview" },
  { labelKey: "admin.workspace.tabs.catalog", href: "/admin/e-booklets/catalog", icon: LayoutGrid, testId: "catalog" },
  { labelKey: "admin.workspace.tabs.orders", href: "/admin/e-booklets/orders", icon: ClipboardList, testId: "orders-delivery" },
  { labelKey: "admin.workspace.tabs.access", href: "/admin/e-booklets/access", icon: ShieldCheck, testId: "teacher-access" },
  { labelKey: "admin.workspace.tabs.printTemplates", href: "/admin/e-booklets/print-templates", icon: Printer, testId: "print-templates" },
  { labelKey: "admin.workspace.tabs.analytics", href: "/admin/e-booklets/analytics", icon: BarChart3, testId: "analytics", analytics: true },
  { labelKey: "admin.workspace.tabs.hotspotLibrary", href: "/admin/e-booklets/hotspot-library", icon: Library, testId: "hotspot-library" },
  { labelKey: "admin.workspace.tabs.settings", href: "/admin/e-booklets/settings", icon: Settings, testId: "settings" },
];

export default function AdminEBookletsWorkspaceLayout() {
  const { t } = useTranslation("eBooklets");
  const { pathname } = useLocation();
  const { storeRoles } = useRole();
  // The Moderator does not see the numbers.
  const visibleTabs = tabs.filter((tab) => !tab.analytics || canAccessAdminAnalytics(storeRoles));

  return (
    <div className="space-y-6" data-testid="admin-e-booklets-workspace">
      <section className="rounded-3xl border border-primary/15 bg-background p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{t("admin.workspace.kicker")}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{t("common.eBooklets")}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {t("admin.workspace.description")}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-2">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.workspace.tabsLabel")}
          </p>
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label={t("admin.workspace.navLabel")}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                data-testid={`admin-e-booklets-tab-${tab.testId}`}
              >
                <Icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </Link>
            );
          })}
          </nav>
        </div>
      </section>

      <Outlet />
    </div>
  );
}
