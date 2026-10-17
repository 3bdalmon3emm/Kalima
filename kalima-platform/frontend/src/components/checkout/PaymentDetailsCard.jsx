import { useTranslation } from "react-i18next";
import { CreditCard, Upload } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkImageFile } from "@/lib/imageFile";

export default function PaymentDetailsCard({
  state,
  updateField,
  needsTransferNumber,
  needsScreenshot,
  screenshotName,
}) {
  const { t } = useTranslation("checkout");

  return (
    <Card className="border-muted shadow-sm overflow-hidden">
      <CardHeader className=" border-b border-muted pb-4">
        <CardTitle className="flex items-center gap-2 text-xl">
          <CreditCard className="w-5 h-5 text-primary" />
          {t("payment.title", "Payment Details")}
        </CardTitle>
        <CardDescription className="text-sm">
          {t("payment.secure_notice", "Your payment information is secure")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 animate-in fade-in duration-500">
        {needsTransferNumber && (
          <div className="space-y-3">
            <Label
              htmlFor="transferNumber"
              className="font-semibold text-foreground/80"
            >
              {t("payment.transfer_number", "Transfer Number")}
            </Label>
            <Input
              id="transferNumber"
              value={state.numberTransferredFrom}
              onChange={(e) =>
                updateField("numberTransferredFrom", e.target.value)
              }
              placeholder={t(
                "payment.transfer_number_placeholder",
                "Enter transfer number",
              )}
              className="h-12 bg-background focus-visible:ring-primary/20"
              data-testid="checkout-payment-transfer-number"
            />
          </div>
        )}

        {needsScreenshot && (
          <div className="space-y-3">
            <Label
              htmlFor="screenshot"
              className="font-semibold text-foreground/80"
            >
              {t("payment.screenshot", "Payment Screenshot")}
            </Label>

            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 flex flex-col items-center justify-center gap-4 "
              onClick={() => document.getElementById("screenshot").click()}
              data-testid="checkout-payment-upload-button"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {screenshotName
                    ? screenshotName
                    : t("payment.upload", "Click to upload receipt")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("payment.upload_hint", "PNG, JPG up to 5MB")}
                </p>
              </div>
            </div>

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
              data-testid="checkout-payment-file-input"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
