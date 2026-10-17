import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Eye, CheckCircle, RotateCcw, Package, Trash2, FileText, MessageCircle, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Button } from "@/components/ui/button";
import useOrders from '@/hooks/useOrders';

export default function OrderActions({ order, onActionSuccess }) {
    const { t, i18n } = useTranslation('admin');
    // autoFetch off: the parent page owns the list; without this every row
    // would fetch the whole orders list itself on mount.
    const { receiveOrder, confirmOrder, deliverOrder, returnOrder, deleteOrder, actionLoading } = useOrders({ autoFetch: false });

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [noteDialogOpen, setNoteDialogOpen] = useState(false);
    const [isWhatsAppDialogOpen, setIsWhatsAppDialogOpen] = useState(false);
    const [editableWhatsAppMessage, setEditableWhatsAppMessage] = useState('');

    const whatsappPhone = order?.users?.phone?.replaceAll(/\D/g, '');
    const orderSerial = order?.purchase_serial || `#${order?.id ?? '-'}`;
    const whatsappItems = (order?.purchase_items ?? []).map((item, index) => {
        const product = item?.products || {};
        const title = product?.title || '-';
        const type = product?.type || '-';
        const price = item?.price_at_purchase ?? product?.price ?? 0;
        return [
            `- ${t('orders.details.item', 'Item')} ${index + 1}`,
            `  ${t('common.name', 'Name')}: ${title}`,
            `  ${t('orders.items.type', 'Type')}: ${type}`,
            `  ${t('orders.items.price', 'Price')}: ${price} ${t('common.currencyEGP', 'EGP')}`,
        ].join('\n');
    });

    const whatsappMessage = [
        t('orders.actions.whatsappGreeting', 'Greetings {{name}}!', { name: order?.users?.name || '-' }),
        t('orders.actions.whatsappSuccess', 'Your order has been received and is being processed.'),
        '',
        t('orders.actions.whatsappOrderDetails', 'Order Serial: {{serial}}', { serial: orderSerial }),
        '',
        t('orders.actions.whatsappItems', 'Items:'),
        whatsappItems.length ? whatsappItems.join('\n') : '-',
        '',
        t('orders.actions.whatsappTotal', 'Total: {{total}} {{currency}}', { total: order?.total ?? 0, currency: t('common.currencyEGP', 'EGP') }),
        '',
        t('orders.actions.whatsappSupport', 'If you have any questions, feel free to contact us.'),
        t('orders.actions.whatsappClosing', 'Thank you for choosing Kalima Platform!'),
    ].filter(Boolean).join('\n');
    const whatsappHref = whatsappPhone
        ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(editableWhatsAppMessage || whatsappMessage)}`
        : '#';

    const openWhatsAppDialog = (e) => {
        if (e) e.preventDefault();
        setEditableWhatsAppMessage(whatsappMessage);
        setIsWhatsAppDialogOpen(true);
    };

    const handleWhatsAppSend = () => {
        if (whatsappPhone && whatsappHref !== '#') {
            window.open(whatsappHref, '_blank', 'noopener,noreferrer');
            setIsWhatsAppDialogOpen(false);
        }
    };

    const handleAction = async (actionFn) => {
        const res = await actionFn();
        if (res?.success && onActionSuccess) {
            onActionSuccess();
        }
    };

    const handleDelete = async () => {
        const res = await deleteOrder(order.id);
        if (res?.success && onActionSuccess) {
            onActionSuccess();
        }
        setDeleteDialogOpen(false);
    };

    const status = order?.status?.toLowerCase();

    return (
        <div className="flex items-center justify-end gap-1">
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('orders.actions.delete')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('orders.messages.deleteOrderWarning')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                            {t('common.confirm', 'Confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('orders.details.adminNotes', 'Admin Notes')}</DialogTitle>
                    </DialogHeader>
                    <div className="whitespace-pre-wrap text-sm text-foreground bg-muted/50 p-4 rounded-md max-h-[60vh] overflow-y-auto">
                        {order.admin_notes}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isWhatsAppDialogOpen} onOpenChange={setIsWhatsAppDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{t('orders.actions.editWhatsAppMessage', 'Edit WhatsApp Message')}</DialogTitle>
                        <DialogDescription>
                            {t('orders.actions.editWhatsAppMessageDesc', 'Review and edit the message before sending it to the customer.')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            value={editableWhatsAppMessage}
                            onChange={(e) => setEditableWhatsAppMessage(e.target.value)}
                            rows={10}
                            className="font-sans text-sm resize-none"
                            placeholder={t('orders.actions.whatsappPlaceholder', 'Type your message here...')}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsWhatsAppDialogOpen(false)}>
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                            onClick={handleWhatsAppSend}
                            className="bg-success text-success-foreground hover:bg-success/90"
                        >
                            <MessageCircle className="h-4 w-4 me-2" />
                            {t('orders.actions.sendOnWhatsApp', 'Send on WhatsApp')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {order.admin_notes && (
                <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 text-primary hover:text-primary/90 hover:bg-primary/10"
                    onClick={() => setNoteDialogOpen(true)}
                    title={t('orders.actions.viewNote', 'View Note')}
                    data-testid="admin-orders-action-view-note"
                >
                    <span className="sr-only">{t('orders.actions.viewNote', 'View Note')}</span>
                    <FileText className="h-4 w-4" />
                </Button>
            )}

            <DropdownMenu dir={i18n.dir()}>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <Link to={`/admin/orders/${order.id}`} className="cursor-pointer flex items-center" data-testid="admin-orders-action-view-link">
                            <Eye className="mr-2 h-4 w-4" />
                            {t('orders.actions.view')}
                        </Link>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {whatsappPhone && (
                        <DropdownMenuItem
                            onClick={openWhatsAppDialog}
                            className="cursor-pointer flex items-center text-success focus:text-success focus:bg-success/10"
                            data-testid="admin-orders-action-whatsapp-item"
                        >
                            <MessageCircle className="mr-2 h-4 w-4 rtl:mr-0 rtl:ml-2" />
                            {t('orders.actions.whatsapp', 'Contact WhatsApp')}
                        </DropdownMenuItem>
                    )}

                    {status === 'pending' && (
                        <DropdownMenuItem
                            onClick={() => handleAction(() => receiveOrder(order.id))}
                            className="cursor-pointer flex items-center"
                            data-testid="admin-orders-action-receive"
                        >
                            <Package className="mr-2 h-4 w-4" />
                            {t('orders.actions.receive')}
                        </DropdownMenuItem>
                    )}

                    {(status === 'received' || status === 'returned') && (
                        <DropdownMenuItem
                            onClick={() => handleAction(() => confirmOrder(order.id))}
                            className="cursor-pointer flex items-center text-success focus:text-success"
                            data-testid="admin-orders-action-confirm"
                        >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {t('orders.actions.confirm')}
                        </DropdownMenuItem>
                    )}
                    {status === 'confirmed' && (
                        <DropdownMenuItem onClick={() => handleAction(() => deliverOrder(order.id))} disabled={actionLoading}>
                            <Truck className="me-2 h-4 w-4" />
                            {t('orders.actions.deliver', 'Mark delivered')}
                        </DropdownMenuItem>
                    )}

                    {(status === 'received' || status === 'confirmed' || status === 'delivered') && (
                        <DropdownMenuItem
                            onClick={() => handleAction(() => returnOrder(order.id))}
                            className="cursor-pointer flex items-center text-highlight focus:text-highlight"
                            data-testid="admin-orders-action-return"
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t('orders.actions.return')}
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                        onClick={(e) => {
                            e.preventDefault();
                            setDeleteDialogOpen(true);
                        }}
                        className="cursor-pointer flex items-center text-destructive focus:bg-destructive/10 focus:text-destructive"
                        data-testid="admin-orders-action-delete"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('orders.actions.delete')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
