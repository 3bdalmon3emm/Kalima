import { useEffect, useState } from "react";
import useReasonPrompt, { askClosingReason } from '@/components/admin/staff-log/useReasonPrompt';
import { Link, useSearchParams } from "react-router-dom";
import { Download, PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  generatePaginationLinks,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminEBookletPurchases } from "@/hooks/admin/useAdminEBooklets";
import useExport from "@/hooks/useExport";
import { formatCurrency, formatOrderDate } from "@/lib/storeUtils";
import { E_BOOKLET_ORDER_FILTER_STATUSES } from "@/pages/e-booklets/eBookletOrdersContract.mjs";
import AdminEBookletPurchaseActions from "./components/AdminEBookletPurchaseActions";
import AdminEBookletPurchasesToolbar from "./components/AdminEBookletPurchasesToolbar";
import AccountLevelBadge from "@/components/admin/AccountLevelBadge";

const purchaseStatuses = ["all", ...E_BOOKLET_ORDER_FILTER_STATUSES];

const statusTone = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  awaiting_payment: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-sky-200 bg-sky-50 text-sky-700",
  needs_branding_info: "border-orange-200 bg-orange-50 text-orange-700",
  customization_in_progress: "border-purple-200 bg-purple-50 text-purple-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delivered: "border-green-200 bg-green-50 text-green-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const prettyStatus = (status) => String(status || "").replaceAll("_", " ");
const purchaseAmount = (purchase) => purchase?.final_payable_price ?? purchase?.price ?? 0;

