import { useTranslation } from "react-i18next";
import { MessageCircle, X } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getImageUrl } from "@/lib/storeUtils";
import { buildWhatsAppLink } from "@/lib/whatsappUtils";

const ORDER_TRACKING_WHATSAPP_NUMBER = "201044067113";

// onClose is optional: without it the receipt stays up until the user continues
// on WhatsApp (fast-buy flow). With it, an X lets the buyer dismiss the receipt.
export default function PurchaseTrackingDialog({ purchase, paymentMethodName = "", onClose }) {
  const { t } = useTranslation("checkout");
  const trackingMessage = purchase
    ? `مرحباً، رقم طلبي المميز هو ${purchase.purchase_serial || `#${purchase.id}`} وأرغب في معرفة حالة الطلب`
    : "";
  const trackingLink = buildWhatsAppLink(ORDER_TRACKING_WHATSAPP_NUMBER, trackingMessage);

  return (
    <AlertDialog open={Boolean(purchase)}>
      <AlertDialogContent
        className="max-w-xl p-6 print:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("receipt.close", "Close")}
            className="absolute end-3 top-3 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="checkout-payment-step-receipt-close-button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold text-center">
            {t("receipt.title", "Purchase Receipt")}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-4 text-sm font-mono">
          {purchase && (
            <>
              <div className="space-y-1">
                <p>{t("receipt.serial", "Serial")}: {purchase.purchase_serial}</p>
                <p>{t("receipt.status", "Status")}: {t(`receipt.statuses.${purchase.status}`, purchase.status)}</p>
                <p>{t("receipt.subtotal", "Subtotal")}: {purchase.subtotal} {t("cart:L.E")}</p>
                <p>{t("receipt.discount", "Discount")}: {purchase.discount} {t("cart:L.E")}</p>
                <p>{t("receipt.total", "Total")}: {purchase.total} {t("cart:L.E")}</p>
                <p>{t("receipt.items", "Items")}: {purchase.purchase_items?.length || 0}</p>
                {paymentMethodName && (
                  <p>{t("receipt.paymentMethod", "Payment Method")}: {paymentMethodName}</p>
                )}
              </div>
              <div className="mt-4 border-t pt-2 space-y-2">
                {(purchase.purchase_items || []).map((item, index) => (
                  <div key={item.products?.id ?? index} className="flex items-center gap-2">
                    <img
                      src={getImageUrl(item.products?.thumbnail_image?.url) || ""}
                      alt={item.products?.title || ""}
                      className="w-8 h-8 object-cover rounded"
                    />
                    <div className="flex-1">
                      <p>{item.products?.title}</p>
                      <p className="text-xs text-muted-foreground">{item.products?.type}</p>
                    </div>
                    <div>{item.price_at_purchase} {t("cart:L.E")}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <AlertDialogFooter className="flex-col sm:flex-col gap-3">
          <p className="text-center text-sm font-medium text-muted-foreground">
            {t("receipt.trackOrderRequired")}
          </p>
          <Button
            asChild
            size="lg"
            className="w-full bg-success text-success-foreground hover:bg-success/90"
            data-testid="checkout-payment-step-receipt-track-order-button"
          >
            <a href={trackingLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-5 w-5" />
              {t("receipt.trackOrder", "Track your order")}
            </a>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
