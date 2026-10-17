import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Upload,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PhoneInput, egyptPhoneSchema } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { getImageUrl } from "@/lib/storeUtils";
import { cn } from "@/lib/utils";
import { checkImageFile } from "@/lib/imageFile";

export default function FastBuyPaymentDetailsCard({
  state,
  updateField,
  needsTransferNumber,
  needsScreenshot,
  isFreeOrder = false,
  screenshotName,
  paymentMethods,
}) {
  const { t, i18n } = useTranslation("checkout");
  const [transferTouched, setTransferTouched] = useState(false);

  const transferNumberError = useMemo(() => {
    if (!needsTransferNumber) return "";
    if (!state.numberTransferredFrom || state.numberTransferredFrom === "+20") {
      return t("validation.required", "Required");
    }
    const parsed = egyptPhoneSchema(t).safeParse(state.numberTransferredFrom);
    if (parsed.success) return "";
    return parsed.error.issues?.[0]?.message?.toString() || "";
  }, [needsTransferNumber, state.numberTransferredFrom]);

  return (
    <Card className="border border-border/40 bg-card/60 backdrop-blur-md shadow-sm rounded-3xl overflow-hidden">
      <CardHeader className="border-b border-border/10 pb-6 bg-muted/20">
        <CardTitle className="flex items-center gap-3 text-xl font-bold">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <CreditCard className="w-5 h-5" />
          </div>
          {t("payment.title", "Payment Details")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8 pt-8 px-6 pb-8">
        {isFreeOrder ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8 text-center space-y-6"
          >
            <div className="relative">
              <div className="absolute bg-primary/20 blur-2xl rounded-full scale-150" />
              <div className="relative p-6 rounded-3xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                <ShieldCheck
                  className={`w-16 h-16 ${i18n.dir() === "rtl" ? "scale-x-[-1]" : ""}`}
                  strokeWidth={1.5}
                />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-black tracking-tight">
                {t("payment.freeOrderNotice", "Free Order Notice")}
              </h3>
            </div>
          </motion.div>
        ) : (
          <>
            {paymentMethods?.length > 0 && (
              <div className="space-y-4" data-testid="fastbuy-payment-methods-section">
                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {t("payment.method", "Select Payment Method")}
                  <span className="text-destructive ms-1">*</span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {paymentMethods.map((method) => {
                    const isSelected = state.paymentMethodId === method.id;
                    return (
                      <motion.div
                        key={method.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => updateField("paymentMethodId", method.id)}
                        className={cn(
                          "relative flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-md shadow-primary/5"
                            : "border-border/40 hover:border-primary/30 hover:bg-muted/30"
                        )}
                        data-testid={`fastbuy-payment-method-${method.id}`}
                      >
                        <div className="relative">
                          {method.image_url ? (
                            <img
                              src={getImageUrl(method.image_url)}
                              alt={method.name}
                              className="w-12 h-12 rounded-xl object-contain p-2 bg-white border border-border/50 shadow-xs"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                              <CreditCard className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-0.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
                              <CheckCircle2 className={`w-3.5 h-3.5 ${i18n.dir() === "rtl" ? "scale-x-[-1]" : ""}`} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-foreground truncate text-start">
                            {method.name}
                          </h4>
                          {method.phone_number && (
                            <p className="text-xs font-medium text-muted-foreground/80 mt-0.5 text-start">
                              {method.phone_number}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {(needsTransferNumber || needsScreenshot) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 pt-6 border-t border-border/10"
                >
                  {needsTransferNumber && (
                    <div className="space-y-4" data-testid="fastbuy-payment-transfer-section">
                      <Label
                        htmlFor="transferNumber"
                        className="text-sm font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {t("payment.transferNumber", "Transfer Number")}
                        <span className="text-destructive ms-1">*</span>
                      </Label>
                      <PhoneInput
                        id="transferNumber"
                        dir="ltr"
                        value={state.numberTransferredFrom}
                        onChange={(e) => {
                          setTransferTouched(true);
                          updateField("numberTransferredFrom", e.target.value)
                        }}
                        onBlur={() => setTransferTouched(true)}
                        placeholder={t(
                          "payment.transferNumberPlaceholder",
                          "Enter transfer number",
                        )}
                        className="h-12 bg-background/50 backdrop-blur-xs rounded-xl focus-visible:ring-primary/20"
                        data-testid="fastbuy-payment-transfer-number"
                      />
                      {transferTouched && transferNumberError && (
                        <p className="text-destructive text-xs mt-1 font-bold">
                          {transferNumberError}
                        </p>
                      )}
                    </div>
                  )}

                  {needsScreenshot && (
                    <div className="space-y-4" data-testid="fastbuy-payment-screenshot-section">
                      <Label
                        htmlFor="screenshot"
                        className="text-sm font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {t("payment.screenshot", "Payment Screenshot")}
                        <span className="text-destructive ms-1">*</span>
                      </Label>

                      <motion.div
                        whileHover={{ scale: 1.005 }}
                        whileTap={{ scale: 0.995 }}
                        className="border-2 border-dashed border-primary/20 hover:border-primary/40 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer bg-primary/5 hover:bg-primary/10 transition-all group"
                        onClick={() => document.getElementById("screenshot").click()}
                        data-testid="fastbuy-payment-upload-button"
                      >
                        <div className="h-12 w-12 rounded-full bg-primary/20 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-foreground">
                            {screenshotName
                              ? screenshotName
                              : t("payment.upload", "Click to upload receipt")}
                          </p>
                          <p className="text-xs font-medium text-muted-foreground mt-1.5 opacity-80">
                            {t("payment.upload_hint", "PNG, JPG up to 5MB")}
                          </p>
                        </div>
                      </motion.div>

                      <input
                        id="screenshot"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (file && !checkImageFile(file)) {
                            e.target.value = "";
                            return;
                          }
                          updateField("paymentScreenshot", file);
                        }}
                        className="hidden"
                        data-testid="fastbuy-payment-file-input"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </CardContent>
    </Card>
  );
}
