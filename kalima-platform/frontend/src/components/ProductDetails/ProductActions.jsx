import { useState, useRef } from "react";
import { ShoppingCart, Eye, Download, Zap, Clock, ShieldAlert, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { formatPrice, getApiUrl } from "@/lib/storeUtils";
import { useCart } from "@/contexts/CartContext";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useFastBuy } from "@/hooks/useFastBuy";
import useAuth from "@/hooks/auth/useAuth";
import useRole from "@/hooks/useRole";

import { useWhatsAppContact } from "@/lib/whatsappUtils";
import { FaWhatsapp } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";


/**
 * ProductActions
 * Props:
 *   - price: number
 *   - productId: string | number
 *   - sampleId: number | null    (links to /samples/:id)
 *   - sampleSectionId: number | null
 *   - hasSampleDownload: boolean
 *   - title: string
 *   - serial: string
 */
export default function ProductActions({
  price,
  productId,
  sampleId,
  sampleSectionId,
  hasSampleDownload = false,
  title,
  serial,
  isReleased = true,
}) {
  const { t } = useTranslation("product");
  const { isAuthenticated } = useAuth();
  const { isConfirmed, hasAdminAccess, hasStoreAccess } = useRole();
  const location = useLocation();
  const navigate = useNavigate();

  let cartCtx = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    cartCtx = useCart();
  } catch (_) {
    // Not inside CartProvider — safe to ignore
  }

  const addToCart = cartCtx?.addToCart;
  const loading = cartCtx?.loading ?? false;
  const { startFastBuy, loading: fastBuyLoading } = useFastBuy();

  const formattedPrice = formatPrice(price);
  const apiUrl = getApiUrl();
  const samplePath = sampleId ? `/samples/${sampleId}` : null;
  const sampleDownloadUrl =
    sampleId && sampleSectionId && hasSampleDownload
      ? `${apiUrl}/sample-sections/${sampleSectionId}/samples/${sampleId}/download`
      : null;
  const hasSampleActions = Boolean(samplePath || sampleDownloadUrl);

  // Draggable Sheet State
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sheetRef = useRef(null);

  // Blocking logic: must have store access AND be confirmed if authenticated
  const isPurchaseBlocked = !hasStoreAccess || (isAuthenticated && !isConfirmed);

  const handleAddToCart = () => {
    if (!isReleased || isPurchaseBlocked) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location }, replace: true });
      return;
    }
    if (addToCart) addToCart(productId);
  };

  const handleBuyNow = () => {
    if (!isReleased || isPurchaseBlocked) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location }, replace: true });
      return;
    }
    startFastBuy(productId, 1);
  };

  const { handleWhatsAppContact } = useWhatsAppContact();

  const handleWhatsApp = () => {
    handleWhatsAppContact('product', {
      title,
      serial,
      price: formatPrice(price),
      url: window.location.href
    });
  };

  return (
    <div className="flex flex-col gap-4 mt-2">
      {/* Pending Review Banner */}
      {isPurchaseBlocked && (
        <div
          className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
          data-testid="product-actions-pending-review-banner"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed">
            {t("actions.pendingReview", "Your account is pending admin review. You can browse freely but cannot make purchases until your account is approved.")}
          </p>
        </div>
      )}

      {/* Mobile Sticky Bar - Draggable Bottom Sheet */}
      <AnimatePresence>
        <motion.div
          id="product-actions-mobile-sheet"
          ref={sheetRef}
          drag="y"
          dragConstraints={{ top: 0, bottom: 260 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => {
            // If dragging down fast or past 100px, collapse it
            if (info.offset.y > 100 || info.velocity.y > 50) {
              setIsCollapsed(true);
            } else if (info.offset.y < -50 || info.velocity.y < -50) {
              setIsCollapsed(false);
            }
          }}
          initial={{ y: 300 }}
          animate={isCollapsed ? { y: 260 } : { y: 0 }}
          exit={{ y: 300 }}
          transition={{
            type: "spring",
            damping: 30,
            stiffness: 300,
            duration: 0.6
          }}
          style={{ touchAction: "none" }} // Prevents browser pull-to-refresh
          className={cn(
            "fixed bottom-0 left-0 right-0 z-40 md:hidden",
            "flex flex-col bg-background/80 backdrop-blur-3xl border-t border-border/40 shadow-[0_-15px_40px_rgba(0,0,0,0.1)] rounded-t-[2.5rem] pb-safe",
            "select-none cursor-default active:cursor-grabbing"
          )}
        >
          {/* Visual Handle Area */}
          <div
            className="flex flex-col items-center py-4 w-full cursor-grab active:cursor-grabbing group"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <div className="h-1.5 w-14 rounded-full bg-border/60 group-hover:bg-border/80 transition-colors mb-2" />

            {/* Contextual Label if collapsed */}
            {isCollapsed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 mb-2"
              >
                <ChevronUp className="h-4 w-4 text-primary animate-bounce" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {t("actions.viewOptions", "View Options")}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-1">
                  {formattedPrice}{t("info.currency")}
                </span>
              </motion.div>
            )}
            {!isCollapsed && (
              <div className="h-4" /> // Spacer to match collapsed height
            )}
          </div>

          {/* Main Actions Container */}
          <div className="px-6 pb-6 pt-2 space-y-6 overflow-hidden">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/60 leading-none mb-1.5 px-0.5">
                  {t("info.totalPrice")}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-foreground tracking-tight">
                    {formattedPrice}
                  </span>
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    {t("info.currency")}
                  </span>
                </div>
              </div>

              {!isReleased && (
                <div className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-amber-500/20">
                  <Clock className="h-3 w-3" />
                  {t("badges.comingSoon", "Coming Soon")}
                </div>
              )}
            </div>

            {!hasAdminAccess && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  className="h-14 rounded-2xl gap-1.5 font-bold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95 px-2"
                  disabled={loading || !isReleased || isPurchaseBlocked}
                  onClick={handleAddToCart}
                  data-testid="product-actions-mobile-add-cart-button"
                >
                  {loading ? (
                    <LoadingSpinner className="h-5 w-5 border-white" />
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 shrink-0" />
                      <span className="text-[12px] leading-none tracking-tight">{t("actions.addToCart")}</span>
                    </>
                  )}
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  className="h-14 rounded-2xl gap-1.5 font-bold bg-secondary/80 backdrop-blur-md border border-border/40 transition-all active:scale-95 shadow-lg shadow-black/5 px-2"
                  onClick={handleBuyNow}
                  disabled={fastBuyLoading || !isReleased || isPurchaseBlocked}
                  data-testid="product-actions-mobile-buy-now-button"
                >
                  {fastBuyLoading ? (
                    <LoadingSpinner className="h-5 w-5" />
                  ) : (
                    <>
                      <Zap className="h-4 w-4 shrink-0 fill-current" />
                      <span className="text-[12px] leading-none tracking-tight">{t("actions.buyNow")}</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {samplePath && (
                <Button
                  variant="ghost"
                  className="h-12 rounded-xl border border-border/40 bg-muted/30 hover:bg-muted/50 gap-1.5 transition-all active:scale-95 px-2"
                  size="sm"
                  asChild
                  data-testid="product-actions-mobile-view-sample-button"
                >
                  <Link to={samplePath} state={{ cameFromAdmin: false }}>
                    <Eye className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider truncate">{t("actions.viewSample")}</span>
                  </Link>
                </Button>
              )}

              {sampleDownloadUrl && (
                <Button
                  variant="ghost"
                  className="h-12 rounded-xl border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 gap-1.5 transition-all active:scale-95 px-2"
                  size="sm"
                  asChild
                  data-testid="product-actions-mobile-download-sample-button"
                >
                  <a href={sampleDownloadUrl} download>
                    <Download className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider truncate">{t("actions.downloadSample", "Download")}</span>
                  </a>
                </Button>
              )}

              <Button
                variant="ghost"
                className={cn(
                  "h-12 rounded-xl border border-success/20 bg-success/5 text-success hover:bg-success/10 gap-1.5 transition-all active:scale-95 px-2",
                  !hasSampleActions && "col-span-2",
                  samplePath && sampleDownloadUrl && "col-span-2"
                )}
                size="sm"
                onClick={handleWhatsApp}
              >
                <FaWhatsapp className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider truncate">
                  <span className="hidden min-[420px]:inline">
                    {t("actions.contactWhatsAppLong", "Message Admin on WhatsApp")}
                  </span>
                  <span className="min-[420px]:hidden">
                    {t("actions.contactWhatsAppShort", "Message")}
                  </span>
                </span>
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Desktop Layout */}
      <div className="hidden md:flex flex-col gap-4">
        {!hasAdminAccess && (
          <>
            <div className="flex gap-4">
              {/* Add to Cart */}
              <Button className="gap-2 flex-1" size="lg" onClick={handleAddToCart} disabled={loading || !isReleased || isPurchaseBlocked || !hasStoreAccess} data-testid="product-actions-desktop-add-cart-button">
                {loading ? (
                  <LoadingSpinner className="h-5 w-5 border-white" />
                ) : !isReleased ? (
                  <>
                    <Clock className="h-5 w-5" />
                    {t("badges.comingSoon", "Coming Soon")}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5" />
                    {t("actions.addToCart")}
                  </>
                )}
              </Button>
            </div>

            {/* Buy Now */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="text-sm flex-1"
                size="lg"
                onClick={handleBuyNow}
                disabled={fastBuyLoading || !isReleased || isPurchaseBlocked || !hasStoreAccess}
                data-testid="product-actions-desktop-buy-now-button"
              >
                {fastBuyLoading ? (
                  <LoadingSpinner className="h-5 w-5" />
                ) : !isReleased ? (
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t("badges.comingSoon", "Coming Soon")}
                  </span>
                ) : (
                  t("actions.buyNow")
                )}
              </Button>
            </div>
          </>
        )}

        {/* View Sample (Keep separate so it stays if buttons are hidden) */}
        {hasSampleActions && hasAdminAccess && (
          <div className="flex gap-3">
            {samplePath && (
              <Button
                variant="outline"
                className="text-sm flex-1"
                size="lg"
                asChild
                data-testid="product-actions-desktop-view-sample-button"
              >
                <Link to={samplePath} state={{ cameFromAdmin: false }}>
                  {t("actions.viewSample")}
                </Link>
              </Button>
            )}
            {sampleDownloadUrl && (
              <Button
                variant="outline"
                className="text-sm flex-1"
                size="lg"
                asChild
                data-testid="product-actions-desktop-download-sample-button"
              >
                <a href={sampleDownloadUrl} download>
                  {t("actions.downloadSample", "Download Sample")}
                </a>
              </Button>
            )}
          </div>
        )}

        {/* Desktop Sample Button (Inside flex if not admin) */}
        {hasSampleActions && !hasAdminAccess && (
          <div className="flex gap-3 -mt-1">
            {samplePath && (
              <Button
                variant="outline"
                className="text-sm flex-1"
                size="lg"
                asChild
                data-testid="product-actions-desktop-view-sample-button"
              >
                <Link to={samplePath} state={{ cameFromAdmin: false }}>
                  {t("actions.viewSample")}
                </Link>
              </Button>
            )}
            {sampleDownloadUrl && (
              <Button
                variant="outline"
                className="text-sm flex-1"
                size="lg"
                asChild
                data-testid="product-actions-desktop-download-sample-button"
              >
                <a href={sampleDownloadUrl} download>
                  {t("actions.downloadSample", "Download Sample")}
                </a>
              </Button>
            )}
          </div>
        )}
        <Button
          variant="outline"
          className="text-sm border-success/30 text-success hover:bg-success/5 gap-2 h-11"
          size="lg"
          onClick={handleWhatsApp}
        >
          <FaWhatsapp className="h-4 w-4" />
          {t("actions.contactWhatsAppLong", "Message Admin on WhatsApp")}
        </Button>
      </div >
    </div >
  );
}