export default function AdminEBookletPurchasesPage() {
  const { t, i18n } = useTranslation("eBooklets");
  const { t: tLog } = useTranslation("staffLog");
  const [askReason, reasonDialog] = useReasonPrompt();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    purchases,
    pagination,
    filters,
    loading,
    setPage,
    setSearch,
    setStatus,
    setDateRange,
    setTotalRange,
    clearFilters,
    buildPurchaseExportFilters,
    fetchPurchases,
    markPaid,
    updatePurchaseStatus,
  } = useAdminEBookletPurchases();
  const { exportData, loading: exportLoading, exportProgress } = useExport();
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const requestedStatus = searchParams.get("status");
    if (purchaseStatuses.includes(requestedStatus) && requestedStatus !== filters.status) {
      setStatus(requestedStatus);
    }
  }, [filters.status, searchParams, setStatus]);

  useEffect(() => {
    const requestedStatus = searchParams.get("status");
    const initialStatus = purchaseStatuses.includes(requestedStatus) ? requestedStatus : filters.status;
    fetchPurchases({ status: initialStatus }).catch(() => {});
  }, [fetchPurchases, filters.status, searchParams]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => purchases.some((purchase) => purchase.id === id)));
  }, [purchases]);

  const statusLabel = (value) => t(`orders.statuses.${value}`, { defaultValue: t(`statuses.${value}`, { defaultValue: prettyStatus(value) }) });

  const handleStatusChange = (value) => {
    setStatus(value);
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set("status", value);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  };

  const handleClear = () => {
    clearFilters();
    const next = new URLSearchParams(searchParams);
    next.delete("status");
    setSearchParams(next, { replace: true });
  };

  const handleSelect = (id, checked) => {
    setSelectedIds((current) => checked ? [...current, id] : current.filter((selectedId) => selectedId !== id));
  };

  const handleSelectAll = (checked) => {
    setSelectedIds(checked ? purchases.map((purchase) => purchase.id) : []);
  };

  const refresh = () => fetchPurchases().catch(() => {});
  const handleMarkPaid = (purchase) => markPaid(purchase.id);
  const handleUpdateStatus = async (purchase, nextStatus) => {
    const reason = await askClosingReason(askReason, tLog, purchase.status, nextStatus);
    if (reason === null) return undefined;
    return updatePurchaseStatus(purchase.id, nextStatus, purchase.admin_notes, reason);
  };

  const handleExport = (format) => {
    exportData({
      resource: "admin/e-booklet-purchases",
      format,
      ids: selectedIds,
      filters: buildPurchaseExportFilters(),
      serializedFilters: true,
    });
  };

  const renderStatus = (status) => (
    <Badge variant="outline" className={statusTone[status] || "border-slate-200 bg-slate-50 text-slate-700"}>
      {statusLabel(status)}
    </Badge>
  );

  return (
    <div className="space-y-6" data-testid="admin-e-booklet-purchases-page">
      {reasonDialog}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <PackageCheck className="h-8 w-8 text-primary" />
            {t("admin.purchases.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.purchases.total", { count: pagination.total || 0, defaultValue: "{{count}} e-booklet purchases" })}
          </p>
        </div>
        <DropdownMenu dir={i18n.dir()}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={exportLoading} data-testid="admin-e-booklet-purchases-export-button">
              <Download className="h-4 w-4" />
              {t("orders.export", { defaultValue: "Export" })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("csv")} disabled={exportLoading}>
              {t("orders.exportCsv", { defaultValue: "Export as CSV" })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("xlsx")} disabled={exportLoading}>
              {t("orders.exportXlsx", { defaultValue: "Export as Excel" })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {exportLoading && exportProgress > 0 && (
        <div>
          <div className="mb-1 flex justify-between text-sm text-muted-foreground">
            <span>{t("export.exporting", { defaultValue: "Exporting..." })}</span>
            <span>{exportProgress}%</span>
          </div>
          <Progress value={exportProgress} />
        </div>
      )}

      <AdminEBookletPurchasesToolbar
        filters={filters}
        onSearchChange={setSearch}
        onStatusChange={handleStatusChange}
        onDateRangeChange={setDateRange}
        onTotalRangeChange={setTotalRange}
        onClear={handleClear}
      />

      {loading ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">{t("admin.purchases.loading")}</div>
      ) : purchases.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">{t("admin.purchases.empty")}</div>
      ) : (
        <div className="space-y-4">
          <div className="hidden overflow-x-auto rounded-md border xl:block" data-testid="admin-e-booklet-purchases-table-card">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={purchases.length > 0 && selectedIds.length === purchases.length}
                      onCheckedChange={handleSelectAll}
                      aria-label={t("orders.table.selectAll", { defaultValue: "Select all" })}
                    />
                  </TableHead>
                  <TableHead>{t("orders.table.serial", { defaultValue: "Order" })}</TableHead>
                  <TableHead>{t("common.teacher", { defaultValue: "Teacher" })}</TableHead>
                  <TableHead>{t("common.eBooklet", { defaultValue: "E-booklet" })}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                   <TableHead numeric>{t("orders.table.total", { defaultValue: "Total" })}</TableHead>
                   <TableHead>{t("orders.table.payment", { defaultValue: "Payment" })}</TableHead>
                   <TableHead actions>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow key={purchase.id} data-state={selectedIds.includes(purchase.id) && "selected"}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(purchase.id)}
                        onCheckedChange={(checked) => handleSelect(purchase.id, checked)}
                        aria-label={t("admin.purchases.selectPurchase", { id: purchase.id, defaultValue: "Select e-booklet purchase #{{id}}" })}
                      />
                    </TableCell>
                     <TableCell className="font-medium">
                      <Link to={`/admin/e-booklets/orders/${purchase.id}`} className="text-primary hover:underline">
                        #{purchase.id}
                      </Link>
                       <div className="mt-1 text-xs text-muted-foreground tabular-nums">{formatOrderDate(purchase.created_at, i18n.language)}</div>
                     </TableCell>
                     <TableCell truncate title={purchase.teacher?.email || purchase.teacher?.name || undefined}>
                      <div className="font-medium">{purchase.teacher?.name || t("common.teacher", { defaultValue: "Teacher" })}</div>
                      {purchase.teacher?.flag && purchase.teacher.flag !== "NORMAL" && <AccountLevelBadge level={purchase.teacher.flag} />}
                      <div className="text-xs text-muted-foreground">{purchase.teacher?.email}</div>
                      {purchase.teacher?.phone && <div className="text-xs text-muted-foreground">{purchase.teacher.phone}</div>}
                    </TableCell>
                     <TableCell truncate className="max-w-[280px]" title={purchase.template?.title || undefined}>
                      <div className="truncate font-medium">{purchase.template?.title || "-"}</div>
                      <div className="text-xs text-muted-foreground">v{purchase.template_version?.version_number || 1}</div>
                    </TableCell>
                     <TableCell status>{renderStatus(purchase.status)}</TableCell>
                     <TableCell numeric>{formatCurrency(purchaseAmount(purchase), t)}</TableCell>
                     <TableCell truncate title={purchase.payment_reference || purchase.payment_methods?.name || purchase.payment_method || undefined}>
                      <div className="font-medium">{purchase.payment_methods?.name || purchase.payment_method || "-"}</div>
                      <div className="text-xs text-muted-foreground">{purchase.payment_reference || ""}</div>
                    </TableCell>
                     <TableCell actions>
                      <AdminEBookletPurchaseActions purchase={purchase} onMarkPaid={handleMarkPaid} onUpdateStatus={handleUpdateStatus} onActionSuccess={refresh} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4 xl:hidden">
            {purchases.map((purchase) => (
              <div key={purchase.id} className="rounded-md border p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.includes(purchase.id)}
                      onCheckedChange={(checked) => handleSelect(purchase.id, checked)}
                      aria-label={t("admin.purchases.selectPurchase", { id: purchase.id, defaultValue: "Select e-booklet purchase #{{id}}" })}
                    />
                    <div>
                      <Link to={`/admin/e-booklets/orders/${purchase.id}`} className="font-semibold text-primary hover:underline">#{purchase.id}</Link>
                      <div className="text-sm text-muted-foreground">{formatOrderDate(purchase.created_at, i18n.language)}</div>
                    </div>
                  </div>
                  {renderStatus(purchase.status)}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">{t("common.teacher", { defaultValue: "Teacher" })}</div>
                    <div className="truncate font-medium">{purchase.teacher?.name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("common.eBooklet", { defaultValue: "E-booklet" })}</div>
                    <div className="truncate font-medium">{purchase.template?.title || "-"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("orders.table.total", { defaultValue: "Total" })}</div>
                    <div className="font-medium">{formatCurrency(purchaseAmount(purchase), t)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("orders.table.payment", { defaultValue: "Payment" })}</div>
                    <div className="truncate font-medium">{purchase.payment_methods?.name || purchase.payment_method || "-"}</div>
                  </div>
                </div>
                <div className="mt-4 border-t pt-3">
                  <AdminEBookletPurchaseActions purchase={purchase} onMarkPaid={handleMarkPaid} onUpdateStatus={handleUpdateStatus} onActionSuccess={refresh} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="mt-6 flex justify-end">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(Math.max(1, pagination.page - 1))}
                  className={pagination.page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  text={t("common.previous", { defaultValue: "Previous" })}
                />
              </PaginationItem>
              {generatePaginationLinks(pagination.page, pagination.pages).map((pageNumber, index) => (
                pageNumber === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${index}`}><PaginationEllipsis /></PaginationItem>
                ) : (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink onClick={() => setPage(pageNumber)} isActive={pagination.page === pageNumber} className="cursor-pointer">
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                )
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(Math.min(pagination.pages, pagination.page + 1))}
                  className={pagination.page >= pagination.pages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  text={t("common.next", { defaultValue: "Next" })}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
