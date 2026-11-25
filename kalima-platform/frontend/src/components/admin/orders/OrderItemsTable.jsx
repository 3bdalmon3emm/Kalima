import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, buildProductImages } from '@/lib/storeUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import ReasonDialog from '@/components/admin/staff-log/ReasonDialog';

export default function OrderItemsTable({ items, onDeleteItem, orderId }) {
    const { t } = useTranslation('admin');
    const [deleteItemId, setDeleteItemId] = useState(null);
    const [isExpanded, setIsExpanded] = useState(true);

    // Removing an item asks why; staff see the reason in the order's log.
    const handleDeleteConfirm = async (reason) => {
        if (!deleteItemId) return false;
        const res = await onDeleteItem(orderId, deleteItemId, reason);
        if (!res?.success) return false;
        setDeleteItemId(null);
        return true;
    };

    if (!items?.length) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="font-medium">
                    {t('orders.details.orderItems')}
                    <span className="text-muted-foreground ml-2 rtl:mr-2 rtl:ml-0 text-sm font-normal">
                        ({items.length})
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-muted-foreground hover:text-foreground h-8"
                >
                    {isExpanded ? (
                        <>
                            {t('common.hide', 'Hide')} <ChevronUp className="h-4 w-4 ml-1 rtl:mr-1 rtl:ml-0" />
                        </>
                    ) : (
                        <>
                            {t('common.show', 'Show')} <ChevronDown className="h-4 w-4 ml-1 rtl:mr-1 rtl:ml-0" />
                        </>
                    )}
                </Button>
            </div>

            <ReasonDialog
                open={!!deleteItemId}
                onOpenChange={(open) => !open && setDeleteItemId(null)}
                title={t('orders.actions.deleteItem', 'Remove Item')}
                description={t('orders.messages.deleteItemWarning', 'Are you sure you want to remove this item from the order? This action cannot be undone.')}
                destructive
                onConfirm={handleDeleteConfirm}
            />

            {isExpanded && (
                <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Desktop Table */}
                    <div className="hidden md:block border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('orders.items.product', 'Product')}</TableHead>
                                    <TableHead>{t('orders.items.type', 'Type')}</TableHead>
                                    <TableHead numeric>{t('orders.items.price', 'Price')}</TableHead>
                                    <TableHead numeric>{t('orders.items.discount', 'Discount')}</TableHead>
                                    <TableHead actions>{t('orders.items.actions', 'Actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item) => {
                                    const product = item.products;
                                    const { main: mainImage } = buildProductImages(product);
                                    return (
                                        <TableRow key={item.id} className={item.is_deleted ? 'opacity-60' : ''}>
                                            <TableCell truncate title={product?.title || undefined}>
                                                <div className="flex items-center gap-3">
                                                    {mainImage && (
                                                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border">
                                                            <img src={mainImage} className="h-full w-full object-cover" alt="Product thumbnail" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-sm">{product?.title || t('orders.items.unknownProduct', 'Unknown Product')}</span>
                                                            {item.is_deleted && (
                                                                <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                                                                    <Trash2 className="h-3 w-3" />
                                                                    {t('orders.deleted', 'Deleted')}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {product?.serial && (
                                                            <div
                                                                className="mt-1 inline-flex max-w-full items-baseline gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs whitespace-normal break-all"
                                                                data-testid={`admin-orders-item-serial-${item.id}`}
                                                            >
                                                                <span className="whitespace-nowrap font-semibold text-primary">
                                                                    {t('orders.items.serial', 'Serial number')}:
                                                                </span>
                                                                {' '}
                                                                <span className="font-mono text-foreground">{product.serial}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{product?.type || item.item_type || t('common.na', 'N/A')}</TableCell>
                                            <TableCell numeric>{formatCurrency(item.price_at_purchase, t)}</TableCell>
                                            <TableCell numeric className="text-success">
                                                {item.discount && item.discount > 0 ? formatCurrency(item.discount, t) : '-'}
                                            </TableCell>
                                            <TableCell actions>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteItemId(item.id)}
                                                    disabled={items.length <= 1 || item.is_deleted}
                                                    title={item.is_deleted ? t('orders.deleted', 'Deleted') : items.length <= 1 ? "Cannot delete the only item" : t('orders.actions.deleteItem')}
                                                    data-testid={`admin-orders-item-delete-${item.id}`}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive hover:scale-110 cursor-pointer" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                        {items.map((item) => {
                            const product = item.products;
                            const { main: mainImage } = buildProductImages(product);

                            return (
                                <div key={item.id} className={`border rounded-md p-4 space-y-3 shadow-sm ${item.is_deleted ? 'opacity-60 border-destructive/30' : ''}`}>
                                    <div className="flex gap-4">
                                        {mainImage && (
                                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border">
                                                <img src={mainImage} className="h-full w-full object-cover" alt="Product thumbnail" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-base truncate" title={product?.title || t('orders.items.unknownProduct', 'Unknown Product')}>
                                                    {product?.title || t('orders.items.unknownProduct', 'Unknown Product')}
                                                </span>
                                                {item.is_deleted && (
                                                    <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0 shrink-0">
                                                        <Trash2 className="h-3 w-3" />
                                                        {t('orders.deleted', 'Deleted')}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted-foreground whitespace-normal break-all">
                                                {product?.serial ? (
                                                    <span className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs">
                                                        <span className="whitespace-nowrap font-semibold text-primary">{t('orders.items.serial', 'Serial number')}: </span>
                                                        <span className="font-mono text-foreground break-all">{product.serial}</span>
                                                    </span>
                                                ) : null}
                                                {product?.serial ? ' • ' : ''}
                                                {product?.type || item.item_type || t('common.na', 'N/A')}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setDeleteItemId(item.id)}
                                            disabled={items.length <= 1 || item.is_deleted}
                                            className="shrink-0 h-8 w-8"
                                            data-testid={`admin-orders-item-delete-mobile-${item.id}`}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-sm bg-muted/30 p-2 rounded-md">
                                        <div>
                                            <span className="text-muted-foreground block text-xs">{t('orders.items.price')}</span>
                                            {formatCurrency(item.price_at_purchase, t)}
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-xs">{t('orders.items.discount')}</span>
                                            <span className="text-success">{item.discount && item.discount > 0 ? formatCurrency(item.discount, t) : '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
