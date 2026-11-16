import { useTranslation } from 'react-i18next';
import AccountLevelBadge from '@/components/admin/AccountLevelBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatOrderDate, getStatusColor, formatPhone } from '@/lib/storeUtils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2 } from 'lucide-react';
import OrderActions from './OrderActions';
import { Link } from 'react-router-dom';

export default function OrdersTable({
    orders,
    loading,
    onActionSuccess,
    selectedIds = [],
    onSelect,
    onSelectAll
}) {
    const { t, i18n } = useTranslation('admin');

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">{t('common.loading', 'Loading...')}</div>;
    }

    if (!orders?.length) {
        return <div className="p-8 text-center text-muted-foreground border rounded-md">{t('orders.messages.noOrdersFound', 'No orders found.')}</div>;
    }

    return (
        <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden md:block border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">
                                <Checkbox
                                    className={i18n.dir() === 'rtl' ? 'scale-x-[-1]' : ''}
                                    checked={orders.length > 0 && selectedIds.length === orders.length}
                                    onCheckedChange={onSelectAll}
                                    aria-label={t('orders.table.selectAll', 'Select all')}
                                />
                            </TableHead>
                            <TableHead>{t('orders.table.serial')}</TableHead>
                            <TableHead>{t('orders.table.customer')}</TableHead>
                            <TableHead>{t('orders.table.status')}</TableHead>
                            <TableHead numeric>{t('orders.table.total')}</TableHead>
                            <TableHead>{t('orders.table.payment')}</TableHead>
                            <TableHead actions>{t('orders.table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => (
                            <TableRow key={order.id} data-state={selectedIds.includes(order.id) && "selected"} className={order.is_deleted ? 'opacity-60' : ''}>
                                <TableCell>
                                    <Checkbox
                                        className={i18n.dir() === 'rtl' ? 'scale-x-[-1]' : ''}
                                        checked={selectedIds.includes(order.id)}
                                        onCheckedChange={(checked) => onSelect(order.id, checked)}
                                        aria-label={`Select order ${order.purchase_serial || order.id}`}
                                    />
                                </TableCell>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <Link to={`/admin/orders/${order.id}`} className="text-primary hover:underline" data-testid={`admin-orders-table-link-${order.id}`}>
                                            {order.purchase_serial || `#${order.id}`}
                                        </Link>
                                        {order.is_deleted && (
                                            <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                                                <Trash2 className="h-3 w-3" />
                                                {t('orders.deleted', 'Deleted')}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                                        {formatOrderDate(order.created_at, i18n.language)}
                                    </div>
                                </TableCell>
                                <TableCell truncate title={order.users?.email || order.users?.name || undefined}>
                                    <div className="font-medium">{order.users?.name || t('common.na', 'N/A')}</div>
                                    {(order.users?.flag && order.users.flag !== 'NORMAL') || (order.customer_flag && order.customer_flag !== order.users?.flag) ? (
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                            {order.users?.flag && <AccountLevelBadge level={order.users.flag} />}
                                            {order.customer_flag && order.customer_flag !== order.users?.flag && (
                                                <span className="text-[11px] text-muted-foreground">{t('orders.levelAtOrder', 'At ordering')}: <AccountLevelBadge level={order.customer_flag} /></span>
                                            )}
                                        </div>
                                    ) : null}
                                    <div className="text-xs text-muted-foreground">{order.users?.email}</div>
                                    {order.users?.phone && (
                                        <div className="text-xs text-muted-foreground mt-0.5">{formatPhone(order.users.phone)}</div>
                                    )}
                                </TableCell>
                                <TableCell status>
                                    <Badge variant="outline" className={getStatusColor(order.status)}>
                                        {t(`orders.status${order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase()}`, { defaultValue: order.status })}
                                    </Badge>
                                </TableCell>
                                <TableCell numeric>
                                    {formatCurrency(order.total, t)}
                                </TableCell>
                                <TableCell truncate title={order.payment_methods?.name || undefined}>
                                    {order.payment_methods?.name || t('common.na', 'N/A')}
                                </TableCell>
                                <TableCell actions>
                                    <OrderActions order={order} onActionSuccess={onActionSuccess} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {orders.map((order) => (
                    <div key={order.id} className={`border rounded-md p-4 space-y-4 text-card-foreground shadow-sm ${order.is_deleted ? 'opacity-60 border-destructive/30' : ''}`}>
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    className="mt-1"
                                    checked={selectedIds.includes(order.id)}
                                    onCheckedChange={(checked) => onSelect(order.id, checked)}
                                    aria-label={`Select order ${order.purchase_serial || order.id}`}
                                />
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Link to={`/admin/orders/${order.id}`} className="font-semibold text-primary hover:underline text-lg" data-testid={`admin-orders-table-link-mobile-${order.id}`}>
                                            {order.purchase_serial || `#${order.id}`}
                                        </Link>
                                        {order.is_deleted && (
                                            <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                                                <Trash2 className="h-3 w-3" />
                                                {t('orders.deleted', 'Deleted')}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                        {formatOrderDate(order.created_at, i18n.language)}
                                    </div>
                                </div>
                            </div>
                            <Badge variant="outline" className={getStatusColor(order.status)}>
                                {t(`orders.status${order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase()}`, { defaultValue: order.status })}
                            </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <div className="text-muted-foreground">{t('orders.table.customer')}</div>
                                <div className="font-medium truncate" title={order.users?.name || t('common.na', 'N/A')}>{order.users?.name || t('common.na', 'N/A')}</div>
                                {order.users?.phone && (
                                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={formatPhone(order.users.phone)}>{formatPhone(order.users.phone)}</div>
                                )}
                            </div>
                            <div>
                                <div className="text-muted-foreground">{t('orders.table.payment')}</div>
                                <div className="font-medium truncate" title={order.payment_methods?.name || t('common.na', 'N/A')}>{order.payment_methods?.name || t('common.na', 'N/A')}</div>
                            </div>
                            <div>
                                <div className="text-muted-foreground">{t('orders.table.total')}</div>
                                <div className="font-medium">{formatCurrency(order.total, t)}</div>
                            </div>
                        </div>

                        <div className="pt-2 border-t flex justify-end">
                            <OrderActions order={order} onActionSuccess={onActionSuccess} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
