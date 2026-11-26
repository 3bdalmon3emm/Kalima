import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useOrders from '@/hooks/useOrders';
import OrdersToolbar from '@/components/admin/orders/OrdersToolbar';
import OrdersTable from '@/components/admin/orders/OrdersTable';
import StoreStatsCards from '@/components/admin/orders/StoreStatsCards';
import { Download, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import useRole from '@/hooks/useRole';
import { canSeeOrderStats } from '@/lib/adminAnalyticsAccess';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import useExport from '@/hooks/useExport';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    PaginationEllipsis,
    generatePaginationLinks
} from '@/components/ui/pagination';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function OrdersPage() {
    const { t, i18n } = useTranslation('admin');
    const { isAdmin, storeRoles } = useRole();
    // The money cards: Admin, SubAdmin and Moderator.
    const showStats = canSeeOrderStats(storeRoles);
    const {
        orders,
        pagination,
        filters,
        loading,
        setSearch,
        setStatus,
        setFlag,
        setDateRange,
        setPage,
        fetchOrders
    } = useOrders();

    const { exportData, loading: exportLoading, exportProgress } = useExport();
    const [selectedIds, setSelectedIds] = useState([]);

    const handleSelect = (id, checked) => {
        setSelectedIds(prev =>
            checked ? [...prev, id] : prev.filter(selectedId => selectedId !== id)
        );
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            setSelectedIds(orders.map(order => order.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSearch = (query) => {
        setSearch(query);
    };

    const handleStatus = (status) => {
        setStatus(status);
    };

    const handleDateRangeChange = (range) => {
        setDateRange(range?.from || null, range?.to || null);
    };

    const handleActionSuccess = () => {
        fetchOrders();
    };

    const handleExport = (format) => {
        exportData({
            resource: 'purchases',
            format: format,
            ids: selectedIds,
            filters // pass current filters to export function
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('orders.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('orders.totalOrders', { count: pagination.total || 0 })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <Button variant="outline" asChild>
                            <Link to="/admin/orders/deleted"><Trash2 className="h-4 w-4 me-2" />{t('orders.deleted.title', 'Deleted orders')}</Link>
                        </Button>
                    )}
                    <DropdownMenu dir={i18n.dir()}>
                        <DropdownMenuTrigger asChild>
                            <Button disabled={exportLoading} variant="outline" data-testid="orders-export-button">
                                <Download className="mr-2 h-4 w-4" />
                                {t('orders.export', 'Export')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleExport('csv')} disabled={exportLoading} data-testid="orders-export-csv">
                                {t('orders.exportCsv', 'Export as CSV')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={exportLoading} data-testid="orders-export-excel">
                                {t('orders.exportXlsx', 'Export as Excel')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {exportLoading && exportProgress > 0 && (
                <div>
                    <div className="flex justify-between text-sm mb-1 text-muted-foreground">
                        <span>{exportProgress < 100 ? t('export.exporting', 'Exporting...') : t('export.processing', 'Processing...')}</span>
                        <span>{exportProgress}%</span>
                    </div>
                    <Progress value={exportProgress} />
                </div>
            )}

            {showStats && <StoreStatsCards startDate={filters.startDate} endDate={filters.endDate} />}

            <OrdersToolbar
                filters={filters}
                onSearchChange={handleSearch}
                onStatusChange={handleStatus}
                onDateRangeChange={handleDateRangeChange}
                onFlagChange={setFlag}
            />

            <OrdersTable
                orders={orders}
                loading={loading}
                onActionSuccess={handleActionSuccess}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onSelectAll={handleSelectAll}
            />

            {pagination.pages > 1 && (
                <div className="mt-6 flex justify-end">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => setPage(Math.max(1, pagination.page - 1))}
                                    className={pagination.page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    text={t('common.pagination.previous')}
                                    data-testid="orders-pagination-prev"
                                />
                            </PaginationItem>

                            {generatePaginationLinks(pagination.page, pagination.pages).map((pageNumber, index) => {
                                if (pageNumber === 'ellipsis') {
                                    return (
                                        <PaginationItem key={`ellipsis-${index}`}>
                                            <PaginationEllipsis />
                                        </PaginationItem>
                                    );
                                }

                                return (
                                    <PaginationItem key={pageNumber}>
                                        <PaginationLink
                                            onClick={() => setPage(pageNumber)}
                                            isActive={pagination.page === pageNumber}
                                            className="cursor-pointer"
                                            data-testid={`orders-pagination-${pageNumber}`}
                                        >
                                            {pageNumber}
                                        </PaginationLink>
                                    </PaginationItem>
                                );
                            })}

                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => setPage(Math.min(pagination.pages, pagination.page + 1))}
                                    className={pagination.page >= pagination.pages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    text={t('common.pagination.next')}
                                    data-testid="orders-pagination-next"
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
